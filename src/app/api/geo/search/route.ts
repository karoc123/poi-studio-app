import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q');
    const limitParam = searchParams.get('limit');
    const limit = parseInt(limitParam || '6', 10) || 6;

    if (!q || !q.trim()) {
      return NextResponse.json(
        { error: 'Search query required' },
        { status: 400 }
      );
    }

    const photonUrl = new URL('https://photon.komoot.io/api/');
    photonUrl.searchParams.set('q', q.trim());
    photonUrl.searchParams.set('limit', String(Math.min(Math.max(limit, 1), 20)));

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
          { error: 'Geocoding request timed out after 4 seconds', type: 'FeatureCollection', features: [] },
          { status: 504 }
        );
      }
      return NextResponse.json(
        { error: 'Failed to contact geocoding service', type: 'FeatureCollection', features: [] },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error('Error in /api/geo/search:', error);
    return NextResponse.json(
      { error: 'Internal server error in geocoding proxy' },
      { status: 500 }
    );
  }
}
