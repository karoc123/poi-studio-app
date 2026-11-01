'use client';

import React from 'react';
import { X, Download, FileJson, Map, Calendar, Printer, Compass } from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tripId: string;
  tripTitle: string;
}

export function ExportModal({
  isOpen,
  onClose,
  tripId,
  tripTitle,
}: ExportModalProps) {
  if (!isOpen) return null;

  const exportOptions = [
    {
      title: 'Full JSON Backup',
      description: 'Complete trip data tree including places, checklists, notes, and metadata.',
      icon: <FileJson className="w-5 h-5 text-indigo-600" />,
      href: `/api/trips/${tripId}/export/json`,
      filename: `${tripTitle}-backup.json`,
      badge: 'Recommended',
    },
    {
      title: 'GPX 1.1 Track & Waypoints',
      description: 'Standard GPS exchange format for Garmin, Organic Maps, and handheld navigation.',
      icon: <Compass className="w-5 h-5 text-emerald-600" />,
      href: `/api/trips/${tripId}/export/gpx`,
      filename: `${tripTitle}.gpx`,
    },
    {
      title: 'GeoJSON FeatureCollection',
      description: 'Spatial format compatible with QGIS, Mapbox, and Google Earth.',
      icon: <Map className="w-5 h-5 text-sky-600" />,
      href: `/api/trips/${tripId}/export/geojson`,
      filename: `${tripTitle}.geojson`,
    },
    {
      title: 'iCalendar (.ics) Schedule',
      description: 'RFC 5545 calendar events to import into Apple Calendar, Google Calendar, or Outlook.',
      icon: <Calendar className="w-5 h-5 text-purple-600" />,
      href: `/api/trips/${tripId}/export/ics`,
      filename: `${tripTitle}.ics`,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h3 id="export-modal-title" className="text-base font-bold text-slate-900">
                Export Trip Data
              </h3>
              <p className="text-xs text-slate-500">
                Download your itinerary in open, portable formats
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Export Formats List */}
        <div className="p-6 space-y-3">
          {exportOptions.map((opt) => (
            <a
              key={opt.title}
              href={opt.href}
              download={opt.filename}
              className="flex items-start gap-3.5 p-3.5 rounded-xl border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/30 transition-all group"
            >
              <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 group-hover:bg-white group-hover:shadow-xs transition-all shrink-0 mt-0.5">
                {opt.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                    {opt.title}
                  </span>
                  {opt.badge && (
                    <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-700">
                      {opt.badge}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  {opt.description}
                </p>
              </div>
              <Download className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 shrink-0 mt-1 transition-colors" />
            </a>
          ))}

          {/* Printable Booklet Action */}
          <div className="pt-2 border-t border-slate-100">
            <a
              href={`/trips/${tripId}/print`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white transition-colors group shadow-xs"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-slate-800 text-white shrink-0">
                  <Printer className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-bold flex items-center gap-2">
                    <span>Printable Travel Booklet</span>
                    <span className="text-[10px] bg-slate-700 text-slate-200 px-1.5 py-0.2 rounded font-mono">
                      Ink-Friendly
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Formatted PDF &amp; physical booklet layout with schedule, notes, and checklists
                  </p>
                </div>
              </div>
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Zero external vendor lock-in</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 font-semibold text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
