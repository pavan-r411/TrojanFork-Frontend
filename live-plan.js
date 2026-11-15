import { known, total } from './nutrition.js';

/** Seed each unlocked empty slot with its first recommendation so "On your plate" reflects the daily plan. */
export function seedDefaultSelections(plan) {
  for (const slot of plan.slots || []) {
    if (slot.locked || slot.selected_recommendation_id) continue;
    const first = slot.recommendations?.[0];
    if (first) slot.selected_recommendation_id = first.id;
  }
  return plan;
}

export function recalculatePlan(plan, context = {}) {
  const selected=plan.slots.flatMap(slot=>slot.recommendations.filter(item=>item.id===slot.selected_recommendation_id));
  const cost=total(selected,'price_cents');
  plan.summary.total_cost_cents=cost;
  plan.summary.remaining_budget_cents=cost===null || !known(context.daily_budget_cents)?null:Math.max(0,context.daily_budget_cents-cost);
  plan.summary.swipes_used=plan.mode==='usc_dining'?selected.length:0;
  plan.summary.remaining_swipes=Math.max(0,(context.meal_swipes_available ?? 0)-plan.summary.swipes_used);
  const calories=total(selected.map(x=>x.nutrition),'calories');
  const protein=total(selected.map(x=>x.nutrition),'protein_g');
  const hasEstimates=selected.some(item=>item.nutrition.status==='estimated');
  const hasUnknown=selected.some(item=>item.nutrition.status==='unknown' || item.nutrition.calories==null);
  plan.summary.nutrition={
    calories,
    protein_g:protein,
    coverage: selected.length===0
      ? 'No meals selected'
      : hasEstimates
        ? 'Planned totals include AI estimates (midpoints); actual nutrition may differ. Tax/fees excluded from cash.'
        : hasUnknown
          ? 'Planned totals use published values only; missing nutrients stay unknown (not zero). Tax/fees excluded from cash.'
          : 'Planned totals from published values. Tax/fees excluded from cash.',
  };
  plan.summary.cash_subtotal_cents=plan.mode==='off_campus'?cost:null;
  plan.summary.budget_excludes_tax_fees=true;
  plan.summary.nutrition_label='planned';
  plan.client_context=context;
  return plan;
}

export function preserveLocked(plan,previous,ids=[]) {
  for (const slot of plan.slots) {
    const old=previous?.slots.find(x=>x.slot===slot.slot);
    const item=old?.recommendations.find(x=>x.id===old.selected_recommendation_id);
    if(item && ids.includes(item.id)) {
      slot.recommendations=[structuredClone(item),...slot.recommendations.filter(x=>x.id!==item.id)].slice(0,3);
      slot.selected_recommendation_id=item.id;slot.locked=true;
      slot.availability_note='Locked choice retained from this browser session; availability has not been refreshed.';
    }
  }
  return plan;
}

export function selectInPlan(body) {
  const plan=structuredClone(body.plan_state);
  if(plan.plan_id!==body.plan_id)throw new Error('The plan has changed. Please reload the recommendations.');
  const slot=plan.slots.find(x=>x.slot===body.slot);
  if(!slot || slot.locked || body.locked_meal_ids.includes(slot.selected_recommendation_id))throw new Error('Unlock this meal before changing it.');
  if(!slot.recommendations.some(x=>x.id===body.selected_recommendation_id))throw new Error('This recommendation is unavailable.');
  slot.selected_recommendation_id=body.selected_recommendation_id;
  plan.changes='Planned meal updated. Log it when you eat.';
  return recalculatePlan(plan,plan.client_context);
}

/** Preview swap impact without mutating the saved plan. */
export function previewSwap(plan, slotName, recommendationId, context = plan.client_context || {}) {
  const current=structuredClone(plan);
  const before=recalculatePlan(structuredClone(plan), context);
  const slot=current.slots.find(x=>x.slot===slotName);
  if(!slot) throw new Error('Unknown meal slot.');
  if(slot.locked) throw new Error('Unlock this meal before changing it.');
  const next=slot.recommendations.find(x=>x.id===recommendationId);
  if(!next) throw new Error('This recommendation is unavailable.');
  const previous=slot.recommendations.find(x=>x.id===slot.selected_recommendation_id) || null;
  slot.selected_recommendation_id=recommendationId;
  const after=recalculatePlan(current, context);
  const delta=(a,b)=> (a==null || b==null) ? null : b-a;
  return {
    slot: slotName,
    from: previous ? { id: previous.id, title: previous.meal_title, venue: previous.venue?.name, calories: previous.nutrition?.calories ?? null, protein_g: previous.nutrition?.protein_g ?? null, price_cents: previous.price_cents } : null,
    to: { id: next.id, title: next.meal_title, venue: next.venue?.name, calories: next.nutrition?.calories ?? null, protein_g: next.nutrition?.protein_g ?? null, price_cents: next.price_cents },
    before: before.summary,
    after: after.summary,
    delta: {
      calories: delta(before.summary.nutrition.calories, after.summary.nutrition.calories),
      protein_g: delta(before.summary.nutrition.protein_g, after.summary.nutrition.protein_g),
      cash_cents: delta(before.summary.total_cost_cents, after.summary.total_cost_cents),
      swipes: after.summary.swipes_used - before.summary.swipes_used,
      restaurant_changed: (previous?.venue?.name || null) !== next.venue?.name,
    },
    notes: [
      'Totals are planned, not eaten, until you log a meal.',
      'Cash comparisons use menu prices and exclude tax/fees.',
      'Unknown calories or protein stay unknown and cannot prove a nutrition target.',
    ],
  };
}
