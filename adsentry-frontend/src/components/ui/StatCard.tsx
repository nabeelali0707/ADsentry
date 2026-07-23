import React from 'react';
import { ArrowUpRight, ArrowDownRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export type StatCardTone = 'default' | 'danger' | 'success' | 'accent';

const TONE_STYLES: Record<StatCardTone, { iconWrap: string; value: string }> = {
  default: { iconWrap: 'bg-slate-800/60 border-slate-700 text-slate-300', value: 'text-white' },
  danger: { iconWrap: 'bg-red-500/10 border-red-500/20 text-red-400', value: 'text-red-400' },
  success: { iconWrap: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', value: 'text-white' },
  accent: { iconWrap: 'bg-teal-accent/15 border-teal-500/20 text-teal-accent', value: 'text-teal-accent' },
};

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  description?: React.ReactNode;
  /** Only pass when the underlying data actually supports computing a trend. */
  trend?: { value: number; label?: string };
  tone?: StatCardTone;
  className?: string;
}

export function StatCard({ label, value, icon: Icon, description, trend, tone = 'default', className }: StatCardProps) {
  const styles = TONE_STYLES[tone];
  return (
    <div className={cn('glass-card p-6 rounded-2xl border border-slate-800 flex flex-col justify-between', className)}>
      <div className="flex justify-between items-start">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
          <h3 className={cn('text-3xl font-black mt-1.5', styles.value)}>{value}</h3>
        </div>
        <div className={cn('p-2.5 rounded-xl border shrink-0', styles.iconWrap)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {(description || trend) && (
        <div className="text-xs text-slate-400 mt-4 border-t border-slate-800/60 pt-3 flex items-center justify-between gap-2">
          {description && <span>{description}</span>}
          {trend && (
            <span
              className={cn(
                'flex items-center gap-1 font-semibold shrink-0',
                trend.value >= 0 ? 'text-emerald-400' : 'text-red-400',
              )}
            >
              {trend.value >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(trend.value).toFixed(1)}%{trend.label ? ` ${trend.label}` : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default StatCard;
