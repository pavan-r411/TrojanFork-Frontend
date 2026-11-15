import type { Mode, Recommendation } from '../api/types'
import { foodIcon } from '../lib/foodIcon'
import { Art } from './Art'

const label = (text: string) => text.replace(/_/g, ' ')

function Pill({ children, tone = 'plain' }: { children: string; tone?: 'plain' | 'strong' | 'quiet' }) {
  const look =
    tone === 'strong' ? 'bg-volt text-ink' : tone === 'quiet' ? 'border border-paper/20 text-ash' : 'bg-raised text-paper'
  return <span className={`rounded-md px-2 py-1 text-[13px] leading-none font-semibold ${look}`}>{children}</span>
}

export function MealCard({
  rec,
  mode,
  selected,
  hasAllergies,
  onPress,
}: {
  rec: Recommendation
  mode: Mode
  selected: boolean
  /** True when the student listed an allergy, so missing allergen data needs a warning. */
  hasAllergies: boolean
  onPress: () => void
}) {
  const n = rec.nutrition.confidence === 'confirmed' ? rec.nutrition.published : null
  const hasNutrition = n != null && n.calories_kcal != null
  const allergens = rec.allergens_published ?? []
  // Drop lines the card already shows as pills: nutrition, distance and lock status.
  const reasons = rec.why.filter(
    (w) =>
      !w.startsWith('Nutrition figures') &&
      !w.startsWith('Locked as') &&
      !w.startsWith('Published protein') &&
      !w.endsWith('(straight-line)'),
  )

  return (
    <article
      className={`rounded-3xl border p-3.5 transition-colors ${
        selected ? 'border-volt bg-volt/10 shadow-[0_0_22px_rgba(212,255,58,0.14)]' : 'border-line bg-surface'
      }`}
    >
      <div className="flex gap-3">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-raised">
          <Art name={foodIcon(rec.name)} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] leading-snug font-semibold">{rec.name}</h3>
          <p className="text-sm text-ash">{rec.venue_name}</p>
        </div>
        <button
          type="button"
          aria-pressed={selected}
          aria-label={selected ? `Remove ${rec.name}` : `Choose ${rec.name}`}
          onClick={onPress}
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border transition-colors ${
            selected
              ? 'border-volt bg-volt text-ink shadow-[0_0_16px_rgba(212,255,58,0.5)]'
              : 'border-paper/30 text-paper hover:border-volt hover:text-volt'
          }`}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={selected ? 'M5 12.500 10 17.500 19 7' : 'M12 5v14M5 12h14'} />
          </svg>
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {hasNutrition ? (
          <>
            <Pill tone="strong">{`${n.calories_kcal} cal`}</Pill>
            {n.protein_g != null && <Pill>{`${n.protein_g} g protein`}</Pill>}
            {n.carbohydrates_g != null && <Pill>{`${n.carbohydrates_g} g carbs`}</Pill>}
            {n.fat_g != null && <Pill>{`${n.fat_g} g fat`}</Pill>}
          </>
        ) : (
          <Pill tone="quiet">No nutrition published</Pill>
        )}
        {mode === 'usc_dining' ? (
          <Pill>1 meal swipe</Pill>
        ) : rec.price.amount === null ? (
          <Pill tone="quiet">Price not listed</Pill>
        ) : (
          <Pill>{`$${rec.price.amount.toFixed(2)}`}</Pill>
        )}
        {rec.distance_miles != null && <Pill>{`${rec.distance_miles.toFixed(2)} mi`}</Pill>}
        {(rec.dietary_labels ?? []).map((l) => (
          <Pill key={l}>{label(l)}</Pill>
        ))}
      </div>

      {allergens.length > 0 ? (
        <p className="mt-2 text-sm">Listed allergens: {allergens.join(', ')}.</p>
      ) : (
        hasAllergies && (
          <p className="mt-2 text-sm font-semibold text-alert">
            No allergen information published. Ask the staff before you order.
          </p>
        )
      )}

      {(rec.description || reasons.length > 0 || hasNutrition) && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer font-semibold">Why this meal</summary>
          <div className="mt-1.5 space-y-1">
            {rec.description && <p>{rec.description}</p>}
            {reasons.map((reason) => (
              <p key={reason}>{reason}</p>
            ))}
            {hasNutrition && n.serving && <p>Nutrition is as published, per {n.serving}.</p>}
            {allergens.length === 0 && !hasAllergies && <p>No allergen information published.</p>}
          </div>
        </details>
      )}
    </article>
  )
}
