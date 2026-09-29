'use client'

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  Camera,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  User,
  FileText,
  Keyboard,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { CheckinResult } from '../../types/platform';
import { sound } from '../../utils/audio';

export interface ReceptionScannerProps {
  lastResult?: CheckinResult | null;
  onScan: (scannedText: string) => void;
  onSearch: (searchTerm: string) => void;
  onClearResult?: () => void;
  isLoading?: boolean;
}

export const ReceptionScanner: React.FC<ReceptionScannerProps> = ({
  lastResult = null,
  onScan,
  onSearch,
  onClearResult,
  isLoading = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const usbInputRef = useRef<HTMLInputElement | null>(null);

  // Sound effects on new result
  useEffect(() => {
    if (!lastResult) return;

    if (lastResult.allowed && !lastResult.reason) {
      sound.playAccessGranted();
    } else if (lastResult.allowed && lastResult.reason === 'IN_GRACE_PERIOD') {
      sound.playScanPing();
    } else {
      sound.playAccessDenied();
    }

    // Auto-dismiss after 3.2 seconds back to ready state
    const timer = setTimeout(() => {
      onClearResult?.();
    }, 3200);

    return () => clearTimeout(timer);
  }, [lastResult, onClearResult]);

  // Keep USB scanner hidden input focused
  useEffect(() => {
    const focusUsb = () => {
      if (document.activeElement?.tagName !== 'INPUT') {
        usbInputRef.current?.focus();
      }
    };
    focusUsb();
    window.addEventListener('click', focusUsb);
    return () => window.removeEventListener('click', focusUsb);
  }, []);

  // Discover available cameras
  useEffect(() => {
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (devices && devices.length > 0) {
          setCameras(devices);
          const backCam = devices.find((d) =>
            d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('trasera')
          );
          setSelectedCameraId(backCam?.id ?? devices[0]?.id ?? '');
        }
      })
      .catch(() => {
        // Cameras not accessible or blocked
      });
  }, []);

  // Cleanup on unmount or tab switch: stop camera completely
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            scannerRef.current
              .stop()
              .then(() => {
                scannerRef.current?.clear();
                scannerRef.current = null;
              })
              .catch(() => {
                scannerRef.current?.clear();
                scannerRef.current = null;
              });
          } else {
            scannerRef.current.clear();
            scannerRef.current = null;
          }
        } catch {
          scannerRef.current = null;
        }
      }
    };
  }, []);

  // Handle camera start/stop
  useEffect(() => {
    if (!isCameraActive) {
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            scannerRef.current
              .stop()
              .then(() => {
                scannerRef.current?.clear();
                scannerRef.current = null;
              })
              .catch(() => {
                scannerRef.current = null;
              });
          } else {
            scannerRef.current.clear();
            scannerRef.current = null;
          }
        } catch {
          scannerRef.current = null;
        }
      }
      return;
    }

    const html5Qr = new Html5Qrcode('qr-reader-container');
    scannerRef.current = html5Qr;

    const config = {
      fps: 10,
      qrbox: { width: 240, height: 240 },
    };

    const cameraConfig = selectedCameraId
      ? { deviceId: { exact: selectedCameraId } }
      : { facingMode: 'environment' };

    html5Qr
      .start(
        cameraConfig,
        config,
        (decodedText) => {
          sound.playScanPing();
          onScan(decodedText);
        },
        () => {
          // ignore frame errors
        }
      )
      .catch((err) => {
        setCameraError(err?.message || 'No se pudo iniciar la cámara.');
        setIsCameraActive(false);
      });

    return () => {
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            scannerRef.current
              .stop()
              .then(() => {
                scannerRef.current?.clear();
                scannerRef.current = null;
              })
              .catch(() => {
                scannerRef.current = null;
              });
          } else {
            scannerRef.current.clear();
            scannerRef.current = null;
          }
        } catch {
          scannerRef.current = null;
        }
      }
    };
  }, [isCameraActive, selectedCameraId, onScan]);

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    sound.playClick();
    onSearch(searchTerm.trim());
    setSearchTerm('');
  };

  const handleUsbKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const val = (e.target as HTMLInputElement).value;
      if (val.trim()) {
        sound.playScanPing();
        onScan(val.trim());
        (e.target as HTMLInputElement).value = '';
      }
    }
  };

  const isAllowed = lastResult?.allowed && !lastResult?.reason;
  const isGrace = lastResult?.allowed && lastResult?.reason === 'IN_GRACE_PERIOD';

  const reasonLabels: Record<string, string> = {
    QR_EXPIRED_OR_INVALID: 'Token QR expirado o firma inválida. Pedir al socio regenerar el pase.',
    MEMBER_NOT_FOUND: 'Socio no registrado en la base del gimnasio.',
    NO_ACTIVE_MEMBERSHIP: 'Cuota vencida. El socio debe regularizar el pago en recepción.',
    IN_GRACE_PERIOD: 'Cuota en período de tolerancia (vence pronto). Ingreso habilitado.',
    MEMBER_FROZEN: 'Membresía pausada temporalmente a pedido del socio.',
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 text-left font-sans">
      {/* Hidden input for USB Barcode Reader */}
      <input
        ref={usbInputRef}
        type="text"
        onKeyDown={handleUsbKeyDown}
        className="opacity-0 absolute -top-96 left-0 h-1 w-1 pointer-events-none"
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* FULLSCREEN POPUP RESULT: ACCESSIBLE ANNOUNCEMENT */}
      {lastResult && (
        <div
          role="status"
          aria-live="assertive"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-in zoom-in-95 duration-150"
        >
          <div
            className={`w-full max-w-lg p-6 sm:p-8 rounded-3xl border-2 text-center space-y-5 shadow-2xl relative overflow-hidden ${
              isAllowed
                ? 'bg-zinc-950 border-[#edcc36] shadow-[0_0_40px_rgba(237,204,54,0.35)]'
                : isGrace
                ? 'bg-zinc-950 border-amber-400 shadow-[0_0_40px_rgba(251,191,36,0.3)]'
                : 'bg-zinc-950 border-red-500 shadow-[0_0_40px_rgba(239,68,68,0.35)]'
            }`}
          >
            {/* Top Indicator con icono + texto */}
            <div className="flex items-center justify-center gap-2">
              {isAllowed ? (
                <div className="w-16 h-16 rounded-full bg-[#edcc36]/20 border-2 border-[#edcc36] text-[#edcc36] flex items-center justify-center shadow-[0_0_20px_rgba(237,204,54,0.4)]">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
              ) : isGrace ? (
                <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-400 text-amber-400 flex items-center justify-center shadow-[0_0_20px_rgba(251,191,36,0.4)]">
                  <AlertTriangle className="w-10 h-10" />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-full bg-red-950/60 border-2 border-red-500 text-red-400 flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.4)]">
                  <XCircle className="w-10 h-10" />
                </div>
              )}
            </div>

            <div>
              <span
                className={`inline-block px-3 py-1.5 rounded-full text-xs font-mono font-bold tracking-wider uppercase border ${
                  isAllowed
                    ? 'border-[#edcc36]/40 bg-[#edcc36]/15 text-[#edcc36]'
                    : isGrace
                    ? 'border-amber-400/40 bg-amber-950/40 text-amber-300'
                    : 'border-red-500/40 bg-red-950/40 text-red-400'
                }`}
              >
                {isAllowed
                  ? 'Molinete destrabado · Ingreso autorizado'
                  : isGrace
                  ? 'Ingreso permitido · Período de tolerancia'
                  : 'Acceso denegado · Cuota pendiente'}
              </span>

              {lastResult.member && (
                <div className="mt-4 flex flex-col items-center">
                  {lastResult.member.photoUrl ? (
                    <img
                      src={lastResult.member.photoUrl}
                      alt={lastResult.member.firstName}
                      className="w-24 h-24 rounded-2xl object-cover border-2 border-zinc-700 shadow-md mb-2"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-2xl bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-400 mb-2">
                      <User className="w-10 h-10" />
                    </div>
                  )}

                  <h3 className="text-2xl font-bold font-cyber text-white">
                    {lastResult.member.firstName} {lastResult.member.lastName}
                  </h3>
                </div>
              )}
            </div>

            {/* Motivo de denegación o advertencia */}
            {lastResult.reason && (
              <div
                className={`p-3 rounded-xl border text-xs font-mono ${
                  isGrace
                    ? 'bg-amber-950/40 border-amber-500/50 text-amber-200'
                    : 'bg-red-950/50 border-red-500/60 text-red-200'
                }`}
              >
                {reasonLabels[lastResult.reason] || lastResult.reason}
              </div>
            )}

            {/* Notas Médicas Destacadas */}
            {lastResult.member?.medicalNotes && (
              <div className="bg-black/60 p-3 rounded-xl border border-zinc-800 text-left space-y-1 font-mono text-xs">
                <span className="text-[10px] text-zinc-400 flex items-center gap-1 uppercase font-semibold">
                  <FileText className="w-3 h-3 text-[#edcc36]" />
                  <span>Ficha Médica & Observaciones:</span>
                </span>
                <p className="text-zinc-300 leading-snug">{lastResult.member.medicalNotes}</p>
              </div>
            )}

            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  sound.playClick();
                  onClearResult?.();
                }}
                className="w-full py-3 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-mono text-xs transition-colors min-h-[44px] focus-visible:ring-2 focus-visible:ring-[#edcc36]"
              >
                Cerrar (vuelve solo en 3 s)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Panel Superior: Estado de Cámara & Lector */}
      <div className="p-4 sm:p-5 rounded-3xl bg-zinc-950 border border-zinc-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-900 pb-3">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-mono text-[#edcc36] tracking-wider uppercase font-bold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>PUESTO DE CONTROL DE ACCESO</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold font-cyber text-white">Escáner de Recepción</h2>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs text-zinc-400">
            <span className="w-2 h-2 rounded-full bg-[#edcc36] animate-pulse" />
            <span>Lector USB & Teclado listo</span>
          </div>
        </div>

        {/* Selector de Dispositivo de Cámara */}
        <div className="flex flex-col sm:flex-row gap-2">
          {cameras.length > 1 && (
            <select
              value={selectedCameraId}
              onChange={(e) => setSelectedCameraId(e.target.value)}
              aria-label="Seleccionar dispositivo de cámara"
              className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-200 focus:outline-none focus:border-[#edcc36] min-h-[44px] flex-1"
            >
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label || `Cámara ${c.id.substring(0, 5)}`}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => {
              sound.playClick();
              setCameraError(null);
              setIsCameraActive(!isCameraActive);
            }}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-mono text-xs font-bold transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-[#edcc36] ${
              isCameraActive
                ? 'bg-red-950/60 border border-red-500/60 text-red-300'
                : 'bg-[#edcc36] text-black hover:bg-[#ffe156] shadow-[0_0_15px_rgba(237,204,54,0.3)]'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>{isCameraActive ? 'Detener Cámara' : 'Encender Cámara'}</span>
          </button>
        </div>

        {cameraError && (
          <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-xs font-mono text-red-300">
            {cameraError}
          </div>
        )}

        {/* Viewport del Escáner */}
        <div className="relative rounded-2xl bg-black border-2 border-zinc-800 overflow-hidden min-h-[260px] flex items-center justify-center">
          <div
            id="qr-reader-container"
            className={`w-full ${isCameraActive ? 'block' : 'hidden'}`}
          />

          {!isCameraActive && (
            <div className="text-center p-6 space-y-2">
              <Camera className="w-10 h-10 text-zinc-500 mx-auto" />
              <div className="font-cyber font-bold text-white text-sm">Cámara en Espera</div>
              <p className="text-xs text-zinc-400 font-mono max-w-xs">
                Encendé la cámara para escanear con la lente o usá el lector USB/teclado para tipear el código.
              </p>
            </div>
          )}
        </div>

        {/* Formulario de Búsqueda Manual */}
        <form onSubmit={handleManualSearch} className="pt-2">
          <label className="text-xs font-mono text-zinc-400 block mb-1.5 font-semibold">
            Búsqueda manual en mostrador (Nombre, Apellido o DNI)
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Ej. Lucas Ferrero o 41.892.401"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-zinc-900 border border-zinc-800 rounded-xl text-white focus:outline-none focus:border-[#edcc36] font-mono min-h-[44px]"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-zinc-900 text-[#edcc36] border border-[#edcc36]/40 hover:bg-[#edcc36] hover:text-black font-mono font-bold text-xs rounded-xl transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-[#edcc36]"
            >
              Buscar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
