package org.duckdns.spcrm.twa;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins propios: registrar ANTES de super.onCreate para que el bridge los exponga
        registerPlugin(ApkInstallerPlugin.class);
        registerPlugin(BiometricLockPlugin.class);
        registerPlugin(PermisosPlugin.class);
        crearCanalNotificaciones();
        super.onCreate(savedInstanceState);
    }

    // Sin un canal creado explícitamente, Android descarta en silencio cualquier push FCM
    // que llegue con la app en background (ver meta-data en AndroidManifest.xml y el
    // channelId enviado desde src/services/push.js — los tres deben coincidir).
    private void crearCanalNotificaciones() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                "leons_group_push",
                "Mensajes de clientes",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Nuevos mensajes y leads asignados");
            channel.enableVibration(true);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }
}
