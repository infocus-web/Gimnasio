import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export function QrImage({ value, size = 220, className }: { value: string; size?: number; className?: string }) {
  const [src, setSrc] = useState<string>('')
  useEffect(() => {
    QRCode.toDataURL(value, { width: size * 2, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#09090b', light: '#ffffff' } })
      .then(setSrc)
      .catch(() => setSrc(''))
  }, [value, size])
  if (!src) return <div style={{ width: size, height: size }} className="animate-pulse rounded-xl bg-zinc-200" />
  return <img src={src} width={size} height={size} alt="Código QR" className={className} />
}
