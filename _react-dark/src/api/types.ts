/**
 * Shapes of the TrojanPlate backend (TrojanFork-Backend, API 0.4.0).
 * Source of truth: src/trojanbites_extract/api/app.py and plan/engine.py.
 */

export type Mode = 'usc_dining' | 'off_campus'
export type MealPeriod = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface PlanProfile {
  nutrition_goal: string
  dietary_preference: string | null
  allergies: string[]
  exclusions: string[]
  prefer_high_protein: boolean
  age_range: string | null
  activity_level: string | null
  height_cm: number | null
  weight_kg: number | null
  goal_weight_kg: number | null
}

export interface PlanSituation {
  mode: Mode
  meal_periods: MealPeriod[]
  max_miles?: number
  preferred_cuisines?: string[]
  budget_per_meal?: number | null
  budget_daily?: number | null
  meal_swipes_remaining?: number | null
}

export interface LockedMeal {
  meal_period: MealPeriod
  dish_id: string
  status: 'selected' | 'eaten' | 'locked'
}

export interface PlanDayBody {
  profile: PlanProfile
  situation: PlanSituation
  locked: LockedMeal[]
}

export interface PublishedNutrition {
  serving: string | null
  calories_kcal: number | null
  protein_g: number | null
  carbohydrates_g: number | null
  fat_g: number | null
}

export interface Recommendation {
  dish_id: string
  name: string
  venue_name: string
  meal_period: MealPeriod
  description?: string | null
  dietary_labels?: string[]
  allergens_published?: string[]
  price: { amount: number | null; model: string | null }
  nutrition: {
    /** 'confirmed' when the venue published the figures, otherwise 'unavailable'. */
    confidence: string
    published: PublishedNutrition | null
  }
  /** Straight-line miles from the planning location; absent on campus. */
  distance_miles?: number | null
  why: string[]
}

export interface PlanPeriod {
  meal_period: MealPeriod
  recommendations: Recommendation[]
  count: number
  notes: string[]
  locked?: boolean
}

export interface DayPlan {
  mode: Mode
  menu: { menu_date: string | null; source_url: string | null; source_note: string | null }
  periods: PlanPeriod[]
  limitations: string[]
}

export interface MenuCatalog {
  venues: { venue_id: string; name: string; cuisines?: string[] }[]
  dish_count: number
}
