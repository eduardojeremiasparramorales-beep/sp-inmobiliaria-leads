# Changelog — SP OS

Formato basado en [Keep a Changelog](https://keepachangelog.com/es/). Fechas en formato AAAA-MM-DD.

---

## [1.1.0] — 2026-07-03

Primer gran salto de producto: nace **SP OS**, el Sistema Operativo de Ventas sobre WhatsApp, con un Design System unificado y un workspace de 3 zonas. El backend (webhook de WhatsApp, inbox, reportes, workflows) no cambió; toda la evolución es de experiencia y organización.

### Añadido
- **Design System SP OS** (`public/os/sp-os.css`): tokens de color/espaciado/tipografía, y biblioteca de componentes (botones, cards, métricas, tablas, kanban, timeline, chips, inputs, avatares, toasts, AI dock).
- **Shell reutilizable** (`public/os/sp-shell.js`): sidebar + workspace + panel contextual, navegación única, guard de sesión, helper de API con fallback demo, Copiloto dock.
- **Pantallas nuevas** (cableadas a datos reales cuando existen):
  - Dashboard (centro de control)
  - Inbox omnicanal (3 paneles)
  - CRM · Leads (tarjetas inteligentes + ficha 360°)
  - Pipeline (Kanban con arrastrar y soltar)
  - Analytics (embudo, donut, actividad por hora, tiempos de respuesta)
  - Equipo (rendimiento de asesores)
  - Integraciones (estado real de canales)
  - Configuración de WhatsApp
  - Facturación & Suscripción (SaaS)
  - Marketplace (verticales: SP Inmobiliaria, Barber, Commerce, Health…)
  - Automatizaciones (flujos + vista de nodos)
  - Calendario (agenda semanal)
  - Design System (styleguide vivo y navegable)
- **`index.html`**: enrutador de entrada que envía a cada rol a su lugar (admin → SP OS, vendedor → panel, sin sesión → login).
- **Documento maestro** `SP_OS_MASTERPLAN.md`: visión, arquitectura por capas, inventario de pantallas y patrones globales.

### Cambiado
- El admin entra directo a **SP OS** (`/os/dashboard.html`) al iniciar sesión.
- **Oro de marca unificado** a `#C8A45A` (Oro Ejecutivo) en todo el producto; antes las páginas legacy usaban `#D4AF37`.

### Corregido
- **Panel del vendedor**: eliminada la barra de estado falsa (reloj 9:41) y el splash de carga que causaban un bug visual en Android; ajuste de altura a `100dvh`.
- **login / equipo**: misma limpieza de la barra de estado falsa para mantener la armonía.
- **Bug latente de CSS**: variables de marca usadas pero nunca definidas (`--oro`, `--gris`, `--negro`, `--marfil`) que dejaban textos sin color — ahora definidas.
- Envío de mensajes más robusto en Android (headers y credenciales).

### Eliminado
- Código muerto de fases descartadas: `services/integrations/*`, `api/v2/advanced-features.js`, servicios de scoring/escalation/timeline/notas/automation y su migración (requerían paquetes npm no instalados; nada los importaba).
- Páginas de admin viejas (`index.html` de dashboard, `dashboard.html`, `inbox.html`) reemplazadas por SP OS.
- Documentación obsoleta (briefs y guías de fases/Railway descartados).

---

## [1.0.0]

- CRM base: webhook WhatsApp Cloud API, distribución round-robin, panel del vendedor, gestión de equipo, reportes, inbox omnicanal (backend), workflows.
