"use client";

import { useEffect } from "react";

export default function ThemeController() {
  useEffect(() => {
    const stored = window.localStorage.getItem("alphavyuh-theme");
    const theme = stored === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
  }, []);

  return null;
}
