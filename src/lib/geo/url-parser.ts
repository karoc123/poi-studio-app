import type { ParsedMapUrl } from '@/types';

/**
 * Validates that latitude is within [-90, 90] and longitude is within [-180, 180].
 */
export function isValidCoordinates(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (isNaN(lat) || isNaN(lng)) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * Universal client-side URL and coordinate parser.
 * Supports:
 * - Raw decimal coordinates ("48.8584, 2.2945", "-33.8688 151.2093")
 * - Google Maps (@lat,lng, ?q=lat,lng, ll=lat,lng, !3dlat!4dlng, place/title)
 * - Apple Maps (ll=lat,lng, q=title)
 * - OpenStreetMap (#map=zoom/lat/lng, ?mlat=lat&mlon=lng)
 * - Geo URIs (geo:lat,lng or geo:lat,lng?q=lat,lng(title))
 */
export function parseMapUrlOrCoordinates(input: string | null | undefined): ParsedMapUrl | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1. Raw Coordinates: "48.8584, 2.2945" or "-33.8688 151.2093"
  const rawCoordRegex = /^[-+]?([1-8]?\d(?:\.\d+)?|90(?:\.0+)?)[,\s]+[-+]?(180(?:\.0+)?|(?:1[0-7]\d|[1-9]?\d)(?:\.\d+)?)$/;
  const rawMatch = trimmed.match(rawCoordRegex);
  if (rawMatch) {
    const parts = trimmed.split(/[,\s]+/).map(Number);
    const lat = parts[0];
    const lng = parts[1];
    if (isValidCoordinates(lat, lng)) {
      return { lat, lng, title: undefined, rawUrl: trimmed };
    }
  }

  // 2. Google Maps URLs
  if (
    trimmed.includes('google.com/maps') ||
    trimmed.includes('maps.google.com') ||
    trimmed.includes('goo.gl/maps')
  ) {
    let lat: number | undefined;
    let lng: number | undefined;
    let title: string | undefined;

    // Place Name Extraction
    const placeMatch = trimmed.match(/maps\/place\/([^/?#]+)/);
    if (placeMatch) {
      try {
        title = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
      } catch {
        title = placeMatch[1].replace(/\+/g, ' ');
      }
    }

    // @lat,lng syntax
    const atMatch = trimmed.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) {
      lat = parseFloat(atMatch[1]);
      lng = parseFloat(atMatch[2]);
    }

    // !3dlat!4dlng protobuf syntax
    if (lat === undefined || isNaN(lat)) {
      const protoMatch = trimmed.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
      if (protoMatch) {
        lat = parseFloat(protoMatch[1]);
        lng = parseFloat(protoMatch[2]);
      }
    }

    // ?q=lat,lng syntax
    if (lat === undefined || isNaN(lat)) {
      const qMatch = trimmed.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (qMatch) {
        lat = parseFloat(qMatch[1]);
        lng = parseFloat(qMatch[2]);
      }
    }

    // ll=lat,lng syntax
    if (lat === undefined || isNaN(lat)) {
      const llMatch = trimmed.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (llMatch) {
        lat = parseFloat(llMatch[1]);
        lng = parseFloat(llMatch[2]);
      }
    }

    if (lat !== undefined && lng !== undefined && isValidCoordinates(lat, lng)) {
      return { lat, lng, title, rawUrl: trimmed };
    }
  }

  // 3. Apple Maps URLs
  if (trimmed.includes('maps.apple.com')) {
    const llMatch = trimmed.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
    let title: string | undefined;
    const qMatch = trimmed.match(/[?&]q=([^&]+)/);
    if (qMatch) {
      try {
        title = decodeURIComponent(qMatch[1].replace(/\+/g, ' '));
      } catch {
        title = qMatch[1].replace(/\+/g, ' ');
      }
    }
    if (llMatch) {
      const lat = parseFloat(llMatch[1]);
      const lng = parseFloat(llMatch[2]);
      if (isValidCoordinates(lat, lng)) {
        return { lat, lng, title, rawUrl: trimmed };
      }
    }
  }

  // 4. OpenStreetMap URLs
  if (trimmed.includes('openstreetmap.org')) {
    // #map=zoom/lat/lon
    const hashMapMatch = trimmed.match(/#map=\d+\/(-?\d+\.\d+)\/(-?\d+\.\d+)/);
    if (hashMapMatch) {
      const lat = parseFloat(hashMapMatch[1]);
      const lng = parseFloat(hashMapMatch[2]);
      if (isValidCoordinates(lat, lng)) {
        return { lat, lng, title: undefined, rawUrl: trimmed };
      }
    }
    // ?mlat=lat&mlon=lon
    const mlatMatch = trimmed.match(/[?&]mlat=(-?\d+\.\d+)&mlon=(-?\d+\.\d+)/);
    if (mlatMatch) {
      const lat = parseFloat(mlatMatch[1]);
      const lng = parseFloat(mlatMatch[2]);
      if (isValidCoordinates(lat, lng)) {
        return { lat, lng, title: undefined, rawUrl: trimmed };
      }
    }
  }

  // 5. Geo URI
  if (trimmed.startsWith('geo:')) {
    const geoMatch = trimmed.match(
      /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:\?q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:\((.*?)\))?)?/
    );
    if (geoMatch) {
      const lat = parseFloat(geoMatch[3] || geoMatch[1]);
      const lng = parseFloat(geoMatch[4] || geoMatch[2]);
      let title: string | undefined;
      if (geoMatch[5]) {
        try {
          title = decodeURIComponent(geoMatch[5]);
        } catch {
          title = geoMatch[5];
        }
      }
      if (isValidCoordinates(lat, lng)) {
        return { lat, lng, title, rawUrl: trimmed };
      }
    }
  }

  return null;
}

/**
 * Viewport bounds calculation helper conforming to survey_specs.md & test specifications:
 * - Empty POIs: returns { center: [20, 0], zoom: 2, empty: true }
 * - Single POI: returns { center: [lat, lng], zoom: 14 } (clamped to 14)
 * - Multiple POIs: returns bounding box [[minLat, minLng], [maxLat, maxLng]]
 */
export function calculateBoundsForPois(pois: Array<{ lat: number; lng: number }>) {
  if (!pois || pois.length === 0) {
    return { center: [20, 0] as [number, number], zoom: 2, empty: true };
  }
  if (pois.length === 1) {
    return {
      center: [pois[0].lat, pois[0].lng] as [number, number],
      zoom: 14,
      empty: false,
    };
  }
  const lats = pois.map((p) => p.lat);
  const lngs = pois.map((p) => p.lng);
  return {
    bounds: [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ] as [[number, number], [number, number]],
    empty: false,
  };
}
