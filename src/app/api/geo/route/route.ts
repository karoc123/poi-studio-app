import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const EARTH_RADIUS_KM = 6371.0088;

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

function estimateDurationMinutes(distanceKm: number, mode = 'DRIVING'): number {
  const speeds: Record<string, number> = {
    DRIVING: 50,
    CYCLING: 15,
    WALKING: 4.5,
    TRANSIT: 30,
  };
  const speed = speeds[mode.toUpperCase()] || 50;
  return Math.round((distanceKm / speed) * 60);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = (searchParams.get('mode') || 'driving').toLowerCase();
    const coords = searchParams.get('coords'); // format: lon1,lat1;lon2,lat2

    if (!coords) {
      return NextResponse.json(
        { error: 'Coordinates required' },
        { status: 400 }
      );
    }

    const points = coords.split(';').map((pt) => pt.split(',').map(Number));
    if (points.length < 2 || points.some((p) => p.length !== 2 || isNaN(p[0]) || isNaN(p[1]))) {
      return NextResponse.json(
        { error: 'At least 2 points required' },
        { status: 400 }
      );
    }

    // Try OSRM public API with 4-second timeout
    const profile = mode === 'walking' ? 'foot' : mode === 'cycling' ? 'bike' : 'car';
    const osrmUrl = `https://router.project-osrm.org/route/v1/${profile}/${coords}?overview=full&geometries=geojson`;

    try {
      const res = await fetch(osrmUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'POIStudio/1.0 (Travel Planner)',
        },
        signal: AbortSignal.timeout(4000),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          return NextResponse.json({
            coordinates: route.geometry.coordinates, // [lon, lat]
            distanceKm: Math.round((route.distance / 1000) * 10) / 10,
            durationMin: Math.round(route.duration / 60),
            isFallback: false,
          });
        }
      }
    } catch {
      // Fallback on timeout or OSRM error
    }

    // Geodesic Haversine fallback
    let totalDist = 0;
    for (let i = 0; i < points.length - 1; i++) {
      totalDist += haversineDistance(points[i][1], points[i][0], points[i + 1][1], points[i + 1][0]);
    }

    const durationMin = estimateDurationMinutes(totalDist, mode);
    return NextResponse.json({
      coordinates: points,
      distanceKm: Math.round(totalDist * 10) / 10,
      durationMin,
      isFallback: true,
    });
  } catch (error) {
    console.error('Error in /api/geo/route:', error);
    return NextResponse.json(
      { error: 'Internal server error in route calculation' },
      { status: 500 }
    );
  }
}
