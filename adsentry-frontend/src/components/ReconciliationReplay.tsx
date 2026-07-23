'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api, formatPKR, Discrepancy, DiscrepancyType } from '@/lib/api';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

interface ReconciliationReplayProps {
  contractId: string;
  startDate: string;
  endDate: string;
  contractedAirings: number;
  onComplete: () => void;
}

interface TimelinePoint {
  position: number; // 0..1 across the campaign date range
  kind: DiscrepancyType | 'COMPLIANT';
  channel?: string;
}

type Phase = 'loading' | 'sweeping' | 'settled';

// Reuses Badge.tsx's discrepancy-type color families for the flash dots.
const DOT_STYLES: Record<DiscrepancyType, string> = {
  MISSED: 'bg-red-500 shadow-red-500/60',
  SHORTENED: 'bg-amber-500 shadow-amber-500/60',
  OUT_OF_SLOT: 'bg-yellow-500 shadow-yellow-500/60',
  DUPLICATE_BILLED: 'bg-purple-500 shadow-purple-500/60',
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Maps discrepancies onto date-proportional positions along the campaign's
 * timeline, then fills the remaining contracted slots as evenly-spaced
 * "compliant" points. This is a visualization, not a re-run of reconciliation.
 */
function buildTimelinePoints(
  discrepancies: Discrepancy[],
  startDate: string,
  endDate: string,
  contractedAirings: number,
): TimelinePoint[] {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const span = end - start;

  const discrepancyPoints: TimelinePoint[] = discrepancies.map((d) => {
    const t = d.air_date ? new Date(d.air_date).getTime() : NaN;
    const position = span > 0 && Number.isFinite(t) ? clamp((t - start) / span, 0, 1) : 0.5;
    return { position, kind: d.type, channel: d.channel };
  });

  const totalSlots = Math.max(contractedAirings || 0, discrepancyPoints.length, 1);
  const compliantCount = Math.max(totalSlots - discrepancyPoints.length, 0);
  const compliantPoints: TimelinePoint[] = Array.from({ length: compliantCount }, (_, i) => ({
    position: compliantCount === 1 ? 0.5 : i / (compliantCount - 1),
    kind: 'COMPLIANT' as const,
  }));

  return [...discrepancyPoints, ...compliantPoints].sort((a, b) => a.position - b.position);
}

/** A single flash on the timeline: scale-up + color pop, label fades after ~450ms. */
function TimelineFlash({ point }: { point: TimelinePoint }) {
  const isCompliant = point.kind === 'COMPLIANT';
  const [showLabel, setShowLabel] = useState(!isCompliant);

  useEffect(() => {
    if (!showLabel) return;
    const t = setTimeout(() => setShowLabel(false), 450);
    return () => clearTimeout(t);
  }, [showLabel]);

  const dotStyle = point.kind === 'COMPLIANT' ? 'bg-emerald-400 shadow-emerald-400/60' : DOT_STYLES[point.kind];

  return (
    <div className="absolute top-1/2" style={{ left: `${point.position * 100}%` }}>
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: [0, 1.7, 1] }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className={cn('h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_10px_2px]', dotStyle)}
      />
      <AnimatePresence>
        {showLabel && !isCompliant && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute top-3 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-bold px-1.5 py-0.5 rounded bg-navy-950 border border-slate-700 text-white z-10"
          >
            {point.kind.replace(/_/g, ' ')} · {point.channel || 'N/A'}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ReconciliationReplay({
  contractId,
  startDate,
  endDate,
  contractedAirings,
  onComplete,
}: ReconciliationReplayProps) {
  const prefersReducedMotion = useReducedMotion();
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[] | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [revealedCount, setRevealedCount] = useState(0);

  // Escape closes/skips, same as the rest of the app's overlays.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onComplete();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onComplete]);

  useEffect(() => {
    let cancelled = false;
    api
      .listDiscrepancies(contractId)
      .then((list) => {
        if (!cancelled) setDiscrepancies(list);
      })
      .catch(() => {
        if (!cancelled) setDiscrepancies([]);
      });
    return () => {
      cancelled = true;
    };
  }, [contractId]);

  const points = useMemo(() => {
    if (!discrepancies) return [];
    return buildTimelinePoints(discrepancies, startDate, endDate, contractedAirings);
  }, [discrepancies, startDate, endDate, contractedAirings]);

  // Compress proportionally to point count, clamped to a 2-5s sweep.
  const duration = useMemo(() => clamp(2 + points.length * 0.02, 2, 5), [points.length]);

  // Once data is ready: reduced motion skips straight to the settled summary.
  useEffect(() => {
    if (discrepancies === null) return;
    if (prefersReducedMotion) {
      setRevealedCount(points.length);
      setPhase('settled');
      return;
    }
    setPhase('sweeping');
  }, [discrepancies, prefersReducedMotion, points.length]);

  // Drive point reveals in lockstep with the scan line's linear sweep.
  useEffect(() => {
    if (phase !== 'sweeping') return;
    let rafId: number;
    const start = performance.now();
    const totalMs = duration * 1000;

    const tick = (now: number) => {
      const elapsedSec = (now - start) / 1000;
      const count = points.filter((p) => p.position * duration <= elapsedSec).length;
      setRevealedCount((prev) => (count > prev ? count : prev));
      if (now - start >= totalMs) {
        setRevealedCount(points.length);
        setPhase('settled');
        return;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [phase, points, duration]);

  // Settle briefly on the summary, then hand control back to the caller.
  useEffect(() => {
    if (phase !== 'settled') return;
    const t = setTimeout(onComplete, 800);
    return () => clearTimeout(t);
  }, [phase, onComplete]);

  const totalSlots = points.length;
  const issuesFoundSoFar = points.slice(0, revealedCount).filter((p) => p.kind !== 'COMPLIANT').length;
  const totalIssues = discrepancies?.length ?? 0;
  const totalImpact = useMemo(
    () => (discrepancies ?? []).reduce((sum, d) => sum + (d.financial_impact || 0), 0),
    [discrepancies],
  );

  const formatDate = (value: string) => {
    const d = new Date(value);
    return Number.isNaN(d.getTime())
      ? value
      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-navy-950/95 backdrop-blur-md px-4">
      <Button
        variant="ghost"
        onClick={onComplete}
        aria-label="Skip reconciliation replay"
        className="absolute top-6 right-6 text-xs gap-1.5"
      >
        Skip
        <X className="h-3.5 w-3.5" />
      </Button>

      <div className="w-full max-w-3xl space-y-6">
        <div className="text-center space-y-1">
          <p className="text-xs font-bold uppercase tracking-widest text-teal-accent">Reconciliation Replay</p>
          <h2 className="text-2xl font-extrabold text-white">Sweeping broadcaster logs against the contract...</h2>
        </div>

        <Card className="p-8 relative">
          {phase === 'loading' ? (
            <div className="h-40 flex items-center justify-center text-slate-400 text-sm">
              Loading reconciliation results...
            </div>
          ) : phase === 'sweeping' ? (
            <div className="space-y-10">
              {/* Running counter */}
              <div className="flex justify-end">
                <div className="text-xs font-semibold text-slate-300 bg-slate-900/70 border border-slate-800 rounded-full px-3 py-1.5">
                  Analyzed: <span className="text-white">{revealedCount}</span> / {totalSlots} ·{' '}
                  <span className={issuesFoundSoFar > 0 ? 'text-red-400' : 'text-emerald-400'}>
                    {issuesFoundSoFar} issue{issuesFoundSoFar === 1 ? '' : 's'} found
                  </span>
                </div>
              </div>

              {/* Timeline */}
              <div className="relative h-24 mx-4">
                <div className="absolute top-1/2 left-0 right-0 h-1 -translate-y-1/2 bg-slate-800 rounded-full" />

                <motion.div
                  className="absolute top-0 bottom-0 w-0.5 bg-teal-accent animate-pulse-glow"
                  style={{ boxShadow: '0 0 14px 3px rgba(20,184,166,0.55)' }}
                  initial={{ left: '0%' }}
                  animate={{ left: '100%' }}
                  transition={{ duration, ease: 'linear' }}
                />

                {points.slice(0, revealedCount).map((point, i) => (
                  <TimelineFlash key={i} point={point} />
                ))}
              </div>

              <div className="flex justify-between text-[11px] text-slate-500 font-semibold px-1">
                <span>{formatDate(startDate)}</span>
                <span>{formatDate(endDate)}</span>
              </div>
            </div>
          ) : (
            <motion.div
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
              animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="py-10 text-center space-y-3"
            >
              {totalIssues === 0 ? (
                <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto" />
              ) : (
                <AlertTriangle className="h-10 w-10 text-amber-400 mx-auto" />
              )}
              <p className="text-lg font-bold text-white">
                {totalIssues === 0
                  ? '0 discrepancies found · fully compliant campaign'
                  : `${totalIssues} discrepanc${totalIssues === 1 ? 'y' : 'ies'} found · ${formatPKR(totalImpact)} estimated impact`}
              </p>
              <p className="text-xs text-slate-400">Redirecting to your Compliance Dashboard...</p>
            </motion.div>
          )}
        </Card>
      </div>
    </div>
  );
}
