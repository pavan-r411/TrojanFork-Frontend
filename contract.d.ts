export type Mode = 'usc_dining' | 'off_campus';
export type Slot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type SourceStatus = 'verified' | 'estimated' | 'stale' | 'needs_verification';
export interface Recommendation {
  id: string;
  rank: number;
  price_status?: 'published' | 'estimated' | 'unknown';
  published_price_cents?: number | null;
  price_range_cents?: EstimateRange | null;
  meal_title: string;
  item_ids: string[];
  venue: { id: string; name: string; type: 'dining_hall' | 'restaurant'; location_label?: string };
  cuisine: string | null;
  image_url: string | null;
  dietary_tags: string[];
  price_cents: number | null;
  payment_label: string;
  walking_meters: number | null;
  walking_minutes: number | null;
  nutrition: { calories: number | null; protein_g: number | null; carbs_g?: number | null; fat_g?: number | null; serving_size?: string | null; status: 'published' | 'estimated' | 'unknown' } & NutritionEstimates;
  allergen_information_status: string;
  source: { url: string; menu_date: string | null; verified_at: string | null; status: SourceStatus };
  reason: string;
}
export interface DailyPlan {
  plan_id: string;
  date: string;
  mode: Mode;
  generated_at: string;
  data_mode?: 'live';
  client_context?: { daily_budget_cents?: number; meal_swipes_available?: number };
  summary: {
    total_cost_cents: number | null;
    remaining_budget_cents: number | null;
    swipes_used: number;
    remaining_swipes: number;
    nutrition: { calories: number | null; protein_g: number | null; coverage: string };
  };
  slots: Array<{slot: Slot; optional: boolean; selected_recommendation_id: string | null; locked: boolean; recommendations: Recommendation[]; availability_note?: string}>;
  warnings: string[];
  changes?: string;
}

export interface NutritionValues { calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null }
export interface MealLog { id: string; recommendation_id: string; slot: Slot; meal_title: string; portion: number; serving_size: string | null; nutrition: NutritionValues; price_cents: number | null; quality: 'published' | 'estimated' | 'unknown' }
export interface DailyNutrition { includes_estimates?: boolean; planned_includes_estimates?: boolean; date: string; targets: NutritionValues; consumed: NutritionValues; planned: NutritionValues; planned_spending_cents: number | null; actual_spending_cents: number | null; logs: MealLog[] }
export interface LogMealRequest { date: string; recommendation_id: string; slot: Slot; portion: number; idempotency_key: string }

export interface EstimateRange { low: number; high: number }
export interface NutritionEstimates { estimated_ranges?: Partial<Record<keyof NutritionValues, EstimateRange>>; field_status?: Partial<Record<keyof NutritionValues, 'published' | 'estimated' | 'unknown'>>; published?: NutritionValues; serving_status?: 'published' | 'estimated' | 'unknown' }
