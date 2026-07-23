'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuditStore } from '@/store/useAuditStore';
import { signUpWithEmail, bootstrapProfile, mapAuthErrorMessage } from '@/lib/auth';
import Button from '@/components/ui/Button';
import ErrorBanner from '@/components/ui/ErrorBanner';
import { Sparkles, ArrowRight, ShieldCheck, Mail, Lock, User, Briefcase, Building } from 'lucide-react';

const PENDING_PROFILE_KEY = 'adsentry_pending_profile';

export default function SignupPage() {
  const router = useRouter();
  const { login, isAuthenticated } = useAuditStore();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organization, setOrganization] = useState('');
  const [role, setRole] = useState<'BRAND' | 'AGENCY' | 'FINANCE'>('BRAND');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/upload');
    }
  }, [isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!fullName || !email || !password || !organization) {
      setError('Please fill in all required fields.');
      setLoading(false);
      return;
    }

    const { session, error: signUpError } = await signUpWithEmail(email, password);

    if (signUpError) {
      setError(mapAuthErrorMessage(signUpError));
      setLoading(false);
      return;
    }

    if (!session) {
      // Email confirmation required — cache the details so the profile can be
      // bootstrapped lazily once the user confirms and logs in for the first time.
      try {
        sessionStorage.setItem(
          PENDING_PROFILE_KEY,
          JSON.stringify({ fullName, organizationName: organization, role }),
        );
      } catch {
        // sessionStorage may be unavailable (e.g. private browsing) — non-fatal
      }
      setError('Check your email to confirm your account, then log in.');
      setLoading(false);
      return;
    }

    try {
      const profile = await bootstrapProfile(fullName, organization, role);
      login(profile);
      router.push('/upload');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete account setup.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-950 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(20,184,166,0.15),rgba(255,255,255,0))] px-4 py-12">
      <div className="w-full max-w-lg space-y-8 glass-panel p-8 rounded-2xl border border-slate-800 shadow-2xl relative overflow-hidden">
        {/* Glow accent */}
        <div className="absolute -top-16 -left-16 w-32 h-32 bg-teal-accent/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-16 -right-16 w-32 h-32 bg-emerald-accent/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="text-center">
          <div className="inline-flex p-3 bg-teal-accent/10 rounded-xl text-teal-accent mb-3 border border-teal-500/20">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">
            Register Account
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Start auditing your media contracts with AdSentry AI
          </p>
        </div>

        <ErrorBanner>{error}</ErrorBanner>

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 h-5 w-5 text-slate-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-slate-900/60 border border-slate-800 focus:border-teal-accent/50 focus:ring-1 focus:ring-teal-accent/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none transition-all"
                  placeholder="name@company.com"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full pl-11 pr-4 py-3 bg-slate-900/60 border border-slate-800 focus:border-teal-accent/50 focus:ring-1 focus:ring-teal-accent/50 rounded-xl text-sm text-white focus:outline-none transition-all appearance-none cursor-pointer"
                >
                  <option value="BRAND" className="bg-navy-900 text-white">Brand Manager</option>
                  <option value="AGENCY" className="bg-navy-900 text-white">Agency Analyst</option>
                  <option value="FINANCE" className="bg-navy-900 text-white">Finance Officer</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
              Choose Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 h-5 w-5 text-slate-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-slate-900/60 border border-slate-800 focus:border-teal-accent/50 focus:ring-1 focus:ring-teal-accent/50 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none transition-all"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="flex items-center text-xs">
            <input
              id="terms"
              type="checkbox"
              required
              className="h-4 w-4 bg-slate-900 border-slate-800 text-teal-accent rounded focus:ring-0"
            />
            <label htmlFor="terms" className="ml-2 text-slate-400 select-none">
              I agree to the commercial data privacy and audit terms of service.
            </label>
          </div>

          <Button type="submit" variant="primary" loading={loading} className="w-full py-3">
            {loading ? (
              'Creating Profile Account...'
            ) : (
              <>
                Create Account
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </form>

        <div className="text-center mt-6">
          <p className="text-xs text-slate-400">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-teal-accent hover:text-teal-400 transition-colors">
              Sign in here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
