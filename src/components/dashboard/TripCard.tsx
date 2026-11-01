'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AvatarGroup, Badge, Button } from '@/components/ui';
import { formatCountdown, calculateTripDays } from '@/lib/trip-utils';
import type { TripCardData } from '@/types';
import {
  Calendar,
  Clock,
  Coins,
  Copy,
  Edit3,
  FileText,
  MapPin,
  MoreVertical,
  Trash2,
  ExternalLink,
} from 'lucide-react';

interface TripCardProps {
  trip: TripCardData;
  onEdit: (trip: TripCardData) => void;
  onDuplicate: (tripId: string) => void;
  onDelete: (tripId: string, title: string) => void;
  onOpenScratchpad: (trip: TripCardData) => void;
}

export function TripCard({
  trip,
  onEdit,
  onDuplicate,
  onDelete,
  onOpenScratchpad,
}: TripCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const countdownText = formatCountdown(trip.startDate, trip.endDate);
  const totalDays = calculateTripDays(trip.startDate, trip.endDate);
  const isOwner = trip.role === 'OWNER';

  const roleVariant = {
    OWNER: 'indigo' as const,
    EDITOR: 'emerald' as const,
    VIEWER: 'slate' as const,
  }[trip.role] || ('slate' as const);

  const countdownVariant = {
    'Starts today': 'emerald' as const,
    Tomorrow: 'emerald' as const,
    Ongoing: 'sky' as const,
    Completed: 'slate' as const,
    'Dates TBD': 'default' as const,
  }[countdownText] || ('indigo' as const);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between overflow-hidden group">
      {/* Top Card Body */}
      <div className="p-5 sm:p-6 space-y-4">
        {/* Header row: Role, Countdown, Actions Menu */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={roleVariant} size="sm">
              {trip.role}
            </Badge>

            <Badge variant={countdownVariant} size="sm" icon={<Clock className="w-3 h-3" />}>
              {countdownText}
            </Badge>

            {totalDays !== null && (
              <Badge variant="default" size="sm">
                {totalDays} {totalDays === 1 ? 'day' : 'days'}
              </Badge>
            )}
          </div>

          {/* Action Menu Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors focus:outline-none"
              aria-label="Trip actions"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 mt-1 w-44 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-30 text-sm">
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onEdit(trip);
                      }}
                      className="w-full text-left px-4 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors"
                    >
                      <Edit3 className="w-4 h-4 text-slate-500" />
                      <span>Edit Settings</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onDuplicate(trip.id);
                    }}
                    className="w-full text-left px-4 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors"
                  >
                    <Copy className="w-4 h-4 text-slate-500" />
                    <span>Duplicate Trip</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenScratchpad(trip);
                    }}
                    className="w-full text-left px-4 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors"
                  >
                    <FileText className="w-4 h-4 text-slate-500" />
                    <span>Scratchpad</span>
                  </button>

                  {isOwner && (
                    <div className="border-t border-slate-100 my-1">
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          onDelete(trip.id, trip.title);
                        }}
                        className="w-full text-left px-4 py-2 text-rose-600 hover:bg-rose-50 flex items-center gap-2.5 transition-colors font-medium"
                      >
                        <Trash2 className="w-4 h-4 text-rose-500" />
                        <span>Delete Trip</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Trip Title & Description */}
        <div>
          <Link
            href={`/trips/${trip.id}`}
            className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1"
          >
            {trip.title}
          </Link>
          <p className="mt-1 text-sm text-slate-500 line-clamp-2 min-h-[2.5rem]">
            {trip.description || 'No description provided.'}
          </p>
        </div>

        {/* Date Range */}
        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
          <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <span>
            {trip.startDate ? (
              <>
                {trip.startDate}
                {trip.endDate ? ` — ${trip.endDate}` : ''}
              </>
            ) : (
              'Dates TBD'
            )}
          </span>
        </div>

        {/* POIs breakdown & Estimated Cost */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span
              title="Planned Stops"
              className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60"
            >
              <MapPin className="w-3 h-3 text-emerald-600" />
              <span>{trip.plannedPoiCount} planned</span>
            </span>

            <span
              title="Ideas Pool"
              className="inline-flex items-center gap-1 font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60"
            >
              <span>{trip.ideaPoiCount} ideas</span>
            </span>
          </div>

          <div
            title="Total Estimated Cost"
            className="flex items-center gap-1 font-semibold text-slate-700"
          >
            <Coins className="w-3.5 h-3.5 text-slate-400" />
            <span>
              {trip.currency} {trip.totalEstimatedCost.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Footer: Member avatars & Actions */}
      <div className="px-5 sm:px-6 py-3.5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between gap-3">
        {/* Members */}
        <div className="flex items-center gap-2">
          <AvatarGroup users={trip.members} max={4} size="sm" />
          <span className="text-xs text-slate-500 font-medium hidden sm:inline">
            {trip.memberCount} {trip.memberCount === 1 ? 'member' : 'members'}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenScratchpad(trip)}
            title="Shared Markdown Scratchpad"
            icon={<FileText className="w-3.5 h-3.5" />}
          >
            Notes
          </Button>

          <Link href={`/trips/${trip.id}`}>
            <Button
              variant="primary"
              size="sm"
              icon={<ExternalLink className="w-3.5 h-3.5" />}
            >
              Open
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
