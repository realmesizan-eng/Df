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
import com.zentrix.security.data.model.SubscriptionPlan
import com.zentrix.security.data.repository.ZentrixRepository
import com.zentrix.security.ui.theme.*

@Composable
fun SubscriptionScreen(
    repository: ZentrixRepository,
    onSelectPlan: (Int) -> Unit,
    onBack: () -> Unit
) {
    var plans by remember { mutableStateOf<List<SubscriptionPlan>>(emptyList()) }
    var paymentNumber by remember { mutableStateOf("01747570144") }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        repository.fetchPlans()
            .onSuccess {
                plans = it.plans
                paymentNumber = it.paymentNumber
            }
            .onFailure { error = it.message ?: "Unable to fetch plans" }
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
            Text("Subscription Plans", style = MaterialTheme.typography.titleLarge, color = ZentrixSilver)
            TextButton(onClick = onBack) { Text("Back", color = ZentrixSilver) }
        }

        Text(
            "Manual bKash Send Money to $paymentNumber. One license binds to one Android device only.",
            color = ZentrixSilverMuted
        )

        error?.let { Text(it, color = ZentrixDanger) }

        plans.forEach { plan ->
            Card(
                colors = CardDefaults.cardColors(containerColor = ZentrixSurface),
                border = BorderStroke(1.dp, if (plan.billingType == "lifetime") ZentrixNeonGreen else ZentrixBorder),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(plan.name, color = ZentrixSilver, style = MaterialTheme.typography.titleMedium)
                    Text(
                        "BDT ${plan.priceBdt} · ${if (plan.billingType == "lifetime") "One-Time Lifetime" else "${plan.durationDays ?: 30} Days"}",
                        color = ZentrixNeonGreen,
                        fontWeight = FontWeight.Bold
                    )
                    Text(plan.description, color = ZentrixSilverMuted, style = MaterialTheme.typography.bodyMedium)
                    Text("Device Limit: ${plan.deviceLimit} Android device", color = ZentrixSilverMuted, style = MaterialTheme.typography.labelMedium)
                    Button(
                        onClick = { onSelectPlan(plan.id) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = ZentrixNeonGreen, contentColor = ZentrixBlack)
                    ) {
                        Text("Select & View bKash Instructions")
                    }
                }
            }
        }
    }
}
