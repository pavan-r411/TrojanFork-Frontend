import { request } from './api.js';
import { config } from './config.js';
export const nutrients = ['calories', 'protein_g', 'carbs_g', 'fat_g'];
export const known = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export const display = value => known(value) ? Math.round(value).toLocaleString() : '—';
export const remaining = (target, consumed) => known(target) && known(consumed) ? target - consumed : null;
export const progress = (value, target) => known(value) && known(target) && target > 0 ? Math.min(100, value / target * 100) : null;
export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function total(items, field) { return items.every(x => known(x[field])) ? items.reduce((sum, x) => sum + x[field], 0) : null; }
export function hasAnyTarget(targets) {
  return Boolean(targets && nutrients.some(key => known(targets[key])));
}
export function validateDaily(data, date) {
  if (!data || data.date !== date || !Array.isArray(data.logs)) throw new Error('Invalid daily nutrition response.');
  for (const group of ['targets', 'consumed', 'planned']) {
    if (!data[group] || nutrients.some(key => data[group][key] !== null && !known(data[group][key]))) throw new Error('Invalid nutrition totals.');
  }
  for (const key of ['planned_spending_cents','actual_spending_cents']) if (data[key] !== null && (!Number.isInteger(data[key]) || data[key] < 0)) throw new Error('Invalid spending total.');
  if (data.logs.some(log => !log.id || !log.meal_title || !log.nutrition || !known(log.portion) || log.portion === 0 || nutrients.some(key => log.nutrition[key] !== null && !known(log.nutrition[key])))) throw new Error('Invalid meal log.');
  return data;
}
/** @type {{date:string, data:import('./contract').DailyNutrition|null, loading:boolean, busy:boolean, error:string, targetsStatus:string}} */
export const nutritionState = {
  date: new Date().toLocaleDateString('en-CA'),
  data: null,
  loading: Boolean(config.browserNutrition || config.nutritionDemo || config.apiBaseUrl),
  busy: false,
  error: '',
  targetsStatus: '', // '', saving, saved, error, estimating
};
let revision = 0;
export async function loadNutrition() {
  const token = ++revision, date = nutritionState.date;
  const previous = nutritionState.data;
  nutritionState.loading = true; nutritionState.error = '';
  // Do not wipe valid targets while a reload is in flight (avoids "—" flashes / overwrites).
  try {
    const data = config.browserNutrition ? (await import('./nutrition-local.js')).daily(date) : config.nutritionDemo ? (await import('./nutrition-mock.js')).daily(date) : await request(`/api/nutrition/daily?date=${encodeURIComponent(date)}`);
    if (token === revision) nutritionState.data = validateDaily(data, date);
  } catch (error) {
    if (token === revision) {
      nutritionState.error = error.message;
      if (!previous || previous.date !== date) nutritionState.data = null;
    }
  } finally {
    if (token === revision) nutritionState.loading = false;
  }
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
  const target = data.targets.calories;
  const eaten = data.consumed.calories;
  const left = remaining(target, eaten);
  const pct = progress(eaten, target);
  const hasTarget = known(target);
  const label = hasTarget
    ? `${display(eaten)} of ${display(target)} calories consumed`
    : `${display(eaten)} calories eaten, target not set`;
  const center = hasTarget
    ? `<strong>${display(left === null ? null : Math.abs(left))}</strong><span>${left !== null && left < 0 ? 'kcal over target' : 'kcal remaining'}</span>`
    : `<strong>${display(eaten)}</strong><span>kcal eaten</span>`;
  return `<div class="calorie-ring ${hasTarget?'':'no-target'}" role="img" aria-label="${escape(label)}"><svg viewBox="0 0 160 160" aria-hidden="true"><circle class="ring-track" cx="80" cy="80" r="70"/>${pct === null ? '' : `<circle class="ring-fill" cx="80" cy="80" r="70" pathLength="100" stroke-dasharray="${pct} 100"/>`}</svg><div>${center}</div></div>`;
}
export function MacroProgressBars(data) {
  return `<div class="macro-bars">${[['protein_g','Protein'],['carbs_g','Carbohydrates'],['fat_g','Fat']].map(([key,label]) => {
    const pct = progress(data.consumed[key], data.targets[key]);
    const targetLabel = known(data.targets[key]) ? display(data.targets[key]) : 'Target not set';
    return `<div><div class="nutrition-line"><strong>${label}</strong><span>${display(data.consumed[key])} / ${known(data.targets[key]) ? `${targetLabel} g` : targetLabel}</span></div><div class="macro-track" role="progressbar" aria-label="${label}" aria-valuetext="${display(data.consumed[key])} of ${known(data.targets[key]) ? display(data.targets[key]) + ' grams' : 'no target'}">${pct === null ? '' : `<span style="width:${pct}%"></span>`}</div></div>`;
  }).join('')}</div>`;
}
function plannedLabel(value) {
  if (value === null) return 'Incomplete';
  if (known(value)) return display(value);
  return '—';
}
let nutritionExpanded = false;
let targetsSettingsOpen = false;
if (typeof document !== 'undefined') document.addEventListener('toggle', event => {
  if (event.target.matches?.('details.nutrition-dashboard') && event.target.isConnected) nutritionExpanded = event.target.open;
  if (event.target.matches?.('details.nutrition-targets-settings') && event.target.isConnected) targetsSettingsOpen = event.target.open;
}, true);
export function NutritionSummary(compact = false) {
  const s = nutritionState, d = s.data;
  const notes = d ? `${config.browserNutrition?'<p class="small">Tracking is saved in this browser. Manual targets are preferred; profile estimates are labeled. Missing dish nutrition stays unknown.</p>':''}${d.includes_estimates || d.planned_includes_estimates?'<p class="small estimate-notice"><strong>Totals include AI estimates.</strong> Estimated values use range midpoints; actual nutrition and spending may differ.</p>':''}<p class="small">Planned meals are separate from what you’ve eaten. Logging a planned meal counts it once as eaten.</p>` : '';
  const missingTargets = d && !hasAnyTarget(d.targets);
  const targetStat = known(d?.targets?.calories)
    ? `<div><strong>${display(d.targets.calories)}</strong><span>${d.targets_source === 'profile_estimate' ? 'estimated target' : 'daily target'}</span></div>`
    : `<div><strong>—</strong><span>target not set</span></div>`;
  const eatenStat = d ? `<div><strong>${display(d.consumed.calories)}</strong><span>${known(d.targets.calories) ? `of ${display(d.targets.calories)} kcal eaten` : 'kcal eaten'}</span></div>` : '';
  const plannedStat = d ? `<div><strong>${plannedLabel(d.planned.calories)}</strong><span>kcal planned</span></div>` : '';
  const missingBanner = missingTargets
    ? `<div class="targets-missing panel-inline" role="status"><p><strong>Target not set.</strong> Enter daily calories and macros, or estimate from your profile height and weight.</p><div class="actions"><button type="button" class="primary" data-action="open-targets">Set targets</button><button type="button" class="secondary" data-action="estimate-targets">Estimate from profile</button></div></div>`
    : '';
  return `<details class="panel nutrition-dashboard ${compact?'compact':''}" ${nutritionExpanded || missingTargets ? 'open' : ''}><summary class="nutrition-toggle"><span>${config.nutritionDemo?'Demo · ':''}Daily nutrition</span><span class="nutrition-toggle-hint"><span class="when-closed">View details</span><span class="when-open">Hide details</span><span class="nutrition-chevron" aria-hidden="true">⌄</span></span></summary><div class="nutrition-dashboard-body"><div class="nutrition-line"><label class="nutrition-date">Date <input type="date" id="nutrition-date" value="${s.date}" ${s.busy?'disabled':''}></label></div>${s.loading && !d ? '<p role="status">Loading nutrition…</p>' : ''}${s.error ? `<p role="alert">${escape(s.error)} <button class="quiet" data-action="nutrition-retry">Retry nutrition</button></p>` : ''}${d ? `${missingBanner}<div class="nutrition-layout">${CalorieProgressRing(d)}<div class="nutrition-content"><div class="nutrition-stats">${eatenStat}${targetStat}${plannedStat}</div>${MacroProgressBars(d)}${hasAnyTarget(d.targets) ? `<p class="small"><button type="button" class="quiet" data-action="open-targets">Edit targets</button>${d.targets_source === 'manual' ? '' : ' · <button type="button" class="quiet" data-action="estimate-targets">Recalculate estimate</button>'}</p>` : ''}</div></div>${compact ? '' : notes}${compact?'':`<div class="nutrition-spending"><strong>Daily spending</strong><span>Planned ${money(d.planned_spending_cents)}</span><span>Actual ${money(d.actual_spending_cents)}</span></div>`}` : !s.loading ? `<p>${config.browserNutrition ? 'Set daily targets below to track progress. Meal logs stay in this browser.' : 'Nutrition tracking is waiting for the meal service. Your targets and intake will appear here.'}</p>` : ''}</div></details>`;
}
const money = cents => known(cents) ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100) : '—';
export function MealLogCard(log) { return `<article class="nutrition-log"><div><strong>${escape(log.meal_title)}</strong><p class="small">${escape(log.slot)} · ${escape(log.portion)} serving(s) · ${display(log.nutrition.calories)} kcal · ${log.quality==='estimated'?'AI-estimated':escape(log.quality || 'unknown')} nutrition${log.price_quality==='estimated'?' · AI-estimated spending':''}</p></div><button class="secondary" data-action="unlog" data-id="${escape(log.id)}" ${nutritionState.busy?'disabled':''}>Undo log</button></article>`; }
export function EatenTodaySection() {
  if (!nutritionState.data) return '';
  return `<section class="panel stack eaten-today" aria-labelledby="eaten-today-heading"><h2 id="eaten-today-heading">Eaten today</h2><p class="small">Logged meals count toward consumption. Planned picks above stay separate until you log them.</p>${nutritionState.data.logs.length ? nutritionState.data.logs.map(MealLogCard).join('') : '<p>No meals logged. Select meals to plan ahead, then log them when you eat.</p>'}</section>`;
}
export function NutritionTargetsForm({ collapsed = true, forceOpen = false } = {}) {
  if (!(config.browserNutrition && nutritionState.data)) return '';
  const source = nutritionState.data.targets_source;
  const sourceNote = source === 'profile_estimate'
    ? 'Estimated with Mifflin–St Jeor from height, weight, activity, and goal (hackathon estimate — not medical advice). Saving here marks targets as manual.'
    : source === 'manual'
      ? 'Saved manually. Profile edits will not overwrite these unless you recalculate.'
      : 'Enter targets manually, or estimate when height (cm) and weight (kg) are in your profile.';
  const status = nutritionState.targetsStatus === 'saving' ? '<p class="small" role="status">Saving targets…</p>'
    : nutritionState.targetsStatus === 'saved' ? '<p class="small" role="status">Targets saved.</p>'
    : nutritionState.targetsStatus === 'estimating' ? '<p class="small" role="status">Estimating from profile…</p>'
    : nutritionState.targetsStatus === 'error' ? '<p class="small" role="alert">Could not save targets. Check the values and try again.</p>'
    : '';
  const open = forceOpen || targetsSettingsOpen || !hasAnyTarget(nutritionState.data.targets);
  const fields = `<div class="fields">${nutrients.map(key=>`<label class="field">${({calories:'Calories (kcal)',protein_g:'Protein (g)',carbs_g:'Carbohydrates (g)',fat_g:'Fat (g)'})[key]}<input name="${key}" type="number" min="0" max="${key==='calories'?20000:2000}" step="1" inputmode="decimal" value="${nutritionState.data.targets[key] ?? ''}"></label>`).join('')}</div><div class="actions"><button class="primary" type="submit">Save targets</button><button class="secondary" type="button" data-action="estimate-targets">Estimate from profile</button></div>${status}`;
  if (!collapsed) {
    return `<form id="nutrition-targets" class="panel stack"><h2>Daily targets</h2><p>${sourceNote}</p>${fields}</form>`;
  }
  return `<details class="panel stack nutrition-targets-settings" id="nutrition-targets-panel" ${open ? 'open' : ''}><summary>Set / edit nutrition targets</summary><p class="small">${sourceNote}</p><form id="nutrition-targets" class="stack">${fields}</form></details>`;
}
export function DailyNutritionDashboard() {
  return NutritionSummary() + EatenTodaySection() + NutritionTargetsForm({ collapsed: true });
}
export function mealNutrition(item, slot, date, compact = false) {
  const n = item.nutrition, logged = nutritionState.data?.logs.some(x=>x.recommendation_id===item.id && x.slot===slot);
  const logButton = `<button class="secondary log-button" data-action="log" data-meal="${slot}" data-id="${escape(item.id)}" ${logged || nutritionState.busy || !nutritionState.data || date!==nutritionState.date?'disabled':''}>${logged?'✓ Eaten':'Log as Eaten'}</button>`;
  if (compact) return logButton;
  return `<div class="meal-nutrients">${[['calories','kcal'],['protein_g','g protein'],['carbs_g','g carbs'],['fat_g','g fat']].map(([key,label])=>`<span><strong>${n.field_status?.[key]==='estimated' && n.estimated_ranges?.[key] ? display(n.estimated_ranges[key].low)+'–'+display(n.estimated_ranges[key].high) : display(n[key])}</strong> ${label}${n.field_status?.[key]==='estimated'?' · AI estimate':''}</span>`).join('')}</div><p class="small">${n.serving_status==='estimated'?'Assumed serving':'Serving'}: ${escape(n.serving_size || 'Not supplied')} · ${n.status==='estimated'?'Includes AI estimates':escape(n.status)+' nutrition'}</p>${n.serving_size ? `<label class="portion-label">Portions <select data-portion="${escape(item.id)}">${[.25,.5,1,1.5,2,3].map(x=>`<option ${x===1?'selected':''}>${x}</option>`).join('')}</select></label>`:''}${item.price_status==='estimated'?'<label class="portion-label">Actual paid ($, optional)<input data-actual-price type="number" min="0" max="1000" step="0.01" placeholder="Use estimate"></label>':''}${logButton}`;
}
