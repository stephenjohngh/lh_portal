// src/lib/utils/download.js
// Browser file download helper — shared by all report modal components.

/**
 * Trigger a file download from a fetch Response object.
 *
 * Usage:
 *   const response = await fetch('/api/plans/generate-report', { ... });
 *   if (!response.ok) throw new Error(`HTTP ${response.status}`);
 *   await downloadResponse(response, 'MyReport.docx');
 *
 * @param {Response} response  — A resolved fetch Response (caller must verify response.ok first)
 * @param {string}   filename  — The filename the browser will save as
 */
export async function downloadResponse(response, filename) {
  const blob = await response.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
