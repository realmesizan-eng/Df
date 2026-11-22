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
import com.zentrix.security.data.model.LicenseDetail
import com.zentrix.security.data.repository.ZentrixRepository
import com.zentrix.security.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun LicenseScreen(repository: ZentrixRepository, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var keyInput by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var licenses by remember { mutableStateOf<List<LicenseDetail>>(emptyList()) }
    val deviceId = remember { repository.getDeviceIdentifier() }

    LaunchedEffect(Unit) {
        repository.fetchLicenseStatus().onSuccess { licenses = it }
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
            Text("License Activation", style = MaterialTheme.typography.titleLarge, color = ZentrixSilver)
            TextButton(onClick = onBack) { Text("Back", color = ZentrixSilver) }
        }

        Card(
            colors = CardDefaults.cardColors(containerColor = ZentrixSurface),
            border = BorderStroke(1.dp, ZentrixBorder),
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Bound Device Fingerprint", color = ZentrixSilver, fontWeight = FontWeight.SemiBold)
                Text(deviceId, color = ZentrixNeonGreen, style = MaterialTheme.typography.labelMedium)
                Text(
                    "One lifetime license activates on one Android device only. Reinstalling verified updates preserves your license.",
                    color = ZentrixSilverMuted,
                    style = MaterialTheme.typography.bodyMedium
                )
            }
        }

        OutlinedTextField(
            value = keyInput,
            onValueChange = { keyInput = it.uppercase() },
            label = { Text("License Key (ZTX-XXXX-XXXX-XXXX-XXXX)") },
            modifier = Modifier.fillMaxWidth()
        )

        error?.let { Text(it, color = ZentrixDanger) }
        message?.let { Text(it, color = ZentrixNeonGreen) }

        Button(
            onClick = {
                loading = true
                error = null
                message = null
                scope.launch {
                    repository.activateLicense(keyInput)
                        .onSuccess {
                            message = it.message
                            keyInput = ""
                            repository.fetchLicenseStatus().onSuccess { list -> licenses = list }
                        }
                        .onFailure { error = it.message ?: "Activation failed" }
                    loading = false
                }
            },
            enabled = !loading && keyInput.isNotBlank(),
            modifier = Modifier.fillMaxWidth().height(48.dp),
            colors = ButtonDefaults.buttonColors(containerColor = ZentrixNeonGreen, contentColor = ZentrixBlack)
        ) {
            Text(if (loading) "Verifying..." else "Activate License on This Device")
        }

        if (licenses.isNotEmpty()) {
            Text("Account Licenses", color = ZentrixSilver, fontWeight = FontWeight.SemiBold)
            licenses.forEach { lic ->
                Card(
                    colors = CardDefaults.cardColors(containerColor = ZentrixSurface),
                    border = BorderStroke(1.dp, ZentrixBorder),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("${lic.planName ?: "ZENTRIX"} · ${lic.status}", color = ZentrixSilver, fontWeight = FontWeight.Medium)
                        Text("Key: ${lic.keyPrefix ?: "Protected"}", color = ZentrixNeonGreen, style = MaterialTheme.typography.labelMedium)
                        Text("Device: ${lic.deviceLabel ?: "Not bound yet"}", color = ZentrixSilverMuted)
                        Text(
                            if (lic.planType == "lifetime") "Validity: Lifetime (Single Device)" else "Expires: ${lic.expiresAt ?: "Upon activation"}",
                            color = ZentrixSilverMuted
                        )
                    }
                }
            }
        }
    }
}
