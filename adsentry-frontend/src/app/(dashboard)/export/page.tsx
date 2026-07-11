'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuditStore } from '@/store/useAuditStore';
import { api, formatPKR, Discrepancy } from '@/lib/api';
import { 
  AlertTriangle, 
  Download, 
  FileText, 
  CheckCircle2, 
  Printer, 
  Eye, 
  FileSpreadsheet,
  Clock,
  RefreshCw,
  Building,
  Tv
} from 'lucide-react';

export default function ExportPage() {
  const router = useRouter();
  const { activeContract, activeReport, setReport } = useAuditStore();

  const [loading, setLoading] = useState(true);
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([]);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [reportStatus, setReportStatus] = useState<'DRAFT' | 'FINAL' | 'EXPORTED'>('DRAFT');
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState('');

  const fetchExportPreview = async () => {
    if (!activeContract) return;
    setLoading(true);
    setError('');
    try {
      const list = await api.listDiscrepancies(activeContract.id);
      setDiscrepancies(list);
      if (activeReport) {
        setReportStatus(activeReport.status);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load preview details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExportPreview();
  }, [activeContract, activeReport]);

  const handleExportPdf = async () => {
    if (!activeContract || !activeReport) return;
    setExportingPdf(true);
    setSuccessMsg('');
    try {
      const res = await api.exportPdf(activeContract.id);
      
      // Update report status locally
      const updatedReport = { ...activeReport, status: 'EXPORTED' as const };
      setReport(updatedReport);
      setReportStatus('EXPORTED');

      setSuccessMsg('PDF Audit Report exported successfully! Ready for Dispute Resolution.');
      setTimeout(() => setSuccessMsg(''), 5000);
      
      // Simulate file download opening
      window.open(res.download_url, '_blank');
    } catch (err) {
      console.error(err);
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportXlsx = async () => {
    if (!activeContract || !activeReport) return;
    setExportingXlsx(true);
    setSuccessMsg('');
    try {
      const res = await api.exportXlsx(activeContract.id);
      
      // Update report status locally
      const updatedReport = { ...activeReport, status: 'EXPORTED' as const };
      setReport(updatedReport);
      setReportStatus('EXPORTED');

      setSuccessMsg('Excel Spreadsheet exported successfully! Line items saved.');
      setTimeout(() => setSuccessMsg(''), 5000);

      // Simulate file download opening
      window.open(res.download_url, '_blank');
    } catch (err) {
      console.error(err);
    } finally {
      setExportingXlsx(false);
    }
  };

  if (!activeContract || !activeReport) {
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
        <span className="text-sm font-medium tracking-wide">Compiling Print-ready Audit Formats...</span>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'EXPORTED':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'FINAL':
        return 'text-teal-400 bg-teal-500/10 border-teal-500/20';
      case 'DRAFT':
      default:
        return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
            Export Report
          </h1>
          <p className="text-slate-400 mt-1">Generate final deliverables for broadcaster dispute resolution or legal audits.</p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleExportXlsx}
            disabled={exportingPdf || exportingXlsx}
            className="px-5 py-2.5 bg-slate-900 border border-slate-850 hover:bg-slate-800 text-slate-350 hover:text-white font-semibold text-xs rounded-xl flex items-center gap-2 transition-all disabled:opacity-50"
          >
            {exportingXlsx ? (
              <span className="h-4.5 w-4.5 animate-spin rounded-full border-2 border-slate-500 border-t-transparent"></span>
            ) : (
              <FileSpreadsheet className="h-4.5 w-4.5" />
            )}
            Export Excel
          </button>
          
          <button
            onClick={handleExportPdf}
            disabled={exportingPdf || exportingXlsx}
            className="px-6 py-2.5 bg-gradient-to-r from-teal-accent to-emerald-accent text-navy-950 font-bold text-xs rounded-xl flex items-center gap-2 shadow-lg shadow-teal-500/10 active:scale-[0.99] transition-all disabled:opacity-50"
          >
            {exportingPdf ? (
              <span className="h-4.5 w-4.5 animate-spin rounded-full border-2 border-navy-950 border-t-transparent"></span>
            ) : (
              <Download className="h-4.5 w-4.5" />
            )}
            Download PDF Report
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">{successMsg}</p>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-center">
          {error}
        </div>
      )}

      {/* Main Preview Container */}
      <div className="space-y-6">
        {/* Status indicator bar */}
        <div className="glass-panel p-4 rounded-2xl border border-slate-800 flex justify-between items-center text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Audit State Status:</span>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${getStatusBadge(reportStatus)}`}>
              {reportStatus}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-500">
            <Clock className="h-4 w-4" />
            <span>Generated: {new Date(activeReport.generated_date).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}</span>
          </div>
        </div>

        {/* Print-ready Report Sheet */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden text-slate-300">
          
          {/* Header invoice details */}
          <div className="p-8 border-b border-slate-800 bg-slate-950/65 flex flex-col sm:flex-row justify-between gap-6">
            <div className="space-y-2">
              <span className="text-2xl font-black text-white tracking-tight">
                AdSentry <span className="text-teal-accent">AI</span>
              </span>
              <p className="text-xs text-slate-450 uppercase tracking-widest font-semibold">Media Audit Compliance Certificate</p>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 pt-2">
                <Building className="h-4 w-4 text-teal-accent" />
                <span>Audited for: <strong>{activeContract.brand_name}</strong></span>
              </div>
            </div>
            
            <div className="text-left sm:text-right space-y-1 text-xs">
              <p className="text-slate-400">Report Reference: <span className="text-white font-semibold">AS-{activeContract.id.substring(0,8).toUpperCase()}</span></p>
              <p className="text-slate-400">Date Range: <span className="text-white font-semibold">{activeContract.start_date} to {activeContract.end_date}</span></p>
              <p className="text-slate-400">Contracted Spots: <span className="text-white font-semibold">{activeContract.contracted_airings}</span></p>
            </div>
          </div>

          {/* Audit Narrative Summary */}
          <div className="p-8 border-b border-slate-800 space-y-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Executive Summary</h3>
            <p className="text-xs text-slate-350 leading-relaxed bg-slate-950/30 p-4 rounded-xl border border-slate-850">
              {activeReport.ai_summary_text}
            </p>
          </div>

          {/* KPI rollup values */}
          <div className="p-8 border-b border-slate-800 grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-[10px] text-slate-450 uppercase tracking-widest font-semibold">Compliance Rate</p>
              <p className="text-2xl font-black text-white mt-1">{activeReport.compliance_rate}%</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-450 uppercase tracking-widest font-semibold font-semibold">Delivered Airings</p>
              <p className="text-2xl font-black text-white mt-1">111 / {activeContract.contracted_airings}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-450 uppercase tracking-widest font-semibold">Total Discrepancies</p>
              <p className="text-2xl font-black text-red-400 mt-1">{discrepancies.length}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-450 uppercase tracking-widest font-semibold">Estimated Overpayment</p>
              <p className="text-2xl font-black text-teal-accent mt-1">{formatPKR(activeReport.total_overpayment)}</p>
            </div>
          </div>

          {/* Mini table of discrepancies */}
          <div className="p-8 space-y-4">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Audited Airing Deviations (First 5 Rows)</h3>
            <div className="border border-slate-850 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950/40 text-slate-400 font-semibold border-b border-slate-850">
                    <th className="px-4 py-3">Airing Date</th>
                    <th className="px-4 py-3">Deviation Type</th>
                    <th className="px-4 py-3">Expected Value</th>
                    <th className="px-4 py-3">Actual Value</th>
                    <th className="px-4 py-3 text-right">Exposure (PKR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {discrepancies.slice(0, 5).map((item) => (
                    <tr key={item.id} className="hover:bg-slate-900/10">
                      <td className="px-4 py-3 text-slate-350">{item.air_date || 'N/A'}</td>
                      <td className="px-4 py-3 font-semibold text-slate-200">{item.type.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-3 text-slate-400">{item.expected_value}</td>
                      <td className="px-4 py-3 text-slate-400">{item.actual_value || 'Undelivered'}</td>
                      <td className="px-4 py-3 font-bold text-white text-right">{formatPKR(item.financial_impact)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
