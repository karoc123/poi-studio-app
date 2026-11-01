'use client';

import React from 'react';
import Link from 'next/link';
import { Printer, ArrowLeft } from 'lucide-react';

interface PrintControlsProps {
  tripId: string;
  tripTitle: string;
}

export function PrintControls({ tripId, tripTitle }: PrintControlsProps) {
  return (
    <div className="no-print bg-slate-900 text-white px-6 py-4 flex items-center justify-between shadow-md mb-8 sticky top-0 z-50">
      <div className="flex items-center gap-4">
        <Link
          href={`/trips/${tripId}`}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white transition-colors bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Workspace</span>
        </Link>
        <span className="text-sm font-bold text-slate-200 hidden sm:inline">
          Print Preview: {tripTitle}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-400 hidden md:inline">
          Tip: Set Margins to &quot;None&quot; or &quot;Minimum&quot; in Print Dialog
        </span>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 text-xs font-bold rounded-lg shadow-sm transition-colors"
        >
          <Printer className="w-4 h-4" />
          <span>Print Booklet / PDF</span>
        </button>
      </div>
    </div>
  );
}
