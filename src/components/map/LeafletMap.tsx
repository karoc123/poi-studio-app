'use client';

import dynamic from 'next/dynamic';
import React from 'react';
import type { LeafletMapProps } from './LeafletMapInner';

const DynamicMapInner = dynamic(
  () => import('./LeafletMapInner').then((mod) => mod.LeafletMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full min-h-[400px] flex items-center justify-center bg-slate-100 rounded-xl animate-pulse border border-slate-200">
        <div className="flex flex-col items-center gap-2 text-slate-500">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-semibold">Loading Interactive Map Engine...</span>
        </div>
      </div>
    ),
  }
);

export function LeafletMap(props: LeafletMapProps) {
  return <DynamicMapInner {...props} />;
}

export default LeafletMap;
