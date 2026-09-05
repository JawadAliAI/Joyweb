'use client';

/**
 * Data hooks for the simulated KYC flow.
 *
 * Everything is keyed on `['kyc']` and invalidated after each submission, so
 * the hub, the basic form and the advanced form always agree on status.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_BASE, ApiError, api } from '@/lib/api';
import type { AdvancedKycPayload, BasicKycPayload, KycOverview } from '@/lib/kyc-types';

export const kycKey = ['kyc'] as const;

export function useKyc() {
  return useQuery({
    queryKey: kycKey,
    queryFn: () => api.get<KycOverview>('/kyc'),
    staleTime: 15_000,
  });
}

export function useSubmitBasicKyc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: BasicKycPayload) => api.post<KycOverview>('/kyc/basic', { ...body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kycKey });
    },
  });
}

/** Same cookie the JSON client echoes back for the double-submit CSRF check. */
function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(^|;\s*)cd_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[2]) : null;
}

interface KycEnvelope {
  success?: boolean;
  data?: KycOverview;
  error?: { code: string; message: string; details?: Record<string, unknown> };
}

/**
 * Advanced KYC goes up as multipart/form-data, so it bypasses the JSON `api`
 * client: the browser must set the multipart boundary itself, which means no
 * Content-Type header here. The `{success, data}` envelope is unwrapped by
 * hand to keep error codes and messages identical to every other screen.
 */
async function uploadAdvancedKyc(payload: AdvancedKycPayload): Promise<KycOverview> {
  const formData = new FormData();
  formData.append('frontImage', payload.frontImage);
  formData.append('backImage', payload.backImage);

  const headers: Record<string, string> = { Accept: 'application/json' };
  const csrf = readCsrfCookie();
  if (csrf) headers['x-csrf-token'] = csrf;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/kyc/advanced`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
      headers,
    });
  } catch {
    throw new ApiError(0, {
      code: 'NETWORK_ERROR',
      message: 'Could not reach the server. Check your connection and try again.',
    });
  }

  let payloadJson: KycEnvelope | null = null;
  try {
    payloadJson = (await response.json()) as KycEnvelope;
  } catch {
    payloadJson = null;
  }

  if (!response.ok || !payloadJson?.success) {
    throw new ApiError(
      response.status,
      payloadJson?.error ?? {
        code: 'UNEXPECTED_ERROR',
        message: 'Your documents could not be uploaded. Please try again.',
      },
    );
  }

  return payloadJson.data as KycOverview;
}

export function useSubmitAdvancedKyc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: uploadAdvancedKyc,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: kycKey });
    },
  });
}
