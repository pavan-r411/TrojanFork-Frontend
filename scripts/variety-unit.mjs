import assert from 'node:assert/strict';
import { getOptions } from '../menu.js';
import { seedDefaultSelections, recalculatePlan, previewSwap, selectInPlan } from '../live-plan.js';

function slot(name, restaurants) {
  return {
    slot: name,
    optional: false,
    locked: false,
    selected_recommendation_id: null,
    recommendations: restaurants.map((venue, index) => ({
      id: `${name}-${venue}-${index}`,
      rank: index + 1,
      meal_title: `${venue} ${name}`,
      venue: { id: venue, name: venue, type: 'restaurant' },
      price_cents: 1000 + index * 100,
      nutrition: { calories: 500, protein_g: 25, carbs_g: 40, fat_g: 15, status: 'published' },
      source: { status: 'needs_verification', url: '', menu_date: '2026-11-15' },
      reason: 'unit',
      dietary_tags: [],
    })),
  };
}

const plan = {
  plan_id: 'unit',
  mode: 'off_campus',
  date: '2026-11-15',
  generated_at: new Date().toISOString(),
  summary: { total_cost_cents: 0, remaining_budget_cents: 4200, swipes_used: 0, remaining_swipes: 0, nutrition: { calories: 0, protein_g: 0, coverage: 'No meals selected' } },
  slots: [
    slot('breakfast', ['Cafe A', 'Cafe B', 'Cafe C']),
    slot('lunch', ['Bowl A', 'Bowl B', 'Bowl C']),
    slot('dinner', ['Grill A', 'Grill B', 'Grill C']),
  ],
  warnings: [],
};

const breakfast = getOptions('nearby', 'Breakfast', {}, { livePlan: plan });
const lunch = getOptions('nearby', 'Lunch', {}, { livePlan: plan });
const dinner = getOptions('nearby', 'Dinner', {}, { livePlan: plan });
assert.equal(breakfast.length, 3);
assert.equal(lunch.length, 3);
assert.equal(dinner.length, 3);
assert.notDeepEqual(breakfast.map(x => x.id), lunch.map(x => x.id));
assert.notDeepEqual(lunch.map(x => x.id), dinner.map(x => x.id));
assert.ok(breakfast.every(x => x.meal === 'Breakfast'));
assert.ok(lunch.every(x => x.meal === 'Lunch'));

seedDefaultSelections(plan);
recalculatePlan(plan, { daily_budget_cents: 4200, meal_swipes_available: 0 });
assert.equal(plan.slots[0].selected_recommendation_id, 'breakfast-Cafe A-0');
assert.equal(plan.slots[1].selected_recommendation_id, 'lunch-Bowl A-0');
assert.equal(plan.slots[2].selected_recommendation_id, 'dinner-Grill A-0');
assert.equal(plan.summary.total_cost_cents, 3000);
assert.equal(plan.summary.remaining_budget_cents, 1200);
assert.equal(plan.summary.nutrition.calories, 1500);

const preview = previewSwap(plan, 'lunch', 'lunch-Bowl B-1', { daily_budget_cents: 4200 });
assert.equal(preview.delta.restaurant_changed, true);
assert.equal(preview.after.total_cost_cents, 3100);

const swapped = selectInPlan({
  plan_id: plan.plan_id,
  slot: 'lunch',
  selected_recommendation_id: 'lunch-Bowl B-1',
  locked_meal_ids: ['breakfast-Cafe A-0'],
  plan_state: plan,
});
assert.equal(swapped.slots[1].selected_recommendation_id, 'lunch-Bowl B-1');
assert.equal(swapped.slots[0].selected_recommendation_id, 'breakfast-Cafe A-0');
assert.equal(swapped.summary.total_cost_cents, 3100);

console.log('PASS: meal slots stay separate, defaults seed the summary, swaps keep other meals and totals.');
