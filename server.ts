import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import { APK_UPLOAD_DIR, db, writeAuditLog } from './server/db.ts';
import {
  generateLicenseKey,
  getClientIp,
  hashDeviceId,
  hashLicenseKey,
  hashPassword,
  rateLimit,
  requireAuth,
  signToken,
  timingSafeComparePlain,
  verifyPassword,
} from './server/security.ts';
import type { AuthPayload } from './server/security.ts';
import { analyzeUrlSafely } from './server/urlChecker.ts';

dotenv.config();

type AuthedRequest = Request & { auth?: AuthPayload };

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

// Security headers (iframe-compatible)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

const OFFICIAL_BKASH_NUMBER = '01747570144';
const OFFICIAL_WHATSAPP_URL = 'https://wa.me/8801747570144';

// Multer config for real APK uploads with strict extension & size enforcement
const apkStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, APK_UPLOAD_DIR);
  },
  filename: (_req, _file, cb) => {
    const uniqueName = `zentrix-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.apk`;
    cb(null, uniqueName);
  },
});

const apkUpload = multer({
  storage: apkStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.apk') {
      cb(new Error('Only .apk package files are allowed.'));
      return;
    }
    cb(null, true);
  },
});

// Helper: compute live license expiration state
function refreshExpiredLicenses(): void {
  db.prepare(`
    UPDATE licenses
    SET status = 'EXPIRED'
    WHERE status = 'ACTIVE'
      AND plan_type = 'monthly'
      AND expires_at IS NOT NULL
      AND datetime(expires_at) < datetime('now')
  `).run();
}

// Helper: check if admin is configured via env or claimed in DB
function getAdminConfigState(): { mode: 'env' | 'db' | 'unclaimed'; adminEmail: string | null } {
  const envPass = process.env.ADMIN_PASSWORD?.trim();
  if (envPass) {
    return {
      mode: 'env',
      adminEmail: (process.env.ADMIN_EMAIL?.trim() || 'owner@zentrix.sec').toLowerCase(),
    };
  }
  const dbAdmin = db.prepare('SELECT email FROM admin_accounts ORDER BY id ASC LIMIT 1').get() as
    | { email: string }
    | undefined;
  if (dbAdmin) {
    return { mode: 'db', adminEmail: dbAdmin.email };
  }
  return { mode: 'unclaimed', adminEmail: null };
}

// ============================================================================
// PUBLIC / SUPPORT / PLANS / ANNOUNCEMENTS
// ============================================================================

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ZENTRIX Backend API', timestamp: new Date().toISOString() });
});

app.get('/api/support/info', (_req, res) => {
  res.json({
    appName: 'ZENTRIX',
    tagline: 'Your Digital World. Our Protection.',
    supportNumber: OFFICIAL_BKASH_NUMBER,
    whatsappUrl: OFFICIAL_WHATSAPP_URL,
    paymentMethod: 'Manual bKash Send Money',
    bkashReceiverNumber: OFFICIAL_BKASH_NUMBER,
    affiliationDisclaimer:
      'ZENTRIX is an independent Android cybersecurity application and is not affiliated with, endorsed by, or partnered with bKash Limited or Nagad Limited.',
    securityDisclosure:
      'ZENTRIX never collects banking PINs, OTPs, or passwords, and never reads private banking app storage. Security scans provide risk analysis within Android permission boundaries and cannot guarantee 100% threat detection.',
    helpTopics: [
      {
        id: 'payment',
        title: 'How manual bKash payment verification works',
        steps: [
          'Open the official bKash app and select Send Money.',
          `Send the exact plan amount (e.g. BDT 200 for Lifetime) to ${OFFICIAL_BKASH_NUMBER}.`,
          'Copy the official Transaction ID (TrxID) from your bKash confirmation SMS.',
          'Submit your sender number and TrxID in the ZENTRIX Payment screen.',
          'Wait for manual owner verification. Never trust payment screenshots or share your PIN/OTP.',
        ],
      },
      {
        id: 'license',
        title: 'Activating your license key on Android',
        steps: [
          'Once your payment is approved, your unique ZTX license key is issued in your account.',
          'Open ZENTRIX -> License Activation and enter your license key.',
          'Each lifetime or monthly license binds cryptographically to one Android device identifier.',
          'To transfer to a replacement phone, contact WhatsApp support for an admin device reset.',
        ],
      },
      {
        id: 'updates',
        title: 'Installing verified APK updates safely',
        steps: [
          'Open Update Center inside ZENTRIX to check the official update server.',
          'Download the release directly from ZENTRIX and allow the app to verify the SHA-256 hash.',
          'Approve Android "Install unknown apps" permission when prompted. ZENTRIX never installs silently.',
          'Your active license remains preserved across updates.',
        ],
      },
    ],
    faqs: [
      {
        q: 'Can I use one Lifetime License on two phones?',
        a: 'No. One BDT 200 lifetime license activates on one Android device only, enforced by server-side device hash binding.',
      },
      {
        q: 'Why does ZENTRIX not auto-approve screenshots?',
        a: 'Payment screenshots are easily forged. ZENTRIX verifies every bKash Transaction ID manually before generating a license key.',
      },
      {
        q: 'Does ZENTRIX read my bKash or Nagad balance?',
        a: 'Never. ZENTRIX never accesses private banking app data, PINs, OTPs, or passwords.',
      },
    ],
  });
});

app.get('/api/plans', (_req, res) => {
  const plans = db
    .prepare(
      'SELECT id, code, name, billing_type, price_bdt, duration_days, device_limit, description, is_active, updated_at FROM plans WHERE is_active = 1 ORDER BY price_bdt ASC'
    )
    .all();
  res.json({
    paymentNumber: OFFICIAL_BKASH_NUMBER,
    paymentMethod: 'Manual bKash Send Money',
    plans,
  });
});

app.get('/api/announcements', (_req, res) => {
  const rows = db
    .prepare('SELECT id, title, body, severity, published_by, created_at FROM announcements ORDER BY id DESC LIMIT 20')
    .all();
  res.json({ announcements: rows });
});

// ============================================================================
// CUSTOMER AUTHENTICATION
// ============================================================================

app.post('/api/auth/register', rateLimit('auth_register', 15, 60_000), (req: Request, res: Response) => {
  const { fullName, email, phone, password } = req.body ?? {};
  if (
    typeof fullName !== 'string' ||
    typeof email !== 'string' ||
    typeof phone !== 'string' ||
    typeof password !== 'string'
  ) {
    res.status(400).json({ error: 'Full name, email, phone, and password are required.' });
    return;
  }

  const cleanName = fullName.trim();
  const cleanEmail = email.trim().toLowerCase();
  const cleanPhone = phone.trim();

  if (cleanName.length < 2 || cleanName.length > 80) {
    res.status(400).json({ error: 'Full name must be between 2 and 80 characters.' });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    res.status(400).json({ error: 'Enter a valid email address.' });
    return;
  }
  if (!/^01[3-9]\d{8}$/.test(cleanPhone)) {
    res.status(400).json({ error: 'Enter a valid 11-digit Bangladesh mobile number (e.g. 017XXXXXXXX).' });
    return;
  }
  if (password.length < 8 || password.length > 128) {
    res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const passwordHash = hashPassword(password);
  const result = db
    .prepare('INSERT INTO users (full_name, email, phone, password_hash) VALUES (?, ?, ?, ?)')
    .run(cleanName, cleanEmail, cleanPhone, passwordHash);

  const userId = Number(result.lastInsertRowid);
  const token = signToken({ sub: String(userId), email: cleanEmail, role: 'user' });
  writeAuditLog('user', String(userId), 'USER_REGISTERED', cleanEmail, `Phone: ${cleanPhone}`, getClientIp(req));

  res.status(201).json({
    token,
    user: { id: userId, fullName: cleanName, email: cleanEmail, phone: cleanPhone },
  });
});

app.post('/api/auth/login', rateLimit('auth_login', 20, 60_000), (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const cleanEmail = email.trim().toLowerCase();
  const user = db
    .prepare('SELECT id, full_name, email, phone, password_hash FROM users WHERE email = ?')
    .get(cleanEmail) as
    | { id: number; full_name: string; email: string; phone: string; password_hash: string }
    | undefined;

  if (!user || !verifyPassword(password, user.password_hash)) {
    writeAuditLog('anonymous', cleanEmail, 'USER_LOGIN_FAILED', cleanEmail, 'Invalid credentials', getClientIp(req));
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const token = signToken({ sub: String(user.id), email: user.email, role: 'user' });
  writeAuditLog('user', String(user.id), 'USER_LOGIN_SUCCESS', user.email, 'Session issued', getClientIp(req));

  res.json({
    token,
    user: { id: user.id, fullName: user.full_name, email: user.email, phone: user.phone },
  });
});

app.get('/api/auth/me', requireAuth('user'), (req: AuthedRequest, res: Response) => {
  const userId = Number(req.auth!.sub);
  const user = db
    .prepare('SELECT id, full_name, email, phone, created_at FROM users WHERE id = ?')
    .get(userId) as
    | { id: number; full_name: string; email: string; phone: string; created_at: string }
    | undefined;

  if (!user) {
    res.status(404).json({ error: 'User account not found.' });
    return;
  }
  res.json({
    user: {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      phone: user.phone,
      createdAt: user.created_at,
    },
  });
});

// ============================================================================
// CUSTOMER PAYMENTS (MANUAL BKASH SEND MONEY -> PENDING REVIEW)
// ============================================================================

app.post(
  '/api/payments/submit',
  rateLimit('payment_submit', 10, 60_000),
  requireAuth('user'),
  (req: AuthedRequest, res: Response) => {
    const userId = Number(req.auth!.sub);
    const { planId, senderNumber, transactionId, customerNote } = req.body ?? {};

    if (typeof planId !== 'number' || typeof senderNumber !== 'string' || typeof transactionId !== 'string') {
      res.status(400).json({ error: 'Plan, sender bKash number, and Transaction ID are required.' });
      return;
    }

    const cleanSender = senderNumber.trim();
    const cleanTxId = transactionId.trim().toUpperCase();
    const cleanNote = typeof customerNote === 'string' ? customerNote.trim().slice(0, 240) : '';

    if (!/^01[3-9]\d{8}$/.test(cleanSender)) {
      res.status(400).json({ error: 'Enter a valid 11-digit bKash sender number (e.g. 017XXXXXXXX).' });
      return;
    }

    if (!/^[A-Z0-9]{6,20}$/.test(cleanTxId)) {
      res.status(400).json({
        error: 'Transaction ID must be 6 to 20 alphanumeric characters (as shown in official bKash SMS).',
      });
      return;
    }

    // Explicitly block users accidentally typing PIN/OTP keywords into notes
    if (/\b(pin|otp)\b/i.test(cleanNote)) {
      res.status(400).json({
        error: 'Security block: never include a bKash PIN or OTP in your payment submission.',
      });
      return;
    }

    const plan = db
      .prepare('SELECT id, name, price_bdt, billing_type, is_active FROM plans WHERE id = ?')
      .get(planId) as
      | { id: number; name: string; price_bdt: number; billing_type: string; is_active: number }
      | undefined;

    if (!plan || plan.is_active !== 1) {
      res.status(404).json({ error: 'Selected subscription plan is not available.' });
      return;
    }

    const duplicateTx = db.prepare('SELECT id FROM payments WHERE transaction_id = ?').get(cleanTxId);
    if (duplicateTx) {
      res.status(409).json({ error: 'This Transaction ID has already been submitted.' });
      return;
    }

    const insert = db
      .prepare(`
        INSERT INTO payments (user_id, plan_id, amount_bdt, receiver_number, sender_number, transaction_id, customer_note, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
      `)
      .run(userId, plan.id, plan.price_bdt, OFFICIAL_BKASH_NUMBER, cleanSender, cleanTxId, cleanNote);

    const paymentId = Number(insert.lastInsertRowid);
    writeAuditLog(
      'user',
      String(userId),
      'PAYMENT_SUBMITTED',
      `payment:${paymentId}`,
      `Plan=${plan.name}, BDT=${plan.price_bdt}, TrxID=${cleanTxId}`,
      getClientIp(req)
    );

    res.status(201).json({
      payment: {
        id: paymentId,
        planName: plan.name,
        amountBdt: plan.price_bdt,
        receiverNumber: OFFICIAL_BKASH_NUMBER,
        senderNumber: cleanSender,
        transactionId: cleanTxId,
        status: 'PENDING',
      },
      message:
        'Payment request submitted for manual owner verification. Your license will be issued strictly after Transaction ID confirmation.',
    });
  }
);

app.get('/api/payments/my', requireAuth('user'), (req: AuthedRequest, res: Response) => {
  const userId = Number(req.auth!.sub);
  const rows = db
    .prepare(`
      SELECT p.id, p.amount_bdt, p.payment_method, p.receiver_number, p.sender_number,
             p.transaction_id, p.customer_note, p.status, p.admin_note, p.reviewed_at, p.created_at,
             pl.name as plan_name, pl.billing_type,
             l.key_prefix as issued_license_prefix, l.status as license_status
      FROM payments p
      JOIN plans pl ON pl.id = p.plan_id
      LEFT JOIN licenses l ON l.id = p.issued_license_id
      WHERE p.user_id = ?
      ORDER BY p.id DESC
    `)
    .all(userId);
  res.json({ payments: rows });
});

// ============================================================================
// CUSTOMER LICENSE ACTIVATION & VALIDATION
// ============================================================================

app.post(
  '/api/licenses/activate',
  rateLimit('license_activate', 15, 60_000),
  requireAuth('user'),
  (req: AuthedRequest, res: Response) => {
    refreshExpiredLicenses();
    const userId = Number(req.auth!.sub);
    const { licenseKey, deviceId, deviceLabel } = req.body ?? {};

    if (typeof licenseKey !== 'string' || typeof deviceId !== 'string') {
      res.status(400).json({ error: 'License key and Android device identifier are required.' });
      return;
    }

    const cleanKey = licenseKey.trim().toUpperCase();
    const cleanDeviceId = deviceId.trim();
    const cleanDeviceLabel =
      typeof deviceLabel === 'string' && deviceLabel.trim().length > 0
        ? deviceLabel.trim().slice(0, 80)
        : 'Android Device';

    if (!/^ZTX-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(cleanKey)) {
      res.status(400).json({ error: 'Invalid license key format. Expected ZTX-XXXX-XXXX-XXXX-XXXX.' });
      return;
    }
    if (cleanDeviceId.length < 6 || cleanDeviceId.length > 128) {
      res.status(400).json({ error: 'Invalid device identifier.' });
      return;
    }

    const keyHash = hashLicenseKey(cleanKey);
    const deviceHash = hashDeviceId(cleanDeviceId);

    const license = db
      .prepare(`
        SELECT l.*, pl.duration_days, pl.name as plan_name
        FROM licenses l
        JOIN plans pl ON pl.id = l.plan_id
        WHERE l.key_hash = ?
      `)
      .get(keyHash) as
      | {
          id: number;
          key_prefix: string;
          user_id: number | null;
          plan_type: 'monthly' | 'lifetime';
          status: string;
          device_id_hash: string | null;
          device_label: string | null;
          activated_at: string | null;
          expires_at: string | null;
          duration_days: number | null;
          plan_name: string;
        }
      | undefined;

    if (!license) {
      writeAuditLog('user', String(userId), 'LICENSE_ACTIVATE_NOT_FOUND', cleanKey.slice(0, 8), '', getClientIp(req));
      res.status(404).json({ error: 'License key not recognized.' });
      return;
    }

    if (license.status === 'REVOKED') {
      res.status(403).json({ error: 'This license key has been revoked by the administrator.' });
      return;
    }

    if (license.status === 'EXPIRED') {
      res.status(403).json({ error: 'This monthly license has expired. Submit a renewal payment to continue.' });
      return;
    }

    if (license.user_id !== null && license.user_id !== userId) {
      res.status(403).json({ error: 'This license belongs to another ZENTRIX account.' });
      return;
    }

    // Strict one-device binding check
    if (license.device_id_hash && license.device_id_hash !== deviceHash) {
      writeAuditLog(
        'user',
        String(userId),
        'LICENSE_DUPLICATE_DEVICE_BLOCKED',
        `license:${license.id}`,
        `Attempted device=${cleanDeviceLabel}`,
        getClientIp(req)
      );
      res.status(409).json({
        error:
          'Duplicate activation blocked: this license is already bound to another Android device. Contact WhatsApp support for a device transfer.',
      });
      return;
    }

    // Idempotent re-activation on the SAME bound device
    if (license.status === 'ACTIVE' && license.device_id_hash === deviceHash) {
      res.json({
        status: 'ACTIVE',
        message: 'License is already active on this device.',
        license: {
          id: license.id,
          keyPrefix: license.key_prefix,
          planName: license.plan_name,
          planType: license.plan_type,
          status: license.status,
          deviceLabel: license.device_label,
          activatedAt: license.activated_at,
          expiresAt: license.expires_at,
        },
      });
      return;
    }

    // First-time activation: bind user + device hash + compute expiry if monthly
    const nowIso = new Date().toISOString();
    let expiresAt: string | null = null;
    if (license.plan_type === 'monthly') {
      const days = license.duration_days || 30;
      expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    }

    db.prepare(`
      UPDATE licenses
      SET user_id = COALESCE(user_id, ?),
          status = 'ACTIVE',
          device_id_hash = ?,
          device_label = ?,
          activated_at = ?,
          expires_at = ?
      WHERE id = ?
    `).run(userId, deviceHash, cleanDeviceLabel, nowIso, expiresAt, license.id);

    writeAuditLog(
      'user',
      String(userId),
      'LICENSE_ACTIVATED',
      `license:${license.id}`,
      `Device=${cleanDeviceLabel}, Type=${license.plan_type}`,
      getClientIp(req)
    );

    res.json({
      status: 'ACTIVE',
      message:
        license.plan_type === 'lifetime'
          ? 'Lifetime license activated and permanently bound to this Android device.'
          : 'Monthly license activated and bound to this Android device.',
      license: {
        id: license.id,
        keyPrefix: license.key_prefix,
        planName: license.plan_name,
        planType: license.plan_type,
        status: 'ACTIVE',
        deviceLabel: cleanDeviceLabel,
        activatedAt: nowIso,
        expiresAt,
      },
    });
  }
);

app.post('/api/licenses/validate', requireAuth('user'), (req: AuthedRequest, res: Response) => {
  refreshExpiredLicenses();
  const userId = Number(req.auth!.sub);
  const { deviceId } = req.body ?? {};
  if (typeof deviceId !== 'string' || deviceId.trim().length < 6) {
    res.status(400).json({ error: 'Device identifier is required.' });
    return;
  }

  const deviceHash = hashDeviceId(deviceId);
  const activeLicense = db
    .prepare(`
      SELECT l.id, l.key_prefix, l.plan_type, l.status, l.device_label, l.activated_at, l.expires_at, pl.name as plan_name
      FROM licenses l
      JOIN plans pl ON pl.id = l.plan_id
      WHERE l.user_id = ? AND l.device_id_hash = ?
      ORDER BY l.id DESC
      LIMIT 1
    `)
    .get(userId, deviceHash) as
    | {
        id: number;
        key_prefix: string;
        plan_type: string;
        status: string;
        device_label: string;
        activated_at: string;
        expires_at: string | null;
        plan_name: string;
      }
    | undefined;

  if (!activeLicense) {
    res.json({ valid: false, status: 'UNLICENSED', license: null });
    return;
  }

  res.json({
    valid: activeLicense.status === 'ACTIVE',
    status: activeLicense.status,
    license: activeLicense,
  });
});

app.get('/api/licenses/status', requireAuth('user'), (req: AuthedRequest, res: Response) => {
  refreshExpiredLicenses();
  const userId = Number(req.auth!.sub);
  const rows = db
    .prepare(`
      SELECT l.id, l.key_prefix, l.plan_type, l.status, l.device_label, l.activated_at, l.expires_at, l.revoked_reason, l.created_at,
             pl.name as plan_name, pl.price_bdt
      FROM licenses l
      JOIN plans pl ON pl.id = l.plan_id
      WHERE l.user_id = ?
      ORDER BY l.id DESC
    `)
    .all(userId);
  res.json({ licenses: rows });
});

// ============================================================================
// PHISHING URL CHECKER & UPDATES (PUBLIC/USER)
// ============================================================================

app.post('/api/security/check-url', rateLimit('url_check', 30, 60_000), async (req: Request, res: Response) => {
  const { url } = req.body ?? {};
  if (typeof url !== 'string' || url.trim().length < 3 || url.length > 2048) {
    res.status(400).json({ error: 'Enter a valid URL (between 3 and 2048 characters).' });
    return;
  }
  try {
    const result = await analyzeUrlSafely(url);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to parse URL.' });
  }
});

app.get('/api/updates/latest', (req: Request, res: Response) => {
  const currentVersionCode = Number(req.query.currentVersionCode || 0);
  const latest = db
    .prepare(`
      SELECT id, version_code, version_name, release_notes, is_mandatory, file_name,
             file_size_bytes, sha256_hash, signing_cert_sha256, created_at
      FROM apk_releases
      ORDER BY version_code DESC
      LIMIT 1
    `)
    .get() as
    | {
        id: number;
        version_code: number;
        version_name: string;
        release_notes: string;
        is_mandatory: number;
        file_name: string;
        file_size_bytes: number;
        sha256_hash: string;
        signing_cert_sha256: string;
        created_at: string;
      }
    | undefined;

  if (!latest) {
    res.json({ updateAvailable: false, latest: null });
    return;
  }

  res.json({
    updateAvailable: latest.version_code > currentVersionCode,
    mandatoryUpdate: Boolean(latest.is_mandatory) && latest.version_code > currentVersionCode,
    latest: {
      ...latest,
      is_mandatory: Boolean(latest.is_mandatory),
      downloadUrl: `/api/updates/download/${latest.id}`,
    },
  });
});

app.get('/api/updates/download/:id', (req: Request, res: Response) => {
  const releaseId = Number(req.params.id);
  if (!Number.isInteger(releaseId) || releaseId <= 0) {
    res.status(400).json({ error: 'Invalid release ID.' });
    return;
  }

  const release = db
    .prepare('SELECT file_name, stored_file_name, sha256_hash FROM apk_releases WHERE id = ?')
    .get(releaseId) as { file_name: string; stored_file_name: string; sha256_hash: string } | undefined;

  if (!release) {
    res.status(404).json({ error: 'APK release not found.' });
    return;
  }

  const resolved = path.resolve(APK_UPLOAD_DIR, release.stored_file_name);
  if (!resolved.startsWith(APK_UPLOAD_DIR + path.sep) || !fs.existsSync(resolved)) {
    res.status(404).json({ error: 'APK binary is unavailable on the update server.' });
    return;
  }

  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('X-Zentrix-SHA256', release.sha256_hash);
  res.download(resolved, release.file_name);
});

// ============================================================================
// ADMIN AUTHENTICATION (ENV OVERRIDE OR FIRST-RUN CLAIM)
// ============================================================================

app.get('/api/admin/bootstrap-status', (_req, res) => {
  const state = getAdminConfigState();
  res.json({
    configured: state.mode !== 'unclaimed',
    mode: state.mode,
    adminEmailHint: state.mode === 'env' ? state.adminEmail : undefined,
  });
});

app.post('/api/admin/bootstrap', rateLimit('admin_bootstrap', 5, 60_000), (req: Request, res: Response) => {
  const state = getAdminConfigState();
  if (state.mode !== 'unclaimed') {
    res.status(409).json({ error: 'Owner admin account is already configured.' });
    return;
  }

  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Admin email and password are required.' });
    return;
  }

  const cleanEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    res.status(400).json({ error: 'Enter a valid administrator email.' });
    return;
  }
  if (password.length < 10) {
    res.status(400).json({ error: 'Administrator password must be at least 10 characters long.' });
    return;
  }

  const hash = hashPassword(password);
  try {
    db.prepare('INSERT INTO admin_accounts (email, password_hash) VALUES (?, ?)').run(cleanEmail, hash);
  } catch {
    res.status(409).json({ error: 'Owner admin account was already claimed.' });
    return;
  }

  const token = signToken({ sub: 'admin-owner', email: cleanEmail, role: 'admin' }, 60 * 60 * 8);
  writeAuditLog('admin', cleanEmail, 'ADMIN_CLAIMED', cleanEmail, 'First-run owner setup completed', getClientIp(req));

  res.status(201).json({ token, admin: { email: cleanEmail } });
});

app.post('/api/admin/login', rateLimit('admin_login', 10, 60_000), (req: Request, res: Response) => {
  const state = getAdminConfigState();
  if (state.mode === 'unclaimed') {
    res.status(412).json({ error: 'No administrator configured yet. Complete first-run setup.' });
    return;
  }

  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Admin email and password are required.' });
    return;
  }

  const cleanEmail = email.trim().toLowerCase();
  let authenticated = false;

  if (state.mode === 'env') {
    const envEmail = (process.env.ADMIN_EMAIL?.trim() || 'owner@zentrix.sec').toLowerCase();
    const envPass = process.env.ADMIN_PASSWORD!.trim();
    authenticated = cleanEmail === envEmail && timingSafeComparePlain(password, envPass);
  } else {
    const record = db
      .prepare('SELECT email, password_hash FROM admin_accounts WHERE email = ?')
      .get(cleanEmail) as { email: string; password_hash: string } | undefined;
    authenticated = Boolean(record && verifyPassword(password, record.password_hash));
  }

  if (!authenticated) {
    writeAuditLog('anonymous', cleanEmail, 'ADMIN_LOGIN_FAILED', cleanEmail, 'Invalid admin credentials', getClientIp(req));
    res.status(401).json({ error: 'Invalid administrator email or password.' });
    return;
  }

  const token = signToken({ sub: 'admin-owner', email: cleanEmail, role: 'admin' }, 60 * 60 * 8);
  writeAuditLog('admin', cleanEmail, 'ADMIN_LOGIN_SUCCESS', cleanEmail, `Auth mode=${state.mode}`, getClientIp(req));

  res.json({ token, admin: { email: cleanEmail } });
});

// ============================================================================
// ADMIN PROTECTED ROUTES
// ============================================================================

app.get('/api/admin/reports', requireAuth('admin'), (_req: AuthedRequest, res: Response) => {
  refreshExpiredLicenses();

  const customers = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  const paymentsByStatus = db
    .prepare('SELECT status, COUNT(*) as count, COALESCE(SUM(amount_bdt), 0) as total_bdt FROM payments GROUP BY status')
    .all() as Array<{ status: string; count: number; total_bdt: number }>;

  const licensesByStatus = db
    .prepare('SELECT status, COUNT(*) as count FROM licenses GROUP BY status')
    .all() as Array<{ status: string; count: number }>;

  const licensesByPlan = db
    .prepare('SELECT plan_type, COUNT(*) as count FROM licenses GROUP BY plan_type')
    .all() as Array<{ plan_type: string; count: number }>;

  const releasesCount = db.prepare('SELECT COUNT(*) as count FROM apk_releases').get() as { count: number };

  const revenueApproved =
    paymentsByStatus.find((p) => p.status === 'APPROVED')?.total_bdt ?? 0;
  const pendingPayments =
    paymentsByStatus.find((p) => p.status === 'PENDING')?.count ?? 0;

  res.json({
    totalCustomers: customers.count,
    approvedRevenueBdt: revenueApproved,
    pendingPaymentsCount: pendingPayments,
    apkReleasesCount: releasesCount.count,
    paymentsByStatus,
    licensesByStatus,
    licensesByPlan,
  });
});

app.get('/api/admin/customers', requireAuth('admin'), (_req: AuthedRequest, res: Response) => {
  const rows = db
    .prepare(`
      SELECT u.id, u.full_name, u.email, u.phone, u.created_at,
             (SELECT COUNT(*) FROM payments p WHERE p.user_id = u.id) as payment_count,
             (SELECT COUNT(*) FROM licenses l WHERE l.user_id = u.id AND l.status = 'ACTIVE') as active_licenses
      FROM users u
      ORDER BY u.id DESC
    `)
    .all();
  res.json({ customers: rows });
});

app.get('/api/admin/payments', requireAuth('admin'), (req: AuthedRequest, res: Response) => {
  const statusFilter = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : 'ALL';
  const baseQuery = `
    SELECT p.id, p.user_id, p.plan_id, p.amount_bdt, p.payment_method, p.receiver_number,
           p.sender_number, p.transaction_id, p.customer_note, p.status, p.admin_note,
           p.reviewed_by, p.reviewed_at, p.issued_license_id, p.created_at,
           u.full_name as customer_name, u.email as customer_email,
           pl.name as plan_name, pl.billing_type,
           l.key_prefix as issued_license_prefix
    FROM payments p
    JOIN users u ON u.id = p.user_id
    JOIN plans pl ON pl.id = p.plan_id
    LEFT JOIN licenses l ON l.id = p.issued_license_id
  `;

  const rows =
    statusFilter === 'PENDING' || statusFilter === 'APPROVED' || statusFilter === 'REJECTED'
      ? db.prepare(`${baseQuery} WHERE p.status = ? ORDER BY p.id DESC`).all(statusFilter)
      : db.prepare(`${baseQuery} ORDER BY p.id DESC`).all();

  res.json({ payments: rows });
});

app.post('/api/admin/payments/:id/approve', requireAuth('admin'), (req: AuthedRequest, res: Response) => {
  const paymentId = Number(req.params.id);
  const adminNote = typeof req.body?.adminNote === 'string' ? req.body.adminNote.trim().slice(0, 240) : '';
  const adminEmail = req.auth!.email;

  const payment = db
    .prepare(`
      SELECT p.id, p.user_id, p.plan_id, p.status, p.transaction_id, pl.billing_type, pl.name as plan_name
      FROM payments p
      JOIN plans pl ON pl.id = p.plan_id
      WHERE p.id = ?
    `)
    .get(paymentId) as
    | {
        id: number;
        user_id: number;
        plan_id: number;
        status: string;
        transaction_id: string;
        billing_type: 'monthly' | 'lifetime';
        plan_name: string;
      }
    | undefined;

  if (!payment) {
    res.status(404).json({ error: 'Payment record not found.' });
    return;
  }
  if (payment.status !== 'PENDING') {
    res.status(409).json({ error: `Payment has already been ${payment.status.toLowerCase()}.` });
    return;
  }

  // Generate unique license key strictly AFTER manual approval; store only hash in DB
  const { rawKey, keyPrefix, keyHash } = generateLicenseKey();

  const licResult = db
    .prepare(`
      INSERT INTO licenses (key_prefix, key_hash, user_id, payment_id, plan_id, plan_type, status)
      VALUES (?, ?, ?, ?, ?, ?, 'ISSUED')
    `)
    .run(keyPrefix, keyHash, payment.user_id, payment.id, payment.plan_id, payment.billing_type);

  const licenseId = Number(licResult.lastInsertRowid);

  db.prepare(`
    UPDATE payments
    SET status = 'APPROVED',
        admin_note = ?,
        reviewed_by = ?,
        reviewed_at = datetime('now'),
        issued_license_id = ?
    WHERE id = ?
  `).run(adminNote || 'Verified via bKash statement', adminEmail, licenseId, payment.id);

  writeAuditLog(
    'admin',
    adminEmail,
    'PAYMENT_APPROVED_LICENSE_ISSUED',
    `payment:${payment.id}`,
    `TrxID=${payment.transaction_id}, License=${keyPrefix}`,
    getClientIp(req)
  );

  res.json({
    message: 'Payment approved and license key generated. Deliver this key securely to the customer (shown once).',
    issuedLicenseKey: rawKey,
    licenseId,
    keyPrefix,
  });
});

app.post('/api/admin/payments/:id/reject', requireAuth('admin'), (req: AuthedRequest, res: Response) => {
  const paymentId = Number(req.params.id);
  const adminNote = typeof req.body?.adminNote === 'string' ? req.body.adminNote.trim().slice(0, 240) : '';
  const adminEmail = req.auth!.email;

  if (adminNote.length < 3) {
    res.status(400).json({ error: 'Provide a brief rejection reason (e.g. Transaction ID not found in bKash).' });
    return;
  }

  const payment = db.prepare('SELECT id, status, transaction_id FROM payments WHERE id = ?').get(paymentId) as
    | { id: number; status: string; transaction_id: string }
    | undefined;

  if (!payment) {
    res.status(404).json({ error: 'Payment record not found.' });
    return;
  }
  if (payment.status !== 'PENDING') {
    res.status(409).json({ error: `Payment has already been ${payment.status.toLowerCase()}.` });
    return;
  }

  db.prepare(`
    UPDATE payments
    SET status = 'REJECTED',
        admin_note = ?,
        reviewed_by = ?,
        reviewed_at = datetime('now')
    WHERE id = ?
  `).run(adminNote, adminEmail, payment.id);

  writeAuditLog(
    'admin',
    adminEmail,
    'PAYMENT_REJECTED',
    `payment:${payment.id}`,
    `TrxID=${payment.transaction_id}, Reason=${adminNote}`,
    getClientIp(req)
  );

  res.json({ message: 'Payment rejected and recorded in audit trail.' });
});

app.get('/api/admin/licenses', requireAuth('admin'), (req: AuthedRequest, res: Response) => {
  refreshExpiredLicenses();
  const statusFilter = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : 'ALL';
  const baseQuery = `
    SELECT l.id, l.key_prefix, l.user_id, l.payment_id, l.plan_id, l.plan_type, l.status,
           l.device_label, l.activated_at, l.expires_at, l.revoked_reason, l.created_at,
           u.full_name as customer_name, u.email as customer_email,
           pl.name as plan_name
    FROM licenses l
    LEFT JOIN users u ON u.id = l.user_id
    JOIN plans pl ON pl.id = l.plan_id
  `;

  const rows =
    statusFilter === 'ISSUED' ||
    statusFilter === 'ACTIVE' ||
    statusFilter === 'EXPIRED' ||
    statusFilter === 'REVOKED'
      ? db.prepare(`${baseQuery} WHERE l.status = ? ORDER BY l.id DESC`).all(statusFilter)
      : db.prepare(`${baseQuery} ORDER BY l.id DESC`).all();

  res.json({ licenses: rows });
});

app.post('/api/admin/licenses/generate', requireAuth('admin'), (req: AuthedRequest, res: Response) => {
  const { planId, customerEmail } = req.body ?? {};
  const adminEmail = req.auth!.email;

  if (typeof planId !== 'number') {
    res.status(400).json({ error: 'Valid planId is required.' });
    return;
  }

  const plan = db.prepare('SELECT id, billing_type, name FROM plans WHERE id = ?').get(planId) as
    | { id: number; billing_type: 'monthly' | 'lifetime'; name: string }
    | undefined;
  if (!plan) {
    res.status(404).json({ error: 'Plan not found.' });
    return;
  }

  let userId: number | null = null;
  if (typeof customerEmail === 'string' && customerEmail.trim().length > 0) {
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(customerEmail.trim().toLowerCase()) as
      | { id: number }
      | undefined;
    if (!user) {
      res.status(404).json({ error: 'No registered customer found with that email.' });
      return;
    }
    userId = user.id;
  }

  const { rawKey, keyPrefix, keyHash } = generateLicenseKey();
  const result = db
    .prepare(`
      INSERT INTO licenses (key_prefix, key_hash, user_id, plan_id, plan_type, status)
      VALUES (?, ?, ?, ?, ?, 'ISSUED')
    `)
    .run(keyPrefix, keyHash, userId, plan.id, plan.billing_type);

  const licenseId = Number(result.lastInsertRowid);
  writeAuditLog(
    'admin',
    adminEmail,
    'LICENSE_GENERATED_MANUAL',
    `license:${licenseId}`,
    `Plan=${plan.name}, Prefix=${keyPrefix}`,
    getClientIp(req)
  );

  res.status(201).json({
    licenseId,
    rawKey,
    keyPrefix,
    planType: plan.billing_type,
    message: 'Unique license key created. Copy it now — only the cryptographic hash is persisted.',
  });
});

app.post('/api/admin/licenses/:id/revoke', requireAuth('admin'), (req: AuthedRequest, res: Response) => {
  const licenseId = Number(req.params.id);
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 200) : 'Revoked by admin';
  const adminEmail = req.auth!.email;

  const existing = db.prepare('SELECT id, key_prefix FROM licenses WHERE id = ?').get(licenseId) as
    | { id: number; key_prefix: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'License not found.' });
    return;
  }

  db.prepare(`UPDATE licenses SET status = 'REVOKED', revoked_reason = ? WHERE id = ?`).run(reason, licenseId);
  writeAuditLog('admin', adminEmail, 'LICENSE_REVOKED', `license:${licenseId}`, reason, getClientIp(req));
  res.json({ message: 'License revoked.' });
});

app.post('/api/admin/licenses/:id/renew', requireAuth('admin'), (req: AuthedRequest, res: Response) => {
  const licenseId = Number(req.params.id);
  const days = Number(req.body?.days || 30);
  const adminEmail = req.auth!.email;

  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    res.status(400).json({ error: 'Renewal duration must be between 1 and 3650 days.' });
    return;
  }

  const lic = db.prepare('SELECT id, plan_type, device_id_hash FROM licenses WHERE id = ?').get(licenseId) as
    | { id: number; plan_type: string; device_id_hash: string | null }
    | undefined;
  if (!lic) {
    res.status(404).json({ error: 'License not found.' });
    return;
  }

  const newStatus = lic.device_id_hash ? 'ACTIVE' : 'ISSUED';
  const newExpiry =
    lic.plan_type === 'lifetime' ? null : new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    UPDATE licenses
    SET status = ?, expires_at = ?, revoked_reason = ''
    WHERE id = ?
  `).run(newStatus, newExpiry, licenseId);

  writeAuditLog(
    'admin',
    adminEmail,
    'LICENSE_RENEWED',
    `license:${licenseId}`,
    `Status=${newStatus}, Expiry=${newExpiry ?? 'LIFETIME'}`,
    getClientIp(req)
  );
  res.json({ message: 'License renewed.', status: newStatus, expiresAt: newExpiry });
});

app.post('/api/admin/licenses/:id/unbind-device', requireAuth('admin'), (req: AuthedRequest, res: Response) => {
  const licenseId = Number(req.params.id);
  const adminEmail = req.auth!.email;

  const lic = db.prepare('SELECT id, status FROM licenses WHERE id = ?').get(licenseId) as
    | { id: number; status: string }
    | undefined;
  if (!lic) {
    res.status(404).json({ error: 'License not found.' });
    return;
  }
  if (lic.status === 'REVOKED') {
    res.status(409).json({ error: 'Cannot unbind a revoked license.' });
    return;
  }

  db.prepare(`
    UPDATE licenses
    SET device_id_hash = NULL, device_label = NULL, status = 'ISSUED'
    WHERE id = ?
  `).run(licenseId);

  writeAuditLog('admin', adminEmail, 'LICENSE_DEVICE_UNBOUND', `license:${licenseId}`, 'Device binding cleared', getClientIp(req));
  res.json({ message: 'Device binding cleared. License can now be activated on one new Android device.' });
});

app.get('/api/admin/plans', requireAuth('admin'), (_req: AuthedRequest, res: Response) => {
  const plans = db.prepare('SELECT * FROM plans ORDER BY id ASC').all();
  res.json({ plans });
});

app.put('/api/admin/plans/:id', requireAuth('admin'), (req: AuthedRequest, res: Response) => {
  const planId = Number(req.params.id);
  const { name, priceBdt, durationDays, description, isActive } = req.body ?? {};
  const adminEmail = req.auth!.email;

  const existing = db.prepare('SELECT * FROM plans WHERE id = ?').get(planId) as
    | { id: number; billing_type: string; name: string; price_bdt: number }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Plan not found.' });
    return;
  }

  const cleanPrice = Number(priceBdt);
  if (!Number.isInteger(cleanPrice) || cleanPrice < 1 || cleanPrice > 100000) {
    res.status(400).json({ error: 'Price (BDT) must be a whole number between 1 and 100,000.' });
    return;
  }

  const cleanName = typeof name === 'string' && name.trim().length >= 3 ? name.trim().slice(0, 80) : existing.name;
  const cleanDesc = typeof description === 'string' ? description.trim().slice(0, 260) : '';
  const cleanDuration =
    existing.billing_type === 'lifetime'
      ? null
      : Math.max(1, Math.min(365, Number(durationDays || 30)));
  const activeInt = isActive === false ? 0 : 1;

  db.prepare(`
    UPDATE plans
    SET name = ?, price_bdt = ?, duration_days = ?, description = ?, is_active = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(cleanName, cleanPrice, cleanDuration, cleanDesc, activeInt, planId);

  writeAuditLog(
    'admin',
    adminEmail,
    'PLAN_UPDATED',
    `plan:${planId}`,
    `Name=${cleanName}, BDT=${cleanPrice}, Duration=${cleanDuration ?? 'lifetime'}`,
    getClientIp(req)
  );
  res.json({ message: 'Subscription plan updated.' });
});

// APK Release Management
app.get('/api/admin/updates', requireAuth('admin'), (_req: AuthedRequest, res: Response) => {
  const releases = db
    .prepare('SELECT * FROM apk_releases ORDER BY version_code DESC')
    .all();
  res.json({ releases });
});

app.post('/api/admin/updates', requireAuth('admin'), (req: AuthedRequest, res: Response) => {
  apkUpload.single('apkFile')(req, res, (err: unknown) => {
    if (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'APK upload failed.' });
      return;
    }

    const file = (req as AuthedRequest & { file?: Express.Multer.File }).file;
    const { versionCode, versionName, releaseNotes, isMandatory, signingCertSha256 } = req.body ?? {};
    const adminEmail = req.auth!.email;

    if (!file) {
      res.status(400).json({ error: 'An .apk file is required.' });
      return;
    }

    const cleanupFile = () => {
      try {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      } catch {
        // ignore
      }
    };

    const parsedVersionCode = Number(versionCode);
    if (!Number.isInteger(parsedVersionCode) || parsedVersionCode <= 0) {
      cleanupFile();
      res.status(400).json({ error: 'versionCode must be a positive integer.' });
      return;
    }

    if (typeof versionName !== 'string' || !/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(versionName.trim())) {
      cleanupFile();
      res.status(400).json({ error: 'versionName must follow semantic versioning (e.g. 1.2.0).' });
      return;
    }

    if (typeof releaseNotes !== 'string' || releaseNotes.trim().length < 5) {
      cleanupFile();
      res.status(400).json({ error: 'Release notes are required.' });
      return;
    }

    const duplicate = db.prepare('SELECT id FROM apk_releases WHERE version_code = ?').get(parsedVersionCode);
    if (duplicate) {
      cleanupFile();
      res.status(409).json({ error: `Version code ${parsedVersionCode} already exists.` });
      return;
    }

    // Reject empty (0-byte), placeholder, or non-APK files by verifying ZIP/APK magic bytes (PK\x03\x04)
    if (file.size < 1024) {
      cleanupFile();
      res.status(400).json({
        error: 'Empty (0B) or placeholder files are rejected. Upload a real compiled Android .apk file.',
      });
      return;
    }

    const fileBuffer = fs.readFileSync(file.path);
    const hasApkZipHeader =
      fileBuffer.length >= 4 &&
      fileBuffer[0] === 0x50 &&
      fileBuffer[1] === 0x4b &&
      fileBuffer[2] === 0x03 &&
      fileBuffer[3] === 0x04;

    if (!hasApkZipHeader) {
      cleanupFile();
      res.status(400).json({
        error: 'Invalid APK archive: uploaded file is not a genuine Android APK package. Build a signed APK in Android Studio.',
      });
      return;
    }

    // Compute real SHA-256 hash of uploaded APK file
    const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const safeDisplayName = `ZENTRIX-v${versionName.trim()}.apk`;
    const mandatoryInt = isMandatory === 'true' || isMandatory === true ? 1 : 0;
    const cleanCert = typeof signingCertSha256 === 'string' ? signingCertSha256.trim().slice(0, 128) : '';

    const result = db
      .prepare(`
        INSERT INTO apk_releases
          (version_code, version_name, release_notes, is_mandatory, file_name, stored_file_name, file_size_bytes, sha256_hash, signing_cert_sha256, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        parsedVersionCode,
        versionName.trim(),
        releaseNotes.trim(),
        mandatoryInt,
        safeDisplayName,
        path.basename(file.path),
        file.size,
        sha256,
        cleanCert,
        adminEmail
      );

    writeAuditLog(
      'admin',
      adminEmail,
      'APK_RELEASE_PUBLISHED',
      `release:${result.lastInsertRowid}`,
      `v${versionName.trim()} (${parsedVersionCode}), SHA256=${sha256.slice(0, 16)}...`,
      getClientIp(req)
    );

    res.status(201).json({
      message: 'APK release published with verified SHA-256 checksum.',
      release: {
        id: Number(result.lastInsertRowid),
        versionCode: parsedVersionCode,
        versionName: versionName.trim(),
        sha256Hash: sha256,
        fileSizeBytes: file.size,
        isMandatory: Boolean(mandatoryInt),
      },
    });
  });
});

app.post('/api/admin/announcements', requireAuth('admin'), (req: AuthedRequest, res: Response) => {
  const { title, body, severity } = req.body ?? {};
  const adminEmail = req.auth!.email;

  if (typeof title !== 'string' || title.trim().length < 3 || typeof body !== 'string' || body.trim().length < 5) {
    res.status(400).json({ error: 'Title and announcement message are required.' });
    return;
  }

  const allowedSeverity = severity === 'SECURITY' || severity === 'UPDATE' ? severity : 'INFO';
  const result = db
    .prepare('INSERT INTO announcements (title, body, severity, published_by) VALUES (?, ?, ?, ?)')
    .run(title.trim().slice(0, 140), body.trim().slice(0, 1000), allowedSeverity, adminEmail);

  writeAuditLog('admin', adminEmail, 'ANNOUNCEMENT_PUBLISHED', `ann:${result.lastInsertRowid}`, title.trim(), getClientIp(req));
  res.status(201).json({ id: Number(result.lastInsertRowid), message: 'Announcement published.' });
});

app.get('/api/admin/audit-logs', requireAuth('admin'), (_req: AuthedRequest, res: Response) => {
  const logs = db
    .prepare('SELECT id, actor_type, actor_id, action, target, details, ip_address, created_at FROM audit_logs ORDER BY id DESC LIMIT 100')
    .all();
  res.json({ logs });
});

// ============================================================================
// CONFINED READ-ONLY SOURCE CODE EXPLORER (ANDROID STUDIO + FASTAPI + DOCS)
// ============================================================================

const ALLOWED_SOURCE_ROOTS = ['android', 'backend-fastapi', 'docs'];

function collectSourceFiles(baseDir: string, relativePrefix: string): Array<{ path: string; size: number; group: string }> {
  const results: Array<{ path: string; size: number; group: string }> = [];
  if (!fs.existsSync(baseDir)) return results;

  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(baseDir, entry.name);
    const rel = `${relativePrefix}/${entry.name}`;
    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(full, rel));
    } else if (entry.isFile()) {
      const stat = fs.statSync(full);
      results.push({ path: rel, size: stat.size, group: relativePrefix.split('/')[0] });
    }
  }
  return results;
}

app.get('/api/project/files', (_req, res) => {
  const files: Array<{ path: string; size: number; group: string }> = [];
  for (const root of ALLOWED_SOURCE_ROOTS) {
    const fullRoot = path.resolve(process.cwd(), root);
    files.push(...collectSourceFiles(fullRoot, root));
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  res.json({ files });
});

app.get('/api/project/file', (req: Request, res: Response) => {
  const relPath = typeof req.query.path === 'string' ? req.query.path : '';
  if (!relPath || relPath.includes('..') || path.isAbsolute(relPath)) {
    res.status(400).json({ error: 'Invalid source file path.' });
    return;
  }

  const topDir = relPath.split('/')[0];
  if (!ALLOWED_SOURCE_ROOTS.includes(topDir)) {
    res.status(403).json({ error: 'Access outside ZENTRIX source directories is forbidden.' });
    return;
  }

  const rootDir = path.resolve(process.cwd(), topDir);
  const resolved = path.resolve(process.cwd(), relPath);
  if (!resolved.startsWith(rootDir + path.sep) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    res.status(404).json({ error: 'Source file not found.' });
    return;
  }

  const content = fs.readFileSync(resolved, 'utf8');
  res.json({ path: relPath, content });
});

// ============================================================================
// VITE DEV MIDDLEWARE / PRODUCTION STATIC SERVING
// ============================================================================

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ZENTRIX Full-Stack Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ZENTRIX server:', err);
  process.exit(1);
});
