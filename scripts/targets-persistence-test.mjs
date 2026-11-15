import assert from 'node:assert/strict';
import { remaining, progress, hasAnyTarget } from '../nutrition.js';
import {
  daily,
  setTargets,
  readPreferredTargets,
  rememberPreferredTargets,
  clear,
  updatePlan,
  log,
} from '../nutrition-local.js';

// jsdom-free: provide minimal web storage for Node.
const store = new Map();
const memoryStorage = {
  getItem: key => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => { store.set(String(key), String(value)); },
  removeItem: key => { store.delete(String(key)); },
  clear: () => store.clear(),
  key: i => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};
globalThis.sessionStorage = memoryStorage;
globalThis.localStorage = memoryStorage;

const date = '2026-11-15';
clear();

assert.equal(hasAnyTarget({ calories: null, protein_g: null, carbs_g: null, fat_g: null }), false);
assert.equal(remaining(2000, 925), 1075);
assert.equal(progress(24, 100), 24);
assert.equal(remaining(2000, 2100), -100);
assert.equal(remaining(null, 925), null);

const manual = setTargets(date, { calories: 2000, protein_g: 100, carbs_g: 220, fat_g: 65 }, { source: 'manual' });
assert.equal(manual.targets.calories, 2000);
assert.equal(readPreferredTargets().source, 'manual');

// Profile estimate must not overwrite remembered manual preferred targets.
rememberPreferredTargets({ calories: 1800, protein_g: 90, carbs_g: 200, fat_g: 60 }, { source: 'profile_estimate' });
assert.equal(readPreferredTargets().targets.calories, 2000);
assert.equal(readPreferredTargets().source, 'manual');

clear();
setTargets(date, { calories: 2454, protein_g: 124, carbs_g: 269, fat_g: 98 }, { source: 'profile_estimate' });
assert.equal(readPreferredTargets().source, 'profile_estimate');

// New date inherits preferred targets when unset.
const next = daily('2026-11-16');
assert.equal(next.targets.calories, 2454);
assert.equal(next.targets_source, 'profile_estimate');

// Planned stays 0 with no selections; incomplete (null) when a selected meal lacks calories.
clear();
setTargets(date, { calories: 2000, protein_g: 100, carbs_g: null, fat_g: null }, { source: 'manual' });
const emptyPlan = updatePlan({ date, mode: 'usc_dining', slots: [] });
assert.equal(emptyPlan.planned.calories, 0);

const withGap = updatePlan({
  date,
  mode: 'usc_dining',
  slots: [{
    slot: 'lunch',
    selected_recommendation_id: 'a',
    recommendations: [{ id: 'a', nutrition: { calories: null, protein_g: 20, carbs_g: 30, fat_g: 10, status: 'unknown' }, price_cents: null }],
  }],
});
assert.equal(withGap.planned.calories, null);

const logged = log(
  { date, slot: 'lunch', portion: 1, idempotency_key: 't1' },
  { id: 'a', meal_title: 'Bowl', nutrition: { calories: 925, protein_g: 24, carbs_g: 146, fat_g: 22, status: 'estimated' }, price_cents: null },
);
assert.equal(logged.consumed.calories, 925);
assert.equal(logged.targets.calories, 2000);
assert.equal(remaining(logged.targets.calories, logged.consumed.calories), 1075);

console.log('PASS: target precedence, preferred persistence, planned incompleteness, and remaining arithmetic.');
