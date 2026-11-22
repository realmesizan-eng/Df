package com.zentrix.security.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

val ZentrixBlack = Color(0xFF080A0C)
val ZentrixSurface = Color(0xFF101419)
val ZentrixSurfaceElevated = Color(0xFF171D24)
val ZentrixBorder = Color(0xFF252E38)
val ZentrixNeonGreen = Color(0xFF39FF14)
val ZentrixGreenMuted = Color(0xFF1F9D45)
val ZentrixSilver = Color(0xFFC8D0D8)
val ZentrixSilverMuted = Color(0xFF8894A2)
val ZentrixWarning = Color(0xFFF59E0B)
val ZentrixDanger = Color(0xFFEF4444)

private val ZentrixDarkColorScheme = darkColorScheme(
    primary = ZentrixNeonGreen,
    onPrimary = ZentrixBlack,
    secondary = ZentrixSilver,
    onSecondary = ZentrixBlack,
    background = ZentrixBlack,
    onBackground = Color(0xFFE6ECF2),
    surface = ZentrixSurface,
    onSurface = Color(0xFFE6ECF2),
    surfaceVariant = ZentrixSurfaceElevated,
    onSurfaceVariant = ZentrixSilverMuted,
    outline = ZentrixBorder,
    error = ZentrixDanger,
    onError = Color.White
)

private val ZentrixTypography = Typography(
    headlineLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 26.sp,
        lineHeight = 32.sp
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 19.sp,
        lineHeight = 25.sp
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.sp,
        lineHeight = 22.sp
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp
    ),
    labelMedium = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp
    )
)

@Composable
fun ZentrixTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = ZentrixDarkColorScheme,
        typography = ZentrixTypography,
        content = content
    )
}
