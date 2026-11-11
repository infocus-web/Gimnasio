# App de iPhone "Evolution Fitness": cómo publicarla en el App Store

La app está en `D:\PROYECTOS\Gimnasio\app-ios`. Está hecha con Expo y usa el mismo Supabase que la web.
**No necesitás una Mac:** la app se compila en los servidores de Expo (EAS) y se sube al App Store desde tu PC.

Qué hace la versión 1.0:
- **Ingresar** con email y contraseña, con Apple o con Google. Queda la sesión abierta (se guarda en el Llavero del iPhone).
- **Crear cuenta** y **"Olvidé mi contraseña"** con el código de 6 números, sin salir de la app.
- **Mi QR:** el mismo QR que lee la tablet del molinete (`get_checkin_token`). Cambia solo cada 30 segundos, sube el brillo al máximo y no deja que se apague la pantalla. Negro sobre blanco, para que la tablet lo lea con cualquier luz.
- **Clases:** próximos 7 días, reservar, cancelar y lista de espera (`book_class` / `cancel_booking`, las mismas que la web).
- **Mi cuenta:** plan, estado y vencimiento de la cuota, grupo familiar, WhatsApp, cerrar sesión y **borrar cuenta** (Apple lo exige).
- Cuentas familiares: el que paga elige arriba para quién es el QR o la reserva.

La tablet del molinete **no cambia**: valida igual que con la web.

---

## Paso 1 · Cuenta de desarrollador de Apple (una sola vez)

1. Entrá a https://developer.apple.com/programs/enroll con tu Apple ID (necesita la verificación en dos pasos activada).
2. Elegí inscribirte como **persona (Individual)**. Pagás USD 99 por año con tarjeta.
3. Apple la aprueba en 1 o 2 días. Te llega un email.

## Paso 2 · Configurar Supabase (2 cosas, 3 minutos)

En https://supabase.com/dashboard/project/fdncorjgytskdjnlwqpe :

1. **Authentication → URL Configuration → Redirect URLs → Add URL:** `evolutiongym://auth`
   (es la vuelta a la app después de entrar con Google).
2. **Authentication → Sign In / Providers → Apple → Enable.**
   En **Client IDs** poné: `fitness.evolutiongym.app` y guardá.
   (Para el ingreso con Apple desde la app alcanza con eso: no hace falta clave secreta).

## Paso 3 · Subir la web (ya está el código)

Se agregó `platform/src/app/api/cuenta/borrar/route.ts` (borrar la cuenta desde la app).
Hay que commitear y subir a `main` para que quede en https://evolutiongym.fitness **antes** de mandar la app a revisión.

## Paso 4 · Compilar la app (desde la PC, en PowerShell)

1. Creá una cuenta gratis en https://expo.dev (sign up).
2. En PowerShell:

```powershell
cd D:\PROYECTOS\Gimnasio\app-ios
npm install
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --platform ios --profile production
```

- `init` vincula la carpeta con tu cuenta de Expo (agrega un `projectId` en `app.json`; es normal).
- `build` te pide el Apple ID y la contraseña de la cuenta de desarrollador: decí que **sí** a todo lo que ofrece crear (certificados y perfiles). Expo los guarda y los maneja solo.
- Tarda unos 15 a 30 minutos. Al final te da un link con el archivo `.ipa`.

## Paso 5 · Subirla a App Store Connect y probarla con TestFlight

```powershell
npx eas-cli@latest submit --platform ios --latest
```

- La primera vez te pregunta si crear la app en App Store Connect: **sí**. Nombre: `Evolution Fitness`.
- En unos minutos aparece en https://appstoreconnect.apple.com → tu app → **TestFlight**.
- Instalá **TestFlight** en tu iPhone (App Store), aceptá la invitación y probá:
  - ingresar con email, con Apple y con Google;
  - **pasar por el molinete con el QR de la app**;
  - reservar y cancelar una clase.

## Paso 6 · Ficha del App Store y envío a revisión

En App Store Connect → tu app → **Distribución** (versión 1.0):

| Campo | Qué poner |
|---|---|
| Subtítulo | Tu acceso y tus clases |
| Descripción | Ingresá a Evolution Fitness GYM con tu QR, mirá el estado de tu cuota y reservá tus clases. |
| Palabras clave | gimnasio,gym,pilar,evolution,fitness,clases,musculación |
| URL de soporte | https://evolutiongym.fitness |
| URL de privacidad | https://evolutiongym.fitness/privacidad |
| Categoría | Salud y forma física |
| Capturas | Del iPhone más grande (6,9"): 3 a 5 capturas de Mi QR, Clases y Mi cuenta |

**Privacidad de la app** (cuestionario): se recopilan *Email*, *Nombre* e *ID de usuario*, vinculados al usuario, para *Funcionalidad de la app*. **No** se usan para rastreo.

**Muy importante: cuenta de prueba para Apple.** En "Información para la revisión de la app" cargá un email y contraseña de un socio de prueba **con plan activo** (si no, el revisor no ve el QR y la rechaza). Creá ese socio en el panel con un plan vigente por unos meses.
En las notas para el revisor podés poner:
> La app es para socios del gimnasio Evolution Fitness GYM (Pilar, Argentina). El QR abre el molinete de la sala de musculación al ser leído por una tablet en la entrada. Las cuotas se pagan en el gimnasio; la app no vende nada.

Tocá **Enviar a revisión**. Apple tarda normalmente de 1 a 3 días.

## Versiones siguientes

Cambiá el código y repetí los pasos 4 y 5 (el número de compilación sube solo). Si en `app.json` cambiás `"version"` (por ejemplo a `1.1.0`), en App Store Connect se crea una versión nueva para revisar.

## Para probar en la PC mientras se programa (opcional)

`npx expo start` y escaneá el QR con la cámara del iPhone (necesita la app **Expo Go**). El ingreso con Apple solo funciona en la app compilada (TestFlight).
