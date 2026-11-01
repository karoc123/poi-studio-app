import React from 'react';

interface AvatarProps {
  username?: string;
  avatarColor?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showTooltip?: boolean;
}

export function Avatar({
  username = 'U',
  avatarColor = '#6366F1',
  size = 'md',
  className = '',
  showTooltip = true,
}: AvatarProps) {
  const initial = username.charAt(0).toUpperCase();

  const sizeClasses = {
    xs: 'w-5 h-5 text-[10px]',
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-sm',
    lg: 'w-12 h-12 text-base font-bold',
    xl: 'w-16 h-16 text-xl font-bold',
  }[size];

  return (
    <div
      title={showTooltip ? username : undefined}
      style={{ backgroundColor: avatarColor }}
      className={`relative inline-flex items-center justify-center rounded-full text-white font-semibold ring-2 ring-white shadow-sm flex-shrink-0 select-none ${sizeClasses} ${className}`}
    >
      <span>{initial}</span>
    </div>
  );
}

export function AvatarGroup({
  users,
  max = 4,
  size = 'sm',
}: {
  users: Array<{ id?: string; username: string; avatarColor?: string }>;
  max?: number;
  size?: 'xs' | 'sm' | 'md';
}) {
  const visible = users.slice(0, max);
  const remaining = users.length - max;

  const sizeClasses = {
    xs: 'w-5 h-5 text-[10px]',
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-sm',
  }[size];

  return (
    <div className="flex -space-x-1.5 items-center overflow-hidden">
      {visible.map((u, i) => (
        <Avatar
          key={u.id || `${u.username}-${i}`}
          username={u.username}
          avatarColor={u.avatarColor || '#6366F1'}
          size={size}
        />
      ))}
      {remaining > 0 && (
        <div
          title={`${remaining} more members`}
          className={`relative inline-flex items-center justify-center rounded-full bg-slate-200 text-slate-700 font-semibold ring-2 ring-white shadow-sm flex-shrink-0 select-none ${sizeClasses}`}
        >
          +{remaining}
        </div>
      )}
    </div>
  );
}
