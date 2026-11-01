/**
 * TSP Route Optimization Algorithm
 * Nearest-Neighbor heuristic preserving accommodation or initial stop as starting anchor.
 */

export const EARTH_RADIUS_KM = 6371.0088;

/**
 * Calculates spherical Haversine distance between two coordinates in kilometers.
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Estimates travel duration in minutes based on transport mode and distance in km.
 */
export function estimateDurationMinutes(
  distanceKm: number,
  mode = 'DRIVING'
): number {
  const speeds: Record<string, number> = {
    DRIVING: 50, // 50 km/h
    CYCLING: 15, // 15 km/h
    WALKING: 4.5, // 4.5 km/h
    TRANSIT: 30, // 30 km/h
  };
  const speed = speeds[mode.toUpperCase()] || 50;
  return Math.round((distanceKm / speed) * 60);
}

export interface TspPoiItem {
  id: string;
  lat: number;
  lng: number;
  category?: string;
  dayStart?: number | null;
  dayEnd?: number | null;
  orderIndex?: number;
  [key: string]: any;
}

/**
 * Solves Nearest-Neighbor Traveling Salesperson (TSP) heuristic.
 * Identifies starting node:
 * - Accommodation covering this day (dayStart <= day && (dayEnd == null || dayEnd >= day)) has highest priority
 * - Otherwise, first scheduled stop is preserved as anchor
 * Sequentially visits nearest unvisited node until all stops are re-ordered.
 */
export function optimizeDayStops<T extends TspPoiItem>(
  pois: T[],
  day: number
): T[] {
  if (!pois || !Array.isArray(pois) || pois.length === 0) {
    return [];
  }
  if (pois.length === 1) {
    return [{ ...pois[0], orderIndex: 0 }];
  }

  // 1. Identify starting anchor node:
  let startIdx = pois.findIndex(
    (p) =>
      p.category === 'ACCOMMODATION' &&
      p.dayStart !== null &&
      p.dayStart !== undefined &&
      p.dayStart <= day &&
      (p.dayEnd === null || p.dayEnd === undefined || p.dayEnd >= day)
  );

  if (startIdx === -1) {
    startIdx = 0; // default to first scheduled stop
  }

  const startNode = pois[startIdx];
  const unvisited = pois.filter((_, idx) => idx !== startIdx);
  const route: T[] = [startNode];

  let current = startNode;
  while (unvisited.length > 0) {
    let nearestIdx = 0;
    let minDistance = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const d = haversineDistance(
        current.lat,
        current.lng,
        unvisited[i].lat,
        unvisited[i].lng
      );
      if (d < minDistance) {
        minDistance = d;
        nearestIdx = i;
      }
    }

    current = unvisited[nearestIdx];
    route.push(current);
    unvisited.splice(nearestIdx, 1);
  }

  return route.map((poi, index) => ({
    ...poi,
    orderIndex: index,
  }));
}
