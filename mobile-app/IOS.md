# App iOS — Leons Group (Capacitor)

La app iOS es un **wrapper** igual que la de Android: carga el sitio en vivo
`https://spcrm.duckdns.org` (ver `capacitor.config.json`). Por eso **los cambios de
frontend/backend llegan al iPhone con un simple deploy en la VM — no requieren recompilar**.
Solo se recompila cuando cambian el `Info.plist`, plugins nativos, íconos o el
`capacitor.config.json`.

## Estado actual

- `@capacitor/ios` está declarado en `mobile-app/package.json`.
- La carpeta `ios/` **no se versiona**: la genera el runner de CI (`npx cap add ios`) o tú
  en una Mac. Esto evita commitear un proyecto Xcode a medio generar desde Windows.
- El workflow `.github/workflows/ios-build.yml` compila **sin firma** en un runner macOS
  cada vez que cambia `mobile-app/**`. Sirve para verificar que el proyecto compila.

## Compilar en la nube (sin Mac) — ya configurado

1. Haz push a `main`/`master`/`glow-up-general` tocando algo en `mobile-app/`.
2. GitHub Actions ejecuta `ios-build.yml` en `macos-14`: instala deps, `npx cap add ios`,
   `pod install` y `xcodebuild` sin firma.
3. Revisa el resultado en la pestaña **Actions** del repo.

## Compilar en una Mac (si consigues una)

```bash
cd mobile-app
npm install
npx cap add ios        # genera ios/ (solo la primera vez)
npx cap sync ios
npx @capacitor/assets generate --ios   # íconos y splash desde los assets existentes
npx cap open ios       # abre Xcode
```

## Permisos declarados (Info.plist)

`npx cap sync ios` no añade automáticamente los textos de permiso. Tras generar `ios/`,
hay que asegurar estas claves en `ios/App/App/Info.plist` (el CI las inyecta con el paso
opcional de más abajo; en Mac se editan en Xcode → Info):

| Clave | Texto (español) |
|---|---|
| `NSLocationWhenInUseUsageDescription` | Leons Group usa tu ubicación para compartir puntos y lotes con tus clientes. |
| `NSCameraUsageDescription` | Leons Group usa la cámara para enviar fotos de lotes y documentos a tus clientes. |
| `NSPhotoLibraryUsageDescription` | Leons Group accede a tus fotos para adjuntarlas en los chats. |
| `NSPhotoLibraryAddUsageDescription` | Leons Group guarda imágenes en tu galería cuando lo pidas. |
| `NSMicrophoneUsageDescription` | Leons Group usa el micrófono para grabar notas de voz. |

## Publicar en App Store / TestFlight — PENDIENTE (requiere cuenta Apple Developer)

Cuando exista la cuenta Apple Developer (USD 99/año):

1. Crear el App ID `org.duckdns.spcrm.twa` en developer.apple.com (o cambiarlo por uno
   propio, p. ej. `com.leonsgroup.crm`).
2. Generar certificado de distribución + provisioning profile.
3. Guardar en GitHub Secrets: `BUILD_CERTIFICATE_BASE64`, `P12_PASSWORD`,
   `PROVISIONING_PROFILE_BASE64`, `KEYCHAIN_PASSWORD`, `APPLE_TEAM_ID`.
4. Ampliar `ios-build.yml`: importar el certificado, firmar con `-allowProvisioningUpdates`,
   `xcodebuild -exportArchive` para producir el `.ipa` y subirlo con `xcrun altool` o
   `fastlane pilot`.

## Push (APNs) — PENDIENTE

Requiere una APNs Auth Key (.p8) subida a Firebase (Cloud Messaging → Apple app config) y
la app iOS registrada en el mismo proyecto Firebase que ya usa Android. El backend
(`src/services/push.js`) ya envía por FCM; en cuanto la app iOS registre su token, el push
funciona sin cambios de servidor.
