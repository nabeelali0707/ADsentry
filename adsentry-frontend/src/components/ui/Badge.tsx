import React from 'react';
import { cn } from '@/lib/cn';

/**
 * Covers every enum this app displays as a pill: compliance status,
 * discrepancy type, report status, plus a neutral "ALL" filter chip state.
 */
const STATUS_STYLES: Record<string, string> = {
  // Compliance status
  COMPLIANT: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  MINOR_DEVIATION: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
  MAJOR_BREACH: 'text-red-400 bg-red-500/10 border-red-500/20',
  // Discrepancy type
  MISSED: 'text-red-400 bg-red-500/10 border-red-500/20',
  SHORTENED: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  OUT_OF_SLOT: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  DUPLICATE_BILLED: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  // Report status
  DRAFT: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  FINAL: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
  EXPORTED: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  // Neutral / filter chip
  ALL: 'text-slate-300 bg-slate-800/60 border-slate-700',
};

const FALLBACK_STYLE = 'text-slate-400 bg-slate-500/10 border-slate-500/20';

function formatStatusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

export interface BadgeProps {
  status: string;
  label?: React.ReactNode;
  className?: string;
}

export function Badge({ status, label, className }: BadgeProps) {
  const style = STATUS_STYLES[status] ?? FALLBACK_STYLE;
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider whitespace-nowrap',
        style,
        className,
      )}
    >
      {label ?? formatStatusLabel(status)}
    </span>
  );
}

export default Badge;
