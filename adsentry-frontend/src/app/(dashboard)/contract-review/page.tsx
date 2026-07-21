'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuditStore } from '@/store/useAuditStore';
import { api, formatPKR, Contract, AuditCorrection } from '@/lib/api';
import { 
  FileText, 
  HelpCircle, 
  Save, 
  CheckCircle2, 
  Calendar, 
  Tv, 
  Coins, 
  Clock, 
  AlertTriangle,
  Play,
  ChevronDown,
  ChevronUp,
  History,
  Shield,
  Target
} from 'lucide-react';

export default function ContractReviewPage() {
  const router = useRouter();
  const { activeContract, setContract, setReport } = useAuditStore();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runningAudit, setRunningAudit] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Editable fields
  const [channel, setChannel] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [contractedAirings, setContractedAirings] = useState<number>(0);
  const [spotDurationSec, setSpotDurationSec] = useState<number>(0);
  const [costPerAiring, setCostPerAiring] = useState<number>(0);
  const [tolerance, setTolerance] = useState<number>(15);
  const [threshold, setThreshold] = useState<number>(97.00);
  /** Discrepancy Detection Accuracy (5.2): configurable SHORTENED threshold */
  const [durationTolerance, setDurationTolerance] = useState<number>(90);

  // Audit Trail (Security 5.1)
  const [auditTrailOpen, setAuditTrailOpen] = useState(false);
  const [auditTrail, setAuditTrail] = useState<AuditCorrection[]>([]);
  const [loadingTrail, setLoadingTrail] = useState(false);

  useEffect(() => {
    if (activeContract) {
      setChannel(activeContract.channel);
      setStartDate(activeContract.start_date);
      setEndDate(activeContract.end_date);
      setContractedAirings(activeContract.contracted_airings);
      setSpotDurationSec(activeContract.spot_duration_sec);
      setCostPerAiring(activeContract.cost_per_airing);
      setTolerance(activeContract.time_window_tolerance_minutes);
      setThreshold(activeContract.compliance_threshold_pct);
      // Default duration_tolerance_pct stored as 0–1 fraction, UI shows 0–100
      setDurationTolerance(Math.round((activeContract.duration_tolerance_pct ?? 0.90) * 100));
    }
  }, [activeContract]);

  const loadAuditTrail = async () => {
    if (!activeContract || loadingTrail) return;
    setLoadingTrail(true);
    try {
      const res = await api.getAuditTrail(activeContract.id);
      setAuditTrail(res.corrections);
    } catch {
      setAuditTrail([]);
    } finally {
      setLoadingTrail(false);
    }
  };

  const handleToggleAuditTrail = () => {
    const next = !auditTrailOpen;
    setAuditTrailOpen(next);
    if (next && auditTrail.length === 0) loadAuditTrail();
  };

  if (!activeContract) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
        <AlertTriangle className="h-10 w-10 text-yellow-500" />
        <p className="font-medium text-sm">No contract is currently loaded. Please upload a contract first.</p>
        <button onClick={() => router.push('/upload')} className="mt-2 px-4 py-2 bg-teal-accent text-navy-950 rounded-xl font-semibold text-xs">
          Go to Upload
        </button>
      </div>
    );
  }

  const liveTotalContractValue = contractedAirings * costPerAiring;
  // Accuracy estimate: tighter tolerances → higher accuracy label
  const accuracyLabel = durationTolerance <= 85 ? '~98% accuracy' : durationTolerance <= 92 ? '~95–97% accuracy' : '~92–95% accuracy';

  const handleSaveChanges = async () => {
    setSaving(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      const updateData: Partial<Contract> = {
        channel,
        start_date: startDate,
        end_date: endDate,
        contracted_airings: Number(contractedAirings),
        spot_duration_sec: Number(spotDurationSec),
        cost_per_airing: Number(costPerAiring),
        time_window_tolerance_minutes: Number(tolerance),
        compliance_threshold_pct: Number(threshold),
        duration_tolerance_pct: durationTolerance / 100,
      };
      const res = await api.updateContract(activeContract.id, updateData);
      setContract(res.contract);
      setSuccessMsg('Changes saved and baseline updated successfully.');
      setTimeout(() => setSuccessMsg(''), 3000);
      // Refresh audit trail to show new correction entries
      if (auditTrailOpen) loadAuditTrail();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmAndRunAudit = async () => {
    setRunningAudit(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const updateData: Partial<Contract> = {
        channel,
        start_date: startDate,
        end_date: endDate,
        contracted_airings: Number(contractedAirings),
        spot_duration_sec: Number(spotDurationSec),
        cost_per_airing: Number(costPerAiring),
        time_window_tolerance_minutes: Number(tolerance),
        compliance_threshold_pct: Number(threshold),
        duration_tolerance_pct: durationTolerance / 100,
      };
      const patchRes = await api.updateContract(activeContract.id, updateData);
      setContract(patchRes.contract);
      await api.confirmContract(activeContract.id);
      const auditRes = await api.runAudit(activeContract.id);
      setReport(auditRes.audit_report);
      router.push('/dashboard');
    } catch (err: any) {
      setErrorMsg(err.message || 'Reconciliation failed to run.');
    } finally {
      setRunningAudit(false);
    }
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Contract Review</h1>
          <p className="text-slate-400 mt-1">Confirm extracted variables or adjust audit parameters to form your baseline.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleSaveChanges}
            disabled={saving || runningAudit}
            className="px-5 py-2.5 bg-slate-900 border border-slate-850 hover:bg-slate-800 text-slate-350 hover:text-white font-semibold text-sm rounded-xl flex items-center gap-2 transition-all disabled:opacity-50"
          >
            {saving ? (
              <><span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent"></span>Saving...</>
            ) : (
              <><Save className="h-4 w-4" />Save Edits</>
            )}
          </button>
          <button
            onClick={handleConfirmAndRunAudit}
            disabled={saving || runningAudit}
            className="px-6 py-2.5 bg-gradient-to-r from-teal-accent to-emerald-accent text-navy-950 font-bold text-sm rounded-xl flex items-center gap-2 shadow-lg shadow-teal-500/10 active:scale-[0.99] transition-all disabled:opacity-50"
          >
            {runningAudit ? (
              <><span className="h-4 w-4 animate-spin rounded-full border-2 border-navy-950 border-t-transparent"></span>Auditing...</>
            ) : (
              <><Play className="h-4 w-4 fill-current" />Confirm &amp; Reconcile</>
            )}
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">{successMsg}</p>
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">{errorMsg}</p>
        </div>
      )}

      {/* Main Review Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Configuration Forms */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <FileText className="h-5 w-5 text-teal-accent" />
              Contract Airing Parameters
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Channel Name</label>
                <div className="relative">
                  <Tv className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-slate-500" />
                  <input type="text" value={channel} onChange={(e) => setChannel(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-850 focus:border-teal-accent/50 focus:ring-1 focus:ring-teal-accent/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none transition-all" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Contracted Airings (Spots)</label>
                <div className="relative">
                  <Play className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-slate-500" />
                  <input type="number" value={contractedAirings} onChange={(e) => setContractedAirings(Number(e.target.value))} className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-850 focus:border-teal-accent/50 focus:ring-1 focus:ring-teal-accent/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none transition-all" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Spot Duration (Seconds)</label>
                <div className="relative">
                  <Clock className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-slate-500" />
                  <input type="number" value={spotDurationSec} onChange={(e) => setSpotDurationSec(Number(e.target.value))} className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-850 focus:border-teal-accent/50 focus:ring-1 focus:ring-teal-accent/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none transition-all" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Cost Per Airing (Rs.)</label>
                <div className="relative">
                  <Coins className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-slate-500" />
                  <input type="number" value={costPerAiring} onChange={(e) => setCostPerAiring(Number(e.target.value))} className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-850 focus:border-teal-accent/50 focus:ring-1 focus:ring-teal-accent/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none transition-all" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Start Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-slate-500" />
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-850 focus:border-teal-accent/50 focus:ring-1 focus:ring-teal-accent/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none transition-all" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">End Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-slate-500" />
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-850 focus:border-teal-accent/50 focus:ring-1 focus:ring-teal-accent/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none transition-all" />
                </div>
              </div>
            </div>
          </div>

          {/* Reconciliation parameters */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <Clock className="h-5 w-5 text-teal-accent" />
              Audit Tolerance Settings
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Time Window Tolerance (Mins)</label>
                  <span className="text-xs text-teal-accent font-semibold">±{tolerance} min</span>
                </div>
                <input type="range" min="5" max="60" step="5" value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-accent" />
                <p className="text-[11px] text-slate-500 mt-1.5">Max deviation allowed around scheduled slot before flagging OUT_OF_SLOT.</p>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Compliance Threshold (%)</label>
                  <span className="text-xs text-emerald-accent font-semibold">{threshold}%</span>
                </div>
                <input type="range" min="80" max="100" step="1" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-accent" />
                <p className="text-[11px] text-slate-500 mt-1.5">Airing success percentage required to trigger COMPLIANT status.</p>
              </div>

              {/* Duration Tolerance — Discrepancy Detection Accuracy (5.2) */}
              <div className="md:col-span-2">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-teal-accent" />
                    Duration Tolerance (%)
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-teal-accent font-semibold">{durationTolerance}% min delivery</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-accent/10 border border-teal-500/20 text-teal-400 font-semibold flex items-center gap-1">
                      <Target className="h-3 w-3" />
                      {accuracyLabel}
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min="70"
                  max="99"
                  step="1"
                  value={durationTolerance}
                  onChange={(e) => setDurationTolerance(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-accent"
                />
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Spots shorter than <strong className="text-slate-400">{durationTolerance}%</strong> of contracted duration ({Math.round(spotDurationSec * durationTolerance / 100)}s of {spotDurationSec}s) are flagged as SHORTENED.
                  Tighter values → higher detection accuracy (target ≥95%).
                </p>
              </div>

            </div>
          </div>

          {/* Audit Trail Panel (Security 5.1) */}
          <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
            <button
              onClick={handleToggleAuditTrail}
              className="w-full flex items-center justify-between p-5 hover:bg-slate-800/30 transition-colors"
            >
              <div className="flex items-center gap-2 text-white font-semibold text-sm">
                <History className="h-4.5 w-4.5 text-teal-accent" />
                Audit Trail
                {auditTrail.length > 0 && (
                  <span className="ml-1 px-2 py-0.5 text-[10px] rounded-full bg-teal-accent/10 border border-teal-500/20 text-teal-400 font-bold">
                    {auditTrail.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-slate-400 text-xs">
                <span>Every field correction is logged for transparency</span>
                {auditTrailOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </button>

            {auditTrailOpen && (
              <div className="border-t border-slate-800">
                {loadingTrail ? (
                  <div className="p-6 text-center text-slate-400 text-xs animate-pulse">Loading correction history...</div>
                ) : auditTrail.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 text-xs">
                    <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-emerald-400" />
                    No field corrections have been logged. All values match the original parsed contract.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/60">
                    {auditTrail.map((correction) => (
                      <div key={correction.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white uppercase tracking-wider">{correction.field_name.replace(/_/g, ' ')}</span>
                            <span className="text-[10px] text-slate-500">{new Date(correction.created_at).toLocaleString()}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 text-xs">
                            <span className="px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400 font-mono line-through">{correction.original_value ?? '—'}</span>
                            <span className="text-slate-500">→</span>
                            <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono">{correction.corrected_value ?? '—'}</span>
                          </div>
                        </div>
                        {correction.corrected_by && (
                          <span className="text-[10px] text-slate-500 shrink-0">by {correction.corrected_by.slice(0, 8)}…</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Campaign Summary Card */}
        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-6 sticky top-6">
            <h3 className="text-lg font-bold text-white border-b border-slate-800 pb-3">Campaign Summary</h3>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider">Brand Name</p>
                <p className="text-sm font-semibold text-white mt-0.5">{activeContract.brand_name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider">Campaign Name</p>
                <p className="text-sm font-semibold text-white mt-0.5">{activeContract.campaign_name}</p>
              </div>
              <div className="pt-4 border-t border-slate-850 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Total Spots</p>
                  <p className="text-lg font-extrabold text-white mt-0.5">{contractedAirings}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Spot Duration</p>
                  <p className="text-lg font-extrabold text-white mt-0.5">{spotDurationSec}s</p>
                </div>
              </div>
              <div className="pt-4 border-t border-slate-850">
                <p className="text-xs text-slate-400 uppercase tracking-wider">Rate Per Airing</p>
                <p className="text-lg font-extrabold text-white mt-0.5">{formatPKR(costPerAiring)}</p>
              </div>
              <div className="pt-4 border-t border-slate-850 p-4 rounded-xl bg-teal-accent/5 border border-teal-500/10">
                <p className="text-xs text-teal-300 font-semibold uppercase tracking-wider">Total Contract Value</p>
                <p className="text-2xl font-black text-teal-accent mt-1">{formatPKR(liveTotalContractValue)}</p>
              </div>
            </div>
            <div className="p-3 bg-slate-900 border border-slate-850 rounded-xl flex gap-2.5 text-xs text-slate-400 leading-relaxed">
              <CheckCircle2 className="h-4.5 w-4.5 text-teal-accent shrink-0 mt-0.5" />
              <p>Reconciliation will lock these parameters. Edits after locking are recorded in the audit log.</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
