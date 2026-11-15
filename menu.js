import { toMeal } from './api.js';

// UI slot labels only. All meal records and ranking come from the backend.
export const meals = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

export function getOptions(mode, meal, profile, settings) {
  return (settings.livePlan?.slots.find(slot => slot.slot === meal.toLowerCase())?.recommendations || [])
    .slice(0, 3)
    .map(item => toMeal(item, meal.toLowerCase()));
}
