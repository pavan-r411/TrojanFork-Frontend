import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Chip, Field, OptionRow, PrimaryButton, Scoreboard, Screen, UnitToggle } from '../components/ui'
import {
  MIN_AGE_FOR_WEIGHT_CHANGE,
  computeBudget,
  ftInToCm,
  kgToLb,
  lbToKg,
  minGoalWeightKg,
  type BodyInputs,
} from '../lib/nutrition'
import {
  ALLERGENS,
  goalChangesWeight,
  useProfile,
  type Activity,
  type Allergen,
  type Diet,
  type Goal,
  type Pace,
  type Profile,
  type Sex,
} from '../lib/profile'

type Step = 'goal' | 'body' | 'activity' | 'pace' | 'food' | 'summary'

interface Draft {
  name: string
  goal: Goal | null
  sex: Sex | null
  age: string
  heightUnit: 'ft' | 'cm'
  feet: string
  inches: string
  cm: string
  weightUnit: 'lb' | 'kg'
  weight: string
  goalWeight: string
  activity: Activity | null
  pace: Pace
  diet: Diet | null
  halalPreferred: boolean
  allergens: Allergen[]
  otherExclusions: string
}

const EMPTY: Draft = {
  name: '',
  goal: null,
  sex: null,
  age: '',
  heightUnit: 'ft',
  feet: '',
  inches: '',
  cm: '',
  weightUnit: 'lb',
  weight: '',
  goalWeight: '',
  activity: null,
  pace: 'steady',
  diet: null,
  halalPreferred: false,
  allergens: [],
  otherExclusions: '',
}

const trim1 = (n: number) => String(Math.round(n * 10) / 10)

function draftFrom(profile: Profile): Draft {
  const inKg = profile.units.weight === 'kg'
  const totalInches = profile.heightCm / 2.54
  return {
    name: profile.name,
    goal: profile.goal,
    sex: profile.sex,
    age: String(profile.age),
    heightUnit: profile.units.height,
    feet: String(Math.floor(Math.round(totalInches) / 12)),
    inches: String(Math.round(totalInches) % 12),
    cm: trim1(profile.heightCm),
    weightUnit: profile.units.weight,
    weight: trim1(inKg ? profile.weightKg : kgToLb(profile.weightKg)),
    goalWeight:
      profile.goalWeightKg === null ? '' : trim1(inKg ? profile.goalWeightKg : kgToLb(profile.goalWeightKg)),
    activity: profile.activity,
    pace: profile.pace,
    diet: profile.diet,
    halalPreferred: profile.halalPreferred,
    allergens: profile.allergens,
    otherExclusions: profile.otherExclusions,
  }
}

const GOALS: { value: Goal; icon: string; title: string; detail: string }[] = [
  { value: 'balanced', icon: 'salad', title: 'Eat balanced', detail: 'Steady energy, no weight target' },
  { value: 'maintain', icon: 'scale', title: 'Maintain my weight', detail: 'Stay where I am' },
  { value: 'lose', icon: 'down', title: 'Lose weight', detail: 'A gradual calorie deficit' },
  { value: 'gain', icon: 'up', title: 'Gain weight', detail: 'A gradual calorie surplus' },
  { value: 'muscle', icon: 'muscle', title: 'Support training', detail: 'More protein, a small surplus' },
]

const ACTIVITIES: { value: Activity; icon: string; title: string; detail: string }[] = [
  { value: 'sedentary', icon: 'laptop', title: 'Mostly sitting', detail: 'Class, desk, little exercise' },
  { value: 'light', icon: 'walk', title: 'Lightly active', detail: 'Walking campus, exercise 1 to 3 days a week' },
  { value: 'moderate', icon: 'run', title: 'Active', detail: 'Exercise 3 to 5 days a week' },
  { value: 'very', icon: 'lift', title: 'Very active', detail: 'Hard training 6 or 7 days a week' },
]

const DIETS: { value: Diet; icon: string; title: string; detail: string }[] = [
  { value: 'everything', icon: 'chicken', title: 'I eat everything', detail: 'Meat, fish, eggs and dairy' },
  { value: 'vegetarian', icon: 'cheese', title: 'Vegetarian', detail: 'No meat or fish' },
  { value: 'vegan', icon: 'seedling', title: 'Vegan', detail: 'No animal products' },
]

const PACES: { value: Pace; title: string }[] = [
  { value: 'gentle', title: 'Gentle' },
  { value: 'steady', title: 'Steady' },
  { value: 'fast', title: 'Fast' },
]

const num = (text: string) => (text.trim() === '' ? NaN : Number(text))

function heightCmOf(d: Draft): number {
  return d.heightUnit === 'cm' ? num(d.cm) : ftInToCm(num(d.feet), d.inches.trim() === '' ? 0 : num(d.inches))
}
const toKg = (d: Draft, text: string) => (d.weightUnit === 'kg' ? num(text) : lbToKg(num(text)))
const showWeight = (d: Draft, kg: number) =>
  d.weightUnit === 'kg' ? `${Math.ceil(kg)} kg` : `${Math.ceil(kgToLb(kg))} lb`

function bodyOf(d: Draft): BodyInputs {
  return {
    sex: d.sex ?? 'unspecified',
    age: num(d.age),
    heightCm: heightCmOf(d),
    weightKg: toKg(d, d.weight),
    activity: d.activity ?? 'light',
  }
}

/** Returns what is missing or out of range on a step, or null when it is complete. */
function problemWith(step: Step, d: Draft): string | null {
  if (step === 'goal') {
    if (!d.name.trim()) return 'Enter your name.'
    if (!d.goal) return 'Pick a goal.'
  }
  if (step === 'body') {
    if (!d.sex) return 'Pick an option for sex. It changes the calorie estimate.'
    const age = num(d.age)
    if (!Number.isInteger(age) || age < 16 || age > 100) return 'Enter your age in years.'
    const height = heightCmOf(d)
    if (!(height >= 120 && height <= 230)) return 'Enter your height.'
    const weight = toKg(d, d.weight)
    if (!(weight >= 30 && weight <= 300)) return 'Enter your current weight.'
    if (d.goal && goalChangesWeight(d.goal)) {
      if (age < MIN_AGE_FOR_WEIGHT_CHANGE)
        return 'Weight-change plans are for students 18 and over. Go back and pick balanced eating or maintaining weight.'
      const target = toKg(d, d.goalWeight)
      if (!(target >= 30 && target <= 300)) return 'Enter your goal weight.'
      if (d.goal === 'lose') {
        const lowest = minGoalWeightKg(height)
        if (target < lowest || weight <= lowest)
          return `At your height, TrojanPlate plans down to ${showWeight(d, lowest)} and no lower.`
        if (target >= weight) return 'To lose weight, your goal weight needs to be below your current weight.'
      }
      if (d.goal === 'gain' && target <= weight)
        return 'To gain weight, your goal weight needs to be above your current weight.'
    }
  }
  if (step === 'activity' && !d.activity) return 'Pick the option closest to a normal week.'
  if (step === 'food' && !d.diet) return 'Pick what you eat.'
  return null
}

export default function Onboarding() {
  const { profile, setProfile } = useProfile()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<Draft>(() => (profile ? draftFrom(profile) : EMPTY))
  const [index, setIndex] = useState(0)
  const [showProblem, setShowProblem] = useState(false)

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  const changesWeight = draft.goal !== null && goalChangesWeight(draft.goal)
  const steps: Step[] = ['goal', 'body', 'activity', ...(changesWeight ? (['pace'] as Step[]) : []), 'food', 'summary']
  const step = steps[Math.min(index, steps.length - 1)]
  const problem = problemWith(step, draft)

  const back = () => {
    setShowProblem(false)
    if (index === 0) navigate('/')
    else setIndex(index - 1)
  }

  const next = () => {
    if (problem) {
      setShowProblem(true)
      return
    }
    setShowProblem(false)
    if (step !== 'summary') {
      setIndex(index + 1)
      return
    }
    const body = bodyOf(draft)
    setProfile({
      name: draft.name.trim(),
      goal: draft.goal!,
      sex: body.sex,
      age: body.age,
      heightCm: body.heightCm,
      weightKg: body.weightKg,
      goalWeightKg: changesWeight ? toKg(draft, draft.goalWeight) : null,
      pace: draft.pace,
      activity: body.activity,
      diet: draft.diet!,
      halalPreferred: draft.halalPreferred,
      allergens: draft.allergens,
      otherExclusions: draft.otherExclusions.trim(),
      units: { weight: draft.weightUnit, height: draft.heightUnit },
      recordedAt: new Date().toISOString(),
    })
    navigate('/')
  }

  const budgetFor = (pace: Pace) =>
    computeBudget(bodyOf(draft), draft.goal ?? 'balanced', pace, changesWeight ? toKg(draft, draft.goalWeight) : null)

  let title = ''
  let content: ReactNode = null

  if (step === 'goal') {
    title = 'What are you eating toward?'
    content = (
      <>
        <Field
          label="Your name"
          value={draft.name}
          onChange={(e) => set('name', e.target.value)}
          autoComplete="given-name"
          className="mb-6"
        />
        <div role="radiogroup" aria-label="Goal" className="space-y-2.5">
          {GOALS.map((g) => (
            <OptionRow key={g.value} {...g} selected={draft.goal === g.value} onSelect={() => set('goal', g.value)} />
          ))}
        </div>
      </>
    )
  }

  if (step === 'body') {
    title = 'A few numbers for your calorie estimate'
    content = (
      <div className="space-y-5">
        <div>
          <p className="mb-1.5 text-sm font-medium text-ash">Sex</p>
          <div role="radiogroup" aria-label="Sex" className="flex flex-wrap gap-2">
            {(
              [
                ['female', 'Female'],
                ['male', 'Male'],
                ['unspecified', 'Prefer not to say'],
              ] as const
            ).map(([value, label]) => (
              <Chip key={value} label={label} selected={draft.sex === value} onToggle={() => set('sex', value)} />
            ))}
          </div>
        </div>
        <Field
          label="Age"
          type="number"
          inputMode="numeric"
          suffix="years"
          value={draft.age}
          onChange={(e) => set('age', e.target.value)}
        />
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm font-medium text-ash">Height</span>
            <UnitToggle label="Height unit" value={draft.heightUnit} options={['ft', 'cm'] as const} onChange={(u) => set('heightUnit', u)} />
          </div>
          {draft.heightUnit === 'ft' ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Feet" type="number" inputMode="numeric" suffix="ft" value={draft.feet} onChange={(e) => set('feet', e.target.value)} />
              <Field label="Inches" type="number" inputMode="numeric" suffix="in" value={draft.inches} onChange={(e) => set('inches', e.target.value)} />
            </div>
          ) : (
            <Field label="Centimetres" type="number" inputMode="decimal" suffix="cm" value={draft.cm} onChange={(e) => set('cm', e.target.value)} />
          )}
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm font-medium text-ash">Weight</span>
            <UnitToggle label="Weight unit" value={draft.weightUnit} options={['lb', 'kg'] as const} onChange={(u) => set('weightUnit', u)} />
          </div>
          <div className={changesWeight ? 'grid grid-cols-2 gap-3' : ''}>
            <Field label="Current" type="number" inputMode="decimal" suffix={draft.weightUnit} value={draft.weight} onChange={(e) => set('weight', e.target.value)} />
            {changesWeight && (
              <Field label="Goal" type="number" inputMode="decimal" suffix={draft.weightUnit} value={draft.goalWeight} onChange={(e) => set('goalWeight', e.target.value)} />
            )}
          </div>
        </div>
      </div>
    )
  }

  if (step === 'activity') {
    title = 'How active is a normal week?'
    content = (
      <div role="radiogroup" aria-label="Activity level" className="space-y-2.5">
        {ACTIVITIES.map((a) => (
          <OptionRow key={a.value} {...a} selected={draft.activity === a.value} onSelect={() => set('activity', a.value)} />
        ))}
      </div>
    )
  }

  if (step === 'pace') {
    const losing = draft.goal === 'lose'
    title = losing ? 'How fast do you want to lose it?' : 'How fast do you want to gain it?'
    content = (
      <>
        <div role="radiogroup" aria-label="Pace" className="space-y-2.5">
          {PACES.map((p) => {
            const b = budgetFor(p.value)
            const rate = `${trim1(Math.abs(b.weeklyChangeLb))} lb a week`
            const weeks = b.weeksToGoal ? `about ${b.weeksToGoal} weeks to goal` : 'goal date not estimated'
            const limit = b.heldAtFloor
              ? ' Held at the minimum daily budget.'
              : b.paceCapped
                ? ' Limited to 1% of body weight a week.'
                : ''
            const selected = draft.pace === p.value
            return (
              <OptionRow
                key={p.value}
                title={p.value === 'steady' ? `${p.title}, recommended` : p.title}
                detail={`${rate}, ${weeks}.${limit}`}
                selected={selected}
                onSelect={() => set('pace', p.value)}
                trailing={
                  <span className="shrink-0 text-right">
                    <span className={`block font-display text-[28px] leading-none font-semibold ${selected ? 'text-volt' : ''}`}>
                      {b.calories.toLocaleString()}
                    </span>
                    <span className="block text-xs text-ash">calories a day</span>
                  </span>
                }
              />
            )
          })}
        </div>
        <p className="mt-4 text-sm text-ash">
          You hold your weight at about {budgetFor('steady').maintenance.toLocaleString()} calories a day. You can
          change pace any time.
        </p>
      </>
    )
  }

  if (step === 'food') {
    title = 'What do you eat, and what do you avoid?'
    const toggleAllergen = (a: Allergen) =>
      set('allergens', draft.allergens.includes(a) ? draft.allergens.filter((x) => x !== a) : [...draft.allergens, a])
    content = (
      <div className="space-y-6">
        <div role="radiogroup" aria-label="Diet" className="space-y-2.5">
          {DIETS.map((dt) => (
            <OptionRow key={dt.value} {...dt} selected={draft.diet === dt.value} onSelect={() => set('diet', dt.value)} />
          ))}
        </div>
        <label className="flex items-center gap-3 text-[17px]">
          <input
            type="checkbox"
            checked={draft.halalPreferred}
            onChange={(e) => set('halalPreferred', e.target.checked)}
            className="h-5 w-5 accent-volt"
          />
          Prefer halal ingredients
        </label>
        <div>
          <p className="mb-2 font-semibold">Allergies and intolerances</p>
          <div className="flex flex-wrap gap-2">
            {ALLERGENS.map((a) => (
              <Chip key={a} label={a[0].toUpperCase() + a.slice(1)} selected={draft.allergens.includes(a)} onToggle={() => toggleAllergen(a)} />
            ))}
          </div>
          <p className="mt-2 text-sm text-ash">
            Pick gluten for gluten-free. We hide dishes listed with these, but dining halls can't rule out
            cross-contact.
          </p>
        </div>
        <Field
          label="Anything else to leave out"
          placeholder="Mushrooms, cilantro"
          value={draft.otherExclusions}
          onChange={(e) => set('otherExclusions', e.target.value)}
        />
      </div>
    )
  }

  if (step === 'summary') {
    const b = budgetFor(draft.pace)
    title = `Here is your day, ${draft.name.trim()}`
    const change =
      b.weeklyChangeLb === 0
        ? 'This holds your current weight.'
        : `This is about ${trim1(Math.abs(b.weeklyChangeLb))} lb a week ${b.weeklyChangeLb < 0 ? 'down' : 'up'}${
            b.weeksToGoal ? `, roughly ${b.weeksToGoal} weeks to your goal` : ''
          }.`
    content = (
      <>
        <Scoreboard
          caption="Calories a day"
          calories={b.calories.toLocaleString()}
          cells={[
            { label: 'Protein', value: `${b.proteinG} g` },
            { label: 'Carbs', value: `${b.carbsG} g` },
            { label: 'Fat', value: `${b.fatG} g` },
          ]}
        />
        <p className="mt-5 text-[17px]">{change}</p>
        {b.heldAtFloor && (
          <p className="mt-3 text-[17px]">
            Your pace asked for less, so we held the budget at the minimum we plan for. The goal takes a little
            longer.
          </p>
        )}
        <p className="mt-3 text-sm text-ash">
          These are estimates from your age, height, weight and activity, using the Mifflin-St Jeor equation. They
          are a starting point, not medical advice.
        </p>
      </>
    )
  }

  return (
    <Screen>
      <header className="px-6 pt-5">
        <div className="flex items-center justify-between">
          <button type="button" onClick={back} className="-ml-2 rounded-lg px-2 py-1 font-medium text-ash hover:text-paper">
            Back
          </button>
          <p className="text-sm text-ash">
            Step {index + 1} of {steps.length}
          </p>
        </div>
        <div className="mt-3 flex gap-1.5" aria-hidden="true">
          {steps.map((s, i) => (
            <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= index ? 'bg-volt' : 'bg-line'}`} />
          ))}
        </div>
      </header>
      <main className="flex-1 px-6 pt-8 pb-6">
        <h1 className="mb-6 font-display text-[32px] leading-[1.1] font-semibold tracking-tight">{title}</h1>
        {content}
      </main>
      <footer className="sticky bottom-0 border-t border-paper/10 bg-ink/85 px-6 pt-3 pb-5 backdrop-blur-xl">
        {showProblem && problem && (
          <p role="alert" className="mb-3 font-medium text-alert">
            {problem}
          </p>
        )}
        <PrimaryButton onClick={next}>{step === 'summary' ? 'Save and plan my day' : 'Continue'}</PrimaryButton>
      </footer>
    </Screen>
  )
}
