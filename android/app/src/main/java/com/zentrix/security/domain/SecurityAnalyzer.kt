package com.zentrix.security.domain

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build

data class AppRiskReport(
    val appName: String,
    val packageName: String,
    val installerPackage: String?,
    val isSideloaded: Boolean,
    val riskyPermissions: List<String>,
    val riskReasons: List<String>,
    val severity: String // HIGH, MEDIUM, LOW
)

data class BankingAppAudit(
    val brandName: String,
    val officialPackage: String,
    val officialInstalled: Boolean,
    val officialInstallerTrusted: Boolean,
    val suspiciousLookalikePackages: List<String>
)

data class PrivacySummary(
    val totalUserAppsAudited: Int,
    val cameraApps: Int,
    val microphoneApps: Int,
    val locationApps: Int,
    val smsOrCallLogApps: Int,
    val overlayOrAccessibilityApps: Int,
    val highRiskApps: List<AppRiskReport>
)

/**
 * Inspects installed applications strictly within Android package visibility boundaries.
 * Never reads private app data, banking balances, PINs, OTPs, or SMS content.
 */
class SecurityAnalyzer(private val context: Context) {

    private val trustedInstallers = setOf(
        "com.android.vending", // Google Play Store
        "com.sec.android.app.samsungapps" // Samsung Galaxy Store
    )

    private val sensitivePermissions = setOf(
        Manifest.permission.READ_SMS,
        Manifest.permission.RECEIVE_SMS,
        Manifest.permission.SEND_SMS,
        Manifest.permission.CAMERA,
        Manifest.permission.RECORD_AUDIO,
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.SYSTEM_ALERT_WINDOW,
        Manifest.permission.REQUEST_INSTALL_PACKAGES,
        Manifest.permission.READ_CONTACTS
    )

    fun scanInstalledUserApps(): List<AppRiskReport> {
        val pm = context.packageManager
        val packages: List<PackageInfo> = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pm.getInstalledPackages(PackageManager.PackageInfoFlags.of(PackageManager.GET_PERMISSIONS.toLong()))
        } else {
            @Suppress("DEPRECATION")
            pm.getInstalledPackages(PackageManager.GET_PERMISSIONS)
        }

        val reports = mutableListOf<AppRiskReport>()
        for (pkg in packages) {
            val appInfo = pkg.applicationInfo ?: continue
            // Focus on non-system / user-installed applications
            if ((appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0) continue
            if (pkg.packageName == context.packageName) continue

            val appName = pm.getApplicationLabel(appInfo).toString()
            val installer = getInstallerPackage(pm, pkg.packageName)
            val sideloaded = installer == null || installer !in trustedInstallers
            val requested = pkg.requestedPermissions?.toSet() ?: emptySet()
            val riskyFound = requested.filter { it in sensitivePermissions }
            val reasons = mutableListOf<String>()

            // Risky permission combinations commonly exploited by Android banking trojans
            val hasSms = Manifest.permission.READ_SMS in requested || Manifest.permission.RECEIVE_SMS in requested
            val hasOverlay = Manifest.permission.SYSTEM_ALERT_WINDOW in requested
            val hasInstall = Manifest.permission.REQUEST_INSTALL_PACKAGES in requested

            if (hasSms && hasOverlay) {
                reasons.add("Requests both SMS access and Screen Overlay (high-risk phishing/OTP theft combination).")
            }
            if (sideloaded && hasInstall) {
                reasons.add("Installed outside Play Store and requests permission to install additional APKs.")
            }
            if (sideloaded && hasSms) {
                reasons.add("Sideloaded app requesting SMS read/receive permissions.")
            }
            if (Manifest.permission.CAMERA in requested && Manifest.permission.RECORD_AUDIO in requested && sideloaded) {
                reasons.add("Sideloaded app requests both Camera and Microphone permissions.")
            }

            // Detect fake bKash or Nagad clones by label/package mismatch
            val lowerLabel = appName.lowercase()
            val lowerPkg = pkg.packageName.lowercase()
            if ((lowerLabel.contains("bkash") || lowerPkg.contains("bkash")) && pkg.packageName != "com.bKash.customerapp") {
                reasons.add("Impersonation alert: App resembles bKash but does NOT match official package com.bKash.customerapp.")
            }
            if ((lowerLabel.contains("nagad") || lowerPkg.contains("nagad")) && pkg.packageName != "com.konasl.nagad") {
                reasons.add("Impersonation alert: App resembles Nagad but does NOT match official package com.konasl.nagad.")
            }

            val severity = when {
                reasons.any { it.startsWith("Impersonation") || it.contains("Screen Overlay") } -> "HIGH"
                reasons.isNotEmpty() || riskyFound.size >= 4 -> "MEDIUM"
                else -> "LOW"
            }

            reports.add(
                AppRiskReport(
                    appName = appName,
                    packageName = pkg.packageName,
                    installerPackage = installer,
                    isSideloaded = sideloaded,
                    riskyPermissions = riskyFound.map { it.substringAfterLast('.') },
                    riskReasons = reasons,
                    severity = severity
                )
            )
        }

        return reports.sortedBy {
            when (it.severity) {
                "HIGH" -> 0
                "MEDIUM" -> 1
                else -> 2
            }
        }
    }

    fun auditMobileBankingApps(): List<BankingAppAudit> {
        val reports = scanInstalledUserApps()
        val pm = context.packageManager

        fun buildAudit(brand: String, officialPkg: String, keyword: String): BankingAppAudit {
            val installed = try {
                pm.getPackageInfo(officialPkg, 0)
                true
            } catch (_: PackageManager.NameNotFoundException) {
                false
            }
            val installer = if (installed) getInstallerPackage(pm, officialPkg) else null
            val trusted = installer in trustedInstallers
            val clones = reports
                .filter {
                    (it.appName.lowercase().contains(keyword) || it.packageName.lowercase().contains(keyword)) &&
                        it.packageName != officialPkg
                }
                .map { "${it.appName} (${it.packageName})" }

            return BankingAppAudit(
                brandName = brand,
                officialPackage = officialPkg,
                officialInstalled = installed,
                officialInstallerTrusted = trusted,
                suspiciousLookalikePackages = clones
            )
        }

        return listOf(
            buildAudit("bKash", "com.bKash.customerapp", "bkash"),
            buildAudit("Nagad", "com.konasl.nagad", "nagad")
        )
    }

    fun buildPrivacySummary(): PrivacySummary {
        val reports = scanInstalledUserApps()
        return PrivacySummary(
            totalUserAppsAudited = reports.size,
            cameraApps = reports.count { "CAMERA" in it.riskyPermissions },
            microphoneApps = reports.count { "RECORD_AUDIO" in it.riskyPermissions },
            locationApps = reports.count { "ACCESS_FINE_LOCATION" in it.riskyPermissions },
            smsOrCallLogApps = reports.count { "READ_SMS" in it.riskyPermissions || "RECEIVE_SMS" in it.riskyPermissions },
            overlayOrAccessibilityApps = reports.count { "SYSTEM_ALERT_WINDOW" in it.riskyPermissions },
            highRiskApps = reports.filter { it.severity == "HIGH" }
        )
    }

    /** Launches standard Android system uninstall confirmation dialog. Never silently uninstalls. */
    fun createSafeUninstallIntent(packageName: String): Intent =
        Intent(Intent.ACTION_DELETE).apply {
            data = Uri.parse("package:$packageName")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

    private fun getInstallerPackage(pm: PackageManager, packageName: String): String? {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                pm.getInstallSourceInfo(packageName).installingPackageName
            } else {
                @Suppress("DEPRECATION")
                pm.getInstallerPackageName(packageName)
            }
        } catch (_: Exception) {
            null
        }
    }
}
