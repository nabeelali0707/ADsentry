import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Contract, AuditReport, api } from '@/lib/api';
import { signOutFromSupabase } from '@/lib/auth';

interface UserProfile {
  id: string;
  organization_id: string;
  full_name: string;
  role: 'BRAND' | 'AGENCY' | 'FINANCE';
}

interface AuditState {
  // Session & Auth
  isAuthenticated: boolean;
  userProfile: UserProfile | null;
  /** Session-Scoped File Handling (Security 5.1): tracks when this session started */
  sessionStartedAt: string | null;

  // Active Campaign / Audit Flow
  activeContractId: string | null;
  activeContract: Contract | null;
  activeReport: AuditReport | null;

  // Actions
  login: (profile: UserProfile) => void;
  logout: () => void;
  setContract: (contract: Contract | null) => void;
  setReport: (report: AuditReport | null) => void;
  setActiveContractId: (id: string | null) => void;
}

const SESSION_MAX_AGE_HOURS = 4;

export const useAuditStore = create<AuditState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      userProfile: null,
      sessionStartedAt: null,
      activeContractId: null,
      activeContract: null,
      activeReport: null,

      login: (profile) => set({
        isAuthenticated: true,
        userProfile: profile,
        sessionStartedAt: new Date().toISOString(),
      }),

      /**
       * Session-Scoped File Handling (Security 5.1):
       * On logout, trigger async cleanup of all uploaded/exported files from
       * Supabase Storage for the active contract before clearing local state.
       */
      logout: () => {
        const { activeContractId } = get();
        // Fire-and-forget cleanup — non-blocking so UI doesn't wait
        if (activeContractId) {
          api.cleanupSession(activeContractId).catch(() => {
            // Silently ignore cleanup failures — session is cleared regardless
          });
        }
        signOutFromSupabase().catch(() => {
          // Silently ignore — local state is cleared regardless
        });
        set({
          isAuthenticated: false,
          userProfile: null,
          activeContractId: null,
          activeContract: null,
          activeReport: null,
          sessionStartedAt: null,
        });
      },

      setContract: (contract) => set({
        activeContract: contract,
        activeContractId: contract ? contract.id : null,
      }),

      setReport: (report) => set({ activeReport: report }),

      setActiveContractId: (id) => set({ activeContractId: id }),
    }),
    {
      name: 'adsentry-audit-store',
      onRehydrateStorage: () => (state) => {
        /**
         * Session-Scoped File Handling (Security 5.1):
         * On hydration from localStorage, check if the session has exceeded
         * SESSION_MAX_AGE_HOURS. If so, auto-logout and clean up files.
         */
        if (!state) return;
        const startedAt = state.sessionStartedAt;
        if (startedAt && state.isAuthenticated) {
          const ageMs = Date.now() - new Date(startedAt).getTime();
          const ageHours = ageMs / (1000 * 60 * 60);
          if (ageHours > SESSION_MAX_AGE_HOURS) {
            state.logout();
          }
        }
      },
    }
  )
);
