import type { Allergen, Goal, Profile } from '../lib/profile'
import type { PlanProfile } from './types'

const GOAL: Record<Goal, string> = {
  balanced: 'balanced',
  maintain: 'weight_maintenance',
  lose: 'gradual_weight_loss',
  gain: 'gradual_weight_gain',
  muscle: 'training_muscle',
}

/**
 * The backend excludes a dish when an allergy term appears anywhere in its
 * published allergens, name, description or ingredients. Menus spell allergens
 * several ways ("egg", "milk", "wheat"), so each allergy is sent as every
 * spelling the menus use. Erring toward hiding a dish is intended.
 */
const ALLERGY_TERMS: Record<Allergen, string[]> = {
  eggs: ['egg', 'omelet', 'omelette', 'frittata', 'mayo', 'aioli'],
  dairy: ['dairy', 'milk', 'cheese', 'butter', 'cream', 'yogurt', 'mozzarella', 'parm'],
  gluten: ['gluten', 'wheat'],
  peanuts: ['peanut'],
  'tree nuts': ['tree nut', 'almond', 'walnut', 'pecan', 'cashew', 'pistachio', 'hazelnut'],
  soy: ['soy', 'tofu', 'edamame'],
  fish: ['fish', 'salmon', 'tuna'],
  shellfish: ['shellfish', 'shrimp', 'crab', 'lobster'],
  sesame: ['sesame', 'tahini'],
}

function ageRange(age: number): string {
  if (age < 18) return 'under_18'
  if (age < 25) return '18_24'
  if (age < 35) return '25_34'
  return '35_plus'
}

export function toPlanProfile(profile: Profile): PlanProfile {
  return {
    nutrition_goal: GOAL[profile.goal],
    dietary_preference: profile.diet === 'everything' ? null : profile.diet,
    allergies: profile.allergens.flatMap((a) => ALLERGY_TERMS[a]),
    exclusions: profile.otherExclusions
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    prefer_high_protein: profile.goal === 'lose' || profile.goal === 'gain' || profile.goal === 'muscle',
    age_range: ageRange(profile.age),
    activity_level: profile.activity,
    height_cm: Math.round(profile.heightCm),
    weight_kg: Math.round(profile.weightKg * 10) / 10,
    goal_weight_kg: profile.goalWeightKg === null ? null : Math.round(profile.goalWeightKg * 10) / 10,
  }
}
