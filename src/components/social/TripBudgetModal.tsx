'use client';

import React, { useMemo } from 'react';
import { X, DollarSign, PieChart, Calendar, Users, CheckCircle, Tag } from 'lucide-react';
import { getCategoryTheme } from '@/components/map/marker-icons';
import type { PoiWithRelations, SafeUser } from '@/types';

interface TripBudgetModalProps {
  isOpen: boolean;
  onClose: () => void;
  pois: PoiWithRelations[];
  members: SafeUser[];
  currency?: string;
}

export function TripBudgetModal({
  isOpen,
  onClose,
  pois = [],
  members = [],
  currency = '€',
}: TripBudgetModalProps) {
  if (!isOpen) return null;

  const memberCount = Math.max(1, members.length);

  // 1. Overall Totals
  const { totalEstimatedCost, totalBookedCost, categoryBreakdown, dayBreakdown } = useMemo(() => {
    let totalEstimated = 0;
    let totalBooked = 0;
    const catMap: Record<string, { count: number; cost: number }> = {};
    const dayMap: Record<string, { count: number; cost: number }> = {};

    for (const poi of pois) {
      const multiplier = poi.costType === 'PER_PERSON' ? memberCount : 1;
      const cost = Number(poi.estimatedCost || 0) * multiplier;
      totalEstimated += cost;

      if (poi.status === 'BOOKED') {
        totalBooked += cost;
      }

      // Category breakdown
      const cat = (poi.category || 'OTHER').toUpperCase();
      if (!catMap[cat]) {
        catMap[cat] = { count: 0, cost: 0 };
      }
      catMap[cat].count++;
      catMap[cat].cost += cost;

      // Day breakdown
      const dayKey = poi.dayStart !== null && poi.dayStart !== undefined ? `Day ${poi.dayStart}` : 'Ideas Pool';
      if (!dayMap[dayKey]) {
        dayMap[dayKey] = { count: 0, cost: 0 };
      }
      dayMap[dayKey].count++;
      dayMap[dayKey].cost += cost;
    }

    return {
      totalEstimatedCost: totalEstimated,
      totalBookedCost: totalBooked,
      categoryBreakdown: Object.entries(catMap)
        .map(([cat, val]) => ({
          category: cat,
          count: val.count,
          cost: val.cost,
          percent: totalEstimated > 0 ? Math.round((val.cost / totalEstimated) * 100) : 0,
        }))
        .sort((a, b) => b.cost - a.cost),
      dayBreakdown: Object.entries(dayMap).map(([day, val]) => ({
        day,
        count: val.count,
        cost: val.cost,
      })),
    };
  }, [pois, memberCount]);
  const perPersonCost = Math.round((totalEstimatedCost / memberCount) * 100) / 100;
  const bookedPercent = totalEstimatedCost > 0 ? Math.round((totalBookedCost / totalEstimatedCost) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-extrabold text-sm sm:text-base text-slate-900">
                Trip Budget & Cost Overview
              </h2>
              <p className="text-[11px] text-slate-500">
                Estimated vs Booked Confirmed Expenses
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Total Estimated
              </span>
              <div className="text-xl font-extrabold text-slate-900 mt-1">
                {currency}
                {totalEstimatedCost.toLocaleString()}
              </div>
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                Across {pois.length} stops
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200/80">
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider block flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-emerald-600" /> Booked & Confirmed
              </span>
              <div className="text-xl font-extrabold text-emerald-700 mt-1">
                {currency}
                {totalBookedCost.toLocaleString()}
              </div>
              <div className="w-full bg-emerald-200/60 rounded-full h-1.5 mt-2 overflow-hidden">
                <div
                  className="bg-emerald-600 h-1.5 rounded-full"
                  style={{ width: `${bookedPercent}%` }}
                />
              </div>
            </div>

            <div className="col-span-2 sm:col-span-1 p-3.5 rounded-xl bg-indigo-50/60 border border-indigo-200/80">
              <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider block flex items-center gap-1">
                <Users className="w-3 h-3 text-indigo-600" /> Per Person
              </span>
              <div className="text-xl font-extrabold text-indigo-700 mt-1">
                {currency}
                {perPersonCost.toLocaleString()}
              </div>
              <span className="text-[10px] text-indigo-600/80 mt-0.5 block">
                Split by {memberCount} {memberCount === 1 ? 'member' : 'members'}
              </span>
            </div>
          </div>

          {/* Breakdown by Category */}
          <div>
            <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
              <PieChart className="w-3.5 h-3.5 text-indigo-600" />
              <span>Breakdown by Category</span>
            </h3>

            {categoryBreakdown.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No costs recorded for any places.</p>
            ) : (
              <div className="space-y-2">
                {categoryBreakdown.map((cat) => {
                  const theme = getCategoryTheme(cat.category);
                  return (
                    <div
                      key={cat.category}
                      className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/60 space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: theme.color }}
                          />
                          <span className="font-bold text-slate-800">{theme.label}</span>
                          <span className="text-[10px] text-slate-400">
                            ({cat.count} {cat.count === 1 ? 'place' : 'places'})
                          </span>
                        </div>
                        <div className="flex items-center gap-2 font-bold">
                          <span className="text-slate-900">
                            {currency}
                            {cat.cost.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-slate-400 w-8 text-right">
                            {cat.percent}%
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-1.5 rounded-full transition-all"
                          style={{
                            width: `${cat.percent}%`,
                            backgroundColor: theme.color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Breakdown by Day */}
          <div>
            <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              <span>Breakdown by Day</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {dayBreakdown.map((d) => (
                <div
                  key={d.day}
                  className="p-2.5 rounded-xl border border-slate-100 bg-slate-50/60 flex flex-col justify-between"
                >
                  <span className="text-[11px] font-bold text-slate-600">{d.day}</span>
                  <div className="mt-1">
                    <span className="text-sm font-extrabold text-slate-900">
                      {currency}
                      {d.cost.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      {d.count} {d.count === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-sm transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export default TripBudgetModal;
