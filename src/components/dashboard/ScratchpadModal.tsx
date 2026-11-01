'use client';

import React, { useState, useEffect } from 'react';
import { Modal, Button, Badge } from '@/components/ui';
import { FileText, Eye, Edit2, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { marked } from 'marked';
import type { TripCardData } from '@/types';

interface ScratchpadModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip: TripCardData | null;
  onScratchpadUpdated: (tripId: string, scratchpad: string) => void;
}

export function ScratchpadModal({
  isOpen,
  onClose,
  trip,
  onScratchpadUpdated,
}: ScratchpadModalProps) {
  const [content, setContent] = useState('');
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (trip) {
      setContent(trip.scratchpad || '');
      setLastSaved(null);
      setErrorMessage(null);
      // Default to preview if scratchpad has content and user is viewer
      if (trip.role === 'VIEWER') {
        setViewMode('preview');
      } else {
        setViewMode('edit');
      }
    }
  }, [trip, isOpen]);

  if (!trip) return null;

  const isReadOnly = trip.role === 'VIEWER';

  const handleSave = async () => {
    if (isReadOnly) return;
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/trips/${trip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scratchpad: content }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save scratchpad');
      }

      setLastSaved(new Date());
      onScratchpadUpdated(trip.id, content);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Error saving scratchpad'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const getRenderedHtml = () => {
    if (!content.trim()) {
      return '<p class="text-slate-400 italic">No notes yet. Type some markdown to see the preview here!</p>';
    }
    try {
      return marked.parse(content, { async: false }) as string;
    } catch {
      return '<p class="text-rose-500">Failed to render markdown preview.</p>';
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-indigo-600" />
          <span>{trip.title} — Shared Scratchpad</span>
        </div>
      }
      description="Shared general notes, flight numbers, Wi-Fi passwords, and emergency contacts"
      maxWidth="3xl"
    >
      <div className="space-y-4">
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
          {/* Tab buttons */}
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => setViewMode('edit')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  viewMode === 'edit'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Write (Markdown)</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'preview'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview</span>
            </button>
          </div>

          {/* Save Status / Button */}
          <div className="flex items-center gap-3">
            {lastSaved && (
              <div className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Saved {lastSaved.toLocaleTimeString()}</span>
              </div>
            )}

            {isReadOnly ? (
              <Badge variant="slate" size="sm">
                Read-Only (Viewer)
              </Badge>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
                isLoading={isSaving}
                icon={<Save className="w-3.5 h-3.5" />}
              >
                Save Scratchpad
              </Button>
            )}
          </div>
        </div>

        {/* Editor or Preview */}
        {viewMode === 'edit' && !isReadOnly ? (
          <div>
            <textarea
              rows={16}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="# Flight & Hotel Details&#10;- Flight: LH452 departing 10:20&#10;- Hotel Wi-Fi: GuestPass2026&#10;- Car Rental: Hertz Booking #HZ89102"
              className="w-full p-4 font-mono text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 text-slate-900 resize-y min-h-[300px]"
            />
            <p className="mt-1.5 text-xs text-slate-400">
              Supports standard Markdown headers (#, ##), bold (**text**), lists (- item), links ([title](url)), and code blocks.
            </p>
          </div>
        ) : (
          <div className="min-h-[300px] max-h-[500px] overflow-y-auto p-4 rounded-xl border border-slate-200 bg-white">
            <div
              className="prose prose-sm max-w-none text-slate-800"
              dangerouslySetInnerHTML={{ __html: getRenderedHtml() }}
            />
          </div>
        )}

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Scratchpad changes are immediately shared with all collaborators in this trip.
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
