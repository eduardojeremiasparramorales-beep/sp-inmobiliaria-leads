package org.duckdns.spcrm.twa;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins propios: registrar ANTES de super.onCreate para que el bridge los exponga
        registerPlugin(ApkInstallerPlugin.class);
        registerPlugin(BiometricLockPlugin.class);
        registerPlugin(PermisosPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
