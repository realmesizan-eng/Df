package com.zentrix.security

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.zentrix.security.data.repository.ZentrixRepository
import com.zentrix.security.domain.ApkUpdater
import com.zentrix.security.domain.SecurityAnalyzer
import com.zentrix.security.ui.screens.*
import com.zentrix.security.ui.theme.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

object ZentrixRoutes {
    const val SPLASH = "splash"
    const val WELCOME = "welcome"
    const val AUTH = "auth"
    const val HOME = "home"
    const val SCANNER = "scanner"
    const val BANKING = "banking"
    const val PHISHING = "phishing"
    const val SECURITY = "security"
    const val SUBSCRIPTION = "subscription"
    const val PAYMENT = "payment"
    const val LICENSE = "license"
    const val UPDATE = "update"
    const val SUPPORT = "support"
    const val SETTINGS = "settings"
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val repository = ZentrixRepository(applicationContext)
        val analyzer = SecurityAnalyzer(applicationContext)
        val updater = ApkUpdater(applicationContext)

        setContent {
            ZentrixTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = ZentrixBlack
                ) {
                    ZentrixAppNavHost(
                        repository = repository,
                        analyzer = analyzer,
                        updater = updater
                    )
                }
            }
        }
    }
}

@Composable
fun ZentrixAppNavHost(
    repository: ZentrixRepository,
    analyzer: SecurityAnalyzer,
    updater: ApkUpdater,
    navController: NavHostController = rememberNavController()
) {
    var selectedPlanId by remember { mutableIntStateOf(2) }
    val context = LocalContext.current
    val openWhatsApp: () -> Unit = {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/8801747570144"))
        context.startActivity(intent)
    }

    NavHost(navController = navController, startDestination = ZentrixRoutes.SPLASH) {
        composable(ZentrixRoutes.SPLASH) {
            SplashScreen {
                val target = if (repository.getSavedToken() != null) ZentrixRoutes.HOME else ZentrixRoutes.WELCOME
                navController.navigate(target) {
                    popUpTo(ZentrixRoutes.SPLASH) { inclusive = true }
                }
            }
        }
        composable(ZentrixRoutes.WELCOME) {
            WelcomeScreen(
                onGetStarted = { navController.navigate(ZentrixRoutes.AUTH) },
                onOpenSupport = { navController.navigate(ZentrixRoutes.SUPPORT) }
            )
        }
        composable(ZentrixRoutes.AUTH) {
            AuthScreen(
                repository = repository,
                onAuthenticated = {
                    navController.navigate(ZentrixRoutes.HOME) {
                        popUpTo(ZentrixRoutes.WELCOME) { inclusive = true }
                    }
                }
            )
        }
        composable(ZentrixRoutes.HOME) {
            HomeScreen(
                repository = repository,
                analyzer = analyzer,
                onNavigate = { route -> navController.navigate(route) },
                onOpenWhatsApp = openWhatsApp
            )
        }
        composable(ZentrixRoutes.SCANNER) {
            ScannerScreen(analyzer = analyzer, onBack = { navController.popBackStack() })
        }
        composable(ZentrixRoutes.BANKING) {
            BankingScreen(analyzer = analyzer, onBack = { navController.popBackStack() })
        }
        composable(ZentrixRoutes.PHISHING) {
            PhishingScreen(repository = repository, onBack = { navController.popBackStack() })
        }
        composable(ZentrixRoutes.SECURITY) {
            SecurityScreen(analyzer = analyzer, onBack = { navController.popBackStack() })
        }
        composable(ZentrixRoutes.SUBSCRIPTION) {
            SubscriptionScreen(
                repository = repository,
                onSelectPlan = { planId ->
                    selectedPlanId = planId
                    navController.navigate(ZentrixRoutes.PAYMENT)
                },
                onBack = { navController.popBackStack() }
            )
        }
        composable(ZentrixRoutes.PAYMENT) {
            PaymentScreen(
                repository = repository,
                selectedPlanId = selectedPlanId,
                onGoToLicense = { navController.navigate(ZentrixRoutes.LICENSE) },
                onBack = { navController.popBackStack() }
            )
        }
        composable(ZentrixRoutes.LICENSE) {
            LicenseScreen(repository = repository, onBack = { navController.popBackStack() })
        }
        composable(ZentrixRoutes.UPDATE) {
            UpdateScreen(
                repository = repository,
                updater = updater,
                onBack = { navController.popBackStack() }
            )
        }
        composable(ZentrixRoutes.SUPPORT) {
            SupportScreen(
                repository = repository,
                onOpenWhatsApp = openWhatsApp,
                onBack = { navController.popBackStack() }
            )
        }
        composable(ZentrixRoutes.SETTINGS) {
            SettingsScreen(
                repository = repository,
                onOpenWhatsApp = openWhatsApp,
                onLoggedOut = {
                    navController.navigate(ZentrixRoutes.WELCOME) {
                        popUpTo(0) { inclusive = true }
                    }
                },
                onBack = { navController.popBackStack() }
            )
        }
    }
}

@Composable
private fun SplashScreen(onDone: () -> Unit) {
    LaunchedEffect(Unit) {
        delay(1200)
        onDone()
    }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(ZentrixBlack),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "ZENTRIX",
                style = MaterialTheme.typography.headlineLarge,
                color = ZentrixSilver
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Your Digital World. Our Protection.",
                style = MaterialTheme.typography.bodyMedium,
                color = ZentrixNeonGreen
            )
        }
    }
}

@Composable
private fun WelcomeScreen(onGetStarted: () -> Unit, onOpenSupport: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ZentrixBlack)
            .padding(24.dp),
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Column(modifier = Modifier.padding(top = 48.dp)) {
            Text("ZENTRIX", style = MaterialTheme.typography.headlineLarge, color = ZentrixSilver)
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                "Your Digital World. Our Protection.",
                style = MaterialTheme.typography.titleMedium,
                color = ZentrixNeonGreen
            )
            Spacer(modifier = Modifier.height(24.dp))
            Text(
                "Privacy-respecting Android security auditing, phishing domain inspection, and mobile banking safety guidance for bKash and Nagad users.",
                style = MaterialTheme.typography.bodyMedium,
                color = ZentrixSilverMuted
            )
            Spacer(modifier = Modifier.height(16.dp))
            Card(
                colors = CardDefaults.cardColors(containerColor = ZentrixSurface),
                border = BorderStroke(1.dp, ZentrixBorder),
                shape = RoundedCornerShape(12.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Transparent Security Principles", color = ZentrixSilver, fontWeight = FontWeight.SemiBold)
                    Text("• Never collects banking PINs, OTPs, or passwords.", color = ZentrixSilverMuted, style = MaterialTheme.typography.bodyMedium)
                    Text("• Never reads private banking application storage.", color = ZentrixSilverMuted, style = MaterialTheme.typography.bodyMedium)
                    Text("• Manual bKash TrxID license verification — never trusts screenshots.", color = ZentrixSilverMuted, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(
                onClick = onGetStarted,
                modifier = Modifier.fillMaxWidth().height(52.dp),
                colors = ButtonDefaults.buttonColors(containerColor = ZentrixNeonGreen, contentColor = ZentrixBlack)
            ) {
                Text("Sign In or Create Account", fontWeight = FontWeight.SemiBold)
            }
            OutlinedButton(
                onClick = onOpenSupport,
                modifier = Modifier.fillMaxWidth().height(48.dp),
                border = BorderStroke(1.dp, ZentrixBorder)
            ) {
                Text("WhatsApp Support & Help", color = ZentrixSilver)
            }
        }
    }
}

@Composable
private fun AuthScreen(repository: ZentrixRepository, onAuthenticated: () -> Unit) {
    val scope = rememberCoroutineScope()
    var isRegisterMode by remember { mutableStateOf(false) }
    var fullName by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ZentrixBlack)
            .padding(24.dp),
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = if (isRegisterMode) "Create ZENTRIX Account" else "Sign In to ZENTRIX",
            style = MaterialTheme.typography.headlineLarge,
            color = ZentrixSilver
        )
        Spacer(modifier = Modifier.height(20.dp))

        if (isRegisterMode) {
            OutlinedTextField(
                value = fullName,
                onValueChange = { fullName = it },
                label = { Text("Full Name") },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                value = phone,
                onValueChange = { phone = it },
                label = { Text("Mobile Number (017XXXXXXXX)") },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(12.dp))
        }

        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email Address") },
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(modifier = Modifier.height(12.dp))
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password (min 8 characters)") },
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth()
        )

        errorMessage?.let {
            Spacer(modifier = Modifier.height(12.dp))
            Text(it, color = ZentrixDanger, style = MaterialTheme.typography.bodyMedium)
        }

        Spacer(modifier = Modifier.height(20.dp))
        Button(
            onClick = {
                loading = true
                errorMessage = null
                scope.launch {
                    val result = if (isRegisterMode) {
                        repository.register(fullName, email, phone, password)
                    } else {
                        repository.login(email, password)
                    }
                    loading = false
                    result.onSuccess { onAuthenticated() }
                        .onFailure { errorMessage = it.message ?: "Authentication error" }
                }
            },
            enabled = !loading,
            modifier = Modifier.fillMaxWidth().height(50.dp),
            colors = ButtonDefaults.buttonColors(containerColor = ZentrixNeonGreen, contentColor = ZentrixBlack)
        ) {
            Text(if (loading) "Please wait..." else if (isRegisterMode) "Register" else "Sign In")
        }

        Spacer(modifier = Modifier.height(12.dp))
        TextButton(
            onClick = { isRegisterMode = !isRegisterMode; errorMessage = null },
            modifier = Modifier.align(Alignment.CenterHorizontally)
        ) {
            Text(
                if (isRegisterMode) "Already registered? Sign in" else "New to ZENTRIX? Create an account",
                color = ZentrixSilver
            )
        }
    }
}
