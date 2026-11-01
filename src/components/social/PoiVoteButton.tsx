'use client';

import React, { useState } from 'react';
import { Heart, Users } from 'lucide-react';

interface PoiVoteButtonProps {
  tripId: string;
  poiId: string;
  voteCount: number;
  hasVoted: boolean;
  voters?: string[];
  isReadOnly?: boolean;
  onVoteChange?: (voted: boolean, newCount: number, newVoters: string[]) => void;
}

export function PoiVoteButton({
  tripId,
  poiId,
  voteCount,
  hasVoted,
  voters = [],
  isReadOnly = false,
  onVoteChange,
}: PoiVoteButtonProps) {
  const [loading, setLoading] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const handleToggleVote = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isReadOnly || loading) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/pois/${poiId}/votes`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        if (onVoteChange) {
          onVoteChange(data.voted, data.voteCount, data.voters || data.voterNames || []);
        }
      }
    } catch (err) {
      console.error('Failed to toggle vote:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <button
        type="button"
        onClick={handleToggleVote}
        disabled={isReadOnly || loading}
        title={voters.length > 0 ? `Voted by: ${voters.join(', ')}` : 'Upvote this place'}
        className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold transition-all ${
          hasVoted
            ? 'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 shadow-sm'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200/60'
        } ${isReadOnly ? 'cursor-default opacity-80' : 'cursor-pointer active:scale-95'}`}
      >
        <Heart
          className={`w-3.5 h-3.5 transition-transform ${
            hasVoted ? 'fill-rose-500 text-rose-500 scale-110' : 'text-slate-400'
          }`}
        />
        <span>{voteCount}</span>
      </button>

      {/* Voter List Tooltip */}
      {showTooltip && voters.length > 0 && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 bg-slate-900/95 text-white text-[11px] rounded-lg shadow-xl whitespace-nowrap z-50 pointer-events-none animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center gap-1 font-semibold text-slate-300 pb-0.5 border-b border-slate-700/80 mb-1">
            <Users className="w-3 h-3 text-rose-400" />
            <span>Voters ({voters.length})</span>
          </div>
          <div className="flex flex-col gap-0.5 max-h-28 overflow-y-auto">
            {voters.map((voter) => (
              <span key={voter} className="text-slate-200">
                • {voter}
              </span>
            ))}
          </div>
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900/95" />
        </div>
      )}
    </div>
  );
}

export default PoiVoteButton;
