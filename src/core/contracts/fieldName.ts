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
 * Escaped slashes (e.g. "a\/b") or multiple/consecutive slashes (e.g. "a//b", "a/b/c") are treated as literal single entries.
 *
 * @param entry The configured field string from hierarchy settings.
 * @returns The parsed mapping with forward and optional inverse fields.
 */
export function parseHierarchyFieldMapping(entry: string): HierarchyFieldMapping {
  const trimmed = entry.trim();
  if (trimmed.includes("\\/")) {
    const unescaped = trimmed.replace(/\\\//g, "/");
    return {
      raw: trimmed,
      forward: unescaped,
      normalizedForward: normalizeFieldName(unescaped),
    };
  }
  if (trimmed.includes("//") || !trimmed.includes("/")) {
    return {
      raw: trimmed,
      forward: trimmed,
      normalizedForward: normalizeFieldName(trimmed),
    };
  }
  const parts = trimmed.split("/");
  if (parts.length === 2 && parts[0].trim().length > 0 && parts[1].trim().length > 0) {
    const forward = parts[0].trim();
    const inverse = parts[1].trim();
    return {
      raw: trimmed,
      forward,
      normalizedForward: normalizeFieldName(forward),
      inverse,
      normalizedInverse: normalizeFieldName(inverse),
    };
  }
  return {
    raw: trimmed,
    forward: trimmed,
    normalizedForward: normalizeFieldName(trimmed),
  };
}

export type HierarchyRole = "parent" | "child" | "left" | "right" | "previous" | "next";

export type RoleHierarchyData = {
  parents: string[];
  children: string[];
  leftFriends: string[];
  rightFriends: string[];
  previous: string[];
  next: string[];
};

/**
 * Return all valid field names for a specific hierarchy role, unpacking forward and reciprocal
 * inverse terms declared in opposite or symmetric roles.
 *
 * @param hierarchy The hierarchy collections.
 * @param role The target relationship role.
 * @returns Array of unique field names appropriate for this role.
 */
export function ontologyFieldsForHierarchyRole(hierarchy: RoleHierarchyData, role: HierarchyRole): string[] {
  const directList = role === "parent" ? hierarchy.parents
    : role === "child" ? hierarchy.children
    : role === "left" ? hierarchy.leftFriends
    : role === "right" ? hierarchy.rightFriends
    : role === "previous" ? hierarchy.previous : hierarchy.next;

  const oppositeRole = role === "parent" ? "child"
    : role === "child" ? "parent"
    : role === "previous" ? "next"
    : role === "next" ? "previous"
    : role;

  const oppositeList = oppositeRole === "parent" ? hierarchy.parents
    : oppositeRole === "child" ? hierarchy.children
    : oppositeRole === "left" ? hierarchy.leftFriends
    : oppositeRole === "right" ? hierarchy.rightFriends
    : oppositeRole === "previous" ? hierarchy.previous : hierarchy.next;

  const result: string[] = [];
  const seen = new Set<string>();

  for (const entry of directList ?? []) {
    const mapping = parseHierarchyFieldMapping(entry);
    if (!seen.has(mapping.normalizedForward)) {
      seen.add(mapping.normalizedForward);
      result.push(mapping.forward);
    }
  }
  if (oppositeRole !== role) {
    for (const entry of oppositeList ?? []) {
      const mapping = parseHierarchyFieldMapping(entry);
      if (mapping.inverse && mapping.normalizedInverse && !seen.has(mapping.normalizedInverse)) {
        seen.add(mapping.normalizedInverse);
        result.push(mapping.inverse);
      }
    }
  } else {
    for (const entry of directList ?? []) {
      const mapping = parseHierarchyFieldMapping(entry);
      if (mapping.inverse && mapping.normalizedInverse && !seen.has(mapping.normalizedInverse)) {
        seen.add(mapping.normalizedInverse);
        result.push(mapping.inverse);
      }
    }
  }
  return result;
}

export type OntologyFieldRole = "parent" | "child" | "left" | "right" | "previous" | "next" | "hidden" | "excluded";

export type MutableHierarchyData = {
  hidden: string[];
  parents: string[];
  children: string[];
  leftFriends: string[];
  rightFriends: string[];
  previous: string[];
  next: string[];
  exclusions?: string[];
};

function normalizeTargetRole(role: string): OntologyFieldRole {
  switch (role) {
    case "parents": return "parent";
    case "children": return "child";
    case "leftFriends": return "left";
    case "rightFriends": return "right";
    default: return role as OntologyFieldRole;
  }
}

function getRoleList(hierarchy: MutableHierarchyData, role: OntologyFieldRole): string[] {
  switch (role) {
    case "parent": return (hierarchy.parents ??= []);
    case "child": return (hierarchy.children ??= []);
    case "left": return (hierarchy.leftFriends ??= []);
    case "right": return (hierarchy.rightFriends ??= []);
    case "previous": return (hierarchy.previous ??= []);
    case "next": return (hierarchy.next ??= []);
    case "hidden": return (hierarchy.hidden ??= []);
    case "excluded": return (hierarchy.exclusions ??= []);
  }
}

function reciprocalRoleForGroup(role: OntologyFieldRole): OntologyFieldRole {
  switch (role) {
    case "parent": return "child";
    case "child": return "parent";
    case "previous": return "next";
    case "next": return "previous";
    case "left": return "left";
    case "right": return "right";
    default: return role;
  }
}

/**
 * Reassign an ontology field or slash pair into a target hierarchy role.
 * Preserves the other half of an existing slash pair when only one half is reassigned,
 * preventing silent data loss or duplicate conflicting mappings.
 *
 * @param hierarchy The mutable hierarchy settings data.
 * @param field The field or slash pair being assigned.
 * @param targetRole The destination ontology role.
 */
export function reassignFieldInHierarchy(
  hierarchy: MutableHierarchyData,
  field: string,
  targetRole: OntologyFieldRole | "parents" | "children" | "leftFriends" | "rightFriends",
): MutableHierarchyData {
  const trimmed = field.trim();
  if (!trimmed) return hierarchy;
  const normalized = normalizeFieldName(trimmed);
  const inputMapping = parseHierarchyFieldMapping(trimmed);
  const destinationRole = normalizeTargetRole(targetRole);

  hierarchy.hidden ??= [];
  hierarchy.parents ??= [];
  hierarchy.children ??= [];
  hierarchy.leftFriends ??= [];
  hierarchy.rightFriends ??= [];
  hierarchy.previous ??= [];
  hierarchy.next ??= [];

  const roleLists: Array<{ role: OntologyFieldRole; list: string[] }> = [
    { role: "hidden", list: hierarchy.hidden },
    { role: "parent", list: hierarchy.parents },
    { role: "child", list: hierarchy.children },
    { role: "left", list: hierarchy.leftFriends },
    { role: "right", list: hierarchy.rightFriends },
    { role: "previous", list: hierarchy.previous },
    { role: "next", list: hierarchy.next },
    { role: "excluded", list: hierarchy.exclusions ?? [] },
  ];

  // If reassigning an entire slash pair:
  if (inputMapping.inverse) {
    for (const group of roleLists) {
      const filtered = group.list.filter((entry) => {
        const m = parseHierarchyFieldMapping(entry);
        return m.normalizedForward !== inputMapping.normalizedForward &&
               m.normalizedForward !== inputMapping.normalizedInverse &&
               m.normalizedInverse !== inputMapping.normalizedForward &&
               m.normalizedInverse !== inputMapping.normalizedInverse;
      });
      group.list.length = 0;
      group.list.push(...filtered);
    }
    const target = getRoleList(hierarchy, destinationRole);
    target.push(trimmed);
    target.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    return hierarchy;
  }

  // The user is reassigning a single field:
  const retainedPreservations: Array<{ targetRole: OntologyFieldRole; entry: string }> = [];

  for (const group of roleLists) {
    const updated: string[] = [];
    for (const entry of group.list) {
      const m = parseHierarchyFieldMapping(entry);
      if (m.inverse) {
        if (m.normalizedForward === normalized) {
          const reciprocal = reciprocalRoleForGroup(group.role);
          retainedPreservations.push({ targetRole: reciprocal, entry: m.inverse });
          continue;
        } else if (m.normalizedInverse === normalized) {
          updated.push(m.forward);
          continue;
        }
      } else if (m.normalizedForward === normalized) {
        continue;
      }
      updated.push(entry);
    }
    group.list.length = 0;
    group.list.push(...updated);
  }

  for (const { targetRole: r, entry } of retainedPreservations) {
    const list = getRoleList(hierarchy, r);
    const norm = normalizeFieldName(entry);
    if (!list.some((existing) => {
      const m = parseHierarchyFieldMapping(existing);
      return m.normalizedForward === norm || m.normalizedInverse === norm;
    })) {
      list.push(entry);
      list.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    }
  }

  const target = getRoleList(hierarchy, destinationRole);
  target.push(trimmed);
  target.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return hierarchy;
}



