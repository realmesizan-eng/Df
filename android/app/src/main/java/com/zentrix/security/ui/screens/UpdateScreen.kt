package com.zentrix.security.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.zentrix.security.BuildConfig
import com.zentrix.security.data.model.LatestUpdateResponse
import com.zentrix.security.data.repository.ZentrixRepository
import com.zentrix.security.domain.ApkUpdater
import com.zentrix.security.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun UpdateScreen(
    repository: ZentrixRepository,
    updater: ApkUpdater,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var updateInfo by remember { mutableStateOf<LatestUpdateResponse?>(null) }
    var statusText by remember { mutableStateOf("Ready to check official update server.") }
    var busy by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        repository.checkAppUpdate()
            .onSuccess {
                updateInfo = it
                statusText = if (it.updateAvailable) "New verified release available." else "You are running the latest available version."
            }
            .onFailure { statusText = it.message ?: "Unable to contact update server." }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ZentrixBlack)
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Update Center", style = MaterialTheme.typography.titleLarge, color = ZentrixSilver)
            TextButton(onClick = onBack) { Text("Back", color = ZentrixSilver) }
        }

        Card(
            colors = CardDefaults.cardColors(containerColor = ZentrixSurface),
            border = BorderStroke(1.dp, ZentrixBorder),
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Installed Version: v${BuildConfig.VERSION_NAME} (Code ${BuildConfig.VERSION_CODE})", color = ZentrixSilver)
                Text(statusText, color = ZentrixNeonGreen)
                Text(
                    "All APK updates are verified via SHA-256 checksum and signing certificate match before opening the Android system installer. Your license is preserved.",
                    color = ZentrixSilverMuted,
                    style = MaterialTheme.typography.bodyMedium
                )
            }
        }

        updateInfo?.latest?.let { release ->
            Card(
                colors = CardDefaults.cardColors(containerColor = ZentrixSurface),
                border = BorderStroke(1.dp, if (release.isMandatory) ZentrixWarning else ZentrixBorder),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "Release v${release.versionName} (Build ${release.versionCode})" +
                            if (release.isMandatory) " · Mandatory Security Update" else "",
                        color = ZentrixSilver,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(release.releaseNotes, color = ZentrixSilverMuted)
                    Text("SHA-256: ${release.sha256Hash}", color = ZentrixSilverMuted, style = MaterialTheme.typography.labelMedium)

                    if (updateInfo?.updateAvailable == true) {
                        Button(
                            onClick = {
                                if (!updater.canInstallPackages()) {
                                    context.startActivity(updater.createInstallPermissionIntent())
                                    statusText = "Grant 'Install unknown apps' permission in Android Settings, then tap Download again."
                                    return@Button
                                }
                                busy = true
                                statusText = "Downloading APK and verifying SHA-256 & signature..."
                                scope.launch {
                                    updater.downloadAndVerifyApk(release)
                                        .onSuccess { apkFile ->
                                            statusText = "Checksum & signature verified. Launching Android installer..."
                                            updater.launchSystemInstaller(apkFile)
                                        }
                                        .onFailure {
                                            statusText = it.message ?: "Verification failed"
                                        }
                                    busy = false
                                }
                            },
                            enabled = !busy,
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(containerColor = ZentrixNeonGreen, contentColor = ZentrixBlack)
                        ) {
                            Text(if (busy) "Verifying..." else "Download & Verify APK")
                        }
                    }
                }
            }
        }
    }
}
