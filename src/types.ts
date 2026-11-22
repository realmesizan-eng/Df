export interface UserProfile {
  id: number;
  fullName: string;
  email: string;
  phone: string;
}

export interface PlanItem {
  id: number;
  code: string;
  name: string;
  billing_type: 'monthly' | 'lifetime';
  price_bdt: number;
  duration_days: number | null;
  device_limit: number;
  description: string;
  is_active: number;
  updated_at: string;
}

export interface CustomerPayment {
  id: number;
  amount_bdt: number;
  payment_method: string;
  receiver_number: string;
  sender_number: string;
  transaction_id: string;
  customer_note: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  admin_note: string;
  reviewed_at: string | null;
  created_at: string;
  plan_name: string;
  billing_type: string;
  issued_license_prefix: string | null;
  license_status: string | null;
}

export interface AdminPayment extends CustomerPayment {
  user_id: number;
  plan_id: number;
  customer_name: string;
  customer_email: string;
  reviewed_by: string;
  issued_license_id: number | null;
}

export interface LicenseRecord {
  id: number;
  key_prefix: string;
  plan_type: 'monthly' | 'lifetime';
  status: 'ISSUED' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  device_label: string | null;
  activated_at: string | null;
  expires_at: string | null;
  revoked_reason: string;
  created_at: string;
  plan_name: string;
  price_bdt?: number;
  customer_name?: string | null;
  customer_email?: string | null;
}

export interface UrlCheckFinding {
  code: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  title: string;
  detail: string;
}

export interface UrlCheckResponse {
  normalizedUrl: string;
  hostname: string;
  riskLevel: 'HIGH' | 'SUSPICIOUS' | 'CAUTION' | 'NO_KNOWN_RED_FLAGS';
  score: number;
  findings: UrlCheckFinding[];
  threatIntelSource: string;
  limitationsNotice: string;
}

export interface ApkRelease {
  id: number;
  version_code: number;
  version_name: string;
  release_notes: string;
  is_mandatory: boolean | number;
  file_name: string;
  file_size_bytes: number;
  sha256_hash: string;
  signing_cert_sha256: string;
  uploaded_by?: string;
  created_at: string;
  downloadUrl?: string;
}

export interface AnnouncementItem {
  id: number;
  title: string;
  body: string;
  severity: 'INFO' | 'SECURITY' | 'UPDATE';
  published_by: string;
  created_at: string;
}

export interface AdminReports {
  totalCustomers: number;
  approvedRevenueBdt: number;
  pendingPaymentsCount: number;
  apkReleasesCount: number;
  paymentsByStatus: Array<{ status: string; count: number; total_bdt: number }>;
  licensesByStatus: Array<{ status: string; count: number }>;
  licensesByPlan: Array<{ plan_type: string; count: number }>;
}

export interface AdminCustomer {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  created_at: string;
  payment_count: number;
  active_licenses: number;
}

export interface AuditLogEntry {
  id: number;
  actor_type: string;
  actor_id: string;
  action: string;
  target: string;
  details: string;
  ip_address: string;
  created_at: string;
}

export interface SupportInfo {
  appName: string;
  tagline: string;
  supportNumber: string;
  whatsappUrl: string;
  paymentMethod: string;
  bkashReceiverNumber: string;
  affiliationDisclaimer: string;
  securityDisclosure: string;
  helpTopics: Array<{ id: string; title: string; steps: string[] }>;
  faqs: Array<{ q: string; a: string }>;
}

export interface ProjectSourceFile {
  path: string;
  size: number;
  group: string;
}
