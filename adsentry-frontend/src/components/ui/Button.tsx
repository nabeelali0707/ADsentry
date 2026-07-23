'use client';

import React from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'sentry-glowing-btn bg-gradient-to-r from-teal-accent to-emerald-accent text-navy-950 font-bold shadow-lg shadow-teal-500/10 hover:opacity-90',
  secondary:
    'bg-slate-900 border border-slate-800 text-slate-300 font-semibold hover:bg-slate-800 hover:text-white',
  ghost:
    'bg-transparent border border-transparent text-slate-400 font-medium hover:bg-slate-900 hover:text-white',
  danger:
    'bg-transparent border border-slate-800 text-slate-400 font-medium hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400',
};

const spinnerClasses: Record<ButtonVariant, string> = {
  primary: 'border-navy-950 border-t-transparent',
  secondary: 'border-slate-400 border-t-transparent',
  ghost: 'border-slate-400 border-t-transparent',
  danger: 'border-red-400 border-t-transparent',
};

export default function Button({
  variant = 'primary',
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm transition-all duration-200 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100',
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {loading && (
        <span className={cn('h-4 w-4 shrink-0 animate-spin rounded-full border-2', spinnerClasses[variant])} />
      )}
      {children}
    </button>
  );
}
