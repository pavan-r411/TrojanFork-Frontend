// Session-only tracking for live meals. No food catalog or user database.
import { nutrients, total, validateDaily } from './nutrition.js';
const days = new Map();
const plans = new Map();
const empty = () => Object.fromEntries(nutrients.map(key => [key, null]));
const key = date => `trojanplate-live-nutrition-v1:${date}`;
export function daily(date) {
  if (!days.has(date)) {
    let saved;
    try { saved = validateDaily(JSON.parse(sessionStorage.getItem(key(date))), date); } catch {}
    days.set(date, saved || { date, targets: empty(), planned: {calories:0,protein_g:0,carbs_g:0,fat_g:0}, consumed:{calories:0,protein_g:0,carbs_g:0,fat_g:0}, planned_spending_cents:0, actual_spending_cents:0, logs:[] });
  }
  return structuredClone(days.get(date));
}
function save(data) {
  data.consumed = Object.fromEntries(nutrients.map(key => [key,total(data.logs.map(log => log.nutrition),key)]));
  data.actual_spending_cents = total(data.logs, 'price_cents');
  data.includes_estimates=data.logs.some(log=>log.quality==='estimated' || log.price_quality==='estimated');
  validateDaily(data,data.date);
  days.set(data.date,data);
  try { sessionStorage.setItem(key(data.date),JSON.stringify(data)); } catch {}
  return structuredClone(data);
}
export function updatePlan(plan) {
  plans.set(`${plan.date}:${plan.mode}`,structuredClone(plan));
  const selected = [...plans.values()].filter(p=>p.date===plan.date).flatMap(p=>p.slots.flatMap(slot=>slot.recommendations.filter(item=>item.id===slot.selected_recommendation_id)));
  const data=daily(plan.date);
  data.planned=Object.fromEntries(nutrients.map(key=>[key,total(selected.map(item=>item.nutrition),key)]));
  data.planned_spending_cents=total(selected,'price_cents');
  data.planned_includes_estimates=selected.some(item=>item.nutrition.status==='estimated' || item.price_status==='estimated');
  return save(data);
}
export function log(body,item) {
  const data=daily(body.date);
  if (data.logs.some(log=>log.recommendation_id===item.id && log.slot===body.slot)) return data;
  data.logs.push({id:body.idempotency_key,recommendation_id:item.id,slot:body.slot,meal_title:item.meal_title,
    portion:body.portion,price_quality:body.actual_price_cents!==null && body.actual_price_cents!==undefined?'user_entered':item.price_status || 'unknown',
    published_nutrition:item.nutrition.published || null,estimated_ranges:item.nutrition.estimated_ranges || null,serving_size:item.nutrition.serving_size || null,quality:item.nutrition.status,
    nutrition:Object.fromEntries(nutrients.map(key=>[key,typeof item.nutrition[key]==='number'?item.nutrition[key]*body.portion:null])),
    price_cents:body.actual_price_cents!==null && body.actual_price_cents!==undefined?body.actual_price_cents:item.price_cents===null?null:Math.round(item.price_cents*body.portion)});
  return save(data);
}
export function remove(date,id) { const data=daily(date);data.logs=data.logs.filter(log=>log.id!==id);return save(data); }
export function setTargets(date,targets) { const data=daily(date);data.targets=targets;return save(data); }
export function clear() {
  for (let i=sessionStorage.length-1;i>=0;i--) { const name=sessionStorage.key(i); if(name.startsWith('trojanplate-live-nutrition-v1:'))sessionStorage.removeItem(name); }
  days.clear();plans.clear();
}
