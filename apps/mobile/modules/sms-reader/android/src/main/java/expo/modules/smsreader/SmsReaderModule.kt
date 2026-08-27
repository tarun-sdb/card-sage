package expo.modules.smsreader

import android.content.Context
import android.database.Cursor
import android.provider.Telephony
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SmsReaderModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("SmsReader")

        // Read SMS after a cutoff timestamp (ms since epoch) after permission
        // granted. Returns [{sender, body, date}] ordered newest-first so the
        // JS layer can parse transaction messages and match merchant/card.
        AsyncFunction("readSms") { sinceMs: Long ->
            val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any>>()
            read(context, sinceMs)
        }
    }

    private fun read(context: Context, sinceMs: Long): List<Map<String, Any>> {
        val out = mutableListOf<Map<String, Any>>()
        val uri = Telephony.Sms.Inbox.CONTENT_URI
        val projection = arrayOf(
            Telephony.Sms.ADDRESS,
            Telephony.Sms.BODY,
            Telephony.Sms.DATE
        )
        val selection = "${Telephony.Sms.DATE} >= ?"
        val selectionArgs = arrayOf(sinceMs.toString())
        context.contentResolver.query(uri, projection, selection, selectionArgs, "${Telephony.Sms.DATE} DESC")?.use { c: Cursor ->
            while (c.moveToNext()) {
                out.add(
                    mapOf(
                        "sender" to (c.getString(0) ?: ""),
                        "body" to (c.getString(1) ?: ""),
                        "date" to c.getLong(2)
                    )
                )
            }
        }
        return out
    }
}
