'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import useSWR, { type KeyedMutator } from 'swr';
import type { TripWithAllDetails, Role, SafeUser } from '@/types';

export interface UseTripSyncOptions {
  /**
   * Polling interval in milliseconds.
   * Default: 5000ms (5 seconds) per FEATURES.md §3 & PROJECT.md
   */
  refreshInterval?: number;
  /**
   * Revalidate on window focus. Default: true
   */
  revalidateOnFocus?: boolean;
  /**
   * Initial trip data for SSR / pre-fetched states
   */
  fallbackData?: TripWithAllDetails;
  /**
   * Enable or disable automatic background polling
   */
  isPaused?: boolean;
}

export interface TripApiResponse {
  trip: TripWithAllDetails;
}

export interface MapViewportState {
  center: [number, number];
  zoom: number;
  hasInitialFitted: boolean;
}

/**
 * Default SWR fetcher for trip API endpoints
 */
const tripFetcher = async (url: string): Promise<TripWithAllDetails> => {
  const res = await fetch(url);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    const error = new Error(
      errorBody.error || `Failed to fetch trip (HTTP ${res.status})`
    );
    (error as Error & { status: number }).status = res.status;
    throw error;
  }
  const data = await res.json();
  return data.trip;
};

/**
 * Custom hook for SWR near-realtime synchronization (5-second polling)
 * Includes optimistic UI update helpers and strict Map Isolation Guardrail.
 *
 * Guardrail: Background polling updates (every 5s) NEVER trigger map viewport
 * resets, pans, or fitBounds. Map viewport state remains strictly isolated.
 */
export function useTripSync(
  tripId: string | null | undefined,
  options: UseTripSyncOptions = {}
) {
  const {
    refreshInterval = 5000,
    revalidateOnFocus = true,
    fallbackData,
    isPaused = false,
  } = options;

  const syncCountRef = useRef(0);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [mapFitted, setMapFitted] = useState(false);

  const key = tripId && !isPaused ? `/api/trips/${tripId}` : null;

  const {
    data: trip,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<TripWithAllDetails>(key, tripFetcher, {
    refreshInterval,
    revalidateOnFocus,
    dedupingInterval: 2000,
    fallbackData,
    onSuccess: () => {
      syncCountRef.current += 1;
      setLastSyncTime(Date.now());
    },
  });

  // Role extraction and RBAC convenience flags
  const role: Role =
    (trip?.currentUserRole as Role) ||
    ((trip as unknown as { role?: Role })?.role as Role) ||
    'VIEWER';
  const isOwner = role === 'OWNER';
  const isEditor = role === 'EDITOR';
  const isViewer = role === 'VIEWER';
  const isReadOnly = isViewer;

  /**
   * Map Isolation Guardrail Helpers:
   * shouldAutoFitMap is ONLY true on the very first successful data arrival.
   * Background 5-second SWR polling revalidations NEVER trigger auto-fit.
   */
  const shouldAutoFitMap = !mapFitted && Boolean(trip) && syncCountRef.current === 1;

  const markMapFitted = useCallback(() => {
    setMapFitted(true);
  }, []);

  const resetMapFitGuardrail = useCallback(() => {
    // Explicit manual reset (e.g., when switching Day tabs or clicking "Fit All Pins")
    setMapFitted(false);
  }, []);

  /**
   * Optimistic mutation helper with automatic rollback on error.
   * Immediately updates local SWR cache, executes remote mutation,
   * and rolls back / revalidates if remote call fails.
   */
  const optimisticMutate = useCallback(
    async <T>(
      mutationFn: () => Promise<T>,
      optimisticData:
        | Partial<TripWithAllDetails>
        | ((current: TripWithAllDetails) => TripWithAllDetails)
    ): Promise<T> => {
      if (!mutate || !trip) {
        return mutationFn();
      }

      const patcher = (current: TripWithAllDetails | undefined): TripWithAllDetails => {
        if (!current) return trip;
        if (typeof optimisticData === 'function') {
          return optimisticData(current);
        }
        return {
          ...current,
          ...optimisticData,
        };
      };

      try {
        const result = await mutate(
          async () => {
            return await mutationFn().then(() => undefined);
          },
          {
            optimisticData: patcher(trip),
            rollbackOnError: true,
            populateCache: false,
            revalidate: true,
          }
        );
        return result as unknown as T;
      } catch (err) {
        // Force revalidation to restore canonical backend state
        await mutate();
        throw err;
      }
    },
    [mutate, trip]
  );

  return {
    trip: trip ?? null,
    role,
    isOwner,
    isEditor,
    isViewer,
    isReadOnly,
    isLoading,
    isValidating,
    isBackgroundSync: isValidating && !isLoading,
    error: error as Error | null,
    mutate: mutate as KeyedMutator<TripWithAllDetails>,
    lastSyncTime,
    syncCount: syncCountRef.current,
    optimisticMutate,
    // Map Isolation Guardrails
    shouldAutoFitMap,
    markMapFitted,
    resetMapFitGuardrail,
  };
}

/**
 * Map Viewport State Hook
 * Preserves center, zoom, and bounds independently of SWR 5-second polling updates.
 * Interface Contract M3 <-> M4 (PROJECT.md lines 174-177)
 */
export function useMapState(
  initialCenter: [number, number] = [20, 0],
  initialZoom = 3
) {
  const [viewport, setViewport] = useState<MapViewportState>({
    center: initialCenter,
    zoom: initialZoom,
    hasInitialFitted: false,
  });

  const updateViewport = useCallback((center: [number, number], zoom: number) => {
    setViewport((prev) => ({
      ...prev,
      center,
      zoom,
    }));
  }, []);

  const setInitialFitted = useCallback((fitted = true) => {
    setViewport((prev) => ({
      ...prev,
      hasInitialFitted: fitted,
    }));
  }, []);

  return {
    center: viewport.center,
    zoom: viewport.zoom,
    hasInitialFitted: viewport.hasInitialFitted,
    updateViewport,
    setInitialFitted,
  };
}
