# 🍎 Apple Design System — Brief para Redesign Completo

> **Objetivo:** Rediseñar TODAS las páginas UI del CRM con la filosofía de diseño de Apple: claridad, deferencia, profundidad, coherencia y premium.

---

## 🎯 Filosofía (The Apple Way)

| Principio | Aplicación en el CRM |
|-----------|---------------------|
| **Clarity** | UI sin ruido. Cada elemento tiene un propósito. Tipografía grande y legible. Máxima jerarquía visual. |
| **Deference** | El contenido es el rey. La UI se desvanece para dejar brillar los datos y las conversaciones. |
| **Depth** | Capas, parallax suave, transiciones nativas. La interfaz tiene física real. |
| **Coherence** | Mismo sistema visual en login, dashboard, inbox, equipo. Un solo ecosistema. |
| **Premium** | Materiales nobles, animaciones fluidas, atención al detalle. Sensación de hardware Apple corriendo el software. |

---

## 🎨 Paleta (SP Inmobiliaria + Apple)

```
Fondo principal:    #040406 (negro más profundo que el space black)
Fondo elevado:      #0A0A0E (cards, modals, sidebars)
Fondo terciario:    #121218 (elementos sobre elevados)
Separadores:        rgba(255,255,255,0.04) (casi invisibles)
Texto primario:     #F5F0E8 (marfil cálido, no blanco puro)
Texto secundario:   rgba(245,240,232,0.45)
Texto terciario:    rgba(245,240,232,0.22)

Acento Oro:         #D4AF37 (brillo metálico, usado como el botón de encendido del iPhone)
Acento Verde:       #4E7B46 (como el verde de la batería)
Acento Rojo:        #FF453A (como el rojo de Apple, solo para alerts)

Gradientes permitidos:
  - Gold:  #D4AF37 → #A8872B → #8B7520  (solo en botones primarios)
  - Verde: #4E7B46 → #3D6B37  (solo en badges/unread)
```

## 🔤 Tipografía

| Uso | Fuente | Tamaño | Peso |
|-----|--------|--------|------|
| Branding/Headers | Cinzel | 18px+ | 600 |
| Body UI | Inter | 13-15px | 400/500 |
| Números/Datos | Inter (tabular-nums) | según contexto | 500/600 |
| Código | SF Mono (o JetBrains Mono) | 13px | 400 |

**Regla Apple:** El texto debe ser legible sin esfuerzo. Mínimo 13px en UI. Jerarquía clara por peso, no por color.

---

## 🧱 Componentes (Sistema Unificado)

### 1. Top Navigation Bar
- Fondo: `#0A0A0E` con blur(40px) si es posible
- Sin bordes — usar sombra sutil inferior (1px, opacidad 0.08)
- Altura: 52px exactos
- Brand dorado con gradiente metálico en el texto
- Sin decoración innecesaria

### 2. Sidebar / Listas
- Items con altura de 60px (Apple HIG: mínimo 44px para touch, pero en desktop 60px da aire)
- Hover: fondo rgba(255,255,255,0.03)
- Active/Selected: fondo rgba(212,175,55,0.06) + borde izquierdo dorado (3px)
- Separadores: ninguno entre items (Apple no usa líneas, usa espacio)
- Avatar: 44x44, border-radius: 50%, sombra de elevación

### 3. Cards (Conversaciones, Leads, Stats)
- Fondo: `#0A0A0E` (un tono más claro que el fondo)
- Border-radius: 12px (Apple usa 10-12px en macOS)
- Sin border — solo sombra de elevación
  - Elevación 1: `0 2px 8px rgba(0,0,0,0.4)`
  - Elevación 2: `0 8px 30px rgba(0,0,0,0.5)`
  - Elevación 3: `0 20px 60px rgba(0,0,0,0.6)`
- Padding interno: 16px (Apple usa multiplos de 4)

### 4. Botones
- **Primario (Gold):** Gradient #D4AF37→#A8872B, border-radius 10px, altura 40px, padding horizontal 20px
  - Hover: brillo sutil (brightness 1.1)
  - Active: escala 0.97
- **Secundario:** Fondo `#121218`, border 1px rgba(255,255,255,0.06), texto gris
  - Hover: border más claro, texto blanco
- **Ghost:** Sin fondo, texto gris
  - Hover: texto blanco

### 5. Input Fields
- Inspirado en iOS: fondo `#121218`, border-radius 10px, sin border visible
- Inner shadow: `inset 0 2px 4px rgba(0,0,0,0.3)`
- Focus: borde dorado tenue (rgba(212,175,55,0.3))
- Placeholder: rgba(255,255,255,0.2)
- Altura: 44px

### 6. Chat Bubbles (Inbox)
- **Entrantes:** Fondo `#16161E` (gris muy oscuro con matiz azul), border-radius 14px (top-left: 6px)
- **Salientes:** Fondo verde oscuro (#1E3322), border-radius 14px (top-right: 6px)
- Sombra: elevación 1
- Gap entre burbujas: 4px (Apple Messages)

### 7. Selectores y Chips
- Fondo `#121218`, border-radius 20px
- Active: fondo gold con opacidad 0.1, texto gold
- Altura: 32px

### 8. Modales / Drawers
- Fondo: `#0A0A0E` con blur si es posible
- Border-radius top: 14px
- Overlay: rgba(0,0,0,0.5)
- Animación: slide up (0.35s cubic-bezier(0.22, 1, 0.36, 1))

### 9. Badges / Etiquetas
- Sin fondo, solo texto con un pequeño dot de color al lado
- O bien: pill con padding 4px 10px, border-radius 20px

### 10. Scrollbar
- Ancho: 3px
- Thumb: rgba(212,175,55,0.15)
- Hover: rgba(212,175,55,0.3)

---

## 🌊 Animaciones (Sistema)

| Acción | Duración | Curva |
|--------|----------|-------|
| Hover | 0.15s | ease |
| Active/Press | 0.1s | ease |
| Transición de página | 0.35s | cubic-bezier(0.22, 1, 0.36, 1) |
| Modal/Drawer | 0.4s | cubic-bezier(0.22, 1, 0.36, 1) |
| Skeleton | shimmer 1.2s | linear |

**Regla:** Todas las animaciones deben sentirse nativas. Nada de rebotes, nada de efectos llamativos. Como iOS.

---

## 📐 Layout por Página

### login.html
- Centro absoluto, minimalista
- Input + botón, sin decoración extra
- Logo SP arriba, sutil
- Fondo: gradient oscuro con leve vignette

### index.html (Dashboard Admin)
- Cards de stats en grid (3-4 columnas)
- Tabla de leads sin bordes, solo filas con hover sutil
- Gráficos: minimalistas, sin ejes visibles, solo líneas finas
- Sidebar colapsable

### inbox.html / vendedor.html
- Split: sidebar (340px) + chat (flex)
- Header con avatar + nombre + indicador de canal
- Sin bordes entre secciones — usar sombras de elevación

### equipo.html
- Grid de tarjetas para vendedores
- Secciones colapsables con header estilo iOS
- Tablas sin bordes

### dashboard.html (externo)
- Full-screen analytics
- Gráficos grandes y aireados
- Sin sidebar, solo topbar

---

## 🚫 Anti-patrones (NO hacer)

| ❌ No | ✅ En su lugar |
|-------|---------------|
| Bordes visibles o coloreados | Sombras de elevación |
| Líneas divisorias entre items | Espacio (margin/padding) |
| Efectos glass excesivos | Un solo panel con blur sutil |
| Múltiples colores llamativos | Un solo acento (oro) |
| Sombras de colores | Sombras negras con opacidad |
| Padding irregular | Múltiplos de 4 (4, 8, 12, 16, 20, 24) |
| Iconos emocionales | Iconos line (SF Symbols style) |
| Hover con scale | Hover con brightness/opacidad |
| Más de 3 fuentes | Solo Cinzel + Inter |

---

## 📂 Archivos a Rediseñar

| Archivo | Prioridad | Descripción |
|---------|-----------|-------------|
| `public/login.html` | Alta | Login page |
| `public/index.html` | Alta | Admin dashboard |
| `public/inbox.html` | Alta | Chat panel multicanal |
| `public/vendedor.html` | Media | Seller panel (legacy) |
| `public/equipo.html` | Alta | Team management + config |
| `public/dashboard.html` | Media | External analytics |

---

## 🧪 Cómo verificar que quedó Apple-like

1. **Aprieta los ojos** — ¿ves información o ves decoración? Si ves decoración, sobra.
2. **¿Hay bordes?** — Si hay bordes visibles, reemplázalos por sombras o espacio.
3. **Modo oscuro nativo** — Todo debe funcionar con `prefers-color-scheme: dark`.
4. **Jerarquía** — Lo más importante debe ser lo más grande y con más peso.
5. **Consistencia** — Mismo border-radius en todos los componentes similares.
6. **Toque** — Los botones deben sentirse físicos al presionar (escala 0.97).

---

> **Próximo paso:** Entregar este brief a Claude con el mensaje:
> "Rediseña todas las páginas UI del proyecto siguiendo EXACTAMENTE el sistema visual de APPLE_DESIGN_BRIEF.md. Hazlo de una sola pasada, todas las páginas, sin preguntar. Usa los colores SP, la tipografía Cinzel+Inter, y la filosofía Apple de claridad, deferencia y profundidad."
