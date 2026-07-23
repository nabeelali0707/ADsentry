import { supabase, getSessionToken } from './supabase';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export type UserRole = 'BRAND' | 'AGENCY' | 'FINANCE';

export interface AuthProfile {
  id: string;
  organization_id: string;
  full_name: string;
  role: UserRole;
}

interface ProfileEnvelope {
  profile: AuthProfile;
  organization: { id: string; name: string } | null;
}

const authHeaders = async () => {
  const token = await getSessionToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export const signUpWithEmail = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signUp({ email, password });
  return { session: data.session, user: data.user, error };
};

export const signInWithEmail = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { session: data.session, user: data.user, error };
};

export const bootstrapProfile = async (
  fullName: string,
  organizationName: string,
  role: UserRole,
): Promise<AuthProfile> => {
  const response = await fetch(`${API_BASE_URL}/auth/bootstrap-profile`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      full_name: fullName,
      organization_name: organizationName,
      role,
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail || 'Failed to complete account setup.');
  }
  const data: ProfileEnvelope = await response.json();
  return data.profile;
};

/** Returns null if no profile exists yet (needs bootstrap) or the session is invalid. */
export const fetchMyProfile = async (): Promise<AuthProfile | null> => {
  const token = await getSessionToken();
  if (!token) return null;

  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 404 || response.status === 401) return null;
  if (!response.ok) throw new Error('Failed to load profile.');

  const data: ProfileEnvelope = await response.json();
  return data.profile;
};

export const signOutFromSupabase = async () => {
  await supabase.auth.signOut();
};

/** Maps common Supabase Auth error messages to user-readable text. */
export const mapAuthErrorMessage = (error: { message?: string } | null | undefined): string => {
  const message = error?.message?.toLowerCase() || '';

  if (message.includes('invalid login credentials') || message.includes('invalid email or password')) {
    return 'Incorrect email or password. Please try again.';
  }
  if (message.includes('email not confirmed')) {
    return 'Please confirm your email address before logging in — check your inbox for the confirmation link.';
  }
  if (message.includes('already registered') || message.includes('already exists')) {
    return 'An account with this email already exists. Please log in instead.';
  }
  if (message.includes('password')) {
    return error?.message || 'Password does not meet the requirements.';
  }
  return error?.message || 'Something went wrong. Please try again.';
};
