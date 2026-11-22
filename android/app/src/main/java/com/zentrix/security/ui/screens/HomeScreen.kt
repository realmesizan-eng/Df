package com.zentrix.security.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.zentrix.security.ZentrixRoutes
import com.zentrix.security.data.repository.ZentrixRepository
import com.zentrix.security.domain.SecurityAnalyzer
import com.zentrix.security.ui.theme.*

@Composable
fun HomeScreen(
    repository: ZentrixRepository,
    analyzer: SecurityAnalyzer,
    onNavigate: (String) -> Unit,
    onOpenWhatsApp: () -> Unit
) {
    var licenseStatus by remember { mutableStateOf("Checking license...") }
    var auditedCount by remember { mutableIntStateOf(0) }
    var highRiskCount by remember { mutableIntStateOf(0) }

    LaunchedEffect(Unit) {
        val summary = analyzer.buildPrivacySummary()
        auditedCount = summary.totalUserAppsAudited
        highRiskCount = summary.highRiskApps.size

        repository.validateCurrentDeviceLicense()
            .onSuccess { resp ->
                licenseStatus = if (resp.valid) {
                    "Active (${resp.license?.planType?.uppercase() ?: "VERIFIED"})"
                } else {
                    "Unlicensed — Activate or subscribe"
                }
            }
            .onFailure {
                licenseStatus = "Offline — Connect to validate license"
            }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ZentrixBlack)
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column {
                Text("ZENTRIX", style = MaterialTheme.typography.headlineLarge, color = ZentrixSilver)
                Text("Your Digital World. Our Protection.", color = ZentrixNeonGreen, style = MaterialTheme.typography.bodyMedium)
            }
            TextButton(onClick = { onNavigate(ZentrixRoutes.SETTINGS) }) {
                Text("Settings", color = ZentrixSilver)
            }
        }

        Card(
            colors = CardDefaults.cardColors(containerColor = ZentrixSurface),
            border = BorderStroke(1.dp, ZentrixBorder),
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Device Protection Summary", color = ZentrixSilver, fontWeight = FontWeight.SemiBold)
                Text("License: $licenseStatus", color = ZentrixNeonGreen, style = MaterialTheme.typography.bodyMedium)
                Text(
                    "User apps inspected: $auditedCount · High-risk findings: $highRiskCount",
                    color = ZentrixSilverMuted,
                    style = MaterialTheme.typography.bodyMedium
                )
            }
        }

        DashboardActionTile("App & Permission Scanner", "Inspect installed packages, sideloaded APKs, and risky permission pairs") {
            onNavigate(ZentrixRoutes.SCANNER)
        }
        DashboardActionTile("Mobile Banking Protection", "bKash & Nagad fake-app checks, PIN/OTP safety, and verification guide") {
            onNavigate(ZentrixRoutes.BANKING)
        }
        DashboardActionTile("Phishing Link Checker", "Analyze suspicious URLs and lookalike financial domains") {
            onNavigate(ZentrixRoutes.PHISHING)
        }
        DashboardActionTile("Privacy, SMS Safety & Report", "Camera, microphone, location audit and SMS scam guidance") {
            onNavigate(ZentrixRoutes.SECURITY)
        }
        DashboardActionTile("Subscription & bKash Payment", "Monthly and BDT 200 Lifetime plans via manual bKash verification") {
            onNavigate(ZentrixRoutes.SUBSCRIPTION)
        }
        DashboardActionTile("License Activation", "Bind your verified ZTX license key to this Android device") {
            onNavigate(ZentrixRoutes.LICENSE)
        }
        DashboardActionTile("Update Center", "Check official server for SHA-256 verified APK updates") {
            onNavigate(ZentrixRoutes.UPDATE)
        }
        DashboardActionTile("Help & FAQ Center", "Payment help, activation instructions, and troubleshooting") {
            onNavigate(ZentrixRoutes.SUPPORT)
        }

        Button(
            onClick = onOpenWhatsApp,
            modifier = Modifier.fillMaxWidth().height(50.dp),
            colors = ButtonDefaults.buttonColors(containerColor = ZentrixNeonGreen, contentColor = ZentrixBlack)
        ) {
            Text("WhatsApp Support (01747570144)", fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun DashboardActionTile(title: String, subtitle: String, onClick: () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = ZentrixSurface),
        border = BorderStroke(1.dp, ZentrixBorder),
        shape = RoundedCornerShape(10.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, color = ZentrixSilver, style = MaterialTheme.typography.titleMedium)
            Text(subtitle, color = ZentrixSilverMuted, style = MaterialTheme.typography.bodyMedium)
        }
    }
}
