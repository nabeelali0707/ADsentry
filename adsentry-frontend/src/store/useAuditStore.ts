import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Contract, AuditReport } from '@/lib/api';

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

export const useAuditStore = create<AuditState>()(
  persist(
    (set) => ({
      isAuthenticated: true, // Default true for hackathon preview convenience
      userProfile: {
        id: 'u1111111-1111-1111-1111-111111111111',
        organization_id: 'o1111111-1111-1111-1111-111111111111',
        full_name: 'Ayesha Khan',
        role: 'BRAND',
      },
      activeContractId: 'c1111111-1111-1111-1111-111111111111', // default loaded
      activeContract: {
        id: 'c1111111-1111-1111-1111-111111111111',
        organization_id: 'o1111111-1111-1111-1111-111111111111',
        brand_name: 'National Foods',
        campaign_name: 'National Ketchup Fiesta 2026',
        channel: 'ARY Digital',
        start_date: '2026-07-01',
        end_date: '2026-07-31',
        contracted_airings: 120,
        spot_duration_sec: 30,
        cost_per_airing: 85000,
        total_contract_value: 10200000,
        status: 'DRAFT',
        time_window_tolerance_minutes: 15,
        compliance_threshold_pct: 97.00,
        created_at: new Date('2026-07-01T12:00:00Z').toISOString(),
        updated_at: new Date('2026-07-01T12:00:00Z').toISOString(),
      },
      activeReport: {
        id: 'rep-1',
        contract_id: 'c1111111-1111-1111-1111-111111111111',
        generated_date: new Date().toISOString(),
        total_overpayment: 892500,
        compliance_rate: 90.00,
        compliance_status: 'MAJOR_BREACH',
        ai_summary_text: 'AdSentry AI Reconciled 120 expected airings against 116 actual broadcast logs for ARY Digital. A total of 12 critical discrepancies were flagged: 4 Missed spots, 3 Shortened spots, 3 Out-of-slot airings, and 2 Duplicate billings. This results in an estimated total overpayment of Rs. 892,500.',
        status: 'DRAFT',
        created_at: new Date().toISOString(),
      },

      login: (profile) => set({ isAuthenticated: true, userProfile: profile }),
      logout: () => set({ 
        isAuthenticated: false, 
        userProfile: null, 
        activeContractId: null, 
        activeContract: null, 
        activeReport: null 
      }),
      setContract: (contract) => set({ 
        activeContract: contract, 
        activeContractId: contract ? contract.id : null 
      }),
      setReport: (report) => set({ activeReport: report }),
      setActiveContractId: (id) => set({ activeContractId: id }),
    }),
    {
      name: 'adsentry-audit-store',
    }
  )
);
