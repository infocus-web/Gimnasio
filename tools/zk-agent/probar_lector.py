"""
Prueba de SOLO LECTURA del lector ZKTeco MB360 por la red local (puerto 4370).
No modifica nada: se conecta, lee informacion y usuarios, y se desconecta.

Uso (en PowerShell, dentro de la carpeta donde esta este archivo):
    pip install pyzk
    python probar_lector.py
"""
from zk import ZK

IP_LECTOR = "192.168.0.99"
PUERTO = 4370

zk = ZK(IP_LECTOR, port=PUERTO, timeout=10, password=0, force_udp=False, ommit_ping=True)
conn = None
try:
    print(f"Conectando a {IP_LECTOR}:{PUERTO} ...")
    conn = zk.connect()
    print("OK, conectado.\n")

    print("== Lector ==")
    for etiqueta, fn in [
        ("Nombre", conn.get_device_name),
        ("Numero de serie", conn.get_serialnumber),
        ("Firmware", conn.get_firmware_version),
        ("Plataforma", conn.get_platform),
        ("Hora del lector", conn.get_time),
    ]:
        try:
            print(f"{etiqueta}: {fn()}")
        except Exception as e:
            print(f"{etiqueta}: (no disponible: {e})")

    try:
        conn.read_sizes()
        print(f"Usuarios cargados: {conn.users}")
        print(f"Huellas cargadas: {conn.fingers}")
        print(f"Registros de entrada guardados: {conn.records}")
        print(f"Caras cargadas: {getattr(conn, 'faces', 'n/d')}")
    except Exception as e:
        print(f"Cantidades: (no disponible: {e})")

    print("\n== Primeros 20 usuarios ==")
    usuarios = conn.get_users()
    for u in usuarios[:20]:
        print(f"  N° {u.user_id:>8} | {u.name:<28} | privilegio {u.privilege}")
    print(f"Total leidos: {len(usuarios)}")

except Exception as e:
    print(f"\nERROR: {e}")
    print("Revisa: que el lector tenga IP 192.168.0.99, que esta PC este en la misma red,")
    print("y que Control Gym este CERRADO (el lector atiende una sola conexion a la vez).")
finally:
    if conn:
        conn.disconnect()
        print("\nDesconectado. No se modifico nada en el lector.")
