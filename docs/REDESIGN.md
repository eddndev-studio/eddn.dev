# eddn.dev — Propuesta de rediseño (sistema Warp)

> Referencia de sistema: `DESIGN.md` (Warp). Este documento adapta ese sistema a eddn.dev
> y especifica el nuevo motor generativo del hero. Estado actual auditado en jun 2026:
> `src/components/pages/LandingPage.astro`, `src/lib/{GameOfLife,NetworkGraph,ParticleAttractor}.ts`,
> `src/utils/visuals.ts`, `src/layouts/Layout.astro`, `src/styles/global.css`, `src/components/Header.astro`.

---

## 0. Tesis

**eddn.dev es un instrumento, no un folleto.** El sitio se presenta como la terminal de
Eduardo: todo lo decorativo es *cómputo real visible* (el hero corre algoritmos de verdad,
la telemetría son datos de verdad), y todo lo textual es tipografía silenciosa sobre un
lienzo charcoal cálido.

La regla que resuelve la tensión Warp ↔ violeta de marca:

> **El color solo lo emite la máquina.**
> El violeta `#8b5cf6` desaparece de botones, links, hovers y títulos. Queda reservado
> exclusivamente para los píxeles que representan cómputo: el framebuffer del hero, el
> heatmap de contribuciones, el cursor parpadeante, el LED de página activa, la sintaxis
> de código. Todo lo demás habla en off-white/tintas cálidas (sistema Warp puro).

Esto hace dos cosas a la vez: respeta la disciplina sin-acento de Warp, y hace que el
violeta —al volverse escaso— pegue 10× más fuerte donde sí aparece. El ojo aprende la
semántica: *violeta = algo está corriendo*.

---

## 1. Sistema visual (adaptación Warp → eddn.dev)

### 1.1 Color

Modo oscuro (primario):

| Token | Valor | Uso |
|---|---|---|
| `canvas` | `#2b2622` | Fondo de página (charcoal cálido — NO negro puro; hoy el dark es `#010208`, frío) |
| `canvas-soft` | `#383330` | Cards, chrome del framebuffer, tiles |
| `hairline` | `#3f3a36` | Todos los bordes 1px (reemplaza `border-y-2` negros del ledger) |
| `ink` | `#f7f5f0` | Texto por defecto Y fill del botón primario |
| `body` / `mute` | `#c9c0ad` / `#aea69c` | Texto secundario / terciario |
| `machine` | `#8b5cf6` | **Solo cómputo**: canvas hero, heatmap, cursor, LEDs, syntax |
| `machine-dim` | `#8b5cf6` 25–40% | Estados fríos del framebuffer, celdas viejas |

Modo claro (secundario, "papel"): inversión cálida — `canvas: #f7f5f0`, `canvas-soft: #efece4`,
`ink: #2b2622`, hairline `#e6e1d6`. El violeta-máquina se mantiene idéntico en ambos modos
(es luz emitida, no tinta). Se elimina el `brand-50` lavanda como fondo del body.

Eliminar: los blobs ambientales de `Layout.astro` (divs `blur-[120px]` — caros en GPU y
ajenos al sistema; Warp es banda única sin atmósfera).

### 1.2 Tipografía

| Rol | Fuente | Notas |
|---|---|---|
| Display + body | **Inter** (ya self-hosted) | Hero a **weight 400, tracking −1.6px** — hoy es `font-black tracking-tighter`; se invierte la voz: confianza silenciosa, no billboard |
| Técnico | **DM Mono** (self-host woff2) | Readouts, numerales del ledger, framebuffer, `0X //` del nav, tablas |
| Editorial | **Instrument Serif** itálica | UNA palabra/frase por página máximo — el momento "journal" del hero y citas en posts |

Jerarquía: display-xl 64/400/−1.6px · display-lg 48/400/−1.2px · body 16/1.5. Los labels
mono-caps actuales (`text-xs tracking-widest uppercase`) ya son correctos — solo migran a DM Mono.

### 1.3 Forma y elevación

- Radios **3–4px** en todo (botones, cards, inputs). Mueren los `rounded-full` de los CTAs
  actuales. Solo los icon-buttons circulares (search/theme) conservan `rounded-full`.
- Elevación = contraste de superficie + hairline. **Cero drop-shadows** (hoy:
  `shadow-lg shadow-brand-500/20` en el CTA — fuera).
- Botón primario: fill `ink` off-white, texto oscuro, 3px. Secundario: ghost.
- El patrón "card-mockup" de Warp (chrome de terminal con title bar) se vuelve el
  contenedor canónico de todo lo computacional: hero, heatmap, snippets.

---

## 2. El hero — motor "FRAMEBUFFER"

### 2.1 Diagnóstico del actual

- Tres visuales 2D elegidos con `Math.random()` por carga (`visuals.ts`) → identidad
  diluida; la primera visita puede tocar el más débil (NetworkGraph = estética
  particles.js 2015).
- Canvas como "blob decorativo a la derecha" con máscara radial — el layout es SaaS default.
- Sin `devicePixelRatio` → borroso en pantallas retina (los 3).
- El canvas ignora `prefers-reduced-motion` (el typewriter sí lo respeta).
- RAF sigue corriendo con el hero fuera de viewport.
- `resize()` re-siembra todo el grid sin debounce (en móvil la URL bar dispara resize
  constantemente → el GoL se "reinicia" al hacer scroll).
- `mousemove` en `window`: GameOfLife mapea coordenadas de toda la página al grid con
  módulo → revive celdas en posiciones envueltas aunque el cursor esté lejos del canvas.

### 2.2 Concepto nuevo

**Un solo motor, tres programas.** El hero deja de ser un blob y se convierte en una
ventana de terminal (card-mockup Warp) corriendo una simulación real, renderizada como
**glifos DM Mono** — no píxeles, sino caracteres, como corresponde a una terminal.

```
┌─ eddn — fluid.sim ── [ SEED 20260612 · PROG 01/03 · GEN 0421 · 60FPS ] ─┐
│   ` . : - = + * # % @   ←  rampa de densidad en glifos                  │
│   color: mute → machine-dim → machine según energía de la celda        │
└──────────────────────────────────────────────────────────────[ ▸ NEXT ]─┘
```

Decisiones estructurales:

1. **Layout hero**: split Warp 2 columnas — izquierda texto (display-xl 400 + una palabra
   en Instrument Serif itálica + prompt line), derecha la ventana del simulador. En la
   transición entre ambas, las celdas del framebuffer **se fugan del marco**: glifos a
   baja alfa derraman hacia el fondo de la página (mismo grid, sin chrome), de modo que
   la simulación se siente más grande que su ventana. En móvil la ventana pasa abajo del
   texto a ancho completo, ratio 3:2.
2. **Determinismo con identidad**: PRNG sembrado con la fecha (mulberry32 sobre
   `YYYYMMDD`). El hero de hoy es el mismo para todos los visitantes — "el build de hoy" —
   y el readout `[ SEED 20260612 ]` lo declara. Recargar no cambia nada; volver mañana, sí.
3. **El programa es contenido**: chip `[ ▸ NEXT ]` o tecla `Tab` cicla PROG 01→02→03 con
   un wipe de scanline. La elección se persiste en `localStorage`. El visitante juega con
   el hero: eso es lo que un jurado de awwwards recuerda.
4. **El prompt line** (status actual con typewriter) se asciende a línea de shell real:
   `eddn@dev:~$ status` → tipea → imprime `[ DISPONIBLE PARA PROYECTOS ]` con cursor
   parpadeante violeta. Ya existe la mitad de esto; solo se re-encuadra.

### 2.3 Arquitectura: `CellGrid` (renderer compartido)

Un solo renderer; los programas solo escriben un campo escalar. Así los tres programas
tienen exactamente el mismo "look" (la identidad vive en el renderer, la variedad en la física).

```ts
// src/lib/hero/CellGrid.ts
// Framebuffer de caracteres: cada celda tiene density [0..1] y age.
// El renderer mapea density → glifo de RAMP y color de la rampa térmica.
const RAMP = " ·:-=+*#%@";           // 10 niveles, espacio = celda muerta
const CELL = 14;                      // px por celda a dpr 1 (~glifo DM Mono 13px)

class CellGrid {
  // - resize con dpr = Math.min(devicePixelRatio, 2), debounced 200ms,
  //   PRESERVANDO el estado (copia el campo viejo re-muestreado, no re-seed)
  // - render(): un solo pass; fillText por celda visible.
  //   Optimización: pre-renderizar los 10 glifos × 8 colores en un atlas
  //   offscreen y usar drawImage (fillText por frame es lento a >2k celdas)
  // - color(density, age): lerp mute → machine-dim → machine; las celdas
  //   recién nacidas destellan ink y decaen a violeta (rampa de 300ms)
  // - dirty-rect opcional: solo redibujar celdas que cambiaron
}
```

Contrato de programa:

```ts
interface Program {
  name: string;                            // "fluid.sim", "life.run", "field.flow"
  seed(grid: Field, rng: PRNG): void;
  step(grid: Field, dt: number, pointer: Pointer): void;  // escribe density
  pointerDown?(p: Pointer): void;
}
```

### 2.4 PROG 01 — `fluid.sim` (fluido estable de Jos Stam) — **el programa insignia**

Navier-Stokes incompresible en grid grosero. A resolución de caracteres (~96×54) el
solver CPU es trivial y el resultado es hipnótico: humo violeta que se riza con vórtices
reales, renderizado en ASCII.

- **Solver**: advección semi-Lagrangiana + difusión (Gauss-Seidel, 8 iteraciones) +
  proyección para mantener el campo sin divergencia. ~50 líneas. A 96×54 corre en <1ms/frame.
- **Densidad** = tinta ("dye") que el campo transporta; eso es lo que ve el renderer.
- **Fuentes en reposo**: 2–3 emisores colocados por el PRNG del día soplan tinta con
  dirección que rota lentamente (ruido 1D sobre t) → el hero nunca está muerto aunque
  nadie lo toque.
- **Puntero**: la velocidad del cursor inyecta velocidad + tinta en su celda
  (`v += pointerΔ × k`). Arrastrar = remover el humo. En touch, el drag hace lo mismo.
- **Click**: pulso radial de velocidad (explosión suave).
- Por qué impacta: nadie espera ver mecánica de fluidos real corriendo en glifos de
  terminal; es la pieza que se comparte en redes.

### 2.5 PROG 02 — `life.run` (Game of Life, rehecho)

Conway es identitario para un blog de CS — se queda, pero rehecho. El actual estroboscopea
porque simula a 60Hz y dibuja celdas binarias planas.

- **Reloj desacoplado**: simulación a 8–10 generaciones/s; render a 60fps interpolando
  alfa (nacimientos hacen fade-in 120ms, muertes dejan **ember** que decae 600ms por la
  rampa violeta→mute). El resultado respira en lugar de parpadear.
- **Edad como color**: celda recién nacida = destello `ink`; estable = `machine`;
  vieja = `machine-dim`. Las estructuras estables (bloques, colmenas) se "enfrían" y los
  gliders se ven calientes — el ojo distingue lo vivo de lo estático.
- **Seed curado, no ruido**: R-pentomino al centro (caos garantizado por ~1000
  generaciones) + 2 Gosper glider guns en tercios áureos orientados hacia adentro +
  10% ruido de fondo. Todo posicionado por el PRNG del día.
- **Puntero como pluma**: en lugar de revivir celdas random, el cursor estampa un glider
  cada 120ms de movimiento, orientado hacia el centro del grid. Click = pulsar (13×13).
- **Anti-estancamiento**: si población < umbral o el hash del grid se repite (ciclo
  detectado), inyectar un LWSS desde un borde.
- Fix del bug actual: coordenadas de puntero clampeadas al rect del canvas, no envueltas
  con módulo desde toda la página.

### 2.6 PROG 03 — `field.flow` (campo de curl noise)

Reemplaza al NetworkGraph (que se elimina). Partículas advectadas por el **curl de un
ruido simplex** — campo sin divergencia, así que las trayectorias son ríos orgánicos que
nunca se aglomeran ni colapsan.

- `v = curl(ψ)` con `ψ = simplex3(x·s, y·s, t·0.08)`; curl numérico con diferencias
  centrales. ~1500 partículas.
- Las partículas no se dibujan: **depositan densidad** en las celdas que cruzan (con
  decaimiento global 0.96/frame) → estelas de glifos que se encienden y apagan, mismo
  lenguaje visual que los otros dos programas.
- Velocidad de partícula → posición en la rampa de color (lento = mute, rápido = machine).
- **Puntero**: vórtice local sumado al campo (kernel angular con falloff gaussiano) — el
  cursor "agita" el río. Scroll velocity multiplica `t` → al scrollear rápido el campo
  se acelera (guiño al ticker reactivo de eddndev.com).

### 2.7 Presupuesto de rendimiento y accesibilidad

- dpr cap 2; grid ~96×54 (desktop) / ~48×64 (móvil); meta <3ms de JS por frame.
- `IntersectionObserver`: `stop()` cuando el hero sale de viewport; `visibilitychange`
  ya lo cubre RAF, pero los emisores usan dt real para no "saltar" al volver.
- `prefers-reduced-motion`: se siembra, se simulan 60 steps en silencio y se renderiza
  **un frame estático** (el hero queda bello pero quieto); el chip NEXT sigue funcionando
  (cambia el frame estático).
- Sin canvas (no-JS / crawler): el slot muestra un `<pre>` con un frame pre-bakeado del
  fluido en ASCII real — el hero degrada a arte ASCII literal. CLS = 0 (la ventana tiene
  aspect-ratio fijo).
- Init diferido: `requestIdleCallback` tras `font-display` de DM Mono (el texto del hero
  pinta primero; LCP es el headline, no el canvas).

---

## 3. Resto del home

### 3.1 Header
- Banda canvas quieta (sistema Warp), hairline inferior al scrollear (ya existe la lógica).
- Índices `0X //` migran a DM Mono. **LED violeta** 4px junto al item de la página activa
  (`aria-current="page"`) — patrón heredado del dock de eddndev.com; el violeta señala
  "estás aquí" como cómputo, no como decoración.
- El toggle de tema con máscara circular (View Transition) ya es excelente — se queda.

### 3.2 Ledger (índice editorial)
- Estructura asimétrica 2×2+1+1 se queda (es buena). Cambia la piel: hairlines en lugar
  de `border-y-2` negros y fondo `gap-px`; numerales fantasma 01/02/03 en DM Mono.
- **Hover = polarity flip** (ex-pricing-tier-featured): la card invierte a fill `ink`
  off-white con texto oscuro — más violento y más Warp que el flood violeta actual
  (que además rompería la regla "el color solo lo emite la máquina").
- La fecha y el label suben a readout: `[ POST · 2026-06-08 ]` con scramble corto (solo
  en elementos mono — nunca en títulos).
- Los `transition:name` (morfos título/fecha hacia el post) se conservan: es de lo mejor
  que ya tiene el sitio.

### 3.3 Telemetría (instrument cluster)
- El heatmap de GitHub se convierte en la pieza central: vive dentro de un card-mockup
  con title bar `eddn — telemetry — last 365d`, rampa 100% violeta (es la única sección
  además del hero donde el color canta — porque son datos).
- Reveal: las 52 columnas entran con stagger de 12ms + un barrido de scanline; el total
  anual hace count-up en DM Mono.
- GitHubLanguages: barras con hairlines, violeta solo en el lenguaje #1.
- LeetCode: tabla con chrome `ex-data-table-cell` (header mono-caps).

### 3.4 Footer + global
- Footer Warp: texto `body` sobre canvas, hairline superior, `© 2026 · Mexico City · [ SEED ]` —
  el seed del día se repite como firma.
- Borrar CSS muerto de Lenis en `global.css` (Lenis no está instalado ni en deps). El
  scroll nativo se queda: en un sitio de lectura, el smooth-scroll secuestrado resta más
  de lo que suma; la "vida" la ponen el framebuffer y las micro-interacciones.
- Las entradas `io-reveal`/stagger actuales se conservan con curva
  `cubic-bezier(0.32,0.72,0,1)` y distancias menores (16px) — confianza silenciosa.

---

## 4. Micro-interacciones (inventario)

| Dónde | Interacción |
|---|---|
| Hero framebuffer | drag = inyectar tinta/velocidad · click = pulso · `Tab`/chip = ciclar programa · scroll = acelera el campo (PROG 03) |
| Prompt line | shell typewriter `eddn@dev:~$ status` + cursor violeta |
| Readouts mono | scramble/decode 300ms al entrar en viewport (solo mono, nunca display) |
| Ledger cards | polarity flip + flecha en chip circular que traduce 2px |
| Nav | LED violeta en página activa · hover hairline-underline 1px |
| Heatmap | scanline + stagger por columna + count-up |
| Theme toggle | máscara circular existente (se queda) |
| 404 | el framebuffer corriendo `life.run` con un patrón que deletrea "404" en celdas |

---

## 5. Deuda encontrada (independiente del rediseño)

1. Sin `devicePixelRatio` en los 3 visuales → canvas borroso en retina.
2. Hero canvas no respeta `prefers-reduced-motion`.
3. `resize()` de GameOfLife re-siembra sin debounce (URL bar móvil = reinicios constantes).
4. Bug de coordenadas: `mousemove` en window + módulo envuelve posiciones de toda la
   página dentro del grid del GoL.
5. RAF activo con hero fuera de viewport.
6. CSS de Lenis muerto en `global.css` (no hay dependencia ni init).
7. Blobs `blur-[120px]` re-generados por página — costo GPU notable en móvil.

---

## 6. Plan por fases

| Fase | Alcance | Tamaño |
|---|---|---|
| **A — Sistema** | Tokens Warp en `global.css` (dark cálido + light papel), DM Mono + Instrument Serif self-host, radios/hairlines/botones, matar blobs y CSS Lenis | 1 sesión |
| **B — Motor hero** | `CellGrid` + PROG 02 (`life.run` rehecho) como primer programa; ventana card-mockup, seed diario, readouts, prompt line | 1–2 sesiones |
| **C — Programas** | PROG 01 (`fluid.sim`) y PROG 03 (`field.flow`), switcher, fuga de glifos fuera del marco, reduced-motion frame estático, `<pre>` fallback | 1–2 sesiones |
| **D — Home** | Ledger re-piel + polarity flip, telemetría instrument cluster, footer, nav LED | 1 sesión |
| **E — Interior** | Posts/papers/leetcode al sistema (chrome de código DM Mono, serif editorial en citas), 404 con life.run | 1 sesión |

Criterio de éxito por fase: 60fps en móvil medio, CLS 0, LCP = headline (<1.5s),
hero JS < 12KB gz (los tres programas + renderer caben de sobra).
