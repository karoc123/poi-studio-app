'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import { Maximize2, MapPin, Star } from 'lucide-react';
import { TILE_PROVIDERS, DEFAULT_TILE_PROVIDER_ID } from './tile-providers';
import { createPoiDivIcon, getCategoryTheme } from './marker-icons';
import { TileLayerSwitcher } from './TileLayerSwitcher';
import { MapEventsHandler } from './MapEventsHandler';
import { MapViewportController } from './MapViewportController';
import type { PoiWithRelations, PoiCategory, PoiStatus } from '@/types';

export interface RouteLegItem {
  coordinates: [number, number][]; // [lat, lng]
  isFallback?: boolean;
}

export interface MapPoiItem {
  id: string;
  title: string;
  category: PoiCategory | string;
  status: PoiStatus | string;
  isMustSee: boolean;
  lat: number;
  lng: number;
  address?: string | null;
  dayStart?: number | null;
  dayEnd?: number | null;
  orderIndex?: number;
  stopNumber?: number | null;
  notes?: string | null;
  timeSlot?: string | null;
  estimatedCost?: number;
  currency?: string;
}

export interface LeafletMapProps {
  pois: MapPoiItem[];
  routeLegs?: RouteLegItem[];
  selectedPoiId?: string | null;
  hoveredPoiId?: string | null;
  onSelectPoi?: (poi: MapPoiItem) => void;
  onMapClick?: (coords: { lat: number; lng: number }) => void;
  isReadOnly?: boolean;
  filterKey?: string | number | null;
  initialCenter?: [number, number];
  initialZoom?: number;
  flyToTarget?: { lat: number; lng: number; zoom?: number } | null;
  className?: string;
}

export function LeafletMapInner({
  pois,
  routeLegs = [],
  selectedPoiId,
  hoveredPoiId,
  onSelectPoi,
  onMapClick,
  isReadOnly = false,
  filterKey,
  initialCenter = [48.8584, 2.2945], // Default Paris
  initialZoom = 13,
  flyToTarget,
  className = '',
}: LeafletMapProps) {
  const [tileProviderId, setTileProviderId] = useState<string>(DEFAULT_TILE_PROVIDER_ID);
  const [requestFitBoundsTimestamp, setRequestFitBoundsTimestamp] = useState<number>(0);
  const [isDropPinActive, setIsDropPinActive] = useState(false);
  const markerRefs = useRef<Record<string, L.Marker>>({});

  const currentTileProvider = TILE_PROVIDERS[tileProviderId] || TILE_PROVIDERS.osm;

  // Open popup when selectedPoiId changes
  useEffect(() => {
    if (selectedPoiId && markerRefs.current[selectedPoiId]) {
      markerRefs.current[selectedPoiId].openPopup();
    }
  }, [selectedPoiId]);

  const handleFitAllPins = () => {
    setRequestFitBoundsTimestamp(Date.now());
  };

  const handleMapClick = (coords: { lat: number; lng: number }) => {
    if (isReadOnly || !onMapClick) return;
    onMapClick(coords);
    if (isDropPinActive) {
      setIsDropPinActive(false);
    }
  };

  return (
    <div className={`relative h-full w-full min-h-[400px] select-none ${isDropPinActive ? 'cursor-crosshair' : ''} ${className}`}>
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        scrollWheelZoom={true}
        className="h-full w-full rounded-none sm:rounded-xl overflow-hidden shadow-inner"
        zoomControl={true}
      >
        {/* Active Keyless Tile Layer */}
        <TileLayer
          key={currentTileProvider.id}
          url={currentTileProvider.url}
          attribution={currentTileProvider.attribution}
          maxZoom={currentTileProvider.maxZoom}
          subdomains={currentTileProvider.subdomains || 'abc'}
        />

        {/* Tile Provider Switcher in Top-Right */}
        <TileLayerSwitcher
          currentProviderId={tileProviderId}
          onSelectProvider={setTileProviderId}
        />

        {/* Viewport Isolation Controller */}
        <MapViewportController
          pois={pois}
          filterKey={filterKey}
          flyToTarget={flyToTarget}
          requestFitBoundsTimestamp={requestFitBoundsTimestamp}
        />

        {/* Map Click & Context Menu Handler */}
        <MapEventsHandler
          isReadOnly={isReadOnly}
          onMapClick={handleMapClick}
        />

        {/* Route Polylines Connecting Day Stops */}
        {routeLegs?.map((leg, idx) => (
          <Polyline
            key={`route-leg-${idx}`}
            positions={leg.coordinates}
            pathOptions={{
              color: leg.isFallback ? '#6366F1' : '#4F46E5',
              weight: 4,
              opacity: 0.8,
              dashArray: leg.isFallback ? '6, 8' : undefined,
            }}
          />
        ))}

        {/* Markers */}
        {pois.map((poi) => {
          const isSelected = selectedPoiId === poi.id;
          const isHovered = hoveredPoiId === poi.id;
          const theme = getCategoryTheme(poi.category);

          const icon = createPoiDivIcon(L, {
            category: poi.category,
            status: poi.status,
            stopNumber: poi.stopNumber,
            isMustSee: poi.isMustSee,
            isSelected,
            isHovered,
            title: poi.title,
          });

          return (
            <Marker
              key={poi.id}
              position={[poi.lat, poi.lng]}
              icon={icon}
              zIndexOffset={isSelected ? 1000 : isHovered ? 800 : 100}
              ref={(ref) => {
                if (ref) {
                  markerRefs.current[poi.id] = ref;
                } else {
                  delete markerRefs.current[poi.id];
                }
              }}
              eventHandlers={{
                click: () => {
                  if (onSelectPoi) {
                    onSelectPoi(poi);
                  }
                },
              }}
            >
              <Popup className="custom-poi-leaflet-popup" offset={[0, -10]}>
                <div className="p-1 max-w-[240px]">
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span
                      className="inline-block text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-white"
                      style={{ backgroundColor: theme.color }}
                    >
                      {theme.label}
                    </span>
                    {poi.isMustSee && (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                        <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> Must-See
                      </span>
                    )}
                  </div>

                  <h4 className="font-bold text-sm text-slate-900 leading-tight mb-1">
                    {poi.title}
                  </h4>

                  {poi.address && (
                    <p className="text-[11px] text-slate-500 line-clamp-2 mb-1.5">
                      {poi.address}
                    </p>
                  )}

                  {poi.timeSlot && (
                    <p className="text-[11px] text-indigo-600 font-semibold mb-1">
                      ⏰ {poi.timeSlot}
                    </p>
                  )}

                  {poi.notes && (
                    <p className="text-[11px] text-slate-600 line-clamp-2 italic border-l-2 border-slate-300 pl-1.5 mb-2">
                      {poi.notes}
                    </p>
                  )}

                  <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase">
                      Status: <strong className="text-slate-800">{poi.status}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelectPoi?.(poi)}
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                    >
                      View Details &rarr;
                    </button>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Floating Map Action Controls (Fit All Pins & Drop Pin) */}
      <div
        className="absolute bottom-5 left-4 z-[999] flex flex-wrap items-center gap-2 pointer-events-auto no-map-click"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleFitAllPins();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 px-3 py-2 bg-white/95 backdrop-blur-sm text-slate-800 text-xs font-semibold rounded-lg shadow-md border border-slate-200/80 hover:bg-slate-50 active:bg-slate-100 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500"
          title="Fit All Visible Pins in Viewport"
        >
          <Maximize2 className="w-3.5 h-3.5 text-indigo-600" />
          <span>Fit All Pins</span>
        </button>

        {!isReadOnly && onMapClick && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsDropPinActive((prev) => !prev);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg shadow-md border transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              isDropPinActive
                ? 'bg-indigo-600 text-white border-indigo-700 ring-2 ring-indigo-400'
                : 'bg-white/95 backdrop-blur-sm text-slate-800 border-slate-200/80 hover:bg-slate-50'
            }`}
            title="Click to drop a pin anywhere on the map"
          >
            <MapPin className={`w-3.5 h-3.5 ${isDropPinActive ? 'text-white' : 'text-indigo-600'}`} />
            <span>{isDropPinActive ? 'Click Map to Pin' : 'Drop Pin'}</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default LeafletMapInner;
