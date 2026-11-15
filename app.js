import { nutritionState, loadNutrition, logMeal, removeLog, NutritionSummary, DailyNutritionDashboard, mealNutrition } from './nutrition.js';
import { apiClient, toMeal } from './api.js';
import { config } from './config.js';
import { getOptions, meals } from './menu.js';

const app = document.querySelector('#app');
const profileLink = document.querySelector('#profile-link');
const storageKey = 'trojanplate-profile-v1';
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
let view = 'home';
let mode = 'campus';
let step = 0;
let selections = {};
const modeState = { campus: { selections: {}, locks: {} }, nearby: { selections: {}, locks: {} } };
try {
  const saved = config.liveMode ? null : JSON.parse(localStorage.getItem('trojanplate-plans-v3'));
  if (saved?.apiBaseUrl === config.apiBaseUrl && saved?.nutritionDemo === Boolean(config.nutritionDemo) && saved?.date === new Date().toLocaleDateString('en-CA')) {
    for (const key of ['campus', 'nearby']) {
      Object.assign(modeState[key], saved.states[key]);
      Object.assign(settings[key], saved.settings[key]);
    }
  }
} catch {}
selections = modeState[mode].selections;
let loading = false;
let requestError = '';
let lastFocus = null;
const mealCursors = {campus:{},nearby:{}};
function persist() {
  if(config.liveMode) return;
  try { localStorage.setItem('trojanplate-plans-v3', JSON.stringify({ apiBaseUrl:config.apiBaseUrl, nutritionDemo:Boolean(config.nutritionDemo), date: new Date().toLocaleDateString('en-CA'), states: modeState, settings })); } catch {}
}
let toastTimer;
function announce(message) {
  clearTimeout(toastTimer);
  document.querySelector('#toast').textContent = message;
  toastTimer = setTimeout(()=>document.querySelector('#toast').textContent='',5000);
}
const localDate = () => new Date().toLocaleDateString('en-CA');
const modeName = () => mode === 'campus' ? 'usc_dining' : 'off_campus';
function profilePayload() {
  return { goal: ({'Eat balanced meals':'balanced','Build muscle':'training_support','Fuel training':'training_support','Maintain weight':'maintenance'})[profile.goal] || 'balanced', dietary_preferences: profile.diet==='Any diet'?[]:[profile.diet.toLowerCase()], allergies: profile.allergies.split(/[,\n]/).map(x=>x.trim()).filter(Boolean), disliked_ingredients:profile.exclusions.split(',').map(x=>x.trim()).filter(Boolean), preferred_cuisines:settings[mode].cuisines, activity_level:profile.activity?.toLowerCase() || 'moderate', snacks:profile.snacks, targets:nutritionState.data?.targets, remaining:nutritionState.data ? Object.fromEntries(['calories','protein_g','carbs_g','fat_g'].map(key=>[key,nutritionState.data.targets[key]===null || nutritionState.data.consumed[key]===null?null:Math.max(0,nutritionState.data.targets[key]-nutritionState.data.consumed[key])])) : null };
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
async function refreshPlan() {
  if (!config.apiBaseUrl && !config.nutritionDemo) { render(false); return; }
  const key=mode;
  loading=true; requestError=''; render(false);
  try {
    const current=settings[key];
    const plan=config.nutritionDemo ? (await import('./nutrition-mock.js')).demoPlan(modeName(), localDate()) : await apiClient.generate({mode:modeName(), date:localDate(), previous_plan:current.livePlan, profile:profilePayload(), context:{meal_swipes_available:settings.campus.swipes,dining_hall:settings.campus.hall?.trim() || 'All halls',dining_dollars_cents:profile.diningDollars?Math.round(Number(profile.diningDollars)*100):null,origin:current.coordinates || {lat:34.0258,lng:-118.2854,label:current.origin || 'USC Village'},max_walk_m:Math.round((current.distance || .3)*1609.344),include_unknown_prices:Boolean(current.includeUnknownPrices),include_ai_estimates:true,per_meal_budget_cents:Math.round((current.perMeal ?? 15)*100),daily_budget_cents:Math.round((current.daily ?? 42)*100),preferred_cuisines:current.cuisines,locked_meal_ids:Object.entries(modeState[key].locks).filter(([,v])=>v).map(([meal])=>modeState[key].selections[meal]?.id)}});
    adoptPlan(plan,key);
    if(config.nutritionDemo) (await import('./nutrition-mock.js')).updatePlan(plan);
    if(config.browserNutrition) (await import('./nutrition-local.js')).updatePlan(plan);
    syncNutrition();
  } catch(error) { requestError=error.message; }
  finally { loading=false; render(false); }
}
async function selectLive(meal, id) {
  const key=mode;
  if(modeState[key].locks[meal] || loading) return;
  loading=true; render(false);
  try {
    const plan=config.nutritionDemo ? structuredClone(settings[key].livePlan) : await apiClient.swap({plan_id:settings[key].livePlan.plan_id,slot:meal.toLowerCase(),selected_recommendation_id:id,locked_meal_ids:Object.entries(modeState[key].locks).filter(([,v])=>v).map(([slot])=>modeState[key].selections[slot]?.id),plan_state:settings[key].livePlan});
    if(config.nutritionDemo) plan.slots.find(x=>x.slot===meal.toLowerCase()).selected_recommendation_id=id;
    adoptPlan(plan,key);
    if(config.nutritionDemo) (await import('./nutrition-mock.js')).updatePlan(plan);
    if(config.browserNutrition) (await import('./nutrition-local.js')).updatePlan(plan);
    syncNutrition();
    announce(plan.changes || 'Meal updated. Your remaining plan has been recalculated.');
  } catch(error) { requestError=error.message; }
  finally { loading=false; render(false); }
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
      <button type="button" class="quiet" data-action="home">Skip optional details / edit later</button>${complete?'<button type="button" class="quiet" data-action="clear">Clear saved data</button>':''}
    </form>
  </section>`;
}

function heroImage() {
  const url=settings[mode].livePlan?.slots.flatMap(slot=>slot.recommendations).find(item=>safeUrl(item.image_url))?.image_url;
  return safeUrl(url);
}
function foodArt(name) {
  const categories=[[/salad|greens|kale|caesar/i,'salad'],[/pasta|spaghetti|gnocchi|penne|rigatoni|noodle/i,'pasta'],[/sandwich|toast|bagel|panini/i,'sandwich'],[/egg|omelet|scramble|breakfast/i,'egg'],[/fish|salmon|tuna/i,'fish'],[/chicken|turkey|poultry/i,'chicken'],[/burger/i,'burger'],[/rice|curry|stir.fry/i,'rice'],[/fruit|apple|berries/i,'apple'],[/soup|stew|ragout|lentil|bean|bowl/i,'bowl']];
  return 'assets/art/'+(categories.find(([pattern])=>pattern.test(name))?.[1] || 'plate')+'.png';
}
function safeUrl(value) { try { const url=new URL(value); return ['https:','http:'].includes(url.protocol)?url.href:''; } catch { return ''; } }
function home() {
  return `<section class="home-heading" data-enter><div><span class="eyebrow">${new Date().toLocaleDateString('en-US', {weekday:'long',month:'long',day:'numeric'})}</span><h1 tabindex="-1">Eat well.<br>Fight on.</h1><p class="lede">Your meals. Your goals. Your life at USC.</p></div><span class="day-stamp">Made for your campus.</span></section>
    ${NutritionSummary(true)}
    <div class="tabs" role="tablist" aria-label="Dining mode">${['campus','nearby'].map(key => `<button role="tab" id="tab-${key}" aria-controls="mode-panel" aria-selected="${mode===key}" tabindex="${mode===key ? 0 : -1}" data-action="mode" data-mode="${key}">${key==='campus' ? 'USC Dining' : 'Off-Campus'}</button>`).join('')}</div>
    <section id="mode-panel" role="tabpanel" aria-labelledby="tab-${mode}">
      <div class="food-hero ${heroImage()?'':'without-photo'}"><div><span class="hero-label">${mode==='campus' ? 'USC Dining' : 'Near campus'}</span><h2>${mode==='campus' ? 'Good food. Close to class.' : 'Take a delicious study break.'}</h2><p>${mode==='campus' ? 'Your dining hall options, in one place.' : 'Near '+escapeHtml(settings.nearby.origin)+', within your chosen radius.'}</p></div>${heroImage()?`<img src="${escapeHtml(heroImage())}" alt="${escapeHtml(getOptions(mode,'Breakfast',profile,settings[mode])[0]?.name || 'Meal from the menu service')}" onerror="this.hidden=true;this.parentElement.classList.add('without-photo')">`:'<img src="assets/art/plate.png" alt="" aria-hidden="true">'}</div>
      <div class="filter-row"><button class="secondary cuisine-filter" data-action="cuisines">Cuisine: ${escapeHtml(settings[mode].cuisines.join(', ') || 'Any')}</button><button class="secondary" data-action="settings">${mode==='campus' ? settings.campus.swipes+' swipes available' : dollars.format(settings.nearby.perMeal)+' / meal'}</button><button class="secondary" data-action="edit">${escapeHtml(profile.diet)}</button>${mode==='nearby' ? `<button class="secondary" data-action="settings">${settings.nearby.distance} mi radius</button>` : ''}<button class="quiet" data-action="refresh">Refresh options ↻</button></div>
      <div class="planner-layout"><div>${results()}</div><aside>${summary()}</aside></div>
    </section>`;
}
function summary() {
  const nearby = mode==='nearby';
  const live=settings[mode].livePlan?.summary;
  const remaining=live ? (nearby ? (live.remaining_budget_cents===null?'Unknown':dollars.format(live.remaining_budget_cents/100)) : live.remaining_swipes ?? 'Unknown') : 'Awaiting plan';
  return `<div class="summary panel"><span class="eyebrow">Your day, coming together</span><h2>On your plate</h2><p>${Object.keys(selections).length} of ${profile.snacks ? 4 : 3} meals selected</p><div class="summary-progress"><span style="width:${Object.keys(selections).length/(profile.snacks?4:3)*100}%"></span></div>${meals.slice(0,profile.snacks?4:3).map(meal=>`<div class="summary-line"><span>${meal}</span><strong>${escapeHtml(selections[meal]?.name || 'Not picked yet')}</strong></div>`).join('')}<div class="summary-total"><span>${nearby ? 'Budget remaining' : 'Swipes remaining'}</span><strong>${remaining}</strong></div><p class="small">${live ? 'Nutrition coverage: '+escapeHtml(live.nutrition.coverage)+'. Verify uncertain menu and allergen details with the provider.' : 'Meal totals will appear when the service returns your plan.'}</p><button class="primary" data-action="plan">View my plan</button></div>`;
}
function plan() { return `<section class="stack"><div class="heading"><span class="eyebrow">${modeLabels[mode]}</span><h1 tabindex="-1">A day that fuels you.</h1><p class="lede">Your selected meals stay with you as you explore.</p></div>${DailyNutritionDashboard()}${summary()}${results()}</section>`; }

function context() {
  const current = settings[mode];
  return `<section class="context stack heading">
    <div><span class="eyebrow">${modeLabels[mode]}</span><h1 tabindex="-1">Plan your day.</h1><p class="lede">${mode === 'campus' ? 'Set how many swipes you want to use today.' : 'Set your spending limits and walking origin. Distances use a straight-line radius.'}</p></div>
    <form class="panel stack" id="context">
      <div class="field"><label for="cuisines">Preferred cuisines (optional, comma-separated)</label><input id="cuisines" name="cuisines" value="${escapeHtml(current.cuisines.join(', '))}" placeholder="Indian, Mexican, Italian"><p class="small">We prioritize these cuisines when matching dishes are available.</p></div>
      ${Object.keys(selections).length ? '<p>Applying new limits starts a fresh plan.</p>' : ''}
      ${mode === 'campus' ? numberField('swipes', 'Available meal swipes', current.swipes, 0, 20, 1, true) + `<div class="field"><label for="hall">Preferred dining hall</label><select id="hall" name="hall">${[['All halls','Any dining hall'],['evk',"Everybody’s Kitchen (EVK)"],['parkside','Parkside'],['university-village','USC Village']].map(([value,label])=>`<option value="${value}" ${current.hall===value?'selected':''}>${label}</option>`).join('')}</select></div>` : `
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
        return `<article class="panel meal-card ${selected?'selected':''}"><div class="card-top"><span class="badge">${selected?'✓ Selected':index===0?'First pick':'Alternative'}</span><span class="small">${item.raw.source.status==='verified'?'Source checked':'Live menu'}</span></div>${safeUrl(item.raw.image_url)?`<img class="meal-photo" src="${escapeHtml(safeUrl(item.raw.image_url))}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="this.hidden=true">`:""}<div class="meal-card-header"><img class="food-art" src="${foodArt(item.name)}" alt="" aria-hidden="true"><div><h3>${escapeHtml(item.name)}</h3><p class="venue">${escapeHtml(item.place)}</p></div></div><details class="meal-explanation"><summary>Why this meal</summary><p>${escapeHtml(item.description)}</p></details><div class="tags"><span>${escapeHtml(item.diet==='Any diet'?'Omnivore':item.diet)}</span><span>${mode==='nearby' ? item.raw.price_status==='estimated'?'AI-estimated '+dollars.format(item.raw.price_range_cents.low/100)+'–'+dollars.format(item.raw.price_range_cents.high/100)+' · budget uncertain':item.cost===null?'Price unavailable · budget unverified':dollars.format(item.cost) : 'Dining hall entry'}</span></div><p class="small">${mode==='nearby' ? item.distance===null?'Distance unavailable · ':Number(item.distance).toFixed(2)+' mi straight-line · ' : ''}${escapeHtml(item.raw.nutrition.status)} nutrition · allergens ${escapeHtml(item.raw.allergen_information_status)}</p>${mealNutrition(item.raw, meal.toLowerCase(), current.livePlan.date)}<div class="card-actions"><button class="${selected?'primary':'secondary'}" data-action="pick" data-meal="${meal}" data-id="${escapeHtml(item.id)}" aria-pressed="${selected}" ${locked?'disabled':''}>${selected?'Selected ✓':selections[meal]?'Swap to this':'Select meal'}</button><button class="quiet" data-action="details" data-meal="${meal}" data-id="${escapeHtml(item.id)}">Details</button></div>${selected ? `<button class="quiet lock" data-action="lock" data-meal="${meal}" aria-pressed="${Boolean(locked)}">${locked?'Unlock meal':'Lock meal'}</button>`:''}</article>`;
      }).join('')}</div></div>`:`<div class="empty"><h3>${selectedOnly?'No meal selected yet':'No eligible meals returned'}</h3><p>${selectedOnly?'Choose a meal from Home to add it here.':escapeHtml(current.livePlan.slots.find(slot=>slot.slot===meal.toLowerCase())?.availability_note || 'The service returned no meals for these preferences. You can adjust optional limits or try again later.')}</p><button class="quiet" data-action="${selectedOnly?'home':'settings'}">${selectedOnly?'Browse meals':'Edit limits'}</button></div>`}</section>`;
    }).join('')}</div>`;
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
  info.textContent=`${item.place}. ${item.description || ''} Source: ${item.raw.source.status}. Menu date: ${item.raw.source.menu_date}. Nutrition: ${item.raw.nutrition.status}; calories ${item.raw.nutrition.calories ?? 'unknown'}, protein ${item.raw.nutrition.protein_g ?? 'unknown'} g. Allergens: ${item.raw.allergen_information_status}. ${item.raw.payment_label || ''}`;
  sheet.append(close,title,info);
  if(safeUrl(item.raw.image_url)) { const img=document.createElement('img'); img.src=safeUrl(item.raw.image_url); img.alt=item.name; img.className='detail-photo'; sheet.append(img); }
  if(safeUrl(item.raw.source.url)) { const link=document.createElement('a'); link.href=safeUrl(item.raw.source.url); link.textContent='View menu source ↗'; link.target='_blank'; link.rel='noopener'; sheet.append(link); }
  const select=document.createElement('button'); select.className='primary'; select.dataset.action='pick'; select.dataset.meal=meal; select.dataset.id=id; select.textContent='Select meal'; select.disabled=Boolean(modeState[mode].locks[meal]); sheet.append(select);
  dialog.showModal();
}

function render(focus = true) {
  app.innerHTML = { onboarding, home, context, results, plan }[view]();
  profileLink.hidden = view === 'onboarding';
  document.querySelectorAll('.bottom-nav button').forEach(b=>b.setAttribute('aria-current', (b.dataset.action===view || b.dataset.action==='edit' && view==='onboarding')?'page':'false'));
  if (focus) {
    const heading = app.querySelector(view === 'onboarding' ? '.form-title h2' : 'h1');
    heading.focus({ preventScroll: true });
    if (view === 'onboarding') heading.scrollIntoView({ block: 'nearest' });
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
  if (event.target.id==='nutrition-targets') {
    const data=new FormData(event.target);
    const targets=Object.fromEntries(['calories','protein_g','carbs_g','fat_g'].map(key=>[key,data.get(key)===''?null:Number(data.get(key))]));
    import('./nutrition-local.js').then(local=>{nutritionState.data=local.setTargets(nutritionState.date,targets);render(false);announce('Daily targets saved for this browser session.');}); return;
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
      for (const key of ['campus','nearby']) { modeState[key].selections = {}; modeState[key].locks = {}; delete settings[key].livePlan; }
      selections = modeState[mode].selections;
      persist();
      complete = true;
      view = 'home';
    }
  } else {
    const data = new FormData(event.target);
    settings[mode] = mode === 'campus'
      ? { includeAIEstimates:true, swipes: Number(data.get('swipes')), cuisines: String(data.get('cuisines') || '').split(',').map(x=>x.trim()).filter(Boolean), hall:String(data.get('hall') || '').trim() || 'All halls' }
      : { includeAIEstimates:true, includeUnknownPrices:data.has('includeUnknownPrices'), perMeal: Number(data.get('perMeal')), daily: Number(data.get('daily')), distance: Number(data.get('distance')), cuisines: String(data.get('cuisines') || '').split(',').map(x=>x.trim()).filter(Boolean), origin: data.get('origin'), coordinates: data.get('origin')==='Current location' ? settings.nearby.coordinates : ({'USC Village':{lat:34.0258,lng:-118.2854,label:'USC Village'},'Tommy Trojan':{lat:34.0206,lng:-118.2854,label:'Tommy Trojan'},'Leavey Library':{lat:34.0217,lng:-118.2829,label:'Leavey Library'}})[data.get('origin')] };
    modeState[mode].selections = {};
    modeState[mode].locks = {};
    selections = modeState[mode].selections;
    persist();
    view = 'home';
  }
  render();
  if((config.apiBaseUrl || config.nutritionDemo) && view==='home' && !settings[mode].livePlan) refreshPlan();
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
    case 'mode':
      if(loading) return;
      mode = button.dataset.mode;
      selections = modeState[mode].selections;
      view = 'home';
      if((config.apiBaseUrl || config.nutritionDemo) && !settings[mode].livePlan) { refreshPlan(); return; }
      break;
    case 'cuisines':
      view='context';render();document.querySelector('#cuisines')?.focus({preventScroll:true});return;
    case 'settings':
      view = 'context';
      break;
    case 'clear':
      if(config.browserNutrition) import('./nutrition-local.js').then(local=>{local.clear(); syncNutrition();});
      for(const key of ['campus','nearby']) { modeState[key].selections={}; modeState[key].locks={}; delete settings[key].livePlan; }
      delete settings.nearby.coordinates; settings.nearby.origin='USC Village'; settings.nearby.cuisines=[];
      selections=modeState[mode].selections; profile={...defaults}; draft={...defaults}; complete=false;
      try { localStorage.removeItem(storageKey); localStorage.removeItem('trojanplate-plans-v3'); } catch {}
      view='home'; render(); announce('Saved profile and meal selections cleared.'); return;
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
if((config.apiBaseUrl || config.nutritionDemo) && !settings[mode].livePlan) refreshPlan();

async function syncNutrition() {
  if (nutritionState.busy) return;
  if (!config.apiBaseUrl && !config.nutritionDemo) return;
  if(config.browserNutrition) {
    const local=await import('./nutrition-local.js');
    for(const key of ['campus','nearby']) local.updatePlan(settings[key].livePlan || {date:localDate(),mode:key==='campus'?'usc_dining':'off_campus',slots:[]});
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
