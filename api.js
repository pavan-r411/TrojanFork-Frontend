import { config } from './config.js';
import { authHeaders, setSessionToken, clearSession, getSessionToken } from './auth.js';

export class ApiError extends Error {
  constructor(message, code = 'API_UNAVAILABLE', retryable = true) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

/** @param {import('./contract').DailyPlan} plan */
export function validatePlan(plan) {
  if (!plan || !plan.plan_id || !['usc_dining', 'off_campus'].includes(plan.mode) || !Array.isArray(plan.slots) || !plan.summary) {
    throw new ApiError('The server returned an invalid plan.', 'INVALID_RESPONSE');
  }
  for (const name of ['breakfast', 'lunch', 'dinner']) {
    const slot = plan.slots.find(slot => slot.slot === name);
    if (!slot || !Array.isArray(slot.recommendations) || slot.recommendations.length > 3) {
      throw new ApiError('The server plan is missing valid meal choices.', 'INVALID_RESPONSE');
    }
  }
  for (const slot of plan.slots) {
    if (slot.selected_recommendation_id && !slot.recommendations.some(r => r.id === slot.selected_recommendation_id)) {
      throw new ApiError('The server did not preserve the selected meal.', 'INVALID_RESPONSE');
    }
    for (const item of slot.recommendations) {
      if (item.price_cents !== null && (!Number.isInteger(item.price_cents) || item.price_cents < 0)) throw new ApiError('Prices must be integer cents or null.', 'INVALID_RESPONSE');
      for (const value of [item.walking_meters, item.walking_minutes, item.nutrition?.calories, item.nutrition?.protein_g, item.nutrition?.carbs_g ?? null, item.nutrition?.fat_g ?? null]) {
        if (value !== null && (!Number.isFinite(value) || value < 0)) throw new ApiError('Menu numbers must be nonnegative or null.', 'INVALID_RESPONSE');
      }
      if (!item.id || !item.meal_title || !item.venue?.name || !item.source || !item.nutrition) {
        throw new ApiError('The server returned incomplete meal details.', 'INVALID_RESPONSE');
      }
    }
  }
  if(plan.summary.remaining_budget_cents !== null && (!Number.isInteger(plan.summary.remaining_budget_cents) || plan.summary.remaining_budget_cents < 0)) throw new ApiError('Remaining budget is invalid.', 'INVALID_RESPONSE');
  return plan;
}

export async function request(path, body, method = body ? 'POST' : 'GET') {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const headers = { ...authHeaders() };
    if (body) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${config.apiBaseUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (response.status === 204) return null;
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = payload.error?.message || (typeof payload.detail==='string'?payload.detail:Array.isArray(payload.detail)?'Check your preferences and location values.':null) || 'The request could not be completed.';
      throw new ApiError(detail, payload.error?.code || payload.detail || 'API_ERROR', payload.error?.retryable ?? response.status >= 500);
    }
    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(error.name === 'AbortError' ? 'The server took too long. Try refreshing.' : 'The meal service is unavailable. Try refreshing.');
  } finally {
    clearTimeout(timeout);
  }
}

export const apiClient = {
  health: () => request('/health'),
  register: async body => {
    const out = await request('/v1/auth/register', body);
    if (out?.token || out?.session_token) setSessionToken(out.token || out.session_token);
    return out;
  },
  login: async body => {
    const out = await request('/v1/auth/login', body);
    if (out?.token || out?.session_token) setSessionToken(out.token || out.session_token);
    return out;
  },
  logout: async () => {
    try { if (getSessionToken()) await request('/v1/auth/logout', null, 'POST'); } finally { clearSession(); }
  },
  me: () => request('/v1/auth/me'),
  getProfile: () => request('/v1/profile'),
  saveProfile: profile => request('/v1/profile', profile, 'PUT'),
  getPlan: (date, mode) => request(`/v1/plans?date=${encodeURIComponent(date)}&mode=${encodeURIComponent(mode)}`),
  savePlan: body => request('/v1/plans', body, 'PUT'),
  swapPreview: body => request('/v1/plans/swap-preview', body),
  menus: date => request(`/api/usc/menus?date=${encodeURIComponent(date)}`),
  nearby: origin => request(`/api/restaurants/nearby?lat=${origin.lat}&lng=${origin.lng}&max_walk_m=${origin.max_walk_m ?? 483}`),
  generate: async body => {
    if (!config.liveMode) return validatePlan(await request('/api/plans/generate',body));
    const { previous_plan, ...payload }=body;
    const plan=validatePlan(await request('/v1/live/plan',payload));
    const {preserveLocked,recalculatePlan}=await import('./live-plan.js');
    return recalculatePlan(preserveLocked(plan,previous_plan,body.context.locked_meal_ids),body.context);
  },
  swap: async body => config.liveMode ? (await import('./live-plan.js')).selectInPlan(body) : validatePlan(await request('/api/plans/swap', body)),
};

export function toMeal(item, slot) {
  return {
    id: item.id, meal: slot[0].toUpperCase() + slot.slice(1),
    name: item.meal_title, place: item.venue.location_label ? `${item.venue.name} · ${item.venue.location_label}` : item.venue.name, description: item.reason,
    diet: item.dietary_tags?.join(', ') || 'Not specified',
    cost: item.venue.type === 'dining_hall' ? 1 : item.price_cents === null ? null : item.price_cents / 100,
    distance: item.walking_meters === null ? null : item.walking_meters / 1609.344,
    cuisine: item.cuisine, raw: item,
  };
}

/** Safe Maps directions URL from a recommendation. */
export function directionsUrl(item) {
  const d = item?.directions || item?.raw?.directions;
  if (d?.available === false) return null;
  const url = d?.url || item?.directions_url || item?.raw?.directions_url;
  if (!url || !/^https:\/\/(www\.)?google\.com\/maps\//i.test(url)) return null;
  return url;
}

export function directionsUnavailable(item) {
  const d = item?.directions || item?.raw?.directions;
  if (directionsUrl(item)) return null;
  return d?.unavailable_reason || d?.notes || 'Directions unavailable — destination not verified.';
}
