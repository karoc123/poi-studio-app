/**
 * Daily Workload & Pace Calculator
 * Computes total visits, travel durations, and detects overloaded schedules (> 10h / 600m).
 */

export interface WorkloadPoi {
  durationMinutes?: number | null;
  [key: string]: any;
}

export interface WorkloadLeg {
  durationMinutes?: number | null;
  distanceKm?: number | null;
  [key: string]: any;
}

export interface DayWorkloadResult {
  totalStops: number;
  totalVisitMinutes: number;
  totalTravelMinutes: number;
  totalDistanceKm: number;
  totalDayMinutes: number;
  isOverloaded: boolean; // True if duration exceeds 600 min (10 hours)
}

/**
 * Calculates day workload summary and checks if schedule is overloaded (>600 min / 10 hours).
 */
export function calculateDayWorkload(
  pois: WorkloadPoi[],
  legs: WorkloadLeg[] = []
): DayWorkloadResult {
  const totalStops = pois.length;
  // Default 60 min duration per stop if null/undefined
  const totalVisitMinutes = pois.reduce(
    (sum, p) => sum + (p.durationMinutes !== null && p.durationMinutes !== undefined ? p.durationMinutes : 60),
    0
  );
  const totalTravelMinutes = legs.reduce(
    (sum, l) => sum + (l.durationMinutes || 0),
    0
  );
  const totalDistanceKm = legs.reduce(
    (sum, l) => sum + (l.distanceKm || 0),
    0
  );
  const totalDayMinutes = totalVisitMinutes + totalTravelMinutes;

  return {
    totalStops,
    totalVisitMinutes,
    totalTravelMinutes,
    totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
    totalDayMinutes,
    isOverloaded: totalDayMinutes > 600, // > 10 hours
  };
}
