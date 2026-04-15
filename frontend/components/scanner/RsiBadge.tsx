export default function RsiBadge({ rsi }: { rsi: number | null }) {
  if (rsi == null) return <span className="text-[#aaa] text-xs">—</span>;

  let bg = "#edfaf3", color = "#26a65b";
  if (rsi > 70)      { bg = "#f0efff"; color = "#5b63f5"; }
  else if (rsi < 40) { bg = "#fff8ec"; color = "#d97706"; }

  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold tabular-nums"
      style={{ background: bg, color }}
    >
      {rsi.toFixed(1)}
    </span>
  );
}
