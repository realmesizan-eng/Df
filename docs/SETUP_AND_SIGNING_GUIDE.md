# ZENTRIX — Setup, Deployment, APK Signing & External Credentials Guide

## 1. Architecture Overview
ZENTRIX is delivered as an integrated monorepo containing:
- `/android/` — Complete Android Studio project (Kotlin, Jetpack Compose, Material 3, minSdk 26 / Android 8.0+).
- `/server.ts` + `/server/` — Live Node.js + Express + SQLite REST API powering both the Android app and the Web Owner Admin Console.
- `/backend-fastapi/` — Optional standalone Python FastAPI + SQLAlchemy backend supporting SQLite (development) and PostgreSQL (production).
- `/src/` — Web Owner Admin Dashboard, Live Interactive Android Client (connected to real APIs), and Source Code Explorer.

## 2. Database Setup Instructions
### Option A: Built-in SQLite (Active by Default)
1. Node.js 22+ built-in `node:sqlite` automatically creates `./data/zentrix.db` (WAL mode + foreign keys enabled) on first server boot.
2. Default subscription plans are seeded automatically:
   - Monthly Protection (`BDT 50`, 30 days, configurable by Admin).
   - Lifetime License (`BDT 200`, 1 Android device).
3. Override the file path via `ZENTRIX_DB_PATH=/var/lib/zentrix/zentrix.db`.

### Option B: PostgreSQL with FastAPI Backend
1. Provision PostgreSQL 15+ and create database `zentrix`.
2. Set environment variables:
   ```bash
   export DATABASE_URL="postgresql://zentrix_user:STRONG_PASSWORD@host:5432/zentrix"
   export SESSION_SECRET="$(openssl rand -hex 32)"
   export LICENSE_PEPPER="$(openssl rand -hex 32)"
   export ADMIN_EMAIL="owner@yourdomain.com"
   export ADMIN_PASSWORD="STRONG_OWNER_PASSWORD"
   ```
3. Install dependencies and start FastAPI behind HTTPS (Nginx/Caddy/Cloud Run):
   ```bash
   cd backend-fastapi
   pip install -r requirements.txt
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```

## 3. Owner Admin Panel Setup
- **First-Run Mode (Development / Preview):** When `ADMIN_PASSWORD` is unset in `.env`, open the Owner Admin tab and complete the one-time **Claim Owner Admin Account** form. Credentials are hashed with `scrypt` and stored in SQLite; the bootstrap route locks permanently once claimed.
- **Production Mode:** Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in server secrets / environment variables. Environment credentials always override any first-run fallback record.
- Never hardcode admin passwords or signing keys in the Android APK.

## 4. Android Studio Build & APK Signing Instructions
1. Open `/android` in Android Studio Ladybug (2024.2+) with JDK 17 and Android SDK 35 installed.
2. Create `android/local.properties` (never commit to git):
   ```properties
   ZENTRIX_API_BASE_URL=https://your-production-domain.com/
   ZENTRIX_SIGNING_CERT_SHA256=<YOUR_RELEASE_KEYSTORE_CERT_SHA256>
   ```
3. Generate a release keystore (store safely offline):
   ```bash
   keytool -genkey -v -keystore zentrix-release.jks -keyalg RSA -keysize 4096 -validity 10000 -alias zentrix
   ```
4. Extract your release certificate SHA-256 fingerprint for `ApkUpdater.kt` pinning:
   ```bash
   keytool -list -v -keystore zentrix-release.jks -alias zentrix | grep SHA256
   ```
5. Build signed release APK:
   ```bash
   cd android
   ./gradlew assembleRelease
   ```
6. Upload the signed `app-release.apk` in the ZENTRIX Web Admin Console -> **APK Update Center**. The server calculates and stores the SHA-256 file hash automatically.

## 5. Features Requiring External Credentials or Merchant Approval
To avoid misleading claims, note the following external requirements:
1. **External Malware / URL Threat Intelligence Feed:** Local heuristic & bKash/Nagad lookalike domain analysis works immediately. For cloud threat feeds (Google Safe Browsing v4 / VirusTotal / Play Integrity), configure `SAFE_BROWSING_API_KEY` on the backend.
2. **Automated bKash Merchant Gateway (Optional Future Upgrade):** Current payments use **Manual bKash Send Money to `01747570144`** with manual Admin TrxID verification. Automated instant bKash Checkout requires an approved bKash PGW Merchant Agreement and official merchant credentials.
3. **Google Play Store Distribution:** Direct APK distribution supports `QUERY_ALL_PACKAGES` and `REQUEST_INSTALL_PACKAGES`. If publishing on Google Play, submit Google Play's Sensitive Permissions Declaration (or remove `REQUEST_INSTALL_PACKAGES` and distribute updates through Play Core In-App Updates).
4. **SMS Auto-Reading:** Intentionally omitted (`READ_SMS` is NOT requested) to comply with Android/Google Play privacy rules; ZENTRIX provides an offline paste-to-inspect SMS scam checker instead.
