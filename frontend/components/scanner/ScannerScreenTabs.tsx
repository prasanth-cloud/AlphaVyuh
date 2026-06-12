import type { SavedScreen } from "@/lib/api/types";

type ScannerScreenTabsProps = {
  screens: SavedScreen[];
  activeScreenId: string | null;
  onSelect: (screen: SavedScreen) => void;
};

export function ScannerScreenTabs({ screens, activeScreenId, onSelect }: ScannerScreenTabsProps) {
  if (screens.length === 0) return null;

  return (
    <div className="scanner-screen-tabs" data-testid="scanner-screen-tabs">
      {screens.map((screen) => {
        const active = activeScreenId === screen.id;
        return (
          <button
            key={screen.id}
            type="button"
            className={`scanner-screen-tab${active ? " active" : ""}`}
            data-testid={`scanner-screen-tab-${screen.id}`}
            onClick={() => onSelect(screen)}
            title={screen.name}
          >
            {screen.name}
          </button>
        );
      })}
    </div>
  );
}
