/**
 * Dotted-path helpers for plain nested objects.
 * Used by `config get/set/unset` to access TOML config keys like `defaults.model`.
 *
 * All mutation functions return new objects (immutable) — no in-place edits.
 */

/**
 * Read a value by dotted path.
 * `getByPath({a:{b:1}}, 'a.b')` → 1
 * Returns `undefined` when the path does not exist.
 */
export function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || typeof cur !== 'object' || Array.isArray(cur)) {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * Set a value at a dotted path, returning a new object.
 * Intermediate nodes are created as plain objects if missing.
 * Arrays and primitives along the path are overwritten.
 */
export function setByPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const parts = path.split('.');
  // Clone top-level to avoid mutation
  const result: Record<string, unknown> = { ...obj };

  // Navigate to the parent of the target key
  let node = result;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i] as string;
    const existing = node[part];
    // Create or clone intermediate object
    const child: Record<string, unknown> =
      existing !== null && typeof existing === 'object' && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {};
    node[part] = child;
    node = child;
  }

  const lastPart = parts[parts.length - 1] as string;
  node[lastPart] = value;
  return result;
}

/**
 * Delete a key at a dotted path, returning a new object.
 * No-ops silently when the path does not exist.
 */
export function unsetByPath(obj: Record<string, unknown>, path: string): Record<string, unknown> {
  const parts = path.split('.');
  const result: Record<string, unknown> = { ...obj };

  // Collect references to cloned nodes so we can modify the last one
  const nodes: Array<{ parent: Record<string, unknown>; key: string }> = [];
  let node = result;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i] as string;
    const existing = node[part];
    if (existing === null || typeof existing !== 'object' || Array.isArray(existing)) {
      // Path doesn't exist — nothing to unset
      return result;
    }
    const child: Record<string, unknown> = { ...(existing as Record<string, unknown>) };
    nodes.push({ parent: node, key: part });
    node[part] = child;
    node = child;
  }

  const lastPart = parts[parts.length - 1] as string;
  delete node[lastPart];
  return result;
}

/**
 * Parse a raw CLI string value into a typed primitive.
 * - `'true'` / `'false'` → boolean
 * - `'null'` → null
 * - Numeric strings → number
 * - Everything else → string
 */
export function parseValue(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;

  // Numeric: must be finite and not just whitespace
  if (raw.trim() !== '' && Number.isFinite(Number(raw))) {
    return Number(raw);
  }

  return raw;
}
