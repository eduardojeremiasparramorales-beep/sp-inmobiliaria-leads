package org.duckdns.spcrm.twa;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bloqueo de la app con huella/biometría. DEVICE_CREDENTIAL da fallback
 * gratis al PIN/patrón del propio sistema si el teléfono no tiene huella
 * registrada o el sensor falla.
 */
@CapacitorPlugin(name = "BiometricLock")
public class BiometricLockPlugin extends Plugin {

    private static final int AUTHENTICATORS =
            BiometricManager.Authenticators.BIOMETRIC_WEAK
                    | BiometricManager.Authenticators.DEVICE_CREDENTIAL;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        int r = BiometricManager.from(getContext()).canAuthenticate(AUTHENTICATORS);
        JSObject ret = new JSObject();
        ret.put("value", r == BiometricManager.BIOMETRIC_SUCCESS);
        call.resolve(ret);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        FragmentActivity activity = getActivity();
        if (activity == null) {
            call.reject("sin_activity");
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                        .setTitle("Leons Group")
                        .setSubtitle("Desbloquea con tu huella")
                        .setAllowedAuthenticators(AUTHENTICATORS)
                        .build();
                new BiometricPrompt(activity,
                        ContextCompat.getMainExecutor(getContext()),
                        new BiometricPrompt.AuthenticationCallback() {
                            @Override
                            public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                                call.resolve();
                            }

                            @Override
                            public void onAuthenticationError(int code, CharSequence msg) {
                                call.reject(String.valueOf(code));
                            }
                        }).authenticate(info);
            } catch (Exception e) {
                call.reject("bio_failed: " + e.getMessage());
            }
        });
    }
}
