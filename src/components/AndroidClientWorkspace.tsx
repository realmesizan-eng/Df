import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  CreditCard,
  Download,
  ExternalLink,
  FileWarning,
  Globe,
  KeyRound,
  Landmark,
  Lock,
  MessageCircle,
  ScanSearch,
  Settings,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { apiRequest, formatBytes, formatDateShort } from '../api';
import { UI_TEXT } from '../i18n';
import type { AppLang } from '../i18n';
import { ZentrixEmblem, ZENTRIX_SURFACE_SRC } from './ZentrixEmblem';
import type {
  AnnouncementItem,
  ApkRelease,
  CustomerPayment,
  LicenseRecord,
  PlanItem,
  SupportInfo,
  UrlCheckResponse,
  UserProfile,
} from '../types';

export type AndroidScreenId =
  | 'splash'
  | 'welcome'
  | 'auth'
  | 'home'
  | 'scanner'
  | 'banking'
  | 'phishing'
  | 'privacy'
  | 'subscription'
  | 'payment'
  | 'license'
  | 'update'
  | 'support'
  | 'settings';

interface SimulatedAppManifest {
  appName: string;
  packageName: string;
  installer: string | null;
  permissions: string[];
}

const INITIAL_INSPECTABLE_MANIFESTS: SimulatedAppManifest[] = [
  {
    appName: 'bKash',
    packageName: 'com.bKash.customerapp',
    installer: 'com.android.vending',
    permissions: ['CAMERA', 'ACCESS_FINE_LOCATION'],
  },
  {
    appName: 'Nagad',
    packageName: 'com.konasl.nagad',
    installer: 'com.android.vending',
    permissions: ['CAMERA'],
  },
  {
    appName: 'WhatsApp',
    packageName: 'com.whatsapp',
    installer: 'com.android.vending',
    permissions: ['CAMERA', 'RECORD_AUDIO', 'READ_CONTACTS'],
  },
  {
    appName: 'bKash Cashback Pro (Sideloaded Sample)',
    packageName: 'com.fast.bkash.reward.apk',
    installer: null,
    permissions: ['READ_SMS', 'RECEIVE_SMS', 'SYSTEM_ALERT_WINDOW', 'REQUEST_INSTALL_PACKAGES'],
  },
];

const SIMULATED_DEVICES = [
  { id: 'and-pixel8-7a2b9f01e4', label: 'Google Pixel 8 Pro (Android 15)' },
  { id: 'and-samsung-a54-9c441d', label: 'Samsung Galaxy A54 (Android 14)' },
];

interface AndroidClientWorkspaceProps {
  lang: AppLang;
  handedOffKey: string | null;
  onClearHandedOffKey: () => void;
  onJumpToAdmin: () => void;
}

export function AndroidClientWorkspace({
  lang,
  handedOffKey,
  onClearHandedOffKey,
  onJumpToAdmin,
}: AndroidClientWorkspaceProps) {
  const t = UI_TEXT[lang];
  const [screen, setScreen] = useState<AndroidScreenId>('welcome');
  const [userToken, setUserToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);

  // Device test harness controls (for testing real 1-device enforcement & APK update detection)
  const [deviceIndex, setDeviceIndex] = useState(0);
  const [installedVersionCode, setInstalledVersionCode] = useState(1);
  const activeDevice = SIMULATED_DEVICES[deviceIndex];

  // Auth form
  const [isRegister, setIsRegister] = useState(true);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  // Live backend state
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<number>(2);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [supportInfo, setSupportInfo] = useState<SupportInfo | null>(null);
  const [myPayments, setMyPayments] = useState<CustomerPayment[]>([]);
  const [myLicenses, setMyLicenses] = useState<LicenseRecord[]>([]);
  const [deviceValidation, setDeviceValidation] = useState<{
    valid: boolean;
    status: string;
    license: LicenseRecord | null;
  } | null>(null);

  // Payment submission form
  const [senderNumber, setSenderNumber] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentMsg, setPaymentMsg] = useState<string | null>(null);
  const [paymentErr, setPaymentErr] = useState<string | null>(null);
  const [paymentBusy, setPaymentBusy] = useState(false);

  // License activation form
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [licenseMsg, setLicenseMsg] = useState<string | null>(null);
  const [licenseErr, setLicenseErr] = useState<string | null>(null);
  const [licenseBusy, setLicenseBusy] = useState(false);

  // Phishing URL checker state
  const [urlInput, setUrlInput] = useState('https://bkash-bonus-verify.xyz/claim-otp');
  const [urlResult, setUrlResult] = useState<UrlCheckResponse | null>(null);
  const [urlErr, setUrlErr] = useState<string | null>(null);
  const [urlBusy, setUrlBusy] = useState(false);

  // Update center state
  const [updateCheck, setUpdateCheck] = useState<{
    updateAvailable: boolean;
    mandatoryUpdate: boolean;
    latest: ApkRelease | null;
  } | null>(null);

  // Local manifest inspector state (clearly labeled transparent Android ruleset)
  const [manifests, setManifests] = useState<SimulatedAppManifest[]>(INITIAL_INSPECTABLE_MANIFESTS);
  const [uninstalledNotice, setUninstalledNotice] = useState<string | null>(null);

  // Policy-compliant local SMS scam checker
  const [smsText, setSmsText] = useState(
    'Your bKash account will be suspended today. Share your 6-digit OTP or open https://bkash-kyc-update.xyz immediately.'
  );

  // Pre-fill license key if handed off from Owner Admin Console
  useEffect(() => {
    if (handedOffKey) {
      setLicenseKeyInput(handedOffKey);
      if (userToken) {
        setScreen('license');
      }
      onClearHandedOffKey();
    }
  }, [handedOffKey, onClearHandedOffKey, userToken]);

  // Splash auto-advance
  useEffect(() => {
    if (screen !== 'splash') return;
    const t = setTimeout(() => {
      setScreen(userToken ? 'home' : 'welcome');
    }, 1400);
    return () => clearTimeout(t);
  }, [screen, userToken]);

  // Load public API data
  useEffect(() => {
    apiRequest<{ plans: PlanItem[] }>('/api/plans')
      .then((res) => {
        setPlans(res.plans);
        const lifetime = res.plans.find((p) => p.billing_type === 'lifetime');
        if (lifetime) setSelectedPlanId(lifetime.id);
      })
      .catch(() => {});

    apiRequest<{ announcements: AnnouncementItem[] }>('/api/announcements')
      .then((res) => setAnnouncements(res.announcements))
      .catch(() => {});

    apiRequest<SupportInfo>('/api/support/info')
      .then((res) => setSupportInfo(res))
      .catch(() => {});
  }, []);

  const refreshUpdateCheck = useCallback(async () => {
    try {
      const res = await apiRequest<{
        updateAvailable: boolean;
        mandatoryUpdate: boolean;
        latest: ApkRelease | null;
      }>(`/api/updates/latest?currentVersionCode=${installedVersionCode}`);
      setUpdateCheck(res);
    } catch {
      // ignore
    }
  }, [installedVersionCode]);

  useEffect(() => {
    refreshUpdateCheck();
  }, [refreshUpdateCheck]);

  const refreshCustomerData = useCallback(async () => {
    if (!userToken) return;
    try {
      const [payRes, licRes, valRes] = await Promise.all([
        apiRequest<{ payments: CustomerPayment[] }>('/api/payments/my', { token: userToken }),
        apiRequest<{ licenses: LicenseRecord[] }>('/api/licenses/status', { token: userToken }),
        apiRequest<{ valid: boolean; status: string; license: LicenseRecord | null }>('/api/licenses/validate', {
          method: 'POST',
          token: userToken,
          body: { deviceId: activeDevice.id },
        }),
      ]);
      setMyPayments(payRes.payments);
      setMyLicenses(licRes.licenses);
      setDeviceValidation(valRes);
    } catch {
      // ignore
    }
  }, [userToken, activeDevice.id]);

  useEffect(() => {
    refreshCustomerData();
  }, [refreshCustomerData]);

  // Run exact same deterministic rule engine as Kotlin SecurityAnalyzer.kt
  const evaluatedApps = useMemo(() => {
    return manifests.map((m) => {
      const trusted = m.installer === 'com.android.vending' || m.installer === 'com.sec.android.app.samsungapps';
      const sideloaded = !trusted;
      const reasons: string[] = [];
      const hasSms = m.permissions.includes('READ_SMS') || m.permissions.includes('RECEIVE_SMS');
      const hasOverlay = m.permissions.includes('SYSTEM_ALERT_WINDOW');
      const hasInstall = m.permissions.includes('REQUEST_INSTALL_PACKAGES');

      if (hasSms && hasOverlay) {
        reasons.push('Requests both SMS access and Screen Overlay (high-risk OTP theft combination).');
      }
      if (sideloaded && hasInstall) {
        reasons.push('Sideloaded outside Play Store and requests permission to install additional APKs.');
      }
      if (
        (m.appName.toLowerCase().includes('bkash') || m.packageName.toLowerCase().includes('bkash')) &&
        m.packageName !== 'com.bKash.customerapp'
      ) {
        reasons.push('Impersonation alert: Does not match official bKash package com.bKash.customerapp.');
      }
      if (
        (m.appName.toLowerCase().includes('nagad') || m.packageName.toLowerCase().includes('nagad')) &&
        m.packageName !== 'com.konasl.nagad'
      ) {
        reasons.push('Impersonation alert: Does not match official Nagad package com.konasl.nagad.');
      }

      const severity =
        reasons.some((r) => r.startsWith('Impersonation') || r.includes('Screen Overlay'))
          ? 'HIGH'
          : reasons.length > 0 || m.permissions.length >= 4
            ? 'MEDIUM'
            : 'LOW';

      return { ...m, sideloaded, reasons, severity };
    });
  }, [manifests]);

  const smsFindings = useMemo(() => {
    const lower = smsText.toLowerCase();
    const out: string[] = [];
    if (/(pin|otp|verification code)/i.test(lower)) {
      out.push('Requests PIN or OTP — official bKash/Nagad teams never ask for PINs or OTPs.');
    }
    if (/(suspend|blocked|kyc|urgent|expire)/i.test(lower)) {
      out.push('Uses artificial account-suspension urgency typical of mobile banking scams.');
    }
    if (/(http:\/\/|https:\/\/|bit\.ly|\.xyz|\.top)/i.test(lower)) {
      out.push('Contains external link — inspect it inside Phishing Link Checker before tapping.');
    }
    if (/(won|lottery|bonus|prize|cashback)/i.test(lower)) {
      out.push('Unverified cash reward or bonus claim.');
    }
    return out;
  }, [smsText]);

  const handleAuthSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAuthBusy(true);
    setAuthError(null);
    try {
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
      const body = isRegister ? { fullName, email, phone, password } : { email, password };
      const resp = await apiRequest<{ token: string; user: UserProfile }>(endpoint, {
        method: 'POST',
        body,
      });
      setUserToken(resp.token);
      setUser(resp.user);
      setSenderNumber(resp.user.phone);
      setPassword('');
      setScreen('home');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSubmitPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!userToken) {
      setScreen('auth');
      return;
    }
    setPaymentBusy(true);
    setPaymentErr(null);
    setPaymentMsg(null);
    try {
      const resp = await apiRequest<{ message: string }>('/api/payments/submit', {
        method: 'POST',
        token: userToken,
        body: {
          planId: selectedPlanId,
          senderNumber,
          transactionId,
          customerNote: paymentNote,
        },
      });
      setPaymentMsg(resp.message);
      setTransactionId('');
      setPaymentNote('');
      await refreshCustomerData();
    } catch (err) {
      setPaymentErr(err instanceof Error ? err.message : 'Payment submission failed');
    } finally {
      setPaymentBusy(false);
    }
  };

  const handleActivateLicense = async (e: FormEvent) => {
    e.preventDefault();
    if (!userToken) {
      setScreen('auth');
      return;
    }
    setLicenseBusy(true);
    setLicenseErr(null);
    setLicenseMsg(null);
    try {
      const resp = await apiRequest<{ message: string }>('/api/licenses/activate', {
        method: 'POST',
        token: userToken,
        body: {
          licenseKey: licenseKeyInput,
          deviceId: activeDevice.id,
          deviceLabel: activeDevice.label,
        },
      });
      setLicenseMsg(resp.message);
      setLicenseKeyInput('');
      await refreshCustomerData();
    } catch (err) {
      setLicenseErr(err instanceof Error ? err.message : 'License activation failed');
    } finally {
      setLicenseBusy(false);
    }
  };

  const handleCheckUrl = async (e?: FormEvent, overrideUrl?: string) => {
    if (e) e.preventDefault();
    const target = overrideUrl ?? urlInput;
    if (!target.trim()) return;
    setUrlBusy(true);
    setUrlErr(null);
    try {
      const resp = await apiRequest<UrlCheckResponse>('/api/security/check-url', {
        method: 'POST',
        body: { url: target },
      });
      setUrlResult(resp);
    } catch (err) {
      setUrlErr(err instanceof Error ? err.message : 'URL check failed');
    } finally {
      setUrlBusy(false);
    }
  };

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || plans[0];

  const screenList: Array<{ id: AndroidScreenId; label: string }> =
    lang === 'bn'
      ? [
          { id: 'splash', label: '০১. স্প্ল্যাশ স্ক্রিন' },
          { id: 'welcome', label: '০২. স্বাগতম' },
          { id: 'auth', label: '০৩. লগইন ও রেজিস্ট্রেশন' },
          { id: 'home', label: '০৪. হোম সিকিউরিটি ড্যাশবোর্ড' },
          { id: 'scanner', label: '০৫. অ্যাপ ও পারমিশন স্ক্যানার' },
          { id: 'banking', label: '০৬. মোবাইল ব্যাংকিং (বিকাশ/নগদ)' },
          { id: 'phishing', label: '০৭. ফিশিং লিংক চেকার' },
          { id: 'privacy', label: '০৮. প্রাইভেসি, এসএমএস ও রিপোর্ট' },
          { id: 'subscription', label: '০৯. সাবস্ক্রিপশন প্ল্যান' },
          { id: 'payment', label: '১০. ম্যানুয়াল বিকাশ পেমেন্ট ও TrxID' },
          { id: 'license', label: '১১. লাইসেন্স অ্যাক্টিভেশন' },
          { id: 'update', label: '১২. APK আপডেট সেন্টার' },
          { id: 'support', label: '১৩. হোয়াটসঅ্যাপ সাপোর্ট ও FAQ' },
          { id: 'settings', label: '১৪. সেটিংস ও প্রাইভেসি নীতি' },
        ]
      : [
          { id: 'splash', label: '01. Splash Screen' },
          { id: 'welcome', label: '02. Welcome' },
          { id: 'auth', label: '03. Login & Register' },
          { id: 'home', label: '04. Home Dashboard' },
          { id: 'scanner', label: '05. App & Permission Scanner' },
          { id: 'banking', label: '06. Mobile Banking (bKash/Nagad)' },
          { id: 'phishing', label: '07. Phishing Link Checker' },
          { id: 'privacy', label: '08. Privacy, SMS Safety & Report' },
          { id: 'subscription', label: '09. Subscription Plans' },
          { id: 'payment', label: '10. Manual bKash Payment & TrxID' },
          { id: 'license', label: '11. License Activation' },
          { id: 'update', label: '12. APK Update Center' },
          { id: 'support', label: '13. WhatsApp Support & FAQ' },
          { id: 'settings', label: '14. Settings & Privacy Policy' },
        ];

  const renderAndroidTopBar = (title: string, backTo: AndroidScreenId = 'home') => (
    <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#1E252F]">
      <button
        type="button"
        onClick={() => setScreen(backTo)}
        className="flex items-center gap-1.5 text-xs font-medium text-[#9BA6B4] hover:text-[#E6ECF2] cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        {t.back}
      </button>
      <span className="text-sm font-semibold text-[#E6ECF2]">{title}</span>
      <span className="w-10" />
    </div>
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Live Android Viewport (Connected to Real ZENTRIX Backend APIs) */}
      <div className="xl:col-span-8 border border-[#1E252F] bg-[#0B0E12] rounded-xl overflow-hidden">
        {/* Android Status Strip */}
        <div className="px-5 py-3 border-b border-[#1E252F] bg-[#101419] flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-[#C8D0D8] font-medium">
            <Smartphone className="w-4 h-4 text-[#39FF14]" />
            <span>{activeDevice.label}</span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[#7E8B99]">
            <span>App v1.0.{installedVersionCode - 1} (Code {installedVersionCode})</span>
            <span aria-hidden="true">·</span>
            <span>{user ? user.email : 'Not signed in'}</span>
          </div>
        </div>

        <div className="p-6 min-h-[640px]">
          {/* SCREEN: SPLASH */}
          {screen === 'splash' && (
            <div className="h-[560px] flex flex-col items-center justify-center text-center space-y-4">
              <ZentrixEmblem size={96} />
              <div className="text-3xl font-display font-bold tracking-wider text-[#E6ECF2]">
                ZENTRIX
              </div>
              <div className="text-sm text-[#39FF14]">Your Digital World. Our Protection.</div>
              <div className="text-xs text-[#6B7785] font-mono">Android 8.0+ Security Suite</div>
            </div>
          )}

          {/* SCREEN: WELCOME */}
          {screen === 'welcome' && (
            <div className="space-y-6">
              <div className="relative rounded-xl overflow-hidden border border-[#1E252F] bg-[#0E1217]">
                <img
                  src={ZENTRIX_SURFACE_SRC}
                  alt="ZENTRIX precision metallic security surface"
                  referrerPolicy="no-referrer"
                  className="w-full h-44 object-cover opacity-55"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#080A0C] via-[#080A0C]/70 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-5 flex items-end gap-4">
                  <ZentrixEmblem size={56} />
                  <div>
                    <h2 className="text-2xl font-bold text-[#E6ECF2]">ZENTRIX</h2>
                    <p className="text-sm text-[#39FF14]">{t.tagline}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-base font-semibold text-[#E6ECF2]">{t.welcomeHeadline}</h3>
                <p className="text-sm text-[#9BA6B4] leading-relaxed">{t.welcomeBody}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-[#1E252F] pt-5 text-xs text-[#9BA6B4]">
                <div>
                  <div className="font-semibold text-[#E6ECF2] mb-1">{t.principle1Title}</div>
                  {t.principle1Desc}
                </div>
                <div>
                  <div className="font-semibold text-[#E6ECF2] mb-1">{t.principle2Title}</div>
                  {t.principle2Desc}
                </div>
                <div>
                  <div className="font-semibold text-[#E6ECF2] mb-1">{t.principle3Title}</div>
                  {t.principle3Desc}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setScreen(userToken ? 'home' : 'auth')}
                  className="px-5 py-2.5 rounded-lg bg-[#39FF14] text-[#080A0C] text-sm font-semibold hover:bg-[#52FF33] cursor-pointer"
                >
                  {userToken ? t.openDashboard : t.signInOrRegister}
                </button>
                <button
                  type="button"
                  onClick={() => setScreen('home')}
                  className="px-4 py-2.5 rounded-lg border border-[#252E39] bg-[#11161D] text-sm text-[#C8D0D8] hover:text-[#E6ECF2] cursor-pointer"
                >
                  {t.exploreDashboard}
                </button>
                <a
                  href="https://wa.me/8801747570144"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2.5 rounded-lg border border-[#252E39] text-sm text-[#9BA6B4] hover:text-[#39FF14] flex items-center gap-1.5"
                >
                  <MessageCircle className="w-4 h-4" />
                  {t.whatsappSupport}
                </a>
              </div>
            </div>
          )}

          {/* SCREEN: AUTH (LOGIN & REGISTRATION) */}
          {screen === 'auth' && (
            <div className="max-w-md mx-auto py-4 space-y-5">
              {renderAndroidTopBar(isRegister ? 'Create ZENTRIX Account' : 'Sign In to ZENTRIX', 'welcome')}
              <div className="flex items-center gap-1 p-1 bg-[#101419] border border-[#1E252F] rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setIsRegister(true);
                    setAuthError(null);
                  }}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                    isRegister ? 'bg-[#1D2530] text-[#39FF14]' : 'text-[#8B97A5]'
                  }`}
                >
                  Register
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsRegister(false);
                    setAuthError(null);
                  }}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                    !isRegister ? 'bg-[#1D2530] text-[#39FF14]' : 'text-[#8B97A5]'
                  }`}
                >
                  Sign In
                </button>
              </div>

              {authError && (
                <div className="border border-red-500/40 bg-red-950/30 px-3.5 py-2.5 rounded-lg text-xs text-red-300">
                  {authError}
                </div>
              )}

              <form onSubmit={handleAuthSubmit} className="space-y-3.5">
                {isRegister && (
                  <>
                    <div>
                      <label className="block text-xs text-[#8B97A5] mb-1">Full Name</label>
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Tariqul Islam"
                        className="w-full px-3.5 py-2.5 rounded-lg bg-[#080A0C] border border-[#232C37] text-sm text-[#E6ECF2]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#8B97A5] mb-1">Bangladesh Mobile Number</label>
                      <input
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="01712345678"
                        className="w-full px-3.5 py-2.5 rounded-lg bg-[#080A0C] border border-[#232C37] text-sm font-mono text-[#E6ECF2]"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs text-[#8B97A5] mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#080A0C] border border-[#232C37] text-sm text-[#E6ECF2]"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#8B97A5] mb-1">Password (min 8 characters)</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#080A0C] border border-[#232C37] text-sm text-[#E6ECF2]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={authBusy}
                  className="w-full py-2.5 rounded-lg bg-[#39FF14] text-[#080A0C] text-sm font-semibold hover:bg-[#52FF33] cursor-pointer disabled:opacity-50"
                >
                  {authBusy ? 'Please wait...' : isRegister ? 'Create Account' : 'Sign In'}
                </button>
              </form>
            </div>
          )}

          {/* SCREEN: HOME SECURITY DASHBOARD */}
          {screen === 'home' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1E252F] pb-4">
                <div className="flex items-center gap-3">
                  <ZentrixEmblem size={44} />
                  <div>
                    <h2 className="text-lg font-semibold text-[#E6ECF2]">{t.homeDashboard}</h2>
                    <div className="text-xs text-[#8B97A5]">
                      {user ? `${user.fullName} · ${user.email}` : lang === 'bn' ? 'গেস্ট মোড · পেমেন্ট বা লাইসেন্স অ্যাক্টিভ করতে লগইন করুন' : 'Guest mode · Sign in to submit payments or activate a license'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!user && (
                    <button
                      type="button"
                      onClick={() => setScreen('auth')}
                      className="px-3 py-1.5 rounded-lg bg-[#39FF14] text-[#080A0C] text-xs font-semibold cursor-pointer"
                    >
                      {t.signIn}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setScreen('settings')}
                    className="px-3 py-1.5 rounded-lg border border-[#232C37] text-xs text-[#C8D0D8] hover:text-[#E6ECF2] cursor-pointer flex items-center gap-1.5"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    {t.settings}
                  </button>
                </div>
              </div>

              {/* Device License & Update Banner */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-[#1E252F] bg-[#10151C] rounded-lg p-4 space-y-1.5">
                  <div className="text-xs text-[#8B97A5]">{t.deviceLicenseStatus}</div>
                  <div
                    className={`text-sm font-semibold ${
                      deviceValidation?.valid ? 'text-[#39FF14]' : 'text-amber-400'
                    }`}
                  >
                    {!user
                      ? lang === 'bn' ? 'লাইসেন্স দেখতে লগইন করুন' : 'Sign in to check device license'
                      : deviceValidation?.valid
                        ? `Active · ${deviceValidation.license?.plan_name || deviceValidation.license?.plan_type}`
                        : `Not Active (${deviceValidation?.status || 'UNLICENSED'})`}
                  </div>
                  <div className="text-xs font-mono text-[#7E8B99]">
                    Device ID: {activeDevice.id}
                  </div>
                </div>

                <div className="border border-[#1E252F] bg-[#10151C] rounded-lg p-4 space-y-1.5">
                  <div className="text-xs text-[#8B97A5]">{t.apkUpdateStatus}</div>
                  <div
                    className={`text-sm font-semibold ${
                      updateCheck?.updateAvailable ? 'text-amber-400' : 'text-[#E6ECF2]'
                    }`}
                  >
                    {updateCheck?.updateAvailable && updateCheck.latest
                      ? `Update v${updateCheck.latest.version_name} Available${updateCheck.mandatoryUpdate ? ' (Mandatory)' : ''}`
                      : lang === 'bn' ? 'অফিশিয়াল সার্ভারের সর্বশেষ ভার্সন চালু আছে' : 'Up to date with official server'}
                  </div>
                  <button
                    type="button"
                    onClick={() => setScreen('update')}
                    className="text-xs text-[#39FF14] hover:underline cursor-pointer"
                  >
                    {t.openUpdateCenter}
                  </button>
                </div>
              </div>

              {/* Announcements from Admin Panel */}
              {announcements.length > 0 && (
                <div className="border border-[#1E252F] bg-[#0F141A] rounded-lg p-4 space-y-1">
                  <div className="text-xs font-mono text-[#8B97A5]">
                    Official Advisory · {announcements[0].severity}
                  </div>
                  <div className="text-sm font-semibold text-[#E6ECF2]">{announcements[0].title}</div>
                  <p className="text-xs text-[#9BA6B4]">{announcements[0].body}</p>
                </div>
              )}

              {/* Primary Security Modules Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {
                    id: 'scanner' as const,
                    title: t.tileScanner,
                    desc: t.tileScannerDesc,
                    icon: ScanSearch,
                  },
                  {
                    id: 'banking' as const,
                    title: t.tileBanking,
                    desc: t.tileBankingDesc,
                    icon: Landmark,
                  },
                  {
                    id: 'phishing' as const,
                    title: t.tilePhishing,
                    desc: t.tilePhishingDesc,
                    icon: Globe,
                  },
                  {
                    id: 'privacy' as const,
                    title: t.tilePrivacy,
                    desc: t.tilePrivacyDesc,
                    icon: FileWarning,
                  },
                  {
                    id: 'subscription' as const,
                    title: t.tileSubscription,
                    desc: t.tileSubscriptionDesc,
                    icon: CreditCard,
                  },
                  {
                    id: 'license' as const,
                    title: t.tileLicense,
                    desc: t.tileLicenseDesc,
                    icon: KeyRound,
                  },
                ].map((tile) => {
                  const Icon = tile.icon;
                  return (
                    <button
                      key={tile.id}
                      type="button"
                      onClick={() => setScreen(tile.id)}
                      className="text-left border border-[#1E252F] bg-[#101419] hover:border-[#39FF14]/50 rounded-lg p-4 transition-colors flex items-start justify-between gap-3 cursor-pointer"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm font-semibold text-[#E6ECF2]">
                          <Icon className="w-4 h-4 text-[#39FF14] shrink-0" />
                          <span>{tile.title}</span>
                        </div>
                        <p className="text-xs text-[#8B97A5]">{tile.desc}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#5F6C7B] shrink-0 mt-0.5" />
                    </button>
                  );
                })}
              </div>

              {/* Visible WhatsApp Support CTA on Dashboard */}
              <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-[#1E252F]">
                <div className="text-xs text-[#8B97A5]">
                  Need payment, license activation, or APK update help?
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setScreen('support')}
                    className="px-3.5 py-2 rounded-lg border border-[#232C37] text-xs text-[#C8D0D8] hover:text-[#E6ECF2] cursor-pointer"
                  >
                    Help &amp; FAQ
                  </button>
                  <a
                    href="https://wa.me/8801747570144"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-lg bg-[#39FF14] text-[#080A0C] text-xs font-semibold hover:bg-[#52FF33] flex items-center gap-1.5"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    WhatsApp Support (01747570144)
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* SCREEN: ANTIVIRUS & APP SCANNER */}
          {screen === 'scanner' && (
            <div className="space-y-4">
              {renderAndroidTopBar('App & Permission Scanner')}
              <p className="text-xs text-[#8B97A5] leading-relaxed">
                On Android devices, <code className="font-mono text-[#C8D0D8]">SecurityAnalyzer.kt</code> queries <code className="font-mono text-[#C8D0D8]">PackageManager</code> within Android 8.0+ visibility rules. Below is the exact deterministic risk-rule evaluation running on a transparent test package inventory (browsers cannot access Android <code className="font-mono text-[#C8D0D8]">PackageManager</code> directly).
              </p>

              {uninstalledNotice && (
                <div className="border border-[#2A3B30] bg-[#0E1812] px-3.5 py-2.5 rounded-lg text-xs text-[#B8F5BE]">
                  {uninstalledNotice}
                </div>
              )}

              <div className="space-y-3">
                {evaluatedApps.map((app) => (
                  <div
                    key={app.packageName}
                    className="border border-[#1E252F] bg-[#101419] rounded-lg p-4 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-[#E6ECF2]">{app.appName}</div>
                        <div className="text-xs font-mono text-[#7E8B99]">{app.packageName}</div>
                      </div>
                      <span
                        className={`text-xs font-mono font-semibold ${
                          app.severity === 'HIGH'
                            ? 'text-red-400'
                            : app.severity === 'MEDIUM'
                              ? 'text-amber-400'
                              : 'text-[#39FF14]'
                        }`}
                      >
                        Risk: {app.severity}
                      </span>
                    </div>

                    <div className="text-xs text-[#8B97A5]">
                      Installer: {app.installer || 'Unknown / Sideloaded APK'} · Permissions: {app.permissions.join(', ')}
                    </div>

                    {app.reasons.length > 0 && (
                      <ul className="space-y-1 text-xs text-red-300">
                        {app.reasons.map((r) => (
                          <li key={r}>• {r}</li>
                        ))}
                      </ul>
                    )}

                    {app.severity === 'HIGH' && (
                      <button
                        type="button"
                        onClick={() => {
                          setManifests((prev) => prev.filter((item) => item.packageName !== app.packageName));
                          setUninstalledNotice(
                            `Removed ${app.packageName} from test inventory. On Android, this button launches ACTION_DELETE so the user confirms uninstallation in Android Settings.`
                          );
                        }}
                        className="px-3 py-1.5 rounded-md border border-red-500/40 text-xs text-red-400 hover:bg-red-950/30 cursor-pointer"
                      >
                        Safe Uninstall Guidance (Launch Android Uninstall)
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SCREEN: MOBILE BANKING PROTECTION */}
          {screen === 'banking' && (
            <div className="space-y-5">
              {renderAndroidTopBar('Mobile Banking Protection')}
              <div className="border border-amber-500/30 bg-amber-950/20 rounded-lg p-3.5 text-xs text-amber-200">
                Independent Protection Notice: ZENTRIX is NOT affiliated with bKash Limited or Nagad Limited. ZENTRIX never reads banking app data, balances, PINs, or OTPs.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  {
                    brand: 'bKash',
                    pkg: 'com.bKash.customerapp',
                    ussd: '*247#',
                    officialDomain: 'bkash.com',
                  },
                  {
                    brand: 'Nagad',
                    pkg: 'com.konasl.nagad',
                    ussd: '*167#',
                    officialDomain: 'nagad.com.bd',
                  },
                ].map((b) => {
                  const spoofFound = evaluatedApps.filter(
                    (a) =>
                      (a.appName.toLowerCase().includes(b.brand.toLowerCase()) ||
                        a.packageName.toLowerCase().includes(b.brand.toLowerCase())) &&
                      a.packageName !== b.pkg
                  );
                  return (
                    <div key={b.brand} className="border border-[#1E252F] bg-[#101419] rounded-lg p-4 space-y-2">
                      <div className="text-sm font-semibold text-[#E6ECF2]">{b.brand} Verification Profile</div>
                      <div className="text-xs font-mono text-[#8B97A5]">Official Package: {b.pkg}</div>
                      <div className="text-xs font-mono text-[#8B97A5]">Official Domain: {b.officialDomain} · USSD: {b.ussd}</div>
                      {spoofFound.length > 0 ? (
                        <div className="text-xs text-red-400 font-medium">
                          ALERT: Unofficial lookalike package detected ({spoofFound.map((s) => s.packageName).join(', ')}).
                        </div>
                      ) : (
                        <div className="text-xs text-[#39FF14]">
                          No unofficial lookalike packages detected in current inventory.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-[#9BA6B4]">
                <div className="border border-[#1E252F] bg-[#101419] rounded-lg p-4 space-y-2">
                  <div className="text-sm font-semibold text-[#E6ECF2]">PIN &amp; OTP Safety Education</div>
                  <p>• Never disclose your bKash or Nagad PIN or 6-digit OTP to any caller claiming to be customer support.</p>
                  <p>• Never enter your banking PIN into web forms received via SMS or WhatsApp links.</p>
                  <p>• Always disable screen-sharing and unknown overlay apps before opening financial apps.</p>
                </div>
                <div className="border border-[#1E252F] bg-[#101419] rounded-lg p-4 space-y-2">
                  <div className="text-sm font-semibold text-[#E6ECF2]">Fake Payment Screenshot Warning</div>
                  <p>• Fraudsters edit screenshots to fake Send Money or Cash In receipts within seconds.</p>
                  <p>• Never confirm a transaction from a screenshot alone.</p>
                  <p>• Verify your updated balance and Transaction ID directly inside the official bKash or Nagad app statement.</p>
                </div>
              </div>
            </div>
          )}

          {/* SCREEN: PHISHING LINK CHECKER (LIVE BACKEND) */}
          {screen === 'phishing' && (
            <div className="space-y-4">
              {renderAndroidTopBar('Phishing Link Checker')}
              <p className="text-xs text-[#8B97A5]">
                Connected live to <code className="font-mono text-[#C8D0D8]">POST /api/security/check-url</code>. Inspects Punycode homographs, bKash/Nagad/DBBL lookalike domains, credential tricks, high-risk TLDs, and optional Google Safe Browsing v4 feed.
              </p>

              <form onSubmit={handleCheckUrl} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://suspicious-link.example"
                  className="flex-1 px-3.5 py-2.5 rounded-lg bg-[#080A0C] border border-[#232C37] text-sm font-mono text-[#E6ECF2]"
                />
                <button
                  type="submit"
                  disabled={urlBusy}
                  className="px-4 py-2.5 rounded-lg bg-[#39FF14] text-[#080A0C] text-sm font-semibold hover:bg-[#52FF33] whitespace-nowrap cursor-pointer"
                >
                  {urlBusy ? 'Inspecting...' : 'Inspect URL'}
                </button>
              </form>

              <div className="flex flex-wrap gap-2 text-xs">
                {[
                  'https://bkash-bonus-verify.xyz/claim-otp',
                  'https://nagad-kyc-unlock.top/pin',
                  'https://www.bkash.com',
                ].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => {
                      setUrlInput(sample);
                      handleCheckUrl(undefined, sample);
                    }}
                    className="px-2.5 py-1 rounded border border-[#232C37] bg-[#101419] font-mono text-[#9BA6B4] hover:text-[#E6ECF2] cursor-pointer"
                  >
                    Test: {sample}
                  </button>
                ))}
              </div>

              {urlErr && (
                <div className="border border-red-500/40 bg-red-950/30 px-3.5 py-2.5 rounded-lg text-xs text-red-300">
                  {urlErr}
                </div>
              )}

              {urlResult && (
                <div className="border border-[#1E252F] bg-[#101419] rounded-lg p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-mono text-sm text-[#E6ECF2]">{urlResult.hostname}</div>
                    <div
                      className={`text-xs font-mono font-semibold ${
                        urlResult.riskLevel === 'HIGH'
                          ? 'text-red-400'
                          : urlResult.riskLevel === 'SUSPICIOUS' || urlResult.riskLevel === 'CAUTION'
                            ? 'text-amber-400'
                            : 'text-[#39FF14]'
                      }`}
                    >
                      {urlResult.riskLevel} · Risk Score {urlResult.score}/100
                    </div>
                  </div>
                  <div className="text-xs text-[#7E8B99]">{urlResult.threatIntelSource}</div>

                  {urlResult.findings.length > 0 ? (
                    <div className="divide-y divide-[#1A212B]">
                      {urlResult.findings.map((f) => (
                        <div key={f.code + f.title} className="py-2.5 space-y-0.5">
                          <div className="text-xs font-semibold text-[#E6ECF2]">
                            [{f.severity}] {f.title}
                          </div>
                          <div className="text-xs text-[#9BA6B4]">{f.detail}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-[#9BA6B4]">
                      No structural phishing indicators triggered. Still verify site authenticity manually.
                    </div>
                  )}

                  <div className="pt-2 border-t border-[#1E252F] text-xs text-[#6B7785]">
                    {urlResult.limitationsNotice}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SCREEN: PRIVACY, PERMISSIONS, SMS SCAM SAFETY & REPORT */}
          {screen === 'privacy' && (
            <div className="space-y-5">
              {renderAndroidTopBar('Privacy, SMS Safety & Security Report')}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Camera Apps', count: evaluatedApps.filter((a) => a.permissions.includes('CAMERA')).length },
                  { label: 'Microphone Apps', count: evaluatedApps.filter((a) => a.permissions.includes('RECORD_AUDIO')).length },
                  { label: 'Location Apps', count: evaluatedApps.filter((a) => a.permissions.includes('ACCESS_FINE_LOCATION')).length },
                  { label: 'SMS / Overlay Apps', count: evaluatedApps.filter((a) => a.permissions.includes('READ_SMS') || a.permissions.includes('SYSTEM_ALERT_WINDOW')).length },
                ].map((stat) => (
                  <div key={stat.label} className="border border-[#1E252F] bg-[#101419] rounded-lg p-3.5">
                    <div className="text-xs text-[#8B97A5]">{stat.label}</div>
                    <div className="mt-1 text-xl font-mono font-semibold tabular-nums text-[#E6ECF2]">
                      {stat.count}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border border-[#1E252F] bg-[#101419] rounded-lg p-4 space-y-3">
                <div>
                  <div className="text-sm font-semibold text-[#E6ECF2]">
                    Policy-Compliant SMS Scam Analyzer
                  </div>
                  <p className="text-xs text-[#8B97A5] mt-0.5">
                    ZENTRIX does not request restricted <code className="font-mono">READ_SMS</code> permission. Paste suspicious SMS messages below for offline scam-pattern warnings.
                  </p>
                </div>
                <textarea
                  rows={3}
                  value={smsText}
                  onChange={(e) => setSmsText(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#080A0C] border border-[#232C37] text-xs text-[#E6ECF2]"
                />
                {smsFindings.length > 0 ? (
                  <ul className="space-y-1.5 text-xs text-amber-300">
                    {smsFindings.map((w) => (
                      <li key={w} className="flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-xs text-[#8B97A5]">No common scam keywords detected in pasted message.</div>
                )}
              </div>
            </div>
          )}

          {/* SCREEN: SUBSCRIPTION PLANS */}
          {screen === 'subscription' && (
            <div className="space-y-4">
              {renderAndroidTopBar('Subscription Plans')}
              <p className="text-xs text-[#8B97A5]">
                Manual bKash Send Money to <strong className="text-[#E6ECF2] font-mono">01747570144</strong>. Prices below are loaded live from the ZENTRIX backend and reflect any Admin pricing updates.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {plans.map((plan) => (
                  <div
                    key={plan.id}
                    className={`border rounded-lg p-5 space-y-3 bg-[#101419] ${
                      plan.billing_type === 'lifetime' ? 'border-[#39FF14]/60' : 'border-[#1E252F]'
                    }`}
                  >
                    <div className="text-xs font-mono text-[#39FF14] uppercase">{plan.billing_type}</div>
                    <div className="text-lg font-semibold text-[#E6ECF2]">{plan.name}</div>
                    <div className="text-2xl font-mono font-bold tabular-nums text-[#E6ECF2]">
                      BDT {plan.price_bdt}
                    </div>
                    <div className="text-xs text-[#8B97A5]">
                      {plan.billing_type === 'lifetime'
                        ? 'One-time payment · 1 Android device only'
                        : `${plan.duration_days || 30} days · 1 Android device`}
                    </div>
                    <p className="text-xs text-[#9BA6B4]">{plan.description}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPlanId(plan.id);
                        setScreen('payment');
                      }}
                      className="w-full py-2.5 rounded-lg bg-[#39FF14] text-[#080A0C] text-xs font-semibold hover:bg-[#52FF33] cursor-pointer"
                    >
                      Select Plan &amp; Pay via bKash
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SCREEN: PAYMENT INSTRUCTIONS & TRXID SUBMISSION */}
          {screen === 'payment' && (
            <div className="space-y-5">
              {renderAndroidTopBar(t.paymentTitle, 'subscription')}

              <div className="border border-[#1E252F] bg-[#101419] rounded-lg p-4 space-y-2 text-xs">
                <div className="text-sm font-semibold text-[#E6ECF2]">{t.paymentTitle}</div>
                <div className="text-[#9BA6B4]">{t.paymentStep1}</div>
                <div className="text-[#9BA6B4]">
                  {t.paymentStep2Prefix} <strong className="font-mono text-[#39FF14]">01747570144</strong> · Amount:{' '}
                  <strong className="font-mono text-[#E6ECF2]">BDT {selectedPlan?.price_bdt ?? 200}</strong> ({selectedPlan?.name ?? 'Lifetime License'}).
                </div>
                <div className="text-[#9BA6B4]">{t.paymentStep3}</div>
                <div className="text-amber-300">{t.paymentWarning}</div>
              </div>

              {!userToken ? (
                <div className="border border-[#1E252F] bg-[#101419] rounded-lg p-5 text-center space-y-3">
                  <div className="text-sm text-[#C8D0D8]">Sign in or create an account to submit your Transaction ID.</div>
                  <button
                    type="button"
                    onClick={() => setScreen('auth')}
                    className="px-4 py-2 rounded-lg bg-[#39FF14] text-[#080A0C] text-xs font-semibold cursor-pointer"
                  >
                    Go to Sign In / Register
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmitPayment} className="space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-[#8B97A5] mb-1">Selected Plan</label>
                      <select
                        value={selectedPlanId}
                        onChange={(e) => setSelectedPlanId(Number(e.target.value))}
                        className="w-full px-3 py-2.5 rounded-lg bg-[#080A0C] border border-[#232C37] text-sm text-[#E6ECF2]"
                      >
                        {plans.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — BDT {p.price_bdt}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-[#8B97A5] mb-1">Your bKash Sender Number</label>
                      <input
                        type="tel"
                        required
                        value={senderNumber}
                        onChange={(e) => setSenderNumber(e.target.value)}
                        placeholder="017XXXXXXXX"
                        className="w-full px-3 py-2.5 rounded-lg bg-[#080A0C] border border-[#232C37] text-sm font-mono text-[#E6ECF2]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-[#8B97A5] mb-1">bKash Transaction ID (TrxID)</label>
                    <input
                      type="text"
                      required
                      value={transactionId}
                      onChange={(e) => setTransactionId(e.target.value.toUpperCase())}
                      placeholder="BKS9X84K2M"
                      className="w-full px-3 py-2.5 rounded-lg bg-[#080A0C] border border-[#232C37] text-sm font-mono text-[#E6ECF2]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-[#8B97A5] mb-1">Optional Note (Never enter PIN/OTP)</label>
                    <input
                      type="text"
                      value={paymentNote}
                      onChange={(e) => setPaymentNote(e.target.value)}
                      placeholder="Sent from personal bKash account"
                      className="w-full px-3 py-2.5 rounded-lg bg-[#080A0C] border border-[#232C37] text-sm text-[#E6ECF2]"
                    />
                  </div>

                  {paymentErr && (
                    <div className="border border-red-500/40 bg-red-950/30 px-3.5 py-2.5 rounded-lg text-xs text-red-300">
                      {paymentErr}
                    </div>
                  )}
                  {paymentMsg && (
                    <div className="border border-[#2A3B30] bg-[#0E1812] px-3.5 py-2.5 rounded-lg text-xs text-[#B8F5BE] flex flex-wrap items-center justify-between gap-2">
                      <span>{paymentMsg}</span>
                      <button
                        type="button"
                        onClick={onJumpToAdmin}
                        className="underline font-semibold text-[#39FF14] cursor-pointer"
                      >
                        Verify in Owner Admin Console
                      </button>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={paymentBusy}
                    className="w-full py-2.5 rounded-lg bg-[#39FF14] text-[#080A0C] text-sm font-semibold hover:bg-[#52FF33] cursor-pointer disabled:opacity-50"
                  >
                    {paymentBusy ? 'Submitting...' : 'Submit Transaction ID for Manual Verification'}
                  </button>
                </form>
              )}

              {myPayments.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-[#1E252F]">
                  <div className="text-xs font-semibold text-[#E6ECF2]">Your Payment Verification Records</div>
                  {myPayments.map((rec) => (
                    <div
                      key={rec.id}
                      className="border border-[#1E252F] bg-[#101419] rounded-lg px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <div className="text-[#E6ECF2] font-medium">
                          {rec.plan_name} · BDT {rec.amount_bdt}
                        </div>
                        <div className="font-mono text-[#7E8B99]">
                          TrxID: {rec.transaction_id} · {formatDateShort(rec.created_at)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`font-semibold ${
                            rec.status === 'APPROVED'
                              ? 'text-[#39FF14]'
                              : rec.status === 'REJECTED'
                                ? 'text-red-400'
                                : 'text-amber-400'
                          }`}
                        >
                          {rec.status}
                        </div>
                        {rec.issued_license_prefix && (
                          <div className="font-mono text-[#8B97A5]">{rec.issued_license_prefix}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SCREEN: LICENSE ACTIVATION */}
          {screen === 'license' && (
            <div className="space-y-5">
              {renderAndroidTopBar('License Activation & Status')}

              <div className="border border-[#1E252F] bg-[#101419] rounded-lg p-4 space-y-1">
                <div className="text-xs text-[#8B97A5]">Active Android Hardware Target</div>
                <div className="text-sm font-semibold text-[#E6ECF2]">{activeDevice.label}</div>
                <div className="text-xs font-mono text-[#39FF14]">{activeDevice.id}</div>
                <p className="text-xs text-[#7E8B99] pt-1">
                  Switch between Device A and Device B in the right-hand panel after activating a key to verify server-side duplicate activation blocking.
                </p>
              </div>

              {!userToken ? (
                <div className="border border-[#1E252F] bg-[#101419] rounded-lg p-5 text-center space-y-3">
                  <div className="text-sm text-[#C8D0D8]">Sign in first to activate a license key.</div>
                  <button
                    type="button"
                    onClick={() => setScreen('auth')}
                    className="px-4 py-2 rounded-lg bg-[#39FF14] text-[#080A0C] text-xs font-semibold cursor-pointer"
                  >
                    Sign In
                  </button>
                </div>
              ) : (
                <form onSubmit={handleActivateLicense} className="space-y-3">
                  <div>
                    <label className="block text-xs text-[#8B97A5] mb-1">
                      License Key (Format: ZTX-XXXX-XXXX-XXXX-XXXX)
                    </label>
                    <input
                      type="text"
                      required
                      value={licenseKeyInput}
                      onChange={(e) => setLicenseKeyInput(e.target.value.toUpperCase())}
                      placeholder="ZTX-XXXX-XXXX-XXXX-XXXX"
                      className="w-full px-3.5 py-2.5 rounded-lg bg-[#080A0C] border border-[#232C37] text-sm font-mono text-[#E6ECF2]"
                    />
                  </div>

                  {licenseErr && (
                    <div className="border border-red-500/40 bg-red-950/30 px-3.5 py-2.5 rounded-lg text-xs text-red-300">
                      {licenseErr}
                    </div>
                  )}
                  {licenseMsg && (
                    <div className="border border-[#2A3B30] bg-[#0E1812] px-3.5 py-2.5 rounded-lg text-xs text-[#B8F5BE]">
                      {licenseMsg}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={licenseBusy}
                    className="w-full py-2.5 rounded-lg bg-[#39FF14] text-[#080A0C] text-sm font-semibold hover:bg-[#52FF33] cursor-pointer disabled:opacity-50"
                  >
                    {licenseBusy ? 'Validating Key...' : 'Activate & Bind to This Device'}
                  </button>
                </form>
              )}

              {myLicenses.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-[#1E252F]">
                  <div className="text-xs font-semibold text-[#E6ECF2]">Your Licenses</div>
                  {myLicenses.map((lic) => (
                    <div
                      key={lic.id}
                      className="border border-[#1E252F] bg-[#101419] rounded-lg p-3.5 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[#E6ECF2]">{lic.key_prefix}</span>
                        <span
                          className={`font-semibold ${
                            lic.status === 'ACTIVE'
                              ? 'text-[#39FF14]'
                              : lic.status === 'REVOKED'
                                ? 'text-red-400'
                                : 'text-amber-400'
                          }`}
                        >
                          {lic.status}
                        </span>
                      </div>
                      <div className="text-[#8B97A5]">
                        {lic.plan_name} · Device: {lic.device_label || 'Not bound'}
                      </div>
                      <div className="font-mono text-[#6B7785]">
                        {lic.plan_type === 'lifetime'
                          ? 'Lifetime License (Single Device)'
                          : `Expires: ${formatDateShort(lic.expires_at)}`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SCREEN: UPDATE CENTER */}
          {screen === 'update' && (
            <div className="space-y-4">
              {renderAndroidTopBar('APK Update Center')}
              <div className="border border-[#1E252F] bg-[#101419] rounded-lg p-4 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[#8B97A5]">Current Installed Build</span>
                  <span className="font-mono text-[#E6ECF2]">Version Code {installedVersionCode}</span>
                </div>
                <p className="text-[#8B97A5]">
                  Official updates are verified via SHA-256 checksum and release signing certificate before invoking Android&apos;s system installer. Silent installation is never performed and your active license stays intact.
                </p>
                <button
                  type="button"
                  onClick={refreshUpdateCheck}
                  className="px-3 py-1.5 rounded border border-[#2A3340] text-[#C8D0D8] hover:text-[#39FF14] cursor-pointer"
                >
                  Check Official Update Server
                </button>
              </div>

              {updateCheck?.latest ? (
                <div
                  className={`border rounded-lg p-4 space-y-3 bg-[#101419] ${
                    updateCheck.mandatoryUpdate ? 'border-amber-500/60' : 'border-[#1E252F]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-[#E6ECF2]">
                      ZENTRIX v{updateCheck.latest.version_name} (Code {updateCheck.latest.version_code})
                    </div>
                    <span className="text-xs font-mono text-[#39FF14]">
                      {updateCheck.updateAvailable
                        ? updateCheck.mandatoryUpdate
                          ? 'Mandatory Security Update'
                          : 'Update Available'
                        : 'Installed'}
                    </span>
                  </div>
                  <p className="text-xs text-[#9BA6B4]">{updateCheck.latest.release_notes}</p>
                  <div className="text-xs font-mono text-[#7E8B99] break-all">
                    SHA-256: {updateCheck.latest.sha256_hash}
                  </div>
                  <div className="text-xs font-mono text-[#7E8B99]">
                    Size: {formatBytes(updateCheck.latest.file_size_bytes)}
                  </div>
                  {updateCheck.updateAvailable && updateCheck.latest.downloadUrl && (
                    <a
                      href={updateCheck.latest.downloadUrl}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#39FF14] text-[#080A0C] text-xs font-semibold hover:bg-[#52FF33]"
                    >
                      <Download className="w-4 h-4" />
                      Download Verified APK
                    </a>
                  )}
                </div>
              ) : (
                <div className="border border-[#1E252F] bg-[#101419] rounded-lg p-5 text-xs text-[#8B97A5] space-y-2">
                  <div>No APK release has been uploaded to the server yet.</div>
                  <button
                    type="button"
                    onClick={onJumpToAdmin}
                    className="text-[#39FF14] underline cursor-pointer"
                  >
                    Upload an APK release from the Owner Admin Console
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SCREEN: WHATSAPP SUPPORT & FAQ */}
          {screen === 'support' && (
            <div className="space-y-4">
              {renderAndroidTopBar('WhatsApp Support & Help')}

              <div className="border border-[#1E252F] bg-[#101419] rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-[#E6ECF2]">Direct WhatsApp Support</div>
                  <div className="text-xs font-mono text-[#39FF14]">01747570144</div>
                  <p className="text-xs text-[#8B97A5]">
                    Payment verification help, license activation troubleshooting, and APK update support.
                  </p>
                </div>
                <a
                  href="https://wa.me/8801747570144"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2.5 rounded-lg bg-[#39FF14] text-[#080A0C] text-xs font-semibold hover:bg-[#52FF33] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <MessageCircle className="w-4 h-4" />
                  Chat on WhatsApp
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {supportInfo?.helpTopics.map((topic) => (
                <div key={topic.id} className="border border-[#1E252F] bg-[#101419] rounded-lg p-4 space-y-2">
                  <div className="text-sm font-semibold text-[#E6ECF2]">{topic.title}</div>
                  <ol className="space-y-1 text-xs text-[#9BA6B4] list-decimal list-inside">
                    {topic.steps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                </div>
              ))}

              {supportInfo?.faqs.map((faq) => (
                <div key={faq.q} className="border border-[#1E252F] bg-[#101419] rounded-lg p-4 space-y-1">
                  <div className="text-xs font-semibold text-[#E6ECF2]">{faq.q}</div>
                  <div className="text-xs text-[#8B97A5]">{faq.a}</div>
                </div>
              ))}
            </div>
          )}

          {/* SCREEN: SETTINGS & PRIVACY POLICY */}
          {screen === 'settings' && (
            <div className="space-y-4">
              {renderAndroidTopBar('Settings, Privacy & Terms')}

              <div className="border border-[#1E252F] bg-[#101419] rounded-lg p-4 space-y-1 text-xs">
                <div className="text-sm font-semibold text-[#E6ECF2]">Account</div>
                <div className="text-[#9BA6B4]">
                  {user ? `${user.fullName} · ${user.email} · ${user.phone}` : 'Not signed in'}
                </div>
              </div>

              <div className="border border-[#1E252F] bg-[#101419] rounded-lg p-4 space-y-2 text-xs text-[#9BA6B4]">
                <div className="text-sm font-semibold text-[#E6ECF2]">Privacy Policy &amp; Scan Limitations</div>
                <p>• ZENTRIX requests only essential Android permissions and never collects banking PINs, OTPs, passwords, or private banking app data.</p>
                <p>• ZENTRIX is independent and not affiliated with bKash or Nagad.</p>
                <p>• Security scanning inspects package metadata, permission risks, and URL heuristics. No tool guarantees 100% malware or phishing prevention.</p>
                <p>• Terms of Service: One lifetime license (BDT 200) activates on one Android device only and is issued strictly after manual TrxID confirmation.</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <a
                  href="https://wa.me/8801747570144"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2.5 rounded-lg bg-[#39FF14] text-[#080A0C] text-xs font-semibold hover:bg-[#52FF33] inline-flex items-center gap-1.5"
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp Support (01747570144)
                </a>
                {userToken && (
                  <button
                    type="button"
                    onClick={() => {
                      setUserToken(null);
                      setUser(null);
                      setMyPayments([]);
                      setMyLicenses([]);
                      setDeviceValidation(null);
                      setScreen('welcome');
                    }}
                    className="px-4 py-2.5 rounded-lg border border-red-500/40 text-xs text-red-400 hover:bg-red-950/30 cursor-pointer"
                  >
                    Sign Out
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Control Rail: Direct Screen Jump + Device Binding Test Controls */}
      <div className="xl:col-span-4 space-y-5">
        <div className="border border-[#1E252F] bg-[#0D1116] rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#E6ECF2]">
            <ShieldCheck className="w-4 h-4 text-[#39FF14]" />
            <span>{t.screenNavigator}</span>
          </div>
          <div className="grid grid-cols-1 gap-1">
            {screenList.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setScreen(item.id)}
                className={`text-left px-3 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  screen === item.id
                    ? 'bg-[#17202B] text-[#39FF14]'
                    : 'text-[#8B97A5] hover:bg-[#12171F] hover:text-[#E6ECF2]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="border border-[#1E252F] bg-[#0D1116] rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#E6ECF2]">
            <Lock className="w-4 h-4 text-[#C8D0D8]" />
            <span>{t.deviceTestTitle}</span>
          </div>
          <p className="text-xs text-[#8B97A5]">{t.deviceTestDesc}</p>

          <div className="space-y-1.5">
            {SIMULATED_DEVICES.map((dev, idx) => (
              <button
                key={dev.id}
                type="button"
                onClick={() => setDeviceIndex(idx)}
                className={`w-full text-left px-3 py-2 rounded-md border text-xs transition-colors cursor-pointer ${
                  deviceIndex === idx
                    ? 'border-[#39FF14]/60 bg-[#121E15] text-[#E6ECF2]'
                    : 'border-[#1E252F] bg-[#0A0D11] text-[#8B97A5] hover:text-[#E6ECF2]'
                }`}
              >
                <div className="font-medium">{dev.label}</div>
                <div className="font-mono text-[11px] text-[#7E8B99]">{dev.id}</div>
              </button>
            ))}
          </div>

          <div className="pt-2 border-t border-[#1E252F]">
            <label className="block text-xs text-[#8B97A5] mb-1">
              {t.installedVersionLabel}
            </label>
            <input
              type="number"
              min={1}
              max={99}
              value={installedVersionCode}
              onChange={(e) => setInstalledVersionCode(Math.max(1, Number(e.target.value) || 1))}
              className="w-full px-3 py-1.5 rounded-md bg-[#080A0C] border border-[#232C37] text-xs font-mono text-[#E6ECF2]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
