import { known, total } from './nutrition.js';
export function recalculatePlan(plan, context = {}) {
  const selected=plan.slots.flatMap(slot=>slot.recommendations.filter(item=>item.id===slot.selected_recommendation_id));
  const cost=total(selected,'price_cents');
  plan.summary.total_cost_cents=cost;
  plan.summary.remaining_budget_cents=cost===null || !known(context.daily_budget_cents)?null:Math.max(0,context.daily_budget_cents-cost);
  plan.summary.swipes_used=plan.mode==='usc_dining'?selected.length:0;
  plan.summary.remaining_swipes=Math.max(0,(context.meal_swipes_available ?? 0)-plan.summary.swipes_used);
  plan.summary.nutrition={calories:total(selected.map(x=>x.nutrition),'calories'),protein_g:total(selected.map(x=>x.nutrition),'protein_g'),coverage:selected.some(item=>item.nutrition.status==='estimated')?'Includes AI estimates (midpoints); actual nutrition may differ':'Published values only; missing values remain unknown'};
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
