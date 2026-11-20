/**
 * Demo crew shift, kept in this browser's localStorage so the crew screen in
 * one tab shows up live on the commuter map and stage board in another tab.
 * The real version uploads positions from the crew phone to the backend.
 */
export interface CrewShift {
  plate: string;
  routeNumber: string;
  /** Terminus the vehicle starts from: 'outbound' leaves the CBD. */
  direction: 'outbound' | 'inbound';
  startedAt: number;
}

const KEY = 'beacon.demo.crewShift';

export function readCrewShift(): CrewShift | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CrewShift) : null;
  } catch {
    return null;
  }
}

export function writeCrewShift(shift: CrewShift | null): void {
  try {
    if (shift) localStorage.setItem(KEY, JSON.stringify(shift));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: demo shift only lives in memory */
  }
}
