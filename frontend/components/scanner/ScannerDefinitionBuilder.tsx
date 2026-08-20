'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui'
import {
  createScannerDefinition,
  updateScannerDefinition,
} from '@/lib/api'
import type { ScannerDefinition, ScannerUniverse } from '@/lib/api/types'
import {
  buildScannerDefinitionRequest,
  createScannerDefinitionDraftFilter,
  createScannerDefinitionDraftGroup,
  SCANNER_DEFINITION_FILTER_OPTIONS,
  scannerDefinitionToDraft,
  validateScannerDefinitionDraft,
  type ScannerDefinitionDraftFilter,
  type ScannerDefinitionDraftGroup,
} from '@/lib/scanner-definition'

type ScannerDefinitionBuilderProps = {
  open: boolean
  initialDefinition?: ScannerDefinition | null
  onClose: () => void
  onSaved: (definition: ScannerDefinition) => void
}

const inputStyle: React.CSSProperties = {
  padding: '7px 9px',
  background: 'var(--surface-2)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  fontSize: 12,
  color: 'var(--text-primary)',
  outline: 'none',
  width: '100%',
}

function startingGroups(definition?: ScannerDefinition | null): ScannerDefinitionDraftGroup[] {
  const groups = definition ? scannerDefinitionToDraft(definition) : []
  return groups.length > 0 ? groups : [createScannerDefinitionDraftGroup()]
}

export function ScannerDefinitionBuilder({
  open,
  initialDefinition,
  onClose,
  onSaved,
}: ScannerDefinitionBuilderProps) {
  const [name, setName] = useState('')
  const [universe, setUniverse] = useState<ScannerUniverse>('all_nse')
  const [groups, setGroups] = useState<ScannerDefinitionDraftGroup[]>([createScannerDefinitionDraftGroup()])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(initialDefinition?.name ?? '')
    setUniverse(initialDefinition?.universe ?? 'all_nse')
    setGroups(startingGroups(initialDefinition))
    setError('')
  }, [initialDefinition, open])

  if (!open) return null

  function updateGroup(groupId: string, patch: Partial<ScannerDefinitionDraftGroup>) {
    setGroups((current) => current.map((group) => group.clientId === groupId ? { ...group, ...patch } : group))
  }

  function updateFilter(groupId: string, filterId: string, patch: Partial<ScannerDefinitionDraftFilter>) {
    setGroups((current) => current.map((group) => group.clientId !== groupId
      ? group
      : { ...group, filters: group.filters.map((filter) => filter.clientId === filterId ? { ...filter, ...patch } : filter) }))
  }

  function addFilter(groupId: string) {
    setGroups((current) => current.map((group) => group.clientId === groupId
      ? { ...group, filters: [...group.filters, createScannerDefinitionDraftFilter()] }
      : group))
  }

  function removeFilter(groupId: string, filterId: string) {
    setGroups((current) => current.map((group) => group.clientId === groupId
      ? { ...group, filters: group.filters.filter((filter) => filter.clientId !== filterId) }
      : group))
  }

  function removeGroup(groupId: string) {
    setGroups((current) => current.filter((group) => group.clientId !== groupId))
  }

  async function save() {
    const validationError = validateScannerDefinitionDraft(name, groups)
    if (validationError) {
      setError(validationError)
      return
    }
    setSaving(true)
    setError('')
    try {
      const request = buildScannerDefinitionRequest(name, universe, groups)
      const saved = initialDefinition
        ? await updateScannerDefinition(initialDefinition.id, request)
        : await createScannerDefinition(request)
      onSaved(saved)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Scanner definition could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'var(--overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 220, padding: 16 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="scanner-definition-builder-title"
        data-testid="scanner-definition-builder"
        onClick={(event) => event.stopPropagation()}
        style={{ background: 'var(--surface-float)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-lg)', padding: 20, width: 'min(680px, 100%)', maxHeight: 'min(760px, 92vh)', overflowY: 'auto', boxShadow: 'var(--shadow-modal)' }}
      >
        <div id="scanner-definition-builder-title" className="heading-card" style={{ marginBottom: 5 }}>
          {initialDefinition ? 'Edit scanner definition' : 'Build scanner definition'}
        </div>
        <div className="caption" style={{ lineHeight: 1.5, marginBottom: 16 }}>
          Save a user-owned universe and filter tree. The current EOD runner executes flat AND filters; OR groups remain visible and are blocked from execution until that engine supports them.
        </div>

        <label className="label" htmlFor="scanner-definition-name">Definition name</label>
        <input
          id="scanner-definition-name"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Trend continuation"
          style={{ ...inputStyle, marginTop: 5, marginBottom: 12 }}
        />

        <label className="label" htmlFor="scanner-definition-universe">Universe</label>
        <select
          id="scanner-definition-universe"
          value={universe}
          onChange={(event) => setUniverse(event.target.value as ScannerUniverse)}
          style={{ ...inputStyle, marginTop: 5, marginBottom: 16 }}
        >
          <option value="all_nse">All NSE equity</option>
          <option value="nifty500">Nifty 500</option>
          <option value="nifty_midsmallcap_400">Nifty MidSmallcap 400</option>
          <option value="custom">Custom universe</option>
        </select>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div className="label">Filter groups</div>
          <Button type="button" variant="secondary" size="sm" onClick={() => setGroups((current) => [...current, createScannerDefinitionDraftGroup()])}>
            Add group
          </Button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {groups.map((group, groupIndex) => (
            <div key={group.clientId} style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 12, background: 'var(--surface-1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 9 }}>
                <span className="label">Group {groupIndex + 1}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <select
                    aria-label={`Logic for group ${groupIndex + 1}`}
                    value={group.operator}
                    onChange={(event) => updateGroup(group.clientId, { operator: event.target.value as ScannerDefinitionDraftGroup['operator'] })}
                    style={{ ...inputStyle, width: 100, padding: '5px 7px' }}
                  >
                    <option value="and">All (AND)</option>
                    <option value="or">Any (OR)</option>
                  </select>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeGroup(group.clientId)} disabled={groups.length === 1} aria-label={`Remove group ${groupIndex + 1}`}>
                    Remove
                  </Button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {group.filters.map((filter, filterIndex) => {
                  const option = SCANNER_DEFINITION_FILTER_OPTIONS.find((candidate) => candidate.kind === filter.kind) ?? SCANNER_DEFINITION_FILTER_OPTIONS[0]
                  return (
                    <div key={filter.clientId} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr) auto', gap: 6, alignItems: 'center' }}>
                      <select
                        aria-label={`Filter ${filterIndex + 1} in group ${groupIndex + 1}`}
                        value={filter.kind}
                        onChange={(event) => updateFilter(group.clientId, filter.clientId, { kind: event.target.value, value: '' })}
                        style={{ ...inputStyle, padding: '6px 7px' }}
                      >
                        {SCANNER_DEFINITION_FILTER_OPTIONS.map((candidate) => <option key={candidate.kind} value={candidate.kind}>{candidate.label}</option>)}
                      </select>
                      {option.valueType === 'select' ? (
                        <select
                          aria-label={`Value for filter ${filterIndex + 1} in group ${groupIndex + 1}`}
                          value={filter.value}
                          onChange={(event) => updateFilter(group.clientId, filter.clientId, { value: event.target.value })}
                          style={{ ...inputStyle, padding: '6px 7px' }}
                        >
                          <option value="">Choose…</option>
                          {option.options?.map((candidate) => <option key={candidate.value} value={candidate.value}>{candidate.label}</option>)}
                        </select>
                      ) : (
                        <input
                          aria-label={`Value for filter ${filterIndex + 1} in group ${groupIndex + 1}`}
                          type="number"
                          step="any"
                          value={filter.value}
                          onChange={(event) => updateFilter(group.clientId, filter.clientId, { value: event.target.value })}
                          placeholder="Value"
                          style={{ ...inputStyle, padding: '6px 7px' }}
                        />
                      )}
                      <button type="button" onClick={() => removeFilter(group.clientId, filter.clientId)} disabled={group.filters.length === 1} aria-label={`Remove filter ${filterIndex + 1} from group ${groupIndex + 1}`} style={{ color: 'var(--text-tertiary)', cursor: group.filters.length === 1 ? 'not-allowed' : 'pointer', opacity: group.filters.length === 1 ? 0.45 : 1, fontSize: 16, lineHeight: 1 }}>×</button>
                    </div>
                  )
                })}
              </div>
              <button type="button" onClick={() => addFilter(group.clientId)} className="workspace-chip-button" style={{ marginTop: 9 }}>
                Add filter
              </button>
            </div>
          ))}
        </div>

        {error && <div role="alert" style={{ marginTop: 12, color: 'var(--loss)', fontSize: 12 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <Button type="button" variant="ghost" size="md" onClick={onClose} fullWidth>Cancel</Button>
          <Button type="button" variant="primary" size="md" onClick={() => void save()} loading={saving} fullWidth>
            {initialDefinition ? 'Save changes' : 'Save definition'}
          </Button>
        </div>
      </div>
    </div>
  )
}
