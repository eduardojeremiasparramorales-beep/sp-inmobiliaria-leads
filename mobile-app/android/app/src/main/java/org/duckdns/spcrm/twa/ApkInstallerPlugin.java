package org.duckdns.spcrm.twa;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * Auto-actualización in-app: la web descarga el APK nuevo (Filesystem) y este
 * plugin lanza el instalador del sistema ENCIMA de la app instalada.
 * Misma firma (release.keystore) + versionCode mayor = instala sin desinstalar.
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    // ¿Esta app puede lanzar el instalador? (Android 8+ exige opt-in del usuario)
    @PluginMethod
    public void canInstall(PluginCall call) {
        boolean ok = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
                || getContext().getPackageManager().canRequestPackageInstalls();
        JSObject ret = new JSObject();
        ret.put("value", ok);
        call.resolve(ret);
    }

    // Abre Ajustes → "Instalar apps desconocidas" para ESTA app
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }

    // Lanza el instalador del sistema con el APK descargado (estilo Free Fire)
    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path"); // file:///... que devuelve Filesystem.downloadFile
        if (path == null || path.isEmpty()) {
            call.reject("path requerido");
            return;
        }
        try {
            File apk = path.startsWith("file://")
                    ? new File(Uri.parse(path).getPath())
                    : new File(path);
            if (!apk.exists()) {
                call.reject("apk_no_existe");
                return;
            }
            Uri uri = FileProvider.getUriForFile(getContext(),
                    getContext().getPackageName() + ".fileprovider", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("install_failed: " + e.getMessage());
        }
    }
}
