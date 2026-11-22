import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Check,
  Copy,
  KeyRound,
  LogOut,
  RefreshCw,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import { apiRequest, formatBytes, formatDateShort } from '../api';
import { UI_TEXT } from '../i18n';
import type { AppLang } from '../i18n';
import type {
  AdminCustomer,
  AdminPayment,
  AdminReports,
  AnnouncementItem,
  ApkRelease,
  AuditLogEntry,
  LicenseRecord,
  PlanItem,
} from '../types';

type AdminTab = 'overview' | 'payments' | 'licenses' | 'plans' | 'updates' | 'customers';

interface AdminConsoleProps {
  lang: AppLang;
  adminToken: string | null;
  adminEmail: string | null;
  onAdminAuthenticated: (token: string, email: string) => void;
  onAdminLogout: () => void;
  onHandoffLicenseKey: (key: string) => void;
}

export function AdminConsole({
  lang,
  adminToken,
  adminEmail,
  onAdminAuthenticated,
  onAdminLogout,
  onHandoffLicenseKey,
}: AdminConsoleProps) {
  const t = UI_TEXT[lang];
  const [bootstrapMode, setBootstrapMode] = useState<'loading' | 'unclaimed' | 'db' | 'env'>('loading');
  const [emailHint, setEmailHint] = useState<string>('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Admin data states
  const [reports, setReports] = useState<AdminReports | null>(null);
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [licenses, setLicenses] = useState<LicenseRecord[]>([]);
  const [licenseFilter, setLicenseFilter] = useState<'ALL' | 'ISSUED' | 'ACTIVE' | 'EXPIRED' | 'REVOKED'>('ALL');
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [releases, setReleases] = useState<ApkRelease[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  // One-time revealed license key modal banner
  const [newlyIssuedKey, setNewlyIssuedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Rejection inline state
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Manual license generator state
  const [genPlanId, setGenPlanId] = useState<number>(2);
  const [genCustomerEmail, setGenCustomerEmail] = useState('');

  // Plan editor state
  const [planDrafts, setPlanDrafts] = useState<Record<number, { name: string; priceBdt: string; durationDays: string; description: string }>>({});

  // APK upload state
  const [apkVersionCode, setApkVersionCode] = useState('2');
  const [apkVersionName, setApkVersionName] = useState('1.1.0');
  const [apkReleaseNotes, setApkReleaseNotes] = useState('Security hardening for lookalike domain detection and bKash/Nagad package signature rules.');
  const [apkMandatory, setApkMandatory] = useState(false);
  const [apkSigningCert, setApkSigningCert] = useState('');
  const [apkFile, setApkFile] = useState<File | null>(null);

  // Announcement state
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annSeverity, setAnnSeverity] = useState<'INFO' | 'SECURITY' | 'UPDATE'>('UPDATE');

  useEffect(() => {
    apiRequest<{ configured: boolean; mode: 'env' | 'db' | 'unclaimed'; adminEmailHint?: string }>(
      '/api/admin/bootstrap-status'
    )
      .then((res) => {
        setBootstrapMode(res.mode);
        if (res.adminEmailHint) {
          setEmailHint(res.adminEmailHint);
          setAuthEmail(res.adminEmailHint);
        }
      })
      .catch(() => setBootstrapMode('unclaimed'));
  }, []);

  const loadAllAdminData = useCallback(async () => {
    if (!adminToken) return;
    setBusy(true);
    setError(null);
    try {
      const [rep, pay, lic, pl, rel, ann, cust, logs] = await Promise.all([
        apiRequest<AdminReports>('/api/admin/reports', { token: adminToken }),
        apiRequest<{ payments: AdminPayment[] }>('/api/admin/payments', { token: adminToken }),
        apiRequest<{ licenses: LicenseRecord[] }>('/api/admin/licenses', { token: adminToken }),
        apiRequest<{ plans: PlanItem[] }>('/api/admin/plans', { token: adminToken }),
        apiRequest<{ releases: ApkRelease[] }>('/api/admin/updates', { token: adminToken }),
        apiRequest<{ announcements: AnnouncementItem[] }>('/api/announcements'),
        apiRequest<{ customers: AdminCustomer[] }>('/api/admin/customers', { token: adminToken }),
        apiRequest<{ logs: AuditLogEntry[] }>('/api/admin/audit-logs', { token: adminToken }),
      ]);
      setReports(rep);
      setPayments(pay.payments);
      setLicenses(lic.licenses);
      setPlans(pl.plans);
      setReleases(rel.releases);
      setAnnouncements(ann.announcements);
      setCustomers(cust.customers);
      setAuditLogs(logs.logs);

      const drafts: Record<number, { name: string; priceBdt: string; durationDays: string; description: string }> = {};
      for (const item of pl.plans) {
        drafts[item.id] = {
          name: item.name,
          priceBdt: String(item.price_bdt),
          durationDays: item.duration_days ? String(item.duration_days) : '',
          description: item.description,
        };
      }
      setPlanDrafts(drafts);
      if (pl.plans.length > 0 && !pl.plans.some((p) => p.id === genPlanId)) {
        setGenPlanId(pl.plans[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin data');
    } finally {
      setBusy(false);
    }
  }, [adminToken, genPlanId]);

  useEffect(() => {
    if (adminToken) {
      loadAllAdminData();
    }
  }, [adminToken, loadAllAdminData]);

  const handleAdminAuthSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAuthBusy(true);
    setAuthError(null);
    try {
      const endpoint = bootstrapMode === 'unclaimed' ? '/api/admin/bootstrap' : '/api/admin/login';
      const resp = await apiRequest<{ token: string; admin: { email: string } }>(endpoint, {
        method: 'POST',
        body: { email: authEmail, password: authPassword },
      });
      setAuthPassword('');
      setBootstrapMode('db');
      onAdminAuthenticated(resp.token, resp.admin.email);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleApprovePayment = async (paymentId: number) => {
    if (!adminToken) return;
    setError(null);
    setNotice(null);
    try {
      const resp = await apiRequest<{ issuedLicenseKey: string; message: string }>(
        `/api/admin/payments/${paymentId}/approve`,
        { method: 'POST', token: adminToken, body: { adminNote: 'Verified against bKash statement' } }
      );
      setNewlyIssuedKey(resp.issuedLicenseKey);
      setNotice(resp.message);
      await loadAllAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed');
    }
  };

  const handleRejectPayment = async (paymentId: number) => {
    if (!adminToken) return;
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/api/admin/payments/${paymentId}/reject`, {
        method: 'POST',
        token: adminToken,
        body: { adminNote: rejectReason },
      });
      setRejectingId(null);
      setRejectReason('');
      setNotice('Payment rejected and logged.');
      await loadAllAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rejection failed');
    }
  };

  const handleGenerateManualKey = async (e: FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;
    setError(null);
    setNotice(null);
    try {
      const resp = await apiRequest<{ rawKey: string; message: string }>('/api/admin/licenses/generate', {
        method: 'POST',
        token: adminToken,
        body: { planId: genPlanId, customerEmail: genCustomerEmail.trim() || undefined },
      });
      setNewlyIssuedKey(resp.rawKey);
      setGenCustomerEmail('');
      setNotice(resp.message);
      await loadAllAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'License generation failed');
    }
  };

  const handleLicenseAction = async (licenseId: number, action: 'revoke' | 'renew' | 'unbind-device') => {
    if (!adminToken) return;
    setError(null);
    setNotice(null);
    try {
      const body =
        action === 'revoke'
          ? { reason: 'Revoked via Owner Admin Console' }
          : action === 'renew'
            ? { days: 30 }
            : {};
      const resp = await apiRequest<{ message: string }>(`/api/admin/licenses/${licenseId}/${action}`, {
        method: 'POST',
        token: adminToken,
        body,
      });
      setNotice(resp.message);
      await loadAllAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'License action failed');
    }
  };

  const handleSavePlan = async (planId: number) => {
    if (!adminToken) return;
    const draft = planDrafts[planId];
    if (!draft) return;
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/api/admin/plans/${planId}`, {
        method: 'PUT',
        token: adminToken,
        body: {
          name: draft.name,
          priceBdt: Number(draft.priceBdt),
          durationDays: draft.durationDays ? Number(draft.durationDays) : null,
          description: draft.description,
          isActive: true,
        },
      });
      setNotice('Plan pricing saved. Android app clients will receive the updated price immediately.');
      await loadAllAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update plan');
    }
  };

  const handleUploadApk = async (e: FormEvent) => {
    e.preventDefault();
    if (!adminToken || !apkFile) {
      setError('Select an .apk file before publishing.');
      return;
    }
    setError(null);
    setNotice(null);
    const fd = new FormData();
    fd.append('versionCode', apkVersionCode);
    fd.append('versionName', apkVersionName);
    fd.append('releaseNotes', apkReleaseNotes);
    fd.append('isMandatory', String(apkMandatory));
    fd.append('signingCertSha256', apkSigningCert);
    fd.append('apkFile', apkFile);

    try {
      const resp = await apiRequest<{ message: string; release: { sha256Hash: string; versionCode: number } }>(
        '/api/admin/updates',
        { method: 'POST', token: adminToken, formData: fd }
      );
      setNotice(`${resp.message} SHA-256: ${resp.release.sha256Hash.slice(0, 20)}...`);
      setApkFile(null);
      setApkVersionCode(String(resp.release.versionCode + 1));
      await loadAllAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'APK upload failed');
    }
  };

  const handlePublishAnnouncement = async (e: FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;
    setError(null);
    setNotice(null);
    try {
      await apiRequest('/api/admin/announcements', {
        method: 'POST',
        token: adminToken,
        body: { title: annTitle, body: annBody, severity: annSeverity },
      });
      setAnnTitle('');
      setAnnBody('');
      setNotice('Announcement published to ZENTRIX Android clients.');
      await loadAllAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish announcement');
    }
  };

  const copyIssuedKey = async () => {
    if (!newlyIssuedKey) return;
    try {
      await navigator.clipboard.writeText(newlyIssuedKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 1800);
    } catch {
      // ignore
    }
  };

  // Unauthenticated gate (First-run Claim or Sign In)
  if (!adminToken) {
    return (
      <div className="max-w-lg mx-auto py-10">
        <div className="border border-[#1E252F] bg-[#0D1116] rounded-xl p-7 space-y-6">
          <div>
            <div className="text-xs font-mono text-[#39FF14]">
              {bootstrapMode === 'unclaimed'
                ? 'First-Run Owner Setup'
                : bootstrapMode === 'env'
                  ? 'Environment Secret Authentication'
                  : 'Owner Administrator Sign In'}
            </div>
            <h1 className="mt-1.5 text-2xl font-semibold text-[#E6ECF2]">
              {bootstrapMode === 'unclaimed' ? t.adminClaimTitle : t.adminSignInTitle}
            </h1>
            <p className="mt-2 text-sm text-[#8B97A5]">
              {bootstrapMode === 'unclaimed'
                ? 'No ADMIN_PASSWORD environment variable is set yet. Create your owner credentials below — this one-time claim locks permanently once submitted.'
                : 'Authenticate to review bKash Transaction IDs, issue single-device license keys, configure plan prices, and upload verified APK releases.'}
            </p>
          </div>

          {emailHint && (
            <div className="text-xs font-mono text-[#9BA6B4] border border-[#222A35] bg-[#12171E] px-3 py-2 rounded-md">
              Configured owner account: {emailHint}
            </div>
          )}

          {authError && (
            <div className="border border-red-500/40 bg-red-950/30 px-3.5 py-2.5 rounded-lg text-sm text-red-300">
              {authError}
            </div>
          )}

          <form onSubmit={handleAdminAuthSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#9BA6B4] mb-1.5">
                Owner Email
              </label>
              <input
                type="email"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="owner@zentrix.sec"
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#080A0C] border border-[#232C37] text-sm text-[#E6ECF2] placeholder-[#556170] focus:outline-none focus:border-[#39FF14]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#9BA6B4] mb-1.5">
                {bootstrapMode === 'unclaimed' ? 'Create Strong Owner Password (min 10 characters)' : 'Owner Password'}
              </label>
              <input
                type="password"
                required
                minLength={bootstrapMode === 'unclaimed' ? 10 : 1}
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#080A0C] border border-[#232C37] text-sm text-[#E6ECF2] placeholder-[#556170] focus:outline-none focus:border-[#39FF14]"
              />
            </div>

            <button
              type="submit"
              disabled={authBusy || bootstrapMode === 'loading'}
              className="w-full py-2.5 px-4 rounded-lg bg-[#39FF14] text-[#080A0C] text-sm font-semibold hover:bg-[#52FF33] transition-colors cursor-pointer disabled:opacity-50"
            >
              {authBusy
                ? '...'
                : bootstrapMode === 'unclaimed'
                  ? t.adminClaimBtn
                  : t.adminSignInBtn}
            </button>
          </form>

          <p className="text-xs text-[#6B7785]">
            Session tokens stay strictly in memory. For production deployments, set <code className="font-mono text-[#9BA6B4]">ADMIN_EMAIL</code> and <code className="font-mono text-[#9BA6B4]">ADMIN_PASSWORD</code> in server secrets.
          </p>
        </div>
      </div>
    );
  }

  const filteredPayments =
    paymentFilter === 'ALL' ? payments : payments.filter((p) => p.status === paymentFilter);

  const filteredLicenses =
    licenseFilter === 'ALL' ? licenses : licenses.filter((l) => l.status === licenseFilter);

  const countLicStatus = (status: string) =>
    reports?.licensesByStatus.find((x) => x.status === status)?.count ?? 0;

  return (
    <div className="space-y-6">
      {/* Header & Segmented Navigation */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-[#1E252F] pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#E6ECF2]">
            {t.adminTitle}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#8B97A5]">
            <span>{adminEmail}</span>
            <span aria-hidden="true">·</span>
            <span>01747570144 (Manual bKash)</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-[#101419] border border-[#1E252F] rounded-lg overflow-x-auto">
            {(
              [
                ['overview', t.tabOverview],
                ['payments', `${t.tabPayments} (${reports?.pendingPaymentsCount ?? 0})`],
                ['licenses', t.tabLicenses],
                ['plans', t.tabPlans],
                ['updates', t.tabUpdates],
                ['customers', t.tabCustomers],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === id
                    ? 'bg-[#1D2530] text-[#39FF14]'
                    : 'text-[#8B97A5] hover:text-[#E6ECF2]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={loadAllAdminData}
            disabled={busy}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-[#232C37] bg-[#101419] text-[#C8D0D8] hover:border-[#39FF14]/50 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <button
            type="button"
            onClick={onAdminLogout}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-[#232C37] bg-[#101419] text-[#C8D0D8] hover:text-red-400 hover:border-red-500/40 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </div>

      {/* One-time generated license key disclosure */}
      {newlyIssuedKey && (
        <div className="border border-[#39FF14]/40 bg-[#0F1B12] rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-medium text-[#39FF14]">
              One-Time License Key Issued (Only Hash Stored on Server)
            </div>
            <div className="text-lg font-mono font-semibold text-[#E6ECF2] tracking-wider">
              {newlyIssuedKey}
            </div>
            <div className="text-xs text-[#9BA6B4]">
              Copy and send this key securely to the verified customer via WhatsApp. It cannot be viewed again after dismissal.
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={copyIssuedKey}
              className="px-3.5 py-2 rounded-lg border border-[#2C3A32] bg-[#142318] text-xs font-medium text-[#E6ECF2] hover:border-[#39FF14] flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              {copiedKey ? <Check className="w-3.5 h-3.5 text-[#39FF14]" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedKey ? 'Copied' : 'Copy Key'}
            </button>
            <button
              type="button"
              onClick={() => onHandoffLicenseKey(newlyIssuedKey)}
              className="px-3.5 py-2 rounded-lg bg-[#39FF14] text-[#080A0C] text-xs font-semibold hover:bg-[#52FF33] whitespace-nowrap cursor-pointer"
            >
              Test in Android Client
            </button>
            <button
              type="button"
              onClick={() => setNewlyIssuedKey(null)}
              className="px-2.5 py-2 text-xs text-[#8B97A5] hover:text-[#E6ECF2] cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="border border-red-500/40 bg-red-950/30 px-4 py-3 rounded-lg text-sm text-red-300">
          {error}
        </div>
      )}

      {notice && (
        <div className="border border-[#2A3B30] bg-[#0E1812] px-4 py-3 rounded-lg text-sm text-[#B8F5BE]">
          {notice}
        </div>
      )}

      {/* TAB 1: OVERVIEW & REPORTS */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="border border-[#1E252F] bg-[#0D1116] rounded-lg p-5">
              <div className="text-xs text-[#8B97A5]">Approved Revenue</div>
              <div className="mt-2 text-2xl font-mono font-semibold tabular-nums text-[#39FF14]">
                BDT {reports?.approvedRevenueBdt ?? 0}
              </div>
              <div className="mt-1 text-xs text-[#6B7785]">Verified manual bKash payments</div>
            </div>
            <div className="border border-[#1E252F] bg-[#0D1116] rounded-lg p-5">
              <div className="text-xs text-[#8B97A5]">Pending Verifications</div>
              <div className="mt-2 text-2xl font-mono font-semibold tabular-nums text-amber-400">
                {reports?.pendingPaymentsCount ?? 0}
              </div>
              <div className="mt-1 text-xs text-[#6B7785]">Awaiting TrxID review</div>
            </div>
            <div className="border border-[#1E252F] bg-[#0D1116] rounded-lg p-5">
              <div className="text-xs text-[#8B97A5]">Active Licenses</div>
              <div className="mt-2 text-2xl font-mono font-semibold tabular-nums text-[#E6ECF2]">
                {countLicStatus('ACTIVE')}
              </div>
              <div className="mt-1 text-xs text-[#6B7785]">
                Issued {countLicStatus('ISSUED')} · Expired {countLicStatus('EXPIRED')} · Revoked {countLicStatus('REVOKED')}
              </div>
            </div>
            <div className="border border-[#1E252F] bg-[#0D1116] rounded-lg p-5">
              <div className="text-xs text-[#8B97A5]">Registered Customers</div>
              <div className="mt-2 text-2xl font-mono font-semibold tabular-nums text-[#E6ECF2]">
                {reports?.totalCustomers ?? 0}
              </div>
              <div className="mt-1 text-xs text-[#6B7785]">
                Published APK releases: {reports?.apkReleasesCount ?? 0}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="border border-[#1E252F] bg-[#0D1116] rounded-lg p-5 space-y-4">
              <h2 className="text-base font-semibold text-[#E6ECF2]">Payment Status Summary</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#1E252F] text-xs text-[#7E8B99]">
                      <th className="text-left py-2 font-medium">Status</th>
                      <th className="text-right py-2 font-medium">Requests</th>
                      <th className="text-right py-2 font-medium">Amount (BDT)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#171D25]">
                    {reports?.paymentsByStatus.length ? (
                      reports.paymentsByStatus.map((row) => (
                        <tr key={row.status}>
                          <td className="py-2.5 text-[#C8D0D8] font-medium">{row.status}</td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-[#9BA6B4]">{row.count}</td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-[#E6ECF2]">BDT {row.total_bdt}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="py-6 text-center text-xs text-[#6B7785]">
                          No payment submissions yet. Submit a bKash Transaction ID from the Android Client tab to verify the workflow.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="border border-[#1E252F] bg-[#0D1116] rounded-lg p-5 space-y-4">
              <h2 className="text-base font-semibold text-[#E6ECF2]">License Distribution by Plan</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#1E252F] text-xs text-[#7E8B99]">
                      <th className="text-left py-2 font-medium">Plan Type</th>
                      <th className="text-right py-2 font-medium">Total Licenses</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#171D25]">
                    {reports?.licensesByPlan.length ? (
                      reports.licensesByPlan.map((row) => (
                        <tr key={row.plan_type}>
                          <td className="py-2.5 text-[#C8D0D8] capitalize">{row.plan_type}</td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-[#E6ECF2]">{row.count}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={2} className="py-6 text-center text-xs text-[#6B7785]">
                          No licenses generated yet. Approve a payment or generate a key under Licenses.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MANUAL BKASH PAYMENT VERIFICATION */}
      {activeTab === 'payments' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#E6ECF2]">Manual bKash Transaction Verification Queue</h2>
              <p className="text-xs text-[#8B97A5]">
                Verify every Transaction ID directly inside your official bKash statement for 01747570144 before approving. Never trust screenshots.
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 bg-[#101419] border border-[#1E252F] rounded-lg">
              {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setPaymentFilter(status)}
                  className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                    paymentFilter === status ? 'bg-[#1D2530] text-[#39FF14]' : 'text-[#8B97A5] hover:text-[#E6ECF2]'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          <div className="border border-[#1E252F] bg-[#0D1116] rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="border-b border-[#1E252F] bg-[#10151C] text-xs text-[#7E8B99]">
                  <th className="text-left px-4 py-3 font-medium">Customer</th>
                  <th className="text-left px-4 py-3 font-medium">Plan &amp; Amount</th>
                  <th className="text-left px-4 py-3 font-medium">Sender &amp; TrxID</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Submitted</th>
                  <th className="text-right px-4 py-3 font-medium">Verification Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#171D25]">
                {filteredPayments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-[#6B7785]">
                      No payment records match this filter.
                    </td>
                  </tr>
                ) : (
                  filteredPayments.map((p) => (
                    <tr key={p.id} className="hover:bg-[#11161D]">
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#E6ECF2]">{p.customer_name}</div>
                        <div className="text-xs text-[#7E8B99]">{p.customer_email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-[#C8D0D8]">{p.plan_name}</div>
                        <div className="text-xs font-mono tabular-nums text-[#39FF14]">BDT {p.amount_bdt}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs text-[#E6ECF2]">{p.transaction_id}</div>
                        <div className="text-xs font-mono text-[#7E8B99]">From {p.sender_number}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div
                          className={`text-xs font-medium ${
                            p.status === 'APPROVED'
                              ? 'text-[#39FF14]'
                              : p.status === 'REJECTED'
                                ? 'text-red-400'
                                : 'text-amber-400'
                          }`}
                        >
                          {p.status}
                        </div>
                        {p.issued_license_prefix && (
                          <div className="text-xs font-mono text-[#8B97A5]">{p.issued_license_prefix}</div>
                        )}
                        {p.admin_note && <div className="text-xs text-[#6B7785]">{p.admin_note}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono tabular-nums text-[#7E8B99]">
                        {formatDateShort(p.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.status === 'PENDING' ? (
                          rejectingId === p.id ? (
                            <div className="flex items-center justify-end gap-2">
                              <input
                                type="text"
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="Reason (e.g. TrxID mismatch)"
                                className="w-44 px-2.5 py-1.5 rounded bg-[#080A0C] border border-[#2A3340] text-xs text-[#E6ECF2]"
                              />
                              <button
                                type="button"
                                onClick={() => handleRejectPayment(p.id)}
                                className="px-2.5 py-1.5 rounded bg-red-600 text-white text-xs font-medium cursor-pointer whitespace-nowrap"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectingId(null);
                                  setRejectReason('');
                                }}
                                className="px-2 py-1.5 text-xs text-[#8B97A5] cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleApprovePayment(p.id)}
                                className="px-3 py-1.5 rounded-md bg-[#39FF14] text-[#080A0C] text-xs font-semibold hover:bg-[#52FF33] cursor-pointer whitespace-nowrap"
                              >
                                Approve &amp; Issue Key
                              </button>
                              <button
                                type="button"
                                onClick={() => setRejectingId(p.id)}
                                className="px-3 py-1.5 rounded-md border border-red-500/40 text-red-400 text-xs font-medium hover:bg-red-950/30 cursor-pointer whitespace-nowrap"
                              >
                                Reject
                              </button>
                            </div>
                          )
                        ) : (
                          <span className="text-xs text-[#6B7785]">Reviewed by {p.reviewed_by || 'admin'}</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: LICENSES & DEVICE BINDING */}
      {activeTab === 'licenses' && (
        <div className="space-y-6">
          <form
            onSubmit={handleGenerateManualKey}
            className="border border-[#1E252F] bg-[#0D1116] rounded-lg p-5 flex flex-col md:flex-row md:items-end gap-4"
          >
            <div className="flex-1">
              <label className="block text-xs text-[#8B97A5] mb-1.5">Plan</label>
              <select
                value={genPlanId}
                onChange={(e) => setGenPlanId(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-[#080A0C] border border-[#232C37] text-sm text-[#E6ECF2]"
              >
                {plans.map((pl) => (
                  <option key={pl.id} value={pl.id}>
                    {pl.name} (BDT {pl.price_bdt})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs text-[#8B97A5] mb-1.5">
                Assign to Customer Email (Optional)
              </label>
              <input
                type="email"
                value={genCustomerEmail}
                onChange={(e) => setGenCustomerEmail(e.target.value)}
                placeholder="Leave blank for any account"
                className="w-full px-3 py-2 rounded-lg bg-[#080A0C] border border-[#232C37] text-sm text-[#E6ECF2] placeholder-[#556170]"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#39FF14] text-[#080A0C] text-sm font-semibold hover:bg-[#52FF33] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <KeyRound className="w-4 h-4" />
              Generate License Key
            </button>
          </form>

          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-base font-semibold text-[#E6ECF2]">Issued &amp; Active Licenses</h2>
            <div className="flex items-center gap-1 p-1 bg-[#101419] border border-[#1E252F] rounded-lg">
              {(['ALL', 'ISSUED', 'ACTIVE', 'EXPIRED', 'REVOKED'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setLicenseFilter(status)}
                  className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                    licenseFilter === status ? 'bg-[#1D2530] text-[#39FF14]' : 'text-[#8B97A5] hover:text-[#E6ECF2]'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          <div className="border border-[#1E252F] bg-[#0D1116] rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[840px]">
              <thead>
                <tr className="border-b border-[#1E252F] bg-[#10151C] text-xs text-[#7E8B99]">
                  <th className="text-left px-4 py-3 font-medium">Key Mask</th>
                  <th className="text-left px-4 py-3 font-medium">Customer &amp; Plan</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Bound Device</th>
                  <th className="text-left px-4 py-3 font-medium">Validity</th>
                  <th className="text-right px-4 py-3 font-medium">Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#171D25]">
                {filteredLicenses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-[#6B7785]">
                      No licenses in this status category.
                    </td>
                  </tr>
                ) : (
                  filteredLicenses.map((lic) => (
                    <tr key={lic.id} className="hover:bg-[#11161D]">
                      <td className="px-4 py-3 font-mono text-xs text-[#E6ECF2]">{lic.key_prefix}</td>
                      <td className="px-4 py-3">
                        <div className="text-[#E6ECF2]">{lic.customer_email || 'Unassigned'}</div>
                        <div className="text-xs text-[#7E8B99]">{lic.plan_name}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-medium ${
                            lic.status === 'ACTIVE'
                              ? 'text-[#39FF14]'
                              : lic.status === 'REVOKED'
                                ? 'text-red-400'
                                : lic.status === 'EXPIRED'
                                  ? 'text-amber-400'
                                  : 'text-[#C8D0D8]'
                          }`}
                        >
                          {lic.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#9BA6B4]">
                        {lic.device_label || 'Not activated yet'}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono tabular-nums text-[#8B97A5]">
                        {lic.plan_type === 'lifetime'
                          ? 'Lifetime (1 Device)'
                          : lic.expires_at
                            ? formatDateShort(lic.expires_at)
                            : 'Starts on activation'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {lic.device_label && lic.status !== 'REVOKED' && (
                            <button
                              type="button"
                              onClick={() => handleLicenseAction(lic.id, 'unbind-device')}
                              className="px-2.5 py-1 rounded border border-[#2A3340] text-xs text-[#C8D0D8] hover:border-[#39FF14]/50 cursor-pointer whitespace-nowrap"
                            >
                              Unbind Device
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleLicenseAction(lic.id, 'renew')}
                            className="px-2.5 py-1 rounded border border-[#2A3340] text-xs text-[#C8D0D8] hover:text-[#39FF14] cursor-pointer whitespace-nowrap"
                          >
                            Renew
                          </button>
                          {lic.status !== 'REVOKED' && (
                            <button
                              type="button"
                              onClick={() => handleLicenseAction(lic.id, 'revoke')}
                              className="px-2.5 py-1 rounded border border-red-500/40 text-xs text-red-400 hover:bg-red-950/30 cursor-pointer whitespace-nowrap"
                            >
                              Revoke
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: SUBSCRIPTION PLAN PRICING */}
      {activeTab === 'plans' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {plans.map((pl) => {
            const draft = planDrafts[pl.id] || {
              name: pl.name,
              priceBdt: String(pl.price_bdt),
              durationDays: pl.duration_days ? String(pl.duration_days) : '',
              description: pl.description,
            };
            return (
              <div key={pl.id} className="border border-[#1E252F] bg-[#0D1116] rounded-lg p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-mono text-[#39FF14] uppercase">{pl.billing_type} plan</div>
                    <h3 className="text-lg font-semibold text-[#E6ECF2]">{pl.name}</h3>
                  </div>
                  <div className="text-xs text-[#7E8B99] font-mono">1 Android Device</div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[#8B97A5] mb-1">Plan Title</label>
                    <input
                      type="text"
                      value={draft.name}
                      onChange={(e) =>
                        setPlanDrafts((prev) => ({
                          ...prev,
                          [pl.id]: { ...draft, name: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-lg bg-[#080A0C] border border-[#232C37] text-sm text-[#E6ECF2]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#8B97A5] mb-1">Price (BDT)</label>
                    <input
                      type="number"
                      min={1}
                      value={draft.priceBdt}
                      onChange={(e) =>
                        setPlanDrafts((prev) => ({
                          ...prev,
                          [pl.id]: { ...draft, priceBdt: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-lg bg-[#080A0C] border border-[#232C37] text-sm font-mono tabular-nums text-[#E6ECF2]"
                    />
                  </div>
                </div>

                {pl.billing_type === 'monthly' && (
                  <div>
                    <label className="block text-xs text-[#8B97A5] mb-1">Duration (Days)</label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={draft.durationDays}
                      onChange={(e) =>
                        setPlanDrafts((prev) => ({
                          ...prev,
                          [pl.id]: { ...draft, durationDays: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-lg bg-[#080A0C] border border-[#232C37] text-sm font-mono tabular-nums text-[#E6ECF2]"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs text-[#8B97A5] mb-1">Customer Description</label>
                  <textarea
                    rows={2}
                    value={draft.description}
                    onChange={(e) =>
                      setPlanDrafts((prev) => ({
                        ...prev,
                        [pl.id]: { ...draft, description: e.target.value },
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg bg-[#080A0C] border border-[#232C37] text-sm text-[#E6ECF2]"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => handleSavePlan(pl.id)}
                  className="px-4 py-2 rounded-lg bg-[#39FF14] text-[#080A0C] text-xs font-semibold hover:bg-[#52FF33] cursor-pointer"
                >
                  Save Pricing Configuration
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 5: APK UPDATE CENTER & ANNOUNCEMENTS */}
      {activeTab === 'updates' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleUploadApk}
            className="lg:col-span-7 border border-[#1E252F] bg-[#0D1116] rounded-lg p-5 space-y-4"
          >
            <div>
              <h2 className="text-base font-semibold text-[#E6ECF2]">Upload Signed Android APK Release</h2>
              <p className="text-xs text-[#8B97A5] mt-0.5">
                Server calculates SHA-256 checksum automatically. Android clients verify file hash and signing certificate before opening the system installer.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#8B97A5] mb-1">Version Code (Integer)</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={apkVersionCode}
                  onChange={(e) => setApkVersionCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#080A0C] border border-[#232C37] text-sm font-mono text-[#E6ECF2]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#8B97A5] mb-1">Version Name (SemVer)</label>
                <input
                  type="text"
                  required
                  value={apkVersionName}
                  onChange={(e) => setApkVersionName(e.target.value)}
                  placeholder="1.1.0"
                  className="w-full px-3 py-2 rounded-lg bg-[#080A0C] border border-[#232C37] text-sm font-mono text-[#E6ECF2]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#8B97A5] mb-1">
                Signing Certificate SHA-256 (Optional Pin)
              </label>
              <input
                type="text"
                value={apkSigningCert}
                onChange={(e) => setApkSigningCert(e.target.value)}
                placeholder="Paste keytool SHA-256 fingerprint from your release keystore"
                className="w-full px-3 py-2 rounded-lg bg-[#080A0C] border border-[#232C37] text-xs font-mono text-[#E6ECF2] placeholder-[#556170]"
              />
            </div>

            <div>
              <label className="block text-xs text-[#8B97A5] mb-1">Release Notes</label>
              <textarea
                rows={3}
                required
                value={apkReleaseNotes}
                onChange={(e) => setApkReleaseNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#080A0C] border border-[#232C37] text-sm text-[#E6ECF2]"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs text-[#8B97A5]">Signed Android APK Binary (.apk)</label>
              <div className="border border-amber-500/30 bg-amber-950/20 rounded-md px-3 py-2 text-xs text-amber-200">
                {t.apkRealOnlyNote}
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <input
                  type="file"
                  accept=".apk"
                  onChange={(e) => setApkFile(e.target.files?.[0] || null)}
                  className="text-xs text-[#9BA6B4] file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-[#2A3340] file:bg-[#151B23] file:text-[#E6ECF2] file:text-xs cursor-pointer"
                />
              </div>
              {apkFile && (
                <div className="text-xs font-mono text-[#39FF14]">
                  Selected: {apkFile.name} ({formatBytes(apkFile.size)})
                </div>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-[#C8D0D8] cursor-pointer">
              <input
                type="checkbox"
                checked={apkMandatory}
                onChange={(e) => setApkMandatory(e.target.checked)}
                className="accent-[#39FF14]"
              />
              Mark as Mandatory Security Update
            </label>

            <button
              type="submit"
              className="px-4 py-2.5 rounded-lg bg-[#39FF14] text-[#080A0C] text-sm font-semibold hover:bg-[#52FF33] flex items-center gap-2 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              {t.uploadApkBtn}
            </button>
          </form>

          <form
            onSubmit={handlePublishAnnouncement}
            className="lg:col-span-5 border border-[#1E252F] bg-[#0D1116] rounded-lg p-5 space-y-4"
          >
            <div>
              <h2 className="text-base font-semibold text-[#E6ECF2]">Publish Security Announcement</h2>
              <p className="text-xs text-[#8B97A5] mt-0.5">
                Delivered immediately to ZENTRIX Android home dashboards.
              </p>
            </div>

            <div>
              <label className="block text-xs text-[#8B97A5] mb-1">Severity</label>
              <select
                value={annSeverity}
                onChange={(e) => setAnnSeverity(e.target.value as 'INFO' | 'SECURITY' | 'UPDATE')}
                className="w-full px-3 py-2 rounded-lg bg-[#080A0C] border border-[#232C37] text-sm text-[#E6ECF2]"
              >
                <option value="UPDATE">Update Notice</option>
                <option value="SECURITY">Security Advisory</option>
                <option value="INFO">General Information</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-[#8B97A5] mb-1">Headline</label>
              <input
                type="text"
                required
                value={annTitle}
                onChange={(e) => setAnnTitle(e.target.value)}
                placeholder="New Fake bKash SMS Campaign Warning"
                className="w-full px-3 py-2 rounded-lg bg-[#080A0C] border border-[#232C37] text-sm text-[#E6ECF2] placeholder-[#556170]"
              />
            </div>

            <div>
              <label className="block text-xs text-[#8B97A5] mb-1">Message Body</label>
              <textarea
                rows={4}
                required
                value={annBody}
                onChange={(e) => setAnnBody(e.target.value)}
                placeholder="Write clear, verifiable user guidance..."
                className="w-full px-3 py-2 rounded-lg bg-[#080A0C] border border-[#232C37] text-sm text-[#E6ECF2] placeholder-[#556170]"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg border border-[#39FF14]/60 bg-[#122016] text-[#39FF14] text-sm font-semibold hover:bg-[#19301F] cursor-pointer"
            >
              Publish Announcement
            </button>
          </form>

          {/* Published APK Releases Table */}
          <div className="lg:col-span-12 border border-[#1E252F] bg-[#0D1116] rounded-lg overflow-x-auto">
            <div className="px-4 py-3 border-b border-[#1E252F] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#E6ECF2]">Published APK Releases ({releases.length})</h3>
              <span className="text-xs text-[#7E8B99]">Announcements active: {announcements.length}</span>
            </div>
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="border-b border-[#1E252F] bg-[#10151C] text-xs text-[#7E8B99]">
                  <th className="text-left px-4 py-2.5 font-medium">Version</th>
                  <th className="text-left px-4 py-2.5 font-medium">SHA-256 Digest</th>
                  <th className="text-left px-4 py-2.5 font-medium">Release Notes</th>
                  <th className="text-right px-4 py-2.5 font-medium">Size</th>
                  <th className="text-right px-4 py-2.5 font-medium">Artifact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#171D25]">
                {releases.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-[#6B7785]">
                      No APK releases uploaded yet. Use the upload form above to publish version 1.1.0.
                    </td>
                  </tr>
                ) : (
                  releases.map((rel) => (
                    <tr key={rel.id}>
                      <td className="px-4 py-3">
                        <div className="font-mono text-[#E6ECF2]">
                          v{rel.version_name} (Code {rel.version_code})
                        </div>
                        {Boolean(rel.is_mandatory) && (
                          <div className="text-xs text-amber-400">Mandatory Security Update</div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[#8B97A5] max-w-[240px] truncate" title={rel.sha256_hash}>
                        {rel.sha256_hash}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#9BA6B4] max-w-xs">{rel.release_notes}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-[#8B97A5]">
                        {formatBytes(rel.file_size_bytes)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <a
                          href={`/api/updates/download/${rel.id}`}
                          className="text-xs text-[#39FF14] hover:underline font-medium"
                        >
                          Download APK
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: CUSTOMERS & AUDIT LOG */}
      {activeTab === 'customers' && (
        <div className="space-y-6">
          <div className="border border-[#1E252F] bg-[#0D1116] rounded-lg overflow-x-auto">
            <div className="px-4 py-3 border-b border-[#1E252F]">
              <h2 className="text-sm font-semibold text-[#E6ECF2]">Registered Customers ({customers.length})</h2>
            </div>
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="border-b border-[#1E252F] bg-[#10151C] text-xs text-[#7E8B99]">
                  <th className="text-left px-4 py-2.5 font-medium">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium">Email</th>
                  <th className="text-left px-4 py-2.5 font-medium">Mobile</th>
                  <th className="text-right px-4 py-2.5 font-medium">Payments</th>
                  <th className="text-right px-4 py-2.5 font-medium">Active Licenses</th>
                  <th className="text-right px-4 py-2.5 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#171D25]">
                {customers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-[#6B7785]">
                      No customers registered yet.
                    </td>
                  </tr>
                ) : (
                  customers.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-3 font-medium text-[#E6ECF2]">{c.full_name}</td>
                      <td className="px-4 py-3 text-[#9BA6B4]">{c.email}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[#9BA6B4]">{c.phone}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-[#C8D0D8]">{c.payment_count}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-[#39FF14]">{c.active_licenses}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-[#7E8B99]">{formatDateShort(c.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="border border-[#1E252F] bg-[#0D1116] rounded-lg overflow-x-auto">
            <div className="px-4 py-3 border-b border-[#1E252F] flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-[#8B97A5]" />
              <h2 className="text-sm font-semibold text-[#E6ECF2]">Server Security Audit Log (Latest 100)</h2>
            </div>
            <table className="w-full text-xs min-w-[780px]">
              <thead>
                <tr className="border-b border-[#1E252F] bg-[#10151C] text-[#7E8B99]">
                  <th className="text-left px-4 py-2.5 font-medium">Timestamp</th>
                  <th className="text-left px-4 py-2.5 font-medium">Actor</th>
                  <th className="text-left px-4 py-2.5 font-medium">Action</th>
                  <th className="text-left px-4 py-2.5 font-medium">Target</th>
                  <th className="text-left px-4 py-2.5 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#171D25] font-mono">
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-2.5 text-[#7E8B99] whitespace-nowrap">{formatDateShort(log.created_at)}</td>
                    <td className="px-4 py-2.5 text-[#9BA6B4]">{log.actor_type}:{log.actor_id}</td>
                    <td className="px-4 py-2.5 text-[#E6ECF2]">{log.action}</td>
                    <td className="px-4 py-2.5 text-[#9BA6B4]">{log.target}</td>
                    <td className="px-4 py-2.5 text-[#7E8B99]">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
