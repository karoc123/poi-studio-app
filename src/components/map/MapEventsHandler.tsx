'use client';

import { useMapEvents } from 'react-leaflet';
import type { LeafletMouseEvent } from 'leaflet';

interface MapEventsHandlerProps {
  isReadOnly?: boolean;
  onMapClick?: (coords: { lat: number; lng: number }) => void;
}

export function MapEventsHandler({
  isReadOnly = false,
  onMapClick,
}: MapEventsHandlerProps) {
  useMapEvents({
    click(e: LeafletMouseEvent) {
      if (isReadOnly || !onMapClick) return;
      // Guardrail: Ignore click if target is a UI control or button
      const target = e.originalEvent?.target as HTMLElement | null;
      if (
        target &&
        (target.closest('.leaflet-control') ||
          target.closest('.no-map-click') ||
          target.closest('button') ||
          target.closest('input'))
      ) {
        return;
      }
      onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
    contextmenu(e: LeafletMouseEvent) {
      if (isReadOnly || !onMapClick) return;
      const target = e.originalEvent?.target as HTMLElement | null;
      if (
        target &&
        (target.closest('.leaflet-control') ||
          target.closest('.no-map-click') ||
          target.closest('button'))
      ) {
        return;
      }
      // Prevent default browser context menu when right clicking on the map
      e.originalEvent.preventDefault();
      onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });

  return null;
}
