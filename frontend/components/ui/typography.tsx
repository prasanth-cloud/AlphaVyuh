import type { HTMLAttributes } from "react";

export function EyebrowLabel({ className, style, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={["app-eyebrow", className].filter(Boolean).join(" ")}
      style={style}
      {...props}
    />
  );
}

type NumTone = "default" | "positive" | "negative" | "muted" | "accent" | "warn";

const toneColor: Record<NumTone, string | undefined> = {
  default: undefined,
  positive: "var(--gain)",
  negative: "var(--loss)",
  muted: "var(--text-tertiary)",
  accent: "var(--accent)",
  warn: "var(--warn)",
};

export function Num({
  className,
  tone = "default",
  style,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: NumTone }) {
  return (
    <span
      className={["app-num", className].filter(Boolean).join(" ")}
      style={{ color: toneColor[tone], ...style }}
      data-num
      {...props}
    />
  );
}
