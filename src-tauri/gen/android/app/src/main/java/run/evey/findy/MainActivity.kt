package run.evey.findy

import android.graphics.Color
import android.os.Bundle
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // L'interface est toujours sombre : icônes claires dans les barres système,
    // quel que soit le thème du téléphone. Le style par défaut suit le thème
    // système et posait des icônes noires sur notre fond noir en mode clair.
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
    )
    super.onCreate(savedInstanceState)
  }
}
