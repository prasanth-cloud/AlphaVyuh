"use client";

import { useEffect } from "react";

export default function ThemeController() {
  useEffect(() => {
    const appRoute = [
      "/dashboard",
      "/scanner",
      "/watchlist",
      "/charts",
      "/journal",
      "/settings",
      "/data",
      "/alerts",
      "/admin",
      "/upload",
    ].some((prefix) => window.location.pathname.startsWith(prefix));
    if (appRoute) {
      document.documentElement.dataset.theme = "dark";
      window.localStorage.setItem("alphavyuh-theme", "dark");
      return;
    }

    const stored = window.localStorage.getItem("alphavyuh-theme");
    const theme = stored === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
  }, []);

  return null;
}
