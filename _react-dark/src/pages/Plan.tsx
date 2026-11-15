import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { offCampusCuisines, planDay } from '../api/client'
import { toPlanProfile } from '../api/mapping'
import type { DayPlan, MealPeriod, Mode, PlanSituation, Recommendation } from '../api/types'
import { Art } from '../components/Art'
import { BottomNav } from '../components/BottomNav'
import { DayBoard } from '../components/DayBoard'
import { MealCard } from '../components/MealCard'
import { ModeSwitch } from '../components/ModeSwitch'
import { Chip, Field, Screen } from '../components/ui'
import { budgetOf } from '../lib/budget'
import { totalsOf, useDayPicks } from '../lib/day'
import { pathOf, saveMode } from '../lib/mode'
import { useProfile } from '../lib/profile'

const MODE_OF: Record<string, Mode> = { usc: 'usc_dining', 'off-campus': 'off_campus' }
const PERIOD: Record<MealPeriod, { name: string; icon: string }> = {
  breakfast: { name: 'Breakfast', icon: 'sunrise' },
  lunch: { name: 'Lunch', icon: 'sun' },
  dinner: { name: 'Dinner', icon: 'moon' },
  snack: { name: 'Snack', icon: 'apple' },
}

const amount = (text: string) => {
  const n = Number(text)
  return text.trim() !== '' && n > 0 ? n : null
}

export default function Plan() {
  const { mode: modeParam } = useParams()
  const mode = MODE_OF[modeParam ?? '']
  const { hash } = useLocation()
  const navigate = useNavigate()
  const { profile } = useProfile()

  const [mealBudget, setMealBudget] = useState('')
  const [dayBudget, setDayBudget] = useState('')
  const [swipes, setSwipes] = useState('')
  const [cuisines, setCuisines] = useState<string[]>([])
  const [snack, setSnack] = useState(false)
  const [cuisineOptions, setCuisineOptions] = useState<string[]>([])
  const [chosen, setChosen] = useDayPicks()
  const [plan, setPlan] = useState<DayPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Remember the planner in use, so the Meals tab and Today screen reopen on it.
  useEffect(() => {
    if (mode) saveMode(mode)
  }, [mode])

  useEffect(() => {
    if (mode !== 'off_campus') return
    offCampusCuisines()
      .then(setCuisineOptions)
      .catch(() => setCuisineOptions([]))
  }, [mode])

  // Everything the plan depends on, as one string, so typing triggers a single delayed request.
  const requestKey = JSON.stringify({
    mealBudget,
    dayBudget,
    swipes,
    cuisines,
    snack,
    locked: Object.entries(chosen).map(([period, pick]) => [period, pick.mode, pick.rec.dish_id]),
  })

  useEffect(() => {
    if (!profile || !mode) return
    let cancelled = false
    const timer = setTimeout(() => {
      const periods: MealPeriod[] = ['breakfast', 'lunch', 'dinner', ...(snack ? (['snack'] as const) : [])]
      const situation: PlanSituation =
        mode === 'usc_dining'
          ? { mode, meal_periods: periods, meal_swipes_remaining: amount(swipes) }
          : {
              mode,
              meal_periods: periods,
              max_miles: 0.3,
              budget_per_meal: amount(mealBudget),
              budget_daily: amount(dayBudget),
              preferred_cuisines: cuisines,
            }
      setLoading(true)
      planDay({
        profile: toPlanProfile(profile),
        situation,
        // Meals chosen in the other tab come from a different menu, so only this tab's are locked.
        locked: Object.entries(chosen)
          .filter(([, pick]) => pick.mode === mode)
          .map(([period, pick]) => ({
            meal_period: period as MealPeriod,
            dish_id: pick.rec.dish_id,
            status: 'selected' as const,
          })),
      })
        .then((res) => {
          if (cancelled) return
          setPlan(res)
          setError(null)
        })
        .catch((e: unknown) => {
          if (!cancelled) setError(e instanceof Error ? e.message : 'The plan could not be loaded.')
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // requestKey stands in for every input above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, mode, requestKey])

  // Arriving from a meal slot on the Today screen jumps to that meal.
  const ready = plan !== null
  useEffect(() => {
    if (ready && hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [ready, hash])

  if (!profile) return null
  if (!mode) return <Navigate to="/plan/usc" replace />

  const budget = budgetOf(profile)
  const totals = totalsOf(chosen)
  const swipesGiven = amount(swipes)
  const dayCap = amount(dayBudget)
  const filtersSet = [mealBudget, dayBudget, swipes].some((t) => amount(t) !== null) || cuisines.length > 0 || snack

  const toggle = (period: MealPeriod, rec: Recommendation) =>
    setChosen((c) => {
      const next = { ...c }
      if (c[period]) delete next[period]
      else next[period] = { rec, mode }
      return next
    })

  return (
    <Screen nav>
      <ModeSwitch
        mode={mode}
        onChange={(next) => {
          saveMode(next)
          navigate(`/plan/${pathOf(next)}`, { replace: true })
        }}
      />

      <main className="flex-1 px-5 pt-3 pb-6">
        <DayBoard budget={budget} totals={totals} />
        {(totals.swipes > 0 || totals.spentUsd > 0 || totals.uncounted > 0) && (
          <p className="mt-2 text-sm text-ash">
            {totals.swipes > 0 &&
              `${totals.swipes} ${totals.swipes === 1 ? 'swipe' : 'swipes'} used${
                swipesGiven === null ? '' : ` of ${swipesGiven}`
              }. `}
            {totals.spentUsd > 0 && `$${totals.spentUsd.toFixed(2)} spent${dayCap === null ? '' : ` of $${dayCap}`}. `}
            {totals.uncounted > 0 &&
              `${totals.uncounted === 1 ? '1 chosen meal has' : `${totals.uncounted} chosen meals have`} no published nutrition and ${
                totals.uncounted === 1 ? 'is' : 'are'
              } not counted.`}
          </p>
        )}

        <details className="mt-4 rounded-3xl border border-line bg-surface px-4 py-3" open={filtersSet || undefined}>
          <summary className="cursor-pointer font-semibold">
            {mode === 'usc_dining' ? 'Swipes and snacks' : 'Budget, cuisines and snacks'}
          </summary>
          <div className="mt-3 space-y-4">
            {mode === 'usc_dining' ? (
              <Field
                label="Meal swipes left today, if you track them"
                type="number"
                inputMode="numeric"
                value={swipes}
                onChange={(e) => setSwipes(e.target.value)}
              />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Most per meal"
                    type="number"
                    inputMode="decimal"
                    suffix="USD"
                    placeholder="Any"
                    value={mealBudget}
                    onChange={(e) => setMealBudget(e.target.value)}
                  />
                  <Field
                    label="Most for the day"
                    type="number"
                    inputMode="decimal"
                    suffix="USD"
                    placeholder="Any"
                    value={dayBudget}
                    onChange={(e) => setDayBudget(e.target.value)}
                  />
                </div>
                <p className="text-sm text-ash">With a budget set, dishes without a listed price are left out.</p>
                {cuisineOptions.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-medium text-ash">Rank these cuisines first</p>
                    <div className="flex flex-wrap gap-2">
                      {cuisineOptions.map((c) => (
                        <Chip
                          key={c}
                          label={c}
                          selected={cuisines.includes(c)}
                          onToggle={() =>
                            setCuisines((list) => (list.includes(c) ? list.filter((x) => x !== c) : [...list, c]))
                          }
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            <Chip label="Add a snack" selected={snack} onToggle={() => setSnack((s) => !s)} />
          </div>
        </details>

        {error && (
          <p role="alert" className="mt-6 rounded-2xl border border-alert p-4 font-medium text-alert">
            {error} Check that the backend is running, then reload.
          </p>
        )}
        {!plan && !error && loading && <p className="mt-8 text-ash">Planning your day.</p>}

        {plan?.periods.map((period) => {
          const pick = chosen[period.meal_period]
          const cards = pick ? [pick.rec] : period.recommendations
          const { name, icon } = PERIOD[period.meal_period]
          return (
            <section key={period.meal_period} id={period.meal_period} className="scroll-mt-20 pt-7">
              <div className="flex items-baseline justify-between">
                <h2 className="flex items-center gap-2 font-display text-2xl font-semibold">
                  <Art name={icon} className="h-8 w-8" />
                  {name}
                </h2>
                <p className="text-sm text-ash">
                  {pick ? 'Chosen' : cards.length === 0 ? 'No match' : `${cards.length} to pick from`}
                </p>
              </div>
              {!pick && cards.length === 0 && (
                <p className="mt-2 rounded-3xl border border-dashed border-paper/25 p-4 text-[15px]">
                  Nothing on the menu fits your restrictions for this meal.
                  {mode === 'off_campus' &&
                    (profile.diet === 'everything'
                      ? ' Try raising or clearing the budget.'
                      : ` These restaurants don't label dishes ${profile.diet}, so none can be confirmed.`)}
                </p>
              )}
              <ul className="mt-3 space-y-2.5">
                {cards.map((rec) => (
                  <li key={rec.dish_id}>
                    <MealCard
                      rec={rec}
                      mode={pick?.mode ?? mode}
                      selected={pick?.rec.dish_id === rec.dish_id}
                      hasAllergies={profile.allergens.length > 0}
                      onPress={() => toggle(period.meal_period, rec)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )
        })}

        {plan && (
          <footer className="mt-10 space-y-2 border-t border-line pt-5 text-sm text-ash">
            {plan.menu.source_note && (
              <p>
                {mode === 'usc_dining' && plan.menu.menu_date ? `Menu snapshot dated ${plan.menu.menu_date}. ` : ''}
                {plan.menu.source_note}
              </p>
            )}
            {plan.limitations.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </footer>
        )}
      </main>
      <BottomNav />
    </Screen>
  )
}
