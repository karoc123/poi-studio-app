'use client';

import React, { useState, useEffect } from 'react';
import { Modal, Button } from '@/components/ui';
import { Edit3, AlertCircle } from 'lucide-react';
import type { TripCardData } from '@/types';

interface EditTripModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip: TripCardData | null;
  onTripUpdated: (trip: TripCardData) => void;
}

export function EditTripModal({
  isOpen,
  onClose,
  trip,
  onTripUpdated,
}: EditTripModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currency, setCurrency] = useState('€');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (trip) {
      setTitle(trip.title);
      setDescription(trip.description || '');
      setStartDate(trip.startDate || '');
      setEndDate(trip.endDate || '');
      setCurrency(trip.currency || '€');
    }
    setErrorMessage(null);
  }, [trip, isOpen]);

  if (!trip) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMessage('Trip title cannot be empty');
      return;
    }

    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      setErrorMessage('End date cannot be earlier than start date');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch(`/api/trips/${trip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: trimmedTitle,
          description: description.trim() || null,
          startDate: startDate || null,
          endDate: endDate || null,
          currency,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update trip');
      }

      onTripUpdated({
        ...trip,
        ...data.trip,
      });

      onClose();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Error updating trip'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Edit3 className="w-5 h-5 text-indigo-600" />
          <span>Edit Trip Settings</span>
        </div>
      }
      description="Update trip title, dates, or default currency"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 mt-0.5 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Title */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Trip Title <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Description
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
          />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm bg-white"
            />
          </div>
        </div>

        {/* Currency */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Trip Currency
          </label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm bg-white"
          >
            <option value="€">EUR (€) — Euro</option>
            <option value="$">USD ($) — US Dollar</option>
            <option value="£">GBP (£) — British Pound</option>
            <option value="CHF">CHF (CHF) — Swiss Franc</option>
            <option value="¥">JPY (¥) — Japanese Yen</option>
          </select>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isLoading}>
            Save Changes
          </Button>
        </div>
      </form>
    </Modal>
  );
}
