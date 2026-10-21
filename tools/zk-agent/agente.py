"""
Intermediario entre la plataforma (Vercel) y un lector ZKTeco por la red local (puerto 4370).
Para lectores que no aceptan órdenes por la nube (ej. MB360). Corre en una PC del gimnasio.

Modos (config.json → "modo"):
  "lectura"      NO carga ni borra usuarios del lector. Sube a la plataforma: usuarios, huellas de socios y entradas.
  "sincronizar"  Además ejecuta la cola de la plataforma: carga a los socios al día, saca a vencidos/morosos,
                 restaura huellas y mantiene en hora el reloj del lector.
En los dos modos abre el molinete cuando la tablet valida el QR de un socio ("abrir_por_qr": false lo desactiva).

Uso:  python agente.py            (corre siempre)
      python agente.py --una-vez  (un solo ciclo, para probar)
"""
import base64
import hashlib
import json
import logging
import os
import socket
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from logging.handlers import RotatingFileHandler

if getattr(sys, "frozen", False):          # .exe (PyInstaller): config y registros junto al ejecutable
    AQUI = os.path.dirname(os.path.abspath(sys.executable))
else:
    AQUI = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, os.path.join(AQUI, "lib"))  # pyzk instalado por instalar.ps1

from zk import ZK  # noqa: E402
from zk.exception import ZKNetworkError  # noqa: E402
from zk.finger import Finger  # noqa: E402
from zk.user import User  # noqa: E402

VERSION = "1.2.0"
CICLO_SEG = 10
APERTURAS_CADA_SEG = 1          # consulta rápida de "abrir molinete" (QR en la tablet)
APERTURAS_SIN_TABLET_SEG = 30   # sin tablet vinculada: consulta lenta, por si se vincula
SEGUNDOS_APERTURA = 1           # pulso del relé: en un molinete libera una sola vuelta
SALUDO_CADA_SEG = 300
SUBIDA_COMPLETA_CADA_SEG = 1800
RELOJ_CADA_SEG = 600
DESFASE_MAX_SEG = 60
FORMATO_HORA = "%Y-%m-%d %H:%M:%S"
VENTANA_ENTRADAS = timedelta(days=7)      # entradas más viejas no se suben (la plataforma igual las ignora)
ERRORES_DE_RED = (ZKNetworkError, OSError, socket.timeout)

log = logging.getLogger("agente")


# ---------------------------------------------------------------- configuración y estado
def cargar_json(nombre, defecto):
    ruta = os.path.join(AQUI, nombre)
    if not os.path.exists(ruta):
        return defecto
    with open(ruta, encoding="utf-8") as f:
        return json.load(f)


def guardar_estado(estado):
    ruta = os.path.join(AQUI, "estado.json")
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(estado, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)


def leer_config():
    cfg = cargar_json("config.json", None)
    if not cfg:
        raise SystemExit("Falta config.json (copiá config.ejemplo.json y completalo).")
    for clave in ("servidor", "numero_de_serie", "clave", "ip_lector"):
        if not str(cfg.get(clave, "")).strip() or "PEGAR" in str(cfg.get(clave)):
            raise SystemExit(f"config.json: falta completar '{clave}'.")
    cfg["servidor"] = cfg["servidor"].rstrip("/")
    cfg["puerto_lector"] = int(cfg.get("puerto_lector", 4370))
    cfg["modo"] = cfg.get("modo", "lectura")
    if cfg["modo"] not in ("lectura", "sincronizar"):
        raise SystemExit("config.json: 'modo' tiene que ser 'lectura' o 'sincronizar'.")
    return cfg


# ---------------------------------------------------------------- plataforma
class Plataforma:
    def __init__(self, cfg):
        self.url = cfg["servidor"] + "/api/access/agent"
        self.serial = cfg["numero_de_serie"]
        self.clave = cfg["clave"]

    def llamar(self, accion, **payload):
        cuerpo = json.dumps({"serial": self.serial, "action": accion, **payload}).encode("utf-8")
        req = urllib.request.Request(
            self.url,
            data=cuerpo,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.clave}",
                "User-Agent": f"evolution-zk-agent/{VERSION}",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8") or "{}")
        except urllib.error.HTTPError as e:
            if e.code == 401:
                raise RuntimeError("La plataforma rechazó la clave (¿número de serie o clave equivocados?).")
            raise RuntimeError(f"La plataforma respondió {e.code}")


# ---------------------------------------------------------------- lector
def conectar(cfg):
    zk = ZK(cfg["ip_lector"], port=cfg["puerto_lector"], timeout=15, password=int(cfg.get("clave_lector", 0)),
            force_udp=False, ommit_ping=True)
    return zk.connect()


def kv(texto):
    """'PIN=1\tName=Juan' → {'PIN': '1', 'Name': 'Juan'} (claves en mayúscula)"""
    out = {}
    for parte in texto.split("\t"):
        if "=" in parte:
            k, v = parte.split("=", 1)
            out[k.strip().upper()] = v
    return out


def seguro(fn):
    try:
        return fn()
    except Exception:
        return None


def pin_valido(user_id):
    """Número del usuario normalizado ("0012" → "12"), igual que lo guarda la plataforma."""
    s = str(user_id).strip()
    return str(int(s)) if s.isdigit() and 0 < int(s) < 1_000_000_000 else None


def registros_usuarios(usuarios):
    return [{"k": "user", "pin": p, "name": (u.name or "").strip()[:40]}
            for u in usuarios if (p := pin_valido(u.user_id))]


def registros_huellas(conn, usuarios):
    por_uid = {u.uid: pin_valido(u.user_id) for u in usuarios}
    out = []
    for f in conn.get_templates() or []:
        pin = por_uid.get(f.uid)
        if not pin or not f.template:
            continue
        tmp = base64.b64encode(f.template).decode("ascii")
        out.append({
            "k": "bio", "tbl": "FP", "pin": pin, "pin_key": "PIN", "key": str(f.fid),
            "fields": f"FID={f.fid}\tSize={len(tmp)}\tValid={f.valid}\tTMP={tmp}",
        })
    return out


def huella_hash(r):
    return hashlib.sha1(r["fields"].encode("ascii")).hexdigest()[:16]


# ---------------------------------------------------------------- tareas
def subir_entradas(conn, plat, estado, total_registros):
    """Sube las entradas de los últimos días que todavía no se mandaron. No depende del reloj del lector
    (si se corrige la hora no se pierden marcas): se recuerda cada marca enviada (número + hora)."""
    if total_registros == estado.get("registros_vistos"):
        return
    try:
        marcas = conn.get_attendance() or []
    except ValueError as e:                     # registro corrupto en el lector (fecha imposible)
        log.error("No se pudieron leer las entradas del lector: %s", e)
        return
    ahora = datetime.now()
    enviadas = set(estado.get("entradas_enviadas") or [])
    nuevas = []
    for a in marcas:
        pin = pin_valido(a.user_id)
        if not pin or not isinstance(a.timestamp, datetime):
            continue
        if not (ahora - VENTANA_ENTRADAS <= a.timestamp <= ahora + timedelta(days=1)):
            continue
        t = a.timestamp.strftime(FORMATO_HORA)
        clave = f"{pin}|{t}"
        if clave in enviadas:
            continue
        nuevas.append({"k": "att", "pin": pin, "t": t, "v": a.status if a.status is not None else 15, "_c": clave})
    nuevas.sort(key=lambda r: r["t"])
    for i in range(0, len(nuevas), 500):
        lote = nuevas[i:i + 500]
        res = plat.llamar("push", table="ATTLOG", records=[{k: v for k, v in r.items() if k != "_c"} for r in lote])
        if res.get("status") != "ok":
            raise RuntimeError(f"Entradas no aceptadas: {res}")
        enviadas.update(r["_c"] for r in lote)
        log.info("Entradas subidas: %d (registradas como check-in: %s)", len(lote), res.get("accepted"))
    limite = (ahora - VENTANA_ENTRADAS - timedelta(days=1)).strftime(FORMATO_HORA)
    estado["entradas_enviadas"] = sorted(c for c in enviadas if c.split("|", 1)[1] >= limite)
    estado["registros_vistos"] = total_registros


def subir_usuarios_y_huellas(conn, plat, estado, forzar=False):
    usuarios = conn.get_users() or []
    res = plat.llamar("push", table="USERINFO", records=registros_usuarios(usuarios))
    if res.get("status") != "ok":
        raise RuntimeError(f"Usuarios no aceptados: {res}")
    hashes = estado.setdefault("huellas_subidas", {})
    todas = registros_huellas(conn, usuarios)
    pendientes = [r for r in todas if forzar or hashes.get(f'{r["pin"]}:{r["key"]}') != huella_hash(r)]
    subidas = 0
    for i in range(0, len(pendientes), 40):
        lote = pendientes[i:i + 40]
        res = plat.llamar("push", table="FP", records=lote)
        if res.get("status") != "ok":
            raise RuntimeError(f"Huellas no aceptadas: {res}")
        omitidos = {str(p) for p in res.get("skipped_bio_pins") or []}
        for r in lote:
            if str(r["pin"]) not in omitidos:      # las de no-socios se vuelven a ofrecer más adelante
                hashes[f'{r["pin"]}:{r["key"]}'] = huella_hash(r)
                subidas += 1
    log.info("Lector: %d usuarios y %d huellas informados (%d huellas de socios guardadas en la nube)",
             len(usuarios), len(todas), subidas)
    estado["ultima_subida_completa"] = time.time()
    conn.read_sizes()
    estado["usuarios_vistos"] = conn.users
    estado["huellas_vistas"] = conn.fingers


def poner_en_hora(conn, estado):
    ahora = datetime.now()
    try:
        del_lector = conn.get_time()
    except Exception:
        del_lector = None
    if del_lector is None or abs((del_lector - ahora).total_seconds()) > DESFASE_MAX_SEG:
        conn.set_time(ahora)
        log.info("Reloj del lector corregido (%s → %s)", del_lector, ahora.strftime(FORMATO_HORA))
    estado["ultimo_reloj"] = time.time()


def ejecutar_cola(conn, comandos):
    """Ejecuta los comandos de la plataforma. Devuelve [(id, ret)] y si hay que subir todo.
    Si se corta la red a mitad de camino, se informan solo los hechos: el resto vuelve a la cola solo."""
    resultados = []
    subir_todo = False
    usuarios = {}
    for u in conn.get_users() or []:
        p = pin_valido(u.user_id)
        if p:
            usuarios.setdefault(p, []).append(u)
    huellas_por_pin = {}
    ids_huellas = {}

    def proximo_uid():
        return max([u.uid for lista in usuarios.values() for u in lista] + [0]) + 1

    conn.disable_device()
    try:
        for c in comandos:
            cid, cmd = c["id"], c["cmd"]
            try:
                if cmd.startswith("DATA UPDATE USERINFO "):
                    d = kv(cmd[len("DATA UPDATE USERINFO "):])
                    pin = pin_valido(d.get("PIN"))
                    if not pin:
                        resultados.append((cid, -3))
                        continue
                    previos = usuarios.get(pin) or []
                    uid = previos[0].uid if previos else proximo_uid()
                    nombre = d.get("NAME", "")[:24]
                    conn.set_user(uid=uid, name=nombre, privilege=0, password="", group_id="", user_id=pin, card=0)
                    usuarios[pin] = [User(uid, nombre, 0, "", "", pin, 0)] + previos[1:]
                    resultados.append((cid, 0))

                elif cmd.startswith("DATA DELETE USERINFO "):
                    pin = pin_valido(kv(cmd[len("DATA DELETE USERINFO "):]).get("PIN"))
                    for u in usuarios.pop(pin, []) if pin else []:
                        conn.delete_user(uid=u.uid, user_id=u.user_id)
                    resultados.append((cid, 0))

                elif cmd.startswith("DATA UPDATE FINGERTMP "):
                    d = kv(cmd[len("DATA UPDATE FINGERTMP "):])
                    pin = pin_valido(d.get("PIN"))
                    if not pin or not usuarios.get(pin) or "TMP" not in d:
                        resultados.append((cid, -10))
                        continue
                    tmpl = base64.b64decode(d["TMP"])
                    huellas_por_pin.setdefault(pin, []).append(
                        Finger(usuarios[pin][0].uid, int(d.get("FID", 0)), int(d.get("VALID", 1)), tmpl))
                    ids_huellas.setdefault(pin, []).append(cid)

                elif cmd.startswith("DATA QUERY USERINFO"):
                    subir_todo = True
                    resultados.append((cid, 0))

                else:
                    # Caras/palmas (BIODATA), registro remoto, etc.: este lector no los acepta por red
                    resultados.append((cid, -1002))
            except ERRORES_DE_RED:
                raise
            except Exception as e:
                log.warning("Comando %s rechazado por el lector: %s (%s)", cid, cmd.split("\t")[0], e)
                resultados.append((cid, -1))

        for pin, fingers in huellas_por_pin.items():
            try:
                conn.save_user_template(usuarios[pin][0], fingers)
                resultados += [(cid, 0) for cid in ids_huellas[pin]]
            except ERRORES_DE_RED:
                raise
            except Exception as e:
                log.warning("Huellas de %s rechazadas por el lector: %s", pin, e)
                resultados += [(cid, -1) for cid in ids_huellas[pin]]
    except ERRORES_DE_RED as e:
        log.error("Se cortó la conexión con el lector a mitad de la cola (%s): se informan %d hechos, el resto se reintenta",
                  e, len(resultados))
        return resultados, subir_todo, False
    finally:
        try:
            conn.enable_device()
        except Exception as e:
            log.error("No se pudo reactivar el lector (%s): se reintenta en el próximo ciclo", e)
    return resultados, subir_todo, True


class Aperturas:
    """Aperturas pedidas por la tablet del molinete (QR). Se ejecutan al instante; no cargan ni borran nada.

    Se consulta cada segundo si el lector tiene una tablet vinculada (y cada 30 s si no, por si se vincula),
    también en medio de un ciclo largo, usando la conexión ya abierta con el lector."""

    def __init__(self, cfg, plat):
        self.cfg, self.plat = cfg, plat
        self.activo = bool(cfg.get("abrir_por_qr", True))
        self.kiosk = True            # hasta que la plataforma diga lo contrario
        self.ultima = 0.0
        self.ultimo_error = 0.0

    def cada(self):
        return APERTURAS_CADA_SEG if self.kiosk else APERTURAS_SIN_TABLET_SEG

    def proxima(self):
        return self.ultima + self.cada() if self.activo else float("inf")

    def revisar(self, conn=None):
        """conn: conexión ya abierta (dentro de un ciclo). Un corte con el lector se propaga en ese caso."""
        if not self.activo or time.time() < self.proxima():
            return
        self.ultima = time.time()
        try:
            res = self.plat.llamar("unlocks")
        except Exception as e:
            if time.time() - self.ultimo_error > 60:      # no llenar el registro si se corta internet
                log.error("Consulta de aperturas con error: %s", e)
                self.ultimo_error = time.time()
            return
        self.kiosk = bool(res.get("kiosk", True))
        comandos = res.get("commands") or []
        if not comandos:
            return
        propia = conn is None
        resultados = []
        try:
            if propia:
                conn = conectar(self.cfg)
            for c in comandos:
                try:
                    conn.unlock(time=SEGUNDOS_APERTURA)
                    resultados.append({"id": c["id"], "ret": 0})
                    log.info("Molinete abierto (QR)")
                except ERRORES_DE_RED:
                    raise
                except Exception as e:
                    log.warning("El lector no aceptó abrir: %s", e)
                    resultados.append({"id": c["id"], "ret": -1})
        except ERRORES_DE_RED as e:
            log.error("No se pudo abrir el molinete (sin conexión con el lector): %s", e)
            hechos = {r["id"] for r in resultados}
            resultados += [{"id": c["id"], "ret": -2} for c in comandos if c["id"] not in hechos]
            if not propia:
                self._informar(resultados)
                raise
        finally:
            if propia and conn:
                try:
                    conn.disconnect()
                except Exception:
                    pass
        self._informar(resultados)

    def _informar(self, resultados):
        try:
            self.plat.llamar("results", results=resultados)
        except Exception as e:
            log.error("No se pudo informar la apertura: %s", e)


# ---------------------------------------------------------------- ciclo
def ciclo(cfg, plat, estado, aperturas=None):
    abrir = (lambda: aperturas.revisar(conn)) if aperturas else (lambda: None)
    sincronizar = cfg["modo"] == "sincronizar"
    conn = conectar(cfg)
    try:
        if sincronizar:
            conn.enable_device()     # por si un ciclo anterior lo dejó bloqueado por un corte de red
        conn.read_sizes()
        ahora = time.time()

        if ahora - estado.get("ultimo_saludo", 0) > SALUDO_CADA_SEG:
            info = {
                "mode": cfg["modo"], "version": VERSION, "pc": socket.gethostname(),
                "device": seguro(conn.get_device_name), "fw": seguro(conn.get_firmware_version),
                "users": conn.users, "fingers": conn.fingers, "records": conn.records,
                "qr": bool(cfg.get("abrir_por_qr", True)),
            }
            res = plat.llamar("hello", info=info)
            if res.get("status") != "ok":
                log.warning("La plataforma tiene el lector como '%s' (¿pausado?)", res.get("status"))
            estado["ultimo_saludo"] = ahora

        if sincronizar and ahora - estado.get("ultimo_reloj", 0) > RELOJ_CADA_SEG:
            poner_en_hora(conn, estado)

        abrir()
        subir_entradas(conn, plat, estado, conn.records)
        abrir()

        cambio = (conn.users != estado.get("usuarios_vistos") or conn.fingers != estado.get("huellas_vistas"))
        if cambio or ahora - estado.get("ultima_subida_completa", 0) > SUBIDA_COMPLETA_CADA_SEG:
            subir_usuarios_y_huellas(conn, plat, estado)
            abrir()

        if sincronizar:
            res = plat.llamar("poll")
            comandos = res.get("commands") or []
            if comandos:
                log.info("Cola: %d cambios para el lector", len(comandos))
                resultados, subir_todo, completo = ejecutar_cola(conn, comandos)
                if resultados:
                    plat.llamar("results", results=[{"id": i, "ret": r} for i, r in resultados])
                if not completo:
                    raise RuntimeError("conexión con el lector interrumpida")
                ok = sum(1 for _, r in resultados if r >= 0)
                log.info("Cola: %d hechos, %d con error", ok, len(resultados) - ok)
                conn.read_sizes()
                abrir()
                if subir_todo or conn.users != estado.get("usuarios_vistos"):
                    subir_usuarios_y_huellas(conn, plat, estado)
        abrir()
    finally:
        try:
            conn.disconnect()
        except Exception:
            pass
        guardar_estado(estado)


def una_sola_instancia():
    """Evita dos copias corriendo a la vez (el lector atiende una conexión por vez)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("127.0.0.1", 47370))
    except OSError:
        return None
    return s


def main():
    os.chdir(AQUI)
    candado = una_sola_instancia()
    if candado is None:
        print("El intermediario ya está corriendo en esta PC.")
        return
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[RotatingFileHandler(os.path.join(AQUI, "agente.log"), maxBytes=2_000_000, backupCount=3, encoding="utf-8"),
                  logging.StreamHandler()],
    )
    cfg = leer_config()
    plat = Plataforma(cfg)
    estado = cargar_json("estado.json", {})
    una_vez = "--una-vez" in sys.argv
    log.info("Intermediario v%s · lector %s (%s) · modo %s", VERSION, cfg["numero_de_serie"], cfg["ip_lector"], cfg["modo"])
    if cfg["modo"] == "lectura":
        log.info("Modo LECTURA: no se modifica nada en el lector.")
    errores = 0
    proximo_ciclo = 0.0
    aperturas = Aperturas(cfg, plat)
    while True:
        if time.time() >= proximo_ciclo:
            try:
                ciclo(cfg, plat, estado, None if una_vez else aperturas)
                errores = 0
            except SystemExit:
                raise
            except Exception as e:
                errores += 1
                log.error("Ciclo con error (%d seguidos): %s", errores, e)
                if una_vez:
                    raise
            if una_vez:
                log.info("Listo (--una-vez).")
                return
            espera = CICLO_SEG if errores == 0 else min(300, CICLO_SEG * (2 ** min(errores, 5)))
            proximo_ciclo = time.time() + espera
        aperturas.revisar()
        time.sleep(max(0.2, min(proximo_ciclo, aperturas.proxima()) - time.time()))


if __name__ == "__main__":
    main()
