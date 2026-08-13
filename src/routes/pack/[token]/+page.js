// src/routes/pack/[token]/+page.js
//
// ── Why this page is not server-rendered ─────────────────────────────────────
// The shared block renderer sanitises through DOMPurify and resolves embeds,
// tables and previews through the DOM. All of that no-ops without a `document`
// — so an SSR pass would emit the raw generateHTML output, unsanitised, to the
// one page in this portal deliberately handed to an outsider.
//
// The honest alternatives were: ship jsdom into a serverless function purely to
// sanitise HTML that is sanitised again a moment later in the browser, or don't
// render on the server. This is the second. The server `load` in
// +page.server.js still runs — the token→content path is unchanged and stays
// server-side — only the HTML generation moves to the client.
//
// Cost, stated plainly: a reader with JavaScript disabled sees nothing. For a
// solicitor opening a link in a normal browser that is not a real constraint,
// and it is a far better trade than a sanitiser that silently does not run.
export const ssr = false;
