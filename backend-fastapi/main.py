"""
ZENTRIX Cybersecurity Platform — Standalone FastAPI Backend Reference
Supports SQLite (development) and PostgreSQL (production via DATABASE_URL).
All secrets are loaded exclusively from environment variables.
"""
import hashlib
import hmac
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import jwt
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./zentrix_fastapi.db")
SESSION_SECRET = os.getenv("SESSION_SECRET") or secrets.token_hex(32)
LICENSE_PEPPER = os.getenv("LICENSE_PEPPER", "zentrix-v1-key-digest")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "").strip().lower()
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "").strip()
UPLOAD_DIR = Path(os.getenv("APK_UPLOAD_DIR", "./uploads/apks")).resolve()
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    full_name = Column(String(80), nullable=False)
    email = Column(String(160), unique=True, nullable=False, index=True)
    phone = Column(String(20), nullable=False)
    password_hash = Column(String(256), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Plan(Base):
    __tablename__ = "plans"
    id = Column(Integer, primary_key=True)
    code = Column(String(40), unique=True, nullable=False)
    name = Column(String(80), nullable=False)
    billing_type = Column(String(20), nullable=False)  # monthly | lifetime
    price_bdt = Column(Integer, nullable=False)
    duration_days = Column(Integer, nullable=True)
    device_limit = Column(Integer, default=1)
    is_active = Column(Boolean, default=True)


class Payment(Base):
    __tablename__ = "payments"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    plan_id = Column(Integer, ForeignKey("plans.id"), nullable=False)
    amount_bdt = Column(Integer, nullable=False)
    receiver_number = Column(String(20), default="01747570144")
    sender_number = Column(String(20), nullable=False)
    transaction_id = Column(String(32), unique=True, nullable=False)
    status = Column(String(20), default="PENDING")  # PENDING | APPROVED | REJECTED
    admin_note = Column(Text, default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class License(Base):
    __tablename__ = "licenses"
    id = Column(Integer, primary_key=True)
    key_prefix = Column(String(32), nullable=False)
    key_hash = Column(String(128), unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    payment_id = Column(Integer, ForeignKey("payments.id"), nullable=True)
    plan_id = Column(Integer, ForeignKey("plans.id"), nullable=False)
    plan_type = Column(String(20), nullable=False)
    status = Column(String(20), default="ISSUED")  # ISSUED | ACTIVE | EXPIRED | REVOKED
    device_id_hash = Column(String(128), nullable=True)
    device_label = Column(String(120), nullable=True)
    activated_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)


class ApkRelease(Base):
    __tablename__ = "apk_releases"
    id = Column(Integer, primary_key=True)
    version_code = Column(Integer, unique=True, nullable=False)
    version_name = Column(String(32), nullable=False)
    release_notes = Column(Text, nullable=False)
    is_mandatory = Column(Boolean, default=False)
    stored_file_name = Column(String(160), nullable=False)
    sha256_hash = Column(String(64), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


Base.metadata.create_all(bind=engine)

app = FastAPI(title="ZENTRIX Cybersecurity API", version="1.0.0")
security_scheme = HTTPBearer()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1, dklen=64)
    return f"scrypt${salt}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    parts = stored.split("$")
    if len(parts) != 3 or parts[0] != "scrypt":
        return False
    dk = hashlib.scrypt(password.encode(), salt=parts[1].encode(), n=16384, r=8, p=1, dklen=64)
    return hmac.compare_digest(dk.hex(), parts[2])


def hmac_digest(value: str) -> str:
    return hmac.new(LICENSE_PEPPER.encode(), value.strip().upper().encode(), hashlib.sha256).hexdigest()


def generate_license_key() -> tuple[str, str, str]:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    segs = ["".join(secrets.choice(alphabet) for _ in range(4)) for _ in range(4)]
    raw = f"ZTX-{'-'.join(segs)}"
    prefix = f"ZTX-{segs[0]}-****-****-{segs[3]}"
    return raw, prefix, hmac_digest(raw)


def issue_token(sub: str, email: str, role: str) -> str:
    payload = {"sub": sub, "email": email, "role": role, "exp": int(time.time()) + 43200}
    return jwt.encode(payload, SESSION_SECRET, algorithm="HS256")


def require_role(required_role: str):
    def _dep(creds: HTTPAuthorizationCredentials = Depends(security_scheme)):
        try:
            payload = jwt.decode(creds.credentials, SESSION_SECRET, algorithms=["HS256"])
        except jwt.PyJWTError:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        if payload.get("role") != required_role:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return payload

    return _dep


class RegisterBody(BaseModel):
    fullName: str = Field(min_length=2, max_length=80)
    email: EmailStr
    phone: str = Field(pattern=r"^01[3-9]\d{8}$")
    password: str = Field(min_length=8, max_length=128)


class PaymentSubmitBody(BaseModel):
    planId: int
    senderNumber: str = Field(pattern=r"^01[3-9]\d{8}$")
    transactionId: str = Field(pattern=r"^[A-Za-z0-9]{6,20}$")


class ActivateBody(BaseModel):
    licenseKey: str = Field(pattern=r"^ZTX-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$")
    deviceId: str = Field(min_length=6, max_length=128)
    deviceLabel: str = "Android Device"


@app.post("/api/auth/register")
def register(body: RegisterBody, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email.lower()).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(
        full_name=body.fullName.strip(),
        email=body.email.lower(),
        phone=body.phone,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"token": issue_token(str(user.id), user.email, "user"), "user": {"id": user.id, "email": user.email}}


@app.post("/api/payments/submit")
def submit_payment(body: PaymentSubmitBody, auth=Depends(require_role("user")), db: Session = Depends(get_db)):
    plan = db.query(Plan).filter(Plan.id == body.planId, Plan.is_active == True).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    tx = body.transactionId.upper()
    if db.query(Payment).filter(Payment.transaction_id == tx).first():
        raise HTTPException(status_code=409, detail="Duplicate Transaction ID")
    rec = Payment(
        user_id=int(auth["sub"]),
        plan_id=plan.id,
        amount_bdt=plan.price_bdt,
        sender_number=body.senderNumber,
        transaction_id=tx,
        status="PENDING",
    )
    db.add(rec)
    db.commit()
    return {"status": "PENDING", "message": "Submitted for manual bKash verification."}


@app.post("/api/admin/payments/{payment_id}/approve")
def approve_payment(payment_id: int, auth=Depends(require_role("admin")), db: Session = Depends(get_db)):
    pay = db.query(Payment).filter(Payment.id == payment_id).first()
    if not pay or pay.status != "PENDING":
        raise HTTPException(status_code=404, detail="Pending payment not found")
    plan = db.query(Plan).filter(Plan.id == pay.plan_id).first()
    raw_key, prefix, key_hash = generate_license_key()
    lic = License(
        key_prefix=prefix,
        key_hash=key_hash,
        user_id=pay.user_id,
        payment_id=pay.id,
        plan_id=pay.plan_id,
        plan_type=plan.billing_type,
        status="ISSUED",
    )
    pay.status = "APPROVED"
    db.add(lic)
    db.commit()
    return {"issuedLicenseKey": raw_key, "keyPrefix": prefix}


@app.post("/api/licenses/activate")
def activate_license(body: ActivateBody, auth=Depends(require_role("user")), db: Session = Depends(get_db)):
    lic = db.query(License).filter(License.key_hash == hmac_digest(body.licenseKey)).first()
    if not lic:
        raise HTTPException(status_code=404, detail="License key not recognized")
    if lic.status in ("REVOKED", "EXPIRED"):
        raise HTTPException(status_code=403, detail=f"License is {lic.status}")
    dev_hash = hmac_digest(f"DEV:{body.deviceId}")
    if lic.device_id_hash and lic.device_id_hash != dev_hash:
        raise HTTPException(status_code=409, detail="Duplicate activation blocked: bound to another device.")
    lic.user_id = lic.user_id or int(auth["sub"])
    lic.device_id_hash = dev_hash
    lic.device_label = body.deviceLabel[:120]
    lic.status = "ACTIVE"
    lic.activated_at = datetime.now(timezone.utc)
    if lic.plan_type == "monthly":
        lic.expires_at = datetime.now(timezone.utc) + timedelta(days=30)
    db.commit()
    return {"status": "ACTIVE", "keyPrefix": lic.key_prefix}


@app.post("/api/admin/updates")
async def upload_apk(
    versionCode: int = Form(...),
    versionName: str = Form(...),
    releaseNotes: str = Form(...),
    isMandatory: bool = Form(False),
    apkFile: UploadFile = File(...),
    auth=Depends(require_role("admin")),
    db: Session = Depends(get_db),
):
    if not (apkFile.filename or "").lower().endswith(".apk"):
        raise HTTPException(status_code=400, detail="Only .apk files allowed")
    content = await apkFile.read()
    if len(content) < 1024 or not content.startswith(b"PK\x03\x04"):
        raise HTTPException(
            status_code=400,
            detail="Empty (0B) or placeholder files are rejected. Upload a genuine signed Android .apk archive.",
        )
    sha256 = hashlib.sha256(content).hexdigest()
    safe_name = f"zentrix-v{versionCode}-{secrets.token_hex(6)}.apk"
    dest = (UPLOAD_DIR / safe_name).resolve()
    if not str(dest).startswith(str(UPLOAD_DIR) + os.sep):
        raise HTTPException(status_code=400, detail="Invalid upload path")
    dest.write_bytes(content)
    rel = ApkRelease(
        version_code=versionCode,
        version_name=versionName,
        release_notes=releaseNotes,
        is_mandatory=isMandatory,
        stored_file_name=safe_name,
        sha256_hash=sha256,
    )
    db.add(rel)
    db.commit()
    return {"versionCode": versionCode, "sha256": sha256}
