import { useEffect, useState } from 'react'
import type { MealPeriod, Mode, Recommendation } from '../api/types'

/** A meal the student chose today, and which planner it came from. */
export interface Pick {
  rec: Recommendation
  mode: Mode
}
export type DayPicks = Partial<Record<MealPeriod, Pick>>

const KEY = 'trojanplate.day.v1'
const today = () => new Date().toLocaleDateString('en-CA')

function load(): DayPicks {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { date: string; picks: DayPicks } | null
    return saved && saved.date === today() ? saved.picks : {}
  } catch {
    return {}
  }
}

/** Today's chosen meals, shared by the home screen and both planner tabs. Resets each day. */
export function useDayPicks() {
  const [picks, setPicks] = useState<DayPicks>(load)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ date: today(), picks }))
    } catch {
      // Storage unavailable; picks then last for this visit only.
    }
  }, [picks])
  return [picks, setPicks] as const
}

export interface DayTotals {
  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  meals: number
  /** Chosen meals with no published nutrition, which the totals leave out. */
  uncounted: number
  swipes: number
  spentUsd: number
}

export function totalsOf(picks: DayPicks): DayTotals {
  const totals: DayTotals = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, meals: 0, uncounted: 0, swipes: 0, spentUsd: 0 }
  for (const { rec, mode } of Object.values(picks)) {
    totals.meals += 1
    if (mode === 'usc_dining') totals.swipes += 1
    else totals.spentUsd += rec.price.amount ?? 0
    const n = rec.nutrition.published
    if (rec.nutrition.confidence !== 'confirmed' || !n || n.calories_kcal == null) {
      totals.uncounted += 1
      continue
    }
    totals.calories += n.calories_kcal
    totals.proteinG += n.protein_g ?? 0
    totals.carbsG += n.carbohydrates_g ?? 0
    totals.fatG += n.fat_g ?? 0
  }
  return totals
}
