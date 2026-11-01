'use client';

import React, { useState, useEffect } from 'react';
import { Modal, Avatar, Button } from '@/components/ui';
import { AVATAR_PALETTE } from '@/lib/auth/constants';
import { Check, Shield, ShieldAlert, Key, User } from 'lucide-react';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: {
    id: string;
    username: string;
    avatarColor: string;
    hasPassword?: boolean;
  } | null;
  onUserUpdated: (user: {
    id: string;
    username: string;
    avatarColor: string;
    hasPassword?: boolean;
  }) => void;
}

export function ProfileModal({
  isOpen,
  onClose,
  currentUser,
  onUserUpdated,
}: ProfileModalProps) {
  const [selectedColor, setSelectedColor] = useState(
    currentUser?.avatarColor || '#6366F1'
  );
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser) {
      setSelectedColor(currentUser.avatarColor);
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setIsChangingPassword(false);
    setErrorMessage(null);
    setSuccessMessage(null);
  }, [currentUser, isOpen]);

  if (!currentUser) return null;

  const handleSaveAvatar = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarColor: selectedColor }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update avatar color');
      }

      onUserUpdated(data.user);
      setSuccessMessage('Avatar color updated!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error updating avatar');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (newPassword.length < 4) {
      setErrorMessage('New password must be at least 4 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      const payload: {
        newPassword: string;
        currentPassword?: string;
      } = {
        newPassword,
      };

      if (currentUser.hasPassword) {
        if (!currentPassword) {
          setErrorMessage('Current password is required');
          setIsLoading(false);
          return;
        }
        payload.currentPassword = currentPassword;
      }

      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update password');
      }

      onUserUpdated(data.user);
      setSuccessMessage(
        currentUser.hasPassword
          ? 'Password changed successfully!'
          : 'Password protection enabled!'
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setIsChangingPassword(false);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error updating password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemovePassword = async () => {
    if (
      !window.confirm(
        'Are you sure you want to revert to passwordless login? Anyone with your username will be able to sign in.'
      )
    ) {
      return;
    }

    if (!currentPassword) {
      setErrorMessage('Please enter your current password to confirm removal');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword: null, // removes password
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to remove password');
      }

      onUserUpdated(data.user);
      setSuccessMessage('Password removed. Passwordless mode active.');
      setCurrentPassword('');
      setIsChangingPassword(false);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error removing password');
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
          <User className="w-5 h-5 text-indigo-600" />
          <span>User Profile</span>
        </div>
      }
      description="Manage your account appearance and security settings"
      maxWidth="md"
    >
      <div className="space-y-6">
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
            {successMessage}
          </div>
        )}

        {/* User Card */}
        <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200/80">
          <Avatar
            username={currentUser.username}
            avatarColor={selectedColor}
            size="lg"
          />
          <div>
            <div className="font-bold text-slate-900 text-lg">
              {currentUser.username}
            </div>
            <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
              {currentUser.hasPassword ? (
                <>
                  <Shield className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-medium">
                    Password Protected
                  </span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-amber-700 font-medium">
                    Passwordless Mode
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Avatar Color Picker */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Avatar Theme Color
          </label>
          <div className="grid grid-cols-6 gap-2.5">
            {AVATAR_PALETTE.map((color) => {
              const isSelected = selectedColor === color;
              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  style={{ backgroundColor: color }}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 shadow-sm ${
                    isSelected ? 'ring-2 ring-slate-900 ring-offset-2 scale-105' : ''
                  }`}
                  aria-label={`Select color ${color}`}
                >
                  {isSelected && <Check className="w-4 h-4 text-white stroke-[3]" />}
                </button>
              );
            })}
          </div>

          {selectedColor !== currentUser.avatarColor && (
            <div className="mt-3 flex justify-end">
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveAvatar}
                isLoading={isLoading}
              >
                Save New Color
              </Button>
            </div>
          )}
        </div>

        {/* Security / Password Section */}
        <div className="pt-4 border-t border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Account Security
              </div>
              <div className="text-xs text-slate-500">
                {currentUser.hasPassword
                  ? 'Your account is protected by a password'
                  : 'Fast sign-in enabled without a password'}
              </div>
            </div>

            {!isChangingPassword && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsChangingPassword(true)}
                icon={<Key className="w-3.5 h-3.5" />}
              >
                {currentUser.hasPassword ? 'Change Password' : 'Set Password'}
              </Button>
            )}
          </div>

          {isChangingPassword && (
            <form onSubmit={handleUpdatePassword} className="space-y-3 mt-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
              {currentUser.hasPassword && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    placeholder="Enter current password"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  New Password (min 4 characters)
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  placeholder="Enter new password"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Repeat new password"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                />
              </div>

              <div className="pt-2 flex items-center justify-between">
                {currentUser.hasPassword ? (
                  <button
                    type="button"
                    onClick={handleRemovePassword}
                    disabled={isLoading}
                    className="text-xs text-rose-600 hover:text-rose-700 font-semibold"
                  >
                    Remove Password
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsChangingPassword(false);
                      setErrorMessage(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    isLoading={isLoading}
                  >
                    Save Password
                  </Button>
                </div>
              </div>
            </form>
          )}
        </div>

        <div className="pt-2 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
