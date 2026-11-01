'use client';

import React, { useState } from 'react';
import { Share2, Check, RefreshCw, ChevronDown, Copy, AlertCircle } from 'lucide-react';

interface InviteButtonProps {
  tripId: string;
  inviteCode: string;
  isOwner?: boolean;
  onInviteCodeRegenerated?: (newCode: string) => void;
  className?: string;
}

export function InviteButton({
  tripId,
  inviteCode,
  isOwner = false,
  onInviteCodeRegenerated,
  className = '',
}: InviteButtonProps) {
  const [currentCode, setCurrentCode] = useState(inviteCode);
  const [copied, setCopied] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync if prop changes
  React.useEffect(() => {
    setCurrentCode(inviteCode);
  }, [inviteCode]);

  const getInviteUrl = (code: string) => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/join/${code}`;
    }
    return `/join/${code}`;
  };

  const copyToClipboard = async (codeToCopy = currentCode) => {
    const url = getInviteUrl(codeToCopy);
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback for non-https or restricted contexts
        const textArea = document.createElement('textarea');
        textArea.value = url;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setError(null);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Failed to copy link to clipboard');
      setTimeout(() => setError(null), 3000);
    }
  };

  const handleRegenerate = async () => {
    if (
      !window.confirm(
        'Regenerating the invite link will immediately invalidate the current link. Anyone with the old link will no longer be able to join. Continue?'
      )
    ) {
      return;
    }

    setIsRegenerating(true);
    setError(null);
    setShowDropdown(false);
    try {
      const res = await fetch(`/api/trips/${tripId}/invite-code`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to regenerate invite link');
      }

      setCurrentCode(data.inviteCode);
      onInviteCodeRegenerated?.(data.inviteCode);
      await copyToClipboard(data.inviteCode);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error regenerating link');
      setTimeout(() => setError(null), 4000);
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className={`relative inline-flex items-center rounded-lg shadow-sm ${className}`}>
      {/* Primary Copy Button */}
      <button
        type="button"
        onClick={() => copyToClipboard()}
        title="Copy shareable invite link"
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-l-lg border transition-colors ${
          !isOwner ? 'rounded-r-lg' : 'border-r-0'
        } ${
          copied
            ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
        }`}
      >
        {copied ? (
          <>
            <Check className="w-3.5 h-3.5 text-emerald-600" />
            <span>Copied!</span>
          </>
        ) : (
          <>
            <Share2 className="w-3.5 h-3.5 text-slate-500" />
            <span>Invite</span>
          </>
        )}
      </button>

      {/* Owner Dropdown for Regenerate */}
      {isOwner && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowDropdown(!showDropdown)}
            title="Invite link options"
            aria-label="Invite link options"
            disabled={isRegenerating}
            className="inline-flex items-center px-1.5 py-1.5 text-xs font-medium bg-white text-slate-600 border border-slate-300 rounded-r-lg hover:bg-slate-50 focus:outline-none transition-colors disabled:opacity-50"
          >
            {isRegenerating ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            )}
          </button>

          {showDropdown && (
            <>
              {/* Backdrop to close dropdown */}
              <div
                className="fixed inset-0 z-20"
                onClick={() => setShowDropdown(false)}
              />

              <div className="absolute right-0 mt-1 w-56 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-30 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    copyToClipboard();
                    setShowDropdown(false);
                  }}
                  className="w-full text-left px-3 py-2 text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copy Current Invite Link</span>
                </button>
                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={isRegenerating}
                  className="w-full text-left px-3 py-2 text-amber-700 hover:bg-amber-50 flex items-center gap-2 border-t border-slate-100 mt-1"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 text-amber-600 ${
                      isRegenerating ? 'animate-spin' : ''
                    }`}
                  />
                  <span>Regenerate Invite Link</span>
                </button>
                <div className="px-3 py-1.5 text-[10px] text-slate-400 leading-tight">
                  Invalidates previous links immediately.
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="absolute top-full left-0 mt-1 whitespace-nowrap bg-red-600 text-white text-[11px] px-2 py-1 rounded shadow-md z-40 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
