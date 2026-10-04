// src/lib/branding.js
//
// The logo and how it is described — DEPLOYMENT branding, set once per
// installation, like the colours in theme.js (user, 2026-10-03: "logo and
// colours ARE deployment issues"). Everything that changes while the portal
// runs — the building, the business, its address, who signs the letters — is
// an admin setting instead ($lib/utils/identity.js, Admin → Building &
// business).
//
// To rebrand a deployment: replace the image and the alt text here.

import logo from '$lib/assets/LH_services_logo.png';

/** The logo image. */
export const LOGO = logo;

/** What the logo shows, for a screen reader and when the image fails to load. */
export const LOGO_ALT = 'LH Services';
