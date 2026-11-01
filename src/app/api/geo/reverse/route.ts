import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const latStr = searchParams.get('lat');
    const lonStr = searchParams.get('lon') || searchParams.get('lng');

    if (!latStr || !lonStr) {
      return NextResponse.json(
        { error: 'Valid lat and lon required' },
        { status: 400 }
      );
    }

    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);

    if (
      isNaN(lat) ||
      isNaN(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      return NextResponse.json(
        { error: 'Valid lat and lon required' },
        { status: 400 }
      );
    }

    const photonUrl = new URL('https://photon.komoot.io/reverse');
    photonUrl.searchParams.set('lat', String(lat));
    photonUrl.searchParams.set('lon', String(lon));

    try {
      const res = await fetch(photonUrl.toString(), {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'POIStudio/1.0 (Travel Planner)',
        },
        signal: AbortSignal.timeout(4000),
      });

      if (!res.ok) {
        return NextResponse.json(
          { error: `Photon upstream error: ${res.statusText}`, type: 'FeatureCollection', features: [] },
          { status: res.status >= 500 ? 502 : res.status }
        );
      }

      const data = await res.json();
      return NextResponse.json(data, {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      });
    } catch (fetchErr: unknown) {
      const err = fetchErr as { name?: string; message?: string };
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        return NextResponse.json(
          { error: 'Reverse geocoding request timed out after 4 seconds', type: 'FeatureCollection', features: [] },
          { status: 504 }
        );
      }
      return NextResponse.json(
        { error: 'Failed to contact reverse geocoding service', type: 'FeatureCollection', features: [] },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error('Error in /api/geo/reverse:', error);
    return NextResponse.json(
      { error: 'Internal server error in reverse geocoding proxy' },
      { status: 500 }
    );
  }
}
