package net.gryntech.ulak.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Matches the web app's dark palette
object UlakColors {
    val Background = Color(0xFF0B1220)
    val Surface = Color(0xFF0F172A)
    val SurfaceRaised = Color(0xFF1E293B)
    val Sky = Color(0xFF38BDF8)
    val Indigo = Color(0xFF818CF8)
    val TextMain = Color(0xFFE2E8F0)
    val TextMuted = Color(0xFF94A3B8)
    val Danger = Color(0xFFF87171)
    val Success = Color(0xFF34D399)
}

private val Scheme = darkColorScheme(
    primary = UlakColors.Sky,
    onPrimary = UlakColors.Background,
    secondary = UlakColors.Indigo,
    background = UlakColors.Background,
    onBackground = UlakColors.TextMain,
    surface = UlakColors.Surface,
    onSurface = UlakColors.TextMain,
    surfaceVariant = UlakColors.SurfaceRaised,
    onSurfaceVariant = UlakColors.TextMuted,
    outline = Color(0xFF334155),
    error = UlakColors.Danger
)

@Composable
fun UlakTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Scheme, content = content)
}
