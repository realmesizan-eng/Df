package com.zentrix.security.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.zentrix.security.domain.SecurityAnalyzer
import com.zentrix.security.ui.theme.*

@Composable
fun BankingScreen(analyzer: SecurityAnalyzer, onBack: () -> Unit) {
    val audits = remember { analyzer.auditMobileBankingApps() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ZentrixBlack)
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Mobile Banking Protection", style = MaterialTheme.typography.titleLarge, color = ZentrixSilver)
            TextButton(onClick = onBack) { Text("Back", color = ZentrixSilver) }
        }

        Text(
            "Independent safety advisor for bKash and Nagad users. ZENTRIX is NOT affiliated with bKash or Nagad and never reads banking data, PINs, or OTPs.",
            color = ZentrixSilverMuted,
            style = MaterialTheme.typography.bodyMedium
        )

        audits.forEach { audit ->
            Card(
                colors = CardDefaults.cardColors(containerColor = ZentrixSurface),
                border = BorderStroke(1.dp, ZentrixBorder),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("${audit.brandName} Package Check", color = ZentrixSilver, fontWeight = FontWeight.SemiBold)
                    Text("Official Package ID: ${audit.officialPackage}", color = ZentrixSilverMuted, style = MaterialTheme.typography.labelMedium)
                    Text(
                        if (audit.officialInstalled) {
                            if (audit.officialInstallerTrusted) "Official app installed from a trusted store."
                            else "Warning: Official package found but installed outside Play Store / Galaxy Store."
                        } else {
                            "Official app not currently installed on this device."
                        },
                        color = if (audit.officialInstalled && audit.officialInstallerTrusted) ZentrixNeonGreen else ZentrixWarning
                    )
                    if (audit.suspiciousLookalikePackages.isNotEmpty()) {
                        Text(
                            "ALERT — Suspicious lookalike apps detected: ${audit.suspiciousLookalikePackages.joinToString(", ")}",
                            color = ZentrixDanger,
                            fontWeight = FontWeight.SemiBold
                        )
                    } else {
                        Text("No unofficial lookalike packages detected for ${audit.brandName}.", color = ZentrixSilverMuted)
                    }
                }
            }
        }

        BankingSafetyCard(
            title = "PIN & OTP Safety Rules",
            points = listOf(
                "Never share your bKash or Nagad PIN or 6-digit OTP on phone calls, SMS, or WhatsApp.",
                "Neither customer support nor ZENTRIX will ever ask for your PIN or OTP.",
                "Always dial official USSD (*247# / *167#) or use the verified Play Store app."
            )
        )

        BankingSafetyCard(
            title = "Fake Payment Screenshot Warning",
            points = listOf(
                "Scammers use edited screenshots to fake Send Money or Cash In confirmation.",
                "Never release goods or approve transfers based solely on a screenshot.",
                "Always verify your balance and official Transaction ID inside the official bKash or Nagad app statement."
            )
        )
    }
}

@Composable
private fun BankingSafetyCard(title: String, points: List<String>) {
    Card(
        colors = CardDefaults.cardColors(containerColor = ZentrixSurface),
        border = BorderStroke(1.dp, ZentrixBorder),
        shape = RoundedCornerShape(10.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(title, color = ZentrixSilver, fontWeight = FontWeight.SemiBold)
            points.forEach { p ->
                Text("• $p", color = ZentrixSilverMuted, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}
