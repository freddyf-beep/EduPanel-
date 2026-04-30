"use client"

// Captura errores en el root layout (donde app/error.tsx no llega).
// Tiene que renderizar su propio <html> y <body>.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="es">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <div style={{ maxWidth: 480, margin: "10vh auto", textAlign: "center" }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
            Error critico
          </h1>
          <p style={{ color: "#6b7280", marginBottom: 16 }}>
            La aplicacion no pudo cargar. Recarga la pagina o vuelve mas tarde.
          </p>
          {error.digest && (
            <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: 16, fontFamily: "monospace" }}>
              ID: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              background: "#f43f5e",
              color: "white",
              padding: "10px 16px",
              borderRadius: 12,
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  )
}
