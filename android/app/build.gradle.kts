plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.zentrix.security"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.zentrix.security"
        minSdk = 26 // Android 8.0 Oreo
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        // Configure your production HTTPS ZENTRIX backend URL in local.properties or CI env
        val apiBaseUrl = (project.findProperty("ZENTRIX_API_BASE_URL") as String?)
            ?: "https://api.zentrix-security.example/"
        buildConfigField("String", "ZENTRIX_API_BASE_URL", "\"$apiBaseUrl\"")

        // Expected SHA-256 fingerprint of your release signing certificate for APK update verification
        val signingCertSha256 = (project.findProperty("ZENTRIX_SIGNING_CERT_SHA256") as String?) ?: ""
        buildConfigField("String", "EXPECTED_SIGNING_CERT_SHA256", "\"$signingCertSha256\"")

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            isMinifyEnabled = false
            val debugApiUrl = (project.findProperty("ZENTRIX_DEBUG_API_BASE_URL") as String?)
                ?: "http://10.0.2.2:3000/"
            buildConfigField("String", "ZENTRIX_API_BASE_URL", "\"$debugApiUrl\"")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.10.01")
    implementation(composeBom)

    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.navigation:navigation-compose:2.8.4")

    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")

    // Encrypted local storage for user session token & device salt (never stores banking PIN/OTP)
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // Networking (HTTPS REST API)
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    debugImplementation("androidx.compose.ui:ui-tooling")
}
