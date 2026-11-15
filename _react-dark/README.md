# TrojanPlate frontend

Mobile-first web app for the AI@USC Hackathon 2026. React, TypeScript, Vite and Tailwind.

## Run it

Start the backend first (see `TrojanFork-Backend/README.md`), then:

```
npm install
npm run dev
```

The app calls the backend at `http://127.0.0.1:8000` unless `VITE_API_URL` is set. To point at a
deployed backend, copy `.env.example` to `.env` and set `VITE_API_URL` to its base URL.

## Backend calls

- `POST /v1/plan/day` builds the day. Chosen meals are sent in `locked`, and the backend replans
  the other meals around them.
- `GET /v1/menus/off-campus` supplies the cuisine choices.

The request and response shapes are in `src/api/types.ts`. `src/api/mapping.ts` turns the saved
profile into the backend's profile, including the allergy spellings the menus use.

## Where things are

- `src/lib/nutrition.ts`: calorie budget and macro targets (Mifflin-St Jeor, pace, cap and floor).
- `src/lib/profile.ts`: the student profile and its storage in the browser.
- `src/api/`: the backend's request and response shapes, the client, and the profile mapping.
- `src/pages/`: Welcome, Onboarding, Home (Today), Plan (Meals) and Profile screens.
- `src/components/`: the calorie ring and macro board, meal cards and the bottom navigation.
- `src/lib/day.ts`: today's chosen meals, shared across screens and reset each day.

## Deploy

`vercel.json` rewrites every path to `index.html`, so the app deploys to Vercel as is. Set
`VITE_API_URL` in the Vercel project's environment variables.
