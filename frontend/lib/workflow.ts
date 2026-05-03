'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

export const SYMBOL_LIFECYCLE = [
  'Idea',
  'Watch',
  'Ready',
  'Triggered',
  'Open',
  'Closed',
  'Reviewed',
  'Invalidated',
] as const

export type SymbolLifecycle = (typeof SYMBOL_LIFECYCLE)[number]
export type WorkflowStage = 'Market' | 'Scan' | 'Shortlist' | 'Plan' | 'Review'
export type GoalHorizon = 'daily' | 'weekly' | 'monthly'
export type GoalMetricType = 'review_count' | 'valid_plan_count' | 'planned_before_order' | 'setup_quality'

export type ShortlistItem = {
  symbol: string
  companyName?: string
  sector?: string | null
  lifecycle: SymbolLifecycle
  setupQuality?: number | null
  setupType?: string
  source?: string
  addedAt: string
}

export type TradePlan = {
  symbol: string
  setupType: string
  entry: string
  stop: string
  target: string
  positionSize: string
  timeframe: string
  thesis: string
  invalidationRule: string
  lifecycle: SymbolLifecycle
  updatedAt: string
}

export type Goal = {
  id: string
  title: string
  description: string
  horizon: GoalHorizon
  metricType: GoalMetricType
  targetValue: number
  currentProgress: number
  linkedStage: WorkflowStage
  completionRule: string
  breachRule?: string
  visibleOn: string[]
  paused?: boolean
}

export type WorkflowState = {
  selectedSymbol: string | null
  marketRegime: string | null
  shortlist: ShortlistItem[]
  plans: Record<string, TradePlan>
  goals: Goal[]
  recentSymbols: string[]
  reviewCompletions: number
}

const STORAGE_KEY = 'alphavyuh.workflow.v1'

const starterGoals: Goal[] = [
  {
    id: 'reviews-weekly',
    title: 'Review 3 closed trades',
    description: 'Keep review debt low before looking for more setups.',
    horizon: 'weekly',
    metricType: 'review_count',
    targetValue: 3,
    currentProgress: 0,
    linkedStage: 'Review',
    completionRule: 'Closed trades with a lesson count toward progress.',
    visibleOn: ['dashboard', 'journal'],
  },
  {
    id: 'plan-before-order',
    title: 'Thesis before order',
    description: 'No execution action until entry, stop, target, size, and thesis are written.',
    horizon: 'daily',
    metricType: 'planned_before_order',
    targetValue: 1,
    currentProgress: 0,
    linkedStage: 'Plan',
    completionRule: 'A valid trade plan unlocks order drafting.',
    breachRule: 'Execution without a valid plan is a process breach.',
    visibleOn: ['watchlist', 'scanner'],
  },
]

const emptyState: WorkflowState = {
  selectedSymbol: null,
  marketRegime: null,
  shortlist: [],
  plans: {},
  goals: starterGoals,
  recentSymbols: [],
  reviewCompletions: 0,
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readWorkflowState(): WorkflowState {
  if (!canUseStorage()) return emptyState
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyState
    const parsed = JSON.parse(raw) as Partial<WorkflowState>
    return {
      ...emptyState,
      ...parsed,
      shortlist: Array.isArray(parsed.shortlist) ? parsed.shortlist : [],
      plans: parsed.plans && typeof parsed.plans === 'object' ? parsed.plans : {},
      goals: Array.isArray(parsed.goals) && parsed.goals.length > 0 ? parsed.goals : starterGoals,
      recentSymbols: Array.isArray(parsed.recentSymbols) ? parsed.recentSymbols : [],
    }
  } catch {
    return emptyState
  }
}

function writeWorkflowState(next: WorkflowState) {
  if (!canUseStorage()) return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent('alphavyuh:workflow-updated', { detail: next }))
}

function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase()
}

function mergeGoalProgress(state: WorkflowState): WorkflowState {
  const validPlans = Object.values(state.plans).filter(isTradePlanValid).length
  const goals = state.goals.map((goal) => {
    if (goal.paused) return goal
    if (goal.metricType === 'review_count') {
      return { ...goal, currentProgress: Math.min(goal.targetValue, state.reviewCompletions) }
    }
    if (goal.metricType === 'valid_plan_count' || goal.metricType === 'planned_before_order') {
      return { ...goal, currentProgress: Math.min(goal.targetValue, validPlans) }
    }
    if (goal.metricType === 'setup_quality') {
      const quality = state.shortlist.filter((item) => (item.setupQuality ?? 0) >= 80).length
      return { ...goal, currentProgress: Math.min(goal.targetValue, quality) }
    }
    return goal
  })
  return { ...state, goals }
}

export function isTradePlanValid(plan?: TradePlan | null): boolean {
  if (!plan) return false
  const entry = Number(plan.entry)
  const stop = Number(plan.stop)
  const target = Number(plan.target)
  const size = Number(plan.positionSize)
  return Boolean(
    plan.symbol &&
    plan.setupType.trim() &&
    Number.isFinite(entry) && entry > 0 &&
    Number.isFinite(stop) && stop > 0 &&
    Number.isFinite(target) && target > 0 &&
    Number.isFinite(size) && size > 0 &&
    plan.thesis.trim().length >= 12 &&
    plan.invalidationRule.trim().length >= 8 &&
    plan.timeframe.trim(),
  )
}

export function createDraftPlan(symbol: string, referencePrice?: number | null, setupType = 'Momentum'): TradePlan {
  const price = referencePrice && Number.isFinite(referencePrice) ? referencePrice : 0
  return {
    symbol: normalizeSymbol(symbol),
    setupType,
    entry: price > 0 ? price.toFixed(2) : '',
    stop: '',
    target: '',
    positionSize: '',
    timeframe: '2-10 sessions',
    thesis: '',
    invalidationRule: '',
    lifecycle: 'Watch',
    updatedAt: new Date().toISOString(),
  }
}

export function useWorkflowState() {
  const [state, setState] = useState<WorkflowState>(emptyState)

  useEffect(() => {
    setState(mergeGoalProgress(readWorkflowState()))
    const onStorage = () => setState(mergeGoalProgress(readWorkflowState()))
    window.addEventListener('storage', onStorage)
    window.addEventListener('alphavyuh:workflow-updated', onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('alphavyuh:workflow-updated', onStorage)
    }
  }, [])

  const update = useCallback((producer: (current: WorkflowState) => WorkflowState) => {
    const current = readWorkflowState()
    const next = mergeGoalProgress(producer(current))
    writeWorkflowState(next)
    setState(next)
    return next
  }, [])

  const rememberSymbol = useCallback((symbol: string) => {
    const normalized = normalizeSymbol(symbol)
    if (!normalized) return
    update((current) => ({
      ...current,
      selectedSymbol: normalized,
      recentSymbols: [normalized, ...current.recentSymbols.filter((item) => item !== normalized)].slice(0, 8),
    }))
  }, [update])

  const setMarketRegime = useCallback((marketRegime: string | null) => {
    update((current) => ({ ...current, marketRegime }))
  }, [update])

  const addToShortlist = useCallback((items: Array<Omit<ShortlistItem, 'addedAt' | 'lifecycle'> & { lifecycle?: SymbolLifecycle }>) => {
    if (items.length === 0) return
    update((current) => {
      const now = new Date().toISOString()
      const bySymbol = new Map(current.shortlist.map((item) => [item.symbol, item]))
      for (const item of items) {
        const symbol = normalizeSymbol(item.symbol)
        if (!symbol) continue
        bySymbol.set(symbol, {
          ...bySymbol.get(symbol),
          ...item,
          symbol,
          lifecycle: item.lifecycle ?? bySymbol.get(symbol)?.lifecycle ?? 'Watch',
          addedAt: bySymbol.get(symbol)?.addedAt ?? now,
        })
      }
      return { ...current, shortlist: Array.from(bySymbol.values()).slice(-100) }
    })
  }, [update])

  const savePlan = useCallback((plan: TradePlan) => {
    const symbol = normalizeSymbol(plan.symbol)
    update((current) => {
      const nextPlan = {
        ...plan,
        symbol,
        lifecycle: isTradePlanValid(plan) ? 'Ready' : plan.lifecycle,
        updatedAt: new Date().toISOString(),
      }
      const shortlist = current.shortlist.map((item) => (
        item.symbol === symbol ? { ...item, lifecycle: nextPlan.lifecycle, setupType: nextPlan.setupType } : item
      ))
      return { ...current, selectedSymbol: symbol, shortlist, plans: { ...current.plans, [symbol]: nextPlan } }
    })
  }, [update])

  const markLifecycle = useCallback((symbol: string, lifecycle: SymbolLifecycle) => {
    const normalized = normalizeSymbol(symbol)
    update((current) => ({
      ...current,
      shortlist: current.shortlist.map((item) => item.symbol === normalized ? { ...item, lifecycle } : item),
      plans: current.plans[normalized]
        ? { ...current.plans, [normalized]: { ...current.plans[normalized], lifecycle, updatedAt: new Date().toISOString() } }
        : current.plans,
    }))
  }, [update])

  const completeReview = useCallback((symbol?: string) => {
    update((current) => ({
      ...current,
      reviewCompletions: current.reviewCompletions + 1,
      shortlist: symbol
        ? current.shortlist.map((item) => item.symbol === normalizeSymbol(symbol) ? { ...item, lifecycle: 'Reviewed' } : item)
        : current.shortlist,
    }))
  }, [update])

  const activeGoals = useMemo(() => state.goals.filter((goal) => !goal.paused), [state.goals])

  return {
    state,
    activeGoals,
    rememberSymbol,
    setMarketRegime,
    addToShortlist,
    savePlan,
    markLifecycle,
    completeReview,
  }
}

export function workflowStageForPath(pathname: string): WorkflowStage {
  if (pathname.startsWith('/scanner')) return 'Scan'
  if (pathname.startsWith('/watchlist') || pathname.startsWith('/charts')) return 'Plan'
  if (pathname.startsWith('/journal')) return 'Review'
  return 'Market'
}

export function goalPercent(goal: Goal): number {
  if (goal.targetValue <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((goal.currentProgress / goal.targetValue) * 100)))
}
