// App state, persistence and the day-planning arithmetic. No DOM here, so it can be tested in Node.
import { computeTargets } from './targets.js';

export const STORE_KEY = 'trojanfork-v2';
const SETUP_REV = 4; // bump when a default changes meaning, so saved setups pick up the new default once
export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
export const MEAL_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
export const FULL_DAY = ['breakfast', 'lunch', 'dinner'];
const KCAL_SHARE = { breakfast: 0.25, lunch: 0.35, dinner: 0.4 };
const SNACK_KCAL = 200;
const DEFAULT_DAILY = { calories_kcal: 2000, protein_g: 100 };

export const GOALS = [
  { key: 'Eat balanced meals', label: 'Eat balanced', sub: 'Steady energy, no tracking pressure' },
  { key: 'Gradually lose weight', label: 'Lose weight gradually', sub: 'A modest daily deficit' },
  { key: 'Gradually gain weight', label: 'Gain weight gradually', sub: 'A modest daily surplus' },
  { key: 'Build muscle', label: 'Build muscle', sub: 'Higher protein, small surplus' },
  { key: 'Fuel training', label: 'Fuel training', sub: 'Enough carbs and protein to perform' },
  { key: 'Maintain weight', label: 'Maintain weight', sub: 'Stay where you are' },
];
export const DIETS = [['any', 'No restriction'], ['vegetarian', 'Vegetarian'], ['vegan', 'Vegan'], ['pescatarian', 'Pescatarian'], ['halal', 'Halal']];
export const ALLERGENS = ['Peanuts', 'Tree nuts', 'Dairy', 'Eggs', 'Gluten', 'Soy', 'Fish', 'Shellfish', 'Sesame'];
export const CUISINES = ['Indian', 'Mexican', 'Chinese', 'Korean', 'Japanese', 'Thai', 'Italian', 'Mediterranean', 'American'];
export const ORIGINS = [
  { label: 'USC Village', lat: 34.0258, lng: -118.2854 },
  { label: 'Tommy Trojan', lat: 34.0206, lng: -118.2854 },
  { label: 'Leavey Library', lat: 34.0217, lng: -118.2829 },
];

// Walking bands, in miles. Together they reach every restaurant (the farthest is about 1.1 mi from campus), so nobody is left
// out for being far. All three are on by default, and a student can turn bands off to stay closer.
export const DISTANCE_BANDS = [
  { key: 'b1', min: 0, max: 0.3, label: 'Up to 0.3 mi' },
  { key: 'b2', min: 0.3, max: 0.5, label: '0.3 to 0.5 mi' },
  { key: 'b3', min: 0.5, max: 1.5, label: '0.5 to 1.5 mi' },
];

// Sorts reorder the whole list of dishes that passed the rules. Cheapest is meaningless in dining halls (one swipe each).
export const SORTS = {
  usc_dining: [['fit', 'Best fit', 'Best fit for your targets'], ['nearest', 'Closest', 'Closest dining hall first'], ['protein', 'Protein', 'Most protein first'], ['lighter', 'Lighter', 'Fewest calories first']],
  off_campus: [['fit', 'Best fit', 'Best fit for your targets'], ['nearest', 'Closest', 'Shortest walk first'], ['cheapest', 'Cheapest', 'Lowest price first'], ['protein', 'Protein', 'Most protein first']],
};
export const validSort = (mode, sort) => (SORTS[mode] || SORTS.usc_dining).some(([k]) => k === sort) ? sort : 'fit';

const ENGINE_GOAL = { balanced: 'balanced', maintain: 'maintain', lose: 'lose', gain: 'gain', muscle: 'gain', training: 'balanced' };

export const emptyProfile = () => ({
  goal: 'Eat balanced meals', units: 'us', sex: '', ageYears: '', heightCm: '', weightKg: '', goalWeightKg: '', activity: '', pace: 'Steady',
  diet: 'any', allergies: [], otherAllergies: '', dislikes: '', snacks: false,
});

export const defaultSetup = () => ({
  mode: 'usc_dining', meal: suggestMeal(), fullDay: false, swipes: 5, perMeal: 15, daily: 45, bands: DISTANCE_BANDS.map(b => b.key),
  origin: { ...ORIGINS[0] }, cuisines: [], rankBy: 'fit', rev: SETUP_REV,
});

export function suggestMeal(now = new Date()) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes < 630 ? 'breakfast' : minutes < 900 ? 'lunch' : 'dinner';
}

export const localDate = (d = new Date()) => d.toLocaleDateString('en-CA');

export function freshStore() {
  return { v: 2, profile: null, setup: defaultSetup(), day: { date: localDate(), picks: {}, order: [] }, guest: false, onboarded: false };
}

export function loadStore(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage.getItem(STORE_KEY));
    if (saved?.v === 2) {
      const store = { ...freshStore(), ...saved };
      store.setup = { ...defaultSetup(), ...saved.setup };
      if (saved.setup?.rev !== SETUP_REV) Object.assign(store.setup, { bands: defaultSetup().bands, rankBy: defaultSetup().rankBy, rev: SETUP_REV });
      delete store.setup.miles;
      if (store.day?.date !== localDate()) store.day = { date: localDate(), picks: {}, order: [] };
      return store;
    }
  } catch { /* corrupt or unavailable storage: start fresh */ }
  return freshStore();
}

export function saveStore(store, storage = globalThis.localStorage) {
  try { storage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* private mode: keep going in memory */ }
}

export const allAllergies = profile => [...(profile.allergies || []), ...String(profile.otherAllergies || '').split(/[,\n]/).map(x => x.trim()).filter(Boolean)];
export const allDislikes = profile => String(profile.dislikes || '').split(/[,\n]/).map(x => x.trim()).filter(Boolean);

/** Daily kcal/protein targets from the profile; a labelled generic day when body stats are missing. */
export function dailyTargets(profile, pace = profile?.pace) {
  if (!profile) return { ...DEFAULT_DAILY, source: 'default', result: null };
  const result = computeTargets({ ...profile, height: profile.heightCm, weight: profile.weightKg, goalWeight: profile.goalWeightKg, pace });
  if (result.confidence === 'estimated') return { calories_kcal: result.targets.calories_kcal, protein_g: result.targets.protein_g, source: 'estimated', result };
  return { ...DEFAULT_DAILY, source: 'default', result };
}

export const engineGoal = profile => ENGINE_GOAL[computeTargets({ goal: profile?.goal }).nutrition_goal_normalized] || 'balanced';

export const picksList = day => day.order.filter(m => day.picks[m]).map(m => ({ meal: m, ...day.picks[m] }));

export function totals(day) {
  const picks = picksList(day);
  const sum = key => picks.reduce((acc, p) => acc + (Number.isFinite(p[key]) ? p[key] : 0), 0);
  return {
    kcal: sum('kcal'), protein: sum('protein'), cashCents: sum('cashCents'), swipes: picks.filter(p => p.priceKind === 'swipe').length,
    unknownKcal: picks.filter(p => !Number.isFinite(p.kcal)).length,
  };
}

/** The meals still to plan, in eating order. */
export function mealsToPlan(setup, day) {
  const list = setup.fullDay ? FULL_DAY : [setup.meal];
  return list.filter(m => !day.picks[m]);
}

/** Calorie and protein target for one meal, given what is already picked and what is still to plan. */
export function mealTarget(meal, setup, day, daily) {
  if (meal === 'snack') return { kcal: SNACK_KCAL, protein: Math.round(daily.protein_g * 0.08) };
  const planned = FULL_DAY; // a day always has three meals to spread calories over, whichever one is searched now
  const left = planned.filter(m => m === meal || !day.picks[m]);
  const shareLeft = left.reduce((acc, m) => acc + KCAL_SHARE[m], 0);
  const pickedKcal = planned.filter(m => m !== meal && day.picks[m]).reduce((acc, m) => acc + (day.picks[m].kcal || 0), 0);
  const pickedProtein = planned.filter(m => m !== meal && day.picks[m]).reduce((acc, m) => acc + (day.picks[m].protein || 0), 0);
  const kcalPool = Math.max(daily.calories_kcal - pickedKcal - (day.picks.snack?.kcal || 0), 250);
  const proteinPool = Math.max(daily.protein_g - pickedProtein, 15);
  const share = KCAL_SHARE[meal] / shareLeft;
  return { kcal: Math.round((kcalPool * share) / 10) * 10, protein: Math.round(proteinPool * share) };
}

/** Cash budget left for the rest of the day (off campus), or null when no daily budget is set. */
export function dailyRemaining(setup, day) {
  if (setup.mode !== 'off_campus' || !Number.isFinite(setup.daily)) return null;
  const spentOtherMeals = totals(day).cashCents / 100;
  return Math.max(0, Math.round((setup.daily - spentOtherMeals) * 100) / 100);
}

export const money = cents => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

/** The walking bands to send: a distance typed in plain words wins, otherwise the chosen bands (never none). */
export function bandsFor(setup, overrides = {}) {
  if (Number.isFinite(overrides.maxMiles)) return [{ min: 0, max: overrides.maxMiles }];
  const chosen = DISTANCE_BANDS.filter(b => (setup.bands || []).includes(b.key));
  return (chosen.length ? chosen : DISTANCE_BANDS).map(({ min, max }) => ({ min, max }));
}

/** Request body for POST /v1/flow/options. `overrides` holds anything the student typed in plain words. */
export function buildOptionsBody(store, meal, { rankBy, excludeIds = [], avoidVenueIds = [], overrides = {} } = {}) {
  const { profile, setup, day } = store;
  const daily = dailyTargets(profile);
  const target = mealTarget(meal, setup, day, daily);
  const diet = profile.diet !== 'any' ? profile.diet : (overrides.diet || 'any');
  const left = mealsToPlan(setup, day).filter(m => m !== meal).length + 1;
  const perMeal = Number.isFinite(overrides.perMealUsd) ? Math.min(setup.perMeal, overrides.perMealUsd) : setup.perMeal;
  const body = {
    mode: setup.mode, meal,
    profile: {
      diet, allergies: [...new Set([...allAllergies(profile), ...(overrides.allergies || [])])],
      exclusions: overrides.ignoreDislikes ? [] : [...new Set([...allDislikes(profile), ...(overrides.exclusions || [])])],
      goal: engineGoal(profile), preferred_cuisines: setup.mode === 'off_campus' ? (overrides.cuisines?.length ? overrides.cuisines : setup.cuisines).map(c => c.toLowerCase()) : [],
    },
    targets: { meal_kcal: target.kcal, meal_protein_g: target.protein, ...(overrides.maxKcal ? { max_kcal: overrides.maxKcal } : {}), ...(overrides.minProtein && !overrides.dropMinProtein ? { min_protein_g: overrides.minProtein } : {}) },
    budget: setup.mode === 'off_campus' ? { per_meal_usd: perMeal, daily_remaining_usd: dailyRemaining(setup, day), meals_left: Math.min(left, 4) } : { meals_left: Math.min(left, 4) },
    campus: { swipes_remaining: setup.mode === 'usc_dining' ? Math.max(0, setup.swipes - totals(day).swipes) : null, halls: [], include_retail: Boolean(setup.includeRetail) },
    origin: { lat: setup.origin.lat, lng: setup.origin.lng, label: setup.origin.label },
    bands: bandsFor(setup, overrides),
    rank_by: validSort(setup.mode, rankBy || setup.rankBy), exclude_ids: excludeIds, avoid_venue_ids: avoidVenueIds, pool_size: 600,
  };
  if (setup.mode === 'usc_dining') delete body.budget.per_meal_usd;
  return body;
}

/** Compact record of a chosen option, kept in the day plan. */
export function snapshotPick(option, meal) {
  const cents = option.price?.kind === 'cash' ? option.price.cash_cents || 0 : 0;
  return {
    id: option.id, name: option.name, subtitle: option.subtitle || '', venue: option.venue.name, venueId: option.venue.id, venueKind: option.venue.kind,
    kcal: option.nutrition?.calories ?? null, protein: option.nutrition?.protein_g ?? null, nutritionStatus: option.nutrition?.status,
    priceKind: option.price?.kind, cashCents: cents, priceLabel: option.price?.label, walkMinutes: option.walk?.minutes ?? null, meal,
  };
}
