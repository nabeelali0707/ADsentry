'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuditStore } from '@/store/useAuditStore';

export default function RootPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuditStore();

  useEffect(() => {
    if (isAuthenticated) {
      router.push('/upload');
    } else {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-navy-950 text-teal-accent">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-teal-accent"></div>
        <span className="text-sm font-medium tracking-wide">Redirecting...</span>
      </div>
    </div>
  );
}
