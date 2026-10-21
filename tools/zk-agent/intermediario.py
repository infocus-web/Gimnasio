"""
IntermediarioEvolution.exe: instalador + programa en un solo archivo.

  Doble clic                → asistente: pide la clave, prueba el lector y la plataforma,
                              lo instala en C:\\Evolution\\Intermediario y lo deja arrancando con Windows.
  IntermediarioEvolution.exe --servicio   → corre el intermediario (lo usa la tarea programada).
  IntermediarioEvolution.exe --una-vez    → un ciclo de prueba.
"""
import ctypes
import json
import os
import shutil
import subprocess
import sys

DESTINO = r"C:\Evolution\Intermediario"
EXE = "IntermediarioEvolution.exe"
TAREA = "Evolution - Intermediario lector"
TAREA_VIGIA = "Evolution - Intermediario lector (vigia)"
DEFECTO = {
    "servidor": "https://evolution-fitness-gym-liart.vercel.app",
    "numero_de_serie": "AEWD182260360",
    "clave": "",
    "ip_lector": "192.168.0.99",
    "puerto_lector": 4370,
    "modo": "lectura",
}


def titulo(t):
    print("\n" + "=" * 60 + f"\n  {t}\n" + "=" * 60)


def pausa():
    try:
        input("\nApretá Enter para cerrar...")
    except EOFError:
        pass


def es_admin():
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def schtasks(*args):
    r = subprocess.run(["schtasks", *args], capture_output=True, text=True)
    return r.returncode == 0, (r.stdout + r.stderr).strip()


def preguntar(texto, defecto=""):
    v = input(f"{texto}" + (f" [{defecto}]" if defecto else "") + ": ").strip()
    return v or defecto


def config_path():
    return os.path.join(DESTINO, "config.json")


def leer_config():
    try:
        with open(config_path(), encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def guardar_config(cfg):
    with open(config_path(), "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


def detener():
    schtasks("/End", "/TN", TAREA)
    schtasks("/End", "/TN", TAREA_VIGIA)
    subprocess.run(["taskkill", "/F", "/IM", EXE, "/FI", f"PID ne {os.getpid()}"], capture_output=True)


def copiar_exe():
    os.makedirs(DESTINO, exist_ok=True)
    origen = os.path.abspath(sys.executable)
    destino = os.path.join(DESTINO, EXE)
    if os.path.normcase(origen) != os.path.normcase(destino):
        shutil.copy2(origen, destino)
    return destino


def probar(exe):
    print("\nProbando conexión con el lector y con la plataforma (puede tardar 30 segundos)...\n")
    r = subprocess.run([exe, "--una-vez"], cwd=DESTINO)
    return r.returncode == 0


def instalar_tareas(exe):
    accion = f'"{exe}" --servicio'
    ok1, m1 = schtasks("/Create", "/F", "/TN", TAREA, "/TR", accion, "/SC", "ONSTART", "/RU", "SYSTEM", "/RL", "HIGHEST")
    # Vigía: cada 5 minutos lo vuelve a lanzar si se hubiera cerrado (si ya corre, la copia nueva sale sola)
    ok2, m2 = schtasks("/Create", "/F", "/TN", TAREA_VIGIA, "/TR", accion, "/SC", "MINUTE", "/MO", "5", "/RU", "SYSTEM", "/RL", "HIGHEST")
    if not (ok1 and ok2):
        print("No se pudo crear la tarea programada:\n", m1, "\n", m2)
        return False
    schtasks("/Run", "/TN", TAREA)
    return True


def desinstalar():
    detener()
    schtasks("/Delete", "/F", "/TN", TAREA)
    schtasks("/Delete", "/F", "/TN", TAREA_VIGIA)
    print("Intermediario detenido y quitado del arranque de Windows.")
    print(f"(La carpeta {DESTINO} queda con su configuración y registro.)")


def configurar(cfg):
    print("\nPegá la CLAVE que generaste en Panel → Accesos → 'Generar clave del intermediario'.")
    print("(Para pegar en esta ventana: clic derecho.)")
    while True:
        clave = preguntar("Clave", cfg.get("clave", "")).strip().strip('"')
        if len(clave) >= 32:
            break
        print("Esa clave no parece completa (son 48 letras y números). Probá de nuevo.")
    cfg["clave"] = clave
    print("\nEl resto ya viene completo; Enter para dejar cada valor como está.")
    cfg["numero_de_serie"] = preguntar("Número de serie del lector", cfg["numero_de_serie"]).upper()
    cfg["ip_lector"] = preguntar("IP del lector", cfg["ip_lector"])
    return cfg


def asistente():
    titulo("Intermediario del lector · Evolution Fitness")
    if not es_admin():
        print("Hay que abrirlo como administrador: clic derecho → 'Ejecutar como administrador'.")
        return pausa()

    cfg = leer_config()
    if cfg and cfg.get("clave"):
        print(f"Ya está instalado (modo: {cfg.get('modo', 'lectura')}).\n")
        print("  1) Probar la conexión ahora")
        print("  2) Cambiar el modo (lectura / sincronizar)")
        print("  3) Cambiar la clave o la IP del lector")
        print("  4) Reinstalar (actualizar a esta versión)")
        print("  5) Desinstalar")
        print("  0) Salir")
        op = preguntar("\nElegí una opción", "0")
        if op == "5":
            desinstalar()
            return pausa()
        if op not in ("1", "2", "3", "4"):
            return
        if op == "2":
            nuevo = "sincronizar" if cfg.get("modo") == "lectura" else "lectura"
            print(f"\nModo actual: {cfg.get('modo')}.")
            if nuevo == "sincronizar":
                print("En 'sincronizar' el programa CARGA y SACA socios del lector según sus pagos.")
                print("Hacelo recién cuando los socios reales estén cargados y vinculados en la plataforma.")
            if preguntar(f"¿Pasar a '{nuevo}'? (s/n)", "n").lower() != "s":
                return pausa()
            cfg["modo"] = nuevo
        if op == "3":
            cfg = configurar(cfg)
    else:
        print("Este asistente:")
        print(f"  · copia el programa a {DESTINO}")
        print("  · prueba la conexión con el lector y con la plataforma")
        print("  · lo deja corriendo y arrancando solo con Windows (aunque nadie inicie sesión)")
        print("\nAntes: CERRÁ Control Gym (el lector atiende una sola conexión a la vez).")
        cfg = configurar(dict(DEFECTO))

    detener()
    exe = copiar_exe()
    guardar_config(cfg)
    if not probar(exe):
        print("\nLa prueba falló. Revisá el mensaje de arriba:")
        print("  · 'rechazó la clave' → generá otra en el panel y volvé a correr este programa (opción 3).")
        print("  · error de conexión con el lector → ¿Control Gym cerrado? ¿IP del lector correcta?")
        print(f"Registro completo: {os.path.join(DESTINO, 'agente.log')}")
        return pausa()
    if not instalar_tareas(exe):
        return pausa()
    titulo("Listo")
    print(f"El intermediario quedó corriendo en modo '{cfg['modo']}' y arranca solo con Windows.")
    print("En Panel → Accesos tiene que aparecer 'Conectado'.")
    print(f"Para cambiar algo, volvé a abrir {os.path.join(DESTINO, EXE)} como administrador.")
    pausa()


def main():
    if "--servicio" in sys.argv or "--una-vez" in sys.argv:
        import agente
        agente.main()
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
