'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuditStore } from '@/store/useAuditStore';
import { signInWithEmail, fetchMyProfile, mapAuthErrorMessage } from '@/lib/auth';
import Button from '@/components/ui/Button';
import ErrorBanner from '@/components/ui/ErrorBanner';
import { Sparkles, ArrowRight, Mail, Lock } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated } = useAuditStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

    const { session, error: signInError } = await signInWithEmail(email, password);

    if (signInError || !session) {
      setError(mapAuthErrorMessage(signInError));
      setLoading(false);
      return;
    }

    try {
      const profile = await fetchMyProfile();
      if (!profile) {
        // No profile yet — most likely a signup that required email confirmation
        // and never finished bootstrapping. Send them to complete it now.
        router.push('/signup/complete-profile');
        return;
      }
      login(profile);
      router.push('/upload');
    } catch {
      setError('Something went wrong while loading your profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-950 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(20,184,166,0.15),rgba(255,255,255,0))] px-4 py-12">
      <div className="w-full max-w-md space-y-8 glass-panel p-8 rounded-2xl border border-slate-800 shadow-2xl relative overflow-hidden">
        {/* Glow accent */}
        <div className="absolute -top-16 -left-16 w-32 h-32 bg-teal-accent/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-16 -right-16 w-32 h-32 bg-emerald-accent/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="text-center">
          <img src="/logo-icon.png" alt="AdSentry" className="h-16 w-16 rounded-2xl mx-auto mb-3 shadow-lg shadow-teal-500/10" />
          <h2 className="text-3xl font-extrabold text-white tracking-tight">
            AdSentry <span className="text-teal-accent font-black">AI</span>
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            AI Advertisement Compliance & Media Audit Platform
          </p>
        </div>

        <ErrorBanner>{error}</ErrorBanner>

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

          <Button type="submit" variant="primary" loading={loading} className="w-full py-3">
            {loading ? (
              'Verifying Credentials...'
            ) : (
              <>
                Sign In
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
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
