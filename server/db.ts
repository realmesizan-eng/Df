import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads', 'apks');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const dbPath = process.env.ZENTRIX_DB_PATH
  ? path.resolve(process.env.ZENTRIX_DB_PATH)
  : path.join(DATA_DIR, 'zentrix.db');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
export const APK_UPLOAD_DIR = UPLOADS_DIR;

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    phone TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS admin_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    billing_type TEXT NOT NULL CHECK (billing_type IN ('monthly', 'lifetime')),
    price_bdt INTEGER NOT NULL CHECK (price_bdt >= 0),
    duration_days INTEGER,
    device_limit INTEGER NOT NULL DEFAULT 1,
    description TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    plan_id INTEGER NOT NULL REFERENCES plans(id),
    amount_bdt INTEGER NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'bKash Manual Send Money',
    receiver_number TEXT NOT NULL DEFAULT '01747570144',
    sender_number TEXT NOT NULL,
    transaction_id TEXT NOT NULL UNIQUE,
    customer_note TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    admin_note TEXT DEFAULT '',
    reviewed_by TEXT DEFAULT '',
    reviewed_at TEXT,
    issued_license_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    user_id INTEGER REFERENCES users(id),
    payment_id INTEGER REFERENCES payments(id),
    plan_id INTEGER NOT NULL REFERENCES plans(id),
    plan_type TEXT NOT NULL CHECK (plan_type IN ('monthly', 'lifetime')),
    status TEXT NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED', 'ACTIVE', 'EXPIRED', 'REVOKED')),
    device_id_hash TEXT,
    device_label TEXT,
    activated_at TEXT,
    expires_at TEXT,
    revoked_reason TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS apk_releases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_code INTEGER NOT NULL UNIQUE,
    version_name TEXT NOT NULL,
    release_notes TEXT NOT NULL,
    is_mandatory INTEGER NOT NULL DEFAULT 0,
    file_name TEXT NOT NULL,
    stored_file_name TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    sha256_hash TEXT NOT NULL,
    signing_cert_sha256 TEXT NOT NULL DEFAULT '',
    uploaded_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'INFO' CHECK (severity IN ('INFO', 'SECURITY', 'UPDATE')),
    published_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT DEFAULT '',
    details TEXT DEFAULT '',
    ip_address TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Seed default subscription plans (Monthly configurable + Lifetime BDT 200) if missing
const existingPlans = db.prepare('SELECT COUNT(*) as count FROM plans').get() as { count: number };
if (existingPlans.count === 0) {
  const insertPlan = db.prepare(`
    INSERT INTO plans (code, name, billing_type, price_bdt, duration_days, device_limit, description, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);

  insertPlan.run(
    'MONTHLY_GUARD',
    'ZENTRIX Monthly Protection',
    'monthly',
    50,
    30,
    1,
    '30-day renewable Android security license for 1 device. Price configurable by administrator.'
  );

  insertPlan.run(
    'LIFETIME_GUARD',
    'ZENTRIX Lifetime License',
    'lifetime',
    200,
    null,
    1,
    'One-time BDT 200 manual bKash payment. Permanent activation bound to 1 Android device.'
  );
}

// Seed initial security notice if empty
const existingAnnouncements = db.prepare('SELECT COUNT(*) as count FROM announcements').get() as { count: number };
if (existingAnnouncements.count === 0) {
  db.prepare(`
    INSERT INTO announcements (title, body, severity, published_by)
    VALUES (?, ?, ?, ?)
  `).run(
    'Official bKash Payment Verification Policy',
    'ZENTRIX accepts manual bKash Send Money only to 01747570144. Never share your bKash PIN or OTP with anyone. Licenses are issued strictly after manual Transaction ID verification.',
    'SECURITY',
    'system'
  );
}

export function writeAuditLog(
  actorType: 'user' | 'admin' | 'system' | 'anonymous',
  actorId: string,
  action: string,
  target: string,
  details: string,
  ipAddress: string
): void {
  db.prepare(`
    INSERT INTO audit_logs (actor_type, actor_id, action, target, details, ip_address)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(actorType, actorId, action, target, details, ipAddress);
}
