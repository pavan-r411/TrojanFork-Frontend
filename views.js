// Pure HTML builders. Every dynamic string goes through esc().
import { GOALS, DIETS, ALLERGENS, CUISINES, ORIGINS, MEALS, MEAL_LABEL, FULL_DAY, DISTANCE_BANDS, SORTS, money } from './flow-state.js';
import { cmToFtIn, kgToLb } from './targets.js';

export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Hide machine labels such as "regular_menu"; show only human-readable notes.
const nice = s => (typeof s === 'string' && s && !/^[a-z0-9_]+$/.test(s)) ? s : '';
const pressed = on => `aria-pressed="${on ? 'true' : 'false'}"`;
const num = (v, d = 0) => (Number.isFinite(v) ? Number(v).toFixed(d) : '');
const fmt = n => Math.round(n).toLocaleString('en-US');

const ICON = {
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/></svg>',
  live: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>',
};

export const banner = (kind, html) => `<div class="banner ${kind === 'ok' ? '' : kind}" role="${kind === 'bad' ? 'alert' : 'status'}">${kind === 'warn' || kind === 'bad' ? ICON.warn : kind === 'ok' ? ICON.live : ICON.info}<div>${html}</div></div>`;

const ART = [[/burger/i, 'burger'], [/pizza|pasta|noodle|spaghetti|ramen|lasagna|mac(?:aroni)?\b|bolognese/i, 'pasta'], [/sandwich|wrap|burrito|taco|quesadilla|hot dog|bagel/i, 'sandwich'],
  [/salad|greens|slaw/i, 'salad'], [/chicken|turkey|wing/i, 'chicken'], [/fish|salmon|tuna|shrimp|sushi|tilapia|poke|cod\b/i, 'fish'], [/egg|omelet|scramble|frittata/i, 'egg'],
  [/rice|curry|biryani|pilaf/i, 'rice'], [/fruit|oat|yogurt|parfait|granola/i, 'apple'], [/bowl|soup|stew|chili|beans?/i, 'bowl']];
export const artFor = o => `assets/art/${(ART.find(([re]) => re.test(`${o.name} ${o.category || ''}`)) || [0, 'plate'])[1]}.png`;

// ---------------------------------------------------------------- top bar, day bar, nav
export function topBar(store, user) {
  const who = user ? `<span>${esc(user.display_name || user.email)}</span>` : store.guest ? '<span>Guest</span>' : '';
  return `<button class="brand" type="button" data-act="home" aria-label="Trojan Fork home"><img src="assets/art/trojan-mark.png" alt="" onerror="this.style.display='none'">Trojan Fork</button><div class="who">${who}</div>`;
}

export function dayBar({ kcal, target, setup, cashCents, swipesLeft, dailyLeft, picks }) {
  const r = 20; const c = 2 * Math.PI * r; const frac = Math.min(1, target ? kcal / target : 0);
  const ring = `<svg class="ring" viewBox="0 0 50 50" aria-hidden="true"><circle class="track" cx="25" cy="25" r="${r}"/><circle class="fill" cx="25" cy="25" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - frac)).toFixed(1)}"/><text x="25" y="29" text-anchor="middle">${Math.round(frac * 100)}%</text></svg>`;
  const money2 = setup.mode === 'off_campus'
    ? `${money(cashCents)} spent${dailyLeft != null ? ` · ${money(Math.round(dailyLeft * 100))} left today` : ''}`
    : `${swipesLeft} swipe${swipesLeft === 1 ? '' : 's'} left`;
  return `<div class="daybar"><div class="daybar-in"><button type="button" data-act="day" aria-label="Open my day">${ring}<span><strong>${fmt(kcal)} of ${fmt(target)} kcal planned</strong><span class="sub" style="display:block">${picks ? `${picks} meal${picks === 1 ? '' : 's'} chosen · ` : 'Nothing chosen yet · '}${money2}</span></span></button></div></div>`;
}

export const bottomNav = view => {
  const item = (v, label, icon) => `<button type="button" data-act="nav" data-v="${v}" ${view === v || (v === 'plan' && (view === 'options' || view === 'fullday')) ? 'aria-current="page"' : ''}>${icon}${label}</button>`;
  const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  return `<nav class="nav" aria-label="Main">${item('plan', 'Find meals', svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'))}${item('day', 'My day', svg('<path d="M5 3v7a3 3 0 0 0 6 0V3M8 3v18M19 3v18M19 3c-5 3-5 9 0 9"/>'))}${item('profile', 'Profile', svg('<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>'))}</nav>`;
};

// ---------------------------------------------------------------- welcome and auth
export function welcome() {
  return `<section class="hero stack">
    <img class="mark" src="assets/art/trojan-mark.png" alt="" onerror="this.style.display='none'">
    <h1 id="view-title" tabindex="-1">Your goals.<br>Your campus.<br>Your plate.</h1>
    <p class="lede">Meals picked from today's USC dining hall menus and restaurants a short walk away, matched to your goal, your allergies and your budget.</p>
    <ol class="path" aria-label="How it works">
      <li><strong>Create an account</strong><span>Or continue as a guest. Nothing is required.</span></li>
      <li><strong>Build your profile</strong><span>Goal, body, diet and allergies in five short steps.</span></li>
      <li><strong>Get your daily target</strong><span>A calorie and protein estimate you can adjust.</span></li>
      <li><strong>Get three meals at a time</strong><span>Real dishes you can walk to, with the reason each one fits.</span></li>
    </ol>
    <div class="stack tight">
      <button class="btn primary block" type="button" data-act="auth" data-v="register">Create account</button>
      <button class="btn secondary block" type="button" data-act="auth" data-v="login">Log in</button>
      <button class="btn ghost block" type="button" data-act="guest">Continue as guest</button>
    </div>
    <p class="muted">Menus are read live from USC Hospitality. Nutrition is an estimate for planning, not medical advice. Student-built, not affiliated with USC.</p>
  </section>`;
}

export function authView({ mode, error, busy }) {
  const reg = mode === 'register';
  return `<form class="stack" id="auth-form" novalidate>
    <div class="stack tight"><h2 id="view-title" tabindex="-1">${reg ? 'Create your account' : 'Welcome back'}</h2>
    <p class="lede">${reg ? 'Save your profile so it follows you to any device.' : 'Log in to load your saved profile.'}</p></div>
    ${reg ? '<div class="field"><label for="a-name">First name</label><input class="input" id="a-name" name="display_name" autocomplete="given-name" maxlength="40"></div>' : ''}
    <div class="field"><label for="a-email">Email</label><input class="input" id="a-email" name="email" type="email" autocomplete="email" required></div>
    <div class="field"><label for="a-pass">Password</label><input class="input" id="a-pass" name="password" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" minlength="8" required>${reg ? '<span class="hint">At least 8 characters.</span>' : ''}</div>
    ${error ? `<p class="err" role="alert">${esc(error)}</p>` : ''}
    <button class="btn primary block" type="submit" ${busy ? 'disabled' : ''}>${busy ? 'One moment…' : reg ? 'Create account' : 'Log in'}</button>
    <div class="row split"><button class="btn ghost" type="button" data-act="auth" data-v="${reg ? 'login' : 'register'}">${reg ? 'I already have an account' : 'Create an account'}</button><button class="btn ghost" type="button" data-act="guest">Continue as guest</button></div>
  </form>`;
}

// ---------------------------------------------------------------- onboarding
export const ONB_STEPS = ['goal', 'about', 'body', 'diet', 'plan'];

export function onboarding(step, draft, ctx) {
  const key = ONB_STEPS[step];
  const head = `<div class="stack tight"><div class="stephead">${step > 0 ? '<button class="back" type="button" data-act="onb-back" aria-label="Back">←</button>' : ''}<p class="muted">Step ${step + 1} of ${ONB_STEPS.length}</p></div><div class="progress" aria-hidden="true">${ONB_STEPS.map((_, i) => `<i class="${i <= step ? 'done' : ''}"></i>`).join('')}</div></div>`;
  const body = { goal: stepGoal, about: stepAbout, body: stepBody, diet: stepDiet, plan: stepPlan }[key](draft, ctx);
  return `<div class="stack">${head}${body}</div>`;
}

const stepGoal = d => `<div class="stack"><div class="stack tight"><h2 id="view-title" tabindex="-1">What's your goal?</h2><p class="lede">This sets your daily calorie and protein target. You can change it any time.</p></div>
  <div class="choices" role="group" aria-label="Goal">${GOALS.map(g => `<button class="choice" type="button" data-act="goal" data-v="${esc(g.key)}" ${pressed(d.goal === g.key)}><div><strong>${esc(g.label)}</strong><span>${esc(g.sub)}</span></div></button>`).join('')}</div>
  <button class="btn primary block" type="button" data-act="onb-next">Continue</button></div>`;

const stepAbout = (d, ctx) => `<form class="stack" id="onb-form"><div class="stack tight"><h2 id="view-title" tabindex="-1">About you</h2><p class="lede">Used only to estimate your daily needs. Everything here is optional.</p></div>
  <div class="field"><span class="legend">Units</span><div class="seg" role="group" aria-label="Units"><button type="button" data-act="units" data-v="us" ${pressed(d.units === 'us')}>US (ft, lb)</button><button type="button" data-act="units" data-v="metric" ${pressed(d.units === 'metric')}>Metric (cm, kg)</button></div></div>
  <div class="field"><span class="legend">Sex</span><div class="chips" role="group" aria-label="Sex">${['Female', 'Male', ''].map(s => `<button class="chip" type="button" data-act="sex" data-v="${s}" ${pressed(d.sex === s)}>${s || 'Prefer not to say'}</button>`).join('')}</div><span class="hint">Used in the standard calorie equation. Skipping uses a middle value.</span></div>
  <div class="field"><label for="f-age">Age</label><input class="input" id="f-age" name="age" inputmode="numeric" type="number" min="14" max="99" value="${esc(d.ageYears)}" placeholder="e.g. 21"><span class="hint">${Number(d.ageYears) > 0 && Number(d.ageYears) < 18 ? 'Weight-change plans are for adults 18 and over, so we will plan at maintenance.' : 'Adults 18 and over can plan weight change.'}</span></div>
  ${ctx.error ? `<p class="err" role="alert">${esc(ctx.error)}</p>` : ''}<button class="btn primary block" type="submit">Continue</button></form>`;

function stepBody(d, ctx) {
  const us = d.units === 'us'; const ftIn = Number.isFinite(Number(d.heightCm)) && d.heightCm !== '' ? cmToFtIn(Number(d.heightCm)) : { ft: '', inches: '' };
  const weight = d.weightKg === '' ? '' : (us ? Math.round(kgToLb(Number(d.weightKg))) : Number(Number(d.weightKg).toFixed(1)));
  const goalW = d.goalWeightKg === '' ? '' : (us ? Math.round(kgToLb(Number(d.goalWeightKg))) : Number(Number(d.goalWeightKg).toFixed(1)));
  const wantsGoalWeight = ['Gradually lose weight', 'Gradually gain weight'].includes(d.goal);
  return `<form class="stack" id="onb-form"><div class="stack tight"><h2 id="view-title" tabindex="-1">Your body</h2><p class="lede">Height and weight let us estimate your calories. Skip it and we plan around a general 2,000 kcal day.</p></div>
    ${us ? `<div class="dual"><div class="field"><label for="f-ft">Height (ft)</label><input class="input" id="f-ft" name="ft" type="number" inputmode="numeric" min="3" max="7" value="${esc(ftIn.ft)}"></div><div class="field"><label for="f-in">(in)</label><input class="input" id="f-in" name="inch" type="number" inputmode="decimal" min="0" max="11.9" step="0.5" value="${esc(ftIn.inches)}"></div></div>`
      : `<div class="field"><label for="f-cm">Height (cm)</label><input class="input" id="f-cm" name="cm" type="number" inputmode="decimal" min="120" max="230" value="${esc(d.heightCm === '' ? '' : Math.round(d.heightCm))}"></div>`}
    <div class="field"><label for="f-w">Current weight (${us ? 'lb' : 'kg'})</label><input class="input" id="f-w" name="weight" type="number" inputmode="decimal" min="${us ? 80 : 35}" max="${us ? 550 : 250}" step="any" value="${esc(weight)}"></div>
    ${wantsGoalWeight ? `<div class="field"><label for="f-gw">Goal weight (${us ? 'lb' : 'kg'}) <span class="hint">optional</span></label><input class="input" id="f-gw" name="goalweight" type="number" inputmode="decimal" step="any" value="${esc(goalW)}"></div>` : ''}
    <div class="field"><span class="legend">Activity level</span><div class="chips" role="group" aria-label="Activity level">${['Mostly sitting', 'Light', 'Moderate', 'Very active'].map(a => `<button class="chip" type="button" data-act="activity" data-v="${a}" ${pressed(d.activity === a)}>${a}</button>`).join('')}</div><span class="hint">Light is a few workouts or a lot of walking between classes a week.</span></div>
    ${ctx.error ? `<p class="err" role="alert">${esc(ctx.error)}</p>` : ''}
    <button class="btn primary block" type="submit">Continue</button><button class="btn ghost block" type="button" data-act="skip-body">Skip, use a general plan</button></form>`;
}

const stepDiet = d => `<form class="stack" id="onb-form"><div class="stack tight"><h2 id="view-title" tabindex="-1">Diet and allergies</h2><p class="lede">Allergies and diet are hard rules. A dish that breaks one is never shown.</p></div>
  <div class="field"><span class="legend">Diet</span><div class="chips" role="group" aria-label="Diet">${DIETS.map(([k, l]) => `<button class="chip" type="button" data-act="diet" data-v="${k}" ${pressed(d.diet === k)}>${l}</button>`).join('')}</div></div>
  <div class="field"><span class="legend">Allergies</span><div class="chips" role="group" aria-label="Allergies">${ALLERGENS.map(a => `<button class="chip" type="button" data-act="allergy" data-v="${a}" ${pressed(d.allergies.includes(a))}>${a}</button>`).join('')}</div></div>
  <div class="field"><label for="f-other">Any other allergy</label><input class="input" id="f-other" name="other" value="${esc(d.otherAllergies)}" placeholder="e.g. kiwi, mustard"><span class="hint">Separate with commas. We hide dishes that mention them.</span></div>
  <div class="field"><label for="f-dis">Foods you'd rather skip</label><input class="input" id="f-dis" name="dislikes" value="${esc(d.dislikes)}" placeholder="e.g. mushrooms, olives"></div>
  <button class="btn primary block" type="submit">Continue</button></form>`;

export function stepPlan(d, ctx) {
  const { plans, current } = ctx; const change = ['Gradually lose weight', 'Gradually gain weight'].includes(d.goal) && plans.length;
  const t = current.result?.targets; const est = current.source === 'estimated';
  const unit = d.units === 'us' ? 'lb' : 'kg'; const wk = lb => (d.units === 'us' ? lb : lb / 2.2046226);
  const paceCards = change ? `<div class="paceplans" role="group" aria-label="Pace">${plans.map(p => {
    const w = Math.abs(p.result.details.weekly_change_lb); const weeks = p.result.details.weeks_to_goal;
    return `<button class="pace" type="button" data-act="pace" data-v="${p.pace}" ${pressed(d.pace === p.pace)}><span class="row split"><strong>${p.pace}</strong><span class="pill ${p.pace === 'Steady' ? 'gold' : ''}">${p.pace === 'Steady' ? 'Most people' : p.pace === 'Gentle' ? 'Easiest' : 'Hardest'}</span></span><b>${fmt(p.calories)} kcal/day</b><span class="meta">${num(wk(w), 1)} ${unit} per week${weeks ? ` · about ${weeks} weeks to your goal` : ''}</span></button>`;
  }).join('')}</div>` : '';
  const single = !change ? `<div class="panel"><span class="legend">Your daily target</span><b style="font-size:34px;letter-spacing:-.03em;color:var(--wine-dark)">${fmt(current.calories_kcal)} kcal</b><span class="hint">${est ? 'Estimated with the Mifflin-St Jeor equation from your height, weight, age and activity.' : 'A general 2,000 kcal day, because height and weight were skipped.'}</span></div>` : '';
  const macros = est && t ? `<div class="macros" aria-label="Daily macros"><div><b>${t.protein_g} g</b><span>Protein</span></div><div><b>${t.carbohydrates_g} g</b><span>Carbs</span></div><div><b>${t.fat_g} g</b><span>Fat</span></div></div>` : `<div class="macros"><div><b>${current.protein_g} g</b><span>Protein</span></div></div>`;
  const notes = (current.result?.details?.notes || []).map(n => `<p class="hint">${esc(n)}</p>`).join('');
  return `<div class="stack"><div class="stack tight"><h2 id="view-title" tabindex="-1">${change ? 'Pick your pace' : 'Your daily plan'}</h2><p class="lede">${change ? 'Slower is easier to keep up. We never plan below a safe floor.' : 'This is what we will aim each day toward.'}</p></div>
    ${paceCards}${single}${macros}${notes}
    ${banner('info', 'These are estimates for planning, not medical advice. If you have a medical condition, or a history of disordered eating, check with a professional before changing how you eat.')}
    <button class="btn primary block" type="button" data-act="onb-finish">Save and start planning</button></div>`;
}

// ---------------------------------------------------------------- plan setup
function bandField(setup, info, open) {
  const on = key => (setup.bands || []).includes(key);
  const find = b => info?.bands?.find(x => Math.abs(x.min - b.min) < 1e-9);
  const chips = DISTANCE_BANDS.map(b => { const i = find(b); return `<button class="chip" type="button" data-act="band" data-v="${b.key}" ${pressed(on(b.key))}>${b.label}${i ? ` <span class="count">${i.count}</span>` : ''}</button>`; }).join('');
  const allOn = DISTANCE_BANDS.every(b => on(b.key));
  const hint = `${allOn ? 'Every open restaurant is included. ' : 'Only the bands you turn on are searched. '}The number on each band is how many restaurants it holds from ${esc(setup.origin.label)}. Turn a band off to stay closer.`;
  const list = open && info ? `<div class="bandlist">${info.bands.map(b => {
    const key = DISTANCE_BANDS.find(x => Math.abs(x.min - b.min) < 1e-9)?.key;
    return `<div class="band${on(key) ? '' : ' off'}"><div class="row split"><strong>${esc(b.label)}</strong><span class="muted">${b.count} restaurants · ${b.dishes} dishes${on(key) ? '' : ' · turned off'}</span></div><ul>${b.restaurants.map(r => `<li><span>${esc(r.name)}</span><span class="muted">${esc((r.cuisines || []).slice(0, 2).join(', '))}${r.minutes != null ? ` · ~${r.minutes} min` : ''} · ${r.dishes} dishes</span></li>`).join('')}</ul></div>`;
  }).join('')}${info.unavailable?.length ? `<p class="muted">Not listed: ${info.unavailable.map(u => `${esc(u.name)} (${esc(u.reason.toLowerCase())})`).join(', ')}.</p>` : ''}</div>` : '';
  return `<div class="field"><span class="legend">How far will you walk?</span><div class="chips" role="group" aria-label="Walking bands">${chips}</div><span class="hint">${hint}</span>${info ? `<button class="btn ghost sm" type="button" data-act="band-list" aria-expanded="${Boolean(open)}">${open ? 'Hide' : 'See'} the restaurants in each band</button>` : ''}${list}</div>`;
}

export function planView({ store, parsed, parseBusy, parseError, user, bandInfo, bandsOpen }) {
  const s = store.setup; const off = s.mode === 'off_campus';
  const meals = ['breakfast', 'lunch', 'dinner', 'snack'];
  const chips = meals.map(m => `<button class="chip" type="button" data-act="meal" data-v="${m}" ${pressed(!s.fullDay && s.meal === m)}>${MEAL_LABEL[m]}</button>`).join('') + `<button class="chip" type="button" data-act="fullday" ${pressed(s.fullDay)}>Full day</button>`;
  const usc = `<div class="field"><span class="legend">Meal swipes left</span><div class="row"><div class="stepper" role="group" aria-label="Meal swipes left"><button type="button" data-act="step" data-k="swipes" data-d="-1" aria-label="One fewer">−</button><output aria-live="polite">${s.swipes}</output><button type="button" data-act="step" data-k="swipes" data-d="1" aria-label="One more">+</button></div><span class="hint">A hall visit costs one swipe. Dishes in a hall have no separate price.</span></div></div>`;
  const offc = `<div class="dual"><div class="field"><span class="legend">Budget per meal</span><div class="stepper" role="group" aria-label="Budget per meal"><button type="button" data-act="step" data-k="perMeal" data-d="-1" aria-label="Less">−</button><output aria-live="polite">$${s.perMeal}</output><button type="button" data-act="step" data-k="perMeal" data-d="1" aria-label="More">+</button></div></div>
    <div class="field"><span class="legend">Budget for today</span><div class="stepper" role="group" aria-label="Budget for today"><button type="button" data-act="step" data-k="daily" data-d="-5" aria-label="Less">−</button><output aria-live="polite">$${s.daily}</output><button type="button" data-act="step" data-k="daily" data-d="5" aria-label="More">+</button></div></div></div>
    ${bandField(s, bandInfo, bandsOpen)}
    <div class="field"><label for="f-origin">Starting from</label><div class="row"><select class="input grow" id="f-origin" data-bind="origin">${ORIGINS.map(o => `<option ${s.origin.label === o.label ? 'selected' : ''}>${o.label}</option>`).join('')}${s.origin.label === 'My location' ? '<option selected>My location</option>' : ''}</select><button class="btn secondary sm" type="button" data-act="locate">Use my location</button></div></div>
    <div class="field"><span class="legend">Cuisines <span class="hint">pick any, or none</span></span><div class="chips" role="group" aria-label="Cuisines">${CUISINES.map(c => `<button class="chip" type="button" data-act="cuisine" data-v="${c}" ${pressed(s.cuisines.includes(c))}>${c}</button>`).join('')}</div></div>`;
  const chipsParsed = parsed ? `<div class="chips" aria-label="What we understood">${parsed.map(t => `<span class="pill">${esc(t)}</span>`).join('')}</div>` : '';
  return `<div class="stack">
    <div class="stack tight"><h2 id="view-title" tabindex="-1">${user?.display_name ? `Hi ${esc(user.display_name)}, what` : 'What'} are we eating?</h2><p class="lede">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p></div>
    <div class="seg" role="group" aria-label="Where to eat"><button type="button" data-act="mode" data-v="usc_dining" ${pressed(!off)}>USC dining halls</button><button type="button" data-act="mode" data-v="off_campus" ${pressed(off)}>Off campus</button></div>
    <div class="panel"><div class="field"><span class="legend">Which meal?</span><div class="chips" role="group" aria-label="Meal">${chips}</div></div>${off ? offc : usc}</div>
    <form class="panel" id="ask-form"><div class="field"><label for="f-ask">Or just tell me what you want</label><div class="row"><input class="input grow" id="f-ask" name="ask" maxlength="300" placeholder="vegetarian high protein lunch under $15" value="${esc(store.askText || '')}"><button class="btn secondary sm" type="submit" ${parseBusy ? 'disabled' : ''}>${parseBusy ? 'Reading…' : 'Apply'}</button></div></div>${chipsParsed}${parseError ? `<p class="err" role="alert">${esc(parseError)}</p>` : ''}<span class="hint">Allergies and diet you type are only ever added, never removed.</span></form>
    <button class="btn primary block" type="button" data-act="find">Find ${s.fullDay ? 'my day' : MEAL_LABEL[s.meal].toLowerCase()}</button></div>`;
}

// ---------------------------------------------------------------- options
const NUTR = { verified_published: ['Published', ''], estimated: ['Estimate', '≈'], chain_pattern_estimate: ['Estimate', '≈'], name_estimate: ['Rough estimate', '≈'] };
export const nutrLabel = o => NUTR[o.nutrition?.status] || ['Unknown', ''];

export function allergenLine(o) {
  if (o.allergens.status === 'not_analyzed') return '<p class="allergen unknown">USC has not analyzed this dish for allergens. Ask dining staff.</p>';
  const list = o.allergens.contains || [];
  return `<p class="allergen">${list.length ? `Contains ${list.map(esc).join(', ')}` : 'No allergens listed by the source'}. Always confirm with staff.</p>`;
}

export const TOP_PILL = { fit: 'Top match', nearest: 'Closest', cheapest: 'Lowest price', protein: 'Most protein', lighter: 'Lightest' };

export function optionCard(o, i, { note, rank, act = 'pick', meal = '', sort = 'fit' }) {
  const [label, approx] = nutrLabel(o); const n = o.nutrition;
  const price = o.price.kind === 'swipe' ? '<span class="pill sage">1 swipe</span>' : `<span class="pill">${esc(o.price.label)}</span>`;
  const hall = o.venue.kind === 'hall';
  const hours = o.hours?.open === false ? `<span class="pill gold">Closed at this time</span>` : '';
  const photo = o.image_url ? `<div class="dishpic"><img class="photo" src="${esc(o.image_url)}" alt="${esc(o.name)}" loading="lazy" onerror="this.closest('.opt').classList.remove('has-photo');this.closest('.dishpic').remove()"></div>` : '';
  const art = o.image_url ? '' : `<div class="art"><img src="${artFor(o)}" alt=""></div>`;
  return `<article class="opt${o.image_url ? ' has-photo' : ''}" aria-labelledby="o-${i}">${photo}
    <div class="opt-head${o.image_url ? ' flat' : ''}">${art}<div>
      <h3 id="o-${i}">${esc(o.name)}</h3>${o.subtitle ? `<p class="with">${esc(o.subtitle)}</p>` : ''}
      <div class="venue"><span>${esc(o.venue.name)}${o.station ? ` · ${esc(o.station)}` : ''}</span>${nice(o.availability_note) ? `<span>${esc(nice(o.availability_note))}</span>` : ''}</div></div></div>
    <div class="row">${price}${hours}${hall ? '' : `<span class="pill">${esc(o.venue.cuisines?.[0] || o.category)}</span>`}${rank === 0 ? `<span class="pill gold">${TOP_PILL[sort] || 'Top match'}</span>` : ''}</div>
    <div class="stats"><div><b>${n.calories == null ? '?' : approx + fmt(n.calories)}</b><span>kcal</span></div><div><b>${n.protein_g == null ? '?' : approx + fmt(n.protein_g) + ' g'}</b><span>protein</span></div><div><b>${o.walk.minutes == null ? '–' : '~' + o.walk.minutes + ' min'}</b><span>walk${o.walk.miles != null ? ` · ${o.walk.miles} mi` : ''}</span></div></div>
    <p class="allergen">${n.status === 'verified_published' ? 'Nutrition published by the venue.' : n.status === 'name_estimate' ? 'Rough nutrition estimate from the dish name.' : 'Estimated nutrition, not published by the venue.'}</p>
    <div class="why">${(o.reasons || []).slice(0, 2).map(r => `<p>${esc(r)}</p>`).join('')}</div>
    ${note ? `<p class="ai">${esc(note)}</p>` : ''}
    ${allergenLine(o)}
    <div class="opt-actions"><button class="btn primary" type="button" data-act="${act}" data-i="${i}"${meal ? ` data-meal="${meal}"` : ''}>Choose this</button><button class="btn secondary sm" type="button" data-act="details" data-i="${i}"${meal ? ` data-meal="${meal}"` : ''}>Details</button><a class="btn secondary sm" href="${esc(directionsHref(o))}" target="_blank" rel="noopener">Directions</a></div>
  </article>`;
}

export function directionsHref(o) {
  const v = o.venue; const p = new URLSearchParams({ api: '1', travelmode: 'walking' });
  p.set('destination', Number.isFinite(v.lat) && Number.isFinite(v.lng) ? `${v.lat},${v.lng}` : `${v.name}, University of Southern California, Los Angeles, CA`);
  return `https://www.google.com/maps/dir/?${p}`;
}

export function trustBanner(result, mode) {
  const halls = Object.values(result.menu?.halls || {});
  if (mode === 'usc_dining') {
    const bad = halls.filter(h => h.status !== 'live' && h.status !== 'cached');
    if (bad.length) return banner('warn', `USC's live menu could not be read for ${bad.map(h => esc(h.name)).join(', ')}, so those halls show TrojanPlate's saved sample menu. Check the hall before you go.`);
    const cached = halls.some(h => h.status === 'cached');
    return banner(cached ? 'info' : 'ok', `${cached ? 'Menus saved earlier today from' : "Today's menus, read live from"} <a href="https://hospitality.usc.edu/dining-hall-menus/" target="_blank" rel="noopener">USC Hospitality</a>. USC does not publish calories, so numbers marked ≈ are estimates from the dish name.`);
  }
  return banner('info', 'Restaurant dishes come from a saved menu snapshot. Prices and hours can change, so check before you walk. Walking times are straight-line estimates.');
}

export const helpCard = () => `<div class="help"><h3>Running short on food money?</h3><p>USC Student Basic Needs runs the Trojan Food Pantry and an emergency meal swipe program for students who need food support. Eligibility rules apply, so check the site or email basicneeds@usc.edu.</p><a class="btn secondary sm" href="https://studentbasicneeds.usc.edu/" target="_blank" rel="noopener">Student Basic Needs</a></div>`;

export function emptyView(result, setup) {
  const hidden = result.stats?.hidden || {}; const reasons = [];
  if (hidden.allergy || hidden.not_analyzed) reasons.push('your allergies');
  if (hidden.diet) reasons.push('your diet');
  if (hidden.budget) reasons.push('your budget');
  if (hidden.distance) reasons.push('your walking limit');
  if (hidden.closed) reasons.push('opening hours');
  return `<div class="panel"><h3>Nothing fits right now</h3><p class="lede">${reasons.length ? `Everything nearby was ruled out by ${reasons.join(', ')}.` : 'We could not find a matching dish.'} Allergies and diet are never loosened.</p></div>`;
}

export function relaxHints(hints, { act = 'relax', meal = '' } = {}) {
  if (!hints?.length) return '';
  return `<div class="panel"><h3>Want more choices?</h3><div class="chips">${hints.map((h, i) => `<button class="chip" type="button" data-act="${act}" data-i="${i}"${meal ? ` data-meal="${meal}"` : ''}>${esc(h.label)} <span class="hint">+${h.gain}</span></button>`).join('')}</div></div>`;
}

export const sortBar = (mode, rankBy, act = 'sort') => `<div class="sortseg" role="group" aria-label="Sort">${(SORTS[mode] || SORTS.usc_dining).map(([k, l, tip]) => `<button type="button" data-act="${act}" data-v="${k}" title="${esc(tip)}" aria-label="${esc(tip)}" ${pressed(rankBy === k)}>${l}</button>`).join('')}</div>`;

export const countLine = (result, off) => {
  const n = result.options.length; const v = result.stats?.venues ?? 0;
  return `${n} ${n === 1 ? 'choice' : 'choices'} from ${v} ${off ? (v === 1 ? 'restaurant' : 'restaurants') : (v === 1 ? 'hall' : 'halls')}`;
};

/** Every dish that passed the rules, in the current sort, as compact rows. */
export function allMatches(result, shown, off) {
  const rows = result.options.slice(0, shown).map((o, i) => {
    const n = o.nutrition; const price = o.price.kind === 'swipe' ? '1 swipe' : o.price.label;
    return `<li class="mrow"><div class="mrow-main"><strong>${esc(o.name)}</strong><span>${esc(o.venue.name)}${o.walk.minutes != null ? ` · ~${o.walk.minutes} min` : ''} · ${n.calories == null ? '? kcal' : '≈' + fmt(n.calories) + ' kcal'} · ${n.protein_g == null ? '? g' : '≈' + fmt(n.protein_g) + ' g'} protein · ${esc(price)}</span></div><div class="mrow-act"><button class="btn secondary sm" type="button" data-act="details" data-i="${i}">Details</button><button class="btn primary sm" type="button" data-act="pick" data-i="${i}">Choose</button></div></li>`;
  }).join('');
  const more = result.options.length > shown ? `<button class="btn secondary block" type="button" data-act="more-matches">Show ${Math.min(30, result.options.length - shown)} more of ${result.options.length - shown} left</button>` : '';
  return `<div class="panel allm"><h3>All ${result.options.length} matches</h3><p class="muted">Every ${off ? 'dish from every restaurant' : 'plate from every hall'} that passed your allergy, diet and budget rules, in the order you picked.</p><ol class="mlist">${rows}</ol>${more}</div>`;
}

export function optionsView({ meal, setup, result, page, loading, error, notes, rankBy, planning, showAll = false, shown = 30 }) {
  const off = setup.mode === 'off_campus';
  const head = `<div class="stack tight"><h2 id="view-title" tabindex="-1">${MEAL_LABEL[meal]} ${off ? 'near ' + esc(setup.origin.label) : 'at USC dining'}</h2><p class="lede">${planning}</p></div>`;
  if (loading) return `<div class="stack">${head}<div class="cards" aria-busy="true"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div><p class="muted" role="status">Reading today's menus…</p></div>`;
  if (error) return `<div class="stack">${head}${banner('bad', esc(error))}<button class="btn primary" type="button" data-act="retry">Try again</button></div>`;
  const idx = result.pages[page] || [];
  const cards = idx.map((optIndex, k) => optionCard(result.options[optIndex], optIndex, { note: notes[result.options[optIndex].id], rank: page === 0 ? k : -1, sort: rankBy })).join('');
  const toolbar = `<div class="toolbar">${sortBar(setup.mode, rankBy)}<div class="row"><span class="muted">${countLine(result, off)}</span><button class="btn secondary sm" type="button" data-act="shuffle" ${result.pages.length <= 1 ? 'disabled' : ''}>Next 3</button></div></div>`;
  const few = result.options.length > 0 && result.options.length < 3 ? banner('info', `Only ${result.options.length} dish${result.options.length === 1 ? '' : 'es'} fit${result.options.length === 1 ? 's' : ''} every rule, so that is all we show.`) : '';
  const picked = off ? (setup.cuisines || []).map(c => c.toLowerCase()) : [];
  const cuisineHit = o => (o.venue.cuisines || []).some(c => picked.some(p => String(c).toLowerCase().includes(p) || p.includes(String(c).toLowerCase())));
  const cuisineMiss = picked.length > 0 && result.options.length > 0 && !result.options.some(cuisineHit)
    ? banner('info', `None of your cuisine picks (${picked.map(c => esc(c)).join(', ')}) fit today's limits, so these are the closest matches. Allergies, diet and budget were still enforced.`) : '';
  const needHelp = (setup.mode === 'usc_dining' && setup.swipes <= 0) || (!result.options.length && result.stats?.hidden?.budget) ? helpCard() : '';
  return `<div class="stack">${head}${trustBanner(result, setup.mode)}${cuisineMiss}${result.options.length ? toolbar : ''}${result.options.length ? `<div class="cards">${cards}</div>` : emptyView(result, setup)}${result.options.length > 3 ? `<button class="btn secondary block" type="button" data-act="all-matches" aria-expanded="${showAll}">${showAll ? 'Hide the full list' : `See all ${result.options.length} matches`}</button>` : ''}${showAll ? allMatches(result, shown, off) : ''}${few}${relaxHints(result.relax)}${needHelp}${(result.warnings || []).filter(w => !/marked as estimates/.test(w)).map(w => banner('warn', esc(w))).join('')}<button class="btn ghost block" type="button" data-act="nav" data-v="plan">Change filters</button></div>`;
}

// ---------------------------------------------------------------- full day on one screen
function daySection({ meal, target, pick, sec }, setup, rankBy, notes) {
  const off = setup.mode === 'off_campus';
  const head = `<div class="sec-head"><div><h3>${MEAL_LABEL[meal]}</h3>${pick ? '' : `<p class="muted">Aiming for about ${fmt(target.kcal)} kcal and ${target.protein} g protein</p>`}</div>${pick ? '<span class="pill sage">Locked in</span>' : ''}</div>`;
  if (pick) {
    const price = pick.priceKind === 'swipe' ? '1 swipe' : esc(pick.priceLabel || '');
    return `<section class="daysec" aria-label="${MEAL_LABEL[meal]}">${head}<div class="locked"><div><strong>${esc(pick.name)}</strong>${pick.subtitle ? `<span class="m">${esc(pick.subtitle)}</span>` : ''}<span class="m">${esc(pick.venue)} · ${pick.kcal == null ? '? kcal' : '≈' + fmt(pick.kcal) + ' kcal'} · ${price}${pick.walkMinutes != null ? ` · ~${pick.walkMinutes} min walk` : ''}</span></div><button class="btn secondary sm" type="button" data-act="funlock" data-meal="${meal}">Change</button></div></section>`;
  }
  if (!sec || sec.loading) return `<section class="daysec" aria-label="${MEAL_LABEL[meal]}" aria-busy="true">${head}<div class="cards"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div></section>`;
  if (sec.error) return `<section class="daysec" aria-label="${MEAL_LABEL[meal]}">${head}${banner('bad', esc(sec.error))}<button class="btn secondary sm" type="button" data-act="fretry" data-meal="${meal}">Try again</button></section>`;
  const r = sec.result;
  if (!r.options.length) return `<section class="daysec" aria-label="${MEAL_LABEL[meal]}">${head}${emptyView(r, setup)}${relaxHints(r.relax, { act: 'frelax', meal })}</section>`;
  const idx = r.pages[sec.page] || [];
  const cards = idx.map((i, k) => optionCard(r.options[i], i, { note: notes[r.options[i].id], rank: sec.page === 0 ? k : -1, act: 'fpick', meal, sort: rankBy })).join('');
  return `<section class="daysec" aria-label="${MEAL_LABEL[meal]}">${head}<div class="cards">${cards}</div><div class="row split"><span class="muted">${countLine(r, off)}</span><button class="btn secondary sm" type="button" data-act="fnext" data-meal="${meal}" ${r.pages.length <= 1 ? 'disabled' : ''}>Next 3</button></div>${r.options.length < 3 ? banner('info', `Only ${r.options.length} fit${r.options.length === 1 ? 's' : ''} every rule for ${MEAL_LABEL[meal].toLowerCase()}.`) : ''}${relaxHints(r.relax, { act: 'frelax', meal })}</section>`;
}

export function fullDayView({ setup, rankBy, rows, notes, daily, totals }) {
  const off = setup.mode === 'off_campus';
  const chosen = rows.filter(r => r.pick).length;
  const first = rows.map(r => r.sec?.result).find(Boolean);
  const head = `<div class="stack tight"><h2 id="view-title" tabindex="-1">Your day ${off ? 'near ' + esc(setup.origin.label) : 'at USC dining'}</h2><p class="lede">Choose one for each meal. The others adjust to what you pick, so the whole day stays near your target.</p></div>`;
  const done = chosen === rows.length
    ? banner('ok', `Day planned: about ${fmt(totals.kcal)} of ${fmt(daily.calories_kcal)} kcal and ${fmt(totals.protein)} g protein${off ? `, ${money(totals.cashCents)} spent` : `, ${totals.swipes} swipe${totals.swipes === 1 ? '' : 's'}`}. Open My day to review or share it.`)
    : '';
  const sections = rows.map(r => daySection(r, setup, rankBy, notes)).join('');
  const actions = `<div class="row">${chosen ? '<button class="btn primary grow" type="button" data-act="day">See my day</button>' : ''}<button class="btn ${chosen ? 'secondary' : 'ghost block'}" type="button" data-act="nav" data-v="plan">Change filters</button></div>`;
  return `<div class="stack">${head}${first ? trustBanner(first, setup.mode) : ''}${done}<div class="toolbar">${sortBar(setup.mode, rankBy, 'fsort')}</div>${sections}${actions}</div>`;
}

const PHOTO_SOURCE = { official_chain_site: "the chain's official site", restaurant_site: "the restaurant's own site", delivery_menu: 'its delivery-app menu' };
const photoCredit = o => o.image ? `<p class="muted">Photo from ${PHOTO_SOURCE[o.image.source] || 'the restaurant'}${o.image.match === 'same_dish_other_branch' ? ' (the same item at another branch)' : ''}${o.image.page && /^https?:/.test(o.image.page) ? ` · <a href="${esc(o.image.page)}" target="_blank" rel="noopener">source</a>` : ''}. Your portion may look different.</p>` : '';

export function detailsSheet(o) {
  const [label, approx] = nutrLabel(o); const n = o.nutrition;
  const comps = (o.components || []).map(c => `<div class="comp"><span>${esc(c.name)}</span><span>${c.calories == null ? '' : '≈' + fmt(c.calories) + ' kcal'}</span><small>${esc(c.station || '')}</small></div>`).join('');
  return `<div class="sheet-in"><div class="sheet-head"><h3>${esc(o.name)}</h3><button class="btn ghost sm" type="button" data-act="close">Close</button></div>${o.subtitle ? `<p class="lede">${esc(o.subtitle)}</p>` : ''}
    <p><strong>${esc(o.venue.name)}</strong><br><span class="muted">${esc(o.venue.address || '')}${o.hours?.label ? ` · ${esc(o.hours.label)}` : ''}</span></p>
    ${comps ? `<div><span class="legend">What's on the plate</span>${comps}</div>` : ''}
    <div class="stats"><div><b>${n.calories == null ? '?' : approx + fmt(n.calories)}</b><span>kcal</span></div><div><b>${n.protein_g == null ? '?' : approx + fmt(n.protein_g) + ' g'}</b><span>protein</span></div><div><b>${n.carbs_g == null ? '?' : approx + fmt(n.carbs_g) + ' g'}</b><span>carbs</span></div></div>
    <p class="muted">Nutrition: ${esc(label.toLowerCase())}.${n.status === 'verified_published' ? '' : ' Treat it as a guide, not a measurement.'}</p>
    ${allergenLine(o)}
    <p class="muted">Source: ${esc(o.source.label)}${o.source.date ? ` (${esc(o.source.date)})` : ''}${o.source.url && /^https?:/.test(o.source.url) ? ` · <a href="${esc(o.source.url)}" target="_blank" rel="noopener">open</a>` : ''}${nice(o.availability_note) ? ` · ${esc(nice(o.availability_note))}` : ''}</p>
    ${photoCredit(o)}
    <p class="muted">Why it ranked here: ${(o.reasons || []).map(esc).join('; ')}.</p></div>`;
}

// ---------------------------------------------------------------- my day, profile
export function dayView({ picks, totals, daily, setup, user, shareOk }) {
  const rows = picks.map(p => `<div class="meal-row"><div class="row split"><strong>${esc(MEAL_LABEL[p.meal])}</strong><span><strong>${p.kcal == null ? '?' : '≈' + fmt(p.kcal)} kcal</strong> · ${p.priceKind === 'swipe' ? '1 swipe' : esc(p.priceLabel || '')}</span></div><div class="mr-name">${esc(p.name)}</div>${p.subtitle ? `<div class="m">${esc(p.subtitle)}</div>` : ''}<div class="m">${esc(p.venue)}${p.walkMinutes != null ? ` · ~${p.walkMinutes} min walk` : ''}</div><div class="row"><button class="btn secondary sm" type="button" data-act="change" data-meal="${p.meal}">Change</button><button class="btn ghost sm" type="button" data-act="remove" data-meal="${p.meal}">Remove</button></div></div>`).join('');
  const bar = (label, value, target, unit, warn = true) => `<div class="bar"><div class="row split"><span>${label}</span><span>${unit === '$' ? `<strong>$${value.toFixed(2)}</strong> of $${fmt(target)}` : `<strong>${fmt(value)}</strong> of ${fmt(target)} ${unit}`}</span></div><div class="track"><i class="${warn && value > target * 1.1 ? 'over' : ''}" style="width:${Math.min(100, target ? (value / target) * 100 : 0)}%"></i></div></div>`;
  const spend = setup.mode === 'off_campus' ? bar('Spent', totals.cashCents / 100, setup.daily, '$') : `<p class="muted">${totals.swipes} swipe${totals.swipes === 1 ? '' : 's'} used today. Dining hall food has no separate price.</p>`;
  return `<div class="stack"><div class="stack tight"><h2 id="view-title" tabindex="-1">My day</h2><p class="lede">${picks.length ? 'Your picks so far.' : 'Nothing chosen yet. Find a meal and tap Choose this.'}</p></div>
    ${picks.length ? `<div class="panel meals">${rows}</div><div class="panel"><div class="bars">${bar('Calories', totals.kcal, daily.calories_kcal, 'kcal')}${bar('Protein', totals.protein, daily.protein_g, 'g', false)}${spend}</div>${totals.unknownKcal ? '<p class="hint">Some dishes have no calorie figure, so totals are a lower bound.</p>' : ''}<p class="hint">Calories marked ≈ are estimates, and ${daily.source === 'estimated' ? 'your target is an estimate too' : 'your target is a general 2,000 kcal day'}.</p></div>
    <div class="row"><button class="btn primary grow" type="button" data-act="share">${shareOk ? 'Share my day' : 'Copy my day'}</button><button class="btn secondary grow" type="button" data-act="nav" data-v="plan">Add a meal</button></div>` : '<button class="btn primary block" type="button" data-act="nav" data-v="plan">Find a meal</button>'}
    ${setup.mode === 'usc_dining' && setup.swipes <= 0 ? helpCard() : ''}
    <button class="btn ghost block" type="button" data-act="reset-day">Start today over</button></div>`;
}

export function profileView({ profile, daily, user, guest, error }) {
  const t = daily.result?.targets;
  return `<div class="stack"><div class="stack tight"><h2 id="view-title" tabindex="-1">Your profile</h2><p class="lede">${user ? esc(user.email) : guest ? 'Guest. Your profile lives only in this browser.' : ''}</p></div>
    <div class="panel"><div class="row split"><span class="legend">Goal</span><strong>${esc(profile.goal)}</strong></div><div class="row split"><span class="legend">Diet</span><strong>${esc((DIETS.find(d => d[0] === profile.diet) || ['', 'No restriction'])[1])}</strong></div>
      <div class="row split"><span class="legend">Allergies</span><strong>${esc([...profile.allergies, ...(profile.otherAllergies ? [profile.otherAllergies] : [])].join(', ') || 'None')}</strong></div>
      <div class="row split"><span class="legend">Daily target</span><strong>${fmt(daily.calories_kcal)} kcal · ${daily.protein_g} g protein</strong></div>${t ? `<p class="hint">${daily.source === 'estimated' ? 'Estimated from your height, weight, age and activity.' : ''}</p>` : '<p class="hint">General 2,000 kcal day. Add height and weight for a closer estimate.</p>'}</div>
    <button class="btn primary block" type="button" data-act="edit-profile">Edit profile</button>
    ${guest ? '<button class="btn secondary block" type="button" data-act="auth" data-v="register">Create an account to save this</button>' : '<button class="btn secondary block" type="button" data-act="logout">Log out</button>'}
    ${error ? `<p class="err">${esc(error)}</p>` : ''}
    <p class="muted">Not medical advice. Menus come from USC Hospitality and a saved restaurant snapshot. Always confirm allergens with staff.</p></div>`;
}
