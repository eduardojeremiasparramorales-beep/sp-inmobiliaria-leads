package org.duckdns.spcrm.twa;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Estado REAL de los permisos de Android para la hoja de permisos de la SPA.
 * El Permissions API del WebView devuelve 'prompt' para mic/cámara aunque ya
 * estén concedidos (Capacitor resuelve la concesión a nivel nativo por request),
 * así que la web no puede saber el estado sin este plugin.
 *
 * Devuelve 'granted' | 'prompt' por permiso. No distingue 'denied' permanente
 * (Android solo lo revela durante un request activo vía shouldShowRationale);
 * para la UI alcanza: prompt = mostrar botón Activar.
 */
@CapacitorPlugin(name = "Permisos")
public class PermisosPlugin extends Plugin {

    private String estadoDe(String permiso) {
        return ContextCompat.checkSelfPermission(getContext(), permiso)
                == PackageManager.PERMISSION_GRANTED ? "granted" : "prompt";
    }

    @PluginMethod
    public void estado(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("mic", estadoDe(Manifest.permission.RECORD_AUDIO));
        ret.put("cam", estadoDe(Manifest.permission.CAMERA));
        ret.put("geo", estadoDe(Manifest.permission.ACCESS_FINE_LOCATION));
        // POST_NOTIFICATIONS solo existe en Android 13+; antes las notificaciones
        // no requieren permiso runtime → granted
        if (Build.VERSION.SDK_INT >= 33) {
            ret.put("notif", estadoDe("android.permission.POST_NOTIFICATIONS"));
        } else {
            ret.put("notif", "granted");
        }
        call.resolve(ret);
    }
}
