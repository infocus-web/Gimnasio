# Cámaras (PC del gimnasio)

Conecta las cámaras **TP-Link Tapo** (C210 u otras enchufables con RTSP) con el panel de Evolution
(Panel → Hoy → **Cámaras**). Las cámaras a batería no sirven (no tienen RTSP).

## Qué hace

`CamarasEvolution.exe` trae adentro dos programas oficiales y gratuitos:

- **go2rtc**: toma la imagen de las cámaras por la red local y la convierte para el navegador.
  Escucha solo en la propia PC (127.0.0.1).
- **cloudflared**: túnel seguro de Cloudflare hacia internet, sin abrir puertos en el router.

Entre los dos hay un **portero** que solo deja pasar el video en vivo con un pase firmado por la
plataforma (vence en 4 horas, sirve para una sola cámara y solo se da a usuarios con permiso).
Cada minuto le avisa a la plataforma la dirección del túnel y qué cámaras responden.

## Instalación

1. App Tapo: instalar cada cámara en el WiFi del gimnasio. En cada una: engranaje →
   **Ajustes avanzados → Cuenta de la cámara** → crear usuario y contraseña (el mismo en todas).
2. Anotar la IP de cada cámara (engranaje → Información del dispositivo) y fijarla en el router.
3. Panel → Hoy → Cámaras → **Generar clave**.
4. En la PC del gimnasio: `CamarasEvolution.exe` → clic derecho → **Ejecutar como administrador** →
   seguir el asistente (clave, cuenta de las cámaras, nombre + IP de cada una).
5. Queda instalado en `C:\Evolution\Camaras` y arranca solo con Windows (tarea programada
   "Evolution - Camaras" + vigía cada 5 minutos).

Para agregar/quitar cámaras o desinstalar: volver a abrir `C:\Evolution\Camaras\CamarasEvolution.exe`
como administrador. Registro: `C:\Evolution\Camaras\camaras.log`.

## El .exe

Lo compila GitHub Actions (`.github/workflows/camaras-exe.yml`) en cada push que toque `tools/camaras/`:
GitHub → Actions → "Cámaras (.exe)" → la última ejecución → Artifacts → **CamarasEvolution**.

## Calidad y conexión

- Grilla: `stream2` de la Tapo (liviana). Pantalla grande: `stream1` (2K).
- La PC solo pide imagen a una cámara mientras alguien la está mirando.
- Cada persona mirando usa subida de internet del gimnasio (~0,3 Mbps por cámara en la grilla,
  ~1,5–2 Mbps en grande).
- El túnel rápido de Cloudflare cambia de dirección cuando se reinicia la PC; el programa le avisa
  la nueva a la plataforma solo (el panel se reconecta en menos de un minuto).
