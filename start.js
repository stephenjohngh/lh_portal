// start.js — how the Node deployment (Northflank) runs the built app: `npm start`.
//
// adapter-node refuses any request whose body is over BODY_SIZE_LIMIT, and its
// default is 512 KB. The Building Assets Word report posts every component and
// each floor plan's image, which passed that on this building's data (603 KB,
// 2026-10-05), so the report failed on Northflank only — Netlify does not run
// this server. The limit is raised here so a deployment works without anybody
// knowing to set it; a host that sets BODY_SIZE_LIMIT itself still wins.
// Netlify caps a function's request at 6 MB regardless.
process.env.BODY_SIZE_LIMIT ??= '20M';

await import('./build/index.js');
