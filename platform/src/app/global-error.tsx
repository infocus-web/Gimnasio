'use client'

/** Error en el armado general de la página (incluye el layout raíz): HTML mínimo y propio. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es-AR">
      <body style={{ margin: 0, minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#09090b', color: '#f4f4f5', fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: 24 }}>
        <div style={{ maxWidth: 360 }}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Algo salió mal</h1>
          <p style={{ color: '#a1a1aa', fontSize: 14 }}>Probá de nuevo en unos segundos.</p>
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 16, minHeight: 44, padding: '0 20px', borderRadius: 12, border: 0, background: '#edcc36', color: '#000', fontWeight: 700, cursor: 'pointer' }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  )
}
