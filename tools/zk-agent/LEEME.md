# Intermediario del lector (PC del gimnasio)

Para lectores ZKTeco que **no aceptan órdenes por la nube** (ej. MB360). Corre en una PC del
gimnasio, habla con el lector por la red local (puerto 4370) y con la plataforma por internet.

## Instalación (una vez)

1. Python 3.10+ instalado (python.org, marcando "Add to PATH").
2. Copiar esta carpeta a la PC, por ejemplo `C:\Evolution\zk-agent`.
3. Panel → **Accesos** → ficha del lector → **Generar clave del intermediario**.
4. Copiar `config.ejemplo.json` como `config.json` y completar:
   - `clave`: la que mostró el panel (se ve una sola vez).
   - `ip_lector`: la IP fija del lector (Menú → Red → Ethernet).
   - `modo`: empezar con `"lectura"`.
5. PowerShell **como administrador**, en la carpeta:
   `powershell -ExecutionPolicy Bypass -File .\instalar.ps1`

## Modos

- `lectura`: no modifica el lector. Sube usuarios, entradas y las huellas de quienes ya son socios.
- `sincronizar`: además carga a los socios al día, saca a vencidos/morosos, restaura huellas y pone
  en hora el reloj del lector. Después de cambiar el modo, en PowerShell como administrador:
  `Stop-ScheduledTask 'Evolution - Intermediario lector'; Start-ScheduledTask 'Evolution - Intermediario lector'` (o reiniciar la PC).

## Importante

- El programa viejo (Control Gym) tiene que quedar **cerrado**: el lector atiende una conexión por vez.
- Las caras de este modelo no se pueden copiar por red: se registran en el propio lector.
- Registro de actividad: `agente.log`. Prueba manual: `python agente.py --una-vez`.
