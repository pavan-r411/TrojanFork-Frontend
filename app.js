import { nutritionState, loadNutrition, logMeal, removeLog, NutritionSummary, DailyNutritionDashboard, mealNutrition } from './nutrition.js';
import { apiClient, toMeal, directionsUrl, directionsUnavailable } from './api.js';
import { config } from './config.js';
import { getOptions, meals } from './menu.js';
import { getSessionToken, clearSession } from './auth.js';
import { previewSwap } from './live-plan.js';

const app = document.querySelector('#app');
const profileLink = document.querySelector('#profile-link');
const storageKey = 'trojanplate-profile-v1';
const plansKey = 'trojanplate-plans-v3';
const defaults = {
  goal: 'Eat balanced meals', diet: 'Any diet', allergies: '', exclusions: '',
  age: '', activity: '', height: '', weight: '', goalWeight: '', snacks: false,
};
const settings = {
  campus: { includeAIEstimates:true, swipes: 3, cuisines: [], hall: 'All halls' },
  nearby: { includeAIEstimates:true, includeUnknownPrices: false, perMeal: 15, daily: 42, distance: .3, cuisines: [], origin: 'USC Village' },
};
const modeLabels = { campus: 'USC Dining', nearby: 'Off-Campus Dining' };
const savedProfile = loadProfile();
let profile = savedProfile ?? { ...defaults };
let draft = { ...profile };
let complete = Boolean(savedProfile);
let sessionUser = null;
let authMode = 'login';
let authError = '';
// Auth is optional for the pilot: planner works locally; sign-in enables server sync.
let view = 'home';
let mode = 'campus';
let step = 0;
let selections = {};
const modeState = { campus: { selections: {}, locks: {} }, nearby: { selections: {}, locks: {} } };
let planRevisions = { campus: 0, nearby: 0 };
let undoSnapshot = null;
let pendingSwap = null;
try {
  const saved = JSON.parse(localStorage.getItem(plansKey));
  if (saved?.apiBaseUrl === config.apiBaseUrl && saved?.date === new Date().toLocaleDateString('en-CA')) {
    for (const key of ['campus', 'nearby']) {
      Object.assign(modeState[key], saved.states?.[key] || {});
      Object.assign(settings[key], saved.settings?.[key] || {});
      if (saved.revisions?.[key]) planRevisions[key] = saved.revisions[key];
    }
  }
} catch {}
selections = modeState[mode].selections;
let loading = false;
let requestError = '';
let lastFocus = null;
const mealCursors = {campus:{},nearby:{}};
function persist() {
  try {
    const payload = {
      apiBaseUrl: config.apiBaseUrl,
      nutritionDemo: Boolean(config.nutritionDemo),
      date: new Date().toLocaleDateString('en-CA'),
      states: {
        campus: { selections: modeState.campus.selections, locks: modeState.campus.locks },
        nearby: { selections: modeState.nearby.selections, locks: modeState.nearby.locks },
      },
      settings: {
        campus: { ...settings.campus, livePlan: settings.campus.livePlan || null },
        nearby: { ...settings.nearby, livePlan: settings.nearby.livePlan || null },
      },
      revisions: planRevisions,
    };
    localStorage.setItem(plansKey, JSON.stringify(payload));
  } catch {}
  if (getSessionToken() && settings[mode].livePlan) {
    const plan = settings[mode].livePlan;
    apiClient.savePlan({ date: plan.date, mode: plan.mode, plan }).then(out => {
      if (out?.revision != null) planRevisions[mode] = out.revision;
    }).catch(() => {});
  }
}
let toastTimer;
function announce(message) {
  clearTimeout(toastTimer);
  document.querySelector('#toast').textContent = message;
  toastTimer = setTimeout(()=>document.querySelector('#toast').textContent='',5000);
}
const localDate = () => new Date().toLocaleDateString('en-CA');
const modeName = () => mode === 'campus' ? 'usc_dining' : 'off_campus';
const goalApiValue = goal => ({
  'Eat balanced meals': 'balanced',
  'Build muscle': 'build_muscle',
  'Fuel training': 'training_support',
  'Maintain weight': 'maintenance',
  'Gradually lose weight': 'gradual_weight_loss',
  'Gradually gain weight': 'gradual_weight_gain',
})[goal] || 'balanced';
function profilePayload() {
  return { goal: goalApiValue(profile.goal).replaceAll('_', ' '), dietary_preferences: profile.diet==='Any diet'?[]:[profile.diet.toLowerCase()], allergies: profile.allergies.split(/[,\n]/).map(x=>x.trim()).filter(Boolean), disliked_ingredients:profile.exclusions.split(',').map(x=>x.trim()).filter(Boolean), preferred_cuisines:settings[mode].cuisines, activity_level:profile.activity?.toLowerCase() || 'moderate', snacks:profile.snacks, height_cm: profile.height ? Number(profile.height) : null, weight_kg: profile.weight ? Number(profile.weight) : null, goal_weight_kg: profile.goalWeight ? Number(profile.goalWeight) : null, age_range: profile.age || null, targets:nutritionState.data?.targets, remaining:nutritionState.data ? Object.fromEntries(['calories','protein_g','carbs_g','fat_g'].map(key=>[key,nutritionState.data.targets[key]===null || nutritionState.data.consumed[key]===null?null:Math.max(0,nutritionState.data.targets[key]-nutritionState.data.consumed[key])])) : null };
}
/** Body for POST /v1/profile/targets from onboarding fields. */
function targetsPayload(source = profile) {
  const height = source.height === '' || source.height == null ? null : Number(source.height);
  const weight = source.weight === '' || source.weight == null ? null : Number(source.weight);
  const goalWeight = source.goalWeight === '' || source.goalWeight == null ? null : Number(source.goalWeight);
  return {
    nutrition_goal: goalApiValue(source.goal),
    activity_level: (source.activity || 'moderate').toLowerCase().replaceAll(' ', '_'),
    age_range: source.age || null,
    height_cm: Number.isFinite(height) ? height : null,
    weight_kg: Number.isFinite(weight) ? weight : null,
    goal_weight_kg: Number.isFinite(goalWeight) ? goalWeight : null,
    prefer_high_protein: ['Build muscle', 'Fuel training'].includes(source.goal),
  };
}
/** Estimate calorie/macro targets from collected profile and store them for the day. */
async function syncTargetsFromProfile(source = profile, {force = false} = {}) {
  if (!config.apiBaseUrl && !config.nutritionDemo) return null;
  const payload = targetsPayload(source);
  if (payload.height_cm == null || payload.weight_kg == null) return null;
  try {
    const estimated = await apiClient.estimateTargets(payload);
    if (estimated?.confidence !== 'estimated' || !estimated.targets) return estimated;
    const mapped = {
      calories: estimated.targets.calories_kcal ?? null,
      protein_g: estimated.targets.protein_g ?? null,
      carbs_g: estimated.targets.carbohydrates_g ?? null,
      fat_g: estimated.targets.fat_g ?? null,
    };
    if (config.browserNutrition) {
      const local = await import('./nutrition-local.js');
      const current = local.daily(nutritionState.date);
      const hasManual = !force && nutrientsHaveValues(current.targets) && current.targets_source === 'manual';
      if (!hasManual) {
        nutritionState.data = local.setTargets(nutritionState.date, mapped, { source: 'profile_estimate', meta: estimated });
      }
    } else if (config.nutritionDemo) {
      const mock = await import('./nutrition-mock.js');
      nutritionState.data = mock.setTargets?.(nutritionState.date, mapped) || nutritionState.data;
    }
    return estimated;
  } catch {
    return null;
  }
}
function nutrientsHaveValues(targets) {
  return Boolean(targets && ['calories', 'protein_g', 'carbs_g', 'fat_g'].some(key => typeof targets[key] === 'number'));
}
function adoptPlan(plan, key) {
  if (plan.mode !== (key==='campus'?'usc_dining':'off_campus') || plan.date !== localDate()) throw new Error('The server returned a plan for a different mode or date.');
  for(const [meal,locked] of Object.entries(modeState[key].locks)) {
    if(locked && modeState[key].selections[meal]) {
      const slot=plan.slots.find(x=>x.slot===meal.toLowerCase());
      if(slot?.selected_recommendation_id !== modeState[key].selections[meal].id) throw new Error('The server changed a locked meal. Your previous plan has been preserved.');
      slot.locked=true;
    }
  }
  settings[key].livePlan = plan;
  const chosen = {};
  for (const slot of plan.slots) {
    const meal=slot.slot[0].toUpperCase()+slot.slot.slice(1);
    const item=slot.recommendations.find(x=>x.id===slot.selected_recommendation_id);
    if(item) chosen[meal]=toMeal(item,slot.slot);
    modeState[key].locks[meal]=slot.locked;
  }
  modeState[key].selections=chosen;
  if(mode===key) selections=chosen;
  persist();
}
let planRequest = 0;
async function refreshPlan() {
  if (!config.apiBaseUrl && !config.nutritionDemo) { render(false); return; }
  const key=mode;
  const planMode = key === 'campus' ? 'usc_dining' : 'off_campus';
  const token = ++planRequest;
  loading=true; requestError=''; render(false);
  try {
    const current=settings[key];
    const context={meal_swipes_available:settings.campus.swipes,dining_hall:settings.campus.hall?.trim() || 'All halls',dining_dollars_cents:profile.diningDollars?Math.round(Number(profile.diningDollars)*100):null,origin:current.coordinates || {lat:34.0258,lng:-118.2854,label:current.origin || 'USC Village'},max_walk_m:Math.round((current.distance || .3)*1609.344),include_unknown_prices:Boolean(current.includeUnknownPrices),include_ai_estimates:true,per_meal_budget_cents:Math.round((current.perMeal ?? 15)*100),daily_budget_cents:Math.round((current.daily ?? 42)*100),preferred_cuisines:current.cuisines,locked_meal_ids:Object.entries(modeState[key].locks).filter(([,v])=>v).map(([meal])=>modeState[key].selections[meal]?.id)};
    let plan;
    if (config.nutritionDemo) {
      const {seedDefaultSelections,recalculatePlan}=await import('./live-plan.js');
      plan=recalculatePlan(seedDefaultSelections((await import('./nutrition-mock.js')).demoPlan(planMode, localDate())), context);
    } else {
      plan=await apiClient.generate({mode:planMode, date:localDate(), previous_plan:current.livePlan, profile:profilePayload(), context});
    }
    if (token !== planRequest) return;
    adoptPlan(plan,key);
    if(config.nutritionDemo) (await import('./nutrition-mock.js')).updatePlan(plan);
    if(config.browserNutrition) (await import('./nutrition-local.js')).updatePlan(plan);
    syncNutrition();
  } catch(error) { if (token === planRequest) requestError=error.message; }
  finally { if (token === planRequest) { loading=false; render(false); } }
}
async function selectLive(meal, id, {skipPreview=false}={}) {
  const key=mode;
  if(modeState[key].locks[meal] || loading) return;
  const currentId=modeState[key].selections[meal]?.id;
  if(!skipPreview && currentId && currentId!==id) {
    try {
      pendingSwap={ meal, id, preview: previewSwap(settings[key].livePlan, meal.toLowerCase(), id, {
        daily_budget_cents: Math.round((settings.nearby.daily ?? 42)*100),
        meal_swipes_available: settings.campus.swipes,
      })};
      render(false);
      document.querySelector('#swap-preview')?.showModal();
      return;
    } catch (error) { announce(error.message); return; }
  }
  loading=true; render(false);
  try {
    undoSnapshot={ key, plan: structuredClone(settings[key].livePlan), selections: structuredClone(modeState[key].selections), locks: structuredClone(modeState[key].locks) };
    const plan=config.nutritionDemo ? structuredClone(settings[key].livePlan) : await apiClient.swap({plan_id:settings[key].livePlan.plan_id,slot:meal.toLowerCase(),selected_recommendation_id:id,locked_meal_ids:Object.entries(modeState[key].locks).filter(([,v])=>v).map(([slot])=>modeState[key].selections[slot]?.id),plan_state:settings[key].livePlan});
    if(config.nutritionDemo) plan.slots.find(x=>x.slot===meal.toLowerCase()).selected_recommendation_id=id;
    adoptPlan(plan,key);
    if(config.nutritionDemo) (await import('./nutrition-mock.js')).updatePlan(plan);
    if(config.browserNutrition) (await import('./nutrition-local.js')).updatePlan(plan);
    syncNutrition();
    announce((plan.changes || 'Meal updated.') + ' Undo available.');
  } catch(error) { requestError=error.message; undoSnapshot=null; }
  finally { loading=false; pendingSwap=null; render(false); }
}

function undoSwap() {
  if(!undoSnapshot) return;
  const { key, plan, selections: sel, locks } = undoSnapshot;
  settings[key].livePlan = plan;
  modeState[key].selections = sel;
  modeState[key].locks = locks;
  if(mode===key) selections=sel;
  undoSnapshot=null;
  persist();
  if(config.browserNutrition) import('./nutrition-local.js').then(local=>{local.updatePlan(plan); syncNutrition();});
  announce('Swap undone. Previous meal restored.');
  render(false);
}

async function bootstrapSession() {
  if(!getSessionToken()) return;
  try {
    sessionUser = await apiClient.me();
    const remote = await apiClient.getProfile().catch(()=>null);
    if(remote?.profile) {
      const p = remote.profile;
      profile = {
        ...defaults,
        ...profile,
        goal: ({balanced:'Eat balanced meals','build muscle':'Build muscle',training_support:'Fuel training',maintenance:'Maintain weight','gradual weight loss':'Gradually lose weight','gradual weight gain':'Gradually gain weight'})[p.goal] || profile.goal,
        diet: (p.dietary_preferences?.[0] ? p.dietary_preferences[0].replace(/^\w/,c=>c.toUpperCase()) : profile.diet) || profile.diet,
        allergies: Array.isArray(p.allergies) ? p.allergies.join(', ') : profile.allergies,
        exclusions: Array.isArray(p.disliked_ingredients) ? p.disliked_ingredients.join(', ') : profile.exclusions,
        snacks: Boolean(p.snacks),
        activity: p.activity_level ? p.activity_level.replace(/^\w/,c=>c.toUpperCase()) : profile.activity,
      };
      complete = true;
      try { localStorage.setItem(storageKey, JSON.stringify(profile)); } catch {}
    }
    for (const key of ['campus','nearby']) {
      const planMode = key==='campus'?'usc_dining':'off_campus';
      try {
        const saved = await apiClient.getPlan(localDate(), planMode);
        if(saved?.plan?.plan_id) {
          adoptPlan(saved.plan, key);
          planRevisions[key] = saved.revision || 0;
        }
      } catch {}
    }
    if(view==='auth') view='home';
  } catch {
    clearSession();
    sessionUser=null;
  }
}

function authView() {
  return `<section class="onboarding auth-panel">
    <div class="intro" data-enter>
      <div><span class="eyebrow">Trojan Fork</span><h1 tabindex="-1">Sign in to<br><em>save your plate.</em></h1></div>
      <p>Your profile and daily plan sync to your account. Or continue locally in this browser.</p>
    </div>
    <form class="panel stack" id="auth-form">
      <div class="form-title"><span class="eyebrow">${authMode==='login'?'Welcome back':'Create account'}</span><h2 tabindex="-1">${authMode==='login'?'Sign in':'Create account'}</h2></div>
      ${authError?`<p role="alert">${escapeHtml(authError)}</p>`:''}
      ${authMode==='register'?`<div class="field"><label for="display_name">Display name</label><input id="display_name" name="display_name" maxlength="80" required></div>`:''}
      <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="username" required></div>
      <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="${authMode==='login'?'current-password':'new-password'}" minlength="8" required></div>
      <div class="actions">
        <button class="primary" type="submit">${authMode==='login'?'Sign in':'Create account'}</button>
      </div>
      <button type="button" class="quiet" data-action="auth-toggle">${authMode==='login'?'Need an account? Create one':'Already have an account? Sign in'}</button>
      <button type="button" class="secondary" data-action="auth-skip">Continue without account</button>
      <p class="small">Private records are scoped to your account. Local-only mode stores data in this browser.</p>
    </form>
  </section>`;
}

function directionsControl(item, {compact=false}={}) {
  const url = directionsUrl(item);
  if (url) {
    const cls = compact ? 'summary-directions' : 'secondary directions-link';
    return `<a class="${cls}" href="${escapeHtml(url)}" target="_blank" rel="noopener" data-action="directions">Get directions</a>`;
  }
  const reason = directionsUnavailable(item) || 'Directions unavailable';
  if (compact) return `<span class="summary-directions is-unavailable" title="${escapeHtml(reason)}">Directions unavailable</span>`;
  return `<button type="button" class="quiet directions-missing" disabled title="${escapeHtml(reason)}">Directions unavailable</button>`;
}

function summaryNutritionNote(live) {
  if (!live) return 'Meal totals will appear when the service returns your plan.';
  const status = live.nutrition_label || 'planned';
  const coverage = live.nutrition?.coverage || '';
  if (coverage === 'No meals selected') return 'No meals selected yet.';
  if (coverage.includes('AI estimates')) {
    return `<span class="summary-certainty is-estimated">Nutrition: AI estimates</span> Planned totals use midpoints and may differ from the plate. Confirm allergens with the provider.`;
  }
  if (coverage.includes('missing nutrients') || coverage.includes('unavailable')) {
    return `<span class="summary-certainty is-unknown">Nutrition: partly unknown</span> Missing values stay blank — not zero. Confirm allergens with the provider.`;
  }
  return `<span class="summary-certainty is-published">Nutrition: published</span> Planned totals from menu values (${status}). Confirm allergens with the provider.`;
}

function emptySlot(meal, selectedOnly) {
  const slot = settings[mode].livePlan?.slots.find(s => s.slot === meal.toLowerCase());
  const empty = slot?.empty_state;
  const message = selectedOnly
    ? 'Choose a meal from Home to add it here.'
    : (empty?.message || slot?.availability_note || 'The service returned no meals for these preferences.');
  const actions = selectedOnly
    ? `<button class="quiet" data-action="home">Browse meals</button>`
    : (empty?.actions || [{id:'retry',label:'Retry'},{id:'review_filters',label:'Review filters'}]).map(action => {
        const map = { retry:'refresh', review_filters:'settings', widen_radius:'settings', raise_budget:'settings', change_origin:'settings', change_hall:'settings', change_date:'settings' };
        return `<button class="quiet" data-action="${map[action.id] || 'settings'}">${escapeHtml(action.label)}</button>`;
      }).join(' ');
  return `<div class="empty"><h3>${selectedOnly?'No meal selected yet':'No eligible meals returned'}</h3>
    <p>${escapeHtml(message)}</p>
    ${empty?.reason_code?`<p class="small">Reason: ${escapeHtml(empty.reason_code)}</p>`:''}
    ${empty?.diagnostics?`<p class="small">Checked ${escapeHtml(String(empty.diagnostics.eligible_dishes ?? empty.diagnostics.pool_dishes ?? '—'))} eligible dishes · allergies kept</p>`:''}
    <div class="actions">${actions}</div>
    <p class="small">Allergy restrictions are never suggested for removal.</p>
  </div>`;
}

function swapPreviewSheet() {
  if(!pendingSwap?.preview) return '';
  const p = pendingSwap.preview;
  const fmt = (v, suffix='') => v==null ? 'unknown' : `${v}${suffix}`;
  const money = cents => cents==null ? 'unknown' : dollars.format(cents/100);
  return `<dialog id="swap-preview" class="swap-preview" open>
    <form method="dialog" class="sheet stack">
      <h2>Confirm meal swap</h2>
      <p>Replace <strong>${escapeHtml(p.from?.title || 'current meal')}</strong> with <strong>${escapeHtml(p.to.title)}</strong>${p.delta.restaurant_changed?` at ${escapeHtml(p.to.venue)}`:''}.</p>
      <ul class="swap-deltas">
        <li>Calories: ${fmt(p.delta.calories,' kcal')} (planned)</li>
        <li>Protein: ${fmt(p.delta.protein_g,' g')} (planned)</li>
        <li>Cash: ${money(p.delta.cash_cents)} (tax/fees excluded)</li>
        <li>Swipes: ${p.delta.swipes>=0?'+':''}${p.delta.swipes}</li>
      </ul>
      <p class="small">${escapeHtml(p.notes.join(' '))}</p>
      <div class="actions">
        <button type="button" class="secondary" data-action="swap-cancel">Cancel</button>
        <button type="button" class="primary" data-action="swap-confirm" data-meal="${escapeHtml(pendingSwap.meal)}" data-id="${escapeHtml(pendingSwap.id)}">Confirm swap</button>
      </div>
    </form>
  </dialog>`;
}



function loadProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    return saved && saved.goal && saved.diet ? { ...defaults, ...saved } : null;
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, character => entities[character]);
}

function choiceGroup(name, label, values, selected, multiple = false) {
  return `<fieldset><legend>${label}</legend><div class="choices">${values.map(value =>
    `<label class="choice"><input type="${multiple ? 'checkbox' : 'radio'}" name="${name}" value="${value}" ${selected.includes(value) ? 'checked' : ''} ${multiple ? '' : 'required'}><span>${value}</span></label>`
  ).join('')}</div></fieldset>`;
}

function numberField(name, label, value, min, max, increment = 1, required = false) {
  return `<div class="field"><label for="${name}">${label}</label><input type="number" id="${name}" name="${name}" value="${escapeHtml(value)}" min="${min}" max="${max}" step="${increment}" ${required ? 'required' : ''}></div>`;
}

function selectField(name, label, values) {
  return `<div class="field"><label for="${name}">${label}</label><select name="${name}" id="${name}"><option value="">Prefer to skip</option>${values.map(value =>
    `<option ${draft[name] === value ? 'selected' : ''}>${value}</option>`
  ).join('')}</select></div>`;
}

function onboarding() {
  const pages = [
    {
      title: 'What’s your food goal?',
      help: 'Pick the goal that best fits how you want to eat.',
      fields: choiceGroup('goal', 'Nutrition goal', ['Eat balanced meals', 'Maintain weight', 'Gradually lose weight', 'Gradually gain weight', 'Build muscle', 'Fuel training'], [draft.goal]),
    },
    {
      title: 'What’s on your plate?',
      help: 'Tell us what you eat and what you need to avoid.',
      fields: `${choiceGroup('diet', 'Dietary preference', ['Any diet', 'Vegetarian', 'Vegan'], [draft.diet])}
        <div class="field"><label for="allergies">Food allergies (optional)</label><textarea id="allergies" name="allergies" maxlength="240" placeholder="e.g. peanuts, shellfish">${escapeHtml(draft.allergies)}</textarea></div>
        <div class="field"><label for="exclusions">Disliked ingredients or foods to exclude (optional)</label><textarea id="exclusions" name="exclusions" maxlength="240" placeholder="e.g. mushrooms, cilantro">${escapeHtml(draft.exclusions)}</textarea></div>`,
    },
    {
      title: 'A few more details.',
      help: 'These optional details stay in this browser. Your preferences are sent to the meal service when building a plan.',
      fields: `<div class="fields">
        ${selectField('age', 'Age range', ['18–20', '21–24', '25–29', '30+'])}
        ${selectField('activity', 'Activity level', ['Light', 'Moderate', 'Very active'])}
        ${numberField('height', 'Height (cm)', draft.height, 60, 250, .1)}
        ${numberField('weight', 'Current weight (kg)', draft.weight, 20, 350, .1)}
        ${['Gradually lose weight', 'Gradually gain weight'].includes(draft.goal) ? numberField('goalWeight', 'Goal weight (kg)', draft.goalWeight, 20, 350, .1) : ''}
        </div><label class="check"><input name="snacks" type="checkbox" ${draft.snacks ? 'checked' : ''}> Include snack ideas</label>`,
    },
    { title: 'Make it fit campus life.', help: 'You can change these details anytime.', fields: `<div class="fields">${numberField('swipes', 'Daily meal swipes', settings.campus.swipes, 0, 20)}${numberField('diningDollars', 'Dining Dollars ($, manual)', draft.diningDollars || '', 0, 9999, .01)}</div><div class="field"><label for="origin">Default campus landmark</label><select id="origin" name="origin">${['USC Village','Tommy Trojan','Leavey Library'].map(x=>`<option ${draft.origin===x?'selected':''}>${x}</option>`).join('')}</select></div><p class="small">Suggestions are informational. Nutrition may be incomplete; verify allergens with the food provider.</p>` },
  ];
  const page = pages[step];
  return `<section class="onboarding">
    <div class="intro" data-enter>
      <div><span class="eyebrow">USC student meal planner</span><h1 tabindex="-1">Your campus.<br><em>Your plate.</em></h1></div>
      <p>Plan breakfast, lunch and dinner from USC dining halls or nearby spots.</p>
      <div class="plate-art" aria-hidden="true"><img src="assets/art/plate.png" alt=""></div>
    </div>
    <form class="panel stack" id="onboarding">
      <div class="progress" aria-hidden="true">${pages.map((_, index) => `<span class="${index <= step ? 'complete' : ''}"></span>`).join('')}</div>
      <div class="form-title"><span class="eyebrow">Profile · Step ${step + 1} of ${pages.length}</span><h2 tabindex="-1">${page.title}</h2><p>${page.help}</p></div>
      ${page.fields}
      <p class="small">How recommendations work: the backend matches your preferences, restrictions, available swipes and spending limits. Verify uncertain allergen details with the provider.</p><div class="actions">
        ${step ? '<button type="button" class="secondary" data-action="back">Back</button>' : complete ? '<button type="button" class="secondary" data-action="home">Cancel</button>' : ''}
        <button class="primary" type="submit">${step === pages.length - 1 ? 'Save profile' : 'Continue'} <span aria-hidden="true">→</span></button>
      </div>
      <button type="button" class="quiet" data-action="home">Skip optional details / edit later</button>
      ${sessionUser?'<button type="button" class="quiet" data-action="auth-signout">Sign out</button>':complete?'':'<button type="button" class="quiet" data-action="auth-skip">Back to sign in</button>'}
      ${complete?'<button type="button" class="quiet" data-action="clear">Clear saved data</button>':''}
    </form>
  </section>`;
}

function heroImage() {
  const url=settings[mode].livePlan?.slots.flatMap(slot=>slot.recommendations).find(item=>safeUrl(item.image_url))?.image_url;
  return safeUrl(url);
}
function foodArt(name) {
  const categories=[[/salad|greens|kale|caesar/i,'salad'],[/pasta|spaghetti|gnocchi|penne|rigatoni|noodle|tagliatelle|angel hair/i,'pasta'],[/sandwich|toast|bagel|panini|wrap/i,'sandwich'],[/yogurt|cottage|cheese/i,'bowl'],[/egg|omelet|scramble|breakfast|waffle|bagel/i,'egg'],[/fish|salmon|tuna/i,'fish'],[/chicken|turkey|poultry|beef|steak|brisket/i,'chicken'],[/burger/i,'burger'],[/rice|curry|stir.fry/i,'rice'],[/fruit|apple|berries/i,'apple'],[/soup|stew|ragout|lentil|bean|bowl/i,'bowl']];
  return 'assets/art/'+(categories.find(([pattern])=>pattern.test(name))?.[1] || 'plate')+'.png';
}
function safeUrl(value) { try { const url=new URL(value); return ['https:','http:'].includes(url.protocol)?url.href:''; } catch { return ''; } }
function home() {
  return `<section class="home-heading" data-enter><div><span class="eyebrow">${new Date().toLocaleDateString('en-US', {weekday:'long',month:'long',day:'numeric'})}</span><h1 tabindex="-1">Eat well.<br>Fight On!</h1><p class="lede">Trojan diet delights</p></div><span class="day-stamp">Made for your campus.</span></section>
    ${sessionUser?`<p class="small">Signed in as ${escapeHtml(sessionUser.display_name || sessionUser.email)}. Plans sync to your account.</p>`:`<p class="small">Browsing locally. <button type="button" class="quiet" data-action="auth-open">Sign in</button> to sync profile and plans across devices.</p>`}
    ${NutritionSummary(true)}
    <div class="tabs" role="tablist" aria-label="Dining mode">${['campus','nearby'].map(key => `<button role="tab" id="tab-${key}" aria-controls="mode-panel" aria-selected="${mode===key}" tabindex="${mode===key ? 0 : -1}" data-action="mode" data-mode="${key}">${key==='campus' ? 'USC Dining' : 'Off-Campus'}</button>`).join('')}</div>
    <section id="mode-panel" role="tabpanel" aria-labelledby="tab-${mode}">
      <div class="food-hero ${heroImage()?'':'without-photo'}"><div><span class="hero-label">${mode==='campus' ? 'USC Dining' : 'Near campus'}</span><h2>${mode==='campus' ? 'Good food. Close to class.' : 'Take a delicious study break.'}</h2><p>${mode==='campus' ? 'Your dining hall options, in one place.' : 'Near '+escapeHtml(settings.nearby.origin)+', within your chosen radius.'}</p></div>${heroImage()?`<img src="${escapeHtml(heroImage())}" alt="${escapeHtml(getOptions(mode,'Breakfast',profile,settings[mode])[0]?.name || 'Meal from the menu service')}" onerror="this.hidden=true;this.parentElement.classList.add('without-photo')">`:'<img src="assets/art/plate.png" alt="" aria-hidden="true">'}</div>
      <div class="filter-row">${mode==='nearby' ? `<button class="secondary cuisine-filter" data-action="cuisines">Cuisine: ${escapeHtml(settings.nearby.cuisines.join(', ') || 'Any')}</button>` : ''}<button class="secondary" data-action="settings">${mode==='campus' ? settings.campus.swipes+' swipes available' : dollars.format(settings.nearby.perMeal)+' / meal'}</button><button class="secondary" data-action="edit">${escapeHtml(profile.diet)}</button>${mode==='nearby' ? `<button class="secondary" data-action="settings">${settings.nearby.distance} mi radius</button>` : ''}<button class="quiet" data-action="refresh">Refresh options ↻</button></div>
      <div class="planner-layout"><div>${results()}</div><aside>${summary()}</aside></div>
    </section>`;
}
function summary() {
  const nearby = mode==='nearby';
  const live=settings[mode].livePlan?.summary;
  const remaining=live ? (nearby ? (live.remaining_budget_cents===null?'Unknown':dollars.format(live.remaining_budget_cents/100)) : live.remaining_swipes ?? 'Unknown') : 'Awaiting plan';
  const cash = live?.total_cost_cents==null ? null : dollars.format(live.total_cost_cents/100);
  return `<div class="summary panel"><span class="eyebrow">Your day, coming together</span><h2>On your plate</h2><p>${Object.keys(selections).length} of ${profile.snacks ? 4 : 3} meals selected · ${sessionUser?'Saved to account':'Saved in this browser'}</p><div class="summary-progress"><span style="width:${Object.keys(selections).length/(profile.snacks?4:3)*100}%"></span></div>${meals.slice(0,profile.snacks?4:3).map(meal=>{
    const item=selections[meal];
    const dir=item?directionsControl(item,{compact:true}):'';
    return `<div class="summary-line"><div class="summary-meal"><span>${meal}</span><strong>${escapeHtml(item?.name || 'Not picked yet')}</strong></div>${item?`<div class="summary-actions">${dir}</div>`:''}</div>`;
  }).join('')}<div class="summary-total"><span>${nearby ? 'Cash remaining (tax/fees excluded)' : 'Swipes remaining'}</span><strong>${remaining}</strong></div>${nearby&&cash?`<p class="small">Cash subtotal (menu prices): ${cash}</p>`:''}${!nearby&&live?`<p class="small">Swipes used: ${live.swipes_used ?? 0}</p>`:''}<p class="small summary-note">${summaryNutritionNote(live)}</p>${undoSnapshot?`<button class="secondary" data-action="undo-swap">Undo last swap</button>`:''}<button class="primary" data-action="plan">View my plan</button></div>`;
}
function plan() { return `<section class="stack"><div class="heading"><span class="eyebrow">${modeLabels[mode]}</span><h1 tabindex="-1">A day that fuels you.</h1><p class="lede">Your selected meals stay with you as you explore.</p></div>${DailyNutritionDashboard()}${summary()}${results(true)}</section>`; }

function context() {
  const current = settings[mode];
  return `<section class="context stack heading">
    <div><span class="eyebrow">${modeLabels[mode]}</span><h1 tabindex="-1">Plan your day.</h1><p class="lede">${mode === 'campus' ? 'Set how many swipes you want to use today.' : 'Set your spending limits and walking origin. Distances use a straight-line radius.'}</p></div>
    <form class="panel stack" id="context">
      ${Object.keys(selections).length ? '<p>Applying new limits starts a fresh plan.</p>' : ''}
      ${mode === 'campus' ? numberField('swipes', 'Available meal swipes', current.swipes, 0, 20, 1, true) + `<div class="field"><label for="hall">Preferred dining hall</label><select id="hall" name="hall">${[['All halls','Any dining hall'],['evk',"Everybody’s Kitchen (EVK)"],['parkside','Parkside'],['university-village','USC Village']].map(([value,label])=>`<option value="${value}" ${current.hall===value?'selected':''}>${label}</option>`).join('')}</select></div>` : `
        <div class="field"><label for="cuisines">Preferred cuisines (optional, comma-separated)</label><input id="cuisines" name="cuisines" value="${escapeHtml(current.cuisines.join(', '))}" placeholder="Indian, Mexican, Italian"><p class="small">We prioritize these cuisines when matching dishes are available.</p></div>
        <div class="fields">${numberField('perMeal', 'Max per meal ($)', current.perMeal, 0, 999, .01, true)}
        ${numberField('daily', 'Daily budget ($)', current.daily, 0, 999, .01, true)}</div>
        ${numberField('distance', 'Search radius (mi)', current.distance, .05, 1, .01, true)}<label class="check"><input type="checkbox" name="includeUnknownPrices" ${current.includeUnknownPrices?'checked':''}>Include meals with unpublished prices</label><p class="small">These meals are labeled price unavailable. Their fit to your budget cannot be verified.</p>
        <div class="field"><label for="origin">Walking origin</label><select name="origin" id="origin">${['USC Village','Tommy Trojan','Leavey Library',...(current.coordinates?.label==='Current location'?['Current location']:[])].map(x=>`<option ${current.origin===x?'selected':''}>${x}</option>`).join('')}</select><p class="small">${current.coordinates?'Location set.':'Choose a campus landmark or use your location.'}</p></div><button type="button" class="secondary" data-action="locate">Use my location</button>
        `}
      <p class="small">Only known menu dishes are estimated. Cards show ranges and assumed servings; tracker totals use midpoints. Estimates cannot verify allergens or guarantee budget fit.</p><div class="actions"><button class="secondary" type="button" data-action="home">Back</button><button class="primary" type="submit">See meal options →</button></div>
    </form>
  </section>`;
}

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const sourceLabel = source => ({verified:'Official menu · today',needs_verification:'Live menu · confirm at venue',stale:'Saved menu · confirm at venue',estimated:'Estimated'})[source?.status] || source?.status || 'Source unknown';

function results(selectedOnly = false) {
  const current = settings[mode];
  if(loading) return '<div class="stack" role="status" aria-live="polite" aria-label="Loading meals"><div class="meal-loading"><span class="meal-spinner" aria-hidden="true"></span><div><strong>Finding meals for you</strong><p>Fetching live menus and personalizing your choices. This can take up to two minutes.</p></div></div><div class="skeleton" aria-hidden="true"></div><div class="skeleton" aria-hidden="true"></div><div class="skeleton" aria-hidden="true"></div></div>';
  if(!current.livePlan) return `<div class="empty"><h2>${requestError?'Meal service unavailable':!config.apiBaseUrl?'Waiting for the meal service':'Your plan starts here'}</h2><p>${escapeHtml(requestError || (!config.apiBaseUrl ? 'The backend connection has not been configured yet. Meals will appear here once the service is connected.' : 'Build a plan using the connected menu service.'))}</p>${config.apiBaseUrl?`<button class="primary" data-action="refresh">${requestError?'Retry':'Build my plan'}</button>`:''}</div>`;
  return `<div class="stack recommendations"><div class="meal-heading"><h2>Your daily picks</h2><span>${escapeHtml(profile.goal)}</span></div>${mode==='nearby' && !settings.nearby.includeUnknownPrices && current.livePlan.diversity?.eligible_restaurants===1?`<div class="panel stack"><p>Only one restaurant has readable dishes with verified prices matching your filters. Other nearby menus may not publish prices.</p><button class="secondary" data-action="include-unpriced">Include restaurants with unpublished prices</button><p class="small">These meals will be marked “Price unavailable · budget unverified.”</p></div>`:''}${requestError?`<p role="alert" class="results-note">${escapeHtml(requestError)} <button class="quiet" data-action="refresh">Retry</button></p>`:''}<details class="results-note"><summary>Menu sources &amp; notes</summary><p>Updated ${escapeHtml(new Date(current.livePlan.generated_at).toLocaleString())}. ${escapeHtml(current.livePlan.warnings?.join(' ') || 'Review source information before choosing meals.')}</p></details>

    ${meals.slice(0, profile.snacks ? 4 : 3).map(meal => {
      let options = getOptions(mode, meal, profile, current, selections);
      if (selectedOnly) options = selections[meal] ? [selections[meal]] : [];
      const cursor=Math.min(mealCursors[mode][meal] || 0,Math.max(0,options.length-1));
      return `<section class="meal-section" aria-label="${meal}"><div class="meal-heading"><h3>${meal}${meal==='Snack' ? ' · optional' : ''}</h3><span>${options.length} ${options.length===1?'choice':'choices'}</span></div>${options.length ? `<div class="meal-carousel" data-carousel="${meal}" role="region" aria-roledescription="carousel" aria-label="${meal} recommendations" tabindex="0">${options.length>1?`<div class="meal-carousel-nav"><button class="secondary" data-action="meal-slide" data-meal="${meal}" data-step="-1" aria-label="Previous ${meal.toLowerCase()} option" ${cursor===0?'disabled':''}>←</button><span class="small" aria-live="polite">Option ${cursor+1} of ${options.length} <span aria-hidden="true">${options.map((_,i)=>i===cursor?'●':'○').join(' ')}</span></span><button class="secondary" data-action="meal-slide" data-meal="${meal}" data-step="1" aria-label="Next ${meal.toLowerCase()} option" ${cursor===options.length-1?'disabled':''}>→</button></div>`:''}<div class="meal-grid">${options.slice(cursor,cursor+1).map((item) => { const index=cursor;
        const selected = selections[meal]?.id === item.id;
        const locked = modeState[mode].locks[meal];
        const venueLink = directionsUrl(item) ? `<a class="venue-link" href="${escapeHtml(directionsUrl(item))}" target="_blank" rel="noopener">${escapeHtml(item.place)}</a>` : `<p class="venue">${escapeHtml(item.place)}</p>`;
        const nutritionLabel = item.raw.nutrition?.display_status || (item.raw.nutrition?.status==='unknown'?'Nutrition unavailable':`${item.raw.nutrition.status} nutrition`);
        return `<article class="panel meal-card ${selected?'selected':''}"><div class="card-top"><span class="badge">${selected?'✓ Selected':index===0?'First pick':'Alternative'}</span><span class="small">${item.raw.source.status==='verified'?'Source checked':item.raw.source.status==='stale'?'Saved menu':item.raw.source.kind==='curated_snapshot'?'Saved menu':'Live menu'}${item.raw.source.verified_at||item.raw.source.menu_date?` · checked ${escapeHtml(item.raw.source.menu_date || new Date(item.raw.source.verified_at).toLocaleDateString())}`:''}</span></div>${safeUrl(item.raw.image_url)?`<img class="meal-photo" src="${escapeHtml(safeUrl(item.raw.image_url))}" alt="${escapeHtml(item.raw.venue.name)} (venue photo)" loading="lazy" onerror="this.hidden=true">`:""}<div class="meal-card-header"><img class="food-art" src="${foodArt(item.name)}" alt="" aria-hidden="true"><div><h3>${escapeHtml(item.name)}</h3>${venueLink}</div></div><div class="tags"><span>${escapeHtml(item.diet==='Any diet'?'Omnivore':item.diet)}</span>${item.cuisine?`<span>${escapeHtml(item.cuisine)}${item.raw.cuisine_status==='inferred'?' · AI guess':''}</span>`:''}<span>${mode==='nearby' ? item.raw.price_status==='estimated' && item.raw.price_range_cents ? 'AI-estimated '+dollars.format(item.raw.price_range_cents.low/100)+'–'+dollars.format(item.raw.price_range_cents.high/100)+' · budget uncertain':item.cost===null?'Price unavailable · budget unverified':dollars.format(item.cost)+' · tax/fees excluded' : 'Dining hall entry'}</span></div><p class="small">${mode==='nearby' ? item.distance===null?'Distance unavailable · ':Number(item.distance).toFixed(2)+' mi straight-line · ' : ''}${escapeHtml(nutritionLabel)} · allergens ${escapeHtml(item.raw.allergen_information_status)}</p>${mealNutrition(item.raw, meal.toLowerCase(), current.livePlan.date, true)}<div class="card-actions"><button class="${selected?'primary':'secondary'}" data-action="pick" data-meal="${meal}" data-id="${escapeHtml(item.id)}" aria-pressed="${selected}" ${locked?'disabled':''}>${selected?'Selected ✓':selections[meal]?'Swap to this':'Select meal'}</button><button class="quiet" data-action="details" data-meal="${meal}" data-id="${escapeHtml(item.id)}">Nutrition & details</button>${directionsControl(item)}</div>${selected ? `<button class="quiet lock" data-action="lock" data-meal="${meal}" aria-pressed="${Boolean(locked)}">${locked?'Unlock meal':'Lock meal'}</button>`:''}</article>`;
      }).join('')}</div></div>`:emptySlot(meal, selectedOnly)}</section>`;
    }).join('')}${swapPreviewSheet()}</div>`;
}
function details(meal, id) {
  const item = getOptions(mode,meal,profile,settings[mode],selections).find(x=>String(x.id)===String(id));
  if (!item) return;
  const dialog=document.querySelector('#details');
  dialog.innerHTML='<div class="sheet stack"></div>';
  const sheet=dialog.querySelector('.sheet');
  const title=document.createElement('h2'); title.textContent=item.name;
  const close=document.createElement('button'); close.className='quiet'; close.dataset.action='close'; close.textContent='Close ×';
  const info=document.createElement('p');
  info.textContent=`${item.place}. ${item.description || ''} Source: ${sourceLabel(item.raw.source)}. Menu date: ${item.raw.source.menu_date ?? 'not dated'}.${item.raw.walking_minutes!=null?` About ${item.raw.walking_minutes} min walk (straight-line estimate).`:''} ${item.raw.nutrition?.display_status || 'Nutrition'}: calories ${item.raw.nutrition.calories ?? 'unavailable'}, protein ${item.raw.nutrition.protein_g ?? 'unavailable'} g. Allergens: ${item.raw.allergen_information_status}. ${item.raw.payment_label || ''}`;
  sheet.append(close,title);
  const nutrition=document.createElement('article'); nutrition.className='meal-detail-nutrition stack';
  nutrition.innerHTML=mealNutrition(item.raw, meal.toLowerCase(), settings[mode].livePlan.date);
  sheet.append(nutrition,info);
  if(safeUrl(item.raw.image_url)) { const img=document.createElement('img'); img.src=safeUrl(item.raw.image_url); img.alt=`${item.raw.venue.name} (venue photo)`; img.className='detail-photo'; sheet.append(img); if(item.raw.image_credit) { const credit=document.createElement('p'); credit.className='small'; credit.textContent=`Venue photo: ${item.raw.image_credit} via Google`; sheet.append(credit); } }
  if(safeUrl(item.raw.source.url)) { const link=document.createElement('a'); link.href=safeUrl(item.raw.source.url); link.textContent='View menu source ↗'; link.target='_blank'; link.rel='noopener'; sheet.append(link); }
  const dirUrl=directionsUrl(item);
  if(dirUrl) { const link=document.createElement('a'); link.href=dirUrl; link.className='secondary directions-link'; link.textContent='Get directions'; link.target='_blank'; link.rel='noopener'; sheet.append(link); }
  else { const note=document.createElement('p'); note.className='small'; note.textContent=directionsUnavailable(item) || 'Directions unavailable'; sheet.append(note); }
  const select=document.createElement('button'); select.className='primary'; select.dataset.action='pick'; select.dataset.meal=meal; select.dataset.id=id; select.textContent='Select meal'; select.disabled=Boolean(modeState[mode].locks[meal]); sheet.append(select);
  dialog.showModal();
}

function render(focus = true) {
  app.innerHTML = { auth: authView, onboarding, home, context, results, plan }[view]();
  profileLink.hidden = view === 'onboarding' || view === 'auth';
  profileLink.textContent = sessionUser ? (sessionUser.display_name || sessionUser.email || 'Your profile') : 'Your profile';
  document.querySelectorAll('.bottom-nav button').forEach(b=>{
    const current = b.dataset.action === view || (b.dataset.action === 'edit' && view === 'onboarding');
    if (current) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  if (focus) {
    const heading = app.querySelector(view === 'onboarding' || view === 'auth' ? '.form-title h2' : 'h1');
    heading?.focus({ preventScroll: true });
    if ((view === 'onboarding' || view === 'auth') && heading) heading.scrollIntoView({ block: 'nearest' });
    else window.scrollTo(0, 0);
  }
}

function readDraft() {
  const data = new FormData(app.querySelector('#onboarding'));
  Object.assign(draft, Object.fromEntries(data));
  if (step === 2) draft.snacks = data.has('snacks');
}

app.addEventListener('submit', event => {
  event.preventDefault();
  if (event.target.id==='auth-form') {
    const data=new FormData(event.target);
    authError='';
    const body={ email:String(data.get('email')||'').trim(), password:String(data.get('password')||'') };
    if(authMode==='register') body.display_name=String(data.get('display_name')||'').trim() || body.email.split('@')[0];
    loading=true; render(false);
    (authMode==='login'?apiClient.login(body):apiClient.register(body)).then(async out=>{
      sessionUser=out.user || await apiClient.me().catch(()=>null);
      complete=true;
      await bootstrapSession();
      view=complete?'home':'onboarding';
      announce(authMode==='login'?'Signed in. Your saved plan will load when available.':'Account created. Set your preferences next.');
      if((config.apiBaseUrl || config.nutritionDemo) && view==='home' && !settings[mode].livePlan) refreshPlan();
    }).catch(error=>{ authError=error.message; }).finally(()=>{ loading=false; render(); });
    return;
  }
  if (event.target.id==='nutrition-targets') {
    const data=new FormData(event.target);
    const targets=Object.fromEntries(['calories','protein_g','carbs_g','fat_g'].map(key=>[key,data.get(key)===''?null:Number(data.get(key))]));
    import('./nutrition-local.js').then(local=>{nutritionState.data=local.setTargets(nutritionState.date,targets,{source:'manual'});render(false);announce('Daily targets saved for this browser session.');}); return;
  }
  if (event.target.id === 'onboarding') {
    readDraft();
    if (step < 3) {
      step += 1;
    } else {
      if (!['Gradually lose weight', 'Gradually gain weight'].includes(draft.goal)) draft.goalWeight = '';
      settings.campus.swipes = Number(draft.swipes ?? settings.campus.swipes);
      if(draft.origin) {
        settings.nearby.origin = draft.origin;
        settings.nearby.coordinates = ({'USC Village':{lat:34.0258,lng:-118.2854,label:'USC Village'},'Tommy Trojan':{lat:34.0206,lng:-118.2854,label:'Tommy Trojan'},'Leavey Library':{lat:34.0217,lng:-118.2829,label:'Leavey Library'}})[draft.origin];
      }
      profile = { ...draft };
      try {
        localStorage.setItem(storageKey, JSON.stringify(profile));
      } catch {
        // The profile can still be used until the tab closes.
      }
      if (getSessionToken()) {
        apiClient.saveProfile(profilePayload()).catch(()=>{});
      }
      for (const key of ['campus','nearby']) { modeState[key].selections = {}; modeState[key].locks = {}; delete settings[key].livePlan; }
      selections = modeState[mode].selections;
      persist();
      complete = true;
      view = 'home';
      // Estimate and store daily calorie targets from height/weight/goal before rendering meals.
      syncTargetsFromProfile(profile, { force: true }).then(estimated => {
        if (estimated?.confidence === 'estimated') {
          announce(`Daily target set to about ${estimated.targets.calories_kcal} kcal from your profile.`);
        } else if (profile.height && profile.weight) {
          announce('Could not estimate calorie targets right now. You can enter them under My Plan.');
        } else {
          announce('Add height and weight in your profile to estimate daily calorie targets.');
        }
        syncNutrition();
      });
    }
  } else {
    const data = new FormData(event.target);
    settings[mode] = mode === 'campus'
      ? { includeAIEstimates:true, swipes: Number(data.get('swipes')), cuisines: [], hall:String(data.get('hall') || '').trim() || 'All halls', livePlan: null }
      : { includeAIEstimates:true, includeUnknownPrices:data.has('includeUnknownPrices'), perMeal: Number(data.get('perMeal')), daily: Number(data.get('daily')), distance: Number(data.get('distance')), cuisines: String(data.get('cuisines') || '').split(',').map(x=>x.trim()).filter(Boolean), origin: data.get('origin'), coordinates: data.get('origin')==='Current location' ? settings.nearby.coordinates : ({'USC Village':{lat:34.0258,lng:-118.2854,label:'USC Village'},'Tommy Trojan':{lat:34.0206,lng:-118.2854,label:'Tommy Trojan'},'Leavey Library':{lat:34.0217,lng:-118.2829,label:'Leavey Library'}})[data.get('origin')], livePlan: null };
    modeState[mode].selections = {};
    modeState[mode].locks = {};
    selections = modeState[mode].selections;
    persist();
    view = 'home';
  }
  render();
  // Campus and off-campus keep separate plans; filter changes always rebuild the active mode.
  if((config.apiBaseUrl || config.nutritionDemo) && view==='home') refreshPlan();
});

document.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { action, meal, id } = button.dataset;
  switch (action) {
    case 'include-unpriced':
      settings.nearby.includeUnknownPrices=true;
      refreshPlan(); return;
    case 'meal-slide': {
      const count=getOptions(mode,meal,profile,settings[mode],selections).length;
      mealCursors[mode][meal]=Math.max(0,Math.min(count-1,(mealCursors[mode][meal] || 0)+Number(button.dataset.step)));
      const step=button.dataset.step;
      render(false);
      const region=[...app.querySelectorAll('[data-carousel]')].find(el=>el.dataset.carousel===meal);
      const next=region?.querySelector(`[data-step="${step}"]:not(:disabled)`);
      (next || region)?.focus({preventScroll:true}); return;
    }
    case 'nutrition-retry': syncNutrition(); return;
    case 'log': {
      const item = settings[mode].livePlan?.slots.find(x => x.slot === meal)?.recommendations.find(x => x.id === id);
      if (!item || settings[mode].livePlan.date !== nutritionState.date) return;
      const portion = Number(button.closest('article').querySelector('[data-portion]')?.value || 1);
      const paid=button.closest('article').querySelector('[data-actual-price]')?.value;
      const pending = logMeal(item, meal, portion, paid ? Math.round(Number(paid)*100) : null);
      if (button.closest('#details')) document.querySelector('#details').close();
      render(false);
      pending.then(() => { render(false); announce(nutritionState.error || 'Meal logged. Daily totals updated.'); });
      return;
    }
    case 'unlog': {
      const pending = removeLog(id); render(false);
      pending.then(() => { render(false); announce(nutritionState.error || 'Meal removed. Daily totals updated.'); }); return;
    }
    case 'home':
      view = 'home';
      break;
    case 'edit':
      draft = { ...profile };
      step = 0;
      view = 'onboarding';
      break;
    case 'back':
      readDraft();
      step -= 1;
      break;
    case 'mode': {
      const next = button.dataset.mode;
      if (!next || next === mode) break;
      mode = next;
      selections = modeState[mode].selections;
      view = 'home';
      // Each tab owns its own plan (usc_dining vs off_campus). Build if missing so the summary updates.
      if ((config.apiBaseUrl || config.nutritionDemo) && !settings[mode].livePlan) { refreshPlan(); return; }
      render(false);
      return;
    }
    case 'cuisines':
      view='context';render();document.querySelector('#cuisines')?.focus({preventScroll:true});return;
    case 'settings':
      view = 'context';
      break;
    case 'auth-open':
      authMode='login'; authError=''; view='auth'; break;
    case 'auth-toggle':
      authMode = authMode==='login'?'register':'login'; authError=''; break;
    case 'auth-skip':
      view = complete ? 'home' : 'onboarding'; break;
    case 'auth-signout':
      apiClient.logout().finally(()=>{ sessionUser=null; view='auth'; render(); announce('Signed out.'); }); return;
    case 'undo-swap':
      undoSwap(); return;
    case 'swap-cancel':
      pendingSwap=null; document.querySelector('#swap-preview')?.close(); render(false); return;
    case 'swap-confirm':
      document.querySelector('#swap-preview')?.close();
      selectLive(meal, id, {skipPreview:true}); return;
    case 'clear':
      if(config.browserNutrition) import('./nutrition-local.js').then(local=>{local.clear(); syncNutrition();});
      for(const key of ['campus','nearby']) { modeState[key].selections={}; modeState[key].locks={}; delete settings[key].livePlan; }
      delete settings.nearby.coordinates; settings.nearby.origin='USC Village'; settings.nearby.cuisines=[];
      selections=modeState[mode].selections; profile={...defaults}; draft={...defaults}; complete=false;
      try { localStorage.removeItem(storageKey); localStorage.removeItem(plansKey); } catch {}
      if(getSessionToken()) apiClient.logout().finally(()=>{ sessionUser=null; view='auth'; render(); announce('Saved profile and meal selections cleared.'); });
      else { view='auth'; render(); announce('Saved profile and meal selections cleared.'); }
      return;
    case 'locate':
      if(!navigator.geolocation) { announce('Location unavailable. Choose a campus landmark.'); return; }
      navigator.geolocation.getCurrentPosition(position=>{settings.nearby.coordinates={lat:position.coords.latitude,lng:position.coords.longitude,label:'Current location'}; settings.nearby.origin='Current location'; const select=document.querySelector('#origin'); if(select) { if(![...select.options].some(x=>x.value==='Current location')) select.add(new Option('Current location','Current location')); select.value='Current location'; } announce('Current location set. Apply limits to update meals.');},()=>announce('Location was not available. Choose a campus landmark instead.'),{timeout:10000}); return;
    case 'plan': view = 'plan'; break;
    case 'refresh': refreshPlan(); return;
    case 'details': lastFocus=button; details(meal,id); return;
    case 'close': document.querySelector('#details').close(); return;
    case 'lock':
      modeState[mode].locks[meal] = !modeState[mode].locks[meal];
      const lockedSlot=settings[mode].livePlan?.slots.find(slot=>slot.slot===meal.toLowerCase());
      if(lockedSlot) lockedSlot.locked=modeState[mode].locks[meal];
      persist(); render(false); announce(modeState[mode].locks[meal] ? 'Meal locked. Swaps will preserve this choice.' : 'Meal unlocked.'); return;
    case 'pick': {
      if(settings[mode].livePlan) { document.querySelector('#details').close(); selectLive(meal,id); }
      return;
    }
  }
  render();
});

render(false);

document.addEventListener('keydown', event => { if (event.target.matches('[role=tab]') && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) { event.preventDefault(); const key=event.key==='Home'?'campus':event.key==='End'?'nearby':mode==='campus'?'nearby':'campus'; document.querySelector('#tab-'+key).click(); document.querySelector('#tab-'+key).focus(); } });

document.querySelector('#details').addEventListener('close',()=>lastFocus?.isConnected && lastFocus.focus());

bootstrapSession().then(() => {
  render(false);
  if((config.apiBaseUrl || config.nutritionDemo) && view!=='auth' && !settings[mode].livePlan) refreshPlan();
  else syncNutrition();
});

async function syncNutrition() {
  if (nutritionState.busy) return;
  if (!config.apiBaseUrl && !config.nutritionDemo) return;
  if(config.browserNutrition) {
    const local=await import('./nutrition-local.js');
    for(const key of ['campus','nearby']) local.updatePlan(settings[key].livePlan || {date:localDate(),mode:key==='campus'?'usc_dining':'off_campus',slots:[]});
    // Fill missing targets from onboarding body stats (does not override manual edits).
    const current = local.daily(nutritionState.date);
    if (!nutrientsHaveValues(current.targets) || current.targets_source === 'profile_estimate') {
      await syncTargetsFromProfile(profile);
    }
  }
  const pending = loadNutrition(); render(false); await pending; render(false);
}
app.addEventListener('change', event => {
  if (event.target.id !== 'nutrition-date' || nutritionState.busy || !/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) return;
  nutritionState.date = event.target.value;
  syncNutrition();
});
syncNutrition();

// Horizontal gestures leave native vertical scrolling and form controls intact.
let swipeStart=null;
app.addEventListener('pointerdown',event=>{
  const region=event.target.closest('[data-carousel]');
  if(!region || event.target.closest('button,input,select,label,a') || !event.isPrimary) return;
  swipeStart={x:event.clientX,y:event.clientY,meal:region.dataset.carousel,id:event.pointerId};
});
app.addEventListener('pointercancel',()=>{swipeStart=null;});
app.addEventListener('pointerup',event=>{
  const start=swipeStart;swipeStart=null;
  if(!start || start.id!==event.pointerId) return;
  const dx=event.clientX-start.x,dy=event.clientY-start.y;
  if(Math.abs(dx)<50 || Math.abs(dx)<Math.abs(dy)*1.5) return;
  const region=[...app.querySelectorAll('[data-carousel]')].find(el=>el.dataset.carousel===start.meal);
  region?.querySelector(`[data-step="${dx<0?1:-1}"]:not(:disabled)`)?.click();
});
app.addEventListener('keydown',event=>{
  const region=event.target.closest('[data-carousel]');
  if(!region || event.target!==region || !['ArrowLeft','ArrowRight'].includes(event.key)) return;
  event.preventDefault();region.querySelector(`[data-step="${event.key==='ArrowRight'?1:-1}"]:not(:disabled)`)?.click();
});
