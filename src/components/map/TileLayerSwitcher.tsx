'use client';

import React, { useState, useRef, useEffect } from 'react';
import L from 'leaflet';
import { Layers, Check } from 'lucide-react';
import { TILE_PROVIDERS, type TileProvider } from './tile-providers';

interface TileLayerSwitcherProps {
  currentProviderId: string;
  onSelectProvider: (providerId: string) => void;
}

export function TileLayerSwitcher({
  currentProviderId,
  onSelectProvider,
}: TileLayerSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentProvider = TILE_PROVIDERS[currentProviderId] || TILE_PROVIDERS.osm;

  // Prevent Leaflet map from capturing click or scroll events occurring inside this control
  useEffect(() => {
    if (containerRef.current) {
      L.DomEvent.disableClickPropagation(containerRef.current);
      L.DomEvent.disableScrollPropagation(containerRef.current);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="leaflet-top leaflet-right leaflet-control no-map-click"
      style={{ pointerEvents: 'auto', zIndex: 1000, margin: '12px' }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="relative">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen((prev) => !prev);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="flex items-center gap-2 px-3 py-2 bg-white/95 backdrop-blur-sm text-slate-800 text-xs font-semibold rounded-lg shadow-md border border-slate-200/80 hover:bg-slate-50 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500"
          title="Switch Map Tile Layer"
        >
          <Layers className="w-4 h-4 text-indigo-600" />
          <span className="hidden sm:inline">{currentProvider.name}</span>
        </button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40 no-map-click cursor-default"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setIsOpen(false);
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
            />
            <div
              className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-100 no-map-click"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="px-3 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-1">
                Base Map Layers
              </div>
              {Object.values(TILE_PROVIDERS).map((provider: TileProvider) => {
                const isActive = provider.id === currentProviderId;
                return (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectProvider(provider.id);
                      setIsOpen(false);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${
                      isActive
                        ? 'bg-indigo-50 font-bold text-indigo-700'
                        : 'text-slate-700 hover:bg-slate-100 font-medium'
                    }`}
                  >
                    <span>{provider.name}</span>
                    {isActive && <Check className="w-3.5 h-3.5 text-indigo-600 ml-2" />}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
