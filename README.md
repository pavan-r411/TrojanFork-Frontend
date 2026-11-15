# Trojan Fork — frontend

Your goals. Your campus. Your plate. A mobile-first web app that picks real USC dining hall dishes and nearby restaurant items for a student's goal, diet, allergies and budget.

## Run it locally

1. Backend: `.env` in `TrojanFork-Backend` needs `OPENAI_API_KEY` (optional; only used to understand free-text requests and write the "why" lines). Matching and filtering never depend on it.
2. From this folder run `npm start`. It starts the backend and serves the app and API together on port 8000. Set `PORT` to change it.
3. Open **http://127.0.0.1:8000/ui/**. Refresh after any code change; there is no build step.

No Node install is needed beyond the standard runtime. Do not open `index.html` directly from disk, and do not use a separate static server for the app: the API is served from the same origin.

To start the backend by hand instead: from `TrojanFork-Backend`, run `PYTHONPATH=src python -m uvicorn trojanbites_extract.api.app:app --port 8000`.

## What the app does

1. **Welcome → create account, log in, or continue as guest.** Accounts sync the profile to the backend; guests stay on the device.
2. **Profile in five steps:** goal, about you, body, diet and allergies, pace (gentle, steady or fast). The app estimates a daily calorie and protein target and says it is an estimate.
3. **Plan setup on one screen:** USC dining halls or off campus, which meal, swipes left or budget, cuisines, distance. A free-text box ("vegetarian high protein lunch under $14") adds restrictions and never removes them.
4. **Three options per meal.** Sort by closest, best fit or cheapest, or shuffle. Each card shows calories, protein, walk time, price or swipe use, why it fits, and an allergen line.
5. **Picks update the rest of the day.** The next meal's target is recalculated from what is already chosen and what is left to spend. **My day** shows totals and can be shared.

## How trustworthy the numbers are

- Dining hall menus come from the official USC Hospitality feed for the current date (live, then the last saved copy, then the saved dataset). The banner on each meal says which one is in use.
- USC publishes no calories. Anything marked ≈ is an estimate from the dish name or a chain pattern, and is labelled that way.
- Allergy, diet, budget, distance and opening-hour limits are applied first and fail closed. An unlisted allergen status is never treated as safe. Always confirm with staff.
- Walking times are straight-line estimates, not routes.
- Off-campus items come from a saved restaurant snapshot, so prices and hours can drift.

## Files

| File | Role |
|---|---|
| `index.html`, `flow.css` | Shell and styles (burgundy, ivory, gold) |
| `app.js` | Controller: screens, events, API calls |
| `views.js` | Pure HTML builders; every dynamic string is escaped |
| `flow-state.js` | Profile, targets, budget and day state (`localStorage` key `trojanfork-v2`) |
| `flow-api.js`, `api.js` | API client for `/v1/flow/*` and auth/profile |
| `targets.js` | Mifflin-St Jeor calorie and protein estimates |
| `app.classic.js` | Previous app, kept for reference |

## Checks

- Backend tests: `pytest tests/test_flow.py` in `TrojanFork-Backend`.
- Accuracy audit: `python scripts/flow_accuracy.py --n 1500` generates random profiles and checks every returned option against the profile's allergies, diet, budget and distance. It exits non-zero on any violation.

Not medical advice.
