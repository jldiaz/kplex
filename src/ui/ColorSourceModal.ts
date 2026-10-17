/**
 * Shared native color-source shell for settings, lenses and React canvas entry points. One local
 * source editor and two isolated usage previews share the existing durable style-operation policy.
 * Opening, Cancel, theme changes and picker streams never write settings or touch vault data.
 */
import {NATIVE_CANVAS_FILL, NATIVE_LINK_STROKE, NATIVE_LINK_TEXT, nodeColorFallback} from "../index/style";
import {COMPASS_COLOR_VARIABLES, COMPASS_SEMANTIC_SLOTS} from "../core/plex/colorPreferences";
import {semanticColorCss} from "../adapters/obsidian/colorPresentation";
import {ColorScope} from "../adapters/obsidian/colorScope";
import {Setting, SuggestModal, type App, type ButtonComponent} from "obsidian";
import {StyleEditorModal, type StyleCommitResult} from "./StyleEditorModal";
import {ColorSourceEditor} from "./ColorSourceEditor";
import {ColorPreview, type ColorPreviewOptions} from "./ColorPreview";
import {collectionWindow} from "./components/collectionWindow";
import {ColorSampleReader} from "../adapters/obsidian/colorSample";
import {colorValueCss} from "../adapters/obsidian/colorPresentation";
import {colorValuesEqual, formatLiteralColor, parseLiteralColor, type ColorValue} from "../core/contracts/colorValue";
import type {SemanticColorPair} from "../core/plex/colorPreferences";

export type ColorSourceModalOptions = ColorPreviewOptions & Readonly<{
  confirmation?: Readonly<{description: string; actionLabel: string}>;
  actionLabel?: string; help?: string;
  acceptSource?: (source: ColorValue | undefined) => boolean;
  title: string; initial: ColorValue | undefined;
  subscribeCss?: (changed: () => void) => () => void;
  subscribeColors?: (changed: () => void) => () => void;
  onSave: (source: ColorValue | undefined, isCurrent: () => boolean) => Promise<StyleCommitResult>;
  onClosed?: () => void;
}>;

/** Bounded native search covers every configured pair without mounting a large option collection. */
class NamedColorSuggest extends SuggestModal<SemanticColorPair> {
  private ambiguousNames = new Set<string>();
  /** Search current preferences at each query; names are labels and stable IDs remain source identity. */
  constructor(app: App, private readonly pairs: () => readonly SemanticColorPair[], private readonly chosen: (pair: SemanticColorPair) => void) { super(app); this.limit = 40; }
  /** Search configured metadata only; no graph or note access belongs to a color chooser. */
  getSuggestions(query: string): SemanticColorPair[] {
    const text = query.trim().toLocaleLowerCase();
    const pairs = this.pairs(), names = new Set<string>(); this.ambiguousNames.clear();
    for (const pair of pairs) {if (names.has(pair.name)) this.ambiguousNames.add(pair.name); else names.add(pair.name);}
    return [...collectionWindow(pairs.filter(pair => pair.name.toLocaleLowerCase().includes(text)), 40, 40).visible];
  }
  /** Render names as text so labels never become selectors, HTML or persisted IDs. */
  renderSuggestion(pair: SemanticColorPair, element: HTMLElement): void {
    element.setText(pair.name); if (this.ambiguousNames.has(pair.name)) element.createDiv({text: pair.id, cls: "suggestion-note"});
  }
  /** The owning source form fences callbacks after pending submission or retirement. */
  onChooseSuggestion(pair: SemanticColorPair): void { this.chosen(pair); }
}

/** Explicit Save/Cancel shell with one live draft and lifetime-owned native/preview resources. */
export class ColorSourceModal extends StyleEditorModal {
  private editor: ColorSourceEditor | null = null;
  private preview: ColorPreview | null = null;
  private reader: ColorSampleReader | null = null;
  private save: ButtonComponent | null = null;
  private releaseCss: (() => void) | null = null;
  private opened = false;
  private releaseColors: (() => void) | null = null;

  /** Capture narrow data/actions; callers retain the sole settings queue and originating-view lifetime. */
  constructor(app: App, private readonly options: ColorSourceModalOptions) { super(app); }

  /** Render detached source controls and real-use paired previews without persisting their sampled RGB. */
  onOpen(): void {
    this.opened = true; this.modalEl.addClass("kplex-color-modal"); this.titleEl.setText(this.options.title); this.beginEditor(this.options.sourceScope, this.options.bindEditor);
    const t = this.options.translate;
    if (this.options.confirmation) this.contentEl.createDiv({text: this.options.confirmation.description, cls: "setting-item-description"});
    if (this.options.help) this.contentEl.createDiv({text: this.options.help, cls: "setting-item-description"});
    const controls = this.contentEl.createDiv();
    this.preview = new ColorPreview(this.contentEl, {...this.options, onContextChange: () => this.editor?.refresh(true)}, this.options.initial);
    this.reader = new ColorSampleReader(this.options.sourceScope.ownerDocument);
    this.editor = new ColorSourceEditor(controls, {
      initial: this.options.initial, sourceScope: this.options.sourceScope, translate: t, preferences: this.options.preferences,
      themeTokens: ["--text-normal", "--text-muted", "--text-faint", "--text-accent", "--text-accent-hover", "--text-on-accent", "--text-error", "--text-warning", "--text-success", "--text-selection", "--text-highlight-bg",
        "--interactive-normal", "--interactive-hover", "--interactive-accent", "--interactive-accent-hover",
        "--background-primary", "--background-primary-alt", "--background-secondary", "--background-secondary-alt", "--background-modifier-border", "--background-modifier-border-hover", "--background-modifier-border-focus", "--background-modifier-hover", "--background-modifier-error", "--background-modifier-success",
        "--color-red", "--color-orange", "--color-yellow", "--color-green", "--color-cyan", "--color-blue", "--color-purple", "--color-pink",
        "--h1-color", "--h2-color", "--h3-color", "--h4-color", "--h5-color", "--h6-color", "--bold-color", "--italic-color", "--link-color", "--link-color-hover", "--link-external-color", "--tag-color", "--tag-background", "--tag-color-hover", "--tag-background-hover",
        "--checkbox-color", "--checkbox-color-hover", "--checkbox-border-color", "--checklist-done-color", "--table-border-color", "--table-header-background", "--table-row-background-hover", "--code-normal", "--code-background", "--code-comment", "--code-function", "--code-keyword", "--code-string", "--code-tag", "--code-value", "--graph-line", "--graph-node", "--graph-node-tag", "--graph-node-attachment", "--graph-node-unresolved", "--graph-node-focused", "--graph-node-highlight", "--graph-line-highlight",
        "--kplex-semantic-origin", "--kplex-semantic-development", "--kplex-semantic-support", "--kplex-semantic-challenge"].map(variable => ({variable, label: variable})),
      chooseNamed: chosen => { const chooser = new NamedColorSuggest(this.app, () => this.options.preferences().palette, chosen); chooser.setPlaceholder(t("colors.searchColors")); chooser.open(); return () => chooser.close(); },
      fixedSeed: source => {
        source ??= this.options.inherit?.();
        if (typeof source === "string" && parseLiteralColor(source)) return source;
        if (source && typeof source !== "string" && source.kind === "palette") {
          const pair = this.options.preferences().palette.find(pair => pair.id === source.id);
          if (pair) return pair[this.options.sourceScope.ownerDocument.body.classList.contains("theme-light") ? "light" : "dark"];
        }
        const target = this.options.target;
        const fallback = target.kind === "compass" ? colorValueCss({kind: "theme", variable: COMPASS_COLOR_VARIABLES[target.direction ?? "north"]}, semanticColorCss(COMPASS_SEMANTIC_SLOTS[target.direction ?? "north"])) : target.kind === "canvas" ? NATIVE_CANVAS_FILL : target.kind === "node" ? nodeColorFallback(target.field, this.options.fallbacks)
          : target.field === "textColor" ? NATIVE_LINK_TEXT : NATIVE_LINK_STROKE;
        const scope = this.options.sourceScope.createDiv();
        scope.setCssStyles({position: "fixed", left: "-100000px", visibility: "hidden", pointerEvents: "none"});
        const binding = new ColorScope(scope, {preferences: this.options.preferences(), references: [...(source === undefined || source === null ? [] : [source]), ...(target.kind === "compass" ? [{kind: "theme" as const, variable: COMPASS_COLOR_VARIABLES[target.direction ?? "north"]}] : [])]}, {observe: false});
        try {
          const literal = this.reader?.read(scope, colorValueCss(source, fallback));
          return literal ? formatLiteralColor(literal) : "#808080";
        } finally { binding.dispose(); scope.remove(); }
      },
      onPreview: (source, finished) => this.preview?.update(source, finished),
      onChange: () => this.refreshSave(),
    });
    new Setting(this.contentEl)
      .addButton(button => button.setButtonText(t("common.cancel")).onClick(() => this.close()))
      .addButton(button => { this.save = button; button.setButtonText(this.options.confirmation?.actionLabel ?? this.options.actionLabel ?? t("common.save")).setCta().onClick(() => this.submit()); });
    this.releaseCss = this.options.subscribeCss?.(() => { this.editor?.refresh(true); this.preview?.invalidate(); }) ?? null;
    this.releaseColors = this.options.subscribeColors?.(() => {this.editor?.refresh(false); this.preview?.refreshSources();}) ?? null;
    this.refreshSave();
  }

  /** Storage rejection leaves the exact draft and recomputes Save validity instead of silently normalizing it. */
  protected onOperationRejected(): void { this.editor?.setDisabled(false); this.editor?.refresh(false); this.refreshSave(); }

  /** Release exact resources once, including externally retired or already-submitted forms. */
  onClose(): void {
    super.onClose(); if (!this.opened) return; this.opened = false;
    this.releaseColors?.(); this.releaseColors = null;
    this.releaseCss?.(); this.releaseCss = null; this.editor?.dispose(); this.editor = null;
    this.preview?.dispose(); this.preview = null; this.reader?.dispose(); this.reader = null; this.save = null;
    this.contentEl.empty(); this.options.onClosed?.();
  }

  /** Native shell state is authoritative; late CSS callbacks cannot re-enable a pending Save. */
  private refreshSave(): void { this.save?.setDisabled(!this.canEdit() || !this.editor?.isValid() || this.options.acceptSource?.(this.editor?.getValue()) === false); }

  /** An unchanged source closes without a write, preventing resurrection after concurrent replacement. */
  private submit(): void {
    if (!this.canEdit() || !this.editor) return;
    this.editor.refresh(true); if (!this.editor.isValid()) return;
    const source = this.editor.getValue();
    if (this.options.acceptSource?.(source) === false) return;
    if (!this.options.confirmation && colorValuesEqual(source, this.options.initial)) { this.close(); return; }
    const captured = source === undefined ? undefined : structuredClone(source);
    this.editor.setDisabled(true);
    this.runOperation(isCurrent => this.options.onSave(captured, isCurrent));
  }
}
