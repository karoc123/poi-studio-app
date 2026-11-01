'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Shield,
  ShieldAlert,
  UserX,
  LogOut,
  Check,
  Loader2,
  Copy,
  RefreshCw,
  Link2,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import type { Role } from '@/types';

export interface MemberItem {
  id: string;
  tripId: string;
  userId: string;
  role: Role;
  joinedAt: number;
  user: {
    id: string;
    username: string;
    avatarColor: string;
  };
}

export interface MembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  tripId: string;
  inviteCode?: string;
  currentUserId?: string;
  currentUserRole?: Role;
  onMembersChanged?: () => void;
  onInviteCodeRegenerated?: (newCode: string) => void;
}

export function MembersModal({
  isOpen,
  onClose,
  tripId,
  inviteCode,
  currentUserId,
  currentUserRole = 'EDITOR',
  onMembersChanged,
  onInviteCodeRegenerated,
}: MembersModalProps) {
  const router = useRouter();
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [currentInviteCode, setCurrentInviteCode] = useState<string>(inviteCode || '');
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [isRegeneratingCode, setIsRegeneratingCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isOwner = currentUserRole === 'OWNER';

  // Keep invite code in sync with prop if changed
  useEffect(() => {
    if (inviteCode) {
      setCurrentInviteCode(inviteCode);
    }
  }, [inviteCode]);

  const fetchMembers = async () => {
    if (!tripId || !isOpen) return;
    setIsLoading(true);
    setError(null);
    try {
      // Parallel fetch members and trip info (if invite code needed)
      const requests: Promise<Response>[] = [fetch(`/api/trips/${tripId}/members`)];
      if (!currentInviteCode) {
        requests.push(fetch(`/api/trips/${tripId}`));
      }

      const [membersRes, tripRes] = await Promise.all(requests);

      if (!membersRes.ok) {
        const data = await membersRes.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load trip members');
      }

      const membersData = await membersRes.json();
      setMembers(membersData.members || []);

      if (tripRes && tripRes.ok) {
        const tripData = await tripRes.json().catch(() => ({}));
        if (tripData?.trip?.inviteCode) {
          setCurrentInviteCode(tripData.trip.inviteCode);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load members');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMembers();
    }
  }, [isOpen, tripId]);

  const getInviteUrl = (code: string) => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/join/${code}`;
    }
    return `/join/${code}`;
  };

  const handleCopyLink = async () => {
    if (!currentInviteCode) return;
    const url = getInviteUrl(currentInviteCode);
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = url;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setError('Failed to copy invite link to clipboard');
      setTimeout(() => setError(null), 3000);
    }
  };

  const handleRegenerateCode = async () => {
    if (
      !window.confirm(
        'Regenerating the invite link will immediately invalidate the current link. Anyone with the old link will no longer be able to join. Continue?'
      )
    ) {
      return;
    }

    setIsRegeneratingCode(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/invite-code`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to regenerate invite link');
      }

      setCurrentInviteCode(data.inviteCode);
      setSuccessMsg('Invite link regenerated successfully');
      onInviteCodeRegenerated?.(data.inviteCode);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error regenerating link');
      setTimeout(() => setError(null), 4000);
    } finally {
      setIsRegeneratingCode(false);
    }
  };

  const handleRoleChange = async (targetUserId: string, newRole: Role) => {
    setActionLoadingId(targetUserId);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/members/${targetUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update member role');
      }

      setMembers((prev) =>
        prev.map((m) =>
          m.userId === targetUserId ? { ...m, role: newRole } : m
        )
      );
      setSuccessMsg('Member role updated successfully');
      onMembersChanged?.();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error changing role');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRemoveMember = async (targetUserId: string, username: string) => {
    const isSelf = targetUserId === currentUserId;
    const confirmMessage = isSelf
      ? 'Are you sure you want to leave this trip?'
      : `Are you sure you want to remove ${username} from the trip?`;

    if (!window.confirm(confirmMessage)) return;

    setActionLoadingId(targetUserId);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/members/${targetUserId}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to remove member');
      }

      if (isSelf) {
        onClose();
        router.push('/');
        return;
      }

      setMembers((prev) => prev.filter((m) => m.userId !== targetUserId));
      setSuccessMsg(`${username} was removed from the trip`);
      onMembersChanged?.();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error removing member');
    } finally {
      setActionLoadingId(null);
    }
  };

  const getRoleBadge = (role: Role) => {
    switch (role) {
      case 'OWNER':
        return (
          <Badge variant="amber" icon={<Shield className="w-3 h-3" />}>
            Owner
          </Badge>
        );
      case 'EDITOR':
        return (
          <Badge variant="indigo" icon={<Check className="w-3 h-3" />}>
            Editor
          </Badge>
        );
      case 'VIEWER':
        return <Badge variant="slate">Viewer</Badge>;
    }
  };

  const ownersCount = members.filter((m) => m.role === 'OWNER').length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span>Trip Members & Collaboration</span>
          <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
            {members.length}
          </span>
        </div>
      }
      description="Manage collaborators, shareable invite links, and access permissions"
      maxWidth="lg"
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700 flex items-center gap-2">
            <Check className="w-4 h-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Shareable Invite Link Section */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
            <div className="flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-indigo-600" />
              <span>Shareable Invite Link</span>
            </div>
            {currentInviteCode && (
              <span className="text-[11px] text-slate-400 font-mono">
                Code: {currentInviteCode}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 font-mono truncate select-all">
              {currentInviteCode
                ? (typeof window !== 'undefined'
                    ? `${window.location.origin}/join/${currentInviteCode}`
                    : `/join/${currentInviteCode}`)
                : 'Loading invite link...'}
            </div>
            <button
              type="button"
              onClick={handleCopyLink}
              disabled={!currentInviteCode}
              title="Copy invite link to clipboard"
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 flex-shrink-0 disabled:opacity-50 ${
                copiedLink
                  ? 'bg-emerald-600 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Link</span>
                </>
              )}
            </button>
            {isOwner && (
              <button
                type="button"
                onClick={handleRegenerateCode}
                disabled={isRegeneratingCode || !currentInviteCode}
                title="Regenerate invite link"
                className="px-2.5 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors flex items-center gap-1.5 flex-shrink-0 disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 text-amber-600 ${
                    isRegeneratingCode ? 'animate-spin' : ''
                  }`}
                />
                <span>Regenerate</span>
              </button>
            )}
          </div>
          <p className="text-[11px] text-slate-500">
            Anyone with this link will automatically join the trip as an{' '}
            <span className="font-semibold text-slate-700">Editor</span>.
          </p>
        </div>

        {/* Members Roster Section */}
        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            <p className="text-sm">Loading members...</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto pr-1">
            {members.map((member) => {
              const isCurrentUser = member.userId === currentUserId;
              const isTargetOwner = member.role === 'OWNER';
              const canDemoteOrRemove =
                !isTargetOwner || ownersCount > 1;

              return (
                <div
                  key={member.id}
                  className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50/50 px-2 rounded-lg transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar
                      username={member.user.username}
                      avatarColor={member.user.avatarColor}
                      size="md"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 truncate">
                          {member.user.username}
                        </span>
                        {isCurrentUser && (
                          <span className="text-xs text-indigo-600 font-medium">
                            (You)
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                        <span>
                          Joined{' '}
                          {new Date(member.joinedAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Role selector for OWNER (or badge for read-only) */}
                    {isOwner && (!isCurrentUser || canDemoteOrRemove) ? (
                      <select
                        value={member.role}
                        disabled={actionLoadingId === member.userId}
                        onChange={(e) =>
                          handleRoleChange(member.userId, e.target.value as Role)
                        }
                        className="text-xs font-medium border border-slate-200 rounded-md py-1 px-2 bg-white text-slate-700 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer disabled:opacity-50"
                      >
                        <option value="OWNER">Owner</option>
                        <option value="EDITOR">Editor</option>
                        <option value="VIEWER">Viewer</option>
                      </select>
                    ) : (
                      getRoleBadge(member.role)
                    )}

                    {/* Actions: Remove or Leave */}
                    {isCurrentUser ? (
                      canDemoteOrRemove && (
                        <button
                          type="button"
                          onClick={() =>
                            handleRemoveMember(member.userId, member.user.username)
                          }
                          disabled={actionLoadingId === member.userId}
                          title="Leave trip"
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                        >
                          <LogOut className="w-4 h-4" />
                        </button>
                      )
                    ) : (
                      isOwner && (
                        <button
                          type="button"
                          onClick={() =>
                            handleRemoveMember(member.userId, member.user.username)
                          }
                          disabled={actionLoadingId === member.userId}
                          title="Remove member from trip"
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                        >
                          <UserX className="w-4 h-4" />
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <div>
            <span className="font-medium text-slate-700">Role Capabilities:</span>
            <span className="ml-1">
              Owners edit settings & manage roles. Editors manage itinerary & checklists. Viewers have read-only access.
            </span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
