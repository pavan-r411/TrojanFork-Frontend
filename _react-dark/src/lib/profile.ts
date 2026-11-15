import { createContext, useContext } from 'react'

export type Goal = 'balanced' | 'maintain' | 'lose' | 'gain' | 'muscle'
export type Pace = 'gentle' | 'steady' | 'fast'
export type Sex = 'male' | 'female' | 'unspecified'
export type Activity = 'sedentary' | 'light' | 'moderate' | 'very'
export type Diet = 'everything' | 'vegetarian' | 'vegan'

export const ALLERGENS = [
  'eggs',
  'dairy',
  'gluten',
  'peanuts',
  'tree nuts',
  'soy',
  'fish',
  'shellfish',
  'sesame',
] as const
export type Allergen = (typeof ALLERGENS)[number]

export interface Profile {
  name: string
  goal: Goal
  sex: Sex
  age: number
  heightCm: number
  weightKg: number
  /** Only set when the goal is lose or gain. */
  goalWeightKg: number | null
  /** Only meaningful when the goal is lose or gain. */
  pace: Pace
  activity: Activity
  diet: Diet
  halalPreferred: boolean
  allergens: Allergen[]
  /** Free-text foods to avoid, as the student typed them. */
  otherExclusions: string
  /** Units the student entered their measurements in. */
  units: { weight: 'lb' | 'kg'; height: 'ft' | 'cm' }
  /** ISO timestamp, stamped when the profile is saved. */
  recordedAt: string
}

const KEY = 'trojanplate.profile.v1'

export function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Profile) : null
  } catch {
    return null
  }
}

export function saveProfile(profile: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile))
  } catch {
    // Storage can be unavailable (private mode); the profile then lives for this visit only.
  }
}

export function clearProfile(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}

export interface ProfileStore {
  profile: Profile | null
  setProfile: (profile: Profile | null) => void
}

export const ProfileContext = createContext<ProfileStore>({
  profile: null,
  setProfile: () => {},
})

export const useProfile = () => useContext(ProfileContext)

export const goalChangesWeight = (goal: Goal) => goal === 'lose' || goal === 'gain'
