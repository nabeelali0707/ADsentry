'use client';

import React, { useState } from 'react';
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
    </div>
  );
}
