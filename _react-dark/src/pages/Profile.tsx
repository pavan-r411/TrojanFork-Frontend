import { Link, useNavigate } from 'react-router-dom'
import { BottomNav } from '../components/BottomNav'
import { Scoreboard, Screen } from '../components/ui'
import { budgetOf } from '../lib/budget'
import { kgToLb } from '../lib/nutrition'
import { useProfile, type Activity, type Diet, type Goal, type Pace } from '../lib/profile'

const GOAL: Record<Goal, string> = {
  balanced: 'Eat balanced',
  maintain: 'Maintain my weight',
  lose: 'Lose weight',
  gain: 'Gain weight',
  muscle: 'Support training',
}
const PACE: Record<Pace, string> = { gentle: 'Gentle', steady: 'Steady', fast: 'Fast' }
const ACTIVITY: Record<Activity, string> = {
  sedentary: 'Mostly sitting',
  light: 'Lightly active',
  moderate: 'Active',
  very: 'Very active',
}
const DIET: Record<Diet, string> = { everything: 'Eats everything', vegetarian: 'Vegetarian', vegan: 'Vegan' }

export default function Profile() {
  const { profile, setProfile } = useProfile()
  const navigate = useNavigate()
  if (!profile) return null
  const budget = budgetOf(profile)
  const weight = (kg: number) =>
    profile.units.weight === 'kg' ? `${Math.round(kg)} kg` : `${Math.round(kgToLb(kg))} lb`
  const changesWeight = profile.goal === 'lose' || profile.goal === 'gain'

  const rows: [string, string][] = [
    ['Goal', GOAL[profile.goal]],
    ...(changesWeight ? ([['Pace', PACE[profile.pace]]] as [string, string][]) : []),
    ['Weight', weight(profile.weightKg)],
    ...(profile.goalWeightKg !== null ? ([['Goal weight', weight(profile.goalWeightKg)]] as [string, string][]) : []),
    ['Activity', ACTIVITY[profile.activity]],
    ['Diet', DIET[profile.diet] + (profile.halalPreferred ? ', prefers halal' : '')],
    ['Allergies', profile.allergens.length ? profile.allergens.join(', ') : 'None listed'],
    ...(profile.otherExclusions ? ([['Leaves out', profile.otherExclusions]] as [string, string][]) : []),
  ]

  const startOver = () => {
    if (!window.confirm('Remove your profile and today\'s meals from this device?')) return
    try {
      localStorage.removeItem('trojanplate.day.v1')
    } catch {
      // Nothing stored.
    }
    setProfile(null)
    navigate('/')
  }

  return (
    <Screen nav>
      <main className="flex-1 px-5 pt-6">
        <h1 className="font-display text-[32px] leading-[1.1] font-semibold tracking-tight">{profile.name}</h1>

        <div className="mt-5">
          <Scoreboard
            caption="Your calories a day"
            calories={budget.calories.toLocaleString()}
            cells={[
              { label: 'Protein', value: `${budget.proteinG} g` },
              { label: 'Carbs', value: `${budget.carbsG} g` },
              { label: 'Fat', value: `${budget.fatG} g` },
            ]}
          />
        </div>

        <dl className="mt-6 divide-y divide-line rounded-3xl border border-paper/10 bg-surface px-4">
          {rows.map(([term, value]) => (
            <div key={term} className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-ash">{term}</dt>
              <dd className="text-right font-semibold first-letter:uppercase">{value}</dd>
            </div>
          ))}
        </dl>

        <Link
          to="/setup"
          className="mt-6 block w-full rounded-2xl bg-volt px-5 py-4 text-center text-lg font-semibold text-ink hover:brightness-95"
        >
          Edit profile
        </Link>
        <button
          type="button"
          onClick={startOver}
          className="mt-3 w-full rounded-2xl border border-line px-5 py-3.5 font-semibold text-alert hover:border-alert"
        >
          Remove my profile
        </button>
        <p className="mt-4 text-sm text-ash">Your details are stored on this device only.</p>
      </main>
      <BottomNav />
    </Screen>
  )
}
