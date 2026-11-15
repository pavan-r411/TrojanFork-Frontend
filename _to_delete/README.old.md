# TrojanPlate connected frontend

The app is now connected to the live backend. Demo mode is off.

## Run

If the backend is already running, open **http://127.0.0.1:8000/ui/** (or the same path on your configured backend port). Refresh this URL after code changes. A separate static server on port 5173 does not proxy the API.

Otherwise run `npm start` from this folder. It starts the backend from its existing virtual environment (with auto-reload on backend code changes) and serves the app and API together on port 8000. Set `PORT` to change the port. Backend `.env` needs `OPENAI_API_KEY` and `GOOGLE_MAPS_API_KEY`, with Places API New enabled. Gemini is not used for the student live path. Never add keys to browser configuration.

## Sign-in and persistence

Optional **Sign in / Create account** syncs profile and daily plans to the backend (`/v1/auth/*`, `/v1/profile`, `/v1/plans`). Local browsing still works: preferences and today’s plan snapshot persist in `localStorage`. Session nutrition logs remain tab-scoped (`sessionStorage`). Private server records are scoped to the authenticated user only.

## Directions and swaps

Every meal card, detail sheet, and selected plan line offers **Get directions** (Google Maps walking URL; destination Place ID / coordinates / address). Missing destinations show unavailable — never guessed. Swapping a selected meal opens a **confirm preview** (planned calories/protein, cash, swipes, restaurant) with **Undo last swap**.

## Live connection

`api.js` uses `POST /v1/live/plan` for the daily recommendations. `config.js` uses a relative same-origin base URL (`/`), with no embedded backend host. For a separate deployment, set `globalThis.TROJANPLATE_API_BASE_URL` before loading the app, or update the public `apiBaseUrl` configuration; allow that origin in backend CORS. The API timeout is 120 seconds, with visible loading, retry and empty states.

USC Dining reads official date-specific USC dining-hall feeds. Off-campus discovers nearby restaurants through Google Places and fetches their official published menu pages on demand; discovery and extraction run once per daily plan, followed by OpenAI ranking for each meal period. Published sources and missing nutrition remain visible in meal details. No demo meals are used. TrojanPlate's saved nearby-restaurant menus can supplement live results; those cards are labeled “Saved menu” (backend `LIVE_SNAPSHOT_SUPPLEMENT=false` turns this off). Straight-line distance is labeled accordingly; walking times remain unknown.

Profile preferences, diet, allergy/exclusion inputs, location, budget, daily targets and remaining nutrition are sent to the backend. Allergies hide dining-hall dishes that USC tags with that allergen and off-campus dishes that name it; every other card carries an allergen label (`listed by USC: …`, `none listed by USC`, `not analyzed by USC`, or `unverified`) instead of the plan being cleared. On weekends, an empty Lunch or Breakfast slot can mean the official menu lists Brunch instead; the API does not silently relabel that meal.

## Plans and nutrition tracking

`live-plan.js` handles selections, locks and summary calculations within the current browser session. Selecting a meal never marks it eaten. Locked choices are preserved when refreshing, with a warning that their availability has not been rechecked. New unlocked choices are fetched on demand. Live recommendations are not restored from localStorage when reloading; any legacy demo cache is ignored.

`nutrition-local.js` uses sessionStorage for daily eaten-meal snapshots and manually entered targets. No user database or server meal-log endpoint is required. Home and My Plan share the tracker, and logging/removal updates totals immediately. Portions are available only when a serving is published. Unknown nutrients and prices stay null; incomplete totals display as unknown rather than undercounting. Spending is based on logged published menu prices, excluding tax/fees, rather than payment records.

Set calorie/macro targets in **My Plan → Daily targets**. Targets are not generated from dish names or guessed from a goal. Date switching shows that date’s session tracking; live meal recommendations remain for today and cannot be logged against another date. Session records are scoped to the browser tab and disappear when its session ends; profiles retain the app’s existing localStorage behavior. There is no account synchronization or durable history. Clear saved data also clears nutrition-session records.

## Verification

`npm test` runs nutrition calculations, live selection/lock tests, browser-session logging and target checks, and Chrome smoke tests for both the live API contract and existing flows, including responsive overflow at 320–1440 px. Browser tests use an isolated mock backend and do not spend API credits. Real Google Places/OpenAI requests are separate integration checks. JavaScript syntax uses `node --check`; this static project has no build, lint, or TypeScript compiler script.

API declarations are in `contract.d.ts`. Existing `/api/...` adapter methods and explicit `nutrition-mock.js` remain available for compatibility/tests when live mode is disabled, but are not used by the connected app.

### AI estimates

In either dining tab, open **Edit limits** (the swipes or per-meal budget button), enable **Include AI estimates for missing prices and nutrition**, and apply. This is opt-in. Cards show ranges and an assumed serving, with per-field AI estimate labels. Published values remain separate from estimates. The tracker uses range midpoints and labels estimated totals. For estimated prices, optionally enter the actual total paid before logging; portion multipliers apply to nutrition, while an actual paid override is a total amount. No allergy safety or missing menu items are estimated. Inaccessible menus can still leave some restaurants unavailable.


AI estimates are now enabled by default for missing prices/macros on known menu dishes. The frontend no longer offers an estimation checkbox. Published values remain separate, and cards and totals retain AI-estimate labels, ranges and assumed portions. Backend clients may explicitly send `include_ai_estimates: false` for published-only behavior.

## Dark design reference

The frontend follows the latest supplied reference screenshots: a centered 440px single-column shell, warm ivory backgrounds, white cards, Outfit typography, burgundy gradient actions and nutrition panels, sage and gold accents, and white floating bottom navigation. This palette supersedes the earlier Claude.pdf dark theme. The visual layer is isolated in `design.css`, loaded after the existing base styles. Food illustrations in `assets/art` come from Microsoft Fluent Emoji (MIT; license included), are decorative and do not claim to be photographs of the actual dishes.

Live requests, cuisine controls, estimates, session tracking, explicit meal logging, date switching, target entry and swipe-card behavior are retained. Long source/selection explanations use expandable details; estimated totals remain visibly labeled. No React/Tailwind migration or backend contract replacement was needed to apply the design. Browser regression tests cover all existing flows and viewport overflow from 320–1440px; screenshots cover the dashboard, meal cards, home and profile.


## Deploy frontend on Vercel

Import `TrojanFork-Frontend`, use root `./` and framework preset **Other**.
No build command is required; `vercel.json` publishes the existing static app.
Do not use `npm start` as a build command: it launches the local Python backend.

The deployment proxies `/v1/*`, `/api/*`, `/health` and `/ready` to
`https://trojan-fork-backend-eosin.vercel.app`. Browser API configuration stays
same-origin, and local `/ui/` development continues unchanged. Backend host changes
belong in `vercel.json`. No API keys are needed in the frontend Vercel project.

After deployment, check the frontend domain's `/health`, then try **Continue without
account**, complete preferences, generate USC and off-campus meals, and log/undo a meal.
The currently deployed backend supports live planning; newer account and persistence
endpoints require the separate newer backend commits to be successfully deployed.
A successful static deployment does not verify those endpoints or live provider calls.
