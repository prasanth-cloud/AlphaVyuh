"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function ThemeController() {
  const pathname = usePathname();

  useEffect(() => {
    const currentPath = pathname ?? window.location.pathname;
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
      "/broker",
      "/onboarding",
    ].some((prefix) => currentPath.startsWith(prefix));
    if (appRoute) {
      document.documentElement.dataset.theme = "dark";
      return;
    }

    const stored = window.localStorage.getItem("alphavyuh-theme");
    const theme = stored === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
  }, [pathname]);

  return null;
}
