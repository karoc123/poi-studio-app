'use client';

import React, { useState } from 'react';
import { Modal, Button } from '@/components/ui';
import { Compass, AlertCircle } from 'lucide-react';
import type { TripCardData } from '@/types';

interface CreateTripModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTripCreated: (trip: TripCardData) => void;
}

export function CreateTripModal({
  isOpen,
  onClose,
  onTripCreated,
}: CreateTripModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currency, setCurrency] = useState('€');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setStartDate('');
    setEndDate('');
    setCurrency('€');
    setErrorMessage(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMessage('Trip title is required');
      return;
    }

    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      setErrorMessage('End date cannot be earlier than start date');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: trimmedTitle,
          description: description.trim() || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          currency,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create trip');
      }

      onTripCreated(data.trip);
      handleClose();
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Error creating trip'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        <div className="flex items-center gap-2">
          <Compass className="w-5 h-5 text-indigo-600" />
          <span>Create New Trip</span>
        </div>
      }
      description="Set up your destination, dates, and currency"
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
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Iceland Ring Road 2026"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
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
            placeholder="Brief overview or itinerary goals..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm resize-none"
          />
        </div>

        {/* Date pickers */}
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

        {/* Currency selection */}
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

        {/* Footer Buttons */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
          <Button type="button" variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isLoading}>
            Create Trip
          </Button>
        </div>
      </form>
    </Modal>
  );
}
