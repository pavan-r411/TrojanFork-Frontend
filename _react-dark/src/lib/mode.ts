import type { Mode } from '../api/types'

const KEY = 'trojanplate.mode.v1'

export const pathOf = (mode: Mode) => (mode === 'off_campus' ? 'off-campus' : 'usc')

/** The planner the student used last, so the app reopens on it. */
export function savedMode(): Mode {
  try {
    return localStorage.getItem(KEY) === 'off_campus' ? 'off_campus' : 'usc_dining'
  } catch {
    return 'usc_dining'
  }
}

export function saveMode(mode: Mode): void {
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    // Storage unavailable; the choice then lasts for this visit only.
  }
}
