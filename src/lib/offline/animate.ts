/** Move a point along a polyline by distance, with its heading: used to animate vehicles offline. */
import { cumulativeDistances, pointAlong } from '@/lib/tracking/geo';
import type { LatLng } from './roadGraph';

export interface Animator { totalM: number; at(distanceM: number): { point: LatLng; bearing: number } }

export function animator(path: LatLng[]): Animator {
  const cum = cumulativeDistances(path);
  const totalM = cum[cum.length - 1];
  return {
    totalM,
    at(distanceM: number) {
      const point = pointAlong(path, cum, distanceM);
      const ahead = pointAlong(path, cum, Math.min(totalM, distanceM + 15));
      const back = pointAlong(path, cum, Math.max(0, distanceM - 15));
      const k = Math.cos((point.lat * Math.PI) / 180);
      const bearing = (Math.atan2((ahead.lng - back.lng) * k, ahead.lat - back.lat) * 180) / Math.PI;
      return { point, bearing: (bearing + 360) % 360 };
    },
  };
}
