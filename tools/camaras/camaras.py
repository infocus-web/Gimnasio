"""
CamarasEvolution.exe — cámaras de vigilancia del gimnasio en el panel de Evolution.

  Doble clic (como administrador) → asistente: pide la clave del panel y las cámaras, prueba,
                                    lo instala en C:\\Evolution\\Camaras y lo deja arrancando con Windows.
  CamarasEvolution.exe --servicio  → corre el servicio (lo usa la tarea programada).

Qué hace el servicio:
  1. go2rtc      toma la imagen de las cámaras por la red local (RTSP) y la convierte para el navegador.
                 Escucha SOLO en esta PC (127.0.0.1), no en la red.
  2. portero     (acá abajo) deja pasar únicamente a quien trae un pase firmado y vigente,
                 que la plataforma entrega solo a los usuarios del panel con permiso para ver cámaras.
  3. cloudflared saca al portero a internet con un túnel seguro (https), sin abrir puertos en el router.
  4. Cada minuto le avisa a la plataforma la dirección del túnel y qué cámaras responden.
"""
import asyncio
import base64
import ctypes
import hashlib
import hmac
import json
import logging
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from logging.handlers import RotatingFileHandler

VERSION = "1.0.0"
DESTINO = r"C:\Evolution\Camaras"
EXE = "CamarasEvolution.exe"
TAREA = "Evolution - Camaras"
TAREA_VIGIA = "Evolution - Camaras (vigia)"
SERVIDOR = "https://evolutiongym.fitness"
GO2RTC_PUERTO = 1984
PORTERO_PUERTO = 18990
CANDADO_PUERTO = 47380
AVISO_SEG = 60

log = logging.getLogger("camaras")


# ---------------------------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------------------------
def aqui():
    return os.path.dirname(os.path.abspath(sys.executable if getattr(sys, "frozen", False) else __file__))


def recurso(nombre):
    """Archivos que vienen adentro del .exe (go2rtc.exe, cloudflared.exe)."""
    base = getattr(sys, "_MEIPASS", aqui())
    return os.path.join(base, nombre)


def leer_config(carpeta=None):
    try:
        with open(os.path.join(carpeta or aqui(), "config.json"), encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def slug(texto, usados):
    base = re.sub(r"[^a-z0-9]+", "", texto.lower())[:12] or "cam"
    n, nombre = 1, base
    while nombre in usados:
        n += 1
        nombre = f"{base}{n}"
    return nombre


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def b64url_decode(texto: str) -> bytes:
    return base64.urlsafe_b64decode(texto + "=" * (-len(texto) % 4))


def pase_valido(clave: str, stream: str, pase: str) -> bool:
    """Pase = base64url(json {"s": stream, "e": vence}) . base64url(hmac_sha256(clave, primera parte))."""
    try:
        cuerpo, firma = pase.split(".", 1)
        esperado = b64url(hmac.new(clave.encode(), cuerpo.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(esperado, firma):
            return False
        datos = json.loads(b64url_decode(cuerpo))
        return datos.get("s") == stream and int(datos.get("e", 0)) > time.time()
    except Exception:
        return False


def puerto_abierto(ip, puerto=554, espera=2.0):
    try:
        with socket.create_connection((ip, puerto), timeout=espera):
            return True
    except OSError:
        return False


# ---------------------------------------------------------------------------------------------
# Portero: delante de go2rtc. Solo deja pasar el video en vivo (/api/ws) con un pase válido.
# ---------------------------------------------------------------------------------------------
class Portero:
    def __init__(self, cfg):
        self.clave = cfg["clave"]
        self.streams = set()
        for c in cfg["camaras"]:
            self.streams.add(c["id"])
            self.streams.add(c["id"] + "_hd")

    async def _rechazar(self, writer, codigo=403, texto="Forbidden"):
        try:
            writer.write(f"HTTP/1.1 {codigo} {texto}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".encode())
            await writer.drain()
        except Exception:
            pass
        writer.close()

    async def _tubo(self, origen, destino):
        try:
            while True:
                datos = await origen.read(65536)
                if not datos:
                    break
                destino.write(datos)
                await destino.drain()
        except Exception:
            pass
        finally:
            try:
                destino.close()
            except Exception:
                pass

    async def atender(self, reader, writer):
        try:
            cabecera = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), 15)
        except Exception:
            writer.close()
            return
        if len(cabecera) > 16384:
            return await self._rechazar(writer, 431, "Request Header Fields Too Large")
        try:
            metodo, destino, _ = cabecera.split(b"\r\n", 1)[0].decode("latin-1").split(" ", 2)
        except ValueError:
            return await self._rechazar(writer, 400, "Bad Request")
        url = urllib.parse.urlsplit(destino)
        if metodo == "GET" and url.path == "/salud":
            writer.write(b"HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok")
            await writer.drain()
            writer.close()
            return
        q = urllib.parse.parse_qs(url.query)
        stream = (q.get("src") or [""])[0]
        pase = (q.get("token") or [""])[0]
        es_ws = b"upgrade: websocket" in cabecera.lower()
        if metodo != "GET" or url.path != "/api/ws" or not es_ws or stream not in self.streams or not pase_valido(self.clave, stream, pase):
            return await self._rechazar(writer)
        # Al go2rtc le llega solo la cámara pedida (sin el pase)
        limpio = f"GET /api/ws?src={urllib.parse.quote(stream)} HTTP/1.1".encode()
        resto = cabecera.split(b"\r\n", 1)[1]
        try:
            up_r, up_w = await asyncio.wait_for(asyncio.open_connection("127.0.0.1", GO2RTC_PUERTO), 5)
        except Exception:
            return await self._rechazar(writer, 502, "Bad Gateway")
        up_w.write(limpio + b"\r\n" + resto)
        await up_w.drain()
        await asyncio.gather(self._tubo(reader, up_w), self._tubo(up_r, writer))

    def correr(self):
        async def principal():
            servidor = await asyncio.start_server(self.atender, "127.0.0.1", PORTERO_PUERTO)
            async with servidor:
                await servidor.serve_forever()

        asyncio.run(principal())


# ---------------------------------------------------------------------------------------------
# Servicio
# ---------------------------------------------------------------------------------------------
def escribir_go2rtc(cfg, carpeta):
    usuario = urllib.parse.quote(cfg["usuario_camara"], safe="")
    clave = urllib.parse.quote(cfg["clave_camara"], safe="")
    lineas = [
        "# Lo genera CamarasEvolution.exe: no editar a mano (se pisa al arrancar).",
        "api:",
        f'  listen: "127.0.0.1:{GO2RTC_PUERTO}"',
        '  origin: "*"',
        "rtsp:",
        '  listen: ""',
        "webrtc:",
        '  listen: ""',
        "srtp:",
        '  listen: ""',
        "log:",
        "  level: warn",
        "streams:",
    ]
    for c in cfg["camaras"]:
        base = f"rtsp://{usuario}:{clave}@{c['ip']}:554"
        lineas.append(f'  {c["id"]}: "{base}/stream2"')       # calidad liviana (grilla)
        lineas.append(f'  {c["id"]}_hd: "{base}/stream1"')    # alta calidad (pantalla grande)
    with open(os.path.join(carpeta, "go2rtc.yaml"), "w", encoding="utf-8") as f:
        f.write("\n".join(lineas) + "\n")


class Hijo:
    """Programa externo que se vuelve a lanzar solo si se cae."""

    def __init__(self, nombre, args, carpeta, al_leer=None):
        self.nombre, self.args, self.carpeta, self.al_leer = nombre, args, carpeta, al_leer
        self.proc = None

    def vivo(self):
        return self.proc is not None and self.proc.poll() is None

    def arrancar(self):
        log.info("Arrancando %s", self.nombre)
        self.proc = subprocess.Popen(
            self.args, cwd=self.carpeta, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0), text=True, encoding="utf-8", errors="replace",
        )
        threading.Thread(target=self._leer, daemon=True).start()

    def _leer(self):
        for linea in self.proc.stdout:
            linea = linea.rstrip()
            if self.al_leer:
                self.al_leer(linea)
            if "ERR" in linea or "error" in linea.lower():
                log.warning("[%s] %s", self.nombre, linea[:300])

    def detener(self):
        if self.vivo():
            self.proc.terminate()
            try:
                self.proc.wait(5)
            except Exception:
                self.proc.kill()


class Servicio:
    def __init__(self, cfg, carpeta):
        self.cfg, self.carpeta = cfg, carpeta
        self.url_tunel = None
        self.avisado = False
        self.url_cambio = threading.Event()
        exe_go2rtc = os.path.join(carpeta, "go2rtc.exe")
        exe_cf = os.path.join(carpeta, "cloudflared.exe")
        self.go2rtc = Hijo("go2rtc", [exe_go2rtc, "-config", os.path.join(carpeta, "go2rtc.yaml")], carpeta)
        self.tunel = Hijo(
            "túnel",
            [exe_cf, "tunnel", "--no-autoupdate", "--url", f"http://127.0.0.1:{PORTERO_PUERTO}"],
            carpeta, self._linea_tunel,
        )

    def _linea_tunel(self, linea):
        m = re.search(r"https://(?!api\.)[a-z0-9-]+\.trycloudflare\.com", linea)
        if m and m.group(0) != self.url_tunel:
            self.url_tunel = m.group(0)
            log.info("Túnel listo: %s", self.url_tunel)
            self.url_cambio.set()

    def avisar(self):
        camaras = [
            {"id": c["id"], "name": c["nombre"], "online": puerto_abierto(c["ip"])} for c in self.cfg["camaras"]
        ]
        cuerpo = json.dumps({"action": "hello", "url": self.url_tunel, "cameras": camaras, "version": VERSION}).encode()
        req = urllib.request.Request(
            self.cfg.get("servidor", SERVIDOR) + "/api/cameras/agent", data=cuerpo, method="POST",
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {self.cfg['clave']}",
                     "User-Agent": f"CamarasEvolution/{VERSION}"},
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                respuesta = json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            if e.code == 401:
                log.error("La plataforma rechazó la clave: generá una nueva en el panel y volvé a correr el asistente.")
            else:
                log.error("La plataforma respondió %s", e.code)
            return False
        except Exception as e:
            log.error("Sin conexión con la plataforma: %s", e)
            return False
        if respuesta.get("status") != "ok":
            log.error("La plataforma respondió: %s", respuesta)
            return False
        if not self.avisado:
            self.avisado = True
            log.info("Conectado con la plataforma.")
        caidas = [c["name"] for c in camaras if not c["online"]]
        if caidas:
            log.warning("No responden: %s", ", ".join(caidas))
        return True

    def correr(self):
        escribir_go2rtc(self.cfg, self.carpeta)
        threading.Thread(target=Portero(self.cfg).correr, daemon=True).start()
        self.go2rtc.arrancar()
        self.tunel.arrancar()
        proximo = 0.0
        while True:
            if not self.go2rtc.vivo():
                log.warning("go2rtc se cerró: lo vuelvo a abrir")
                time.sleep(3)
                self.go2rtc.arrancar()
            if not self.tunel.vivo():
                log.warning("El túnel se cerró: lo vuelvo a abrir (la dirección va a cambiar)")
                self.url_tunel = None
                time.sleep(5)
                self.tunel.arrancar()
            if self.url_cambio.is_set() or time.time() >= proximo:
                self.url_cambio.clear()
                if self.url_tunel:
                    self.avisar()
                proximo = time.time() + AVISO_SEG
            self.url_cambio.wait(2)


def una_sola_instancia():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("127.0.0.1", CANDADO_PUERTO))
    except OSError:
        return None
    return s


def servicio():
    carpeta = aqui()
    os.chdir(carpeta)
    candado = una_sola_instancia()
    if candado is None:
        print("El servicio de cámaras ya está corriendo en esta PC.")
        return
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[RotatingFileHandler(os.path.join(carpeta, "camaras.log"), maxBytes=2_000_000, backupCount=3, encoding="utf-8"),
                  logging.StreamHandler()],
    )
    cfg = leer_config(carpeta)
    if not cfg or not cfg.get("clave") or not cfg.get("camaras"):
        log.error("Falta config.json: abrí %s como administrador para configurarlo.", EXE)
        sys.exit(2)
    log.info("Cámaras Evolution v%s · %d cámara(s)", VERSION, len(cfg["camaras"]))
    srv = Servicio(cfg, carpeta)
    try:
        srv.correr()
    finally:
        srv.go2rtc.detener()
        srv.tunel.detener()


# ---------------------------------------------------------------------------------------------
# Asistente de instalación
# ---------------------------------------------------------------------------------------------
def titulo(t):
    print("\n" + "=" * 62 + f"\n  {t}\n" + "=" * 62)


def pausa():
    try:
        input("\nApretá Enter para cerrar...")
    except EOFError:
        pass


def preguntar(texto, defecto=""):
    v = input(f"{texto}" + (f" [{defecto}]" if defecto else "") + ": ").strip()
    return v or defecto


def es_admin():
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def schtasks(*args):
    r = subprocess.run(["schtasks", *args], capture_output=True, text=True)
    return r.returncode == 0, (r.stdout + r.stderr).strip()


def detener_todo():
    schtasks("/End", "/TN", TAREA)
    schtasks("/End", "/TN", TAREA_VIGIA)
    for nombre in ("go2rtc.exe", "cloudflared.exe"):
        subprocess.run(["taskkill", "/F", "/IM", nombre], capture_output=True)
    subprocess.run(["taskkill", "/F", "/IM", EXE, "/FI", f"PID ne {os.getpid()}", "/FI", f"PID ne {os.getppid()}"],
                   capture_output=True)


def copiar_programas():
    os.makedirs(DESTINO, exist_ok=True)
    pares = [(os.path.abspath(sys.executable), os.path.join(DESTINO, EXE)),
             (recurso("go2rtc.exe"), os.path.join(DESTINO, "go2rtc.exe")),
             (recurso("cloudflared.exe"), os.path.join(DESTINO, "cloudflared.exe"))]
    for origen, destino in pares:
        if os.path.normcase(origen) == os.path.normcase(destino):
            continue
        for intento in range(15):
            try:
                shutil.copy2(origen, destino)
                break
            except PermissionError:
                if intento == 0:
                    print("Esperando que se cierre la versión anterior...")
                detener_todo()
                time.sleep(2)
        else:
            raise RuntimeError("No se pudo copiar el programa (sigue abierto). Reiniciá la PC y volvé a abrir este archivo.")
    return os.path.join(DESTINO, EXE)


def pedir_camaras(actuales):
    print("\nCargá las cámaras. Para cada una: un nombre (ej. 'Musculación') y su IP.")
    print("La IP está en la app Tapo → la cámara → engranaje → 'Información del dispositivo'.")
    print("(Conviene fijarla en el router para que no cambie.) Dejá el nombre vacío para terminar.\n")
    camaras, usados = [], set()
    for c in actuales:
        if preguntar(f"¿Mantener '{c['nombre']}' ({c['ip']})? (s/n)", "s").lower() == "s":
            camaras.append(c)
            usados.add(c["id"])
    while len(camaras) < 16:
        nombre = preguntar(f"Nombre de la cámara {len(camaras) + 1}")
        if not nombre:
            break
        ip = preguntar("IP de la cámara (ej. 192.168.0.50)")
        if not re.fullmatch(r"\d{1,3}(\.\d{1,3}){3}", ip):
            print("Esa IP no parece válida, probá de nuevo.\n")
            continue
        if puerto_abierto(ip):
            print("  ✓ La cámara responde.\n")
        else:
            print("  ⚠ No responde en el puerto 554. ¿Está prendida, en la misma red y con la 'Cuenta de cámara' creada?")
            if preguntar("  ¿La agrego igual? (s/n)", "n").lower() != "s":
                continue
        cid = slug(nombre, usados)
        usados.add(cid)
        camaras.append({"id": cid, "nombre": nombre[:40], "ip": ip})
    return camaras


def configurar(cfg):
    print("\n1) Pegá la CLAVE que generaste en Panel → Configuración → Cámaras.")
    print("   (Para pegar en esta ventana: clic derecho.)")
    while True:
        clave = preguntar("Clave", cfg.get("clave", "")).strip().strip('"')
        if re.fullmatch(r"[0-9a-f]{48}", clave):
            break
        print("Esa clave no parece completa (son 48 letras y números). Probá de nuevo.")
    cfg["clave"] = clave
    print("\n2) Usuario y contraseña de la 'Cuenta de cámara' que creaste en la app Tapo")
    print("   (Tapo → cámara → engranaje → Ajustes avanzados → Cuenta de la cámara).")
    print("   Usá la misma en todas las cámaras.")
    cfg["usuario_camara"] = preguntar("Usuario de la cámara", cfg.get("usuario_camara", ""))
    cfg["clave_camara"] = preguntar("Contraseña de la cámara", cfg.get("clave_camara", ""))
    cfg["camaras"] = pedir_camaras(cfg.get("camaras", []))
    return cfg


def instalar_tareas(exe):
    accion = f'"{exe}" --servicio'
    ok1, m1 = schtasks("/Create", "/F", "/TN", TAREA, "/TR", accion, "/SC", "ONSTART", "/RU", "SYSTEM", "/RL", "HIGHEST")
    ok2, m2 = schtasks("/Create", "/F", "/TN", TAREA_VIGIA, "/TR", accion, "/SC", "MINUTE", "/MO", "5", "/RU", "SYSTEM", "/RL", "HIGHEST")
    if not (ok1 and ok2):
        print("No se pudo crear la tarea programada:\n", m1, "\n", m2)
        return False
    schtasks("/Run", "/TN", TAREA)
    return True


def esperar_conexion():
    """Mira el registro del servicio hasta ver el túnel y el aviso a la plataforma (máx. 60 s)."""
    print("\nArrancando y conectando con la plataforma (hasta 1 minuto)...")
    registro = os.path.join(DESTINO, "camaras.log")
    fin = time.time() + 60
    while time.time() < fin:
        time.sleep(3)
        try:
            with open(registro, encoding="utf-8", errors="replace") as f:
                texto = f.read()[-4000:]
        except OSError:
            continue
        if "rechazó la clave" in texto:
            print("✗ La plataforma rechazó la clave. Generá otra en el panel y volvé a correr este programa.")
            return False
        if "Conectado con la plataforma" in texto:
            print("✓ Conectado.")
            return True
    print("Todavía no confirmó la conexión. Puede tardar un poco más: mirá el panel en unos minutos.")
    print(f"Registro: {registro}")
    return True


def desinstalar():
    detener_todo()
    schtasks("/Delete", "/F", "/TN", TAREA)
    schtasks("/Delete", "/F", "/TN", TAREA_VIGIA)
    print("Cámaras detenidas y quitadas del arranque de Windows.")
    print(f"(La carpeta {DESTINO} queda con su configuración y registro.)")


def asistente():
    titulo("Cámaras · Evolution Fitness")
    if not es_admin():
        print("Hay que abrirlo como administrador: clic derecho → 'Ejecutar como administrador'.")
        return pausa()
    cfg = leer_config(DESTINO)
    if cfg and cfg.get("clave"):
        print(f"Ya está instalado con {len(cfg.get('camaras', []))} cámara(s).\n")
        print("  1) Agregar, quitar o cambiar cámaras")
        print("  2) Cambiar la clave del panel o la cuenta de las cámaras")
        print("  3) Reinstalar (actualizar a esta versión)")
        print("  4) Desinstalar")
        print("  0) Salir")
        op = preguntar("\nElegí una opción", "0")
        if op == "4":
            desinstalar()
            return pausa()
        if op == "1":
            cfg["camaras"] = pedir_camaras(cfg.get("camaras", []))
        elif op == "2":
            cfg = configurar(cfg)
        elif op != "3":
            return
    else:
        print("Este asistente:")
        print(f"  · copia el programa a {DESTINO}")
        print("  · conecta tus cámaras Tapo con el panel de Evolution")
        print("  · lo deja corriendo y arrancando solo con Windows (aunque nadie inicie sesión)")
        cfg = configurar({"servidor": SERVIDOR})
    if not cfg.get("camaras"):
        print("\nNo cargaste ninguna cámara. Volvé a abrir el programa cuando las tengas.")
        return pausa()
    detener_todo()
    exe = copiar_programas()
    with open(os.path.join(DESTINO, "config.json"), "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    if not instalar_tareas(exe):
        return pausa()
    esperar_conexion()
    titulo("Listo")
    print(f"{len(cfg['camaras'])} cámara(s) conectadas. Mirá Panel → Configuración → Cámaras.")
    print("El servicio arranca solo con Windows. Esta PC tiene que quedar prendida y con internet.")
    print(f"Para cambiar algo, volvé a abrir {os.path.join(DESTINO, EXE)} como administrador.")
    pausa()


def main():
    if "--servicio" in sys.argv:
        servicio()
    else:
        try:
            asistente()
        except KeyboardInterrupt:
            pass
        except Exception as e:
            print(f"\nError inesperado: {e}")
            pausa()


if __name__ == "__main__":
    main()
