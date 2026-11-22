package com.zentrix.security.data.model

import com.google.gson.annotations.SerializedName

data class RegisterRequest(
    val fullName: String,
    val email: String,
    val phone: String,
    val password: String
)

data class LoginRequest(
    val email: String,
    val password: String
)

data class AuthUser(
    val id: Int,
    val fullName: String,
    val email: String,
    val phone: String
)

data class AuthResponse(
    val token: String,
    val user: AuthUser
)

data class SubscriptionPlan(
    val id: Int,
    val code: String,
    val name: String,
    @SerializedName("billing_type") val billingType: String,
    @SerializedName("price_bdt") val priceBdt: Int,
    @SerializedName("duration_days") val durationDays: Int?,
    @SerializedName("device_limit") val deviceLimit: Int,
    val description: String
)

data class PlansResponse(
    val paymentNumber: String,
    val paymentMethod: String,
    val plans: List<SubscriptionPlan>
)

data class PaymentSubmitRequest(
    val planId: Int,
    val senderNumber: String,
    val transactionId: String,
    val customerNote: String = ""
)

data class PaymentSubmitResponse(
    val message: String
)

data class PaymentRecord(
    val id: Int,
    @SerializedName("amount_bdt") val amountBdt: Int,
    @SerializedName("receiver_number") val receiverNumber: String,
    @SerializedName("sender_number") val senderNumber: String,
    @SerializedName("transaction_id") val transactionId: String,
    val status: String,
    @SerializedName("admin_note") val adminNote: String?,
    @SerializedName("plan_name") val planName: String,
    @SerializedName("issued_license_prefix") val issuedLicensePrefix: String?,
    @SerializedName("created_at") val createdAt: String
)

data class MyPaymentsResponse(
    val payments: List<PaymentRecord>
)

data class LicenseActivateRequest(
    val licenseKey: String,
    val deviceId: String,
    val deviceLabel: String
)

data class LicenseDetail(
    val id: Int,
    @SerializedName("key_prefix") val keyPrefix: String?,
    @SerializedName("plan_name") val planName: String?,
    @SerializedName("plan_type") val planType: String?,
    val status: String,
    @SerializedName("device_label") val deviceLabel: String?,
    @SerializedName("activated_at") val activatedAt: String?,
    @SerializedName("expires_at") val expiresAt: String?
)

data class LicenseActivateResponse(
    val status: String,
    val message: String,
    val license: LicenseDetail?
)

data class LicenseValidateRequest(
    val deviceId: String
)

data class LicenseValidateResponse(
    val valid: Boolean,
    val status: String,
    val license: LicenseDetail?
)

data class LicenseStatusResponse(
    val licenses: List<LicenseDetail>
)

data class UrlCheckRequest(val url: String)

data class UrlFinding(
    val code: String,
    val severity: String,
    val title: String,
    val detail: String
)

data class UrlCheckResponse(
    val normalizedUrl: String,
    val hostname: String,
    val riskLevel: String,
    val score: Int,
    val findings: List<UrlFinding>,
    val threatIntelSource: String,
    val limitationsNotice: String
)

data class ApkReleaseMetadata(
    val id: Int,
    @SerializedName("version_code") val versionCode: Int,
    @SerializedName("version_name") val versionName: String,
    @SerializedName("release_notes") val releaseNotes: String,
    @SerializedName("is_mandatory") val isMandatory: Boolean,
    @SerializedName("file_name") val fileName: String,
    @SerializedName("file_size_bytes") val fileSizeBytes: Long,
    @SerializedName("sha256_hash") val sha256Hash: String,
    @SerializedName("signing_cert_sha256") val signingCertSha256: String?,
    val downloadUrl: String
)

data class LatestUpdateResponse(
    val updateAvailable: Boolean,
    val mandatoryUpdate: Boolean,
    val latest: ApkReleaseMetadata?
)

data class SupportHelpTopic(
    val id: String,
    val title: String,
    val steps: List<String>
)

data class SupportFaq(
    val q: String,
    val a: String
)

data class SupportInfoResponse(
    val appName: String,
    val tagline: String,
    val supportNumber: String,
    val whatsappUrl: String,
    val paymentMethod: String,
    val bkashReceiverNumber: String,
    val affiliationDisclaimer: String,
    val securityDisclosure: String,
    val helpTopics: List<SupportHelpTopic>,
    val faqs: List<SupportFaq>
)
