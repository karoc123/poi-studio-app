import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'slate' | 'sky';
  size?: 'sm' | 'md';
  className?: string;
  icon?: React.ReactNode;
}

export function Badge({
  children,
  variant = 'default',
  size = 'sm',
  className = '',
  icon,
}: BadgeProps) {
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs font-medium',
    md: 'px-2.5 py-1 text-sm font-medium',
  }[size];

  const variantClasses = {
    default: 'bg-slate-100 text-slate-700 border border-slate-200/80',
    indigo: 'bg-indigo-50 text-indigo-700 border border-indigo-200/80',
    emerald: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80',
    amber: 'bg-amber-50 text-amber-700 border border-amber-200/80',
    rose: 'bg-rose-50 text-rose-700 border border-rose-200/80',
    slate: 'bg-slate-200 text-slate-800 border border-slate-300',
    sky: 'bg-sky-50 text-sky-700 border border-sky-200/80',
  }[variant];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full ${sizeClasses} ${variantClasses} ${className}`}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </span>
  );
}
