package com.zentrix.security.domain

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.zentrix.security.BuildConfig
import com.zentrix.security.data.model.ApkReleaseMetadata
import com.zentrix.security.data.network.ZentrixApiService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.security.MessageDigest

/**
 * Downloads official ZENTRIX APK updates, verifies SHA-256 digest and APK signing certificate,
 * requests Android install permission when required, and launches the system installer UI.
 * Never performs silent installation.
 */
class ApkUpdater(
    private val context: Context,
    private val api: ZentrixApiService = ZentrixApiService.create()
) {
    fun canInstallPackages(): Boolean = context.packageManager.canRequestPackageInstalls()

    fun createInstallPermissionIntent(): Intent =
        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
            data = Uri.parse("package:${context.packageName}")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

    suspend fun downloadAndVerifyApk(release: ApkReleaseMetadata): Result<File> = withContext(Dispatchers.IO) {
        runCatching {
            val response = api.downloadApk(release.downloadUrl)
            if (!response.isSuccessful || response.body() == null) {
                error("Download failed with HTTP ${response.code()}")
            }

            val updateDir = File(context.cacheDir, "updates").apply { mkdirs() }
            val targetApk = File(updateDir, "zentrix-update-v${release.versionCode}.apk")

            val digest = MessageDigest.getInstance("SHA-256")
            response.body()!!.byteStream().use { input ->
                targetApk.outputStream().use { output ->
                    val buffer = ByteArray(8192)
                    var read = input.read(buffer)
                    while (read != -1) {
                        digest.update(buffer, 0, read)
                        output.write(buffer, 0, read)
                        read = input.read(buffer)
                    }
                }
            }

            val computedSha256 = digest.digest().joinToString("") { "%02x".format(it) }
            if (!computedSha256.equals(release.sha256Hash, ignoreCase = true)) {
                targetApk.delete()
                error("Integrity failure: Downloaded APK SHA-256 does not match server checksum.")
            }

            // Verify APK archive package name and signing certificate digest against installed app
            verifyApkSignature(targetApk, release.signingCertSha256)
            targetApk
        }
    }

    private fun verifyApkSignature(apkFile: File, expectedCertFromServer: String?) {
        val pm = context.packageManager
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            PackageManager.GET_SIGNING_CERTIFICATES
        } else {
            @Suppress("DEPRECATION")
            PackageManager.GET_SIGNATURES
        }

        val archiveInfo = pm.getPackageArchiveInfo(apkFile.absolutePath, flags)
            ?: throw SecurityException("Downloaded file is not a valid signed Android APK.")

        if (archiveInfo.packageName != context.packageName) {
            apkFile.delete()
            throw SecurityException("Package ID mismatch: expected ${context.packageName}, got ${archiveInfo.packageName}")
        }

        val certBytes: ByteArray? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            archiveInfo.signingInfo?.apkContentsSigners?.firstOrNull()?.toByteArray()
        } else {
            @Suppress("DEPRECATION")
            archiveInfo.signatures?.firstOrNull()?.toByteArray()
        }

        if (certBytes == null) {
            apkFile.delete()
            throw SecurityException("APK signing certificate could not be read.")
        }

        val apkCertSha256 = MessageDigest.getInstance("SHA-256")
            .digest(certBytes)
            .joinToString("") { "%02x".format(it) }

        val pinned = BuildConfig.EXPECTED_SIGNING_CERT_SHA256.ifBlank { expectedCertFromServer.orEmpty() }
        if (pinned.isNotBlank() && !apkCertSha256.equals(pinned.replace(":", ""), ignoreCase = true)) {
            apkFile.delete()
            throw SecurityException("Signing certificate mismatch: refusing untrusted APK update.")
        }
    }

    fun launchSystemInstaller(apkFile: File) {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", apkFile)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }
}
