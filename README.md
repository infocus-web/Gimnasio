# Sistema de gestión de gimnasio

Web + panel de control para un gimnasio: socios, cuotas, ingreso con QR, cobros con Mercado Pago,
rutinas con videos, actividades con horarios y emails automáticos.

Stack: **React + Vite + Tailwind** (frontend) · **Supabase** (base de datos, login, archivos) ·
**Vercel** (hosting + funciones `/api` + cron diario) · **Resend** (emails) · **Mercado Pago** (cobro online).

## Qué incluye

| Sección | Qué hace |
|---|---|
| **Web pública** (`/`) | Portada, actividades, grilla de horarios, planes con precios, contacto y WhatsApp |
| **Panel** (`/admin`) | Socios activos, ingresos del mes, ingresos al gym por día y por hora, vencimientos de la semana con aviso por WhatsApp |
| **Recepción** (`/admin/recepcion`) | Lee el QR con la cámara (tablet/celular/notebook) o con un lector USB. Pantalla verde/roja grande con sonido, foto del socio, días restantes y notas de salud. Búsqueda manual por nombre o DNI |
| **Socios** | Alta con foto (desde la cámara), DNI, contacto, emergencia, apto físico. Estados: al día / por vencer / vencido / inactivo. Exportar a CSV |
| **Ficha del socio** | Pagos, ingresos, rutina asignada, carnet con QR imprimible, envío del link personal por email o WhatsApp |
| **Pagos** | Registro en efectivo, transferencia, débito, crédito, Mercado Pago. Calcula solo el período y extiende el vencimiento. Totales por mes y por medio, exportar CSV |
| **Planes** | Precio y duración (mensual, trimestral, semanal…) |
| **Ejercicios y videos** | Biblioteca con video de YouTube/Vimeo o archivo subido, por grupo muscular |
| **Rutinas** | Constructor por días con series, repeticiones, pausa y notas. Duplicar rutinas. Asignar a socios |
| **Actividades** | Clases con color, profe, cupo y horarios semanales |
| **Configuración** | Datos del gym, logo, portada, días de tolerancia, días de aviso, usuarios y permisos |
| **Link del socio** (`/m/<código>`) | Sin contraseña. Su QR para entrar, estado de la cuota, **pagar con Mercado Pago**, su rutina con videos, horarios de clases, historial de pagos e ingresos |
| **Emails automáticos** | Bienvenida con QR · comprobante de pago · aviso X días antes de vencer · aviso de cuota vencida · feliz cumpleaños |

Roles: el **primer usuario** que se registra queda como administrador. Los siguientes quedan
"sin acceso" hasta que un admin los habilita como **Staff** (recepción, socios, pagos, rutinas) o **Administrador**.
Solo el admin puede borrar pagos/socios y cambiar la configuración.

## Puesta en marcha

### 1. Supabase
1. Crear un proyecto nuevo (región São Paulo).
2. En **SQL Editor** ejecutar, en orden, `supabase/migrations/0001_init.sql` y `supabase/migrations/0002_seed.sql` (datos de ejemplo, opcional).
3. **Authentication → Sign In / Providers → Email**: dejar activado. Para el primer admin conviene
   desactivar temporalmente "Confirm email" o configurar SMTP (paso 3).
4. **Authentication → URL Configuration**: Site URL = la URL de Vercel (ej. `https://mi-gimnasio.vercel.app`),
   y agregar `https://mi-gimnasio.vercel.app/**` en Redirect URLs.
5. **Storage → Settings**: subir el límite de tamaño de archivo (ej. 200 MB) si se van a subir videos.

### 2. Vercel — variables de entorno
Ver `.env.example`. Mínimo para funcionar: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PUBLIC_SITE_URL`, `CRON_SECRET`.

### 3. Emails (Resend)
1. Crear cuenta en resend.com, verificar el dominio del gimnasio y crear una API key.
2. Cargar `RESEND_API_KEY` y `EMAIL_FROM` en Vercel.
3. Recomendado: en Supabase → Authentication → SMTP, usar el SMTP de Resend para los emails de login
   (el SMTP por defecto de Supabase tiene un límite muy bajo).
4. Probar desde **Configuración → Probar envío de emails**.

### 4. Mercado Pago
1. En mercadopago.com.ar/developers crear una aplicación ("Checkout Pro") y copiar el **Access Token de producción** → `MP_ACCESS_TOKEN`.
2. En **Webhooks**: URL `https://TU-SITIO/api/mp/webhook`, evento **Pagos**. Copiar la clave secreta → `MP_WEBHOOK_SECRET`.
3. Cuando un socio paga desde su link, el pago se registra solo, se extiende el vencimiento y le llega el comprobante.

### 5. Primer uso
1. Entrar a `/login` → "Crear cuenta de staff" → ese usuario queda como administrador.
2. Configuración: nombre, logo, WhatsApp, dirección.
3. Planes → revisar precios. Actividades → horarios. Ejercicios → pegar links de videos.
4. Crear socios, registrarles el pago y enviarles el link (email o WhatsApp).
5. En recepción, abrir `/admin/recepcion` en una tablet con "Modo recepción".

## Desarrollo

```bash
npm install
cp .env.example .env.local   # completar
npm run dev                  # frontend en http://localhost:5173
npm run typecheck            # chequeo de tipos (frontend + api)
```

Las funciones de `api/` corren en Vercel (`vercel dev` para probarlas en local).

La base se puede probar en un Postgres local con `supabase/test/stub_supabase.sql` + las migraciones + `supabase/test/scenario.sql`.

## Segunda etapa (preparado, no incluido)

- **Reconocimiento facial / huella**: la tabla `checkins` ya acepta los métodos `facial` y `huella`.
  Con un equipo ZKTeco (ej. SpeedFace) se puede sumar un endpoint que reciba sus eventos y llame a
  la función `check_in` de la base, igual que el QR.
- Reserva de cupos en clases, app instalable (PWA), débito automático mensual con Mercado Pago.
