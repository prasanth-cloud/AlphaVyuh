'use client'

import {
  buildScannerActiveFilterChips,
  clearScannerFilterSection,
  type ScannerActiveFilterChip,
  type ScannerFilterState,
} from '@/lib/scanner-active-filters'

type ScannerFilterChipsProps = {
  filters: ScannerFilterState
  activePresetName?: string | null
  onDismiss: (patch: Partial<ScannerFilterState>, clearPreset?: boolean) => void
}

const SECTION_LABELS: Record<string, string> = {
  preset: 'Preset',
  price: 'Price',
  liquidity: 'Liquidity',
  trend: 'Trend',
  strength: 'Strength',
  setup: 'Setup',
  volatility: 'Volatility',
  range: '52-week',
  patterns: 'Patterns',
  fundamentals: 'Fundamentals',
}

export function ScannerFilterChips({ filters, activePresetName, onDismiss }: ScannerFilterChipsProps) {
  const chips = buildScannerActiveFilterChips(filters, { activePresetName })
  if (chips.length === 0) return null

  const sections = [...new Set(chips.map(chip => chip.section))]

  function dismissChip(chip: ScannerActiveFilterChip) {
    if (chip.section === 'preset') {
      onDismiss({}, true)
      return
    }
    onDismiss(chip.clear)
  }

  function clearSection(section: string) {
    if (section === 'preset') {
      onDismiss({}, true)
      return
    }
    onDismiss(clearScannerFilterSection(filters, section))
  }

  return (
    <div className="scanner-active-filters" data-testid="scanner-active-filters">
      <div className="scanner-active-filters-chips">
        {chips.map(chip => (
          <button
            key={chip.id}
            type="button"
            className="scanner-active-filter-chip"
            data-testid={`scanner-filter-chip-${chip.id}`}
            onClick={() => dismissChip(chip)}
            title={`Remove ${chip.label}`}
          >
            <span>{chip.label}</span>
            <span className="scanner-active-filter-chip-dismiss" aria-hidden="true">×</span>
          </button>
        ))}
      </div>
      {sections.length > 1 && (
        <div className="scanner-active-filters-sections">
          {sections.map(section => (
            <button
              key={section}
              type="button"
              className="scanner-active-filter-section-link"
              onClick={() => clearSection(section)}
            >
              Clear {SECTION_LABELS[section] ?? section}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
