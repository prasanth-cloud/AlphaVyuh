export function formatCurrency(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}₹${Math.abs(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function formatRatio(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(2);
}

export function formatPct(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

export function toneForSigned(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "var(--text-secondary)";
  return value >= 0 ? "var(--gain)" : "var(--loss)";
}
