'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { fetchMyProfile } from '@/lib/auth';
import { useAuditStore } from '@/store/useAuditStore';

const PUBLIC_AUTH_PATHS = ['/login', '/signup', '/signup/complete-profile'];

/**
 * Restores the Zustand auth store from an existing Supabase session on app
 * load (page refresh, new tab) and keeps it in sync with external auth
 * events (token refresh, sign-out from another tab).
 */
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || cancelled) return;

      try {
        const profile = await fetchMyProfile();
        if (cancelled) return;
        if (profile) {
          useAuditStore.getState().login(profile);
        } else if (!PUBLIC_AUTH_PATHS.includes(pathname)) {
          // Signed in but never finished bootstrapping a profile/org.
          router.push('/signup/complete-profile');
        }
      } catch {
        // Network/auth failure — leave the user unauthenticated
      }
    };

    restore();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        useAuditStore.setState({
          isAuthenticated: false,
          userProfile: null,
          activeContractId: null,
          activeContract: null,
          activeReport: null,
          sessionStartedAt: null,
        });
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
}
