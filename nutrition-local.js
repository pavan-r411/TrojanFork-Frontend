// Session-only meal logs + day totals. Preferred targets also persist in localStorage
// so a new day (or a wiped session day) can inherit the last manual/estimated targets.
import { nutrients, total, validateDaily, known } from './nutrition.js';

const days = new Map();
const plans = new Map();
const dayKey = date => `trojanplate-live-nutrition-v1:${date}`;
const preferredKey = 'trojanplate-preferred-targets-v1';

const emptyNutrients = () => Object.fromEntries(nutrients.map(key => [key, null]));
const emptyDay = date => ({
  date,
  targets: emptyNutrients(),
  targets_source: null,
  planned: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  consumed: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  planned_spending_cents: 0,
  actual_spending_cents: 0,
  logs: [],
});

export function nutrientsHaveValues(targets) {
  return Boolean(targets && nutrients.some(key => known(targets[key])));
}

function sanitizeNutrients(value) {
  const out = emptyNutrients();
  if (!value || typeof value !== 'object') return out;
  for (const key of nutrients) {
    const n = value[key];
    out[key] = known(n) ? n : null;
  }
  return out;
}

/** Remember profile-level targets (manual wins over estimate unless force). */
export function rememberPreferredTargets(targets, { source = 'manual', meta = null, force = false } = {}) {
  if (!nutrientsHaveValues(targets)) return null;
  try {
    const existing = readPreferredTargets();
    if (!force && existing?.source === 'manual' && source !== 'manual') return existing;
    const payload = {
      targets: sanitizeNutrients(targets),
      source,
      meta: meta || null,
      updated_at: new Date().toISOString(),
    };
    localStorage.setItem(preferredKey, JSON.stringify(payload));
    return payload;
  } catch {
    return null;
  }
}

export function readPreferredTargets() {
  try {
    const raw = JSON.parse(localStorage.getItem(preferredKey) || 'null');
    if (!raw?.targets || !nutrientsHaveValues(raw.targets)) return null;
    return {
      targets: sanitizeNutrients(raw.targets),
      source: raw.source === 'manual' ? 'manual' : raw.source || 'profile_estimate',
      meta: raw.meta || null,
      updated_at: raw.updated_at || null,
    };
  } catch {
    return null;
  }
}

function salvageDay(raw, date) {
  if (!raw || raw.date !== date || !Array.isArray(raw.logs)) return null;
  const day = emptyDay(date);
  day.targets = sanitizeNutrients(raw.targets);
  day.targets_source = raw.targets_source || null;
  day.targets_meta = raw.targets_meta || null;
  day.planned = sanitizeNutrients(raw.planned);
  // Preserve intentional zeros for planned when no meals; null means incomplete.
  for (const key of nutrients) {
    if (raw.planned && raw.planned[key] === 0) day.planned[key] = 0;
  }
  day.logs = raw.logs.filter(log => log && log.id && log.meal_title && log.nutrition && known(log.portion) && log.portion > 0);
  day.planned_spending_cents = Number.isInteger(raw.planned_spending_cents) && raw.planned_spending_cents >= 0 ? raw.planned_spending_cents : null;
  day.actual_spending_cents = Number.isInteger(raw.actual_spending_cents) && raw.actual_spending_cents >= 0 ? raw.actual_spending_cents : 0;
  day.includes_estimates = Boolean(raw.includes_estimates);
  day.planned_includes_estimates = Boolean(raw.planned_includes_estimates);
  return day;
}

function applyPreferredIfNeeded(data) {
  if (nutrientsHaveValues(data.targets)) return data;
  const preferred = readPreferredTargets();
  if (!preferred) return data;
  data.targets = preferred.targets;
  data.targets_source = preferred.source;
  if (preferred.meta) data.targets_meta = preferred.meta;
  return data;
}

export function daily(date) {
  if (!days.has(date)) {
    let saved = null;
    try {
      const raw = JSON.parse(sessionStorage.getItem(dayKey(date)));
      try {
        saved = validateDaily(raw, date);
      } catch {
        saved = salvageDay(raw, date);
        if (saved) {
          try { validateDaily(saved, date); } catch { /* keep salvaged best-effort */ }
        }
      }
    } catch { /* ignore */ }
    const day = applyPreferredIfNeeded(saved || emptyDay(date));
    days.set(date, day);
    // Persist inheritance so reload keeps preferred targets on this date.
    if (!saved && nutrientsHaveValues(day.targets)) {
      try { sessionStorage.setItem(dayKey(date), JSON.stringify(day)); } catch { /* ignore */ }
    }
  }
  return structuredClone(days.get(date));
}

function save(data) {
  data.consumed = Object.fromEntries(nutrients.map(key => [key, total(data.logs.map(log => log.nutrition), key)]));
  data.actual_spending_cents = total(data.logs, 'price_cents');
  data.includes_estimates = data.logs.some(log => log.quality === 'estimated' || log.price_quality === 'estimated');
  validateDaily(data, data.date);
  days.set(data.date, data);
  try { sessionStorage.setItem(dayKey(data.date), JSON.stringify(data)); } catch { /* ignore */ }
  return structuredClone(data);
}

export function updatePlan(plan) {
  plans.set(`${plan.date}:${plan.mode}`, structuredClone(plan));
  const selected = [...plans.values()]
    .filter(p => p.date === plan.date)
    .flatMap(p => p.slots.flatMap(slot => slot.recommendations.filter(item => item.id === slot.selected_recommendation_id)));
  const data = daily(plan.date);
  if (selected.length === 0) {
    data.planned = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    data.planned_spending_cents = 0;
    data.planned_includes_estimates = false;
  } else {
    data.planned = Object.fromEntries(nutrients.map(key => [key, total(selected.map(item => item.nutrition), key)]));
    data.planned_spending_cents = total(selected, 'price_cents');
    data.planned_includes_estimates = selected.some(item => item.nutrition.status === 'estimated' || item.price_status === 'estimated');
  }
  return save(data);
}

export function log(body, item) {
  const data = daily(body.date);
  if (data.logs.some(entry => entry.recommendation_id === item.id && entry.slot === body.slot)) return data;
  data.logs.push({
    id: body.idempotency_key,
    recommendation_id: item.id,
    slot: body.slot,
    meal_title: item.meal_title,
    portion: body.portion,
    price_quality: body.actual_price_cents !== null && body.actual_price_cents !== undefined ? 'user_entered' : item.price_status || 'unknown',
    published_nutrition: item.nutrition.published || null,
    estimated_ranges: item.nutrition.estimated_ranges || null,
    serving_size: item.nutrition.serving_size || null,
    quality: item.nutrition.status,
    nutrition: Object.fromEntries(nutrients.map(key => [key, typeof item.nutrition[key] === 'number' ? item.nutrition[key] * body.portion : null])),
    price_cents: body.actual_price_cents !== null && body.actual_price_cents !== undefined
      ? body.actual_price_cents
      : item.price_cents === null ? null : Math.round(item.price_cents * body.portion),
  });
  return save(data);
}

export function remove(date, id) {
  const data = daily(date);
  data.logs = data.logs.filter(log => log.id !== id);
  return save(data);
}

export function setTargets(date, targets, options = {}) {
  const data = daily(date);
  data.targets = sanitizeNutrients(targets);
  data.targets_source = options.source || data.targets_source || 'manual';
  if (options.meta) data.targets_meta = options.meta;
  if (options.remember !== false) {
    rememberPreferredTargets(data.targets, { source: data.targets_source, meta: options.meta || data.targets_meta || null, force: data.targets_source === 'manual' });
  }
  return save(data);
}

export function clear() {
  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const name = sessionStorage.key(i);
    if (name.startsWith('trojanplate-live-nutrition-v1:')) sessionStorage.removeItem(name);
  }
  try { localStorage.removeItem(preferredKey); } catch { /* ignore */ }
  days.clear();
  plans.clear();
}
