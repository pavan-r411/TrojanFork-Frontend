// Same-origin API when the backend serves /ui/. Override for a separate deployment.
export const config = {
  apiBaseUrl: globalThis.TROJANPLATE_API_BASE_URL || '/',
  timeoutMs: 120000,
  nutritionDemo: false,
  liveMode: true,
  browserNutrition: true, // Session-only logs and manually supplied targets; no server database.
};
