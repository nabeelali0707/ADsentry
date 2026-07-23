'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuditStore } from '@/store/useAuditStore';
import { api, formatPKR, Discrepancy, DiscrepancyType } from '@/lib/api';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { Skeleton, TableRowSkeleton } from '@/components/ui/Skeleton';
import ErrorBanner from '@/components/ui/ErrorBanner';
import {
  AlertTriangle,
  Search,
  Filter,
  ChevronRight,
  X,
  Tv,
  Clock,
  Calendar,
  Coins,
  Info,
  FileText
} from 'lucide-react';

const FILTER_TYPES = [
  { label: 'All Mismatches', value: 'ALL' },
  { label: 'Missed', value: 'MISSED' },
  { label: 'Shortened', value: 'SHORTENED' },
  { label: 'Out of Slot', value: 'OUT_OF_SLOT' },
  { label: 'Duplicate Billed', value: 'DUPLICATE_BILLED' },
];

export default function DiscrepanciesPage() {
  const router = useRouter();
  const { activeContract } = useAuditStore();

  const [loading, setLoading] = useState(true);
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([]);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchDiscrepancies = async () => {
    if (!activeContract) return;
    setLoading(true);
    setError('');
    try {
      const list = await api.listDiscrepancies(activeContract.id, filterType);
      setDiscrepancies(list);
    } catch (err: any) {
      setError(err.message || 'Failed to load discrepancies.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiscrepancies();
  }, [activeContract, filterType]);

  const handleRowClick = async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    try {
      const data = await api.getDiscrepancy(id);
      setDetailData(data);
    } catch (err) {
      console.error('Failed to load discrepancy details', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const getBadgeStyle = (type: DiscrepancyType) => {
    switch (type) {
      case 'MISSED':
        return 'text-red-400 bg-red-500/10 border-red-500/20';
      case 'SHORTENED':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      case 'OUT_OF_SLOT':
        return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
      case 'DUPLICATE_BILLED':
        return 'text-purple-400 bg-purple-500/10 border-purple-500/20';
      default:
        return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
    }
  };

  const formatTypeName = (type: string) => {
    return type.replace(/_/g, ' ');
  };

  if (!activeContract) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
        <AlertTriangle className="h-10 w-10 text-yellow-500" />
        <p className="font-medium text-sm">No contract is currently loaded. Please upload a contract first.</p>
        <Button onClick={() => router.push('/upload')} className="mt-2 px-4 py-2 text-xs">
          Go to Upload
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto relative min-h-[600px]">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Discrepancy Explorer</h1>
          <p className="text-slate-400 mt-1">Review individual schedule mismatches and durations line-by-line.</p>
        </div>
      </div>

      {/* Filter Chips */}
      <div className="flex flex-wrap gap-2.5">
        {FILTER_TYPES.map((type) => (
          <button
            key={type.value}
            onClick={() => setFilterType(type.value)}
            className={`rounded-xl transition-all duration-200 ${
              filterType === type.value
                ? 'ring-2 ring-teal-accent/60 shadow-md shadow-teal-500/10'
                : 'opacity-70 hover:opacity-100'
            }`}
          >
            <Badge
              status={type.value}
              label={type.label}
              className="px-4 py-2.5 text-xs font-semibold normal-case tracking-normal"
            />
          </button>
        ))}
      </div>

      {/* Main Grid View */}
      {loading ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/40">
                  <th className="px-6 py-4">Airing Date</th>
                  <th className="px-6 py-4">Discrepancy Type</th>
                  <th className="px-6 py-4">Contract Baseline</th>
                  <th className="px-6 py-4">Broadcaster Log</th>
                  <th className="px-6 py-4 text-right">Exposure (PKR)</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {Array.from({ length: 6 }).map((_, i) => (
                  <TableRowSkeleton key={i} columns={6} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : error ? (
        <ErrorBanner>{error}</ErrorBanner>
      ) : discrepancies.length === 0 ? (
        <Card className="p-12 text-center text-slate-400 space-y-2">
          <Info className="h-8 w-8 text-teal-accent mx-auto" />
          <p className="font-semibold text-sm">No discrepancies found in this category.</p>
          <p className="text-xs text-slate-500">Broadcaster logs conform fully for selected filters.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/40">
                  <th className="px-6 py-4">Airing Date</th>
                  <th className="px-6 py-4">Discrepancy Type</th>
                  <th className="px-6 py-4">Contract Baseline</th>
                  <th className="px-6 py-4">Broadcaster Log</th>
                  <th className="px-6 py-4 text-right">Exposure (PKR)</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {discrepancies.map((item) => (
                  <tr 
                    key={item.id}
                    onClick={() => handleRowClick(item.id)}
                    className="hover:bg-slate-900/45 cursor-pointer transition-colors duration-150 group"
                  >
                    <td className="px-6 py-4.5 text-sm font-medium text-slate-300">
                      {item.air_date || 'N/A'}
                    </td>
                    <td className="px-6 py-4.5">
                      <Badge status={item.type} />
                    </td>
                    <td className="px-6 py-4.5 text-xs text-slate-400 truncate max-w-[180px]">
                      {item.expected_value}
                    </td>
                    <td className="px-6 py-4.5 text-xs text-slate-400 truncate max-w-[180px]">
                      {item.actual_value || <span className="text-red-400/80 font-medium">Undelivered</span>}
                    </td>
                    <td className="px-6 py-4.5 text-sm font-extrabold text-white text-right">
                      {item.financial_impact > 0 ? formatPKR(item.financial_impact) : 'Rs. 0'}
                    </td>
                    <td className="px-6 py-4.5 text-slate-500 group-hover:text-teal-accent transition-colors text-right">
                      <ChevronRight className="h-4.5 w-4.5" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Row Detail Slider / Drawer */}
      {selectedId && (
        <>
          {/* Overlay Backdrop */}
          <div 
            onClick={() => setSelectedId(null)}
            className="fixed inset-0 bg-black/55 backdrop-blur-xs z-40 transition-opacity"
          />

          {/* Drawer Body */}
          <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-navy-950 border-l border-slate-800 shadow-2xl flex flex-col justify-between animate-slide-up md:animate-none">
            {/* Header */}
            <div className="p-6 border-b border-slate-850 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">Discrepancy Details</h3>
                <p className="text-xs text-slate-400 mt-0.5">ID: {selectedId}</p>
              </div>
              <Button variant="ghost" onClick={() => setSelectedId(null)} className="p-1">
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Details Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {detailLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-20 w-full rounded-xl" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Skeleton className="h-40 w-full rounded-xl" />
                    <Skeleton className="h-40 w-full rounded-xl" />
                  </div>
                </div>
              ) : detailData ? (
                <>
                  {/* Status Banner */}
                  <div className={`p-4 rounded-xl border flex items-start gap-3
                    ${getBadgeStyle(detailData.discrepancy.type)}
                  `}>
                    <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold uppercase tracking-wider text-xs">
                        {formatTypeName(detailData.discrepancy.type)} Detected
                      </p>
                      <p className="text-xs mt-1 leading-relaxed opacity-90">
                        {detailData.discrepancy.type === 'MISSED' && 'Broadcaster logs contain no record of this contracted spot airing.'}
                        {detailData.discrepancy.type === 'SHORTENED' && `Broadcaster log reported spot aired for ${detailData.discrepancy.actual_value} instead of ${detailData.discrepancy.expected_value}.`}
                        {detailData.discrepancy.type === 'OUT_OF_SLOT' && 'Spot aired outside the contracted time margin tolerance window.'}
                        {detailData.discrepancy.type === 'DUPLICATE_BILLED' && 'Spot aired twice within same log window, triggering double charge.'}
                      </p>
                    </div>
                  </div>

                  {/* Financial Impact */}
                  <div className="p-4 rounded-xl bg-teal-accent/5 border border-teal-500/10 flex justify-between items-center">
                    <div>
                      <p className="text-[10px] text-teal-300 font-semibold uppercase tracking-wider">Financial Exposure</p>
                      <p className="text-2xl font-black text-teal-accent mt-0.5">{formatPKR(detailData.discrepancy.financial_impact)}</p>
                    </div>
                    <div className="p-2 bg-teal-accent/15 rounded-lg text-teal-accent">
                      <Coins className="h-5 w-5" />
                    </div>
                  </div>

                  {/* Comparison cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Contract baseline */}
                    <div className="p-4 bg-slate-900/60 border border-slate-850 rounded-xl space-y-3">
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider pb-2 border-b border-slate-850">
                        <FileText className="h-3.5 w-3.5 text-teal-400" />
                        Contract Baseline
                      </h4>
                      <div className="space-y-2 text-xs">
                        <div>
                          <p className="text-slate-400">Channel</p>
                          <p className="font-semibold text-slate-200 mt-0.5">{detailData.matched_contract_line.channel}</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Scheduled Date</p>
                          <p className="font-semibold text-slate-200 mt-0.5">{detailData.matched_contract_line.air_date || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Spot Duration</p>
                          <p className="font-semibold text-slate-200 mt-0.5">{detailData.matched_contract_line.spot_duration_sec} Seconds</p>
                        </div>
                        <div>
                          <p className="text-slate-400">Contract Rate</p>
                          <p className="font-semibold text-slate-200 mt-0.5">{formatPKR(detailData.matched_contract_line.cost_per_airing)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Broadcaster Log */}
                    <div className="p-4 bg-slate-900/60 border border-slate-850 rounded-xl space-y-3">
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider pb-2 border-b border-slate-850">
                        <Tv className="h-3.5 w-3.5 text-teal-400" />
                        Broadcaster Log
                      </h4>
                      {detailData.broadcast_log ? (
                        <div className="space-y-2 text-xs">
                          <div>
                            <p className="text-slate-400">Aired Channel</p>
                            <p className="font-semibold text-slate-200 mt-0.5">{detailData.broadcast_log.channel}</p>
                          </div>
                          <div>
                            <p className="text-slate-400">Aired Date & Time</p>
                            <p className="font-semibold text-slate-200 mt-0.5">{detailData.broadcast_log.air_date} {detailData.broadcast_log.air_time}</p>
                          </div>
                          <div>
                            <p className="text-slate-400">Aired Duration</p>
                            <p className="font-semibold text-slate-200 mt-0.5">{detailData.broadcast_log.spot_duration_sec} Seconds</p>
                          </div>
                          <div>
                            <p className="text-slate-400">Log Identifier</p>
                            <p className="font-semibold text-slate-200 mt-0.5 truncate">{detailData.broadcast_log.ad_identifier || 'N/A'}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="h-28 flex flex-col items-center justify-center text-center text-slate-500">
                          <AlertTriangle className="h-6 w-6 text-red-500/60 mb-1" />
                          <p className="text-[10px] font-semibold text-slate-400">Log Missing</p>
                          <p className="text-[9px] mt-0.5">No log matches this scheduled slot.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-400 text-center">Failed to load discrepancy details.</p>
              )}
            </div>

            {/* Footer actions */}
            <div className="p-6 border-t border-slate-850 bg-slate-900/30 flex gap-3">
              <Button variant="secondary" onClick={() => setSelectedId(null)} className="flex-1 text-xs">
                Close Details
              </Button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
