package com.zentrix.security.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.zentrix.security.domain.AppRiskReport
import com.zentrix.security.domain.SecurityAnalyzer
import com.zentrix.security.ui.theme.*

@Composable
fun ScannerScreen(analyzer: SecurityAnalyzer, onBack: () -> Unit) {
    val context = LocalContext.current
    var reports by remember { mutableStateOf<List<AppRiskReport>>(emptyList()) }
    var scanned by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ZentrixBlack)
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("App & Permission Scanner", style = MaterialTheme.typography.titleLarge, color = ZentrixSilver)
            TextButton(onClick = onBack) { Text("Back", color = ZentrixSilver) }
        }

        Text(
            "Inspects visible user-installed apps via Android PackageManager for sideloading, risky permission pairs, and bKash/Nagad package spoofing. Does not claim 100% malware detection.",
            color = ZentrixSilverMuted,
            style = MaterialTheme.typography.bodyMedium
        )

        Button(
            onClick = {
                reports = analyzer.scanInstalledUserApps()
                scanned = true
            },
            modifier = Modifier.fillMaxWidth().height(48.dp),
            colors = ButtonDefaults.buttonColors(containerColor = ZentrixNeonGreen, contentColor = ZentrixBlack)
        ) {
            Text(if (scanned) "Rescan Installed Apps" else "Run Package & Permission Audit")
        }

        if (scanned) {
            Text(
                "Audited ${reports.size} user-installed packages · ${reports.count { it.severity == "HIGH" }} high-risk",
                color = ZentrixSilver,
                style = MaterialTheme.typography.labelMedium
            )
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(reports, key = { it.packageName }) { item ->
                    Card(
                        colors = CardDefaults.cardColors(containerColor = ZentrixSurface),
                        border = BorderStroke(1.dp, ZentrixBorder),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("${item.appName} [${item.severity}]", color = ZentrixSilver, fontWeight = FontWeight.SemiBold)
                            Text(item.packageName, color = ZentrixSilverMuted, style = MaterialTheme.typography.labelMedium)
                            Text(
                                "Installer: ${item.installerPackage ?: "Unknown / Sideloaded"}",
                                color = if (item.isSideloaded) ZentrixWarning else ZentrixSilverMuted,
                                style = MaterialTheme.typography.bodyMedium
                            )
                            if (item.riskyPermissions.isNotEmpty()) {
                                Text(
                                    "Sensitive permissions: ${item.riskyPermissions.joinToString(", ")}",
                                    color = ZentrixSilverMuted,
                                    style = MaterialTheme.typography.bodyMedium
                                )
                            }
                            item.riskReasons.forEach { reason ->
                                Text("• $reason", color = ZentrixDanger, style = MaterialTheme.typography.bodyMedium)
                            }
                            if (item.severity != "LOW") {
                                OutlinedButton(
                                    onClick = { context.startActivity(analyzer.createSafeUninstallIntent(item.packageName)) },
                                    border = BorderStroke(1.dp, ZentrixDanger)
                                ) {
                                    Text("Open Android Uninstall Dialog", color = ZentrixDanger)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
