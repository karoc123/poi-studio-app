'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { calculateBoundsForPois } from '@/lib/geo';

interface MapViewportControllerProps {
  pois: Array<{ id: string; lat: number; lng: number }>;
  filterKey?: string | number | null; // e.g. active day tab
  flyToTarget?: { lat: number; lng: number; zoom?: number } | null;
  requestFitBoundsTimestamp?: number;
}

export function MapViewportController({
  pois,
  filterKey,
  flyToTarget,
  requestFitBoundsTimestamp,
}: MapViewportControllerProps) {
  const map = useMap();
  const hasInitialFitRef = useRef(false);
  const lastFilterKeyRef = useRef<string | number | null | undefined>(undefined);
  const lastFitBoundsTimestampRef = useRef<number | undefined>(undefined);

  const applyFitBounds = () => {
    if (!pois || pois.length === 0) {
      map.setView([20, 0], 2);
      return;
    }

    const boundsData = calculateBoundsForPois(pois);
    if ('center' in boundsData && boundsData.center) {
      map.setView(boundsData.center, boundsData.zoom);
    } else if ('bounds' in boundsData) {
      map.fitBounds(boundsData.bounds, {
        padding: [60, 60],
        maxZoom: 16,
      });
    }
  };

  // 1. Initial fit on first render with POIs
  useEffect(() => {
    if (!hasInitialFitRef.current && pois.length > 0) {
      hasInitialFitRef.current = true;
      lastFilterKeyRef.current = filterKey;
      applyFitBounds();
    }
  }, [pois.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2. Filter key change (e.g. Day tab change)
  useEffect(() => {
    if (lastFilterKeyRef.current !== undefined && lastFilterKeyRef.current !== filterKey) {
      lastFilterKeyRef.current = filterKey;
      applyFitBounds();
    } else if (lastFilterKeyRef.current === undefined) {
      lastFilterKeyRef.current = filterKey;
    }
  }, [filterKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 3. Explicit fit bounds request (e.g. "Fit All Pins" button clicked)
  useEffect(() => {
    if (
      requestFitBoundsTimestamp &&
      requestFitBoundsTimestamp !== lastFitBoundsTimestampRef.current
    ) {
      lastFitBoundsTimestampRef.current = requestFitBoundsTimestamp;
      applyFitBounds();
    }
  }, [requestFitBoundsTimestamp]); // eslint-disable-line react-hooks/exhaustive-deps

  // 4. Smooth FlyTo target (e.g. user clicked POI in sidebar or search result)
  useEffect(() => {
    if (flyToTarget && typeof flyToTarget.lat === 'number' && typeof flyToTarget.lng === 'number') {
      map.flyTo([flyToTarget.lat, flyToTarget.lng], flyToTarget.zoom ?? 15, {
        duration: 1.2,
      });
    }
  }, [flyToTarget, map]);

  return null;
}
