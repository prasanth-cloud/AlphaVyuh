import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      colors: {
        // Design system
        page:        "#f2f2f0",
        surface:     "#ffffff",
        "text-1":    "#1c1c1a",
        "text-2":    "#666666",
        "text-3":    "#888888",
        "text-4":    "#aaaaaa",
        "accent-c":  "#5b63f5",
        "accent-bg": "#eeeffe",
        gain:        "#26a65b",
        "gain-bg":   "#edfaf3",
        loss:        "#e5383b",
        warn:        "#d97706",
        vr:          "#7c6af0",
        "border-sub":"#f0f0ee",
        // AlphaVyuh v2 tokens
        "av-dark":    "#0f0f0e",
        "av-dark2":   "#1a1a18",
        "av-dark3":   "#242422",
        "av-page":    "#f2f2f0",
        "av-surface": "#ffffff",
        "av-border":  "#e8e8e6",
        "av-bsub":    "#f2f2f0",
        "av-t1":      "#0f0f0e",
        "av-t2":      "#555553",
        "av-t3":      "#888886",
        "av-t4":      "#b0b0ae",
        "av-accent":  "#5b63f5",
        "av-abg":     "#eeeffe",
        "av-adim":    "#818cf8",
        "av-gain":    "#26a65b",
        "av-gbg":     "#edfaf3",
        "av-loss":    "#e5383b",
        "av-lbg":     "#fff0f0",
        "av-warn":    "#d97706",
        "av-wbg":     "#fff8ec",
        "av-vol":     "#7c6af0",
        // shadcn tokens
        border:      "hsl(var(--border))",
        input:       "hsl(var(--input))",
        ring:        "hsl(var(--ring))",
        background:  "hsl(var(--background))",
        foreground:  "hsl(var(--foreground))",
        primary: {
          DEFAULT:    "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT:    "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT:    "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT:    "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT:    "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT:    "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
};

export default config;
