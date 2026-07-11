'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuditStore } from '@/store/useAuditStore';
import { Sparkles, ArrowRight, ShieldCheck, Mail, Lock } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated } = useAuditStore();
  const [email, setEmail] = useState('manager@nationalfoods.com.pk');
  const [password, setPassword] = useState('********');
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

    // Simulate short network delay
    setTimeout(() => {
      login({
        id: 'u1111111-1111-1111-1111-111111111111',
        organization_id: 'o1111111-1111-1111-1111-111111111111',
        full_name: 'Ayesha Khan',
        role: 'BRAND',
      });
      router.push('/upload');
      setLoading(false);
    }, 800);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-950 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(20,184,166,0.15),rgba(255,255,255,0))] px-4 py-12">
      <div className="w-full max-w-md space-y-8 glass-panel p-8 rounded-2xl border border-slate-800 shadow-2xl relative overflow-hidden">
        {/* Glow accent */}
        <div className="absolute -top-16 -left-16 w-32 h-32 bg-teal-accent/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-16 -right-16 w-32 h-32 bg-emerald-accent/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="text-center">
          <div className="inline-flex p-3 bg-teal-accent/10 rounded-xl text-teal-accent mb-3 border border-teal-500/20">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">
            AdSentry <span className="text-teal-accent font-black">AI</span>
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            AI Advertisement Compliance & Media Audit Platform
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl p-3 text-center">
            {error}
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4 rounded-md">
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

            <div>
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                Password
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
          </div>

          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center">
              <input
                id="remember-me"
                type="checkbox"
                defaultChecked
                className="h-4 w-4 bg-slate-900 border-slate-800 text-teal-accent rounded focus:ring-0 focus:ring-offset-0"
              />
              <label htmlFor="remember-me" className="ml-2 text-slate-400 select-none">
                Remember me
              </label>
            </div>
            <a href="#" className="font-medium text-teal-accent hover:text-teal-400 transition-colors">
              Forgot password?
            </a>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-teal-accent to-emerald-accent text-navy-950 font-semibold text-sm rounded-xl hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-navy-950 border-t-transparent"></span>
                Verifying Credentials...
              </span>
            ) : (
              <>
                Sign In
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        <div className="text-center mt-6">
          <p className="text-xs text-slate-400">
            Don't have an account yet?{' '}
            <Link href="/signup" className="font-semibold text-teal-accent hover:text-teal-400 transition-colors">
              Register here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
