'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuditStore } from '@/store/useAuditStore';
import { Sparkles, ArrowRight, ShieldCheck, Mail, Lock, User, Briefcase, Building } from 'lucide-react';

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

    // Simulate signup request
    setTimeout(() => {
      login({
        id: 'u-' + Math.random().toString(36).substr(2, 9),
        organization_id: 'o-' + Math.random().toString(36).substr(2, 9),
        full_name: fullName,
        role: role,
      });
      router.push('/upload');
      setLoading(false);
    }, 1000);
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

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl p-3 text-center animate-pulse">
            {error}
          </div>
        )}

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

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-teal-accent to-emerald-accent text-navy-950 font-semibold text-sm rounded-xl hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-navy-950 border-t-transparent"></span>
                Creating Profile Account...
              </span>
            ) : (
              <>
                Create Account
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
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
