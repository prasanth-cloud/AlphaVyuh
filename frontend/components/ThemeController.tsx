"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function ThemeController() {
  const pathname = usePathname();

  useEffect(() => {
    const stored = window.localStorage.getItem("alphavyuh-theme");
    const theme = stored === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
  }, [pathname]);

  return null;
}
