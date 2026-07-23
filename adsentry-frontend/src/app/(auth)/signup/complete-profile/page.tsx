'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuditStore } from '@/store/useAuditStore';
import { supabase } from '@/lib/supabase';
import { bootstrapProfile } from '@/lib/auth';
import { ArrowRight, User, Briefcase, Building } from 'lucide-react';

const PENDING_PROFILE_KEY = 'adsentry_pending_profile';

type Role = 'BRAND' | 'AGENCY' | 'FINANCE';

export default function CompleteProfilePage() {
  const router = useRouter();
  const { login } = useAuditStore();
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasCachedName, setHasCachedName] = useState(false);
  const [fullName, setFullName] = useState('');
  const [organization, setOrganization] = useState('');
  const [role, setRole] = useState<Role>('BRAND');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PENDING_PROFILE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as { fullName?: string; organizationName?: string; role?: Role };
        if (cached.fullName) {
          setFullName(cached.fullName);
          setHasCachedName(true);
        }
        if (cached.organizationName) setOrganization(cached.organizationName);
        if (cached.role) setRole(cached.role);
      }
    } catch {
      // sessionStorage may be unavailable — fall back to asking for everything
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/login');
        return;
      }
      setCheckingSession(false);
    });
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!fullName || !organization) {
      setError('Please fill in all required fields.');
      setLoading(false);
      return;
    }

    try {
      const profile = await bootstrapProfile(fullName, organization, role);
      try {
        sessionStorage.removeItem(PENDING_PROFILE_KEY);
      } catch {
        // ignore
      }
      login(profile);
      router.push('/upload');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete account setup.');
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-navy-950">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-teal-accent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-950 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(20,184,166,0.15),rgba(255,255,255,0))] px-4 py-12">
      <div className="w-full max-w-lg space-y-8 glass-panel p-8 rounded-2xl border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-16 -left-16 w-32 h-32 bg-teal-accent/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-16 -right-16 w-32 h-32 bg-emerald-accent/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="text-center">
          <img src="/logo-icon.png" alt="AdSentry" className="h-16 w-16 rounded-2xl mx-auto mb-3 shadow-lg shadow-teal-500/10" />
          <h2 className="text-3xl font-extrabold text-white tracking-tight">
            Complete Your Profile
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Just a couple more details before you start auditing with AdSentry AI
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl p-3 text-center animate-pulse">
            {error}
          </div>
        )}

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          {!hasCachedName && (
            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-3.5 h-5 w-5 text-slate-500" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-slate-900/60 border border-slate-800 focus:border-teal-accent/50 focus:ring-1 focus:ring-teal-accent/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none transition-all"
                  placeholder="Ayesha Khan"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
              Organization Name
            </label>
            <div className="relative">
              <Building className="absolute left-3 top-3.5 h-5 w-5 text-slate-500" />
              <input
                type="text"
                required
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-slate-900/60 border border-slate-800 focus:border-teal-accent/50 focus:ring-1 focus:ring-teal-accent/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none transition-all"
                placeholder="National Foods"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
              Airing Tolerance Role
            </label>
            <div className="relative">
              <Briefcase className="absolute left-3 top-3.5 h-5 w-5 text-slate-500" />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="w-full pl-11 pr-4 py-3 bg-slate-900/60 border border-slate-800 focus:border-teal-accent/50 focus:ring-1 focus:ring-teal-accent/50 rounded-xl text-sm text-white focus:outline-none transition-all appearance-none cursor-pointer"
              >
                <option value="BRAND" className="bg-navy-900 text-white">Brand Manager</option>
                <option value="AGENCY" className="bg-navy-900 text-white">Agency Analyst</option>
                <option value="FINANCE" className="bg-navy-900 text-white">Finance Officer</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-teal-accent to-emerald-accent text-navy-950 font-semibold text-sm rounded-xl hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-navy-950 border-t-transparent"></span>
                Finishing Setup...
              </span>
            ) : (
              <>
                Continue
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
