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
import com.zentrix.security.data.model.UrlCheckResponse
import com.zentrix.security.data.repository.ZentrixRepository
import com.zentrix.security.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun PhishingScreen(repository: ZentrixRepository, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var urlInput by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var result by remember { mutableStateOf<UrlCheckResponse?>(null) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ZentrixBlack)
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Phishing Link Checker", style = MaterialTheme.typography.titleLarge, color = ZentrixSilver)
            TextButton(onClick = onBack) { Text("Back", color = ZentrixSilver) }
        }

        Text(
            "Paste a suspicious SMS, WhatsApp, or banking link to inspect lookalike domains, Punycode tricks, risky TLDs, and threat feeds.",
            color = ZentrixSilverMuted,
            style = MaterialTheme.typography.bodyMedium
        )

        OutlinedTextField(
            value = urlInput,
            onValueChange = { urlInput = it },
            label = { Text("Enter URL (e.g. https://bkash-bonus-verify.xyz)") },
            modifier = Modifier.fillMaxWidth()
        )

        Button(
            onClick = {
                loading = true
                error = null
                scope.launch {
                    repository.checkPhishingUrl(urlInput)
                        .onSuccess { result = it }
                        .onFailure { error = it.message ?: "URL check failed" }
                    loading = false
                }
            },
            enabled = !loading && urlInput.isNotBlank(),
            modifier = Modifier.fillMaxWidth().height(48.dp),
            colors = ButtonDefaults.buttonColors(containerColor = ZentrixNeonGreen, contentColor = ZentrixBlack)
        ) {
            Text(if (loading) "Analyzing..." else "Inspect URL")
        }

        error?.let { Text(it, color = ZentrixDanger) }

        result?.let { r ->
            Card(
                colors = CardDefaults.cardColors(containerColor = ZentrixSurface),
                border = BorderStroke(1.dp, ZentrixBorder),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "Assessment: ${r.riskLevel} (Risk Index ${r.score}/100)",
                        color = if (r.riskLevel == "HIGH") ZentrixDanger else if (r.riskLevel == "SUSPICIOUS") ZentrixWarning else ZentrixNeonGreen,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text("Host: ${r.hostname}", color = ZentrixSilver, style = MaterialTheme.typography.labelMedium)
                    Text("Engine: ${r.threatIntelSource}", color = ZentrixSilverMuted, style = MaterialTheme.typography.bodyMedium)
                    r.findings.forEach { f ->
                        Text("• [${f.severity}] ${f.title}: ${f.detail}", color = ZentrixSilverMuted, style = MaterialTheme.typography.bodyMedium)
                    }
                    Text(r.limitationsNotice, color = ZentrixSilverMuted, style = MaterialTheme.typography.labelMedium)
                }
            }
        }
    }
}
