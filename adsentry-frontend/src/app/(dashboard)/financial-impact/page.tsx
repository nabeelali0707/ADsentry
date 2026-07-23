'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuditStore } from '@/store/useAuditStore';
import { api, formatPKR } from '@/lib/api';
import Button from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import ErrorBanner from '@/components/ui/ErrorBanner';
import {
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { 
  AlertTriangle, 
  Coins, 
  TrendingDown, 
  FileText, 
  HelpCircle,
  Percent,
  RefreshCw,
  ArrowRight,
  Calculator,
  Info,
  Tv
} from 'lucide-react';

export default function FinancialImpactPage() {
  const router = useRouter();
  const { activeContract, activeReport } = useAuditStore();

  const [loading, setLoading] = useState(true);
  const [financialData, setFinancialData] = useState<any>(null);
  const [error, setError] = useState('');

  const fetchFinancialData = async () => {
    if (!activeContract) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.getFinancialImpact(activeContract.id);
      setFinancialData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load financial impact data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFinancialData();
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
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl md:col-span-2" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !financialData) {
    return <ErrorBanner>{error}</ErrorBanner>;
  }

  const { total_overpayment, loss_by_type, loss_by_channel } = financialData;

  const COLORS = ['#ef4444', '#f59e0b', '#14b8a6', '#a855f7'];

  // Map types to friendly names
  const formatTypeName = (type: string) => {
    return type.replace(/_/g, ' ');
  };

  // Convert to chart friendly data
  const pieData = loss_by_type.map((item: any, index: number) => ({
    name: formatTypeName(item.type),
    value: item.financial_impact,
    color: COLORS[index % COLORS.length],
  }));

  // Calculations for proportions
  const contractValue = activeContract.total_contract_value || 1;
  const exposurePct = ((total_overpayment / contractValue) * 100).toFixed(2);

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Financial Impact Analysis</h1>
          <p className="text-slate-400 mt-1">Audit the financial losses and overpayments from broadcaster discrepancies.</p>
        </div>
        <Button variant="ghost" onClick={fetchFinancialData} className="p-2.5 rounded-xl border border-slate-800">
          <RefreshCw className="h-4.5 w-4.5" />
        </Button>
      </div>

      {/* Main Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

        {/* Total Overpayment Summary Card */}
        <Card className="p-6 flex flex-col justify-between bg-gradient-to-br from-teal-500/5 to-transparent relative overflow-hidden">
          <div className="absolute -top-12 -left-12 w-24 h-24 bg-teal-accent/5 rounded-full blur-2xl"></div>
          <div>
            <p className="text-xs font-semibold text-teal-400 uppercase tracking-wider">Total Overpayment Exposure</p>
            <h3 className="text-4.5xl font-black text-teal-accent mt-3 select-all leading-none">{formatPKR(total_overpayment)}</h3>
            <p className="text-xs text-slate-400 mt-2">Recoverable media value from audits.</p>
          </div>
          <div className="mt-8 border-t border-slate-800/60 pt-4 space-y-2.5 text-xs text-slate-400">
            <div className="flex justify-between">
              <span>Total Contract Value:</span>
              <span className="text-slate-200 font-semibold">{formatPKR(contractValue)}</span>
            </div>
            <div className="flex justify-between">
              <span>Exposure Percentage:</span>
              <span className="text-teal-400 font-bold">{exposurePct}%</span>
            </div>
          </div>
        </Card>

        {/* Audit Rationale Cards */}
        <Card className="md:col-span-2 p-6 space-y-4">
          <CardTitle className="text-md pb-3 border-b border-slate-800">
            <Calculator className="h-4.5 w-4.5 text-teal-accent" />
            Financial Audit Calculation Formula
          </CardTitle>

          <div className="space-y-4 text-xs leading-relaxed text-slate-400">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3 bg-slate-900 border border-slate-850 rounded-xl">
                <p className="font-semibold text-white">Missed / Out of Slot / Duplicate</p>
                <p className="mt-1 text-[11px]">Billed at <span className="text-teal-accent font-medium">100% of cost per airing</span> (Rs. {activeContract.cost_per_airing.toLocaleString()} per spot) as value is undelivered or breached.</p>
              </div>
              <div className="p-3 bg-slate-900 border border-slate-850 rounded-xl">
                <p className="font-semibold text-white">Shortened Airings</p>
                <p className="mt-1 text-[11px]">Billed at a <span className="text-teal-accent font-medium">pro-rated fraction</span>: (contracted duration - actual duration) / contracted duration * cost per airing.</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 p-3 bg-teal-accent/5 border border-teal-500/10 rounded-xl text-[11px] text-teal-300">
              <Info className="h-4 w-4 shrink-0 text-teal-accent" />
              <span>These calculations are backed by local advertising guidelines and legal dispute precedents.</span>
            </div>
          </div>
        </Card>

      </div>

      {/* Visual Loss Breakdown Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Loss by Type Donut/Pie Chart */}
        <Card className="p-6 space-y-6">
          <CardTitle className="text-md">
            <TrendingDown className="h-4.5 w-4.5 text-teal-accent" />
            Exposure By Discrepancy Type
          </CardTitle>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="h-56 w-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0b1329', borderColor: '#1e293b', borderRadius: '12px', color: '#fff' }}
                    itemStyle={{ fontSize: '12px' }}
                    formatter={(value: any) => [formatPKR(Number(value)), 'Loss']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Legend checklist */}
            <div className="flex-1 space-y-3 w-full">
              {pieData.map((item: any) => {
                const pct = ((item.value / total_overpayment) * 100).toFixed(1);
                return (
                  <div key={item.name} className="flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="font-semibold text-slate-300">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-white">{formatPKR(item.value)}</p>
                      <p className="text-[10px] text-slate-500 font-semibold">{pct}%</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        {/* Loss by Channel Bar Chart */}
        <Card className="p-6 space-y-4">
          <CardTitle className="text-md">
            <Tv className="h-4.5 w-4.5 text-teal-accent" />
            Exposure By Broadcast Channel
          </CardTitle>
          <div className="h-56 w-full flex items-center">
            <ResponsiveContainer width="100%" height="90%">
              <BarChart data={loss_by_channel} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="channel" stroke="#64748b" style={{ fontSize: '11px' }} />
                <YAxis stroke="#64748b" style={{ fontSize: '11px' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0b1329', borderColor: '#1e293b', borderRadius: '12px', color: '#fff' }}
                  itemStyle={{ fontSize: '12px', color: '#14b8a6' }}
                  formatter={(value: any) => [formatPKR(Number(value)), 'Exposure']}
                />
                <Bar dataKey="financial_impact" fill="#14b8a6" radius={[6, 6, 0, 0]} maxBarSize={50} name="Exposure">
                  {loss_by_channel.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
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
