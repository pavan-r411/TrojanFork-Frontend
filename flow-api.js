// Calls to the guided-flow endpoints. All validation and filtering happens on the server.
import { request } from './api.js';

export const flowApi = {
  options: body => request('/v1/flow/options', body),
  parse: text => request('/v1/flow/parse', { text }),
  explain: body => request('/v1/flow/explain', body),
  menuStatus: () => request('/v1/flow/menu-status'),
  bands: (lat, lng) => request(`/v1/flow/bands?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`),
};
