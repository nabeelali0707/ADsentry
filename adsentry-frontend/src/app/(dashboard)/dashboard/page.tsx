'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuditStore } from '@/store/useAuditStore';
import { api, formatPKR } from '@/lib/api';
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
        <button 
          onClick={() => router.push('/upload')} 
          className="mt-2 px-4 py-2 bg-teal-accent text-navy-950 rounded-xl font-semibold text-xs"
        >
          Go to Upload
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-teal-accent gap-3">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="text-sm font-medium tracking-wide">Aggregating Compliance Metrics...</span>
      </div>
    );
  }

  if (error || !dashboardData) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-center">
        {error || 'Failed to display dashboard.'}
      </div>
    );
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
        <button 
          onClick={fetchDashboardData}
          className="p-2.5 rounded-xl border border-slate-800 hover:border-teal-accent/30 hover:bg-slate-900 text-slate-400 hover:text-white transition-all duration-200"
        >
          <RefreshCw className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* Headline Compliance Ring & Status Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Compliance Gauge */}
        <div className={`glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col items-center justify-center text-center relative overflow-hidden ${statusStyle.bgGlow}`}>
          {/* Subtle status colored glow dot */}
          <div className="absolute top-4 right-4 flex items-center gap-1.5">
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${statusStyle.color}`}>
              {statusStyle.label}
            </span>
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
        </div>

        {/* KPI Cards Area */}
        <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
          
          <div className="glass-card p-6 rounded-2xl border border-slate-800 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Delivered Airings</p>
                <h3 className="text-3xl font-black text-white mt-1.5">{kpi_cards.total_delivered}</h3>
              </div>
              <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20">
                <CheckCircle className="h-5 w-5" />
              </div>
            </div>
            <div className="text-xs text-slate-400 mt-4 border-t border-slate-850 pt-3">
              Out of <span className="text-white font-semibold">{activeContract.contracted_airings}</span> spots scheduled in media contract.
            </div>
          </div>

          <div className="glass-card p-6 rounded-2xl border border-slate-800 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Missed Airings</p>
                <h3 className="text-3xl font-black text-red-400 mt-1.5">{kpi_cards.total_missed}</h3>
              </div>
              <div className="p-2.5 bg-red-500/10 rounded-xl text-red-400 border border-red-500/20">
                <AlertTriangle className="h-5 w-5" />
              </div>
            </div>
            <div className="text-xs text-slate-400 mt-4 border-t border-slate-850 pt-3">
              Spots that completely failed to broadcast on log records.
            </div>
          </div>

          <div className="glass-card p-6 rounded-2xl border border-slate-800 flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Shortened Spots</p>
                <h3 className="text-3xl font-black text-teal-400 mt-1.5">{kpi_cards.total_shortened}</h3>
              </div>
              <div className="p-2.5 bg-teal-500/10 rounded-xl text-teal-400 border border-teal-500/20">
                <RefreshCw className="h-5 w-5" />
              </div>
            </div>
            <div className="text-xs text-slate-400 mt-4 border-t border-slate-850 pt-3">
              Spots that aired below contracted duration.
            </div>
          </div>

          <div className="glass-card p-6 rounded-2xl border border-slate-800 flex flex-col justify-between bg-gradient-to-br from-teal-500/5 to-transparent">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-semibold text-teal-400 uppercase tracking-wider">Estimated Overpayment</p>
                <h3 className="text-3xl font-black text-teal-accent mt-1.5">{formatPKR(kpi_cards.estimated_overpayment)}</h3>
              </div>
              <div className="p-2.5 bg-teal-accent/15 rounded-xl text-teal-accent border border-teal-500/20">
                <Coins className="h-5 w-5" />
              </div>
            </div>
            <div className="text-xs text-teal-400/80 mt-4 border-t border-slate-850 pt-3 font-medium">
              Recoverable exposure computed from media cost audits.
            </div>
          </div>

        </div>
      </div>

      {/* Recharts Graphical Dashboards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Weekly Trend Line Chart */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <h3 className="text-md font-bold text-white flex items-center gap-2">
            <TrendingUp className="h-4.5 w-4.5 text-teal-accent" />
            Compliance Weekly Trend
          </h3>
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
        </div>

        {/* Channel Breakdown Bar Chart */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <h3 className="text-md font-bold text-white flex items-center gap-2">
            <Tv className="h-4.5 w-4.5 text-teal-accent" />
            Compliance Rate By Channel
          </h3>
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
        </div>

      </div>
    </div>
  );
}
