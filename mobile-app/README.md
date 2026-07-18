# SP OS — App de vendedores (Android)

## 🚀 Publicar una actualización de la app (auto-update in-app)

Desde la v1.2.0 (versionCode 3) la app se actualiza SOLA: al abrirla compara su
versión con `/api/app/version` y, si hay una nueva, muestra la pantalla de
actualización (descarga con progreso → instalador encima, sin desinstalar).

**Proceso de release (cada vez que cambies algo NATIVO):**
```powershell
# 1. Subir versión en android/app/build.gradle:  versionCode +1, versionName x.y.z
# 2. Compilar release FIRMADO (nunca repartir debug — firma distinta):
cd mobile-app; npx cap sync android; cd android; .\gradlew assembleRelease
# 3. Publicar en el canal de actualización:
cd ..\..; npm run release:apk -- "• Cambio 1`n• Cambio 2"     # --obligatoria si aplica
# 4. Commit + push + deploy en la VM:
git add public/descargas mobile-app/android/app/build.gradle
git commit -m "release: app vX.Y.Z"; git push
# (VM) git fetch origin master && git reset --hard origin/master && docker compose up -d --build
# 5. Los teléfonos ven la actualización al abrir la app. Listo.
```

⚠️ **Reglas de oro:** (1) SIEMPRE el APK release firmado con `release.keystore` —
si pierdes el keystore, el auto-update muere (habría que desinstalar en cada
teléfono). (2) La PRIMERA instalación de la v3 es manual; si el teléfono tenía el
APK debug, esa única vez toca desinstalar (firma distinta). Desde ahí, todo OTA.
Los cambios SOLO de web (public/, src/) no necesitan release de APK — llegan con
el deploy normal.

Envuelve el panel del vendedor (`/m/`) del CRM en una app nativa Android con
[Capacitor](https://capacitorjs.com). **No es una reescritura**: la app carga el
mismo sitio web en producción (`https://spcrm.duckdns.org`) dentro de un WebView
nativo, y suma capacidades reales del teléfono (cámara, ubicación, push FCM) que el
código en `public/m/index.html` ya sabe usar cuando detecta que corre empaquetado
(`window.Capacitor?.isNativePlatform()`).

**Consecuencia importante:** el contenido web se actualiza solo con cada deploy del
servidor — no hace falta recompilar ni resubir la app a Play Store para cambios de
UI, textos, o lógica del CRM. Solo hay que recompilar cuando se agregan/cambian
capacidades nativas (nuevo permiso, nuevo plugin) o la identidad visual (icono/splash).

## Qué ya está hecho (en este repo)

- Proyecto Capacitor completo en `mobile-app/android/` — es un proyecto Gradle real,
  generado por el CLI oficial (`npx cap add android`), no escrito a mano.
- Plugins nativos instalados y sincronizados: cámara, geolocalización, push (FCM),
  compartir, splash screen, status bar, preferences.
- Permisos declarados en `AndroidManifest.xml` (cámara, ubicación, notificaciones).
- Iconos y splash screen generados desde la identidad SP (negro `#0A0A0A` + dorado)
  en las 6 densidades de Android (`npx capacitor-assets generate`).
- `capacitor.config.json` apuntando a `https://spcrm.duckdns.org` en modo
  `server.url` (la app es un shell nativo sobre el sitio real, como la app de
  Twitter/X o Instagram).
- Config de firma de release ya cableada en `android/app/build.gradle` (lee
  `android/app/key.properties`, que tú generas — ver abajo).
- Backend: `src/services/push.js` ya envía por FCM cuando el vendedor tiene la app
  nativa instalada (canal separado de Web Push, que es lo que usa el navegador).

## Lo que necesitas hacer tú (no lo puedo hacer yo)

Esta sesión no tiene Android SDK, Java ni Gradle instalados — no pude compilar ni
firmar un APK/AAB real aquí. Estos pasos requieren tu máquina y tus propias cuentas:

### 1. Instalar Android Studio
Descarga desde https://developer.android.com/studio — incluye el SDK y el JDK
necesarios. Ábrelo una vez para que termine de instalar los componentes base.

### 2. Abrir el proyecto
```bash
cd mobile-app
npm install
npx cap sync android
npx cap open android    # abre Android Studio con el proyecto
```

### 3. Probar en un emulador o teléfono conectado
Con Android Studio abierto, usa el botón ▶ Run, o desde terminal:
```bash
npx cap run android
```
Esto instala y abre la app apuntando a `https://spcrm.duckdns.org` (producción). Si
quieres probar contra tu servidor local en desarrollo, cambia temporalmente
`server.url` en `capacitor.config.json` a `http://TU_IP_LOCAL:3000` (no `localhost`,
el emulador/teléfono necesitan la IP real de tu máquina en la red), corre
`npx cap sync android` y vuelve a compilar. **No dejes esto así para producción.**

### 4. Generar tu keystore de firma (una sola vez, guárdalo para siempre)
```bash
keytool -genkeypair -v -keystore release.keystore -alias spcrm -keyalg RSA -keysize 2048 -validity 10000
```
Ejecútalo dentro de `mobile-app/android/` (o ajusta la ruta en `key.properties`).
Te pedirá una contraseña del keystore y una del alias — **anótalas en un lugar
seguro** (un gestor de contraseñas). Si pierdes este archivo o la contraseña, **no
podrás publicar NINGUNA actualización futura de esta app** — tendrías que publicar
una app nueva desde cero, perdiendo reseñas e instalaciones.

Copia la plantilla y complétala:
```bash
cp android/app/key.properties.example android/app/key.properties
```
Edita `android/app/key.properties` con las contraseñas reales. Este archivo (y el
`.keystore`) están en `.gitignore` — nunca deben subirse a git ni compartirse.

### 5. Instalar directamente en los teléfonos — SIN Play Store (recomendado para empezar)

Esto es un APK normal que se instala como cualquier app: **ícono propio, sin barra de
direcciones, sin navegador visible, cero rastro de que es una web por dentro**. La
diferencia con Play Store es solo *cómo llega al teléfono* — aquí lo repartes tú
directamente, sin cuenta de $25, sin revisión de Google, sin política de privacidad
pública obligatoria. Ideal para una app interna de equipo (3 vendedores).

Genera el APK firmado (usa el mismo `key.properties` del paso 4):
```bash
cd android
./gradlew assembleRelease
```
El archivo queda en `android/app/build/outputs/apk/release/app-release.apk`.

Para repartirlo, elige lo que te resulte más simple:
- **Más fácil:** súbelo a `public/` en el servidor (ej. `public/sp-vendedores.apk`) y
  comparte el link `https://spcrm.duckdns.org/sp-vendedores.apk` por WhatsApp — cada
  vendedor lo abre desde el celular y Android ofrece instalarlo.
- O súbelo a Google Drive / Telegram / lo que uses para mandar archivos al equipo.

En el teléfono, al abrir el `.apk` por primera vez Android pedirá activar **"Instalar
apps desconocidas"** para esa fuente (Chrome, Drive, WhatsApp, la que sea) — es el
único paso extra comparado con Play Store, se activa una sola vez.

**Actualizaciones:** cuando cambies algo *nativo* (no el contenido web, eso se
actualiza solo), subes el `versionCode` en `build.gradle`, generas un `.apk` nuevo y
lo vuelves a compartir — cada vendedor lo reinstala encima (misma firma = conserva
datos y sesión).

### 5b. (Opcional, solo si luego publicas en Play Store) Actualizar assetlinks.json
El archivo `public/.well-known/assetlinks.json` (en el proyecto del servidor) tiene
una huella de un intento anterior — hay que reemplazarla por la real de TU keystore:
```bash
keytool -list -v -keystore android/app/release.keystore -alias spcrm
```
Copia el valor `SHA256` que imprime (formato `AA:BB:CC:...`) y reemplaza
`sha256_cert_fingerprints` en `public/.well-known/assetlinks.json`. Esto **no afecta
la instalación directa del paso 5** — solo importa si algún día publicas en Play
Store y quieres que los links del dominio abran la app (Digital Asset Links).

### 6. Configurar Firebase para las notificaciones push nativas
1. Crea un proyecto en https://console.firebase.google.com (gratis).
2. Agrega una app Android con el package `org.duckdns.spcrm.twa`.
3. Descarga `google-services.json` y colócalo en `mobile-app/android/app/`.
4. En Firebase Console → ⚙️ Project Settings → Service Accounts → "Generate new
   private key" — descarga ese segundo JSON (es distinto al anterior).
5. En el `.env` del **servidor** (no de mobile-app), pega el contenido completo de
   ese JSON en una sola línea:
   ```
   FCM_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"..."}
   ```
6. Reinicia el servidor. Sin este paso, la app funciona igual pero no llegan push
   nativos (el vendedor solo ve mensajes al abrir la app).

### 7. (Opcional) Publicar en Play Store más adelante
Si más adelante quieres distribución más amplia (fuera del equipo) o actualizaciones
automáticas sin reenviar el archivo a mano, Play Store usa un `.aab` en vez de `.apk`:

Con Android Studio: **Build → Generate Signed Bundle / APK → Android App Bundle**,
selecciona tu keystore y sigue el asistente. O por terminal:
```bash
cd android
./gradlew bundleRelease
```
El archivo queda en `android/app/build/outputs/bundle/release/app-release.aab`.

### 8. (Opcional) Cuenta de Google Play Console
- Regístrate en https://play.google.com/console (pago único de $25 USD).
- Crea la app, completa la ficha (nombre, descripción, categoría "Negocios").
- Sube capturas de pantalla del panel `/m/` (mínimo 2, formato teléfono).
- **Política de privacidad obligatoria**: necesitas una URL pública con tu política
  de privacidad (qué datos recoge la app — ubicación, cámara, mensajes de clientes).
- Completa el cuestionario de clasificación de contenido y el de seguridad de datos.
- Sube el `.aab` primero a un track de **prueba interna** (Internal testing) antes
  de producción — así puedes instalar y verificar todo sin publicar públicamente.

### Actualizar la app más adelante
- **Cambios de código web** (cualquier página, incluida `/m/`): no requieren nada
  aquí, se ven solos en el próximo deploy del servidor.
- **Cambios nativos** (nuevo permiso, nuevo plugin, cambio de icono): subir
  `versionCode` en `android/app/build.gradle` y volver a generar el instalable —
  `.apk` (paso 5, distribución directa) o `.aab` (paso 7, si usas Play Store).

## Variables de entorno relevantes (servidor)

| Variable | Para qué |
|---|---|
| `FCM_SERVICE_ACCOUNT_JSON` | Enviar push nativo a la app (paso 6) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Push del panel web (ya existían, sin cambios) |
| `BASE_URL` | Debe ser `https://spcrm.duckdns.org` — es lo que carga `capacitor.config.json` |

## Estructura de este directorio

```
mobile-app/
├── capacitor.config.json     ← apunta a producción (server.url)
├── resources/                ← iconos/splash fuente (no editar los generados a mano)
├── www/                      ← placeholder vacío (no se usa, server.url manda)
└── android/                  ← proyecto Gradle real
    ├── app/
    │   ├── build.gradle      ← firma de release ya cableada
    │   ├── key.properties.example
    │   └── src/main/
    │       ├── AndroidManifest.xml   ← permisos cámara/ubicación/push
    │       └── res/                  ← iconos y splash ya generados
    └── ...
```
