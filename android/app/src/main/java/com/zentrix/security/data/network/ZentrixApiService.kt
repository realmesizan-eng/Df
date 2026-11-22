package com.zentrix.security.data.network

import com.zentrix.security.BuildConfig
import com.zentrix.security.data.model.*
import okhttp3.OkHttpClient
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.*
import java.util.concurrent.TimeUnit

interface ZentrixApiService {

    @POST("api/auth/register")
    suspend fun register(@Body request: RegisterRequest): Response<AuthResponse>

    @POST("api/auth/login")
    suspend fun login(@Body request: LoginRequest): Response<AuthResponse>

    @GET("api/plans")
    suspend fun getPlans(): Response<PlansResponse>

    @POST("api/payments/submit")
    suspend fun submitPayment(
        @Header("Authorization") bearer: String,
        @Body request: PaymentSubmitRequest
    ): Response<PaymentSubmitResponse>

    @GET("api/payments/my")
    suspend fun getMyPayments(
        @Header("Authorization") bearer: String
    ): Response<MyPaymentsResponse>

    @POST("api/licenses/activate")
    suspend fun activateLicense(
        @Header("Authorization") bearer: String,
        @Body request: LicenseActivateRequest
    ): Response<LicenseActivateResponse>

    @POST("api/licenses/validate")
    suspend fun validateLicense(
        @Header("Authorization") bearer: String,
        @Body request: LicenseValidateRequest
    ): Response<LicenseValidateResponse>

    @GET("api/licenses/status")
    suspend fun getLicenseStatus(
        @Header("Authorization") bearer: String
    ): Response<LicenseStatusResponse>

    @POST("api/security/check-url")
    suspend fun checkUrl(@Body request: UrlCheckRequest): Response<UrlCheckResponse>

    @GET("api/updates/latest")
    suspend fun checkUpdates(
        @Query("currentVersionCode") currentVersionCode: Int
    ): Response<LatestUpdateResponse>

    @Streaming
    @GET
    suspend fun downloadApk(@Url fullOrRelativeUrl: String): Response<ResponseBody>

    @GET("api/support/info")
    suspend fun getSupportInfo(): Response<SupportInfoResponse>

    companion object {
        fun create(): ZentrixApiService {
            val client = OkHttpClient.Builder()
                .connectTimeout(20, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .build()

            return Retrofit.Builder()
                .baseUrl(BuildConfig.ZENTRIX_API_BASE_URL)
                .client(client)
                .addConverterFactory(GsonConverterFactory.create())
                .build()
                .create(ZentrixApiService::class.java)
        }
    }
}
