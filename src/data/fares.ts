/**
 * Usual fares per route in KSh, off-peak and at peak hours. Demo values until each SACCO
 * confirms its fares; shared by the app and the partner stage API (/api/v1/stages.json).
 */
export const FARES: Record<string, { offPeak: number; peak: number }> = {
  '46': { offPeak: 60, peak: 80 },
  '34': { offPeak: 70, peak: 100 },
  '15': { offPeak: 80, peak: 100 },
  '108': { offPeak: 50, peak: 70 },
};
