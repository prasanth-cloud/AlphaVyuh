"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Unregister all existing service workers first, then re-register fresh.
    // This clears stale chunk caches that cause ChunkLoadError after deploys.
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      Promise.all(registrations.map((r) => r.unregister())).then(() => {
        // Clear all caches
        if ("caches" in window) {
          caches.keys().then((keys) =>
            Promise.all(keys.map((k) => caches.delete(k)))
          );
        }
        // Re-register the service worker
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      });
    });
  }, []);

  return null;
}
