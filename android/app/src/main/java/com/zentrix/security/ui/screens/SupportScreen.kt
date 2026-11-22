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
import com.zentrix.security.data.model.SupportInfoResponse
import com.zentrix.security.data.repository.ZentrixRepository
import com.zentrix.security.ui.theme.*

@Composable
fun SupportScreen(
    repository: ZentrixRepository,
    onOpenWhatsApp: () -> Unit,
    onBack: () -> Unit
) {
    var info by remember { mutableStateOf<SupportInfoResponse?>(null) }

    LaunchedEffect(Unit) {
        repository.fetchSupportInfo().onSuccess { info = it }
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
            Text("WhatsApp Support & Help", style = MaterialTheme.typography.titleLarge, color = ZentrixSilver)
            TextButton(onClick = onBack) { Text("Back", color = ZentrixSilver) }
        }

        Card(
            colors = CardDefaults.cardColors(containerColor = ZentrixSurface),
            border = BorderStroke(1.dp, ZentrixBorder),
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Official ZENTRIX Support", color = ZentrixSilver, fontWeight = FontWeight.SemiBold)
                Text("WhatsApp Number: 01747570144", color = ZentrixNeonGreen, style = MaterialTheme.typography.labelMedium)
                Text("Contact us for manual bKash verification questions, license activation help, or device replacement transfers.", color = ZentrixSilverMuted)
                Button(
                    onClick = onOpenWhatsApp,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = ZentrixNeonGreen, contentColor = ZentrixBlack)
                ) {
                    Text("Open WhatsApp Chat (wa.me/8801747570144)")
                }
            }
        }

        info?.helpTopics?.forEach { topic ->
            Card(
                colors = CardDefaults.cardColors(containerColor = ZentrixSurface),
                border = BorderStroke(1.dp, ZentrixBorder),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(topic.title, color = ZentrixSilver, fontWeight = FontWeight.SemiBold)
                    topic.steps.forEachIndexed { idx, step ->
                        Text("${idx + 1}. $step", color = ZentrixSilverMuted, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }

        info?.faqs?.forEach { faq ->
            Card(
                colors = CardDefaults.cardColors(containerColor = ZentrixSurface),
                border = BorderStroke(1.dp, ZentrixBorder),
                shape = RoundedCornerShape(10.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(faq.q, color = ZentrixSilver, fontWeight = FontWeight.SemiBold)
                    Text(faq.a, color = ZentrixSilverMuted, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}
