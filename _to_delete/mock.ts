import type { Allergen, Diet } from '../lib/profile'
import type { MealPeriod, Mode, PlanRequest, PlanResponse, Recommendation } from './types'

/**
 * Sample menu used until the backend is connected. The dishes are
 * placeholders, not published menu items, and the UI labels them as such.
 */

interface SampleItem {
  mode: Mode
  period: MealPeriod
  name: string
  venue: string
  diet: Diet
  contains: Allergen[]
  kcal: number
  protein: number
  carbs: number
  fat: number
  price: number | null
  miles: number | null
  cuisine: string | null
}

const item = (
  mode: Mode,
  period: MealPeriod,
  name: string,
  venue: string,
  diet: Diet,
  contains: Allergen[],
  [kcal, protein, carbs, fat]: [number, number, number, number],
  price: number | null = null,
  miles: number | null = null,
  cuisine: string | null = null,
): SampleItem => ({ mode, period, name, venue, diet, contains, kcal, protein, carbs, fat, price, miles, cuisine })

const VILLAGE = 'USC Village Dining Hall'
const EVK = "Everybody's Kitchen"
const PARKSIDE = 'Parkside Residential Dining Hall'

const ITEMS: SampleItem[] = [
  item('usc', 'breakfast', 'Scrambled eggs, roasted potatoes and fruit', EVK, 'vegetarian', ['eggs'], [430, 22, 45, 18]),
  item('usc', 'breakfast', 'Oatmeal with banana and peanut butter', VILLAGE, 'vegan', ['peanuts', 'gluten'], [410, 14, 62, 13]),
  item('usc', 'breakfast', 'Greek yogurt, granola and berries', PARKSIDE, 'vegetarian', ['dairy', 'gluten', 'tree nuts'], [360, 20, 48, 9]),
  item('usc', 'breakfast', 'Tofu scramble with spinach and toast', VILLAGE, 'vegan', ['soy', 'gluten'], [390, 24, 38, 15]),
  item('usc', 'lunch', 'Grilled chicken, brown rice and broccoli', VILLAGE, 'everything', [], [560, 46, 58, 14]),
  item('usc', 'lunch', 'Black bean burrito bowl', EVK, 'vegan', [], [610, 22, 92, 16]),
  item('usc', 'lunch', 'Paneer tikka with basmati rice and dal', PARKSIDE, 'vegetarian', ['dairy'], [680, 30, 78, 26]),
  item('usc', 'lunch', 'Turkey sandwich with side salad', EVK, 'everything', ['gluten'], [520, 34, 50, 18]),
  item('usc', 'dinner', 'Baked salmon, quinoa and green beans', PARKSIDE, 'everything', ['fish'], [590, 42, 44, 24]),
  item('usc', 'dinner', 'Chickpea curry with rice', VILLAGE, 'vegan', [], [620, 21, 96, 15]),
  item('usc', 'dinner', 'Cheese pizza slice and Caesar salad', EVK, 'vegetarian', ['dairy', 'gluten', 'eggs'], [700, 26, 74, 32]),
  item('usc', 'dinner', 'Stir-fried tofu, vegetables and rice', VILLAGE, 'vegan', ['soy', 'sesame'], [540, 26, 70, 16]),

  item('off-campus', 'breakfast', 'Egg and cheese breakfast burrito', 'Sample cafe', 'vegetarian', ['eggs', 'dairy', 'gluten'], [520, 24, 48, 24], 8.5, 0.2, 'Mexican'),
  item('off-campus', 'breakfast', 'Acai bowl with granola', 'Sample juice bar', 'vegan', ['gluten', 'tree nuts'], [450, 8, 82, 11], 11, 0.3, 'American'),
  item('off-campus', 'breakfast', 'Bagel with egg and turkey', 'Sample bagel shop', 'everything', ['eggs', 'gluten'], [480, 30, 52, 14], 7.5, 0.1, 'American'),
  item('off-campus', 'lunch', 'Chicken burrito bowl', 'Sample taqueria', 'everything', [], [690, 48, 70, 22], 12.5, 0.2, 'Mexican'),
  item('off-campus', 'lunch', 'Veggie bibimbap', 'Sample Korean kitchen', 'vegetarian', ['eggs', 'soy', 'sesame'], [640, 20, 98, 17], 13, 0.3, 'Korean'),
  item('off-campus', 'lunch', 'Falafel plate with hummus', 'Sample Mediterranean grill', 'vegan', ['sesame', 'gluten'], [720, 24, 84, 30], 11.5, 0.2, 'Mediterranean'),
  item('off-campus', 'lunch', 'Chana masala with rice', 'Sample Indian kitchen', 'vegan', [], [650, 20, 104, 16], 12, 0.3, 'Indian'),
  item('off-campus', 'dinner', 'Chicken teriyaki plate', 'Sample Japanese grill', 'everything', ['soy', 'gluten', 'sesame'], [760, 44, 96, 20], 14, 0.2, 'Japanese'),
  item('off-campus', 'dinner', 'Paneer tikka masala with naan', 'Sample Indian kitchen', 'vegetarian', ['dairy', 'gluten'], [840, 32, 88, 38], 15, 0.3, 'Indian'),
  item('off-campus', 'dinner', 'Tofu pad thai', 'Sample Thai kitchen', 'vegan', ['soy', 'peanuts'], [780, 26, 112, 24], 13.5, 0.3, 'Thai'),
  item('off-campus', 'dinner', 'Grilled chicken salad', 'Sample salad bar', 'everything', [], [480, 40, 24, 24], 12, 0.1, 'American'),
]

const PERIODS: MealPeriod[] = ['breakfast', 'lunch', 'dinner']
/** Share of the day's calories each meal is planned around. */
const PERIOD_SHARE: Record<MealPeriod, number> = { breakfast: 0.25, lunch: 0.35, dinner: 0.35, snack: 0.05 }

const dietAllows = (diet: Diet, itemDiet: Diet) =>
  diet === 'everything' || itemDiet === 'vegan' || (diet === 'vegetarian' && itemDiet === 'vegetarian')

export function samplePlan(req: PlanRequest): PlanResponse {
  const { profile, targets, context, mode } = req
  const proteinFocus = profile.goal === 'lose' || profile.goal === 'muscle' || profile.goal === 'gain'

  const meals = PERIODS.map((period) => {
    const forPeriod = ITEMS.filter((i) => i.mode === mode && i.period === period)
    const eligible = forPeriod.filter(
      (i) =>
        dietAllows(profile.diet, i.diet) &&
        !i.contains.some((a) => profile.allergens.includes(a)) &&
        (context.perMealBudgetUsd === undefined || i.price === null || i.price <= context.perMealBudgetUsd) &&
        (!context.cuisines?.length || i.cuisine === null || context.cuisines.includes(i.cuisine)),
    )

    const mealCalories = targets.calories * PERIOD_SHARE[period]
    const mealProtein = targets.proteinG * PERIOD_SHARE[period]
    const score = (i: SampleItem) =>
      Math.abs(i.kcal - mealCalories) / mealCalories + (proteinFocus ? Math.max(0, mealProtein - i.protein) / mealProtein : 0)

    const ranked = [...eligible].sort((a, b) => score(a) - score(b)).slice(0, 3)

    const recommendations: Recommendation[] = ranked.map((i) => {
      const est = (value: number) => ({ value, confidence: 'estimated' as const })
      const reasons = [
        `About ${i.kcal} of the ${Math.round(mealCalories)} calories planned for ${period}`,
        i.protein >= mealProtein ? `covers this meal's protein target with ${i.protein} g` : `${i.protein} g protein`,
      ]
      if (profile.diet !== 'everything') reasons.push(`fits a ${profile.diet} diet`)
      return {
        id: `${mode}-${period}-${i.name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: i.name,
        venue: i.venue,
        explanation: `${reasons.join(', ')}.`,
        nutrition: { calories: est(i.kcal), proteinG: est(i.protein), carbsG: est(i.carbs), fatG: est(i.fat) },
        priceUsd: i.price,
        usesMealSwipe: mode === 'usc',
        walkingMiles: i.miles,
        cuisine: i.cuisine,
        allergenNote: i.contains.length
          ? `Listed as containing ${i.contains.join(', ')}. Cross-contact with other allergens is not known.`
          : 'No allergens listed. Cross-contact is not known.',
        source: 'Sample data',
      }
    })

    let note: string | null = null
    if (recommendations.length < 3) {
      const relax = context.cuisines?.length ? 'choosing more cuisines' : 'raising the meal budget'
      note =
        recommendations.length === 0
          ? `Nothing on this menu fits your restrictions. Try ${mode === 'usc' ? 'another meal period' : relax}.`
          : `Only ${recommendations.length} ${recommendations.length === 1 ? 'option fits' : 'options fit'} your restrictions.`
    }
    return { period, recommendations, note }
  })

  return { mode, date: req.date, isSample: true, meals }
}
