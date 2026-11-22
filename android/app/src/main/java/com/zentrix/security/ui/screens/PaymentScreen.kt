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
import com.zentrix.security.data.model.PaymentRecord
import com.zentrix.security.data.repository.ZentrixRepository
import com.zentrix.security.ui.theme.*
import kotlinx.coroutines.launch

@Composable
fun PaymentScreen(
    repository: ZentrixRepository,
    selectedPlanId: Int,
    onGoToLicense: () -> Unit,
    onBack: () -> Unit
) {
    val scope = rememberCoroutineScope()
    var senderNumber by remember { mutableStateOf("") }
    var transactionId by remember { mutableStateOf("") }
    var customerNote by remember { mutableStateOf("") }
    var statusMessage by remember { mutableStateOf<String?>(null) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var submitting by remember { mutableStateOf(false) }
    var history by remember { mutableStateOf<List<PaymentRecord>>(emptyList()) }

    LaunchedEffect(Unit) {
        repository.fetchMyPayments().onSuccess { history = it }
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
            Text("Manual bKash Payment", style = MaterialTheme.typography.titleLarge, color = ZentrixSilver)
            TextButton(onClick = onBack) { Text("Back", color = ZentrixSilver) }
        }

        Card(
            colors = CardDefaults.cardColors(containerColor = ZentrixSurface),
            border = BorderStroke(1.dp, ZentrixBorder),
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Payment Instructions", color = ZentrixSilver, fontWeight = FontWeight.SemiBold)
                Text("1. Open official bKash app -> Send Money.", color = ZentrixSilverMuted)
                Text("2. Send plan amount to: 01747570144 (Lifetime: BDT 200).", color = ZentrixNeonGreen, fontWeight = FontWeight.SemiBold)
                Text("3. Copy the Transaction ID (TrxID) from your official bKash SMS.", color = ZentrixSilverMuted)
                Text("4. Submit the TrxID below. Admin manually verifies every payment before issuing a license.", color = ZentrixSilverMuted)
                Text("SECURITY: Never enter your bKash PIN or OTP here. Screenshots are not accepted as proof.", color = ZentrixWarning)
            }
        }

        OutlinedTextField(
            value = senderNumber,
            onValueChange = { senderNumber = it },
            label = { Text("Your bKash Sender Number (01XXXXXXXXX)") },
            modifier = Modifier.fillMaxWidth()
        )

        OutlinedTextField(
            value = transactionId,
            onValueChange = { transactionId = it.uppercase() },
            label = { Text("bKash Transaction ID (TrxID)") },
            modifier = Modifier.fillMaxWidth()
        )

        OutlinedTextField(
            value = customerNote,
            onValueChange = { customerNote = it },
            label = { Text("Optional Reference Note (No PIN/OTP)") },
            modifier = Modifier.fillMaxWidth()
        )

        errorMessage?.let { Text(it, color = ZentrixDanger) }
        statusMessage?.let { Text(it, color = ZentrixNeonGreen) }

        Button(
            onClick = {
                submitting = true
                errorMessage = null
                statusMessage = null
                scope.launch {
                    repository.submitManualPayment(selectedPlanId, senderNumber, transactionId, customerNote)
                        .onSuccess { resp ->
                            statusMessage = resp.message
                            transactionId = ""
                            customerNote = ""
                            repository.fetchMyPayments().onSuccess { history = it }
                        }
                        .onFailure { errorMessage = it.message ?: "Submission failed" }
                    submitting = false
                }
            },
            enabled = !submitting && senderNumber.isNotBlank() && transactionId.isNotBlank(),
            modifier = Modifier.fillMaxWidth().height(48.dp),
            colors = ButtonDefaults.buttonColors(containerColor = ZentrixNeonGreen, contentColor = ZentrixBlack)
        ) {
            Text(if (submitting) "Submitting..." else "Submit Transaction ID for Verification")
        }

        OutlinedButton(
            onClick = onGoToLicense,
            modifier = Modifier.fillMaxWidth(),
            border = BorderStroke(1.dp, ZentrixBorder)
        ) {
            Text("Have an Approved Key? Go to License Activation", color = ZentrixSilver)
        }

        if (history.isNotEmpty()) {
            Text("Your Payment Verification Records", color = ZentrixSilver, fontWeight = FontWeight.SemiBold)
            history.forEach { rec ->
                Card(
                    colors = CardDefaults.cardColors(containerColor = ZentrixSurface),
                    border = BorderStroke(1.dp, ZentrixBorder),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("${rec.planName} · BDT ${rec.amountBdt} · ${rec.status}", color = ZentrixSilver, fontWeight = FontWeight.Medium)
                        Text("TrxID: ${rec.transactionId} · From: ${rec.senderNumber}", color = ZentrixSilverMuted, style = MaterialTheme.typography.labelMedium)
                        rec.adminNote?.takeIf { it.isNotBlank() }?.let {
                            Text("Admin note: $it", color = ZentrixSilverMuted)
                        }
                        rec.issuedLicensePrefix?.let {
                            Text("Issued License: $it", color = ZentrixNeonGreen, style = MaterialTheme.typography.labelMedium)
                        }
                    }
                }
            }
        }
    }
}
