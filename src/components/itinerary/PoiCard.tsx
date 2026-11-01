'use client';

import React, { useState } from 'react';
import {
  MapPin,
  Star,
  Clock,
  DollarSign,
  ChevronUp,
  ChevronDown,
  MoreVertical,
  Navigation,
  MessageSquare,
  Edit2,
  Trash2,
  ExternalLink,
  BedDouble,
  Tag,
  Building,
} from 'lucide-react';
import { getCategoryTheme } from '@/components/map/marker-icons';
import { PoiVoteButton } from '@/components/social/PoiVoteButton';
import type { PoiWithRelations, Role } from '@/types';

interface PoiCardProps {
  tripId: string;
  poi: PoiWithRelations;
  stopNumber?: number | null;
  isSelected?: boolean;
  isHovered?: boolean;
  isPinnedMultiDay?: boolean;
  isReadOnly?: boolean;
  totalDays?: number;
  onSelect?: () => void;
  onHover?: (hovered: boolean) => void;
  onEdit?: (poi: PoiWithRelations) => void;
  onDelete?: (poiId: string) => void;
  onMoveDay?: (poiId: string, targetDay: number | null) => void;
  onReorderUp?: () => void;
  onReorderDown?: () => void;
  canReorderUp?: boolean;
  canReorderDown?: boolean;
  onOpenComments?: (poi: PoiWithRelations) => void;
  onVoteChange?: (voted: boolean, newCount: number, newVoters: string[]) => void;
  currency?: string;
}

export function PoiCard({
  tripId,
  poi,
  stopNumber,
  isSelected = false,
  isHovered = false,
  isPinnedMultiDay = false,
  isReadOnly = false,
  totalDays = 3,
  onSelect,
  onHover,
  onEdit,
  onDelete,
  onMoveDay,
  onReorderUp,
  onReorderDown,
  canReorderUp = false,
  canReorderDown = false,
  onOpenComments,
  onVoteChange,
  currency = '€',
}: PoiCardProps) {
  const [showNavMenu, setShowNavMenu] = useState(false);
  const theme = getCategoryTheme(poi.category);

  // Navigation Links
  const googleDirectionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${poi.lat},${poi.lng}`;
  const googleSearchUrl = `https://www.google.com/maps/search/?api=1&query=${poi.lat},${poi.lng}`;
  const appleMapsUrl = `https://maps.apple.com/?daddr=${poi.lat},${poi.lng}&q=${encodeURIComponent(poi.title)}`;
  const geoUri = `geo:${poi.lat},${poi.lng}?q=${poi.lat},${poi.lng}(${encodeURIComponent(poi.title)})`;

  return (
    <div
      id={`poi-card-${poi.id}`}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => {
        onHover?.(false);
        setShowNavMenu(false);
      }}
      onClick={onSelect}
      className={`p-3.5 rounded-xl border transition-all cursor-pointer relative bg-white ${
        isSelected
          ? 'border-indigo-600 bg-indigo-50/40 shadow-md ring-1 ring-indigo-500'
          : isHovered
          ? 'border-indigo-300 bg-slate-50/70 shadow-sm'
          : 'border-slate-200/90 hover:border-slate-300 hover:shadow-xs'
      }`}
    >
      {/* Multi-day Pinned Hotel Banner */}
      {isPinnedMultiDay && (
        <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2 py-0.5 rounded-md mb-2 w-fit">
          <BedDouble className="w-3 h-3 text-indigo-600" />
          <span>Startpoint / Pinned Accommodation</span>
        </div>
      )}

      {/* Main Row */}
      <div className="flex items-start justify-between gap-2.5">
        {/* Left: Category Icon / Stop Number Pin */}
        <div
          className="w-7 h-7 rounded-lg text-white flex items-center justify-center shrink-0 font-bold text-xs shadow-sm mt-0.5"
          style={{ backgroundColor: theme.color }}
        >
          {stopNumber ?? <MapPin className="w-4 h-4" />}
        </div>

        {/* Center Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="font-extrabold text-xs sm:text-sm text-slate-900 truncate">
              {poi.title}
            </h3>
            {poi.isMustSee && (
              <span className="flex items-center text-amber-500 fill-amber-500 shrink-0" title="Must-See Highlight">
                <Star className="w-3.5 h-3.5 fill-amber-500" />
              </span>
            )}
          </div>

          {poi.address && (
            <p className="text-[11px] text-slate-500 truncate mt-0.5" title={poi.address}>
              {poi.address}
            </p>
          )}

          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span
              className="text-[9px] font-bold px-1.5 py-0.2 rounded uppercase"
              style={{
                backgroundColor: `${theme.color}15`,
                color: theme.color,
              }}
            >
              {theme.label}
            </span>

            <span
              className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                poi.status === 'BOOKED'
                  ? 'bg-emerald-100 text-emerald-800'
                  : poi.status === 'PLANNED'
                  ? 'bg-indigo-100 text-indigo-800'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {poi.status}
            </span>

            {poi.timeSlot && (
              <span className="text-[10px] text-slate-500 flex items-center gap-0.5 font-medium">
                <Clock className="w-3 h-3 text-slate-400" />
                <span>{poi.timeSlot}</span>
              </span>
            )}

            {poi.durationMinutes ? (
              <span className="text-[10px] text-slate-500 font-medium">
                ({poi.durationMinutes} min)
              </span>
            ) : null}

            {poi.estimatedCost > 0 && (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                {currency}
                {Number(poi.estimatedCost).toLocaleString()}
                {poi.costType === 'PER_PERSON' && ' /person'}
              </span>
            )}

            {poi.bookingReference && (
              <span className="text-[10px] font-mono font-bold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                Ref: {poi.bookingReference}
              </span>
            )}
          </div>

          {poi.notes && (
            <p className="text-[11px] text-slate-600 line-clamp-1 italic mt-1.5 pl-1.5 border-l-2 border-slate-200">
              {poi.notes}
            </p>
          )}
        </div>

        {/* Right Reordering Arrows (if in day view) */}
        {!isReadOnly && (canReorderUp || canReorderDown) && (
          <div className="flex flex-col gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              disabled={!canReorderUp}
              onClick={onReorderUp}
              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-800 disabled:opacity-30 disabled:hover:bg-transparent"
              title="Move Up"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={!canReorderDown}
              onClick={onReorderDown}
              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-800 disabled:opacity-30 disabled:hover:bg-transparent"
              title="Move Down"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Bottom Actions Bar */}
      <div className="pt-2.5 mt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
        {/* Left Social & Nav Buttons */}
        <div className="flex items-center gap-2">
          {/* Upvote Button */}
          <PoiVoteButton
            tripId={tripId}
            poiId={poi.id}
            voteCount={poi.voteCount || 0}
            hasVoted={Boolean(poi.hasVoted)}
            voters={poi.voterNames || []}
            isReadOnly={isReadOnly}
            onVoteChange={onVoteChange}
          />

          {/* Comment Thread Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenComments?.(poi);
            }}
            className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200/60 transition-colors"
            title="Discussion & Comments"
          >
            <MessageSquare className="w-3 h-3 text-slate-500" />
            <span>{(poi.comments && poi.comments.length) || 0}</span>
          </button>

          {/* External Nav Menu */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setShowNavMenu((prev) => !prev)}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors"
              title="Open in Navigation Apps"
            >
              <Navigation className="w-3 h-3 text-indigo-600" />
              <span>Navigate</span>
            </button>

            {showNavMenu && (
              <div className="absolute left-0 bottom-full mb-1.5 w-44 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-50 text-xs animate-in fade-in duration-100">
                <a
                  href={googleDirectionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 hover:bg-slate-50 flex items-center justify-between text-slate-700 font-semibold"
                >
                  <span>Google Directions</span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </a>
                <a
                  href={appleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 hover:bg-slate-50 flex items-center justify-between text-slate-700 font-semibold"
                >
                  <span>Apple Maps</span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </a>
                <a
                  href={geoUri}
                  className="px-3 py-1.5 hover:bg-slate-50 flex items-center justify-between text-slate-700 font-semibold"
                >
                  <span>Geo URI (OsmAnd)</span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </a>
                <a
                  href={googleSearchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 hover:bg-slate-50 flex items-center justify-between text-slate-700 font-semibold border-t border-slate-100"
                >
                  <span>Google Place</span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Right Day Mover & Edit/Delete */}
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {!isReadOnly && onMoveDay && (
            <select
              value={poi.dayStart !== null && poi.dayStart !== undefined ? poi.dayStart : ''}
              onChange={(e) => {
                const val = e.target.value ? parseInt(e.target.value, 10) : null;
                onMoveDay(poi.id, val);
              }}
              className="text-[11px] font-semibold border border-slate-200 rounded-lg px-2 py-1 bg-slate-50 text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              title="Move stop to another day"
            >
              <option value="">Ideas Pool</option>
              {Array.from({ length: totalDays }).map((_, i) => (
                <option key={`opt-mv-${i + 1}`} value={i + 1}>
                  Day {i + 1}
                </option>
              ))}
            </select>
          )}

          {!isReadOnly && onEdit && (
            <button
              type="button"
              onClick={() => onEdit(poi)}
              className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
              title="Edit Place"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}

          {!isReadOnly && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(poi.id)}
              className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
              title="Delete Place"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default PoiCard;
