'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, MapPin, X, Loader2, ExternalLink, Compass } from 'lucide-react';
import { parseMapUrlOrCoordinates } from '@/lib/geo';
import type { ParsedMapUrl, PhotonFeature } from '@/types';

export interface SmartSearchBarProps {
  onSelectParsedLocation: (location: {
    lat: number;
    lng: number;
    title?: string;
    address?: string;
  }) => void;
  isReadOnly?: boolean;
  placeholder?: string;
  className?: string;
}

export function SmartSearchBar({
  onSelectParsedLocation,
  isReadOnly = false,
  placeholder = 'Search places, coordinates, or paste map links...',
  className = '',
}: SmartSearchBarProps) {
  const [query, setQuery] = useState('');
  const [parsedUrlResult, setParsedUrlResult] = useState<ParsedMapUrl | null>(null);
  const [suggestions, setSuggestions] = useState<PhotonFeature[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle Input Changes with Regex Check & Debounced Photon Autocomplete
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setActiveIndex(-1);

    if (!val.trim()) {
      setParsedUrlResult(null);
      setSuggestions([]);
      setIsOpen(false);
      setIsLoading(false);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      return;
    }

    // 1. Check for Map URL or Raw Coordinates immediately
    const parsed = parseMapUrlOrCoordinates(val);
    if (parsed) {
      setParsedUrlResult(parsed);
      setSuggestions([]);
      setIsOpen(true);
      setIsLoading(false);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      return;
    }

    // Not a map URL or coordinates -> search via Komoot Photon API with 300ms debounce
    setParsedUrlResult(null);

    if (val.trim().length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    setIsLoading(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geo/search?q=${encodeURIComponent(val.trim())}&limit=6`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.features || []);
          setIsOpen(true);
        } else {
          setSuggestions([]);
        }
      } catch (err) {
        console.error('Photon search failed:', err);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);
  };

  const handleSelectParsed = useCallback(() => {
    if (!parsedUrlResult) return;
    onSelectParsedLocation({
      lat: parsedUrlResult.lat,
      lng: parsedUrlResult.lng,
      title: parsedUrlResult.title || `Pin at ${parsedUrlResult.lat.toFixed(4)}, ${parsedUrlResult.lng.toFixed(4)}`,
      address: `${parsedUrlResult.lat.toFixed(6)}, ${parsedUrlResult.lng.toFixed(6)}`,
    });
    setQuery('');
    setParsedUrlResult(null);
    setIsOpen(false);
  }, [parsedUrlResult, onSelectParsedLocation]);

  const handleSelectFeature = useCallback((feature: PhotonFeature) => {
    const [lon, lat] = feature.geometry.coordinates;
    const p = feature.properties;
    const title = p.name || 'Selected Location';
    const addressParts = [p.street, p.housenumber, p.city, p.country].filter(Boolean);
    const address = addressParts.join(', ');

    onSelectParsedLocation({
      lat,
      lng: lon,
      title,
      address: address || undefined,
    });

    setQuery('');
    setSuggestions([]);
    setIsOpen(false);
  }, [onSelectParsedLocation]);

  // Keyboard Navigation: ArrowDown, ArrowUp, Enter, Escape
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' && (parsedUrlResult || suggestions.length > 0)) {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'Escape') {
      setIsOpen(false);
      return;
    }

    const totalItems = parsedUrlResult ? 1 : suggestions.length;
    if (totalItems === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (parsedUrlResult) {
        handleSelectParsed();
      } else if (activeIndex >= 0 && activeIndex < suggestions.length) {
        handleSelectFeature(suggestions[activeIndex]);
      } else if (suggestions.length > 0) {
        handleSelectFeature(suggestions[0]);
      }
    }
  };

  const handleClear = () => {
    setQuery('');
    setParsedUrlResult(null);
    setSuggestions([]);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Input Field */}
      <div className="relative flex items-center">
        <div className="absolute left-3 pointer-events-none text-slate-400">
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
          ) : (
            <Search className="w-4 h-4" />
          )}
        </div>

        <input
          id="smart-search-input"
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (parsedUrlResult || suggestions.length > 0) {
              setIsOpen(true);
            }
          }}
          placeholder={placeholder}
          className="w-full pl-9 pr-9 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-sm"
        />

        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2.5 p-0.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Autocomplete Dropdown */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 text-xs overflow-hidden max-h-80 overflow-y-auto">
          {/* 1. Parsed URL / Coordinates Instant Match */}
          {parsedUrlResult && (
            <div className="p-1.5">
              <div className="px-2 py-1 text-[11px] font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1">
                <Compass className="w-3.5 h-3.5" />
                Detected Link / Coordinates
              </div>
              <button
                type="button"
                onClick={handleSelectParsed}
                className={`w-full text-left p-2.5 rounded-lg border border-indigo-100 bg-indigo-50/70 hover:bg-indigo-100/80 transition-colors flex items-start justify-between gap-2 ${
                  activeIndex === 0 ? 'ring-2 ring-indigo-500' : ''
                }`}
              >
                <div>
                  <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                    <span>{parsedUrlResult.title || 'Location from Map Link'}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                    {parsedUrlResult.lat.toFixed(5)}, {parsedUrlResult.lng.toFixed(5)}
                  </div>
                  <div className="text-[10px] text-indigo-700 font-medium mt-1">
                    Click or press Enter to add pin to trip &rarr;
                  </div>
                </div>
                <ExternalLink className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
              </button>
            </div>
          )}

          {/* 2. Komoot Photon Autocomplete Suggestions */}
          {!parsedUrlResult && suggestions.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                Locations ({suggestions.length})
              </div>
              {suggestions.map((feature, idx) => {
                const p = feature.properties;
                const [lon, lat] = feature.geometry.coordinates;
                const isSelected = activeIndex === idx;
                const addressSnippet = [p.street, p.city, p.country].filter(Boolean).join(', ');

                return (
                  <button
                    key={`${lat}-${lon}-${idx}`}
                    type="button"
                    onClick={() => handleSelectFeature(feature)}
                    className={`w-full text-left px-3 py-2 flex items-start gap-2.5 transition-colors ${
                      isSelected
                        ? 'bg-indigo-50 text-indigo-900'
                        : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs truncate">
                          {p.name || 'Unnamed Place'}
                        </span>
                        {p.osm_value && (
                          <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                            {p.osm_value}
                          </span>
                        )}
                      </div>
                      {addressSnippet && (
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">
                          {addressSnippet}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* 3. Empty State */}
          {!parsedUrlResult && suggestions.length === 0 && !isLoading && query.trim().length >= 2 && (
            <div className="px-4 py-3 text-center text-slate-400 text-xs">
              No places found for &quot;{query}&quot;
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SmartSearchBar;
