import { computeBudget, type Budget } from './nutrition'
import type { Profile } from './profile'

export function budgetOf(profile: Profile): Budget {
  return computeBudget(profile, profile.goal, profile.pace, profile.goalWeightKg)
}
