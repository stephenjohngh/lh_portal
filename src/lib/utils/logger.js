// src/lib/utils/logger.js
/**
 * Centralized debug logging utility
 * 
 *Enable it in the browser:

localStorage.debug = "app:auth"

Or everything:

localStorage.debug = "app:*"
 *
 *
 *
  */
import createDebug from "debug";
import { browser } from "$app/environment";

if (browser) {
  localStorage.setItem("debug", "app:*");
}

const cache = new Map();


export function getLogger(namespace) {
  const full = `app:${namespace}`;

  if (!cache.has(full)) {
    cache.set(full, createDebug(full));
  }

  return cache.get(full);
}
