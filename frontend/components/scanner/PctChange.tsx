export default function PctChange({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-[#aaa] text-xs tabular-nums">—</span>;
  const positive = pct >= 0;
  return (
    <span
      className="text-xs font-semibold tabular-nums"
      style={{ color: positive ? "#26a65b" : "#e5383b" }}
    >
      {positive ? "+" : ""}{pct.toFixed(2)}%
    </span>
  );
}
