package com.zentrix.security.data.repository

import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import android.provider.Settings
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.zentrix.security.BuildConfig
import com.zentrix.security.data.model.*
import com.zentrix.security.data.network.ZentrixApiService
import java.security.MessageDigest

class ZentrixRepository(
    private val context: Context,
    private val api: ZentrixApiService = ZentrixApiService.create()
) {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs = EncryptedSharedPreferences.create(
        context,
        "zentrix_secure_prefs",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    fun getSavedToken(): String? = prefs.getString("auth_token", null)
    fun getSavedEmail(): String? = prefs.getString("user_email", null)
    fun getSavedName(): String? = prefs.getString("user_name", null)

    fun saveSession(token: String, user: AuthUser) {
        prefs.edit()
            .putString("auth_token", token)
            .putString("user_email", user.email)
            .putString("user_name", user.fullName)
            .apply()
    }

    fun clearSession() {
        prefs.edit()
            .remove("auth_token")
            .remove("user_email")
            .remove("user_name")
            .apply()
    }

    /**
     * Generates a stable, privacy-preserving SHA-256 device identifier derived from ANDROID_ID
     * and app package namespace. Preserves license binding across APK updates without collecting IMEI.
     */
    @SuppressLint("HardwareIds")
    fun getDeviceIdentifier(): String {
        val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: "unknown"
        val raw = "${context.packageName}:$androidId:${Build.MANUFACTURER}:${Build.MODEL}"
        val digest = MessageDigest.getInstance("SHA-256").digest(raw.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }.take(32)
    }

    fun getDeviceLabel(): String = "${Build.MANUFACTURER} ${Build.MODEL} (Android ${Build.VERSION.RELEASE})"

    private fun bearerHeader(): String = "Bearer ${getSavedToken().orEmpty()}"

    suspend fun register(fullName: String, email: String, phone: String, password: String): Result<AuthResponse> =
        runCatching {
            val resp = api.register(RegisterRequest(fullName, email, phone, password))
            if (!resp.isSuccessful || resp.body() == null) {
                error("Registration failed (${resp.code()}): ${resp.errorBody()?.string().orEmpty()}")
            }
            val body = resp.body()!!
            saveSession(body.token, body.user)
            body
        }

    suspend fun login(email: String, password: String): Result<AuthResponse> =
        runCatching {
            val resp = api.login(LoginRequest(email, password))
            if (!resp.isSuccessful || resp.body() == null) {
                error("Sign in failed (${resp.code()}): Check email and password.")
            }
            val body = resp.body()!!
            saveSession(body.token, body.user)
            body
        }

    suspend fun fetchPlans(): Result<PlansResponse> = runCatching {
        val resp = api.getPlans()
        resp.body() ?: error("Unable to load plans (${resp.code()})")
    }

    suspend fun submitManualPayment(
        planId: Int,
        senderNumber: String,
        transactionId: String,
        note: String
    ): Result<PaymentSubmitResponse> = runCatching {
        val resp = api.submitPayment(
            bearerHeader(),
            PaymentSubmitRequest(planId, senderNumber, transactionId, note)
        )
        if (!resp.isSuccessful || resp.body() == null) {
            error("Payment submission rejected (${resp.code()}): ${resp.errorBody()?.string().orEmpty()}")
        }
        resp.body()!!
    }

    suspend fun fetchMyPayments(): Result<List<PaymentRecord>> = runCatching {
        val resp = api.getMyPayments(bearerHeader())
        resp.body()?.payments ?: emptyList()
    }

    suspend fun activateLicense(licenseKey: String): Result<LicenseActivateResponse> = runCatching {
        val resp = api.activateLicense(
            bearerHeader(),
            LicenseActivateRequest(licenseKey, getDeviceIdentifier(), getDeviceLabel())
        )
        if (!resp.isSuccessful || resp.body() == null) {
            error("Activation failed (${resp.code()}): ${resp.errorBody()?.string().orEmpty()}")
        }
        resp.body()!!
    }

    suspend fun validateCurrentDeviceLicense(): Result<LicenseValidateResponse> = runCatching {
        val resp = api.validateLicense(bearerHeader(), LicenseValidateRequest(getDeviceIdentifier()))
        resp.body() ?: error("License validation unavailable")
    }

    suspend fun fetchLicenseStatus(): Result<List<LicenseDetail>> = runCatching {
        val resp = api.getLicenseStatus(bearerHeader())
        resp.body()?.licenses ?: emptyList()
    }

    suspend fun checkPhishingUrl(url: String): Result<UrlCheckResponse> = runCatching {
        val resp = api.checkUrl(UrlCheckRequest(url))
        if (!resp.isSuccessful || resp.body() == null) {
            error("URL analysis error (${resp.code()})")
        }
        resp.body()!!
    }

    suspend fun checkAppUpdate(): Result<LatestUpdateResponse> = runCatching {
        val resp = api.checkUpdates(BuildConfig.VERSION_CODE)
        resp.body() ?: error("Update server unavailable")
    }

    suspend fun fetchSupportInfo(): Result<SupportInfoResponse> = runCatching {
        val resp = api.getSupportInfo()
        resp.body() ?: error("Support info unavailable")
    }
}
