// src/lib/server/promptEscape.js
//
// Escape user-supplied text before embedding it inside XML-style delimiters in
// an LLM prompt (e.g. `<comment>…</comment>`). Without this, a value that
// contains a literal `</comment>` (or any other angle-bracketed tag) could
// break out of its delimiter and be read by the model as prompt instructions —
// a prompt-injection vector. Escaping the three XML metacharacters neutralises
// fake tags while leaving the text fully readable to the model (standard XML
// entity escaping; Claude reads `&lt;`/`&amp;` fine and normalises them away in
// its output).
//
// Order matters: `&` must be escaped first so the `&` we introduce for `<`/`>`
// is not double-escaped.
//
// @param {unknown} value  Any value; null/undefined become ''.
// @returns {string}
export function escapeForPrompt(value) {
  if (value == null) return '';
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
