'use client';

import React from 'react';
import { Car, Footprints, Bike, Navigation, ExternalLink } from 'lucide-react';
import type { TransportMode } from '@/types';

interface LegTimelineConnectorProps {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  distanceKm?: number;
  durationMinutes?: number;
  mode?: TransportMode | string;
  isFallback?: boolean;
}

export function LegTimelineConnector({
  fromLat,
  fromLng,
  toLat,
  toLng,
  distanceKm,
  durationMinutes,
  mode = 'DRIVING',
  isFallback = false,
}: LegTimelineConnectorProps) {
  const normMode = String(mode).toUpperCase();
  const Icon =
    normMode === 'WALKING'
      ? Footprints
      : normMode === 'CYCLING'
      ? Bike
      : Car;

  const googleMapsDirectionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}`;

  return (
    <div className="relative pl-6 py-1 my-0.5 group">
      {/* Vertical dotted connector line */}
      <div className="absolute left-[13px] top-0 bottom-0 w-0.5 border-l-2 border-dashed border-indigo-200" />

      {/* Pill content */}
      <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200/90 text-[11px] text-slate-600 shadow-xs hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors">
        <Icon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />

        {distanceKm !== undefined && (
          <span className="font-bold text-slate-800">
            {distanceKm} km
          </span>
        )}

        {durationMinutes !== undefined && (
          <>
            <span className="text-slate-300">•</span>
            <span className="font-medium text-slate-600">
              ~{durationMinutes} min
            </span>
          </>
        )}

        {isFallback && (
          <span
            className="text-[9px] font-bold px-1 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200"
            title="Geodesic calculation fallback"
          >
            Direct
          </span>
        )}

        {/* External Google Maps Route link */}
        <a
          href={googleMapsDirectionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 font-semibold text-[10px] ml-1 pl-1.5 border-l border-slate-200"
          title="Open leg directions in Google Maps"
        >
          <span>Route</span>
          <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </div>
    </div>
  );
}

export default LegTimelineConnector;
