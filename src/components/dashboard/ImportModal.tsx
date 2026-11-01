'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { X, Upload, FileText, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess?: (tripId: string) => void;
}

export function ImportModal({
  isOpen,
  onClose,
  onImportSuccess,
}: ImportModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [jsonPreview, setJsonPreview] = useState<{
    title: string;
    placesCount: number;
    checklistCount: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rawPayload, setRawPayload] = useState<any>(null);

  if (!isOpen) return null;

  const handleFileChange = (selectedFile: File) => {
    setError(null);
    setJsonPreview(null);
    setRawPayload(null);

    if (!selectedFile.name.endsWith('.json')) {
      setError('Please select a valid .json trip backup file.');
      return;
    }

    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);

        if (!parsed || typeof parsed !== 'object' || !parsed.trip || !parsed.trip.title) {
          setError('Invalid backup format: missing required trip structure.');
          return;
        }

        setRawPayload(parsed);
        setJsonPreview({
          title: parsed.trip.title,
          placesCount: Array.isArray(parsed.pois) ? parsed.pois.length : 0,
          checklistCount: Array.isArray(parsed.checklists) ? parsed.checklists.length : 0,
        });
      } catch {
        setError('Failed to parse file: invalid JSON content.');
      }
    };
    reader.onerror = () => {
      setError('Failed to read the selected file.');
    };
    reader.readAsText(selectedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawPayload) {
      setError('Please select a valid backup JSON file first.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/trips/import/json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rawPayload),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || `Import failed with status ${res.status}`);
      }

      if (data?.tripId) {
        if (onImportSuccess) {
          onImportSuccess(data.tripId);
        }
        onClose();
        router.push(`/trips/${data.tripId}`);
        router.refresh();
      } else {
        throw new Error('Server returned invalid response without tripId');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during import.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetState = () => {
    setFile(null);
    setJsonPreview(null);
    setRawPayload(null);
    setError(null);
    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <h3 id="import-modal-title" className="text-base font-bold text-slate-900">
                Import Trip Backup
              </h3>
              <p className="text-xs text-slate-500">
                Restore a trip from a previously exported JSON backup
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              resetState();
              onClose();
            }}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content & Drag-and-Drop Zone */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              file
                ? 'border-indigo-400 bg-indigo-50/20'
                : 'border-slate-300 hover:border-indigo-400 bg-slate-50/50 hover:bg-slate-50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileChange(e.target.files[0]);
                }
              }}
            />

            <Upload className="w-8 h-8 mx-auto text-slate-400 mb-2" />
            <p className="text-xs font-semibold text-slate-700">
              {file ? file.name : 'Click to select or drag & drop backup JSON file'}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Supports POI Studio v1 JSON backups
            </p>
          </div>

          {/* Validation Preview Card */}
          {jsonPreview && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-slate-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Ready to restore: &quot;{jsonPreview.title}&quot;</span>
              </div>
              <p className="text-slate-600 pl-5">
                • {jsonPreview.placesCount} places / POIs
              </p>
              <p className="text-slate-600 pl-5">
                • {jsonPreview.checklistCount} checklist items
              </p>
              <p className="text-slate-500 pl-5 italic text-[11px] pt-1">
                You will become the OWNER of this newly restored trip.
              </p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                resetState();
                onClose();
              }}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!rawPayload || isSubmitting}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1.5 transition-colors"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Restoring Trip...</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  <span>Restore Trip</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
