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
fun SecurityScreen(analyzer: SecurityAnalyzer, onBack: () -> Unit) {
    val summary = remember { analyzer.buildPrivacySummary() }
    var smsSample by remember { mutableStateOf("") }
    var smsWarnings by remember { mutableStateOf<List<String>>(emptyList()) }

    fun evaluateManualSmsText(text: String): List<String> {
        val lower = text.lowercase()
        val warnings = mutableListOf<String>()
        if (listOf("pin", "otp", "verification code").any { it in lower }) {
            warnings.add("Mentions PIN/OTP: Legitimate bKash/Nagad staff never request your PIN or OTP.")
        }
        if (listOf("blocked", "suspended", "kyc", "urgent", "expire").any { it in lower }) {
            warnings.add("Urgency pressure tactic commonly used in Bangladesh mobile banking scams.")
        }
        if (listOf("http://", "https://", "bit.ly", ".xyz", ".top").any { it in lower }) {
            warnings.add("Contains an external link — inspect it in ZENTRIX Phishing Link Checker before opening.")
        }
        if (listOf("won", "lottery", "bonus", "prize", "cashback").any { it in lower }) {
            warnings.add("Unverified cash prize/bonus lure detected.")
        }
        if (warnings.isEmpty() && text.isNotBlank()) {
            warnings.add("No common scam keywords matched. Always verify financial claims in the official app.")
        }
        return warnings
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ZentrixBlack)
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Privacy, SMS Safety & Report", style = MaterialTheme.typography.titleLarge, color = ZentrixSilver)
            TextButton(onClick = onBack) { Text("Back", color = ZentrixSilver) }
        }

        Card(
            colors = CardDefaults.cardColors(containerColor = ZentrixSurface),
            border = BorderStroke(1.dp, ZentrixBorder),
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Device Privacy & Permissions Report", color = ZentrixSilver, fontWeight = FontWeight.SemiBold)
                Text("Total user apps inspected: ${summary.totalUserAppsAudited}", color = ZentrixSilverMuted)
                Text("Apps requesting Camera: ${summary.cameraApps}", color = ZentrixSilverMuted)
                Text("Apps requesting Microphone: ${summary.microphoneApps}", color = ZentrixSilverMuted)
                Text("Apps requesting Fine Location: ${summary.locationApps}", color = ZentrixSilverMuted)
                Text("Apps requesting SMS access: ${summary.smsOrCallLogApps}", color = ZentrixWarning)
                Text("Apps requesting Screen Overlay: ${summary.overlayOrAccessibilityApps}", color = ZentrixWarning)
            }
        }

        Card(
            colors = CardDefaults.cardColors(containerColor = ZentrixSurface),
            border = BorderStroke(1.dp, ZentrixBorder),
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Policy-Compliant SMS Scam Checker", color = ZentrixSilver, fontWeight = FontWeight.SemiBold)
                Text(
                    "To respect Android & Google Play privacy policies, ZENTRIX does NOT request READ_SMS permission. Paste a suspicious SMS below for offline scam-pattern evaluation.",
                    color = ZentrixSilverMuted,
                    style = MaterialTheme.typography.bodyMedium
                )
                OutlinedTextField(
                    value = smsSample,
                    onValueChange = { smsSample = it },
                    label = { Text("Paste suspicious SMS text") },
                    modifier = Modifier.fillMaxWidth()
                )
                Button(
                    onClick = { smsWarnings = evaluateManualSmsText(smsSample) },
                    colors = ButtonDefaults.buttonColors(containerColor = ZentrixNeonGreen, contentColor = ZentrixBlack)
                ) {
                    Text("Check Message Locally")
                }
                smsWarnings.forEach { w ->
                    Text("• $w", color = ZentrixWarning, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}
