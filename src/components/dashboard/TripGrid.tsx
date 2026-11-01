'use client';

import React, { useState } from 'react';
import { TripCard } from './TripCard';
import { CreateTripModal } from './CreateTripModal';
import { EditTripModal } from './EditTripModal';
import { ScratchpadModal } from './ScratchpadModal';
import { Button } from '@/components/ui';
import type { TripCardData } from '@/types';
import { Plus, Search, Map, Sparkles, AlertCircle } from 'lucide-react';

interface TripGridProps {
  initialTrips: TripCardData[];
}

export function TripGrid({ initialTrips }: TripGridProps) {
  const [tripsList, setTripsList] = useState<TripCardData[]>(initialTrips);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<TripCardData | null>(null);
  const [scratchpadTrip, setScratchpadTrip] = useState<TripCardData | null>(null);
  const [isDuplicating, setIsDuplicating] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Filtered trips
  const filteredTrips = tripsList.filter((trip) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      trip.title.toLowerCase().includes(query) ||
      (trip.description && trip.description.toLowerCase().includes(query))
    );
  });

  const handleTripCreated = (newTrip: TripCardData) => {
    setTripsList((prev) => [newTrip, ...prev]);
  };

  const handleTripUpdated = (updatedTrip: TripCardData) => {
    setTripsList((prev) =>
      prev.map((t) => (t.id === updatedTrip.id ? updatedTrip : t))
    );
  };

  const handleScratchpadUpdated = (tripId: string, scratchpad: string) => {
    setTripsList((prev) =>
      prev.map((t) => (t.id === tripId ? { ...t, scratchpad } : t))
    );
  };

  const handleDuplicate = async (tripId: string) => {
    setIsDuplicating(tripId);
    setActionError(null);

    try {
      const res = await fetch(`/api/trips/${tripId}/duplicate`, {
        method: 'POST',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to duplicate trip');
      }

      setTripsList((prev) => [data.trip, ...prev]);
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : 'Error duplicating trip'
      );
    } finally {
      setIsDuplicating(null);
    }
  };

  const handleDelete = async (tripId: string, title: string) => {
    if (
      !window.confirm(
        `Are you sure you want to delete "${title}"? This will permanently remove all POIs, routes, votes, and checklists for everyone.`
      )
    ) {
      return;
    }

    setActionError(null);

    try {
      const res = await fetch(`/api/trips/${tripId}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete trip');
      }

      setTripsList((prev) => prev.filter((t) => t.id !== tripId));
    } catch (err: unknown) {
      setActionError(
        err instanceof Error ? err.message : 'Error deleting trip'
      );
    }
  };

  return (
    <div className="space-y-6">
      {actionError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-500 mt-0.5" />
          <div>{actionError}</div>
        </div>
      )}

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search trips by destination or keyword..."
            className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          />
        </div>

        {/* Create Trip CTA */}
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            size="md"
            onClick={() => setIsCreateOpen(true)}
            icon={<Plus className="w-4 h-4" />}
          >
            New Trip
          </Button>
        </div>
      </div>

      {/* Grid or Empty State */}
      {filteredTrips.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-12 text-center max-w-xl mx-auto my-12 shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4 border border-indigo-100">
            {searchQuery ? (
              <Search className="w-8 h-8 text-indigo-500" />
            ) : (
              <Map className="w-8 h-8 text-indigo-600" />
            )}
          </div>

          <h3 className="text-xl font-bold text-slate-900">
            {searchQuery ? 'No matching trips found' : 'No trips yet'}
          </h3>

          <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
            {searchQuery
              ? `No itineraries matched "${searchQuery}". Try a different search keyword.`
              : 'Start planning your next roadtrip, weekend getaway, or group exploration.'}
          </p>

          <div className="mt-6 flex justify-center">
            {searchQuery ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearchQuery('')}
              >
                Clear Search
              </Button>
            ) : (
              <Button
                variant="primary"
                size="md"
                onClick={() => setIsCreateOpen(true)}
                icon={<Plus className="w-4 h-4" />}
              >
                Create Your First Trip
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTrips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              onEdit={(t) => setEditingTrip(t)}
              onDuplicate={(id) => handleDuplicate(id)}
              onDelete={(id, title) => handleDelete(id, title)}
              onOpenScratchpad={(t) => setScratchpadTrip(t)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <CreateTripModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onTripCreated={handleTripCreated}
      />

      <EditTripModal
        isOpen={Boolean(editingTrip)}
        onClose={() => setEditingTrip(null)}
        trip={editingTrip}
        onTripUpdated={handleTripUpdated}
      />

      <ScratchpadModal
        isOpen={Boolean(scratchpadTrip)}
        onClose={() => setScratchpadTrip(null)}
        trip={scratchpadTrip}
        onScratchpadUpdated={handleScratchpadUpdated}
      />
    </div>
  );
}
