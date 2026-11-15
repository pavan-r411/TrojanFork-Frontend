import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { MealPeriod, Mode } from '../api/types'
import { Art } from '../components/Art'
import { BottomNav } from '../components/BottomNav'
import { DayBoard } from '../components/DayBoard'
import { ModeSwitch } from '../components/ModeSwitch'
import { Screen } from '../components/ui'
import { budgetOf } from '../lib/budget'
import { totalsOf, useDayPicks } from '../lib/day'
import { foodIcon } from '../lib/foodIcon'
import { pathOf, saveMode, savedMode } from '../lib/mode'
import { useProfile } from '../lib/profile'

const SLOTS: { period: MealPeriod; name: string; icon: string }[] = [
  { period: 'breakfast', name: 'Breakfast', icon: 'sunrise' },
  { period: 'lunch', name: 'Lunch', icon: 'sun' },
  { period: 'dinner', name: 'Dinner', icon: 'moon' },
  { period: 'snack', name: 'Snack', icon: 'apple' },
]

const SOURCE: Record<Mode, string> = {
  usc_dining: 'Village, EVK and Parkside, one meal swipe a visit',
  off_campus: 'Restaurants within a 0.3 mile walk',
}

export default function Home() {
  const { profile } = useProfile()
  const [picks] = useDayPicks()
  const [mode, setMode] = useState<Mode>(savedMode)
  const [date] = useState(() =>
    new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
  )
  if (!profile) return null
  const budget = budgetOf(profile)
  const totals = totalsOf(picks)

  const switchMode = (next: Mode) => {
    setMode(next)
    saveMode(next)
  }

  return (
    <Screen nav>
      <ModeSwitch mode={mode} onChange={switchMode} />
      <main className="flex-1 px-5 pt-3">
        <p className="text-sm text-ash">{date}</p>
        <h1 className="font-display text-[32px] leading-[1.1] font-semibold tracking-tight">
          Fight on, {profile.name}
        </h1>

        <div className="mt-5">
          <DayBoard budget={budget} totals={totals} />
          {totals.uncounted > 0 && (
            <p className="mt-2 text-sm text-ash">
              {totals.uncounted === 1 ? '1 chosen meal has' : `${totals.uncounted} chosen meals have`} no published
              nutrition and {totals.uncounted === 1 ? 'is' : 'are'} not counted.
            </p>
          )}
        </div>

        <h2 className="mt-7 font-display text-2xl font-semibold">Today's meals</h2>
        <p className="text-sm text-ash">{SOURCE[mode]}</p>
        <ul className="mt-3 space-y-2.5">
          {SLOTS.filter((slot) => slot.period !== 'snack' || picks.snack).map((slot) => {
            const pick = picks[slot.period]
            return (
              <li key={slot.period}>
                <Link
                  to={`/plan/${pathOf(pick?.mode ?? mode)}#${slot.period}`}
                  className={`flex items-center gap-3 rounded-3xl border p-3 transition-colors ${
                    pick
                      ? 'border-volt bg-volt/10'
                      : 'border-dashed border-paper/25 bg-surface hover:border-volt'
                  }`}
                >
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-raised">
                    <Art name={pick ? foodIcon(pick.rec.name) : slot.icon} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-ash">{slot.name}</span>
                    <span className="block truncate text-[17px] font-semibold">
                      {pick ? pick.rec.name : `Choose ${slot.name.toLowerCase()}`}
                    </span>
                    {pick && <span className="block truncate text-sm text-ash">{pick.rec.venue_name}</span>}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold ${
                      pick ? 'border border-paper/25' : 'bg-volt text-ink'
                    }`}
                  >
                    {pick ? 'Change' : 'Pick'}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>

        <p className="mt-7 text-sm text-ash">
          TrojanPlate gives estimates to help you choose, not medical advice. Always check allergens with the
          dining hall or restaurant.
        </p>
      </main>
      <BottomNav />
    </Screen>
  )
}
