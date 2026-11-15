// Trojan Fork controller: routing, auth, onboarding, meal search and the day plan.
import { apiClient } from './api.js';
import { getSessionToken, clearSession } from './auth.js';
import { flowApi } from './flow-api.js';
import * as S from './flow-state.js';
import * as V from './views.js';
import { ftInToCm, lbToKg } from './targets.js';

const $ = sel => document.querySelector(sel);
const app = $('#app'); const topEl = $('#top'); const dayEl = $('#daybar'); const navEl = $('#nav'); const sheet = $('#sheet'); const toastEl = $('#toast');

let store = S.loadStore();
let user = null;
let view = 'welcome';
let onb = { step: 0, draft: null, error: '' };
let authState = { mode: 'register', error: '', busy: false };
let ask = { parsed: null, busy: false, error: '' };
let opts = freshOpts();
let full = freshFull();
let bandState = { key: '', data: null, busy: false, open: false };
let profileError = '';
let seq = 0;

function freshOpts() { return { meal: null, loading: false, error: '', result: null, page: 0, notes: {}, rankBy: null, overrides: {}, replacing: null, showAll: false, shown: 30 }; }
function freshFull() { return { rankBy: null, sections: {}, notes: {}, tokens: {} }; }
const persist = () => S.saveStore(store);
const dayWithout = (day, meal) => { const picks = { ...day.picks }; delete picks[meal]; return { ...day, picks, order: day.order.filter(m => m !== meal) }; };

let toastTimer;
function toast(message) {
  clearTimeout(toastTimer); toastEl.textContent = message; toastTimer = setTimeout(() => { toastEl.textContent = ''; }, 3000);
}

// ---------------------------------------------------------------- rendering
function dayBarHtml() {
  const daily = S.dailyTargets(store.profile); const t = S.totals(store.day);
  return V.dayBar({ kcal: t.kcal, target: daily.calories_kcal, setup: store.setup, cashCents: t.cashCents, swipesLeft: Math.max(0, store.setup.swipes - t.swipes), dailyLeft: S.dailyRemaining(store.setup, store.day), picks: S.picksList(store.day).length });
}

function bodyHtml() {
  switch (view) {
    case 'welcome': return V.welcome();
    case 'auth': return V.authView(authState);
    case 'onb': return V.onboarding(onb.step, onb.draft, onbCtx());
    case 'plan': return V.planView({ store, parsed: ask.parsed, parseBusy: ask.busy, parseError: ask.error, user, bandInfo: bandState.data, bandsOpen: bandState.open });
    case 'options': return V.optionsView({ meal: opts.meal, setup: store.setup, result: opts.result, page: opts.page, loading: opts.loading, error: opts.error, notes: opts.notes, rankBy: S.validSort(store.setup.mode, opts.rankBy || store.setup.rankBy), planning: planningLine(), showAll: opts.showAll, shown: opts.shown });
    case 'fullday': return fullDayHtml();
    case 'day': return V.dayView({ picks: S.picksList(store.day), totals: S.totals(store.day), daily: S.dailyTargets(store.profile), setup: store.setup, user, shareOk: Boolean(navigator.share) });
    case 'profile': return V.profileView({ profile: store.profile, daily: S.dailyTargets(store.profile), user, guest: store.guest, error: profileError });
    default: return '';
  }
}

function planningLine() {
  const daily = S.dailyTargets(store.profile); const t = S.mealTarget(opts.meal || 'lunch', store.setup, dayWithout(store.day, opts.meal), daily);
  return `Aiming for about ${t.kcal.toLocaleString('en-US')} kcal and ${t.protein} g protein for this meal.`;
}

function render({ focus = true } = {}) {
  const inApp = store.onboarded && ['plan', 'options', 'fullday', 'day', 'profile'].includes(view);
  topEl.innerHTML = V.topBar(store, user);
  dayEl.innerHTML = inApp && view !== 'profile' ? dayBarHtml() : '';
  navEl.innerHTML = inApp ? V.bottomNav(view) : '';
  app.className = `shell${view === 'options' || view === 'fullday' || view === 'day' ? ' wide' : ''}`;
  app.innerHTML = bodyHtml();
  if (focus) { window.scrollTo(0, 0); $('#view-title')?.focus({ preventScroll: true }); }
  if (view === 'plan' && store.setup.mode === 'off_campus') ensureBands();
}

// How many restaurants sit in each walking band from the chosen starting point, and which ones.
function ensureBands() {
  const o = store.setup.origin; const key = `${o.lat.toFixed(4)},${o.lng.toFixed(4)}`;
  if (bandState.key === key || bandState.busy) return;
  bandState = { ...bandState, key, data: null, busy: true };
  flowApi.bands(o.lat, o.lng).then(data => { if (bandState.key === key) { bandState.data = data; bandState.busy = false; if (view === 'plan') render({ focus: false }); } })
    .catch(() => { if (bandState.key === key) bandState.busy = false; }); // no counts is fine; the chips still work
}

function go(next, { focus = true } = {}) { view = next; render({ focus }); }

// ---------------------------------------------------------------- onboarding
function onbCtx() {
  const d = onb.draft; const current = S.dailyTargets(d);
  const plans = ['Gentle', 'Steady', 'Fast'].map(pace => ({ pace, ...(() => { const t = S.dailyTargets(d, pace); return { result: t.result, calories: t.calories_kcal, ok: t.source === 'estimated' }; })() })).filter(p => p.ok);
  return { error: onb.error, plans, current };
}

function startOnboarding() { onb = { step: 0, draft: structuredClone(store.profile || S.emptyProfile()), error: '' }; go('onb'); }

function readNumber(form, name) { const raw = form.elements[name]?.value; return raw === '' || raw == null ? null : Number(raw); }

function submitAbout(form) {
  const age = readNumber(form, 'age');
  if (age != null && (!Number.isFinite(age) || age < 14 || age > 99)) { onb.error = 'Enter an age between 14 and 99, or leave it blank.'; return render({ focus: false }); }
  onb.draft.ageYears = age == null ? '' : age; onb.error = ''; onb.step += 1; render();
}

function submitBody(form) {
  const d = onb.draft; const us = d.units === 'us';
  const h = us ? (readNumber(form, 'ft') == null ? null : ftInToCm(readNumber(form, 'ft'), readNumber(form, 'inch') || 0)) : readNumber(form, 'cm');
  const wRaw = readNumber(form, 'weight'); const gRaw = form.elements.goalweight ? readNumber(form, 'goalweight') : null;
  const w = wRaw == null ? null : us ? lbToKg(wRaw) : wRaw; const g = gRaw == null ? null : us ? lbToKg(gRaw) : gRaw;
  if ((h == null) !== (w == null)) { onb.error = 'Add both height and weight, or skip this step.'; return render({ focus: false }); }
  if (h != null && (h < 120 || h > 230)) { onb.error = 'Height should be between 4 ft and 7 ft 6 in (120 to 230 cm).'; return render({ focus: false }); }
  if (w != null && (w < 35 || w > 250)) { onb.error = `Weight should be between ${us ? '80 and 550 lb' : '35 and 250 kg'}.`; return render({ focus: false }); }
  if (g != null && (g < 35 || g > 250)) { onb.error = 'Goal weight is outside the supported range.'; return render({ focus: false }); }
  d.heightCm = h == null ? '' : Math.round(h * 10) / 10; d.weightKg = w == null ? '' : Math.round(w * 100) / 100; d.goalWeightKg = g == null ? '' : Math.round(g * 100) / 100;
  onb.error = ''; onb.step += 1; render();
}

function submitDiet(form) {
  onb.draft.otherAllergies = String(form.elements.other.value || '').trim(); onb.draft.dislikes = String(form.elements.dislikes.value || '').trim();
  onb.step += 1; render();
}

async function finishOnboarding() {
  store.profile = { ...onb.draft }; store.onboarded = true; store.day = { date: S.localDate(), picks: {}, order: [] }; persist();
  syncProfile(); go('plan');
}

async function syncProfile() {
  if (!getSessionToken() || !store.profile) return;
  const p = store.profile;
  try {
    await apiClient.saveProfile({ goal: p.goal, dietary_preferences: p.diet === 'any' ? [] : [p.diet], allergies: S.allAllergies(p), disliked_ingredients: S.allDislikes(p), preferred_cuisines: store.setup.cuisines, snacks: Boolean(p.snacks), activity_level: (p.activity || 'moderate').toLowerCase(), targets: { flow_profile: p } });
  } catch { /* profile is still saved locally */ }
}

// ---------------------------------------------------------------- auth
async function submitAuth(form) {
  const body = { email: String(form.elements.email.value || '').trim(), password: String(form.elements.password.value || '') };
  if (authState.mode === 'register') body.display_name = String(form.elements.display_name?.value || '').trim() || body.email.split('@')[0];
  if (!body.email || body.password.length < 8) { authState.error = 'Enter your email and a password of at least 8 characters.'; return render({ focus: false }); }
  authState = { ...authState, busy: true, error: '' }; render({ focus: false });
  try {
    const out = authState.mode === 'login' ? await apiClient.login(body) : await apiClient.register(body);
    user = out.user || await apiClient.me().catch(() => null);
    user = user?.user || user;
    store.guest = false;
    const remote = await apiClient.getProfile().catch(() => null);
    const saved = remote?.profile?.targets?.flow_profile;
    authState = { ...authState, busy: false };
    if (saved) { store.profile = { ...S.emptyProfile(), ...saved }; store.onboarded = true; persist(); toast('Welcome back. Your profile is loaded.'); go('plan'); }
    else { persist(); toast(authState.mode === 'register' ? 'Account created. Now your profile.' : 'Logged in. Let us set up your profile.'); startOnboarding(); }
  } catch (error) {
    authState = { ...authState, busy: false, error: error.message || 'That did not work. Try again.' }; render({ focus: false });
  }
}

// ---------------------------------------------------------------- meal search
async function loadOptions(meal) {
  const mine = ++seq;
  opts = { ...opts, meal, loading: true, error: '', result: null, page: 0, notes: {}, replacing: store.day.picks[meal] ? meal : null, showAll: false, shown: 30 };
  go('options');
  try {
    const eff = { ...store, day: dayWithout(store.day, meal) };
    const body = S.buildOptionsBody(eff, meal, { rankBy: opts.rankBy || store.setup.rankBy, overrides: opts.overrides });
    const result = await flowApi.options(body);
    if (mine !== seq) return;
    opts.result = result; opts.loading = false; render({ focus: false }); fetchNotes();
  } catch (error) {
    if (mine !== seq) return;
    opts.loading = false; opts.error = error.message || 'Could not load meals.'; render({ focus: false });
  }
}

async function fetchNotes() {
  const mine = seq; const r = opts.result; if (!r) return;
  const shown = (r.pages[opts.page] || []).map(i => r.options[i]).filter(o => !opts.notes[o.id]);
  if (!shown.length) return;
  try {
    const out = await flowApi.explain({ goal: S.engineGoal(store.profile), meal: opts.meal, options: shown.slice(0, 3) });
    if (mine !== seq || view !== 'options') return;
    if (out?.notes && Object.keys(out.notes).length) { Object.assign(opts.notes, out.notes); render({ focus: false }); }
  } catch { /* the rule-based reasons stay on the cards */ }
}

function startFind() {
  if (store.setup.fullDay) startFullDay(); else loadOptions(store.setup.meal);
}

function pickOption(i) {
  const o = opts.result?.options[i]; if (!o) return;
  const meal = opts.meal;
  store.day.picks[meal] = S.snapshotPick(o, meal);
  store.day.order = S.MEALS.filter(m => store.day.picks[m]); persist();
  toast(`${S.MEAL_LABEL[meal]}: ${o.name}`);
  if (store.setup.fullDay) { go('fullday'); loadFullDay(); } else go('day');
}

// ---------------------------------------------------------------- full day on one screen
function fullDayHtml() {
  const daily = S.dailyTargets(store.profile);
  const rows = S.FULL_DAY.map(meal => ({ meal, target: S.mealTarget(meal, store.setup, dayWithout(store.day, meal), daily), pick: store.day.picks[meal] || null, sec: full.sections[meal] }));
  return V.fullDayView({ setup: store.setup, rankBy: S.validSort(store.setup.mode, full.rankBy || store.setup.rankBy), rows, notes: full.notes, daily, totals: S.totals(store.day) });
}

function startFullDay() { full = freshFull(); go('fullday'); loadFullDay(); }

const unpicked = () => S.FULL_DAY.filter(m => !store.day.picks[m]);

async function loadFullDay(meals = unpicked(), { scrollToNext = false } = {}) {
  meals.forEach(m => { full.sections[m] = { loading: true, error: '', result: null, page: 0 }; });
  render({ focus: false });
  if (scrollToNext) {
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document.querySelector('.daysec[aria-busy="true"]')?.scrollIntoView({ block: 'start', behavior: calm ? 'auto' : 'smooth' });
  }
  await Promise.all(meals.map(loadFullMeal));
}

async function loadFullMeal(meal) {
  const token = full.tokens[meal] = (full.tokens[meal] || 0) + 1;
  const others = S.FULL_DAY.filter(m => m !== meal && store.day.picks[m]).map(m => store.day.picks[m]);
  const eff = { ...store, day: dayWithout(store.day, meal) };
  const body = S.buildOptionsBody(eff, meal, { rankBy: full.rankBy || store.setup.rankBy, overrides: opts.overrides, excludeIds: others.map(p => p.id), avoidVenueIds: [...new Set(others.map(p => p.venueId))] });
  try {
    const result = await flowApi.options(body);
    if (token !== full.tokens[meal] || store.day.picks[meal]) return;
    full.sections[meal] = { loading: false, error: '', result, page: 0 };
    if (view === 'fullday') { render({ focus: false }); fetchFullNotes(meal); }
  } catch (error) {
    if (token !== full.tokens[meal]) return;
    full.sections[meal] = { loading: false, error: error.message || 'Could not load meals.', result: null, page: 0 };
    if (view === 'fullday') render({ focus: false });
  }
}

async function fetchFullNotes(meal) {
  const sec = full.sections[meal]; const r = sec?.result; if (!r) return;
  const shown = (r.pages[sec.page] || []).map(i => r.options[i]).filter(o => !full.notes[o.id]);
  if (!shown.length) return;
  try {
    const out = await flowApi.explain({ goal: S.engineGoal(store.profile), meal, options: shown.slice(0, 3) });
    if (view !== 'fullday' || full.sections[meal] !== sec) return;
    if (out?.notes && Object.keys(out.notes).length) { Object.assign(full.notes, out.notes); render({ focus: false }); }
  } catch { /* the rule-based reasons stay on the cards */ }
}

function pickFull(meal, i) {
  const o = full.sections[meal]?.result?.options[i]; if (!o) return;
  store.day.picks[meal] = S.snapshotPick(o, meal);
  store.day.order = S.MEALS.filter(m => store.day.picks[m]); persist();
  toast(`${S.MEAL_LABEL[meal]}: ${o.name}`);
  const rest = unpicked();
  if (rest.length) loadFullDay(rest, { scrollToNext: true }); else { render({ focus: false }); window.scrollTo({ top: 0 }); }
}

function applyRelax(h) {
  const setup = store.setup;
  if (h.key === 'distance_band') { const b = S.DISTANCE_BANDS.find(x => Math.abs(x.min - h.value[0]) < 1e-9 && Math.abs(x.max - h.value[1]) < 1e-9); if (b && !setup.bands.includes(b.key)) setup.bands = [...setup.bands, b.key]; }
  else if (h.key === 'max_miles') setup.bands = S.DISTANCE_BANDS.map(b => b.key);
  else if (h.key === 'per_meal_usd') setup.perMeal = Math.min(60, h.value);
  else if (h.key === 'min_protein_g') opts.overrides.dropMinProtein = true;
  else if (h.key === 'exclusions') opts.overrides.ignoreDislikes = true;
  else if (h.key === 'include_retail') setup.includeRetail = true;
  persist();
}

// ---------------------------------------------------------------- plain-words request
async function applyAsk(text) {
  store.askText = text; ask = { parsed: null, busy: true, error: '' }; render({ focus: false });
  try {
    const p = await flowApi.parse(text); const ov = {}; const tags = [];
    if (p.meal && S.MEALS.includes(p.meal)) { store.setup.meal = p.meal; store.setup.fullDay = false; tags.push(S.MEAL_LABEL[p.meal]); }
    if (p.diet && p.diet !== 'any' && store.profile.diet === 'any') { ov.diet = p.diet; tags.push(p.diet); }
    if (p.allergies?.length) { ov.allergies = p.allergies; tags.push(`no ${p.allergies.join(', ')}`); }
    if (p.exclusions?.length) { ov.exclusions = p.exclusions; tags.push(`skip ${p.exclusions.join(', ')}`); }
    if (p.cuisines?.length && store.setup.mode === 'off_campus') { ov.cuisines = p.cuisines; tags.push(p.cuisines.join(' or ')); }
    if (Number.isFinite(p.per_meal_usd) && store.setup.mode === 'off_campus') { ov.perMealUsd = p.per_meal_usd; tags.push(`under $${p.per_meal_usd}`); }
    if (Number.isFinite(p.max_kcal)) { ov.maxKcal = p.max_kcal; tags.push(`under ${p.max_kcal} kcal`); }
    if (p.high_protein || Number.isFinite(p.min_protein_g)) { ov.minProtein = Number.isFinite(p.min_protein_g) ? p.min_protein_g : 25; tags.push('high protein'); }
    if (Number.isFinite(p.max_miles) && store.setup.mode === 'off_campus') { ov.maxMiles = p.max_miles; tags.push(`within ${p.max_miles} mi`); }
    opts.overrides = ov; persist();
    ask = { parsed: tags.length ? tags : ['No filters found. Try "vegan lunch under $12"'], busy: false, error: '' };
  } catch (error) { ask = { parsed: null, busy: false, error: error.message || 'Could not read that.' }; }
  render({ focus: false });
}

// ---------------------------------------------------------------- my day
function shareText() {
  const picks = S.picksList(store.day); const t = S.totals(store.day); const daily = S.dailyTargets(store.profile);
  const lines = picks.map(p => `${S.MEAL_LABEL[p.meal]}: ${p.name}${p.subtitle ? ` ${p.subtitle}` : ''} at ${p.venue}${p.kcal == null ? '' : ` (about ${Math.round(p.kcal)} kcal)`}`);
  return `My Trojan Fork day, ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}\n${lines.join('\n')}\nAbout ${Math.round(t.kcal)} of ${daily.calories_kcal} kcal planned.`;
}

async function shareDay() {
  const text = shareText();
  try { if (navigator.share) { await navigator.share({ title: 'My Trojan Fork day', text }); return; } } catch (error) { if (error?.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); toast('Copied. Paste it anywhere.'); } catch { toast('Could not copy. Select the text from My day instead.'); }
}

function locate() {
  if (!navigator.geolocation) return toast('This browser cannot share a location.');
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude: lat, longitude: lng } = pos.coords;
    const miles = Math.hypot((lat - 34.0224) * 69, (lng + 118.2851) * 57);
    if (miles > 2) { toast('That is far from campus, so we kept your starting point.'); return; }
    store.setup.origin = { label: 'My location', lat, lng }; persist(); render({ focus: false });
  }, () => toast('Location was blocked. Pick a starting point instead.'), { enableHighAccuracy: false, timeout: 8000 });
}

// ---------------------------------------------------------------- events
const group = btn => [...btn.parentElement.querySelectorAll('button')];
function pressOnly(btn) { group(btn).forEach(b => b.setAttribute('aria-pressed', String(b === btn))); }

document.addEventListener('click', event => {
  const el = event.target.closest('[data-act]');
  if (event.target === sheet) { sheet.close(); return; }
  if (!el) return;
  const act = el.dataset.act; const v = el.dataset.v; const setup = store.setup;
  switch (act) {
    case 'home': go(store.onboarded ? 'plan' : 'welcome'); break;
    case 'nav': if (v === 'plan' && view === 'plan') break; go(v); break;
    case 'auth': authState = { mode: v, error: '', busy: false }; go('auth'); break;
    case 'guest': store.guest = true; persist(); startOnboarding(); break;
    case 'goal': onb.draft.goal = v; pressOnly(el); break;
    case 'onb-next': onb.step += 1; render(); break;
    case 'onb-back': onb.error = ''; onb.step = Math.max(0, onb.step - 1); render(); break;
    case 'units': onb.draft.units = v; pressOnly(el); break;
    case 'sex': onb.draft.sex = v; pressOnly(el); break;
    case 'activity': onb.draft.activity = v; pressOnly(el); break;
    case 'diet': onb.draft.diet = v; pressOnly(el); break;
    case 'allergy': {
      const list = onb.draft.allergies; const at = list.indexOf(v);
      if (at >= 0) list.splice(at, 1); else list.push(v);
      el.setAttribute('aria-pressed', String(at < 0)); break;
    }
    case 'pace': onb.draft.pace = v; render({ focus: false }); break;
    case 'skip-body': Object.assign(onb.draft, { heightCm: '', weightKg: '', goalWeightKg: '' }); onb.error = ''; onb.step += 1; render(); break;
    case 'onb-finish': finishOnboarding(); break;
    case 'mode': setup.mode = v; ask = { parsed: null, busy: false, error: '' }; opts.overrides = {}; full = freshFull(); persist(); render({ focus: false }); break;
    case 'meal': setup.meal = v; setup.fullDay = false; persist(); render({ focus: false }); break;
    case 'fullday': setup.fullDay = !setup.fullDay; persist(); render({ focus: false }); break;
    case 'step': { const k = el.dataset.k; const d = Number(el.dataset.d); const lim = { swipes: [0, 21], perMeal: [3, 60], daily: [5, 200] }[k]; setup[k] = Math.min(lim[1], Math.max(lim[0], setup[k] + d)); if (k === 'perMeal' && setup.perMeal > setup.daily) setup.daily = setup.perMeal; persist(); render({ focus: false }); break; }
    case 'band': { const on = setup.bands.includes(v); if (on && setup.bands.length === 1) { toast('Keep at least one band on.'); break; } setup.bands = on ? setup.bands.filter(k => k !== v) : [...setup.bands, v]; persist(); render({ focus: false }); break; }
    case 'band-list': bandState.open = !bandState.open; render({ focus: false }); break;
    case 'cuisine': setup.cuisines = setup.cuisines.includes(v) ? setup.cuisines.filter(c => c !== v) : [...setup.cuisines, v]; persist(); render({ focus: false }); break;
    case 'locate': locate(); break;
    case 'find': opts.rankBy = null; startFind(); break;
    case 'retry': loadOptions(opts.meal); break;
    case 'sort': opts.rankBy = v; loadOptions(opts.meal); break;
    case 'shuffle': opts.page = (opts.page + 1) % opts.result.pages.length; render({ focus: false }); fetchNotes(); break;
    case 'pick': pickOption(Number(el.dataset.i)); break;
    case 'details': {
      const r = el.dataset.meal ? full.sections[el.dataset.meal]?.result : opts.result; const o = r?.options[Number(el.dataset.i)];
      if (o) { sheet.innerHTML = V.detailsSheet(o); sheet.showModal(); }
      break;
    }
    case 'all-matches': opts.showAll = !opts.showAll; render({ focus: false }); break;
    case 'more-matches': opts.shown += 30; render({ focus: false }); break;
    case 'fpick': pickFull(el.dataset.meal, Number(el.dataset.i)); break;
    case 'fsort': full.rankBy = v; loadFullDay(); break;
    case 'fnext': { const sec = full.sections[el.dataset.meal]; if (sec?.result) { sec.page = (sec.page + 1) % sec.result.pages.length; render({ focus: false }); fetchFullNotes(el.dataset.meal); } break; }
    case 'fretry': loadFullDay([el.dataset.meal]); break;
    case 'funlock': { const m = el.dataset.meal; delete store.day.picks[m]; store.day.order = S.MEALS.filter(x => store.day.picks[x]); persist(); loadFullDay(); break; }
    case 'frelax': { const h = full.sections[el.dataset.meal]?.result?.relax?.[Number(el.dataset.i)]; if (h) { applyRelax(h); loadFullDay(); } break; }
    case 'close': sheet.close(); break;
    case 'relax': { const h = opts.result.relax[Number(el.dataset.i)]; if (h) { applyRelax(h); loadOptions(opts.meal); } break; }
    case 'day': go('day'); break;
    case 'change': loadOptions(el.dataset.meal); break;
    case 'remove': delete store.day.picks[el.dataset.meal]; store.day.order = store.day.order.filter(m => m !== el.dataset.meal); persist(); render({ focus: false }); break;
    case 'share': shareDay(); break;
    case 'reset-day': store.day = { date: S.localDate(), picks: {}, order: [] }; persist(); toast('Started today over.'); render({ focus: false }); break;
    case 'edit-profile': startOnboarding(); break;
    case 'logout': apiClient.logout().catch(() => {}).finally(() => { clearSession(); user = null; store = S.freshStore(); persist(); opts = freshOpts(); full = freshFull(); go('welcome'); }); break;
    default: break;
  }
});

document.addEventListener('submit', event => {
  event.preventDefault(); const form = event.target;
  if (form.id === 'auth-form') submitAuth(form);
  else if (form.id === 'ask-form') { const text = String(form.elements.ask.value || '').trim(); if (text) applyAsk(text); }
  else if (form.id === 'onb-form') ({ about: submitAbout, body: submitBody, diet: submitDiet })[['goal', 'about', 'body', 'diet', 'plan'][onb.step]]?.(form);
});

document.addEventListener('change', event => {
  const el = event.target;
  if (el.dataset?.bind === 'origin') {
    const o = S.ORIGINS.find(x => x.label === el.value); if (o) { store.setup.origin = { ...o }; persist(); render({ focus: false }); }
  }
});

document.addEventListener('input', event => { if (event.target.id === 'f-ask') store.askText = event.target.value; });

// ---------------------------------------------------------------- boot
async function boot() {
  if (getSessionToken()) {
    try {
      const me = await apiClient.me(); user = me?.user || me; store.guest = false;
      const remote = await apiClient.getProfile().catch(() => null);
      const saved = remote?.profile?.targets?.flow_profile;
      if (saved) { store.profile = { ...S.emptyProfile(), ...saved }; store.onboarded = true; }
    } catch { clearSession(); user = null; }
  }
  if (store.onboarded && !store.profile) store.onboarded = false;
  view = store.onboarded ? 'plan' : 'welcome';
  render();
}
boot();
