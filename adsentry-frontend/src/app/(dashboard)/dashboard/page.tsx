'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuditStore } from '@/store/useAuditStore';
import { api, formatPKR } from '@/lib/api';
import Button from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Skeleton, StatCardSkeleton } from '@/components/ui/Skeleton';
import Badge from '@/components/ui/Badge';
import ErrorBanner from '@/components/ui/ErrorBanner';
import {
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { 
  TrendingUp, 
  AlertTriangle, 
  ShieldCheck, 
  HelpCircle, 
  Tv, 
  DollarSign, 
  CheckCircle,
  FileCheck2,
  Percent,
  RefreshCw,
  Coins
} from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const { activeContract, activeReport } = useAuditStore();

  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [error, setError] = useState('');

  const fetchDashboardData = async () => {
    if (!activeContract) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.getDashboard(activeContract.id);
      setDashboardData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [activeContract, activeReport]);

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

  if (loading) {
    return (
      <div className="space-y-8 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Skeleton className="h-64 rounded-2xl" />
          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <StatCardSkeleton key={i} />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !dashboardData) {
    return <ErrorBanner>{error || 'Failed to display dashboard.'}</ErrorBanner>;
  }

  const { compliance_ring, kpi_cards, weekly_trend, channel_breakdown } = dashboardData;

  // Compute status colors
  const getStatusDetails = (status: string) => {
    switch (status) {
      case 'COMPLIANT':
        return {
          label: 'Compliant',
          color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
          ringColor: '#10b981',
          bgGlow: 'shadow-[0_0_20px_rgba(16,185,129,0.15)]',
        };
      case 'MINOR_DEVIATION':
        return {
          label: 'Minor Deviation',
          color: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
          ringColor: '#14b8a6',
          bgGlow: 'shadow-[0_0_20px_rgba(20,184,166,0.15)]',
        };
      case 'MAJOR_BREACH':
      default:
        return {
          label: 'Major Breach',
          color: 'text-red-400 bg-red-500/10 border-red-500/20',
          ringColor: '#ef4444',
          bgGlow: 'shadow-[0_0_20px_rgba(239,68,68,0.15)]',
        };
    }
  };

  const statusStyle = getStatusDetails(compliance_ring.status);

  // SVG parameters for the Compliance Ring circular gauge
  const radius = 50;
  const strokeWidth = 8;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (compliance_ring.rate / 100) * circumference;

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Compliance Dashboard</h1>
          <p className="text-slate-400 mt-1">
            Campaign: <span className="text-white font-semibold">{activeContract.campaign_name}</span> ({activeContract.brand_name})
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={fetchDashboardData}
          className="p-2.5 rounded-xl border border-slate-800"
        >
          <RefreshCw className="h-4.5 w-4.5" />
        </Button>
      </div>

      {/* Headline Compliance Ring & Status Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

        {/* Compliance Gauge */}
        <Card className={`p-6 flex flex-col items-center justify-center text-center relative overflow-hidden ${statusStyle.bgGlow}`}>
          {/* Subtle status colored glow dot */}
          <div className="absolute top-4 right-4 flex items-center gap-1.5">
            <Badge status={compliance_ring.status} label={statusStyle.label} />
          </div>

          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Compliance Score</p>
          
          <div className="relative flex items-center justify-center w-36 h-36">
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="72"
                cy="72"
                r={radius}
                className="stroke-slate-800"
                strokeWidth={strokeWidth}
                fill="transparent"
              />
              <circle
                cx="72"
                cy="72"
                r={radius}
                stroke={statusStyle.ringColor}
                strokeWidth={strokeWidth}
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
              <span className="text-3xl font-black text-white">{compliance_ring.rate}%</span>
              <span className="text-[10px] text-slate-500 font-semibold mt-0.5">Threshold {activeContract.compliance_threshold_pct}%</span>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-4 leading-relaxed">
            {compliance_ring.rate >= activeContract.compliance_threshold_pct 
              ? 'Campaign meets the contracted compliance threshold guidelines.' 
              : 'Compliance falls below tolerance. Recoup claims are recommended.'}
          </p>
        </Card>

        {/* KPI Cards Area */}
        <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">

          <StatCard
            label="Delivered Airings"
            value={kpi_cards.total_delivered}
            icon={CheckCircle}
            tone="success"
            description={<>Out of <span className="text-white font-semibold">{activeContract.contracted_airings}</span> spots scheduled in media contract.</>}
          />

          <StatCard
            label="Missed Airings"
            value={kpi_cards.total_missed}
            icon={AlertTriangle}
            tone="danger"
            description="Spots that completely failed to broadcast on log records."
          />

          <StatCard
            label="Shortened Spots"
            value={kpi_cards.total_shortened}
            icon={RefreshCw}
            tone="accent"
            description="Spots that aired below contracted duration."
          />

          <StatCard
            label="Estimated Overpayment"
            value={formatPKR(kpi_cards.estimated_overpayment)}
            icon={Coins}
            tone="accent"
            description="Recoverable exposure computed from media cost audits."
            className="bg-gradient-to-br from-teal-500/5 to-transparent"
          />

        </div>
      </div>

      {/* Recharts Graphical Dashboards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Weekly Trend Line Chart */}
        <Card className="p-6 space-y-4">
          <CardTitle className="text-md">
            <TrendingUp className="h-4.5 w-4.5 text-teal-accent" />
            Compliance Weekly Trend
          </CardTitle>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weekly_trend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="week_start" stroke="#64748b" style={{ fontSize: '11px' }} />
                <YAxis domain={[70, 100]} stroke="#64748b" style={{ fontSize: '11px' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0b1329', borderColor: '#1e293b', borderRadius: '12px', color: '#fff' }}
                  labelClassName="text-slate-400 text-xs font-semibold"
                  itemStyle={{ fontSize: '12px', color: '#14b8a6' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="compliance_rate" 
                  stroke="#14b8a6" 
                  strokeWidth={3} 
                  dot={{ r: 4, stroke: '#050811', strokeWidth: 2, fill: '#14b8a6' }}
                  activeDot={{ r: 6 }} 
                  name="Compliance Rate (%)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Channel Breakdown Bar Chart */}
        <Card className="p-6 space-y-4">
          <CardTitle className="text-md">
            <Tv className="h-4.5 w-4.5 text-teal-accent" />
            Compliance Rate By Channel
          </CardTitle>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={channel_breakdown} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="channel" stroke="#64748b" style={{ fontSize: '11px' }} />
                <YAxis domain={[0, 100]} stroke="#64748b" style={{ fontSize: '11px' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0b1329', borderColor: '#1e293b', borderRadius: '12px', color: '#fff' }}
                  labelClassName="text-slate-400 text-xs font-semibold"
                  itemStyle={{ fontSize: '12px', color: '#10b981' }}
                />
                <Bar dataKey="compliance_rate" fill="#10b981" radius={[8, 8, 0, 0]} maxBarSize={60} name="Compliance Rate (%)">
                  {channel_breakdown.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.compliance_rate >= activeContract.compliance_threshold_pct ? '#10b981' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

      </div>
    </div>
  );
}
