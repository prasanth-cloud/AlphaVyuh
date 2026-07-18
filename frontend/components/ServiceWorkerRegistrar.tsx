"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    // next-pwa is disabled outside production, so /sw.js does not exist in
    // local development or browser smoke runs. Avoid a noisy 404 and only
    // register the worker in the environment that actually builds it.
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
