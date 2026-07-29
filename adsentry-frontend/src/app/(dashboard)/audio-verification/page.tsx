'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { api } from '@/lib/api';
import Button from '@/components/ui/Button';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import ErrorBanner from '@/components/ui/ErrorBanner';
import {
  AudioLines,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  UploadCloud,
  FileAudio,
  ShieldCheck,
  Info,
  Clock,
  Gauge,
  Radio,
  Tv,
  Activity,
  Play,
  Square,
  AlertTriangle,
} from 'lucide-react';

export default function AudioVerificationPage() {
  // Fingerprint-a-source section state
  const [sectionOpen, setSectionOpen] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');
  const [fingerprinting, setFingerprinting] = useState(false);
  const [fingerprintError, setFingerprintError] = useState('');
  const [fingerprintResult, setFingerprintResult] = useState<{ title: string; duration_seconds: number } | null>(null);

  // Verify-a-clip section state
  const [clipFile, setClipFile] = useState<File | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [verifyResult, setVerifyResult] = useState<{
    found: boolean;
    matched_title: string | null;
    timestamp_formatted: string | null;
    confidence: number | null;
    reason?: string;
  } | null>(null);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'audio/*': ['.wav', '.mp3', '.m4a', '.ogg', '.flac'],
    },
    maxFiles: 1,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        setClipFile(acceptedFiles[0]);
        setVerifyResult(null);
        setVerifyError('');
      }
    },
  });

  const handleFingerprintSource = async () => {
    if (!youtubeUrl.trim() || !sourceTitle.trim()) return;
    setFingerprinting(true);
    setFingerprintError('');
    setFingerprintResult(null);
    try {
      const res = await api.fingerprintSource(youtubeUrl.trim(), sourceTitle.trim());
      setFingerprintResult({ title: res.title, duration_seconds: res.duration_seconds });
    } catch (err: any) {
      setFingerprintError(err.message || 'Failed to fingerprint the source recording.');
    } finally {
      setFingerprinting(false);
    }
  };

  const handleVerifyClip = async () => {
    if (!clipFile) return;
    setVerifying(true);
    setVerifyError('');
    setVerifyResult(null);
    try {
      const res = await api.verifyClip(clipFile);
      setVerifyResult(res);
    } catch (err: any) {
      setVerifyError(err.message || 'Failed to verify the audio clip.');
    } finally {
      setVerifying(false);
    }
  };

  // Live Monitor section state
  const [contracts, setContracts] = useState<any[]>([]);
  const [selectedContractId, setSelectedContractId] = useState<string>('');
  const [loadingContracts, setLoadingContracts] = useState(false);
  const [liveUrl, setLiveUrl] = useState('');
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [liveMatches, setLiveMatches] = useState<any[]>([]);
  const [liveMissedAirings, setLiveMissedAirings] = useState<any[]>([]);
  const [liveError, setLiveError] = useState('');
  const [liveElapsedSeconds, setLiveElapsedSeconds] = useState(0);
  const [startingLive, setStartingLive] = useState(false);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const fetchContracts = async () => {
      setLoadingContracts(true);
      try {
        const list = await api.listContracts();
        setContracts(list);
        if (list.length > 0) {
          setSelectedContractId(list[0].id);
        }
      } catch (err: any) {
        console.error('Failed to load contracts:', err);
      } finally {
        setLoadingContracts(false);
      }
    };
    fetchContracts();
  }, []);

  const startLiveMonitor = async () => {
    if (!liveUrl.trim() || !selectedContractId) return;
    setStartingLive(true);
    setLiveError('');
    setLiveMatches([]);
    setLiveMissedAirings([]);
    setLiveElapsedSeconds(0);
    setLiveStatus('starting');
    
    try {
      const res = await api.startLiveVerification(liveUrl.trim(), selectedContractId);
      setLiveSessionId(res.session_id);
      setIsMonitoring(true);
      
      // Start elapsed timer
      timerRef.current = setInterval(() => {
        setLiveElapsedSeconds((prev) => prev + 1);
      }, 1000);

      // Start polling status
      pollStatus(res.session_id);
      pollingRef.current = setInterval(() => {
        pollStatus(res.session_id);
      }, 5000);

    } catch (err: any) {
      setLiveError(err.message || 'Failed to start live verification stream.');
      setLiveStatus('error');
      setIsMonitoring(false);
    } finally {
      setStartingLive(false);
    }
  };

  const pollStatus = async (sessionId: string) => {
    try {
      const res = await api.getLiveVerificationStatus(sessionId);
      setLiveStatus(res.status);
      if (res.matches) {
        const sorted = [...res.matches].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        setLiveMatches(sorted);
      }
      if (res.missed_airings) {
        const sortedMissed = [...res.missed_airings].sort(
          (a, b) => new Date(b.expected_value).getTime() - new Date(a.expected_value).getTime()
        );
        setLiveMissedAirings(sortedMissed);
      }
      
      if (res.status === 'error' || res.status === 'stopped') {
        stopLiveMonitorLocally();
        if (res.status === 'error' && res.error_message) {
          setLiveError(res.error_message);
        }
      }
    } catch (err: any) {
      setLiveError(err.message || 'Failed to retrieve live stream status.');
      stopLiveMonitorLocally();
    }
  };

  const stopLiveMonitorLocally = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsMonitoring(false);
  };

  const handleStopLiveMonitor = async () => {
    if (!liveSessionId) return;
    try {
      await api.stopLiveVerification(liveSessionId);
    } catch (err: any) {
      console.error('Failed to stop session on backend:', err);
    } finally {
      stopLiveMonitorLocally();
      setLiveStatus('stopped');
    }
  };

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const formatElapsed = (totalSecs: number) => {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${hrs > 0 ? hrs + ':' : ''}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
          <AudioLines className="h-8 w-8 text-teal-accent" />
          Independent Audio Verification
        </h1>
        <p className="text-slate-400 mt-2 text-sm leading-relaxed">
          This is a proof-of-concept for independent, broadcaster-log-free verification — using open-source
          audio fingerprinting instead of trusting a submitted log file.
        </p>
      </div>

      {/* Section A: Fingerprint a Source Recording (collapsed by default, setup step) */}
      <Card className="overflow-hidden">
        <button
          onClick={() => setSectionOpen((v) => !v)}
          className="w-full flex items-center justify-between p-6 text-left hover:bg-slate-900/30 transition-colors"
        >
          <CardHeader className="flex-1 pointer-events-none">
            <CardTitle>
              <FileAudio className="h-5 w-5 text-teal-accent" />
              Fingerprint a Source Recording
            </CardTitle>
          </CardHeader>
          {sectionOpen ? (
            <ChevronUp className="h-5 w-5 text-slate-400 shrink-0" />
          ) : (
            <ChevronDown className="h-5 w-5 text-slate-400 shrink-0" />
          )}
        </button>

        {sectionOpen && (
          <div className="px-6 pb-6 space-y-4 border-t border-slate-800/80 pt-5">
            <p className="text-xs text-slate-400 flex items-start gap-2">
              <Info className="h-4 w-4 shrink-0 mt-0.5 text-slate-500" />
              Demo-prep step: ingest a real recording (e.g. a broadcast segment) so its audio fingerprint can
              be searched against later.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-350">YouTube URL</label>
                <input
                  type="text"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-teal-accent/50"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-350">Title</label>
                <input
                  type="text"
                  value={sourceTitle}
                  onChange={(e) => setSourceTitle(e.target.value)}
                  placeholder="e.g. Evening News Bulletin - July 24"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-teal-accent/50"
                />
              </div>
            </div>

            <ErrorBanner>{fingerprintError}</ErrorBanner>

            {fingerprintResult && (
              <div className="flex items-center gap-2.5 p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-xs">
                <CheckCircle2 className="h-4.5 w-4.5 shrink-0" />
                <span>
                  Fingerprinted <strong className="text-white">&ldquo;{fingerprintResult.title}&rdquo;</strong> —{' '}
                  {Math.round(fingerprintResult.duration_seconds)}s of audio indexed.
                </span>
              </div>
            )}

            <Button
              variant="primary"
              onClick={handleFingerprintSource}
              disabled={!youtubeUrl.trim() || !sourceTitle.trim()}
              loading={fingerprinting}
            >
              {fingerprinting ? 'Downloading & Fingerprinting...' : 'Fingerprint This'}
            </Button>
          </div>
        )}
      </Card>

      {/* Section B: Verify a Clip — the demo moment */}
      <Card className="p-6 space-y-5">
        <CardHeader>
          <CardTitle>
            <ShieldCheck className="h-5 w-5 text-teal-accent" />
            Verify a Clip
          </CardTitle>
        </CardHeader>

        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200
            ${isDragActive ? 'border-teal-accent bg-teal-accent/5' : 'border-slate-800 hover:border-slate-700 hover:bg-slate-900/20'}
            ${clipFile ? 'bg-slate-900/40 border-teal-500/30' : ''}
          `}
        >
          <input {...getInputProps()} />
          {clipFile ? (
            <div className="space-y-2">
              <CheckCircle2 className="h-10 w-10 text-emerald-accent mx-auto" />
              <p className="text-sm font-semibold text-white truncate max-w-xs">{clipFile.name}</p>
              <p className="text-xs text-slate-400">{(clipFile.size / 1024).toFixed(1)} KB</p>
            </div>
          ) : (
            <div className="space-y-3">
              <UploadCloud className="h-10 w-10 text-slate-500 mx-auto" />
              <p className="text-sm font-semibold text-slate-350">Drag &amp; Drop a short audio clip here</p>
              <p className="text-xs text-slate-500">or browse local files (WAV, MP3, M4A, OGG, FLAC)</p>
            </div>
          )}
        </div>

        <ErrorBanner>{verifyError}</ErrorBanner>

        {verifyResult && verifyResult.found && (
          <div className="p-5 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 space-y-2">
            <div className="flex items-center gap-2.5 text-emerald-400">
              <CheckCircle2 className="h-6 w-6 shrink-0" />
              <p className="text-base font-bold text-white">
                Match found in &ldquo;{verifyResult.matched_title}&rdquo; at {verifyResult.timestamp_formatted}
              </p>
            </div>
            {verifyResult.confidence !== null && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-300/90 ml-8">
                <Gauge className="h-3.5 w-3.5" />
                Confidence: {verifyResult.confidence.toFixed(1)}%
              </div>
            )}
          </div>
        )}

        {verifyResult && !verifyResult.found && (
          <div className="flex items-center gap-2.5 p-4 rounded-xl border border-slate-800 bg-slate-900/50 text-slate-300">
            <XCircle className="h-5 w-5 shrink-0 text-slate-500" />
            <p className="text-sm font-medium">
              {verifyResult.reason === 'no_sources_fingerprinted'
                ? 'No sources have been fingerprinted yet — use the section above to ingest a recording first.'
                : 'No match found in fingerprinted sources yet.'}
            </p>
          </div>
        )}

        <Button variant="primary" onClick={handleVerifyClip} disabled={!clipFile} loading={verifying}>
          {verifying ? (
            <>
              <Clock className="h-4 w-4" />
              Verifying...
            </>
          ) : (
            'Verify'
          )}
        </Button>
      </Card>

      {/* Section C: Live Stream Verification */}
      <Card className="p-6 space-y-5">
        <CardHeader>
          <CardTitle className="flex items-center justify-between w-full">
            <span className="flex items-center gap-2.5">
              <Radio className={`h-5 w-5 ${isMonitoring && liveStatus === 'running' ? 'text-rose-500 animate-pulse' : 'text-teal-accent'}`} />
              Live YouTube Monitor
            </span>
            {isMonitoring && liveStatus === 'running' && (
              <span className="flex items-center gap-1.5 bg-rose-500/10 text-rose-400 text-xs font-semibold px-2.5 py-1 rounded-full border border-rose-500/20">
                <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                MONITORING LIVE
              </span>
            )}
          </CardTitle>
        </CardHeader>

        <div className="space-y-4">
          <p className="text-xs text-slate-400 flex items-start gap-2">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-slate-500" />
            Ingest a YouTube Live URL to start a background monitor capture segmenting the stream and matching it against your database in real-time.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xxs font-bold text-slate-400 uppercase tracking-wider">Select Target Contract</label>
              <select
                value={selectedContractId}
                onChange={(e) => setSelectedContractId(e.target.value)}
                disabled={isMonitoring}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-teal-accent/50 disabled:opacity-60"
              >
                {loadingContracts ? (
                  <option value="">Loading contracts...</option>
                ) : contracts.length === 0 ? (
                  <option value="">No contracts available</option>
                ) : (
                  contracts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.campaign_name} ({c.brand_name}) - {c.channel}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xxs font-bold text-slate-400 uppercase tracking-wider">YouTube Live URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={liveUrl}
                  onChange={(e) => setLiveUrl(e.target.value)}
                  disabled={isMonitoring}
                  placeholder="https://www.youtube.com/watch?v=... (YouTube Live URL)"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:border-teal-accent/50 disabled:opacity-60"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            {isMonitoring ? (
              <Button
                variant="danger"
                onClick={handleStopLiveMonitor}
                className="bg-rose-600 hover:bg-rose-700 text-white px-5 py-2.5 rounded-lg flex items-center gap-1.5"
              >
                <Square className="h-4 w-4 shrink-0" />
                Stop Monitor
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={startLiveMonitor}
                disabled={!liveUrl.trim() || !selectedContractId}
                loading={startingLive}
                className="px-5 py-2.5 rounded-lg flex items-center gap-1.5"
              >
                <Play className="h-4 w-4 shrink-0" />
                Start Monitor
              </Button>
            )}
          </div>

          <ErrorBanner>{liveError}</ErrorBanner>

          {isMonitoring && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 rounded-xl border border-slate-800 bg-slate-900/30">
              <div className="space-y-0.5">
                <span className="text-xxs font-bold text-slate-500 uppercase tracking-wider">Session Status</span>
                <p className="text-sm font-semibold capitalize text-white flex items-center gap-1.5">
                  <Activity className="h-4 w-4 text-teal-accent animate-pulse" />
                  {liveStatus}
                </p>
              </div>
              <div className="space-y-0.5">
                <span className="text-xxs font-bold text-slate-500 uppercase tracking-wider">Elapsed Time</span>
                <p className="text-sm font-semibold text-white">{formatElapsed(liveElapsedSeconds)}</p>
              </div>
              <div className="col-span-2 sm:col-span-1 space-y-0.5">
                <span className="text-xxs font-bold text-slate-500 uppercase tracking-wider">Matches / Missed</span>
                <p className="text-sm font-semibold text-white">{liveMatches.length} / {liveMissedAirings.length}</p>
              </div>
            </div>
          )}

          {isMonitoring && liveMatches.length > 0 && (
            <div className="space-y-2.5">
              <h3 className="text-xs font-semibold text-slate-400">Match Events Log (Real-time)</h3>
              <div className="max-h-60 overflow-y-auto border border-slate-800/80 rounded-xl divide-y divide-slate-800 bg-slate-950/40">
                {liveMatches.map((match, idx) => (
                  <div key={idx} className="p-3 flex items-start justify-between gap-4 hover:bg-slate-900/10 transition-colors">
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-white leading-none">
                        {match.title}
                      </p>
                      <p className="text-xxs text-slate-400 flex items-center gap-1">
                        <Clock className="h-3 w-3 text-slate-500" />
                        Match offset: {Math.round(match.offset_seconds)}s • Logged at {new Date(match.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-emerald-400 bg-emerald-500/5 px-2 py-0.5 rounded-full border border-emerald-500/10 text-xxs font-semibold">
                        <Gauge className="h-3 w-3" />
                        {match.confidence.toFixed(1)}% Conf
                      </div>
                      {match.evidence_url && (
                        <button
                          onClick={() => {
                            const audio = new Audio(match.evidence_url!);
                            audio.play().catch(e => console.error("Audio playback error:", e));
                          }}
                          className="px-2.5 py-1 rounded-lg bg-teal-500/10 text-teal-accent hover:bg-teal-500/20 border border-teal-500/20 hover:border-teal-500/30 transition-colors flex items-center gap-1 text-xxs font-bold"
                          title="Play match evidence snippet"
                        >
                          <Play className="h-3 w-3 shrink-0 fill-current" />
                          Play Clip
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isMonitoring && liveMissedAirings.length > 0 && (
            <div className="space-y-2.5">
              <h3 className="text-xs font-semibold text-rose-400">Missed Airing Discrepancies Flagged (Real-time)</h3>
              <div className="max-h-40 overflow-y-auto border border-rose-950/40 rounded-xl divide-y divide-rose-950/20 bg-rose-950/5">
                {liveMissedAirings.map((missed, idx) => (
                  <div key={idx} className="p-3 flex items-start justify-between gap-4 hover:bg-rose-900/5 transition-colors">
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-rose-300 leading-none">
                        MISSED: Contract Expected Slot
                      </p>
                      <p className="text-xxs text-rose-400/80 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Scheduled: {missed.expected_value}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-rose-400 bg-rose-500/5 px-2 py-0.5 rounded-full border border-rose-500/10 text-xxs font-semibold">
                      <AlertTriangle className="h-3 w-3" />
                      Exposure: Rs. {Math.round(missed.financial_impact).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isMonitoring && liveStatus === 'running' && liveMatches.length === 0 && (
            <div className="flex flex-col items-center justify-center py-6 text-center border border-slate-800/60 rounded-xl bg-slate-950/20">
              <span className="h-2 w-2 rounded-full bg-teal-accent animate-ping mb-2" />
              <p className="text-xs text-slate-400">Listening to live stream... Waiting for matched segments.</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
