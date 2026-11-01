'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar, Button } from '@/components/ui';
import { Compass, LogOut, Settings, Upload } from 'lucide-react';

interface DashboardHeaderProps {
  user: {
    id: string;
    username: string;
    avatarColor: string;
    hasPassword?: boolean;
  };
  onOpenProfile: () => void;
  onOpenImport?: () => void;
}

export function DashboardHeader({ user, onOpenProfile, onOpenImport }: DashboardHeaderProps) {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      router.push('/login');
      router.refresh();
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link
          href="/"
          className="flex items-center gap-2.5 text-slate-900 hover:opacity-90 transition-opacity"
        >
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-100">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-indigo-600 to-indigo-900 bg-clip-text text-transparent">
              POI Studio
            </span>
            <span className="hidden sm:inline-block ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/60">
              Trip Planner
            </span>
          </div>
        </Link>

        {/* Right Nav */}
        <div className="flex items-center gap-3">
          {/* Import JSON Backup */}
          {onOpenImport && (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenImport}
              icon={<Upload className="w-4 h-4 text-slate-600" />}
              title="Import Trip from JSON Backup"
            >
              <span className="hidden sm:inline">Import</span>
            </Button>
          )}

          {/* User profile toggle */}
          <button
            type="button"
            onClick={onOpenProfile}
            className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-full hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            title="Account Settings"
          >
            <Avatar
              username={user.username}
              avatarColor={user.avatarColor}
              size="sm"
            />
            <span className="text-sm font-semibold text-slate-700 hidden sm:inline">
              {user.username}
            </span>
            <Settings className="w-4 h-4 text-slate-400" />
          </button>

          {/* Logout */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            icon={<LogOut className="w-4 h-4 text-slate-500" />}
            title="Sign Out"
          >
            <span className="hidden sm:inline">Sign Out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
