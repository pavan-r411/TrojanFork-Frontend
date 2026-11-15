import type { DayTotals } from '../lib/day'
import type { Budget } from '../lib/nutrition'
import { Ring } from './Ring'

function MacroBar({ name, eaten, target, fill }: { name: string; eaten: number; target: number; fill: string }) {
  const share = target > 0 ? Math.min(100, (eaten / target) * 100) : 0
  const left = Math.round(target - eaten)
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-medium">{name}</span>
        <span className="text-sm text-ash">
          <span className="font-display text-xl leading-none font-semibold text-paper">{Math.round(eaten)}</span> of{' '}
          {target} g, {left >= 0 ? `${left} g left` : `${-left} g over`}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={Math.round(eaten)}
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-paper/10"
      >
        <div className={`h-full rounded-full ${fill}`} style={{ width: `${share}%`, transition: 'width 500ms ease' }} />
      </div>
    </div>
  )
}

/** The day at a glance: a calorie ring that fills as meals are chosen, then a bar for each macro. */
export function DayBoard({ budget, totals }: { budget: Budget; totals: DayTotals }) {
  const left = budget.calories - totals.calories
  const over = left < 0
  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-paper/10 bg-surface p-5"
      aria-label="Today's calories and macros"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 -left-16 h-64 w-64 rounded-full bg-volt/10 blur-3xl"
      />
      <div className="relative flex items-center gap-5">
        <div className="drop-shadow-[0_0_14px_rgba(212,255,58,0.35)]">
          <Ring value={totals.calories} max={budget.calories} tone={over ? 'stroke-gold' : 'stroke-volt'}>
            <div>
              <p
                className={`font-display text-[34px] leading-none font-semibold tracking-tight ${
                  over ? 'text-gold' : 'text-volt'
                }`}
              >
                {Math.abs(left).toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-ash">{over ? 'calories over' : 'calories left'}</p>
            </div>
          </Ring>
        </div>
        <dl className="flex-1 space-y-2">
          {[
            ['Budget', budget.calories.toLocaleString()],
            ['Chosen', totals.calories.toLocaleString()],
            ['Meals', String(totals.meals)],
          ].map(([term, value]) => (
            <div key={term} className="flex items-baseline justify-between rounded-xl bg-raised px-3 py-2">
              <dt className="text-sm text-ash">{term}</dt>
              <dd className="font-display text-xl leading-none font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="relative mt-5 space-y-4">
        <MacroBar name="Protein" eaten={totals.proteinG} target={budget.proteinG} fill="bg-volt" />
        <MacroBar name="Carbs" eaten={totals.carbsG} target={budget.carbsG} fill="bg-gold" />
        <MacroBar name="Fat" eaten={totals.fatG} target={budget.fatG} fill="bg-paper" />
      </div>
    </section>
  )
}
