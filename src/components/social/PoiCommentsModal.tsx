'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, MessageSquare, Send, Trash2, Clock, User } from 'lucide-react';
import type { SafeUser, Role } from '@/types';

export interface CommentItem {
  id: string;
  poiId: string;
  content: string;
  createdAt: number | string;
  user: {
    id: string;
    username: string;
    avatarColor: string;
  };
}

interface PoiCommentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tripId: string;
  poiId: string;
  poiTitle: string;
  currentUserId: string;
  currentUserRole: Role;
  initialComments?: CommentItem[];
  onCommentCountChange?: (count: number) => void;
}

export function PoiCommentsModal({
  isOpen,
  onClose,
  tripId,
  poiId,
  poiTitle,
  currentUserId,
  currentUserRole,
  initialComments = [],
  onCommentCountChange,
}: PoiCommentsModalProps) {
  const [comments, setComments] = useState<CommentItem[]>(initialComments);
  const [newContent, setNewContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isReadOnly = currentUserRole === 'VIEWER';

  // Fetch comments when modal opens
  useEffect(() => {
    if (!isOpen || !tripId || !poiId) return;

    let isMounted = true;
    setIsLoading(true);

    fetch(`/api/trips/${tripId}/pois/${poiId}/comments`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data && Array.isArray(data.comments)) {
          setComments(data.comments);
          onCommentCountChange?.(data.comments.length);
        }
      })
      .catch((err) => console.error('Failed to load comments:', err))
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, tripId, poiId]);

  // Scroll to bottom on new comments
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments]);

  if (!isOpen) return null;

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !newContent.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/pois/${poiId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.comment) {
          const updated = [...comments, data.comment];
          setComments(updated);
          setNewContent('');
          onCommentCountChange?.(updated.length);
        }
      }
    } catch (err) {
      console.error('Failed to post comment:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      const res = await fetch(`/api/trips/${tripId}/pois/${poiId}/comments/${commentId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const updated = comments.filter((c) => c.id !== commentId);
        setComments(updated);
        onCommentCountChange?.(updated.length);
      }
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  const formatCommentDate = (dateVal: number | string) => {
    try {
      const d = typeof dateVal === 'number' ? new Date(dateVal) : new Date(dateVal);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
          <div className="flex items-center gap-2 truncate pr-2">
            <MessageSquare className="w-5 h-5 text-indigo-600 shrink-0" />
            <div className="truncate">
              <h2 className="font-extrabold text-sm text-slate-900 truncate">
                Discussion: {poiTitle}
              </h2>
              <p className="text-[11px] text-slate-500">
                {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Comment List */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {isLoading && comments.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">Loading discussion...</div>
          ) : comments.length === 0 ? (
            <div className="py-12 text-center text-slate-400 px-4">
              <MessageSquare className="w-8 h-8 mx-auto text-slate-300 mb-2 stroke-1" />
              <p className="text-xs font-semibold text-slate-600">No comments yet</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Share tips, ticket reservations, or notes with your group.
              </p>
            </div>
          ) : (
            comments.map((comment) => {
              const isAuthor = comment.user.id === currentUserId;
              const canDelete = isAuthor || currentUserRole === 'OWNER';

              return (
                <div
                  key={comment.id}
                  className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100 group"
                >
                  {/* User Avatar */}
                  <div
                    className="w-7 h-7 rounded-full text-white font-bold text-xs flex items-center justify-center shrink-0 uppercase shadow-sm"
                    style={{ backgroundColor: comment.user.avatarColor || '#6366F1' }}
                  >
                    {comment.user.username.charAt(0)}
                  </div>

                  {/* Comment Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-slate-900">
                          {comment.user.username}
                        </span>
                        {isAuthor && (
                          <span className="text-[9px] font-semibold bg-indigo-50 text-indigo-600 px-1.5 py-0.2 rounded-full">
                            You
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {formatCommentDate(comment.createdAt)}
                        </span>

                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDeleteComment(comment.id)}
                            className="p-1 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                            title="Delete comment"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-slate-700 whitespace-pre-wrap break-words leading-relaxed">
                      {comment.content}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Input Footer */}
        {!isReadOnly && (
          <form
            onSubmit={handlePostComment}
            className="p-3 border-t border-slate-100 bg-slate-50 flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Add a comment or tip..."
              disabled={isSubmitting}
              className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={!newContent.trim() || isSubmitting}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1 shrink-0 shadow-sm"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Post</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default PoiCommentsModal;
