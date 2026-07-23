'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuditStore } from '@/store/useAuditStore';
import { api, formatPKR, Discrepancy } from '@/lib/api';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import ErrorBanner from '@/components/ui/ErrorBanner';
import {
  AlertTriangle,
  Download,
  FileText,
  CheckCircle2,
  Printer,
  Eye,
  FileSpreadsheet,
  Clock,
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
  const [markingFinal, setMarkingFinal] = useState(false);
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

      // Download: use blob URL for real backend; mock opens a data URL
      if (res.download_url && res.download_url !== '#pdf-download') {
        const link = document.createElement('a');
        link.href = res.download_url;
        link.download = `adsentry-audit-${activeContract.id.slice(0, 8)}.pdf`;
        link.click();
      } else {
        // Mock mode: generate a placeholder text file as download
        const mockContent = `ADsentry Audit Report\n${activeContract.brand_name} - ${activeContract.campaign_name}\nCompliance Rate: ${activeReport.compliance_rate}%\nTotal Overpayment: Rs. ${activeReport.total_overpayment.toLocaleString()}\n\n[Full report available after backend connection]`;
        const blob = new Blob([mockContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `adsentry-audit-preview-${activeContract.id.slice(0, 8)}.txt`;
        link.click();
        URL.revokeObjectURL(url);
      }
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
      
      const updatedReport = { ...activeReport, status: 'EXPORTED' as const };
      setReport(updatedReport);
      setReportStatus('EXPORTED');
      setSuccessMsg('Excel Spreadsheet exported successfully! Line items saved.');
      setTimeout(() => setSuccessMsg(''), 5000);

      if (res.download_url && res.download_url !== '#xlsx-download') {
        const link = document.createElement('a');
        link.href = res.download_url;
        link.download = `adsentry-audit-${activeContract.id.slice(0, 8)}.xlsx`;
        link.click();
      } else {
        // Mock mode: generate CSV as download
        const headers = 'Type,Date,Channel,Expected,Actual,Financial Impact';
        const rows = discrepancies.map(d =>
          `${d.type},${d.air_date || ''},${d.channel || ''},"${d.expected_value}","${d.actual_value || 'Undelivered'}",${d.financial_impact}`
        ).join('\n');
        const blob = new Blob([headers + '\n' + rows], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `adsentry-discrepancies-${activeContract.id.slice(0, 8)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setExportingXlsx(false);
    }
  };

  /** 4.7 PRD: Report Status Badge — DRAFT → FINAL → EXPORTED */
  const handleMarkFinal = async () => {
    if (!activeReport) return;
    setMarkingFinal(true);
    try {
      // Optimistic update
      const updatedReport = { ...activeReport, status: 'FINAL' as const };
      setReport(updatedReport);
      setReportStatus('FINAL');
      setSuccessMsg('Report marked as FINAL. Ready to export.');
      setTimeout(() => setSuccessMsg(''), 4000);
    } finally {
      setMarkingFinal(false);
    }
  };

  if (!activeContract || !activeReport) {
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
      <div className="space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-14 rounded-2xl" />
        <Skeleton className="h-[600px] rounded-2xl" />
      </div>
    );
  }

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
        <div className="flex gap-3 flex-wrap">
          {/* 4.7 PRD: Mark as Final button — DRAFT → FINAL status transition */}
          {reportStatus === 'DRAFT' && (
            <Button
              variant="secondary"
              onClick={handleMarkFinal}
              disabled={exportingPdf || exportingXlsx}
              loading={markingFinal}
              className="text-xs"
            >
              {!markingFinal && <CheckCircle2 className="h-4.5 w-4.5" />}
              Mark as Final
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={handleExportXlsx}
            disabled={exportingPdf || markingFinal}
            loading={exportingXlsx}
            className="text-xs"
          >
            {!exportingXlsx && <FileSpreadsheet className="h-4.5 w-4.5" />}
            Export Excel
          </Button>

          <Button
            variant="primary"
            onClick={handleExportPdf}
            disabled={exportingXlsx || markingFinal}
            loading={exportingPdf}
            className="text-xs px-6"
          >
            {!exportingPdf && <Download className="h-4.5 w-4.5" />}
            Download PDF Report
          </Button>
        </div>
      </div>

      {successMsg && (
        <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">{successMsg}</p>
        </div>
      )}

      <ErrorBanner>{error}</ErrorBanner>

      {/* Main Preview Container */}
      <div className="space-y-6">
        {/* Status indicator bar */}
        <Card className="p-4 flex justify-between items-center text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Audit State Status:</span>
            <Badge status={reportStatus} />
          </div>
          <div className="flex items-center gap-1.5 text-slate-500">
            <Clock className="h-4 w-4" />
            <span>Generated: {new Date(activeReport.generated_date).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}</span>
          </div>
        </Card>

        {/* Print-ready Report Sheet */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden text-slate-300">
          
          {/* Header invoice details */}
          <div className="p-8 border-b border-slate-800 bg-slate-950/65 flex flex-col sm:flex-row justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-block bg-white rounded-xl p-2">
                <img src="/logo-full.png" alt="AdSentry AI" className="h-7 w-auto" />
              </div>
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
              <p className="text-2xl font-black text-white mt-1">{activeReport.total_delivered ?? activeContract.contracted_airings} / {activeContract.contracted_airings}</p>
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

          {/* Mini table of discrepancies — ALL rows (4.7 PRD) */}
          <div className="p-8 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Audited Airing Deviations</h3>
              <span className="text-[10px] text-slate-500 font-semibold">{discrepancies.length} total discrepanc{discrepancies.length !== 1 ? 'ies' : 'y'}</span>
            </div>
            <div className="border border-slate-850 rounded-xl overflow-hidden max-h-[400px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0">
                  <tr className="bg-slate-950/90 text-slate-400 font-semibold border-b border-slate-850">
                    <th className="px-4 py-3">Airing Date</th>
                    <th className="px-4 py-3">Deviation Type</th>
                    <th className="px-4 py-3">Expected Value</th>
                    <th className="px-4 py-3">Actual Value</th>
                    <th className="px-4 py-3 text-right">Exposure (PKR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {discrepancies.map((item) => (
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
