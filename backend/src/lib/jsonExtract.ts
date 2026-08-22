// Shared helpers for pulling a JSON object out of an LLM text response that
// may include trailing narration or unescaped control characters — used
// anywhere a Gemini response is expected to be "JSON, mostly."

// text.indexOf('{')..lastIndexOf('}') breaks when the model adds any trailing
// content after the JSON block (which also happens to contain a '}') — walk
// brace depth instead, ignoring braces inside quoted strings, to find the
// end of the first complete top-level object.
export function extractBalancedJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0, inString = false, escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}

// Models occasionally emit raw control characters (literal newlines/tabs)
// inside JSON string values instead of escaping them, which is technically
// invalid JSON — escape any control char found between unescaped quotes.
export function escapeStringControlChars(json: string): string {
  let out = '', inString = false, escape = false;
  for (const ch of json) {
    if (escape) { out += ch; escape = false; continue; }
    if (ch === '\\') { out += ch; escape = true; continue; }
    if (ch === '"') { inString = !inString; out += ch; continue; }
    if (inString && ch.charCodeAt(0) < 0x20) {
      if (ch === '\n') out += '\\n';
      else if (ch === '\t') out += '\\t';
      else if (ch === '\r') out += '\\r';
      continue;
    }
    out += ch;
  }
  return out;
}

// Extracts + repairs + parses in one step; returns null on any failure
// instead of throwing, since callers here always treat "couldn't parse" as
// "got nothing" rather than a fatal error.
export function parseJsonObjectLoose<T = any>(text: string): T | null {
  const slice = extractBalancedJsonObject(text);
  if (!slice) return null;
  try {
    return JSON.parse(escapeStringControlChars(slice)) as T;
  } catch {
    return null;
  }
}
