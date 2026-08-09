package expo.modules.sharereceiver

import android.app.Activity
import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ShareReceiverModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("ShareReceiver")

        // Read the ACTION_SEND content this app was launched with, then clear
        // it so a later cold start doesn't re-show stale shares. Returns
        // { text, subject } or null when launched normally.
        AsyncFunction("getSharedContent") {
            val activity = appContext.currentActivity ?: return@AsyncFunction null
            val intent = activity.intent
            if (intent?.action != Intent.ACTION_SEND) return@AsyncFunction null
            val text = intent.getStringExtra(Intent.EXTRA_TEXT)
            val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT) ?: ""
            intent.removeExtra(Intent.EXTRA_TEXT)
            intent.removeExtra(Intent.EXTRA_SUBJECT)
            if (text.isNullOrBlank()) return@AsyncFunction null
            mapOf("text" to text, "subject" to subject)
        }
    }
}
