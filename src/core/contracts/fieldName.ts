/** Canonical property-key normalization shared by parser, collectors and graph semantics. */
export const normalizeFieldName = (name: string): string => name.toLowerCase().replace(/\s+/g, "-").trim();

/**
 * Structured representation of a configured ontology hierarchy entry,
 * preserving raw spelling alongside canonical forward and optional inverse forms.
 */
export type HierarchyFieldMapping = Readonly<{
  raw: string;
  forward: string;
  normalizedForward: string;
  inverse?: string;
  normalizedInverse?: string;
}>;

/**
 * Parse an ontology hierarchy field entry that may define forward/inverse names via slash syntax (e.g. "replies to/replied by").
 * When a single slash separates two non-empty tokens, both forward and inverse fields are parsed and normalized.
 * Otherwise, the entry is treated as a standard single-direction field.
 *
 * @param entry The configured field string from hierarchy settings.
 * @returns The parsed mapping with forward and optional inverse fields.
 */
export function parseHierarchyFieldMapping(entry: string): HierarchyFieldMapping {
  const trimmed = entry.trim();
  if (trimmed.includes("/")) {
    const parts = trimmed.split("/").map((part) => part.trim()).filter(Boolean);
    if (parts.length === 2) {
      return {
        raw: trimmed,
        forward: parts[0],
        normalizedForward: normalizeFieldName(parts[0]),
        inverse: parts[1],
        normalizedInverse: normalizeFieldName(parts[1]),
      };
    }
  }
  return {
    raw: trimmed,
    forward: trimmed,
    normalizedForward: normalizeFieldName(trimmed),
  };
}

