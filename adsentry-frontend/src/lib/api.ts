import { getSessionToken } from './supabase';

// Toggle between Mock Data and Live API
export const USE_MOCK_DATA = false;

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ==========================================
// DATA MODELS & ENUMERATIONS
// ==========================================

export type ComplianceStatus = 'COMPLIANT' | 'MINOR_DEVIATION' | 'MAJOR_BREACH';
export type DiscrepancyType = 'MISSED' | 'SHORTENED' | 'OUT_OF_SLOT' | 'DUPLICATE_BILLED';
export type ReportStatus = 'DRAFT' | 'FINAL' | 'EXPORTED';

export interface Contract {
  id: string;
  organization_id: string;
  brand_name: string;
  campaign_name: string;
  channel: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  contracted_airings: number;
  spot_duration_sec: number;
  cost_per_airing: number;
  total_contract_value: number;
  status: 'DRAFT' | 'CONFIRMED';
  time_window_tolerance_minutes: number;
  compliance_threshold_pct: number;
  /** Discrepancy Detection Accuracy (5.2): fraction of contracted duration required (e.g. 0.90) */
  duration_tolerance_pct?: number;
  raw_upload_path?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface BroadcastLog {
  id: string;
  contract_id: string;
  channel: string;
  air_date: string; // YYYY-MM-DD
  air_time: string; // HH:MM:SS
  spot_duration_sec: number;
  ad_identifier?: string | null;
  raw_upload_path?: string | null;
  created_at?: string;
}

export interface Discrepancy {
  id: string;
  contract_id: string;
  type: DiscrepancyType;
  expected_value: string;
  actual_value: string | null;
  financial_impact: number;
  air_date?: string;
  channel?: string;
  matched_log_id?: string | null;
  created_at?: string;
}

export interface AuditReport {
  id: string;
  contract_id: string;
  generated_date: string;
  total_overpayment: number;
  compliance_rate: number;
  compliance_status: ComplianceStatus;
  /** Total count of compliant (delivered) airings, populated from dashboard kpi_cards */
  total_delivered?: number;
  ai_summary_text?: string | null;
  status: ReportStatus;
  exported_pdf_path?: string | null;
  exported_xlsx_path?: string | null;
  created_at?: string;
}

/** A single field correction entry from the audit trail */
export interface AuditCorrection {
  id: string;
  contract_id: string;
  field_name: string;
  original_value: string | null;
  corrected_value: string | null;
  corrected_by: string | null;
  created_at: string;
}

// Helper to format currency in PKR format: Rs. 12,456,780
export const formatPKR = (amount: number): string => {
  return 'Rs. ' + Math.round(amount).toLocaleString('en-US');
};

// ==========================================
// IN-MEMORY DATABASE FOR MOCK ACTIONS
// ==========================================

const DEFAULT_ORG_ID = 'o1111111-1111-1111-1111-111111111111';
const DEFAULT_CONTRACT_ID = 'c1111111-1111-1111-1111-111111111111';

// Initial Mock Contract
const mockContracts: Record<string, Contract> = {
  [DEFAULT_CONTRACT_ID]: {
    id: DEFAULT_CONTRACT_ID,
    organization_id: DEFAULT_ORG_ID,
    brand_name: 'National Foods',
    campaign_name: 'National Ketchup Fiesta 2026',
    channel: 'ARY Digital',
    start_date: '2026-07-01',
    end_date: '2026-07-31',
    contracted_airings: 120,
    spot_duration_sec: 30,
    cost_per_airing: 85000,
    total_contract_value: 10200000, // 120 * 85000
    status: 'DRAFT',
    time_window_tolerance_minutes: 15,
    compliance_threshold_pct: 97.00,
    duration_tolerance_pct: 0.90,
    created_at: new Date('2026-07-01T12:00:00Z').toISOString(),
    updated_at: new Date('2026-07-01T12:00:00Z').toISOString(),
  }
};

// Initial Mock Broadcast Logs
const mockBroadcastLogs: Record<string, BroadcastLog[]> = {
  [DEFAULT_CONTRACT_ID]: Array.from({ length: 116 }, (_, i) => {
    const day = (i % 31) + 1;
    const formattedDay = day < 10 ? `0${day}` : `${day}`;
    return {
      id: `l-${i}`,
      contract_id: DEFAULT_CONTRACT_ID,
      channel: 'ARY Digital',
      air_date: `2026-07-${formattedDay}`,
      air_time: '20:15:00',
      spot_duration_sec: 30,
      ad_identifier: 'NAT-KET-30S',
      created_at: new Date().toISOString(),
    };
  })
};

// Add explicit discrepancies to default contract
const mockDiscrepancies: Record<string, Discrepancy[]> = {
  [DEFAULT_CONTRACT_ID]: [
    { id: 'd-1', contract_id: DEFAULT_CONTRACT_ID, type: 'MISSED', expected_value: '2026-07-05 20:15:00', actual_value: null, financial_impact: 85000, air_date: '2026-07-05', channel: 'ARY Digital' },
    { id: 'd-2', contract_id: DEFAULT_CONTRACT_ID, type: 'MISSED', expected_value: '2026-07-12 20:30:00', actual_value: null, financial_impact: 85000, air_date: '2026-07-12', channel: 'ARY Digital' },
    { id: 'd-3', contract_id: DEFAULT_CONTRACT_ID, type: 'MISSED', expected_value: '2026-07-18 20:45:00', actual_value: null, financial_impact: 85000, air_date: '2026-07-18', channel: 'ARY Digital' },
    { id: 'd-4', contract_id: DEFAULT_CONTRACT_ID, type: 'MISSED', expected_value: '2026-07-25 21:00:00', actual_value: null, financial_impact: 85000, air_date: '2026-07-25', channel: 'ARY Digital' },
    { id: 'd-5', contract_id: DEFAULT_CONTRACT_ID, type: 'SHORTENED', expected_value: '30s', actual_value: '15s', financial_impact: 42500, air_date: '2026-07-03', channel: 'ARY Digital', matched_log_id: 'l-3' },
    { id: 'd-6', contract_id: DEFAULT_CONTRACT_ID, type: 'SHORTENED', expected_value: '30s', actual_value: '20s', financial_impact: 28333.33, air_date: '2026-07-10', channel: 'ARY Digital', matched_log_id: 'l-10' },
    { id: 'd-7', contract_id: DEFAULT_CONTRACT_ID, type: 'SHORTENED', expected_value: '30s', actual_value: '10s', financial_impact: 56666.67, air_date: '2026-07-22', channel: 'ARY Digital', matched_log_id: 'l-22' },
    { id: 'd-8', contract_id: DEFAULT_CONTRACT_ID, type: 'OUT_OF_SLOT', expected_value: '2026-07-08 20:00:00', actual_value: '2026-07-08 14:12:00', financial_impact: 85000, air_date: '2026-07-08', channel: 'ARY Digital', matched_log_id: 'l-8' },
    { id: 'd-9', contract_id: DEFAULT_CONTRACT_ID, type: 'OUT_OF_SLOT', expected_value: '2026-07-15 20:30:00', actual_value: '2026-07-15 16:45:00', financial_impact: 85000, air_date: '2026-07-15', channel: 'ARY Digital', matched_log_id: 'l-15' },
    { id: 'd-10', contract_id: DEFAULT_CONTRACT_ID, type: 'OUT_OF_SLOT', expected_value: '2026-07-29 21:00:00', actual_value: '2026-07-29 23:45:00', financial_impact: 85000, air_date: '2026-07-29', channel: 'ARY Digital', matched_log_id: 'l-29' },
    { id: 'd-11', contract_id: DEFAULT_CONTRACT_ID, type: 'DUPLICATE_BILLED', expected_value: 'No additional contracted slot', actual_value: '2026-07-14 20:20:00 (Double charge)', financial_impact: 85000, air_date: '2026-07-14', channel: 'ARY Digital', matched_log_id: 'l-14' },
    { id: 'd-12', contract_id: DEFAULT_CONTRACT_ID, type: 'DUPLICATE_BILLED', expected_value: 'No additional contracted slot', actual_value: '2026-07-28 20:40:00 (Double charge)', financial_impact: 85000, air_date: '2026-07-28', channel: 'ARY Digital', matched_log_id: 'l-28' },
  ]
};

// Mock Audit Reports
const mockAuditReports: Record<string, AuditReport> = {
  [DEFAULT_CONTRACT_ID]: {
    id: 'rep-1',
    contract_id: DEFAULT_CONTRACT_ID,
    generated_date: new Date().toISOString(),
    total_overpayment: 892500,
    compliance_rate: 90.00,
    compliance_status: 'MAJOR_BREACH',
    total_delivered: 104,
    ai_summary_text: 'AdSentry AI reconciled 120 expected airings against 116 actual broadcast logs for ARY Digital. A total of 12 critical discrepancies were flagged: 4 Missed spots, 3 Shortened spots, 3 Out-of-slot airings, and 2 Duplicate billings. This results in an estimated total overpayment of Rs. 892,500 (approx. 8.75% of the total contract value of Rs. 10,200,000). We recommend requesting credit notes from ARY Digital for the missed and shortened durations, and challenging the duplicate charges.',
    status: 'DRAFT',
    created_at: new Date().toISOString(),
  }
};

// Mock Audit Trail corrections
const mockAuditTrail: Record<string, AuditCorrection[]> = {
  [DEFAULT_CONTRACT_ID]: [
    { id: 'corr-1', contract_id: DEFAULT_CONTRACT_ID, field_name: 'cost_per_airing', original_value: '80000', corrected_value: '85000', corrected_by: 'u1111111-1111-1111-1111-111111111111', created_at: new Date('2026-07-01T14:00:00Z').toISOString() },
    { id: 'corr-2', contract_id: DEFAULT_CONTRACT_ID, field_name: 'contracted_airings', original_value: '100', corrected_value: '120', corrected_by: 'u1111111-1111-1111-1111-111111111111', created_at: new Date('2026-07-01T13:30:00Z').toISOString() },
  ]
};

// Mock Q&A cache
const mockAnswers: Record<string, string> = {
  'default': 'AdSentry is currently examining this campaign. Please ask details about financial overpayments or specific discrepancy types.',
  'what is the biggest discrepancy?': 'The biggest financial discrepancies are the MISSED spots (4 occurrences) and OUT_OF_SLOT airings (3 occurrences), each resulting in a loss of Rs. 85,000 per spot. In total, missed airings account for Rs. 340,000 of exposure, and out-of-slot airings account for Rs. 255,000.',
  'which channel is worst?': 'For this single-channel campaign, ARY Digital is the sole operator with a compliance rate of 90.00%, representing a major breach of the contract threshold (97.00%). The total overpayment exposure on this channel is Rs. 892,500.',
  'draft a dispute email.': `Subject: Notice of Media Airing Discrepancies - Campaign: National Ketchup Fiesta 2026\n\nDear ARY Digital Operations Team,\n\nWe are writing on behalf of National Foods to report several airing discrepancies identified during our media audit of the "National Ketchup Fiesta 2026" campaign for July 2026.\n\nAccording to our verified logs, we have detected the following deviations from our media contract:\n1. Missed Airings: 4 contracted spots failed to air entirely (representing Rs. 340,000 in undelivered inventory).\n2. Shortened Spots: 3 spots aired with incomplete durations (representing Rs. 127,500 in pro-rated overcharge).\n3. Out of Slot: 3 spots aired completely outside our contracted time-tolerance windows (representing Rs. 255,000).\n4. Duplicate Billing: 2 instances of double-billed runs in the same slots (representing Rs. 170,000).\n\nTotal Estimated Financial Adjustment required: Rs. 892,500.\n\nPlease find attached the detailed line-by-line audit report. We request that you issue a credit note for Rs. 892,500, or provide make-goods of equivalent value in prime-time slots.\n\nSincerely,\nAyesha\nBrand Marketing Manager, National Foods`
};

// Simulation helper delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper for fetch headers with Auth Token
const getHeaders = async () => {
  const token = await getSessionToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

// ==========================================
// API CLIENT IMPLEMENTATIONS
// ==========================================

export const api = {
  // 1. Upload & Setup - Contract Upload
  uploadContract: async (organizationId: string, file: File): Promise<{ contract: Contract; parsed_row: any; processingTimeMs?: number }> => {
    if (USE_MOCK_DATA) {
      await delay(1200);
      const newId = `c-${Math.random().toString(36).substr(2, 9)}`;
      const mockNew: Contract = {
        id: newId,
        organization_id: organizationId,
        brand_name: 'National Foods',
        campaign_name: 'National Recipe Mix 2026',
        channel: 'Hum TV',
        start_date: '2026-07-01',
        end_date: '2026-07-31',
        contracted_airings: 90,
        spot_duration_sec: 30,
        cost_per_airing: 95000,
        total_contract_value: 8550000,
        status: 'DRAFT',
        time_window_tolerance_minutes: 15,
        compliance_threshold_pct: 97.00,
        duration_tolerance_pct: 0.90,
        raw_upload_path: `contracts/${file.name}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockContracts[newId] = mockNew;
      return { contract: mockNew, parsed_row: { brand_name: mockNew.brand_name, campaign_name: mockNew.campaign_name, channel: mockNew.channel, start_date: mockNew.start_date, end_date: mockNew.end_date, contracted_airings: mockNew.contracted_airings, spot_duration_sec: mockNew.spot_duration_sec, cost_per_airing: mockNew.cost_per_airing, total_contract_value: mockNew.total_contract_value }, processingTimeMs: 850 };
    }

    const formData = new FormData();
    formData.append('organization_id', organizationId);
    formData.append('file', file);

    const token = await getSessionToken();
    const response = await fetch(`${API_BASE_URL}/contracts/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    if (!response.ok) throw new Error('Contract upload failed.');
    const processingTimeMs = Number(response.headers.get('X-Processing-Time-Ms') || 0);
    const data = await response.json();
    return { ...data, processingTimeMs };
  },

  // POST /contracts/{contract_id}/broadcast-logs/upload
  uploadBroadcastLogs: async (contractId: string, file: File): Promise<{ inserted_count: number; processingTimeMs?: number }> => {
    if (USE_MOCK_DATA) {
      await delay(1500);
      const contract = mockContracts[contractId] || mockContracts[DEFAULT_CONTRACT_ID];
      const count = Math.round(contract.contracted_airings * 0.96);
      mockBroadcastLogs[contractId] = Array.from({ length: count }, (_, i) => {
        const day = (i % 30) + 1;
        const formattedDay = day < 10 ? `0${day}` : `${day}`;
        return { id: `l-${contractId}-${i}`, contract_id: contractId, channel: contract.channel, air_date: `2026-07-${formattedDay}`, air_time: '20:10:00', spot_duration_sec: contract.spot_duration_sec, ad_identifier: 'MOCK-AD-LOG', created_at: new Date().toISOString() };
      });
      return { inserted_count: count, processingTimeMs: 1200 };
    }

    const formData = new FormData();
    formData.append('file', file);

    const token = await getSessionToken();
    const response = await fetch(`${API_BASE_URL}/contracts/${contractId}/broadcast-logs/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    if (!response.ok) throw new Error('Broadcast log upload failed.');
    const processingTimeMs = Number(response.headers.get('X-Processing-Time-Ms') || 0);
    const data = await response.json();
    return { ...data, processingTimeMs };
  },

  // GET /contracts/{contract_id}
  getContract: async (contractId: string): Promise<{ contract: Contract; campaign_summary: any }> => {
    if (USE_MOCK_DATA) {
      await delay(300);
      const contract = mockContracts[contractId] || mockContracts[DEFAULT_CONTRACT_ID];
      return { contract, campaign_summary: { total_contract_value: contract.total_contract_value, campaign_window: { start_date: contract.start_date, end_date: contract.end_date }, contracted_spots: contract.contracted_airings } };
    }
    const response = await fetch(`${API_BASE_URL}/contracts/${contractId}`, { headers: await getHeaders() });
    if (!response.ok) throw new Error('Failed to retrieve contract details.');
    return response.json();
  },

  // PATCH /contracts/{contract_id}
  updateContract: async (contractId: string, data: Partial<Contract>): Promise<{ contract: Contract; campaign_summary: any }> => {
    if (USE_MOCK_DATA) {
      await delay(600);
      const contract = mockContracts[contractId] || mockContracts[DEFAULT_CONTRACT_ID];
      const updated: Contract = { ...contract, ...data, updated_at: new Date().toISOString() };
      if (data.contracted_airings !== undefined || data.cost_per_airing !== undefined) {
        updated.total_contract_value = updated.contracted_airings * updated.cost_per_airing;
      }
      mockContracts[contractId] = updated;
      return { contract: updated, campaign_summary: { total_contract_value: updated.total_contract_value, campaign_window: { start_date: updated.start_date, end_date: updated.end_date }, contracted_spots: updated.contracted_airings } };
    }
    const response = await fetch(`${API_BASE_URL}/contracts/${contractId}`, { method: 'PATCH', headers: await getHeaders(), body: JSON.stringify(data) });
    if (!response.ok) throw new Error('Failed to update contract.');
    return response.json();
  },

  // POST /contracts/{contract_id}/confirm
  confirmContract: async (contractId: string): Promise<{ contract: Contract; campaign_summary: any }> => {
    if (USE_MOCK_DATA) {
      await delay(500);
      const contract = mockContracts[contractId] || mockContracts[DEFAULT_CONTRACT_ID];
      contract.status = 'CONFIRMED';
      mockContracts[contractId] = contract;
      return { contract, campaign_summary: { total_contract_value: contract.total_contract_value, campaign_window: { start_date: contract.start_date, end_date: contract.end_date }, contracted_spots: contract.contracted_airings } };
    }
    const response = await fetch(`${API_BASE_URL}/contracts/${contractId}/confirm`, { method: 'POST', headers: await getHeaders() });
    if (!response.ok) throw new Error('Failed to confirm contract.');
    return response.json();
  },

  // POST /contracts/{contract_id}/run-audit
  runAudit: async (contractId: string): Promise<{ contract_id: string; total_rows: number; counts_by_type: Record<string, number>; audit_report: AuditReport }> => {
    if (USE_MOCK_DATA) {
      await delay(1800);
      const contract = mockContracts[contractId] || mockContracts[DEFAULT_CONTRACT_ID];
      if (!mockDiscrepancies[contractId]) {
        mockDiscrepancies[contractId] = [
          { id: `d-n-1`, contract_id: contractId, type: 'MISSED', expected_value: `${contract.start_date} 20:15:00`, actual_value: null, financial_impact: contract.cost_per_airing, air_date: contract.start_date, channel: contract.channel },
          { id: `d-n-2`, contract_id: contractId, type: 'MISSED', expected_value: `${contract.end_date} 20:15:00`, actual_value: null, financial_impact: contract.cost_per_airing, air_date: contract.end_date, channel: contract.channel },
          { id: `d-n-3`, contract_id: contractId, type: 'SHORTENED', expected_value: `${contract.spot_duration_sec}s`, actual_value: `${contract.spot_duration_sec - 15}s`, financial_impact: contract.cost_per_airing * 0.5, air_date: contract.start_date, channel: contract.channel, matched_log_id: `l-${contractId}-1` },
          { id: `d-n-4`, contract_id: contractId, type: 'OUT_OF_SLOT', expected_value: `${contract.start_date} 20:15:00`, actual_value: `${contract.start_date} 16:30:00`, financial_impact: contract.cost_per_airing, air_date: contract.start_date, channel: contract.channel, matched_log_id: `l-${contractId}-2` },
        ];
      }
      const discrepancies = mockDiscrepancies[contractId];
      const totalOverpayment = discrepancies.reduce((sum, item) => sum + item.financial_impact, 0);
      const complianceRate = Math.round(((contract.contracted_airings - discrepancies.length) / contract.contracted_airings) * 100);
      let complianceStatus: ComplianceStatus = 'COMPLIANT';
      if (complianceRate < 90) complianceStatus = 'MAJOR_BREACH';
      else if (complianceRate < contract.compliance_threshold_pct) complianceStatus = 'MINOR_DEVIATION';
      const delivered = contract.contracted_airings - discrepancies.filter(d => ['MISSED', 'OUT_OF_SLOT'].includes(d.type)).length;
      const report: AuditReport = { id: `rep-${contractId}`, contract_id: contractId, generated_date: new Date().toISOString(), total_overpayment: totalOverpayment, compliance_rate: complianceRate, compliance_status: complianceStatus, total_delivered: delivered, status: 'DRAFT', ai_summary_text: `AdSentry AI parsed ${contract.contracted_airings} slots. Found ${discrepancies.length} discrepancy events. Total financial exposure: ${formatPKR(totalOverpayment)}. Compliance rate: ${complianceRate}%.`, created_at: new Date().toISOString() };
      mockAuditReports[contractId] = report;
      const counts = discrepancies.reduce((acc, curr) => { acc[curr.type] = (acc[curr.type] || 0) + 1; return acc; }, {} as Record<string, number>);
      return { contract_id: contractId, total_rows: discrepancies.length, counts_by_type: counts, audit_report: report };
    }
    const response = await fetch(`${API_BASE_URL}/contracts/${contractId}/run-audit`, { method: 'POST', headers: await getHeaders() });
    if (!response.ok) throw new Error('Reconciliation audit failed.');
    return response.json();
  },

  // GET /contracts/{contract_id}/dashboard
  getDashboard: async (contractId: string): Promise<{
    compliance_ring: { rate: number; status: ComplianceStatus };
    kpi_cards: { total_delivered: number; total_missed: number; total_shortened: number; estimated_overpayment: number };
    weekly_trend: { week_start: string; compliance_rate: number }[];
    channel_breakdown: { channel: string; compliance_rate: number; financial_impact: number }[];
  }> => {
    if (USE_MOCK_DATA) {
      await delay(800);
      const contract = mockContracts[contractId] || mockContracts[DEFAULT_CONTRACT_ID];
      const report = mockAuditReports[contractId] || mockAuditReports[DEFAULT_CONTRACT_ID];
      const discrepancies = mockDiscrepancies[contractId] || mockDiscrepancies[DEFAULT_CONTRACT_ID];
      const logs = mockBroadcastLogs[contractId] || mockBroadcastLogs[DEFAULT_CONTRACT_ID];
      const counts = discrepancies.reduce((acc, curr) => { acc[curr.type] = (acc[curr.type] || 0) + 1; return acc; }, { MISSED: 0, SHORTENED: 0, OUT_OF_SLOT: 0, DUPLICATE_BILLED: 0 } as Record<string, number>);
      const delivered = Math.max(0, logs.length - counts.DUPLICATE_BILLED - counts.OUT_OF_SLOT);
      const weeklyTrend = [{ week_start: '2026-07-01', compliance_rate: 94.5 }, { week_start: '2026-07-08', compliance_rate: 91.2 }, { week_start: '2026-07-15', compliance_rate: 89.8 }, { week_start: '2026-07-22', compliance_rate: 92.4 }, { week_start: '2026-07-29', compliance_rate: report.compliance_rate }];
      const channelBreakdown = [{ channel: contract.channel, compliance_rate: report.compliance_rate, financial_impact: report.total_overpayment }];
      return { compliance_ring: { rate: report.compliance_rate, status: report.compliance_status }, kpi_cards: { total_delivered: delivered, total_missed: counts.MISSED, total_shortened: counts.SHORTENED, estimated_overpayment: report.total_overpayment }, weekly_trend: weeklyTrend, channel_breakdown: channelBreakdown };
    }
    const response = await fetch(`${API_BASE_URL}/contracts/${contractId}/dashboard`, { headers: await getHeaders() });
    if (!response.ok) throw new Error('Failed to load dashboard data.');
    return response.json();
  },

  // GET /contracts/{contract_id}/financial-impact
  getFinancialImpact: async (contractId: string): Promise<{ total_overpayment: number; loss_by_type: { type: string; financial_impact: number }[]; loss_by_channel: { channel: string; financial_impact: number }[] }> => {
    if (USE_MOCK_DATA) {
      await delay(600);
      const report = mockAuditReports[contractId] || mockAuditReports[DEFAULT_CONTRACT_ID];
      const discrepancies = mockDiscrepancies[contractId] || mockDiscrepancies[DEFAULT_CONTRACT_ID];
      const contract = mockContracts[contractId] || mockContracts[DEFAULT_CONTRACT_ID];
      const typeLosses = discrepancies.reduce((acc, curr) => { acc[curr.type] = (acc[curr.type] || 0) + curr.financial_impact; return acc; }, {} as Record<string, number>);
      return { total_overpayment: report.total_overpayment, loss_by_type: Object.entries(typeLosses).map(([type, amount]) => ({ type, financial_impact: amount })), loss_by_channel: [{ channel: contract.channel, financial_impact: report.total_overpayment }] };
    }
    const response = await fetch(`${API_BASE_URL}/contracts/${contractId}/financial-impact`, { headers: await getHeaders() });
    if (!response.ok) throw new Error('Failed to load financial impact calculations.');
    return response.json();
  },

  // GET /contracts/{contract_id}/discrepancies
  listDiscrepancies: async (contractId: string, type?: string): Promise<Discrepancy[]> => {
    if (USE_MOCK_DATA) {
      await delay(600);
      let list = mockDiscrepancies[contractId] || mockDiscrepancies[DEFAULT_CONTRACT_ID];
      if (type && type !== 'ALL') list = list.filter(item => item.type === type);
      return list;
    }
    let url = `${API_BASE_URL}/contracts/${contractId}/discrepancies`;
    if (type) url += `?type=${type}`;
    const response = await fetch(url, { headers: await getHeaders() });
    if (!response.ok) throw new Error('Failed to retrieve discrepancies.');
    return response.json();
  },

  // GET /discrepancies/{discrepancy_id}
  getDiscrepancy: async (discrepancyId: string): Promise<{ discrepancy: Discrepancy; matched_contract_line: any; broadcast_log: BroadcastLog | null }> => {
    if (USE_MOCK_DATA) {
      await delay(300);
      let discrepancy: Discrepancy | undefined;
      for (const contractId in mockDiscrepancies) {
        discrepancy = mockDiscrepancies[contractId].find(d => d.id === discrepancyId);
        if (discrepancy) break;
      }
      if (!discrepancy) discrepancy = mockDiscrepancies[DEFAULT_CONTRACT_ID][0];
      const contract = mockContracts[discrepancy.contract_id] || mockContracts[DEFAULT_CONTRACT_ID];
      const logs = mockBroadcastLogs[discrepancy.contract_id] || mockBroadcastLogs[DEFAULT_CONTRACT_ID];
      const broadcast_log = discrepancy.matched_log_id ? (logs.find(l => l.id === discrepancy!.matched_log_id) || null) : null;
      return { discrepancy, matched_contract_line: { contract_id: contract.id, channel: discrepancy.channel || contract.channel, air_date: discrepancy.air_date, spot_duration_sec: contract.spot_duration_sec, cost_per_airing: contract.cost_per_airing }, broadcast_log };
    }
    const response = await fetch(`${API_BASE_URL}/discrepancies/${discrepancyId}`, { headers: await getHeaders() });
    if (!response.ok) throw new Error('Failed to load discrepancy details.');
    return response.json();
  },

  // POST /contracts/{contract_id}/ai-summary
  createAiSummary: async (contractId: string): Promise<{ summary: string; generationTimeMs?: number }> => {
    if (USE_MOCK_DATA) {
      await delay(2000);
      const report = mockAuditReports[contractId] || mockAuditReports[DEFAULT_CONTRACT_ID];
      return { summary: report.ai_summary_text || '', generationTimeMs: 1850 };
    }
    const response = await fetch(`${API_BASE_URL}/contracts/${contractId}/ai-summary`, { method: 'POST', headers: await getHeaders() });
    if (!response.ok) throw new Error('Failed to generate AI summary narrative.');
    const generationTimeMs = Number(response.headers.get('X-Generation-Time-Ms') || 0);
    const result = await response.json();
    return { summary: result.summary, generationTimeMs };
  },

  // POST /contracts/{contract_id}/ai-summary/ask
  askAiQuestion: async (contractId: string, question: string): Promise<{ answer: string }> => {
    if (USE_MOCK_DATA) {
      await delay(1200);
      const lowerQ = question.toLowerCase().trim();
      const answer = mockAnswers[lowerQ] || mockAnswers['default'];
      return { answer };
    }
    const response = await fetch(`${API_BASE_URL}/contracts/${contractId}/ai-summary/ask`, { method: 'POST', headers: await getHeaders(), body: JSON.stringify({ question }) });
    if (!response.ok) throw new Error('AI follow-up question query failed.');
    return response.json();
  },

  // POST /contracts/{contract_id}/export/pdf
  exportPdf: async (contractId: string): Promise<{ path: string; download_url: string }> => {
    if (USE_MOCK_DATA) {
      await delay(1800);
      return { path: `${contractId}/audit-report-mock.pdf`, download_url: '#pdf-download' };
    }
    const response = await fetch(`${API_BASE_URL}/contracts/${contractId}/export/pdf`, { method: 'POST', headers: await getHeaders() });
    if (!response.ok) throw new Error('Failed to export PDF report.');
    return response.json();
  },

  // POST /contracts/{contract_id}/export/xlsx
  exportXlsx: async (contractId: string): Promise<{ path: string; download_url: string }> => {
    if (USE_MOCK_DATA) {
      await delay(1500);
      return { path: `${contractId}/audit-report-mock.xlsx`, download_url: '#xlsx-download' };
    }
    const response = await fetch(`${API_BASE_URL}/contracts/${contractId}/export/xlsx`, { method: 'POST', headers: await getHeaders() });
    if (!response.ok) throw new Error('Failed to export XLSX spreadsheet.');
    return response.json();
  },

  // DELETE /contracts/{contract_id}/session
  // Session-Scoped File Handling (Security 5.1)
  cleanupSession: async (contractId: string): Promise<{ total_deleted: number; deleted_paths: string[] }> => {
    if (USE_MOCK_DATA) {
      await delay(300);
      return { total_deleted: 2, deleted_paths: [`contracts/${contractId}`, `broadcast-logs/${contractId}`] };
    }
    try {
      const response = await fetch(`${API_BASE_URL}/contracts/${contractId}/session`, {
        method: 'DELETE',
        headers: await getHeaders(),
      });
      if (!response.ok) return { total_deleted: 0, deleted_paths: [] };
      return response.json();
    } catch {
      // Non-blocking: cleanup failures should not prevent logout
      return { total_deleted: 0, deleted_paths: [] };
    }
  },

  // GET /contracts/{contract_id}/audit-trail
  // Audit Trail (Security 5.1)
  getAuditTrail: async (contractId: string): Promise<{ total_corrections: number; corrections: AuditCorrection[] }> => {
    if (USE_MOCK_DATA) {
      await delay(300);
      const corrections = mockAuditTrail[contractId] || mockAuditTrail[DEFAULT_CONTRACT_ID] || [];
      return { total_corrections: corrections.length, corrections };
    }
    const response = await fetch(`${API_BASE_URL}/contracts/${contractId}/audit-trail`, { headers: await getHeaders() });
    if (!response.ok) throw new Error('Failed to load audit trail.');
    return response.json();
  },
};
