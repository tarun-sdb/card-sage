package expo.modules.smsreader

import android.content.Context
import android.database.Cursor
import android.provider.Telephony
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SmsReaderModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("SmsReader")

        // Read last N SMS after permission granted. Returns
        // [{sender, body, date, address}] so the JS layer can parse
        // transaction messages and match merchant/card.
        AsyncFunction("readSms") { limit: Int ->
            val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any>>()
            read(context, limit)
        }
    }

    private fun read(context: Context, limit: Int): List<Map<String, Any>> {
        val out = mutableListOf<Map<String, Any>>()
        val uri = Telephony.Sms.Inbox.CONTENT_URI
        val projection = arrayOf(
            Telephony.Sms.ADDRESS,
            Telephony.Sms.BODY,
            Telephony.Sms.DATE
        )
        context.contentResolver.query(uri, projection, null, null, "${Telephony.Sms.DATE} DESC")?.use { c: Cursor ->
            var i = 0
            while (c.moveToNext() && i < limit) {
                out.add(
                    mapOf(
                        "sender" to (c.getString(0) ?: ""),
                        "body" to (c.getString(1) ?: ""),
                        "date" to c.getLong(2)
                    )
                )
                i++
            }
        }
        return out
    }
}
