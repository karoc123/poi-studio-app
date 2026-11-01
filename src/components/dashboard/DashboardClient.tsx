'use client';

import React, { useState } from 'react';
import { DashboardHeader } from './DashboardHeader';
import { TripGrid } from './TripGrid';
import { ImportModal } from './ImportModal';
import { ProfileModal } from '@/components/auth';
import type { TripCardData } from '@/types';

interface DashboardClientProps {
  initialUser: {
    id: string;
    username: string;
    avatarColor: string;
    hasPassword?: boolean;
  };
  initialTrips: TripCardData[];
}

export function DashboardClient({
  initialUser,
  initialTrips,
}: DashboardClientProps) {
  const [currentUser, setCurrentUser] = useState(initialUser);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <DashboardHeader
        user={currentUser}
        onOpenProfile={() => setIsProfileOpen(true)}
        onOpenImport={() => setIsImportOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            My Itineraries
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Select a trip to explore routes and map pins, or create a new template.
          </p>
        </div>

        {/* Trips Grid */}
        <TripGrid initialTrips={initialTrips} />
      </main>

      {/* Profile Modal */}
      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        currentUser={currentUser}
        onUserUpdated={(updated) => setCurrentUser(updated)}
      />

      {/* Import Trip Modal */}
      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
      />
    </div>
  );
}
