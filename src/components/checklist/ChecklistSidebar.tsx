'use client';

import React, { useState, useMemo } from 'react';
import {
  CheckSquare,
  Square,
  Plus,
  Trash2,
  Filter,
  User,
  CheckCircle2,
  AlertCircle,
  Tag,
  Luggage,
  FileCheck,
  CalendarCheck,
} from 'lucide-react';
import type { ChecklistItemWithAssignee, SafeUser, Role, ChecklistCategory } from '@/types';

interface ChecklistSidebarProps {
  tripId: string;
  items: ChecklistItemWithAssignee[];
  members: SafeUser[];
  currentUserId: string;
  currentUserRole: Role;
  onItemCreated?: (item: ChecklistItemWithAssignee) => void;
  onItemUpdated?: (itemId: string, updates: Partial<ChecklistItemWithAssignee>) => void;
  onItemDeleted?: (itemId: string) => void;
}

const CATEGORY_INFO: Record<ChecklistCategory, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  BEFORE_TRIP: {
    label: 'Before Trip',
    icon: CalendarCheck,
    color: '#4F46E5',
    bg: '#EEF2FF',
  },
  PACKING: {
    label: 'Packing List',
    icon: Luggage,
    color: '#059669',
    bg: '#ECFDF5',
  },
  DOCUMENTS: {
    label: 'Documents & Visas',
    icon: FileCheck,
    color: '#D97706',
    bg: '#FFFBEB',
  },
};

export function ChecklistSidebar({
  tripId,
  items = [],
  members = [],
  currentUserId,
  currentUserRole,
  onItemCreated,
  onItemUpdated,
  onItemDeleted,
}: ChecklistSidebarProps) {
  const isReadOnly = currentUserRole === 'VIEWER';

  // Category & Status Filters
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | ChecklistCategory>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'COMPLETED' | 'MINE'>('ALL');

  // Add Item State
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<ChecklistCategory>('BEFORE_TRIP');
  const [newAssigneeId, setNewAssigneeId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Category filter
      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) {
        return false;
      }
      // Status filter
      if (statusFilter === 'OPEN' && item.isCompleted) return false;
      if (statusFilter === 'COMPLETED' && !item.isCompleted) return false;
      if (statusFilter === 'MINE' && item.assignedToUserId !== currentUserId) return false;

      return true;
    });
  }, [items, selectedCategory, statusFilter, currentUserId]);

  // Overall Stats
  const totalCount = items.length;
  const completedCount = items.filter((i) => i.isCompleted).length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Toggle completion
  const handleToggleCompleted = async (item: ChecklistItemWithAssignee) => {
    if (isReadOnly) return;
    const newCompleted = !item.isCompleted;

    onItemUpdated?.(item.id, { isCompleted: newCompleted });

    try {
      await fetch(`/api/trips/${tripId}/checklists/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isCompleted: newCompleted }),
      });
    } catch (err) {
      console.error('Failed to toggle checklist completion:', err);
    }
  };

  // Delete item
  const handleDeleteItem = async (itemId: string) => {
    if (isReadOnly) return;

    onItemDeleted?.(itemId);

    try {
      await fetch(`/api/trips/${tripId}/checklists/${itemId}`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.error('Failed to delete checklist item:', err);
    }
  };

  // Create item
  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly || !newTitle.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/trips/${tripId}/checklists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          category: newCategory,
          assignedToUserId: newAssigneeId || null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.item) {
          const assignee = members.find((m) => m.id === data.item.assignedToUserId) || null;
          onItemCreated?.({
            ...data.item,
            assignedTo: assignee,
          });
          setNewTitle('');
          setNewAssigneeId('');
        }
      }
    } catch (err) {
      console.error('Failed to add checklist item:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden text-slate-900">
      {/* 1. Header Progress Bar */}
      <div className="p-3.5 border-b border-slate-100 bg-slate-50/60 shrink-0 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-bold text-slate-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Trip Checklists</span>
          </div>
          <span className="text-[11px] font-bold text-slate-600">
            {completedCount} / {totalCount} done ({progressPercent}%)
          </span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-emerald-600 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* 2. Category Filter Pills */}
      <div className="px-3 py-2 border-b border-slate-100 bg-white flex items-center gap-1 overflow-x-auto no-scrollbar shrink-0">
        <button
          type="button"
          onClick={() => setSelectedCategory('ALL')}
          className={`px-2.5 py-1 text-xs font-bold rounded-full transition-all shrink-0 ${
            selectedCategory === 'ALL'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          All Lists ({items.length})
        </button>

        {(['BEFORE_TRIP', 'PACKING', 'DOCUMENTS'] as ChecklistCategory[]).map((catKey) => {
          const meta = CATEGORY_INFO[catKey];
          const Icon = meta.icon;
          const count = items.filter((i) => i.category === catKey).length;
          const isActive = selectedCategory === catKey;

          return (
            <button
              key={catKey}
              type="button"
              onClick={() => setSelectedCategory(catKey)}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full transition-all shrink-0 ${
                isActive
                  ? 'text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              style={{
                backgroundColor: isActive ? meta.color : undefined,
              }}
            >
              <Icon className="w-3 h-3" />
              <span>{meta.label}</span>
              <span className={`text-[10px] ml-0.5 ${isActive ? 'text-white/80' : 'text-slate-400'}`}>
                ({count})
              </span>
            </button>
          );
        })}
      </div>

      {/* 3. Status Filters */}
      <div className="px-3 py-1.5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs shrink-0">
        <span className="text-[11px] font-semibold text-slate-500">
          Showing {filteredItems.length} items
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
              statusFilter === 'ALL' ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('OPEN')}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
              statusFilter === 'OPEN' ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Open
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('MINE')}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
              statusFilter === 'MINE' ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Assigned to Me
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('COMPLETED')}
            className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
              statusFilter === 'COMPLETED' ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Done
          </button>
        </div>
      </div>

      {/* 4. Add Item Input (Top of List) */}
      {!isReadOnly && (
        <form onSubmit={handleCreateItem} className="p-3 border-b border-slate-100 bg-slate-50 space-y-2 shrink-0">
          <div className="flex items-center gap-2">
            <input
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Add task or item (e.g. Passport, Powerbank, Book hotel)..."
              disabled={isSubmitting}
              className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={!newTitle.trim() || isSubmitting}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shadow-sm shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as ChecklistCategory)}
              className="px-2 py-1 text-[11px] font-semibold border border-slate-200 rounded-md bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="BEFORE_TRIP">Category: Before Trip</option>
              <option value="PACKING">Category: Packing List</option>
              <option value="DOCUMENTS">Category: Documents</option>
            </select>

            <select
              value={newAssigneeId}
              onChange={(e) => setNewAssigneeId(e.target.value)}
              className="px-2 py-1 text-[11px] font-semibold border border-slate-200 rounded-md bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  Assign to: {m.username}
                </option>
              ))}
            </select>
          </div>
        </form>
      )}

      {/* 5. Item Cards List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filteredItems.length === 0 ? (
          <div className="py-12 text-center text-slate-400 px-4">
            <CheckSquare className="w-8 h-8 mx-auto text-slate-300 mb-2 stroke-1" />
            <p className="text-xs font-semibold text-slate-600">No checklist items match</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Add your group packing lists, tickets, visas, or preparation to-dos.
            </p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const meta = CATEGORY_INFO[item.category as ChecklistCategory] || CATEGORY_INFO.BEFORE_TRIP;
            const isAssignedToMe = item.assignedToUserId === currentUserId;

            return (
              <div
                key={item.id}
                className={`p-2.5 rounded-xl border transition-all flex items-start justify-between gap-2.5 group ${
                  item.isCompleted
                    ? 'bg-slate-50/70 border-slate-200 text-slate-400'
                    : 'bg-white border-slate-200/80 hover:border-slate-300 hover:shadow-sm text-slate-800'
                }`}
              >
                {/* Checkbox */}
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => handleToggleCompleted(item)}
                  className={`mt-0.5 shrink-0 transition-colors ${
                    isReadOnly ? 'cursor-default' : 'cursor-pointer'
                  }`}
                  title={item.isCompleted ? 'Mark incomplete' : 'Mark completed'}
                >
                  {item.isCompleted ? (
                    <CheckSquare className="w-4 h-4 text-emerald-600 fill-emerald-50" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400 hover:text-slate-600" />
                  )}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <span
                    className={`text-xs block leading-snug break-words ${
                      item.isCompleted ? 'line-through text-slate-400' : 'font-semibold text-slate-900'
                    }`}
                  >
                    {item.title}
                  </span>

                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    {/* Category badge */}
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.2 rounded uppercase"
                      style={{
                        backgroundColor: meta.bg,
                        color: meta.color,
                      }}
                    >
                      {meta.label}
                    </span>

                    {/* Assignee badge */}
                    {item.assignedTo ? (
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.2 rounded-full flex items-center gap-1 ${
                          isAssignedToMe
                            ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: item.assignedTo.avatarColor || '#6366F1' }}
                        />
                        <span>{item.assignedTo.username}</span>
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Actions */}
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => handleDeleteItem(item.id)}
                    className="p-1 text-slate-300 hover:text-rose-600 rounded transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0"
                    title="Delete task"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default ChecklistSidebar;
