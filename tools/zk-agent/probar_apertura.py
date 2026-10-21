"""
Prueba: ¿el lector abre el molinete a pedido desde la red?
Le manda al lector la orden "abrir puerta" (activa su relé unos segundos), igual que cuando lee una huella válida.
No carga ni borra usuarios.

Uso (en PowerShell, dentro de esta carpeta):
    python probar_apertura.py
"""
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
from zk import ZK  # noqa: E402

IP_LECTOR = "192.168.0.99"
PUERTO = 4370
SEGUNDOS_ABIERTO = 3

print(f"Esto va a ABRIR el molinete del lector {IP_LECTOR} durante {SEGUNDOS_ABIERTO} segundos.")
print("Conviene que alguien esté mirando el molinete.")
if input("¿Abrir ahora? (s/n): ").strip().lower() != "s":
    sys.exit("Cancelado.")

for intento in range(1, 4):
    conn = None
    try:
        conn = ZK(IP_LECTOR, port=PUERTO, timeout=10, password=0, force_udp=False, ommit_ping=True).connect()
        t0 = time.time()
        conn.unlock(time=SEGUNDOS_ABIERTO)
        print(f"\nOK: el lector aceptó la orden de abrir ({(time.time() - t0) * 1000:.0f} ms).")
        print("¿Se liberó el molinete (o se escuchó el clic del relé)? Contale a Claude qué pasó.")
        break
    except Exception as e:
        print(f"Intento {intento}: {e}")
        time.sleep(3)
    finally:
        if conn:
            try:
                conn.disconnect()
            except Exception:
                pass
else:
    print("\nNo se pudo. Si el intermediario está corriendo en esta PC, puede estar ocupando el lector:")
    print("detenelo y probá de nuevo:  schtasks /End /TN \"Evolution - Intermediario lector\"")
