type WatchlistOption = { id: string; name: string };

type ScannerSelectionPanelProps = {
  symbols: string[];
  watchlists: WatchlistOption[];
  onClear: () => void;
  onAddToWatchlist: (watchlistId: string) => void;
  onReviewCharts: () => void;
};

export function ScannerSelectionPanel({
  symbols,
  watchlists,
  onClear,
  onAddToWatchlist,
  onReviewCharts,
}: ScannerSelectionPanelProps) {
  if (symbols.length === 0) return null;

  return (
    <div className="scanner-selection-panel" data-testid="scanner-selection-panel">
      <div className="scanner-selection-panel-header">
        <span className="scanner-selection-panel-title">
          {symbols.length} selected for watchlist handoff
        </span>
        <button type="button" className="workspace-chip-button" onClick={onClear}>
          Clear
        </button>
      </div>
      <div className="scanner-selection-panel-symbols">
        {symbols.slice(0, 12).map((symbol) => (
          <span key={symbol} className="scanner-selection-chip mono">
            {symbol}
          </span>
        ))}
        {symbols.length > 12 && (
          <span className="caption">+{symbols.length - 12} more</span>
        )}
      </div>
      <div className="scanner-selection-panel-actions">
        <select
          className="scanner-watchlist-select"
          defaultValue=""
          aria-label="Add selected symbols to watchlist"
          data-testid="scanner-selection-watchlist-select"
          onChange={(e) => {
            const id = e.target.value;
            e.target.value = "";
            if (id) onAddToWatchlist(id);
          }}
        >
          <option value="">Add to watchlist…</option>
          {watchlists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.name}
            </option>
          ))}
        </select>
        <button type="button" className="workspace-chip-button" onClick={onReviewCharts}>
          Review charts
        </button>
      </div>
    </div>
  );
}
