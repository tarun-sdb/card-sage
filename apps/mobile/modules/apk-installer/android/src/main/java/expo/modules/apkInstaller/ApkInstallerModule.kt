package expo.modules.apkinstaller

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class ApkInstallerModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("ApkInstaller")

        AsyncFunction("installApk") { fileUri: String ->
            val context = appContext.reactContext ?: return@AsyncFunction mapOf("success" to false, "error" to "No context")
            // expo-file-system hands back a file:// URI — File needs the raw path.
            val rawPath = try {
                Uri.parse(fileUri).path ?: fileUri
            } catch (_: Exception) {
                fileUri
            }
            val file = File(rawPath)
            if (!file.exists()) {
                return@AsyncFunction mapOf("success" to false, "error" to "File not found: $rawPath")
            }

            val authority = "${context.packageName}.fileprovider"
            val uri: Uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                FileProvider.getUriForFile(context, authority, file)
            } else {
                Uri.fromFile(file)
            }

            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
            }

            // Check if we can install from unknown sources (Android 8+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val canInstall = context.packageManager.canRequestPackageInstalls()
                if (!canInstall) {
                    // Open settings to allow installs from this app
                    val settingsIntent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                        data = Uri.parse("package:${context.packageName}")
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    context.startActivity(settingsIntent)
                    return@AsyncFunction mapOf("success" to false, "error" to "Unknown install permission required")
                }
            }

            try {
                context.startActivity(intent)
                mapOf("success" to true)
            } catch (e: Exception) {
                mapOf("success" to false, "error" to e.message ?: "Install failed")
            }
        }
    }
}