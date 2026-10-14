/** Dev server with mocks on: route guards let you open /admin and /checkin without logging in. */
export const DEV_BYPASS = import.meta.env.DEV && import.meta.env.VITE_USE_MOCKS !== 'false';
