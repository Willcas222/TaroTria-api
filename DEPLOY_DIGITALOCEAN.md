# Desplegar TAROTRIA en Digital Ocean (App Platform)

Guía paso a paso para lanzar TAROTRIA a producción usando Digital Ocean App
Platform. El spec de infraestructura ya está listo en
[`.do/app.yaml`](.do/app.yaml) — esta guía explica cómo usarlo.

## 0. Antes de empezar

- Reemplaza **todas** las apariciones de `tarotria.com` en
  [`.do/app.yaml`](.do/app.yaml) por tu dominio real (búscalo con Ctrl+H).
- Ambos repos (`TaroTria-api`, `TaroTria-web`) deben estar subidos a GitHub
  en la rama `dev` — ya lo están.

## 1. Crear el bucket de almacenamiento (Spaces)

Digital Ocean Spaces guarda las imágenes de palma que suben los usuarios.

1. Panel de DO → **Spaces Object Storage** → Create a Spaces Bucket.
2. Región: `nyc3` (o la que prefieras — si cambias la región, actualiza
   `SPACES_ENDPOINT` y `SPACES_REGION` en `.do/app.yaml`).
3. Nombre: `tarotria-prod` (o el que quieras, pero debe coincidir con
   `SPACES_BUCKET` en el spec).
4. Panel de DO → **API** → **Spaces Keys** → Generate New Key. Vas a obtener
   un `Access Key` y un `Secret Key`: guárdalos, son los valores de
   `SPACES_ACCESS_KEY` y `SPACES_SECRET_KEY`.

## 2. Crear la app en App Platform

1. Panel de DO → **Apps** → **Create App** → **Import from App Spec**.
2. Sube el archivo `.do/app.yaml` (ya editado con tu dominio real).
3. DO va a detectar automáticamente:
   - 2 **Services** (`api`, `web`)
   - 1 **Worker** (procesa las lecturas de tarot/palma en segundo plano)
   - 1 **Job** de pre-despliegue (`migrate`, aplica la base de datos)
   - 2 **Databases** administradas (Postgres y Redis)
4. En la pantalla de revisión, DO te va a pedir el valor de cada variable
   marcada como secreta. Complétalas así:

   | Variable | De dónde sacarla |
   |---|---|
   | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `DAILY_CARD_SECRET`, `REWARDS_STUB_SECRET` | Genera 4 valores aleatorios distintos, ej. `openssl rand -hex 32` cada uno |
   | `OPENAI_API_KEY` | platform.openai.com → API keys |
   | `SPACES_ACCESS_KEY` / `SPACES_SECRET_KEY` | Paso 1 |
   | `WOMPI_PUBLIC_KEY` / `WOMPI_PRIVATE_KEY` / `WOMPI_EVENTS_SECRET` / `WOMPI_INTEGRITY_SECRET` | Panel de comercio de Wompi, **modo Producción** (no sandbox) |
   | `SENTRY_DSN` (API) / `NEXT_PUBLIC_SENTRY_DSN` (web) | sentry.io → tus 2 proyectos, ver sección "Sentry" más abajo |
   | `RESEND_API_KEY` | resend.io → API Keys, ver sección "Resend" más abajo |

   Nota: `WOMPI_API_URL` ya viene en `https://production.wompi.co/v1` en el
   spec (no el sandbox) — confírmalo antes de aceptar pagos reales.

5. Click **Create Resources**. La primera vez tarda varios minutos: crea las
   bases de datos, corre el job de migración, y despliega los 3 componentes.

## 3. Conectar tu dominio

En **Settings → Domains** de la app, DO te va a mostrar los registros DNS
que debes crear en el proveedor donde compraste el dominio (Namecheap,
GoDaddy, etc. — o en DO si transferiste la administración DNS ahí):

- `tarotria.com` → registro **A** o **CNAME** apuntando a la app (DO te da
  el valor exacto en pantalla).
- `www.tarotria.com` → **CNAME** hacia `tarotria.com`.
- `api.tarotria.com` → **CNAME** apuntando a la app.

DO emite el certificado HTTPS automáticamente para los 3 una vez que el DNS
propaga (puede tardar de minutos a un par de horas).

## 4. Configurar Resend con tu dominio

1. resend.com → **Domains** → Add Domain → tu dominio.
2. Resend te da 3-4 registros DNS (SPF, DKIM, y DMARC opcional). Agrégalos
   en el mismo lugar donde administras el DNS del dominio.
3. Cuando Resend marque el dominio como **Verified**, ya puedes usar
   cualquier remitente de ese dominio sin registrar cada uno aparte —
   `no-reply@tarotria.com`, `soporte@tarotria.com`, etc.
4. Genera un API Key en Resend y ponlo como `RESEND_API_KEY` en la app
   (Settings → api → Environment Variables, y también en el worker si envía
   notificaciones).
5. Ajusta `EMAIL_FROM` en `.do/app.yaml` (o directo en el dashboard) al
   remitente real que quieras usar, ej. `TAROTRIA <no-reply@tarotria.com>`.

## 5. Configurar Sentry

1. sentry.io → crea 2 proyectos: uno tipo **Node.js** (para `api` y
   `worker`) y otro tipo **Next.js** (para `web`).
2. Copia el DSN de cada uno.
3. En la app de DO: pon el DSN del proyecto Node como `SENTRY_DSN` en los
   componentes `api` y `worker`, y el DSN del proyecto Next.js como
   `NEXT_PUBLIC_SENTRY_DSN` en `web`.
4. Las alertas (que te avise por correo/Slack ante un error nuevo) se
   configuran dentro de cada proyecto de Sentry, en **Alerts**.

## 6. Verificación post-despliegue

- `https://api.tarotria.com/api/v1` responde (health check de la app).
- `https://tarotria.com` carga el frontend.
- Registrar un usuario de prueba, hacer una lectura de tarot y confirmar que
  el worker la procesa (revisa **Runtime Logs** del componente `worker` en
  DO si no aparece el resultado).
- Hacer un pago de prueba pequeño en Wompi **modo producción** y confirmar
  que los créditos se acreditan.
- Revisar que llegue un correo real (verificación o recuperación de
  contraseña) desde tu dominio.
- Provocar un error a propósito (ej. una ruta que no existe) y confirmar que
  aparece en Sentry.

## Costos aproximados (referencia, pueden cambiar)

- 3 componentes `basic-xxs` (api + web + worker): ~15 USD/mes.
- Base de datos Postgres administrada (plan más pequeño): ~15 USD/mes.
- Base de datos Redis administrada (plan más pequeño): ~15 USD/mes.
- Spaces (almacenamiento): ~5 USD/mes.

Total inicial aproximado: **~50 USD/mes**. Se puede bajar más adelante
compartiendo Postgres/Redis con otros proyectos o ajustando tamaños según
el tráfico real.

## Pendientes que quedan fuera de esta guía

Ver sección 7 de [`RESUMEN_PROYECTO_TAROTRIA.md`](RESUMEN_PROYECTO_TAROTRIA.md):
falta contratar un proveedor real de publicidad recompensada, y la revisión
legal de términos/privacidad sigue pendiente de un abogado.
