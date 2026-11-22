package com.zentrix.security.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.zentrix.security.BuildConfig
import com.zentrix.security.data.repository.ZentrixRepository
import com.zentrix.security.ui.theme.*

@Composable
fun SettingsScreen(
    repository: ZentrixRepository,
    onOpenWhatsApp: () -> Unit,
    onLoggedOut: () -> Unit,
    onBack: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ZentrixBlack)
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Settings & Privacy", style = MaterialTheme.typography.titleLarge, color = ZentrixSilver)
            TextButton(onClick = onBack) { Text("Back", color = ZentrixSilver) }
        }

        Card(
            colors = CardDefaults.cardColors(containerColor = ZentrixSurface),
            border = BorderStroke(1.dp, ZentrixBorder),
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Account", color = ZentrixSilver, fontWeight = FontWeight.SemiBold)
                Text("Name: ${repository.getSavedName() ?: "Not signed in"}", color = ZentrixSilverMuted)
                Text("Email: ${repository.getSavedEmail() ?: "Not signed in"}", color = ZentrixSilverMuted)
                Text("App Version: ${BuildConfig.VERSION_NAME} (Code ${BuildConfig.VERSION_CODE})", color = ZentrixSilverMuted)
            }
        }

        Card(
            colors = CardDefaults.cardColors(containerColor = ZentrixSurface),
            border = BorderStroke(1.dp, ZentrixBorder),
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Privacy Policy & Scan Limitations", color = ZentrixSilver, fontWeight = FontWeight.SemiBold)
                Text(
                    "• ZENTRIX requests only essential Android permissions and follows Google Play data safety standards.",
                    color = ZentrixSilverMuted
                )
                Text(
                    "• ZENTRIX never collects or stores bKash/Nagad PINs, OTPs, passwords, or private banking app data.",
                    color = ZentrixSilverMuted
                )
                Text(
                    "• Security scans inspect package metadata, permission combinations, and URL structures. No cybersecurity app can guarantee 100% protection against zero-day threats.",
                    color = ZentrixSilverMuted
                )
                Text(
                    "• Terms of Service: One lifetime license (BDT 200) is valid for one Android device. Licenses may be revoked if obtained fraudulently.",
                    color = ZentrixSilverMuted
                )
            }
        }

        Button(
            onClick = onOpenWhatsApp,
            modifier = Modifier.fillMaxWidth().height(48.dp),
            colors = ButtonDefaults.buttonColors(containerColor = ZentrixNeonGreen, contentColor = ZentrixBlack)
        ) {
            Text("WhatsApp Support (01747570144)")
        }

        OutlinedButton(
            onClick = {
                repository.clearSession()
                onLoggedOut()
            },
            modifier = Modifier.fillMaxWidth().height(48.dp),
            border = BorderStroke(1.dp, ZentrixDanger)
        ) {
            Text("Sign Out", color = ZentrixDanger)
        }
    }
}
