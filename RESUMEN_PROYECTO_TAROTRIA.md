# TAROTRIA — Resumen completo del proyecto

> Documento de referencia generado a partir del estado real del código, del
> `Registro de avance` de `PLAN_TECNICO_MVP_ORACULO_IA.md` y del trabajo de
> estabilización realizado después de cerrar ese plan. No es un documento
> aspiracional: cada afirmación aquí corresponde a algo que existe y fue
> verificado en el repositorio, no a una intención.
>
> Última actualización: 2026-09-11.

---

## 1. Qué es TAROTRIA

TAROTRIA es una plataforma SaaS de lecturas con IA (tarot y lectura de
manos) orientada al mercado colombiano, preparada para expandirse a LATAM.
Un usuario se registra, recibe una carta diaria gratuita, puede pedir una
tirada de tarot (3, 5 o 10 cartas) o subir fotos de sus palmas para un
reporte guiado, y paga por créditos (compra única, no suscripción) cuando
se le acaban los del bono de bienvenida — o ve un anuncio recompensado para
desbloquear ciertas cosas gratis (sección 4.1). Toda interpretación la
genera un modelo de OpenAI a partir de un prompt versionado y auditado —
nunca texto prescrito a mano — pero con guardrails explícitos: nunca
diagnostica, nunca garantiza el futuro, y siempre incluye un disclaimer de
entretenimiento. La IA infiere la intención directamente de la pregunta del
usuario, sin pedirle categorizarla primero.

El posicionamiento de marca es "premium, místico, reflexivo" (ver la
identidad visual en la sección 5): un solo tema oscuro azul-medianoche con
acentos dorados, sin selector claro/oscuro.

Modelo de negocio: bono de registro de 10 créditos (alcanza para una
lectura de tarot gratis), publicidad recompensada (sección 4.1) para
desbloquear la carta diaria más allá de los primeros 5 días, lecturas de
tarot y ofertas flash, y dos paquetes de compra única vía Wompi —
`ESENCIAL` (50 créditos, $19.900 COP) y `PREMIUM` (120 créditos, $39.900
COP, marcado como "recomendado" — efecto señuelo de precio). Cada lectura
de tarot/manos consume créditos del servicio consultado (3 cartas: 10,
5 cartas: 18, 10 cartas/Cruz Celta: 35, manos: según el plan).

## 2. Los dos repositorios

| Repo | Rol | Stack |
|---|---|---|
| `TaroTria-api` | Backend (API REST + worker de colas) | NestJS 10, Prisma 7 + PostgreSQL, Redis/BullMQ, TypeScript |
| `TaroTria-web` | Frontend | Next.js 16 (App Router), React 19, Tailwind v4, TanStack Query 5, React Hook Form + Zod |

Son dos repos Git independientes ("hermanos"), sin monorepo ni paquete
compartido — se comunican solo por HTTP/cookies.

### 2.1. Backend (`TaroTria-api`)

- **API** (`src/main.ts` → `dist/main.js`): expone el REST API en
  `http://localhost:3000/api/v1`, con Swagger en `/docs` (deshabilitado en
  `production`).
- **Worker** (`src/worker.ts` → `dist/worker.js`): procesa las colas de
  BullMQ. Es un **proceso separado** que nunca corre junto a la API, para
  poder escalarlos de forma independiente. Ambos comparten `CoreModule`
  (config, logging, acceso a datos) pero cada uno tiene su propio módulo
  raíz (`AppModule` vs `WorkerModule`) — por eso, por ejemplo, el
  `ShareImageProcessor` solo existe en el contexto del worker, no de la API.
- **Base de datos**: PostgreSQL vía Prisma 7 con el driver adapter
  `@prisma/adapter-pg` (Prisma 7 ya no acepta `datasource.url` directo en el
  schema).
- **Colas** (Redis + BullMQ): `diagnostics`, `reading-processing`,
  `image-analysis`, `cleanup`, `share-image` — cada una con su propio
  `@Processor`/`WorkerHost`, reintentos con backoff exponencial, y
  `jobId` determinista para idempotencia (con cuidado: BullMQ prohíbe `:`
  en un `jobId` custom, y un `jobId` reciclado hace que un `add()` sea un
  no-op silencioso — ambas cosas se golpearon y corrigieron durante la
  construcción, ver sección 6).
- **Almacenamiento**: `@aws-sdk/client-s3` con `forcePathStyle: true`,
  compatible sin cambios de código con MinIO en local (`docker-compose.yml`)
  y DigitalOcean Spaces en producción — solo cambian las variables
  `SPACES_*`.
- **IA**: SDK oficial `openai` (`gpt-4o-mini` por defecto), detrás de una
  interfaz `AIProvider` agnóstica de proveedor. Soporta contenido
  multimodal (imágenes como `data:` URI en base64, nunca URL firmada, para
  que funcione igual con MinIO local que con producción).
- **Pagos**: Wompi (pasarela colombiana), detrás de una interfaz
  `PaymentProvider` agnóstica de proveedor, con Web Checkout hospedado
  (firma de integridad SHA-256) y webhooks firmados (HMAC-style,
  verificación recalculando el checksum sobre `signature.properties`).
- **Observabilidad**: `nestjs-pino` (logging estructurado con redacción de
  headers sensibles), Sentry (`@sentry/nestjs`) inicializado pero inactivo
  sin `SENTRY_DSN` real, Helmet, rate limiting global (`@nestjs/throttler`,
  100 req/min/IP) con throttles más estrictos en login/forgot-password/
  webhooks/reintentos.

### 2.2. Frontend (`TaroTria-web`)

Grupos de rutas del App Router:

- `(public)` — landing, `/legal/terminos`, `/legal/privacidad`, `/r/[token]`
  (vista pública de una lectura compartida).
- `(auth)` — `/login`, `/register`, `/forgot-password`, `/reset-password`,
  `/verify-email`.
- `(app)` — `/dashboard` (carta diaria), `/tarot`, `/hands`, `/readings`,
  `/readings/[id]`, `/wallet`, `/wallet/buy`, `/wallet/checkout/[orderId]`,
  `/profile`.
- `(admin)` — `/admin`, `/admin/readings`, `/admin/ai-executions`,
  `/admin/wallet-adjustments`, `/admin/audit-logs`.

Cada grupo protegido usa `proxy.ts` (en Next 16 reemplazó a
`middleware.ts`) para bloquear rutas sin cookie de sesión; la autorización
real por rol la sigue haciendo el backend en cada request. Componentes de
formulario genéricos (`DynamicForm`) arman su validación en tiempo real con
Zod a partir del `formSchema` que devuelve el catálogo — nada de campos de
tarot/manos está hardcodeado en el frontend.

## 3. Modelo de datos (dominios principales)

- **Identidad**: `User`, `Role`/`UserRole`, `RefreshToken` (rotación con
  detección de reuso), `VerificationToken` (verificación de correo y reset
  de contraseña, mismo modelo reutilizado por `purpose`).
- **Catálogo**: `Service`/`ServiceForm` (versionado), `TarotDeck`/
  `TarotCard` (78 cartas, significado derecho e invertido), `TarotSpread`/
  `TarotSpreadPosition`.
- **Motor de lecturas**: `Reading` (estado: `DRAFT → PENDING → PROCESSING →
  COMPLETED/FAILED`, más `REFUNDED`/`CANCELLED`), `ReadingInput`,
  `TarotDraw`, `PalmImage` (estado `UPLOADED → PENDING_REVIEW →
  VALID/INVALID`, retención de 24h configurable).
- **IA**: `Prompt`/`PromptVersion` (inmutable una vez `PUBLISHED`),
  `AIExecution` (auditoría de cada llamada real: tokens, latencia, costo
  estimado en USD, éxito o fallo).
- **Dinero**: `Wallet`/`WalletTransaction` (ledger auditable con
  `idempotencyKey` único), `CreditReservation` (único por `readingId` — es
  lo que garantiza a nivel de base de datos que una lectura nunca reserva
  crédito dos veces), `CreditPackage` (con `isRecommended`, efecto señuelo
  de precio en la pantalla de compra), `Order` (precio congelado al
  crearse), `Payment` (único por `[provider, providerReference]`),
  `WebhookEvent` (único por `[provider, eventId]`, deduplicación de
  entregas).
- **Publicidad recompensada** (ver sección 4.1): `RewardSession`
  (`idempotencyKey` único, expira a los 10 min), `RewardTransaction`
  (1:1 con `RewardSession` vía `rewardSessionId` único — una sesión nunca
  puede otorgar la recompensa dos veces), `RewardProgress` (contador
  "N de M anuncios" por `[userId, rewardType]`, se resetea al consumir el
  desbloqueo).
- **Compartir y crecimiento**: `ShareLink` (el propio UUID es el token
  público — no hasheado, mismo nivel de exposición que `Reading.id`, porque
  el usuario necesita poder ver su enlace de nuevo), `AnalyticsEvent`
  (`type` como string libre, no enum, para no requerir migración al agregar
  tipos de evento futuros).
- **Administración**: `AuditLog` (acción, actor, `targetType`/`targetId`
  genéricos, motivo obligatorio) — cubre ajustes de wallet, publicación de
  servicios/prompts y reintentos administrativos.

## 4. Recorrido de construcción por fases

El proyecto se construyó siguiendo `PLAN_TECNICO_MVP_ORACULO_IA.md`,
historia por historia (`US-XXXX`), cada una con typecheck + lint + tests +
build + verificación manual real (nunca solo mockeada) antes de darse por
terminada. Resumen por fase (el detalle historia por historia vive en la
sección 26 de ese documento):

- **Fase 0 — Fundación**: config validada con Zod (fail-fast), `/health`,
  logging estructurado, Postgres/Redis en Docker, worker como proceso
  separado desde el día uno, ambos repos con README/CI.
- **Fase 1 — Autenticación**: registro/login con Argon2id
  (`@node-rs/argon2`, binarios precompilados — el paquete `argon2` requiere
  compilar nativo y esta máquina no tiene las build tools), JWT de acceso
  (15 min) + refresco (30 días) en cookies `httpOnly`/`SameSite=Lax`,
  rotación de refresh token con detección de reuso (revoca toda la familia
  de sesiones si se reutiliza uno ya revocado), verificación de correo y
  recuperación de contraseña, roles y `RolesGuard`.
- **Fase 2 — Catálogo y carta diaria**: catálogo de servicios con caché
  Redis, mazo de 78 cartas, carta diaria **determinista** por
  `HMAC-SHA256(DAILY_CARD_SECRET, "{userId}:{fechaUTC}")` — la misma
  persona ve la misma carta todo el día, personas distintas ven cartas
  distintas, sin persistir nada (cálculo puro cacheado 24h en Redis).
- **Fase 3 — Motor de tarot**: tirada `TAROT_THREE` (Pasado/Presente/
  Tendencia), `DrawEngineService` con `crypto.randomInt` (nunca
  `Math.random`) sin repetición de cartas, flujo `POST /readings` →
  `PATCH /readings/:id/inputs` → `POST /readings/:id/submit`.
- **Fase 4 — Motor de IA**: interfaz `AIProvider` + `OpenAiProvider`,
  prompts versionados e inmutables una vez publicados, `AiOrchestratorService`
  con reintentos técnicos (nunca por contenido), guardrails de entrada
  (corta antes de llamar a la IA si detecta señales de crisis/autolesión) y
  de salida (filtra diagnósticos fabricados, consejos médicos, garantías de
  futuro), auditoría de cada ejecución en `AIExecution`.
- **Fase 5 — Reading Engine asíncrono**: `submit` nunca espera a la IA —
  encola un job (`PROCESS_TAROT`) y responde en milisegundos; el worker (en
  otro proceso) llama a OpenAI con sus propios reintentos y actualiza el
  estado. El frontend hace polling con `refetchInterval` de TanStack Query
  mientras el estado es `PENDING`/`PROCESSING`.
- **Fase 6 — Lectura de manos**: subida directa a bucket privado (URL
  presignada), validación técnica real (MIME por magic bytes, nunca el
  `Content-Type` declarado; dimensiones; tamaño), validación semántica por
  IA de visión ("¿esto es una palma legible?"), interpretación final
  también por IA de visión con restricciones explícitas (nunca inferir
  identidad/salud/etnia/discapacidad/edad de la imagen), expiración y
  borrado real de imágenes tras 24h con evidencia verificable
  (`PalmImage.deletedAt` + `HeadObjectCommand` confirmando `NotFound` en el
  bucket).
- **Fase 7 — Wallet y créditos**: ledger auditable, reserva atómica de
  créditos (`updateMany({ where: { balance: { gte: amount } } })` — nunca
  `SELECT` + `UPDATE`, es lo único que de verdad evita saldo negativo bajo
  concurrencia real, verificado con dos requests HTTP simultáneas), liberación
  automática si la IA falla definitivamente, `CreditReservation` único por
  lectura para bloquear doble reserva ("doble clic").
- **Fase 8 — Pagos con Wompi**: paquetes de crédito, órdenes con precio
  congelado, checkout hospedado real, webhook idempotente en tres capas
  (`WebhookEvent` único, `Payment.updateMany` condicionado a `PENDING`,
  `WalletTransaction.idempotencyKey` único) — verificado con webhooks HTTP
  reales firmados de verdad, incluyendo entregas duplicadas y fuera de
  orden.
- **Fase 9 — Compartir y crecimiento**: resumen público saneado
  (`/r/[token]`) que nunca expone la pregunta privada ni texto generado por
  IA, imagen 1080×1920 generada en el backend (SVG → PNG con `sharp`),
  atribución de registro por `?ref=`, eventos de analítica
  (`SHARE_CREATED`/`SHARE_VIEWED`/`SHARE_REVOKED`/`SHARE_SIGNUP`).
- **Fase 10 — Administración y lanzamiento**: dashboard admin
  (usuarios, lecturas, ventas, conversión, costo/margen de IA), ajustes
  manuales de wallet con motivo y audit log obligatorios, reintentos
  controlados de lecturas fallidas (usuario y admin), Sentry integrado
  (inactivo sin DSN real), textos legales, E2E de navegador real con
  Playwright, prueba de carga básica, backup/restore de Postgres
  ejercitados de verdad.
- **US-1101 (fuera del backlog original) — Identidad de marca**: aplicación
  completa de `GUIA_DE_MARCA_TAROTRIA.md`, incluyendo **renombrar el
  producto de "Oráculo IA" a "TAROTRIA"** en toda la superficie visible
  (headers, metadata, textos legales, títulos de compartir, Swagger). Tema
  único "místico nocturno" (sin selector claro/oscuro), paleta de 9 colores
  mapeada sobre las variables semánticas de shadcn, tipografía Playfair
  Display (titulares) + Inter (cuerpo), isotipo propio en SVG.

Al cerrar la Fase 10, `LAUNCH_CHECKLIST.md` documentó que **no quedaba
trabajo de código pendiente** para el MVP tal como lo define el plan — los
bloqueadores reales eran credenciales/contenido/infraestructura que solo el
usuario podía proveer (ver sección 7).

### 4.1. Restructuración de modelo de negocio y contextualización de IA (2026-09-11)

Fuera del backlog original del plan técnico: un commit grande (`642dd60`,
54 archivos, ~2600 líneas) que amplía el modelo de negocio y la forma en
que la IA recibe la pregunta del usuario.

- **Publicidad recompensada** (`src/rewards/`): sistema completo con
  `RewardsService`, una interfaz `AdCallbackVerifier` agnóstica de
  proveedor (mismo patrón que `AIProvider`/`PaymentProvider`) y un
  `StubAdCallbackVerifier` de desarrollo. El backend es la única autoridad
  — una recompensa solo existe si un `RewardTransaction` se creó a partir
  de un `RewardSession` validado contra el proveedor real, nunca porque el
  frontend diga "completed: true". Umbrales (`rewards.constants.ts`): carta
  diaria gratis los primeros **5 días** de la cuenta, luego pide **1**
  anuncio por día (`DailyCardService.isWithinFreeWindow` +
  `RewardsService.tryConsumeUnlock`, atómico contra condiciones de
  carrera); desbloquear una lectura de tarot pide **5** anuncios; ofertas
  flash piden **2** anuncios, máximo **1 oferta/día** por usuario. Sesión
  de recompensa expira a los 10 minutos. En el frontend,
  `RewardedAdsProvider` (interfaz) + `StubRewardedAdsProvider` (simulador,
  sin SDK real todavía) detrás de `useWatchRewardedAd`/`useRewardProgress`;
  `DailyCardHero` muestra una tarjeta de "Ver anuncio para desbloquear"
  cuando el backend responde `{ locked: true, requiredAds }`.
- **Tarot de 5 y 10 cartas**: además de `TAROT_THREE`, ahora existen
  `TAROT_FIVE` (Cruz de 5: situación/desafío/pasado/futuro/resultado, 18
  créditos) y `TAROT_TEN` (Cruz Celta clásica de 10 posiciones, 35
  créditos), cada uno con su propio prompt/schema de interpretación
  (`tarot-five-interpretation.schema.ts`, `tarot-ten-interpretation.schema.ts`).
- **IA más contextual**: se quitó el campo "Tema" (select) del formulario
  de tarot — la IA infiere la intención de la consulta directamente del
  texto de la pregunta, reduciendo fricción en vez de obligar a
  categorizar antes de preguntar.
- **Correos transaccionales reales**: `ResendNotificationsProvider`
  (`src/notifications/providers/`) usando el SDK de Resend, seleccionado
  por `NotificationsModule` solo si `RESEND_API_KEY` está definida —
  sin ella, sigue cayendo a `ConsoleNotificationsProvider` (solo log),
  igual que antes. Cubre los dos correos existentes: verificación de
  cuenta y recuperación de contraseña.
- **Cambio de contraseña** (`PATCH /auth/password`, `AuthService.changePassword`):
  exige la contraseña actual, revoca todas las sesiones (incluida la
  actual) tras el cambio, mismo principio de seguridad que el reset por
  correo.
- Otros ajustes menores: eliminación de cuenta y edición de perfil
  ampliadas en el frontend, `useDisplayCurrency` (preferencia COP/USD solo
  de presentación — el cobro real por Wompi siempre es en COP).

## 5. Identidad visual (resumen)

Un solo tema oscuro, sin selector claro/oscuro:

| Token | Uso | Valor |
|---|---|---|
| `--midnight` | Fondo principal | `#11152b` |
| `--ink` | Superficie secundaria | `#24243a` |
| `--amethyst` | Color primario / acentos | `#6c4ab6` |
| `--lavender` | Texto secundario / acentos suaves | `#b9a7f8` |
| `--gold` | Acento de marca (bordes, kickers, CTAs) | `#d9b66f` |
| `--pearl` | Texto principal sobre fondo oscuro | `#f7f3ea` |
| `--success` / `--danger` | Estados | `#3f8f78` / `#b85757` |

Tipografía: **Playfair Display** para titulares (`font-heading`, `h1`/`h2`
globalmente), **Inter** para el resto de la interfaz (`font-sans`). Radio
de borde de 12–20px según el componente. El isotipo (`Logo`) combina un
ícono PNG del brand board oficial con el wordmark "TAROTRIA".

Esta paleta/tipografía es la fuente de verdad para **todo** lo nuevo que se
construya — cuando un documento de diseño externo trae una paleta o
tipografía distinta (como pasó dos veces en la sesión de estabilización,
ver sección 6), el criterio ya validado con el usuario es **adaptarlo a
estos tokens**, no introducir un segundo lenguaje visual dentro de la app.

## 6. Trabajo de estabilización posterior al MVP (esta sesión extendida)

Después de cerrar el plan técnico, se hizo una sesión larga de pruebas
reales end-to-end, endurecimiento y pulido visual. A diferencia del
trabajo de la sección 4, esto no quedó registrado historia por historia en
`PLAN_TECNICO_MVP_ORACULO_IA.md` — queda documentado aquí:

**Arranque y validación general**
- Instalación completa, levantada de Docker (Postgres/Redis/MinIO), API +
  worker + web corriendo simultáneamente, verificados con smoke tests
  reales.
- Se promovió a un usuario real a rol `ADMIN` directamente en base de
  datos (no existe endpoint de auto-promoción, por diseño).

**Rediseño de UI/UX (dos rondas)**
- Fase por fase sobre componentes ya existentes: `GlassCard`, `TarotCard`/
  `TarotDeck` (animaciones con Framer Motion), `DailyCardHero`,
  `WalletWidget`, `PalmScannerGUI`, header/navbar, KPI cards del dashboard,
  formularios, sidebar admin — todo adaptado a la paleta TAROTRIA en vez de
  las paletas genéricas de los documentos de diseño originales (decisión
  explícita del usuario ambas veces).
- Landing pública rehecha para calzar con un mockup específico
  (ilustración real de "El Loco", fondo cósmico real, gradiente
  azul-a-rosa **solo en esa sección**, como excepción deliberada a la
  paleta de marca porque el usuario lo pidió explícitamente para esa pieza).

**Pasarela de pagos Wompi — hallazgo y fix de infraestructura local**
- El WAF/CloudFront de Wompi devuelve `403` genérico si el `redirect-url`
  del checkout contiene literalmente `localhost` o `127.0.0.1` — no es
  rate limiting ni un problema de Referer/HTTPS (se descartaron ambas
  hipótesis con pruebas `curl` sistemáticas). **Fix permanente**: usar
  `lvh.me` (dominio público real que resuelve a `127.0.0.1`) como
  `APP_URL`/`NEXT_PUBLIC_API_URL`, documentado en ambos `.env.example` y en
  el README de la API. Esto a su vez exigió `allowedDevOrigins: ['lvh.me']`
  en `next.config.ts` (si no, Next bloquea el HMR/hidratación del dev
  server para un host no reconocido).
- Se montó y documentó el flujo de túnel (VS Code Ports panel) para que el
  webhook de Wompi pueda llegar a la máquina local desde internet, con sus
  limitaciones (URL efímera, hay que re-pegarla en el panel de Wompi cada
  vez que cambia).
- **Bug real encontrado y corregido**: la sesión (`access_token`, 15 min de
  vida) nunca se refrescaba sola en el frontend — `apiFetch`
  (`lib/api-client.ts`) no tenía ninguna lógica de retry/refresh. Un
  polling de larga duración (esperando la validación de una imagen, o el
  webhook de un pago) que cruzaba esos 15 minutos entraba en un bucle de
  `401` infinito, generando cientos de peticiones fallidas sin
  recuperarse nunca solo. **Fix**: `apiFetch` ahora detecta un `401`,
  llama a `POST /auth/refresh` una sola vez (compartiendo la misma llamada
  entre queries concurrentes) y reintenta la petición original;
  `useReading` corta el polling tras 3 fallos consecutivos en vez de
  insistir para siempre.
- **Pago real de sandbox completado y verificado** de punta a punta
  (tarjeta `4242 4242 4242 4242`), incluyendo el hallazgo de que **el
  webhook de Wompi nunca llegó a la API real** pese a que la firma/formato
  del lado propio estaban correctos (confirmado con reconciliación manual
  contra la API de Transacciones de Wompi).
- **Fix de raíz para no depender del webhook**: Wompi siempre agrega el id
  de la transacción a la `redirect-url` (`?id=...`) al volver del
  checkout. Se agregó `PaymentsService.confirmFromReturn()` (reutiliza la
  misma lógica idempotente de `approvePayment`/`markPaymentTerminal` que ya
  usaba el webhook) y el endpoint `POST /payments/wompi/confirm`; el
  frontend (`checkout-status-view.tsx`) lee ese `?id=` al volver y confirma
  el pago activamente contra la API de Wompi, sin esperar pasivamente al
  webhook. Verificado con un pago real de sandbox: la orden pasó a `PAID`
  y el saldo se acreditó con **cero** `WebhookEvent` registrados para esa
  transacción — se acreditó únicamente por la confirmación activa.

**Otros bugs reales corregidos**
- Texto ilegible en las opciones del `<select>` de tema en `/tarot`
  (el navegador ignora el `bg-transparent` del `<select>` en su propio
  popup nativo; se corrigió con color de fondo/texto explícito por
  `<option>`).
- La cuenta de OpenAI se fondeó y se cargó una API key real — se restauró
  el ciclo completo de lectura con IA real, verificado con una lectura de
  tarot real completada de punta a punta.
- **Procesos zombis**: se encontraron procesos ejecutando el build
  estático compilado (`dist/main`, `dist/worker`) corriendo en paralelo a
  los watchers de desarrollo reales (`nest start --watch`), sirviendo
  código desactualizado sin recompilar. Se limpiaron y se dejaron
  únicamente los watchers de desarrollo, consistentes con el resto de la
  sesión.

**Rediseño de la card de compartir ("Oráculo TAROTRIA")**
- El kicker "ORÁCULO IA" (texto fijo tanto en la página pública como en la
  imagen 1080×1920 generada por el backend) rompía la intención de que la
  lectura se sienta interpretada por una persona, no por una IA — se
  cambió a **"ORÁCULO TAROTRIA"** en ambos lugares.
- A partir de `GUIA_TECNICA_MAESTRA_UI.md` (paleta/tipografía adaptadas a
  los tokens TAROTRIA existentes, no a los hex/fuentes sueltos del
  documento): nuevos componentes `OraculoShareCard`, `HandIllustration`,
  `ShareButton` — una sola fuente de verdad visual usada tanto en la
  vista pública `/r/[token]` como en la vista previa "Así se ve tu post"
  dentro de `/readings/[id]` antes de compartir.
- La imagen 1080×1920 que genera el backend (`share-image.renderer.ts`,
  usada para el `og:image` de redes sociales) se rediseñó para verse igual
  que la card en React: doble borde dorado, cajas de carta con badges de
  palo/orientación, ilustración de mano con resplandor dorado para
  lecturas de manos.
- **Detalle operativo importante**: la imagen se genera **una sola vez**
  cuando se crea un `ShareLink`, no en cada visita — un enlace ya existente
  no se regenera solo aunque el código del renderer cambie. Para ver un
  diseño nuevo en un enlace ya creado hay que revocarlo y volver a
  compartir.

**Auditoría y reinicio completo tras la restructuración de negocio (2026-09-11)**

Al reiniciar todos los servicios después del commit de la sección 4.1,
aparecieron varios problemas reales de entorno/código que habrían
bloqueado a cualquiera que levantara el proyecto desde cero — ninguno
relacionado con el trabajo de rediseño visual, todos del commit de
restructuración de negocio:

- Faltaban **2 migraciones de Prisma** sin aplicar (`isRecommended` en
  `CreditPackage`, tablas de `rewards`) → `db:migrate:deploy`.
- El **cliente de Prisma** no se había regenerado tras el cambio de schema
  (los tipos de `isRecommended` no existían todavía) → `db:generate`.
- Faltaba el paquete **`resend`** instalado en `node_modules` pese a estar
  en `package.json` → `npm install`.
- Faltaba la variable **`REWARDS_STUB_SECRET`** en `.env` (nueva, exigida
  por `env.validation.ts`) — sin ella la API no arrancaba.
- **Bug real**: `ResendNotificationsProvider` reventaba la app al arrancar
  sin `RESEND_API_KEY` — Nest instancia todos los providers de un módulo de
  forma eager (sin importar cuál termine eligiendo la fábrica de
  `NOTIFICATIONS_PROVIDER`), así que su constructor corría igual en
  local/test/CI y el SDK de Resend exige un string no vacío. Corregido con
  un placeholder que nunca se usa para enviar nada real.
- **Bug real de lint**: un `require()` estilo CommonJS prohibido en
  `rewards.service.spec.ts` (se corrigió a un import normal de
  `UnauthorizedException`).
- **Test de integración desactualizado**: `tarot-spreads.integration-spec.ts`
  seguía esperando exactamente 1 tirada/3 posiciones (hardcodeado), sin
  contar las 2 tiradas nuevas — se corrigió para calcular el total
  dinámicamente a partir de `TAROT_SPREADS`.
- **Ruido de control de versiones**: `git status` mostraba 234 archivos
  como "modified" en `oracle-api` sin ningún cambio de contenido real
  (confirmado con `git diff -w`: solo 13 archivos tenían diferencias
  reales). Causa: `core.autocrlf=true` en Windows más archivos escritos
  originalmente con LF. Se agregó `.gitattributes` (`* text=auto eol=lf`)
  y se hizo un commit único de renormalización, dejando `git status` limpio
  de ahí en adelante.

Tras esto: **API 422/422 tests** (329 unitarios + 91 integración + 2 e2e),
**web 75/75 tests**, typecheck/lint/build limpios en ambos repos, los tres
servicios (API, worker, web) saludables.

## 7. Estado actual y bloqueadores reales pendientes

No queda trabajo de código pendiente para lo que ya está construido (MVP
original + restructuración de negocio de la sección 4.1). Lo que sigue
abierto depende de decisiones, credenciales o recursos externos:

1. **Proveedor real de publicidad recompensada**: hoy `RewardsService` solo
   tiene registrado el proveedor `stub` (`StubAdCallbackVerifier` en el
   backend, `StubRewardedAdsProvider` en el frontend) — simula ver un
   anuncio sin depender de ninguna cuenta real. Falta contratar un
   proveedor (ej. ayeT-Studios) e implementar un nuevo
   `AdCallbackVerifier`/`RewardedAdsProvider` real; la arquitectura ya está
   lista para enchufarlo sin tocar el resto del sistema.
2. **`RESEND_API_KEY` real**: el proveedor de correo está integrado y
   probado (`ResendNotificationsProvider`), pero sin una key real de
   Resend los correos de verificación/recuperación siguen solo en el log
   de consola.
3. **Webhook de Wompi en producción**: en local se resolvió con
   confirmación activa al volver del checkout (sección 6), pero la entrega
   pasiva del webhook de Wompi hacia la API real todavía no se ha
   confirmado funcionando — en producción (con una URL pública estable, no
   un túnel efímero) debería funcionar sin el workaround, pero no se ha
   verificado con infraestructura real desplegada.
4. **Sentry**: SDK integrado en ambos repos pero inactivo — falta un
   `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` real y configurar reglas de alerta
   desde el dashboard de Sentry.
5. **Revisión legal**: los textos de `/legal/terminos` y
   `/legal/privacidad` son un borrador razonable en español, marcado
   explícitamente como pendiente de revisión por un abogado.
6. **Staging/producción real**: todo lo verificado en esta sesión corrió
   contra Docker local (Postgres/Redis/MinIO) — sigue pendiente desplegar
   un entorno real (el propio plan lo señala como el único ítem de la
   Fase 0 sin marcar).
7. **Logo definitivo**: el isotipo actual es un boceto propio funcional en
   SVG, no el logo oficial que un diseñador debería producir antes de
   cualquier registro de marca (aclaración explícita ya hecha en su
   momento).

## 8. Cómo correr el proyecto en local

```bash
# Backend
cd TaroTria-api
npm install
cp .env.example .env   # completar secretos/credenciales reales
npm run docker:up      # Postgres + Redis + MinIO
npm run db:generate && npm run db:migrate:dev && npm run db:seed
npm run start:dev          # Terminal 1: API en :3000
npm run start:worker:dev   # Terminal 2: worker (proceso aparte, obligatorio)

# Frontend
cd TaroTria-web
npm install
cp .env.example .env
npm run dev   # :3001
```

Notas importantes de entorno (ver README de `TaroTria-api` para el detalle
completo):

- Usar `http://lvh.me:3001` / `http://lvh.me:3000` en vez de `localhost`
  para poder probar el checkout de Wompi (sección 6) — funciona
  exactamente igual que `localhost` para todo lo demás.
- El worker **nunca** debe correr en el mismo proceso que la API.
- `REWARDS_STUB_SECRET` es obligatoria (cualquier string aleatorio sirve en
  local) — sin ella la API no pasa la validación de config al arrancar.
  `RESEND_API_KEY`/`EMAIL_FROM` son opcionales (sin ellas, los correos solo
  quedan en el log).
- Tras cambiar `prisma/schema.prisma` o hacer `git pull`/checkout de un
  commit con migraciones nuevas, correr `npm run db:generate` **antes** de
  `npm run db:migrate:dev`/`deploy` — si no, el cliente de Prisma queda con
  tipos desactualizados y el build/typecheck falla.
- `npm run test:e2e` (Playwright) y `npm run test:load` requieren la app
  completa corriendo contra Postgres/Redis reales.
