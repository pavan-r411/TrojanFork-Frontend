import type { Activity, Goal, Pace, Sex } from './profile'

export const LB_PER_KG = 2.2046226
const KCAL_PER_LB = 3500

export const kgToLb = (kg: number) => kg * LB_PER_KG
export const lbToKg = (lb: number) => lb / LB_PER_KG
export const ftInToCm = (ft: number, inches: number) => (ft * 12 + inches) * 2.54

const ACTIVITY_FACTOR: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
}

/** Pounds per week each pace aims for. */
const LOSS_LB_PER_WEEK: Record<Pace, number> = { gentle: 0.5, steady: 1, fast: 1.5 }
const GAIN_LB_PER_WEEK: Record<Pace, number> = { gentle: 0.5, steady: 0.75, fast: 1 }

/** Weekly loss is never planned above this share of body weight. */
const MAX_WEEKLY_LOSS_SHARE = 0.01
/** Extra calories for the muscle-support goal, which has no pace. */
const MUSCLE_SURPLUS = 200
/** Weight-change plans are only offered to adults. */
export const MIN_AGE_FOR_WEIGHT_CHANGE = 18
const MIN_HEALTHY_BMI = 18.5

/** Protein target in grams per pound of body weight. */
const PROTEIN_G_PER_LB: Record<Goal, number> = {
  balanced: 0.7,
  maintain: 0.7,
  lose: 0.9,
  gain: 0.8,
  muscle: 1,
}
const FAT_SHARE = 0.28
const MAX_PROTEIN_SHARE = 0.35

export interface BodyInputs {
  sex: Sex
  age: number
  heightCm: number
  weightKg: number
  activity: Activity
}

export interface Budget {
  /** Estimated calories to hold current weight. */
  maintenance: number
  /** Daily calorie budget for the chosen goal and pace. */
  calories: number
  /** Planned change in pounds per week; negative is loss. */
  weeklyChangeLb: number
  /** Whole weeks to reach the goal weight, when one applies and is reachable. */
  weeksToGoal: number | null
  /** True when the pace asked for less than the minimum budget. */
  heldAtFloor: boolean
  /** True when the pace was reduced to stay within 1% of body weight a week. */
  paceCapped: boolean
  proteinG: number
  fatG: number
  carbsG: number
}

/** Mifflin-St Jeor resting energy estimate, kcal per day. */
export function restingEnergy({ sex, age, heightCm, weightKg }: BodyInputs): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  if (sex === 'male') return base + 5
  if (sex === 'female') return base - 161
  return base - 78
}

export function maintenanceCalories(body: BodyInputs): number {
  return restingEnergy(body) * ACTIVITY_FACTOR[body.activity]
}

export function calorieFloor(sex: Sex): number {
  if (sex === 'male') return 1500
  if (sex === 'female') return 1200
  return 1350
}

/** Lowest goal weight the app will plan toward, from a BMI of 18.5. */
export function minGoalWeightKg(heightCm: number): number {
  const m = heightCm / 100
  return MIN_HEALTHY_BMI * m * m
}

const round10 = (n: number) => Math.round(n / 10) * 10

export function computeBudget(
  body: BodyInputs,
  goal: Goal,
  pace: Pace,
  goalWeightKg: number | null,
): Budget {
  const maintenance = maintenanceCalories(body)
  const weightLb = kgToLb(body.weightKg)
  const adult = body.age >= MIN_AGE_FOR_WEIGHT_CHANGE

  let calories = maintenance
  let heldAtFloor = false
  let paceCapped = false

  if (goal === 'lose' && adult) {
    const wanted = LOSS_LB_PER_WEEK[pace]
    const allowed = Math.min(wanted, weightLb * MAX_WEEKLY_LOSS_SHARE)
    paceCapped = allowed < wanted
    const target = maintenance - (allowed * KCAL_PER_LB) / 7
    const floor = Math.min(calorieFloor(body.sex), maintenance)
    heldAtFloor = target < floor
    calories = Math.max(target, floor)
  } else if (goal === 'gain' && adult) {
    calories = maintenance + (GAIN_LB_PER_WEEK[pace] * KCAL_PER_LB) / 7
  } else if (goal === 'muscle') {
    calories = maintenance + MUSCLE_SURPLUS
  }

  calories = round10(calories)
  const weeklyChangeLb = ((calories - round10(maintenance)) * 7) / KCAL_PER_LB

  let weeksToGoal: number | null = null
  if (goalWeightKg !== null && (goal === 'lose' || goal === 'gain') && adult) {
    const remainingLb = kgToLb(goalWeightKg) - weightLb
    if (weeklyChangeLb !== 0 && Math.sign(remainingLb) === Math.sign(weeklyChangeLb)) {
      weeksToGoal = Math.ceil(remainingLb / weeklyChangeLb)
    }
  }

  const proteinG = Math.round(
    Math.min(weightLb * PROTEIN_G_PER_LB[goal], (calories * MAX_PROTEIN_SHARE) / 4),
  )
  const fatG = Math.round((calories * FAT_SHARE) / 9)
  const carbsG = Math.max(0, Math.round((calories - proteinG * 4 - fatG * 9) / 4))

  return {
    maintenance: round10(maintenance),
    calories,
    weeklyChangeLb,
    weeksToGoal,
    heldAtFloor,
    paceCapped,
    proteinG,
    fatG,
    carbsG,
  }
}
