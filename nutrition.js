import { request } from './api.js';
import { config } from './config.js';
export const nutrients = ['calories', 'protein_g', 'carbs_g', 'fat_g'];
export const known = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export const display = value => known(value) ? Math.round(value).toLocaleString() : '—';
export const remaining = (target, consumed) => known(target) && known(consumed) ? target - consumed : null;
export const progress = (value, target) => known(value) && known(target) && target > 0 ? Math.min(100, value / target * 100) : 0;
export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function total(items, field) { return items.every(x => known(x[field])) ? items.reduce((sum, x) => sum + x[field], 0) : null; }
export function validateDaily(data, date) {
  if (!data || data.date !== date || !Array.isArray(data.logs)) throw new Error('Invalid daily nutrition response.');
  for (const group of ['targets', 'consumed', 'planned']) {
    if (!data[group] || nutrients.some(key => data[group][key] !== null && !known(data[group][key]))) throw new Error('Invalid nutrition totals.');
  }
  for (const key of ['planned_spending_cents','actual_spending_cents']) if (data[key] !== null && (!Number.isInteger(data[key]) || data[key] < 0)) throw new Error('Invalid spending total.');
  if (data.logs.some(log => !log.id || !log.meal_title || !log.nutrition || !known(log.portion) || log.portion === 0 || nutrients.some(key => log.nutrition[key] !== null && !known(log.nutrition[key])))) throw new Error('Invalid meal log.');
  return data;
}
/** @type {{date:string, data:import('./contract').DailyNutrition|null, loading:boolean, busy:boolean, error:string}} */
export const nutritionState = { date: new Date().toLocaleDateString('en-CA'), data: null, loading: Boolean(config.browserNutrition || config.nutritionDemo || config.apiBaseUrl), busy: false, error: '' };
let revision = 0;
export async function loadNutrition() {
  const token = ++revision, date = nutritionState.date;
  nutritionState.loading = true; nutritionState.error = ''; nutritionState.data = null;
  try {
    const data = config.browserNutrition ? (await import('./nutrition-local.js')).daily(date) : config.nutritionDemo ? (await import('./nutrition-mock.js')).daily(date) : await request(`/api/nutrition/daily?date=${encodeURIComponent(date)}`);
    if (token === revision) nutritionState.data = validateDaily(data, date);
  } catch (error) { if (token === revision) nutritionState.error = error.message; }
  finally { if (token === revision) nutritionState.loading = false; }
}
const keys = new Map();
export async function logMeal(item, slot, portion, actualPriceCents = null) {
  if (nutritionState.busy || !nutritionState.data || nutritionState.data.logs.some(x => x.recommendation_id === item.id && x.slot === slot)) return;
  if (!Number.isFinite(portion) || portion <= 0 || portion > 10) throw new Error('Choose a portion between 0.25 and 10.');
  const key = `${nutritionState.date}:${slot}:${item.id}`;
  if (!keys.has(key)) keys.set(key, crypto.randomUUID());
  const body = { date: nutritionState.date, recommendation_id: item.id, slot, portion, actual_price_cents:actualPriceCents, idempotency_key: keys.get(key) };
  nutritionState.busy = true; nutritionState.error = '';
  try {
    const data = config.browserNutrition ? (await import('./nutrition-local.js')).log(body,item) : config.nutritionDemo ? (await import('./nutrition-mock.js')).log(body, item) : await request('/api/meals/log', body);
    nutritionState.data = validateDaily(data, body.date);
  } catch (error) { nutritionState.error = error.message; }
  finally { nutritionState.busy = false; }
}
export async function removeLog(id) {
  if (nutritionState.busy) return;
  nutritionState.busy = true; nutritionState.error = '';
  try {
    const data = config.browserNutrition ? (await import('./nutrition-local.js')).remove(nutritionState.date,id) : config.nutritionDemo ? (await import('./nutrition-mock.js')).remove(nutritionState.date, id) : await request(`/api/meals/log/${encodeURIComponent(id)}?date=${nutritionState.date}`, undefined, 'DELETE');
    nutritionState.data = validateDaily(data, nutritionState.date);
    keys.clear();
  } catch (error) { nutritionState.error = error.message; }
  finally { nutritionState.busy = false; }
}
export function CalorieProgressRing(data) {
  const left = remaining(data.targets.calories, data.consumed.calories);
  return `<div class="calorie-ring" role="img" aria-label="${display(data.consumed.calories)} of ${display(data.targets.calories)} calories consumed"><svg viewBox="0 0 160 160" aria-hidden="true"><circle class="ring-track" cx="80" cy="80" r="70"/><circle class="ring-fill" cx="80" cy="80" r="70" pathLength="100" stroke-dasharray="${progress(data.consumed.calories,data.targets.calories)} 100"/></svg><div><strong>${display(left === null ? null : Math.abs(left))}</strong><span>${left !== null && left < 0 ? 'over target' : 'kcal remaining'}</span></div></div>`;
}
export function MacroProgressBars(data) {
  return `<div class="macro-bars">${[['protein_g','Protein'],['carbs_g','Carbohydrates'],['fat_g','Fat']].map(([key,label]) => `<div><div class="nutrition-line"><strong>${label}</strong><span>${display(data.consumed[key])} / ${display(data.targets[key])} g</span></div><div class="macro-track" role="progressbar" aria-label="${label}" aria-valuetext="${display(data.consumed[key])} of ${display(data.targets[key])} grams"><span style="width:${progress(data.consumed[key],data.targets[key])}%"></span></div></div>`).join('')}</div>`;
}
export function NutritionSummary(compact = false) {
  const s = nutritionState, d = s.data;
  const notes = d ? `${config.browserNutrition?'<p class="small">Tracking is saved in this browser tab’s session. Targets are entered by you; missing nutrition stays unknown.</p>':''}${d.includes_estimates || d.planned_includes_estimates?'<p class="small estimate-notice"><strong>Totals include AI estimates.</strong> Estimated values use range midpoints; actual nutrition and spending may differ.</p>':''}<p class="small">Planned meals are separate from what you’ve eaten. — means nutrition is unavailable.</p>` : '';
  return `<section class="panel nutrition-dashboard ${compact?'compact':''}" aria-label="Daily nutrition"><div class="nutrition-line"><span class="eyebrow">${config.nutritionDemo?'Demo · ':''}Daily nutrition</span><label class="nutrition-date">Date <input type="date" id="nutrition-date" value="${s.date}" ${s.busy?'disabled':''}></label></div>${s.loading ? '<p role="status">Loading nutrition…</p>' : ''}${s.error ? `<p role="alert">${escape(s.error)} <button class="quiet" data-action="nutrition-retry">Retry nutrition</button></p>` : ''}${d ? `<div class="nutrition-layout">${CalorieProgressRing(d)}<div class="nutrition-content"><div class="nutrition-stats"><div><strong>${display(d.consumed.calories)}</strong><span>kcal eaten</span></div><div><strong>${display(d.targets.calories)}</strong><span>daily target</span></div><div><strong>${display(d.planned.calories)}</strong><span>kcal planned</span></div></div>${MacroProgressBars(d)}</div></div>${compact ? '' : notes}${compact?'':`<div class="nutrition-spending"><strong>Daily spending</strong><span>Planned ${money(d.planned_spending_cents)}</span><span>Actual ${money(d.actual_spending_cents)}</span></div>`}` : !s.loading ? `<p>${config.browserNutrition ? 'Set daily targets in My Plan to track progress. Meal logs stay in this browser tab.' : 'Nutrition tracking is waiting for the meal service. Your targets and intake will appear here.'}</p>` : ''}</section>`;
}
const money = cents => known(cents) ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100) : '—';
export function MealLogCard(log) { return `<article class="nutrition-log"><div><strong>${escape(log.meal_title)}</strong><p class="small">${escape(log.slot)} · ${escape(log.portion)} serving(s) · ${display(log.nutrition.calories)} kcal · ${log.quality==='estimated'?'AI-estimated':escape(log.quality || 'unknown')} nutrition${log.price_quality==='estimated'?' · AI-estimated spending':''}</p></div><button class="secondary" data-action="unlog" data-id="${escape(log.id)}" ${nutritionState.busy?'disabled':''}>Undo log</button></article>`; }
export function DailyNutritionDashboard() { return NutritionSummary() + (config.browserNutrition && nutritionState.data ? `<form id="nutrition-targets" class="panel stack"><h2>Daily targets</h2><p>Enter your own targets to see progress.</p><div class="fields">${nutrients.map(key=>`<label class="field">${({calories:'Calories (kcal)',protein_g:'Protein (g)',carbs_g:'Carbohydrates (g)',fat_g:'Fat (g)'})[key]}<input name="${key}" type="number" min="0" max="${key==='calories'?20000:2000}" step="1" value="${nutritionState.data.targets[key] ?? ''}"></label>`).join('')}</div><button class="secondary" type="submit">Save targets</button></form>` : '') + (nutritionState.data ? `<section class="panel stack"><h2>Eaten today</h2>${nutritionState.data.logs.length ? nutritionState.data.logs.map(MealLogCard).join('') : '<p>No meals logged. Select meals to plan ahead, then log them when you eat.</p>'}</section>` : ''); }
export function mealNutrition(item, slot, date) {
  const n = item.nutrition, logged = nutritionState.data?.logs.some(x=>x.recommendation_id===item.id && x.slot===slot);
  return `<div class="meal-nutrients">${[['calories','kcal'],['protein_g','g protein'],['carbs_g','g carbs'],['fat_g','g fat']].map(([key,label])=>`<span><strong>${n.field_status?.[key]==='estimated' && n.estimated_ranges?.[key] ? display(n.estimated_ranges[key].low)+'–'+display(n.estimated_ranges[key].high) : display(n[key])}</strong> ${label}${n.field_status?.[key]==='estimated'?' · AI estimate':''}</span>`).join('')}</div><p class="small">${n.serving_status==='estimated'?'Assumed serving':'Serving'}: ${escape(n.serving_size || 'Not supplied')} · ${n.status==='estimated'?'Includes AI estimates':escape(n.status)+' nutrition'}</p>${n.serving_size ? `<label class="portion-label">Portions <select data-portion="${escape(item.id)}">${[.25,.5,1,1.5,2,3].map(x=>`<option ${x===1?'selected':''}>${x}</option>`).join('')}</select></label>`:''}${item.price_status==='estimated'?'<label class="portion-label">Actual paid ($, optional)<input data-actual-price type="number" min="0" max="1000" step="0.01" placeholder="Use estimate"></label>':''}<button class="secondary log-button" data-action="log" data-meal="${slot}" data-id="${escape(item.id)}" ${logged || nutritionState.busy || !nutritionState.data || date!==nutritionState.date?'disabled':''}>${logged?'✓ Eaten':'Log as Eaten'}</button>`;
}
