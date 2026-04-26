"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Retire existing service workers. The app changes frequently during beta,
    // and route-payload caching can interfere with Next.js navigation after deploys.
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      Promise.all(registrations.map((r) => r.unregister())).catch(() => {});
    });

    if ("caches" in window) {
      caches.keys().then((keys) => {
        Promise.all(keys.map((k) => caches.delete(k))).catch(() => {});
      });
    }
  }, []);

  return null;
}
