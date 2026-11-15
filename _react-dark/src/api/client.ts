import type { DayPlan, MenuCatalog, PlanDayBody } from './types'

/** Base URL of the backend. Defaults to the backend's local dev address. */
export const API_URL: string = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

async function request<T>(path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        // Lets requests through an ngrok tunnel without its browser warning page.
        'ngrok-skip-browser-warning': '1',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new Error(`Can't reach the meal planner at ${API_URL}.`)
  }
  if (!res.ok) throw new Error(`The meal planner answered ${res.status}.`)
  return (await res.json()) as T
}

/** Full-day plan. Meals in `locked` stay fixed and the rest is replanned around them. */
export const planDay = (body: PlanDayBody) => request<DayPlan>('/v1/plan/day', body)

/** Cuisines of the off-campus venues in the backend's catalog. */
export async function offCampusCuisines(): Promise<string[]> {
  const catalog = await request<MenuCatalog>('/v1/menus/off-campus')
  return [...new Set(catalog.venues.flatMap((v) => v.cuisines ?? []))].sort()
}
