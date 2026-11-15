import assert from 'node:assert/strict';
import { computeTargets, cmToFtIn, ftInToCm, kgToLb, lbToKg, ageRangeFor, minGoalWeightKg } from '../targets.js';

const base = { sex: 'Female', ageYears: 21, activity: 'Moderate', height: 165, weight: 60 };
const t = p => computeTargets({ ...base, ...p });

// Reference values worked out by hand from Mifflin-St Jeor.
{
  const r = t({ goal: 'Gradually lose weight', pace: 'Steady' });
  assert.equal(r.confidence, 'estimated');
  assert.equal(r.details.maintenance_kcal, 2120);
  assert.equal(r.targets.calories_kcal, 1620);
  assert.equal(r.targets.protein_g, 119);
  assert.equal(r.targets.fat_g, 50);
}
// Missing body stats: unavailable, never a made-up number.
assert.equal(computeTargets({ goal: 'Maintain weight' }).confidence, 'unavailable');
assert.equal(computeTargets({ goal: 'Maintain weight', height: 170 }).targets.calories_kcal, null);
// Out-of-range input is refused.
assert.equal(computeTargets({ height: 20, weight: 60 }).confidence, 'unavailable');
// Goals move calories the right way.
const maintain = t({ goal: 'Maintain weight' }).targets.calories_kcal;
assert.equal(t({ goal: 'Eat balanced meals' }).targets.calories_kcal, maintain);
assert.equal(t({ goal: 'Fuel training' }).targets.calories_kcal, maintain);
assert.ok(t({ goal: 'Gradually lose weight', pace: 'Steady' }).targets.calories_kcal < maintain);
assert.ok(t({ goal: 'Gradually gain weight', pace: 'Steady' }).targets.calories_kcal > maintain);
assert.equal(t({ goal: 'Build muscle' }).targets.calories_kcal, maintain + 200);
// Faster pace means a bigger change.
assert.ok(t({ goal: 'Gradually lose weight', pace: 'Fast' }).targets.calories_kcal <= t({ goal: 'Gradually lose weight', pace: 'Gentle' }).targets.calories_kcal);
assert.ok(t({ goal: 'Gradually gain weight', pace: 'Fast' }).targets.calories_kcal > t({ goal: 'Gradually gain weight', pace: 'Gentle' }).targets.calories_kcal);
// Safety floor and weekly cap.
{
  const small = computeTargets({ goal: 'Gradually lose weight', pace: 'Fast', sex: 'Female', ageYears: 20, activity: 'Light', height: 150, weight: 45 });
  assert.ok(small.targets.calories_kcal >= 1200, 'never below the female floor');
  assert.ok(small.details.pace_capped || small.details.held_at_floor);
  const male = computeTargets({ goal: 'Gradually lose weight', pace: 'Fast', sex: 'Male', ageYears: 20, activity: 'Light', height: 160, weight: 50 });
  assert.ok(male.targets.calories_kcal >= 1500);
}
// Weight-change plans are adults only.
{
  const minor = computeTargets({ ...base, ageYears: 16, goal: 'Gradually lose weight', pace: 'Fast' });
  assert.equal(minor.targets.calories_kcal, maintain + (computeTargets({ ...base, ageYears: 16, goal: 'Maintain weight' }).targets.calories_kcal - maintain));
  assert.ok(minor.details.notes.some(n => n.includes('adults')));
}
// Goal weight: timeline only when it points the same way; clamped at BMI 18.5.
{
  const ok = t({ goal: 'Gradually lose weight', pace: 'Steady', goalWeight: 55 });
  assert.ok(ok.details.weeks_to_goal > 0);
  const wrong = t({ goal: 'Gradually lose weight', pace: 'Steady', goalWeight: 70 });
  assert.equal(wrong.details.weeks_to_goal, null);
  const low = t({ goal: 'Gradually lose weight', pace: 'Steady', goalWeight: 35 });
  assert.ok(low.details.notes.some(n => n.includes('BMI')));
  assert.ok(minGoalWeightKg(165) > 50 && minGoalWeightKg(165) < 52);
}
// Protein never exceeds 35% of calories; macros add back to calories.
for (const goal of ['Eat balanced meals', 'Maintain weight', 'Gradually lose weight', 'Gradually gain weight', 'Build muscle', 'Fuel training']) {
  const r = t({ goal, pace: 'Steady' }).targets;
  assert.ok(r.protein_g * 4 <= r.calories_kcal * 0.35 + 2);
  assert.ok(Math.abs(r.protein_g * 4 + r.carbohydrates_g * 4 + r.fat_g * 9 - r.calories_kcal) <= 12, goal);
}
// Assumptions are disclosed, not hidden.
{
  const r = computeTargets({ goal: 'Maintain weight', height: 170, weight: 65 });
  assert.equal(r.confidence, 'estimated');
  assert.ok(r.details.notes.length >= 2);
  const fromRange = computeTargets({ goal: 'Maintain weight', height: 170, weight: 65, age: '25–29' });
  assert.equal(fromRange.inputs_used.age_years, 27);
}
// Unit helpers round-trip.
assert.ok(Math.abs(lbToKg(kgToLb(70)) - 70) < 1e-9);
{ const { ft, inches } = cmToFtIn(175); assert.equal(ft, 5); assert.ok(Math.abs(ftInToCm(ft, inches) - 175) < 0.2); }
assert.deepEqual(cmToFtIn(182.88), { ft: 6, inches: 0 });
assert.equal(ageRangeFor(19), '18–20'); assert.equal(ageRangeFor(24), '21–24'); assert.equal(ageRangeFor(27), '25–29'); assert.equal(ageRangeFor(40), '30+'); assert.equal(ageRangeFor(null), '');
console.log('PASS: calorie and macro targets (reference values, goals, pace, floors, adult-only, goal-weight timeline, disclosed assumptions, unit helpers).');
