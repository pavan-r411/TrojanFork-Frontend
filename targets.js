// Daily calorie and macro targets from onboarding body stats.
// Pure functions, no network: the same answer online and offline.
// Output mirrors POST /v1/profile/targets so the existing app code can consume it unchanged.

const LB_PER_KG = 2.2046226;
const KCAL_PER_LB = 3500;
const ACTIVITY = { 'Mostly sitting': 1.2, Light: 1.375, Moderate: 1.55, 'Very active': 1.725 };
const LOSS_LB_PER_WEEK = { Gentle: 0.5, Steady: 1, Fast: 1.5 };
const GAIN_LB_PER_WEEK = { Gentle: 0.5, Steady: 0.75, Fast: 1 };
const MAX_WEEKLY_LOSS_SHARE = 0.01; // never plan more than 1% of body weight per week
const MUSCLE_SURPLUS = 200;
const MIN_ADULT_AGE = 18; // weight-change plans are for adults only
const MIN_HEALTHY_BMI = 18.5;
const PROTEIN_G_PER_LB = { balanced: 0.7, maintain: 0.7, lose: 0.9, gain: 0.8, muscle: 1, training: 0.9 };
const FAT_SHARE = 0.28;
const MAX_PROTEIN_SHARE = 0.35;
const AGE_RANGE_MIDPOINT = { '18–20': 19, '21–24': 22, '25–29': 27, '30+': 32 };

const GOALS = {
  'Eat balanced meals': 'balanced',
  'Maintain weight': 'maintain',
  'Gradually lose weight': 'lose',
  'Gradually gain weight': 'gain',
  'Build muscle': 'muscle',
  'Fuel training': 'training',
};

const round10 = n => Math.round(n / 10) * 10;
const num = v => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const calorieFloor = sex => (sex === 'Male' ? 1500 : sex === 'Female' ? 1200 : 1350);

export const kgToLb = kg => kg * LB_PER_KG;
export const lbToKg = lb => lb / LB_PER_KG;
export const ftInToCm = (ft, inches) => (ft * 12 + inches) * 2.54;
export const cmToFtIn = cm => {
  const totalIn = cm / 2.54;
  let ft = Math.floor(totalIn / 12);
  let inches = Math.round((totalIn - ft * 12) * 10) / 10;
  if (inches >= 12) { ft += 1; inches = 0; }
  return { ft, inches };
};
export const ageRangeFor = years => (years == null ? '' : years <= 20 ? '18–20' : years <= 24 ? '21–24' : years <= 29 ? '25–29' : '30+');

/** Lowest goal weight the app plans toward, from a BMI of 18.5. */
export const minGoalWeightKg = heightCm => MIN_HEALTHY_BMI * (heightCm / 100) ** 2;

function unavailable(goalKey, note, inputs) {
  return {
    nutrition_goal_normalized: goalKey,
    confidence: 'unavailable',
    method: null,
    note,
    targets: { calories_kcal: null, protein_g: null, carbohydrates_g: null, fat_g: null },
    details: { notes: [] },
    inputs_used: inputs,
  };
}

/**
 * @param {{goal?:string, sex?:string, ageYears?:number|string, age?:string, activity?:string,
 *   height?:number|string, weight?:number|string, goalWeight?:number|string, pace?:string}} profile
 *   height in cm, weights in kg (the app stores metric and converts for display).
 */
export function computeTargets(profile = {}) {
  const goalKey = GOALS[profile.goal] || 'balanced';
  const heightCm = num(profile.height);
  const weightKg = num(profile.weight);
  const sex = profile.sex === 'Male' || profile.sex === 'Female' ? profile.sex : '';
  const notes = [];

  let age = num(profile.ageYears);
  let ageAssumed = false;
  if (age == null || age < 14 || age > 99) {
    age = AGE_RANGE_MIDPOINT[profile.age] ?? 21;
    ageAssumed = true;
    notes.push(`Age assumed to be ${age}. Add your age for a closer estimate.`);
  }

  const inputs = { height_cm: heightCm, weight_kg: weightKg, goal_weight_kg: num(profile.goalWeight), sex: sex || null, age_years: age, age_assumed: ageAssumed };
  if (heightCm == null || weightKg == null) return unavailable(goalKey, 'Add height and weight to estimate daily targets.', inputs);
  if (heightCm < 60 || heightCm > 250 || weightKg < 20 || weightKg > 350) return unavailable(goalKey, 'Height or weight is outside the range we can estimate.', inputs);

  const factor = ACTIVITY[profile.activity];
  if (!factor) notes.push('Activity assumed to be moderate. Pick an activity level for a closer estimate.');
  const activityFactor = factor ?? 1.55;
  if (!sex) notes.push('Sex not given, so we used a middle value between the two standard equations.');

  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  const resting = sex === 'Male' ? base + 5 : sex === 'Female' ? base - 161 : base - 78;
  const maintenance = resting * activityFactor;
  const weightLb = kgToLb(weightKg);
  const adult = age >= MIN_ADULT_AGE;
  const pace = profile.pace in LOSS_LB_PER_WEEK ? profile.pace : 'Steady';

  let calories = maintenance;
  let heldAtFloor = false;
  let paceCapped = false;

  if (goalKey === 'lose' && adult) {
    const wanted = LOSS_LB_PER_WEEK[pace];
    const allowed = Math.min(wanted, weightLb * MAX_WEEKLY_LOSS_SHARE);
    paceCapped = allowed < wanted;
    const target = maintenance - (allowed * KCAL_PER_LB) / 7;
    const floor = Math.min(calorieFloor(sex), maintenance);
    heldAtFloor = target < floor;
    calories = Math.max(target, floor);
    if (paceCapped) notes.push('Pace lowered to stay within 1% of your body weight per week.');
    if (heldAtFloor) notes.push(`Held at ${floor} kcal, the lowest daily budget we suggest.`);
  } else if (goalKey === 'gain' && adult) {
    calories = maintenance + (GAIN_LB_PER_WEEK[pace] * KCAL_PER_LB) / 7;
  } else if (goalKey === 'muscle') {
    calories = maintenance + MUSCLE_SURPLUS;
  } else if ((goalKey === 'lose' || goalKey === 'gain') && !adult) {
    notes.push('Weight-change plans are for adults 18 and over, so this is a maintenance estimate.');
  }

  calories = round10(calories);
  const weeklyChangeLb = ((calories - round10(maintenance)) * 7) / KCAL_PER_LB;

  let weeksToGoal = null;
  let goalKg = num(profile.goalWeight);
  if (goalKg != null && (goalKey === 'lose' || goalKey === 'gain') && adult) {
    const minKg = minGoalWeightKg(heightCm);
    if (goalKg < minKg) {
      goalKg = minKg;
      notes.push(`Goal weight is below a BMI of ${MIN_HEALTHY_BMI}, so we plan toward ${Math.ceil(kgToLb(minKg))} lb.`);
    }
    const remainingLb = kgToLb(goalKg) - weightLb;
    if (weeklyChangeLb !== 0 && Math.sign(remainingLb) === Math.sign(weeklyChangeLb)) weeksToGoal = Math.ceil(remainingLb / weeklyChangeLb);
    else if (Math.abs(remainingLb) > 0.5) notes.push('Your goal weight points the other way from this goal, so no timeline is shown.');
  }

  const proteinG = Math.round(Math.min(weightLb * PROTEIN_G_PER_LB[goalKey], (calories * MAX_PROTEIN_SHARE) / 4));
  const fatG = Math.round((calories * FAT_SHARE) / 9);
  const carbsG = Math.max(0, Math.round((calories - proteinG * 4 - fatG * 9) / 4));

  return {
    nutrition_goal_normalized: goalKey,
    confidence: 'estimated',
    method: 'mifflin_st_jeor_trojanplate',
    note: 'Estimated daily targets for planning only. Not medical advice. Dish nutrition is never invented from these numbers.',
    targets: { calories_kcal: calories, protein_g: proteinG, carbohydrates_g: carbsG, fat_g: fatG },
    details: {
      maintenance_kcal: round10(maintenance),
      weekly_change_lb: Math.round(weeklyChangeLb * 100) / 100,
      weeks_to_goal: weeksToGoal,
      held_at_floor: heldAtFloor,
      pace_capped: paceCapped,
      notes,
    },
    inputs_used: inputs,
  };
}
