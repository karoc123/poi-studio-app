// tests/harness/geo-utils.js
// Authoritative geospatial and algorithmic helpers conforming to survey_specs.md

const EARTH_RADIUS_KM = 6371.0088;

/**
 * Calculates spherical Haversine distance between two coordinates in kilometers.
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
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
function estimateDurationMinutes(distanceKm, mode = 'DRIVING') {
  const speeds = {
    DRIVING: 50, // 50 km/h
    CYCLING: 15, // 15 km/h
    WALKING: 4.5, // 4.5 km/h
    TRANSIT: 30, // 30 km/h
  };
  const speed = speeds[mode.toUpperCase()] || 50;
  return Math.round((distanceKm / speed) * 60);
}

/**
 * Client-side universal URL and coordinate parser conforming to survey_specs.md §6.
 */
function parseMapUrlOrCoordinates(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();

  // 1. Raw Coordinates: "48.8584, 2.2945" or "48.8584 2.2945"
  const rawCoordRegex = /^[-+]?([1-8]?\d(?:\.\d+)?|90(?:\.0+)?)[,\s]+[-+]?(180(?:\.0+)?|(?:1[0-7]\d|[1-9]?\d)(?:\.\d+)?)$/;
  const rawMatch = trimmed.match(rawCoordRegex);
  if (rawMatch) {
    const parts = trimmed.split(/[,\s]+/).map(Number);
    const lat = parts[0];
    const lng = parts[1];
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng, title: undefined, rawUrl: trimmed };
    }
  }

  // 2. Google Maps URLs
  if (trimmed.includes('google.com/maps') || trimmed.includes('maps.google.com') || trimmed.includes('goo.gl/maps')) {
    let lat, lng, title;

    // Place Name Extraction
    const placeMatch = trimmed.match(/maps\/place\/([^/?#]+)/);
    if (placeMatch) {
      title = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
    }

    // @lat,lng syntax
    const atMatch = trimmed.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) {
      lat = parseFloat(atMatch[1]);
      lng = parseFloat(atMatch[2]);
    }

    // !3dlat!4dlng protobuf syntax
    if (lat === undefined) {
      const protoMatch = trimmed.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
      if (protoMatch) {
        lat = parseFloat(protoMatch[1]);
        lng = parseFloat(protoMatch[2]);
      }
    }

    // ?q=lat,lng syntax
    if (lat === undefined) {
      const qMatch = trimmed.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (qMatch) {
        lat = parseFloat(qMatch[1]);
        lng = parseFloat(qMatch[2]);
      }
    }

    if (lat !== undefined && lng !== undefined) {
      return { lat, lng, title, rawUrl: trimmed };
    }
  }

  // 3. Apple Maps URLs
  if (trimmed.includes('maps.apple.com')) {
    const llMatch = trimmed.match(/[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
    let title;
    const qMatch = trimmed.match(/[?&]q=([^&]+)/);
    if (qMatch) {
      title = decodeURIComponent(qMatch[1].replace(/\+/g, ' '));
    }
    if (llMatch) {
      return {
        lat: parseFloat(llMatch[1]),
        lng: parseFloat(llMatch[2]),
        title,
        rawUrl: trimmed,
      };
    }
  }

  // 4. OpenStreetMap URLs
  if (trimmed.includes('openstreetmap.org')) {
    // #map=zoom/lat/lon
    const hashMapMatch = trimmed.match(/#map=\d+\/(-?\d+\.\d+)\/(-?\d+\.\d+)/);
    if (hashMapMatch) {
      return {
        lat: parseFloat(hashMapMatch[1]),
        lng: parseFloat(hashMapMatch[2]),
        title: undefined,
        rawUrl: trimmed,
      };
    }
    // ?mlat=lat&mlon=lon
    const mlatMatch = trimmed.match(/[?&]mlat=(-?\d+\.\d+)&mlon=(-?\d+\.\d+)/);
    if (mlatMatch) {
      return {
        lat: parseFloat(mlatMatch[1]),
        lng: parseFloat(mlatMatch[2]),
        title: undefined,
        rawUrl: trimmed,
      };
    }
  }

  // 5. Geo URI
  if (trimmed.startsWith('geo:')) {
    const geoMatch = trimmed.match(/^geo:(-?\d+\.\d+),(-?\d+\.\d+)(?:\?q=(-?\d+\.\d+),(-?\d+\.\d+)(?:\((.*?)\))?)?/);
    if (geoMatch) {
      const lat = parseFloat(geoMatch[3] || geoMatch[1]);
      const lng = parseFloat(geoMatch[4] || geoMatch[2]);
      const title = geoMatch[5] ? decodeURIComponent(geoMatch[5]) : undefined;
      return { lat, lng, title, rawUrl: trimmed };
    }
  }

  return null;
}

/**
 * Solves Nearest-Neighbor Traveling Salesperson (TSP) heuristic conforming to survey_specs.md §7.1.
 * Preserves accommodation or first stop as fixed starting point.
 */
function optimizeDayStops(pois, day) {
  if (!pois || !Array.isArray(pois) || pois.length === 0) {
    return [];
  }
  if (pois.length === 1) {
    return [{ ...pois[0], orderIndex: 0 }];
  }

  // 1. Identify starting node S:
  // Accommodation that covers this day (dayStart <= day <= dayEnd) has highest priority as starting point
  let startIdx = pois.findIndex(
    (p) =>
      p.category === 'ACCOMMODATION' &&
      p.dayStart !== null &&
      p.dayStart <= day &&
      (p.dayEnd === null || p.dayEnd >= day)
  );

  if (startIdx === -1) {
    startIdx = 0; // default to first scheduled stop
  }

  const startNode = pois[startIdx];
  const unvisited = pois.filter((_, idx) => idx !== startIdx);
  const route = [startNode];

  let current = startNode;
  while (unvisited.length > 0) {
    let nearestIdx = 0;
    let minDistance = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const d = haversineDistance(current.lat, current.lng, unvisited[i].lat, unvisited[i].lng);
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

/**
 * Calculates day workload summary and checks if schedule is overloaded (>600 min / 10 hours).
 */
function calculateDayWorkload(pois, legs = []) {
  const totalStops = pois.length;
  const totalVisitMinutes = pois.reduce((sum, p) => sum + (p.durationMinutes || 60), 0);
  const totalTravelMinutes = legs.reduce((sum, l) => sum + (l.durationMinutes || 0), 0);
  const totalDistanceKm = legs.reduce((sum, l) => sum + (l.distanceKm || 0), 0);
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

/**
 * Escapes XML entities for valid GPX 1.1 generation.
 */
function escapeXml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

module.exports = {
  haversineDistance,
  estimateDurationMinutes,
  parseMapUrlOrCoordinates,
  optimizeDayStops,
  calculateDayWorkload,
  escapeXml,
};
