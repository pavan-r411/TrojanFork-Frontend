export type Mode = 'usc_dining' | 'off_campus';
export type Slot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type SourceStatus = 'verified' | 'estimated' | 'stale' | 'needs_verification';
export type EmptyReasonCode =
  | 'NO_RESTAURANTS'
  | 'MENU_RETRIEVAL_FAILED'
  | 'MENU_EXTRACTION_FAILED'
  | 'NO_SERVICE_AT_TIME'
  | 'NO_MEALS_MATCH_CONSTRAINTS'
  | 'INSUFFICIENT_DISTINCT_RESTAURANTS'
  | 'INGESTION_RUNNING'
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_QUOTA'
  | 'PROVIDER_ERROR'
  | 'NO_BREAKFAST_MENU_PUBLISHED'
  | 'NO_PUBLISHED_OR_INFERRED_BREAKFAST'
  | 'USC_NO_MATCHING_DISHES'
  | 'MENU_UNAVAILABLE';
export interface Directions {
  available: boolean;
  label?: string;
  travel_mode?: 'walking';
  url: string | null;
  destination?: { name?: string | null; lat?: number | null; lng?: number | null; address?: string | null; place_id?: string | null };
  location_confirmed_at?: string | null;
  unavailable_reason?: string | null;
  notes?: string | null;
  place_id?: string | null;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
}
export interface EmptyState {
  reason_code: EmptyReasonCode | null;
  message?: string;
  diagnostics?: Record<string, number | string | boolean | null>;
  actions?: Array<{ id: string; label: string }>;
}
export interface Recommendation {
  id: string;
  rank: number;
  price_status?: 'published' | 'estimated' | 'unknown';
  published_price_cents?: number | null;
  price_range_cents?: EstimateRange | null;
  meal_title: string;
  item_ids: string[];
  venue: { id: string; name: string; type: 'dining_hall' | 'restaurant'; location_label?: string; place_id?: string | null; lat?: number | null; lng?: number | null; address?: string | null };
  cuisine: string | null;
  cuisine_status?: 'published' | 'inferred' | 'unknown';
  image_url: string | null;
  image_credit?: string | null;
  allergens?: string[];
  dietary_tags: string[];
  price_cents: number | null;
  payment_label: string;
  walking_meters: number | null;
  walking_minutes: number | null;
  directions_url?: string | null;
  directions?: Directions;
  meal_period_evidence?: 'labeled' | 'unlabeled' | 'inferred';
  nutrition: { calories: number | null; protein_g: number | null; carbs_g?: number | null; fat_g?: number | null; serving_size?: string | null; status: 'published' | 'estimated' | 'unknown'; display_status?: string | null } & NutritionEstimates;
  allergen_information_status: string;
  source: { url: string; menu_date: string | null; verified_at: string | null; status: SourceStatus; kind?: 'usc_official_feed' | 'live_menu' | 'curated_snapshot' };
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
    cash_subtotal_cents?: number | null;
    budget_excludes_tax_fees?: boolean;
    nutrition_label?: 'planned' | 'eaten';
    nutrition: { calories: number | null; protein_g: number | null; coverage: string };
  };
  slots: Array<{slot: Slot; optional: boolean; selected_recommendation_id: string | null; locked: boolean; recommendations: Recommendation[]; availability_note?: string; empty_state?: EmptyState}>;
  warnings: string[];
  restrictions?: { allergens_filtered: string[]; allergies_label_only: string[]; disliked: string[]; basis: string };
  sources_checked?: Array<{ name: string; distance_miles: number; website: string | null; source: 'live' | 'saved_snapshot'; status: string; dishes: number; detail?: string }>;
  changes?: string;
}

export interface NutritionValues { calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null }
export interface MealLog { id: string; recommendation_id: string; slot: Slot; meal_title: string; portion: number; serving_size: string | null; nutrition: NutritionValues; price_cents: number | null; quality: 'published' | 'estimated' | 'unknown' }
export interface DailyNutrition { includes_estimates?: boolean; planned_includes_estimates?: boolean; date: string; targets: NutritionValues; consumed: NutritionValues; planned: NutritionValues; planned_spending_cents: number | null; actual_spending_cents: number | null; logs: MealLog[] }
export interface LogMealRequest { date: string; recommendation_id: string; slot: Slot; portion: number; idempotency_key: string }

export interface EstimateRange { low: number; high: number }
export interface NutritionEstimates { estimated_ranges?: Partial<Record<keyof NutritionValues, EstimateRange>>; field_status?: Partial<Record<keyof NutritionValues, 'published' | 'estimated' | 'unknown'>>; published?: NutritionValues; serving_status?: 'published' | 'estimated' | 'unknown' }
