export default function EmaTag({ close, ema, label }: { close: number; ema: number | null; label: string }) {
  if (ema == null) return <span className="text-[#aaa] text-[11px]">—</span>;
  const above = close > ema;
  return (
    <span
      className="text-[11px] font-medium"
      style={{ color: above ? "#26a65b" : "#e5383b" }}
    >
      {above ? "↑" : "↓"} {label}
    </span>
  );
}
