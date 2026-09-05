/**
 * Types for the simulated identity-verification (KYC) flow.
 *
 * This is a DEMO platform: no real identity verification is performed, no
 * document is checked against any registry, and users are told not to upload
 * real identity documents. These types mirror the backend contract only.
 */

export type KycStatus = 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED';

export type KycLevel = 'BASIC' | 'ADVANCED';

export type KycDocumentType = 'LICENSE' | 'ID_CARD';

export type KycDocumentSide = 'front' | 'back';

export interface KycSubmission {
  id: string;
  level: KycLevel;
  status: KycStatus;
  fullName: string;
  documentType: KycDocumentType | null;
  documentNumber: string;
  hasFrontImage: boolean;
  hasBackImage: boolean;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface KycOverview {
  basicStatus: KycStatus;
  advancedStatus: KycStatus;
  canSubmitBasic: boolean;
  canSubmitAdvanced: boolean;
  /** Server-authored reminder that this verification is simulated. */
  demoNotice: string;
  submissions: KycSubmission[];
}

export interface BasicKycPayload {
  fullName: string;
  documentType: KycDocumentType;
  documentNumber: string;
}

export interface AdvancedKycPayload {
  frontImage: File;
  backImage: File;
}

/** Error codes the KYC endpoints can return, branched on by the UI. */
export type KycErrorCode =
  | 'BASIC_KYC_REQUIRED'
  | 'KYC_ALREADY_PENDING'
  | 'KYC_ALREADY_APPROVED'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FILE_TYPE';
