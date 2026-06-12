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
  if (import.meta.env.DEV) {
    // Dev builds: log everything by default.
    localStorage.setItem("debug", "app:*");
  } else if (localStorage.getItem("debug") === "app:*") {
    // Production: earlier builds force-set "app:*" on every visit, leaking
    // internal logs to every user's console. Remove that exact value once;
    // a deliberately set narrower filter (e.g. "app:auth") is left alone.
    localStorage.removeItem("debug");
  }
}

const cache = new Map();


export function getLogger(namespace) {
  const full = `app:${namespace}`;

  if (!cache.has(full)) {
    cache.set(full, createDebug(full));
  }

  return cache.get(full);
}
