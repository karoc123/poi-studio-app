'use client';

import React from 'react';
import {
  Clock,
  Car,
  MapPin,
  Sparkles,
  AlertTriangle,
  DollarSign,
  Compass,
} from 'lucide-react';

interface DailyWorkloadBarProps {
  dayNumber: number;
  totalStops: number;
  totalVisitMinutes: number;
  totalTravelMinutes: number;
  totalDistanceKm: number;
  totalCost?: number;
  currency?: string;
  isOverloaded?: boolean;
  isReadOnly?: boolean;
  isOptimizing?: boolean;
  onOptimizeDayRoute?: () => void;
}

export function DailyWorkloadBar({
  dayNumber,
  totalStops,
  totalVisitMinutes,
  totalTravelMinutes,
  totalDistanceKm,
  totalCost = 0,
  currency = '€',
  isOverloaded = false,
  isReadOnly = false,
  isOptimizing = false,
  onOptimizeDayRoute,
}: DailyWorkloadBarProps) {
  const totalDayMinutes = totalVisitMinutes + totalTravelMinutes;

  const formatMinutes = (mins: number) => {
    const hours = Math.floor(mins / 60);
    const m = mins % 60;
    if (hours === 0) return `${m}m`;
    if (m === 0) return `${hours}h`;
    return `${hours}h ${m}m`;
  };

  return (
    <div className="space-y-2 mb-3">
      {/* 1. Main Summary Pill */}
      <div className="p-3 bg-white rounded-xl border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {/* Stops Count */}
          <div className="flex items-center gap-1 font-bold text-slate-800">
            <MapPin className="w-3.5 h-3.5 text-indigo-600" />
            <span>
              {totalStops} {totalStops === 1 ? 'Stop' : 'Stops'}
            </span>
          </div>

          <span className="text-slate-300">•</span>

          {/* Visits Duration */}
          <div className="flex items-center gap-1 text-slate-600" title="Planned time spent visiting locations">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>{formatMinutes(totalVisitMinutes)} visits</span>
          </div>

          {/* Travel Duration */}
          {totalTravelMinutes > 0 && (
            <>
              <span className="text-slate-300">•</span>
              <div className="flex items-center gap-1 text-slate-600" title="Estimated transit time">
                <Car className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  {formatMinutes(totalTravelMinutes)}
                  {totalDistanceKm > 0 && ` (${totalDistanceKm} km)`}
                </span>
              </div>
            </>
          )}

          {/* Day Estimated Cost */}
          {totalCost > 0 && (
            <>
              <span className="text-slate-300">•</span>
              <div className="flex items-center gap-1 font-semibold text-slate-700">
                <span className="text-emerald-600 font-bold">
                  {currency}
                  {totalCost.toLocaleString()}
                </span>
              </div>
            </>
          )}
        </div>

        {/* 1-Click Optimize Button */}
        {!isReadOnly && onOptimizeDayRoute && totalStops >= 2 && (
          <button
            type="button"
            onClick={onOptimizeDayRoute}
            disabled={isOptimizing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition-all shadow-xs active:scale-95 disabled:opacity-60"
            title="Automatically re-sequence day stops to minimize travel distance (TSP)"
          >
            <Sparkles className={`w-3.5 h-3.5 text-indigo-600 ${isOptimizing ? 'animate-spin' : ''}`} />
            <span>{isOptimizing ? 'Optimizing...' : 'Optimize Day Route'}</span>
          </button>
        )}
      </div>

      {/* 2. Pace Alert Warning Banner (Triggered when schedule > 10 hours / 600m) */}
      {isOverloaded && (
        <div className="p-3 bg-amber-50/90 border border-amber-300/80 rounded-xl flex items-start gap-2.5 text-amber-900 shadow-xs animate-in fade-in duration-200">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-extrabold text-amber-950 block">
              ⚠️ Day {dayNumber} Pace Alert: Overloaded Schedule ({formatMinutes(totalDayMinutes)})
            </span>
            <p className="text-amber-800 text-[11px] mt-0.5 leading-snug">
              This day's activities and transit exceed 10 hours. Consider spreading some stops to another day to avoid travel fatigue.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default DailyWorkloadBar;
