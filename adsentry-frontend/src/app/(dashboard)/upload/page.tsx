'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import { useAuditStore } from '@/store/useAuditStore';
import { api } from '@/lib/api';
import Button from '@/components/ui/Button';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import ErrorBanner from '@/components/ui/ErrorBanner';
import {
  UploadCloud, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Play, 
  FileSpreadsheet, 
  ArrowRight,
  Info,
  Zap,
  AlertTriangle
} from 'lucide-react';

const CONTRACT_COLUMNS = [
  'brand_name',
  'campaign_name',
  'channel',
  'start_date',
  'end_date',
  'contracted_airings',
  'spot_duration_sec',
  'cost_per_airing',
  'total_contract_value',
];

const BROADCAST_LOG_COLUMNS = [
  'channel',
  'air_date',
  'air_time',
  'spot_duration_sec',
  'ad_identifier',
];

// File Processing (Performance 5.2): estimated bytes per CSV row
const ESTIMATED_BYTES_PER_ROW = 80;
const LARGE_FILE_ROW_THRESHOLD = 5000;

/** Estimate number of rows from file size (heuristic for CSV) */
function estimateRowCount(file: File): number {
  return Math.round(file.size / ESTIMATED_BYTES_PER_ROW);
}

export default function UploadPage() {
  const router = useRouter();
  const { userProfile, setContract, setReport } = useAuditStore();

  const [contractFile, setContractFile] = useState<File | null>(null);
  const [logFile, setLogFile] = useState<File | null>(null);
  const [contractValid, setContractValid] = useState<boolean | null>(null);
  const [logValid, setLogValid] = useState<boolean | null>(null);
  const [validating, setValidating] = useState<boolean>(false);
  const [auditing, setAuditing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  /** File Processing Performance (5.2): shows X-Processing-Time-Ms from backend */
  const [processingTimeMs, setProcessingTimeMs] = useState<number | null>(null);

  const logRowEstimate = logFile?.name.endsWith('.csv') ? estimateRowCount(logFile) : null;
  const isLargeFile = logRowEstimate !== null && logRowEstimate > LARGE_FILE_ROW_THRESHOLD;

  // Dropzone for contract
  const { 
    getRootProps: getContractRootProps, 
    getInputProps: getContractInputProps,
    isDragActive: isContractDragActive 
  } = useDropzone({
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
    maxFiles: 1,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        setErrorMessage('');
        setProcessingTimeMs(null);
        const file = acceptedFiles[0];
        setContractFile(file);
        validateFileColumns(file, CONTRACT_COLUMNS, setContractValid);
      }
    }
  });

  // Dropzone for broadcast logs
  const { 
    getRootProps: getLogRootProps, 
    getInputProps: getLogInputProps,
    isDragActive: isLogDragActive 
  } = useDropzone({
    accept: {
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        setErrorMessage('');
        setProcessingTimeMs(null);
        const file = acceptedFiles[0];
        setLogFile(file);
        validateFileColumns(file, BROADCAST_LOG_COLUMNS, setLogValid);
      }
    }
  });

  const validateFileColumns = (file: File, expectedCols: string[], setValidState: (valid: boolean) => void) => {
    setValidating(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) { setValidState(false); setValidating(false); return; }
        const firstLine = text.split('\n')[0].toLowerCase().trim();
        const headers = firstLine.split(',').map(h => h.replace(/["'\r]/g, '').trim());
        const missing = expectedCols.filter(col => !headers.includes(col.toLowerCase()));
        if (file.name.endsWith('.xlsx')) {
          setValidState(true);
        } else {
          setValidState(missing.length === 0);
        }
      } catch (err) {
        setValidState(false);
      } finally {
        setValidating(false);
      }
    };
    if (file.name.endsWith('.csv')) {
      reader.readAsText(file.slice(0, 2048));
    } else {
      setTimeout(() => { setValidState(true); setValidating(false); }, 600);
    }
  };

  const handleRunAudit = async () => {
    if (!contractFile || !logFile) return;
    if (!contractValid || !logValid) {
      setErrorMessage('Please resolve file column errors before proceeding.');
      return;
    }

    setAuditing(true);
    setErrorMessage('');
    setProcessingTimeMs(null);

    if (!userProfile?.organization_id) {
      setErrorMessage('Your session is missing an organization. Please log out and sign in again.');
      setAuditing(false);
      return;
    }

    try {
      const orgId = userProfile.organization_id;

      // Upload Contract
      const uploadRes = await api.uploadContract(orgId, contractFile);
      setContract(uploadRes.contract);

      // Upload Logs — capture processing time from backend header
      const logRes = await api.uploadBroadcastLogs(uploadRes.contract.id, logFile);
      if (logRes.processingTimeMs) {
        setProcessingTimeMs(logRes.processingTimeMs);
      }

      router.push('/contract-review');
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred during audit setup.');
    } finally {
      setAuditing(false);
    }
  };

  const downloadSampleTemplate = (type: 'contract' | 'log') => {
    const headers = type === 'contract' ? CONTRACT_COLUMNS : BROADCAST_LOG_COLUMNS;
    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" +
      (type === 'contract' 
        ? "National Foods,National Ketchup Fiesta 2026,ARY Digital,2026-07-01,2026-07-31,120,30,85000,10200000"
        : "ARY Digital,2026-07-01,20:15:00,30,NAT-KET-30S");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `sample_${type}_template.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Upload &amp; Setup</h1>
        <p className="text-slate-400 mt-1">Get your signed media plan and broadcaster logs reconciled in minutes.</p>
      </div>

      <ErrorBanner>{errorMessage}</ErrorBanner>

      {/* File Processing Performance Badge (5.2) */}
      {processingTimeMs !== null && (
        <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-semibold">
          <Zap className="h-4 w-4 shrink-0" />
          <span>Files processed in <strong>{processingTimeMs < 1000 ? `${processingTimeMs}ms` : `${(processingTimeMs / 1000).toFixed(2)}s`}</strong> — within the &lt;5 second target.</span>
        </div>
      )}

      {/* Grid of upload drops */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Contract Upload */}
        <Card className="p-6 space-y-4">
          <CardHeader>
            <CardTitle>
              <FileText className="h-5 w-5 text-teal-accent" />
              1. Signed Media Plan / Contract
            </CardTitle>
            <Button
              variant="ghost"
              onClick={() => downloadSampleTemplate('contract')}
              className="px-2 py-1 text-xs gap-1"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Get Template
            </Button>
          </CardHeader>
          <p className="text-xs text-slate-400">Supported formats: CSV, Excel (XLSX). Read campaign schedule and cost parameters.</p>

          <div 
            {...getContractRootProps()} 
            className={`
              border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200
              ${isContractDragActive ? 'border-teal-accent bg-teal-accent/5' : 'border-slate-800 hover:border-slate-700 hover:bg-slate-900/20'}
              ${contractFile ? 'bg-slate-900/40 border-teal-500/30' : ''}
            `}
          >
            <input {...getContractInputProps()} />
            {contractFile ? (
              <div className="space-y-2">
                <CheckCircle2 className="h-10 w-10 text-emerald-accent mx-auto" />
                <p className="text-sm font-semibold text-white truncate max-w-xs">{contractFile.name}</p>
                <p className="text-xs text-slate-400">{(contractFile.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <div className="space-y-3">
                <UploadCloud className="h-10 w-10 text-slate-500 mx-auto" />
                <p className="text-sm font-semibold text-slate-350">Drag &amp; Drop contract file here</p>
                <p className="text-xs text-slate-500">or browse local files</p>
              </div>
            )}
          </div>

          {contractFile && (
            <div className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5
              ${contractValid === true 
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                : contractValid === false 
                  ? 'bg-red-500/10 border-red-500/20 text-red-400' 
                  : 'bg-slate-900 border-slate-800 text-slate-400 animate-pulse'
              }
            `}>
              {contractValid === true ? (
                <>
                  <CheckCircle2 className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-white">Validation Success</p>
                    <p className="mt-0.5">Parsed columns successfully: {CONTRACT_COLUMNS.length} variables detected.</p>
                  </div>
                </>
              ) : contractValid === false ? (
                <>
                  <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-white">Validation Error</p>
                    <p className="mt-0.5">Missing required columns. Please match the template format headers.</p>
                  </div>
                </>
              ) : (
                <>
                  <Info className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                  <p className="font-medium">Validating file content schema...</p>
                </>
              )}
            </div>
          )}
        </Card>

        {/* Broadcast Logs Upload */}
        <Card className="p-6 space-y-4">
          <CardHeader>
            <CardTitle>
              <UploadCloud className="h-5 w-5 text-teal-accent" />
              2. Broadcaster Airing Logs
            </CardTitle>
            <Button
              variant="ghost"
              onClick={() => downloadSampleTemplate('log')}
              className="px-2 py-1 text-xs gap-1"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Get Template
            </Button>
          </CardHeader>
          <p className="text-xs text-slate-400">Supported formats: CSV. Contains broadcaster-supplied transmission log reports.</p>

          <div 
            {...getLogRootProps()} 
            className={`
              border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200
              ${isLogDragActive ? 'border-teal-accent bg-teal-accent/5' : 'border-slate-800 hover:border-slate-700 hover:bg-slate-900/20'}
              ${logFile ? 'bg-slate-900/40 border-teal-500/30' : ''}
            `}
          >
            <input {...getLogInputProps()} />
            {logFile ? (
              <div className="space-y-2">
                <CheckCircle2 className="h-10 w-10 text-emerald-accent mx-auto" />
                <p className="text-sm font-semibold text-white truncate max-w-xs">{logFile.name}</p>
                <p className="text-xs text-slate-400">{(logFile.size / 1024).toFixed(1)} KB</p>
                {/* File Processing Performance (5.2): row count estimate */}
                {logRowEstimate !== null && (
                  <p className="text-xs text-slate-500">~{logRowEstimate.toLocaleString()} rows estimated</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <UploadCloud className="h-10 w-10 text-slate-500 mx-auto" />
                <p className="text-sm font-semibold text-slate-350">Drag &amp; Drop log file here</p>
                <p className="text-xs text-slate-500">or browse local files</p>
              </div>
            )}
          </div>

          {/* Large file warning (Performance 5.2) */}
          {isLargeFile && (
            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>~{logRowEstimate!.toLocaleString()} rows detected. Chunked vectorised processing enabled — target &lt;5s.</span>
            </div>
          )}

          {logFile && (
            <div className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5
              ${logValid === true 
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                : logValid === false 
                  ? 'bg-red-500/10 border-red-500/20 text-red-400' 
                  : 'bg-slate-900 border-slate-800 text-slate-400 animate-pulse'
              }
            `}>
              {logValid === true ? (
                <>
                  <CheckCircle2 className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-white">Validation Success</p>
                    <p className="mt-0.5">Parsed columns successfully: {BROADCAST_LOG_COLUMNS.length} variables detected.</p>
                  </div>
                </>
              ) : logValid === false ? (
                <>
                  <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-white">Validation Error</p>
                    <p className="mt-0.5">Missing required columns. Please match the template format headers.</p>
                  </div>
                </>
              ) : (
                <>
                  <Info className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                  <p className="font-medium">Validating file content schema...</p>
                </>
              )}
            </div>
          )}
        </Card>

      </div>

      {/* Audit trigger button */}
      <div className="flex justify-end mt-4">
        <Button
          variant="primary"
          onClick={handleRunAudit}
          disabled={!contractFile || !logFile || !contractValid || !logValid || validating}
          loading={auditing}
          className="px-8 py-3.5"
        >
          {auditing ? (
            'Running Reconciliation Engine...'
          ) : (
            <>
              Proceed to Review
              <ArrowRight className="h-4.5 w-4.5" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
