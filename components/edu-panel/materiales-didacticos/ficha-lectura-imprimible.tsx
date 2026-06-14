"use client"

import { useState } from "react"
import { ArrowLeft, Printer, Settings2, Minus, Plus } from "lucide-react"
import type { FichaLecturaMusicaData } from "./ficha-lectura-musical"
import type { InfoColegio } from "@/lib/perfil"

interface Props {
  ficha: FichaLecturaMusicaData
  onVolver?: () => void
  infoColegio?: InfoColegio | null
  profesorNombre?: string
  curso?: string
}

interface ConfigImpresion {
  columnas: 1 | 2
  tamanoLetra: number
  tamanoPartitura: number
  espaciado: number
  orientacion: "landscape" | "portrait"
  mostrarHeader: boolean
  mostrarNombreSeccion: boolean
  copiasPorHoja: 1 | 2
  corteDespuesSeccion: number  // índice de sección donde cortar (para modo libro)
}

const configDefault: ConfigImpresion = {
  columnas: 2,
  tamanoLetra: 11,
  tamanoPartitura: 60,
  espaciado: 4,
  orientacion: "landscape",
  mostrarHeader: true,
  mostrarNombreSeccion: true,
  copiasPorHoja: 1,
  corteDespuesSeccion: -1,  // -1 = automático (mitad)
}

export function FichaLecturaImprimible({ ficha, onVolver, infoColegio, profesorNombre, curso }: Props) {
  const [config, setConfig] = useState<ConfigImpresion>(configDefault)
  const [panelAbierto, setPanelAbierto] = useState(false)

  const handleImprimir = () => { window.print() }
  const updateConfig = (partial: Partial<ConfigImpresion>) => { setConfig(prev => ({ ...prev, ...partial })) }

  const printPadding = config.copiasPorHoja === 2 ? "2mm 5mm" : "4mm 6mm"
  const pageOrientation = config.orientacion

  // Calcular división para modo libro
  const corteIdx = config.corteDespuesSeccion >= 0
    ? config.corteDespuesSeccion + 1
    : Math.ceil(ficha.secciones.length / 2)
  const fichaArriba: FichaLecturaMusicaData = { ...ficha, secciones: ficha.secciones.slice(0, corteIdx) }
  const fichaAbajo: FichaLecturaMusicaData = { ...ficha, secciones: ficha.secciones.slice(corteIdx) }

  return (
    <>
      {/* Controles */}
      <div className="print:hidden flex items-center gap-3 mb-3">
        {onVolver && (
          <button onClick={onVolver} className="p-2 rounded-[10px] hover:bg-muted/60 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <p className="flex-1 text-[13px] text-muted-foreground">Vista de impresión</p>
        <button
          onClick={() => setPanelAbierto(!panelAbierto)}
          className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border rounded-[10px] transition-colors ${panelAbierto ? "border-primary text-primary bg-primary/5" : "border-border text-muted-foreground hover:bg-muted/60"}`}
        >
          <Settings2 className="w-3.5 h-3.5" /> Ajustar diseño
        </button>
        <button onClick={handleImprimir} className="flex items-center gap-1.5 px-4 py-2 text-[12px] font-medium bg-primary text-primary-foreground rounded-[10px] hover:opacity-90">
          <Printer className="w-3.5 h-3.5" /> Imprimir
        </button>
      </div>

      {/* Panel de configuración */}
      {panelAbierto && (
        <div className="print:hidden bg-card border border-border rounded-[14px] p-4 mb-4 space-y-4">
          <h3 className="text-[13px] font-bold text-foreground">Ajustes de impresión</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1">Orientación</label>
              <div className="flex gap-1">
                <button onClick={() => updateConfig({ orientacion: "landscape" })} className={`px-2.5 py-1 text-[11px] rounded-[8px] border ${config.orientacion === "landscape" ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground"}`}>Horizontal</button>
                <button onClick={() => updateConfig({ orientacion: "portrait" })} className={`px-2.5 py-1 text-[11px] rounded-[8px] border ${config.orientacion === "portrait" ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground"}`}>Vertical</button>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1">Columnas</label>
              <div className="flex gap-1">
                <button onClick={() => updateConfig({ columnas: 1 })} className={`px-2.5 py-1 text-[11px] rounded-[8px] border ${config.columnas === 1 ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground"}`}>1</button>
                <button onClick={() => updateConfig({ columnas: 2 })} className={`px-2.5 py-1 text-[11px] rounded-[8px] border ${config.columnas === 2 ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground"}`}>2</button>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1">Tamaño letra: {config.tamanoLetra}px</label>
              <div className="flex items-center gap-2">
                <button onClick={() => updateConfig({ tamanoLetra: Math.max(8, config.tamanoLetra - 1) })} className="p-1 rounded border border-border hover:bg-muted/60"><Minus className="w-3 h-3" /></button>
                <input type="range" min={8} max={16} value={config.tamanoLetra} onChange={(e) => updateConfig({ tamanoLetra: Number(e.target.value) })} className="flex-1 h-1 accent-primary" />
                <button onClick={() => updateConfig({ tamanoLetra: Math.min(16, config.tamanoLetra + 1) })} className="p-1 rounded border border-border hover:bg-muted/60"><Plus className="w-3 h-3" /></button>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1">Alto partitura: {config.tamanoPartitura}px</label>
              <div className="flex items-center gap-2">
                <button onClick={() => updateConfig({ tamanoPartitura: Math.max(30, config.tamanoPartitura - 5) })} className="p-1 rounded border border-border hover:bg-muted/60"><Minus className="w-3 h-3" /></button>
                <input type="range" min={30} max={120} step={5} value={config.tamanoPartitura} onChange={(e) => updateConfig({ tamanoPartitura: Number(e.target.value) })} className="flex-1 h-1 accent-primary" />
                <button onClick={() => updateConfig({ tamanoPartitura: Math.min(120, config.tamanoPartitura + 5) })} className="p-1 rounded border border-border hover:bg-muted/60"><Plus className="w-3 h-3" /></button>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1">Espaciado: {config.espaciado}px</label>
              <div className="flex items-center gap-2">
                <button onClick={() => updateConfig({ espaciado: Math.max(0, config.espaciado - 1) })} className="p-1 rounded border border-border hover:bg-muted/60"><Minus className="w-3 h-3" /></button>
                <input type="range" min={0} max={12} value={config.espaciado} onChange={(e) => updateConfig({ espaciado: Number(e.target.value) })} className="flex-1 h-1 accent-primary" />
                <button onClick={() => updateConfig({ espaciado: Math.min(12, config.espaciado + 1) })} className="p-1 rounded border border-border hover:bg-muted/60"><Plus className="w-3 h-3" /></button>
              </div>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={config.mostrarHeader} onChange={(e) => updateConfig({ mostrarHeader: e.target.checked })} className="rounded accent-primary" />
                <span className="text-[11px] text-foreground">Encabezado</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={config.mostrarNombreSeccion} onChange={(e) => updateConfig({ mostrarNombreSeccion: e.target.checked })} className="rounded accent-primary" />
                <span className="text-[11px] text-foreground">Nombres de sección</span>
              </label>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1">Copias por hoja</label>
              <div className="flex gap-1">
                <button onClick={() => updateConfig({ copiasPorHoja: 1 })} className={`px-2.5 py-1 text-[11px] rounded-[8px] border ${config.copiasPorHoja === 1 ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground"}`}>1 (normal)</button>
                <button onClick={() => updateConfig({ copiasPorHoja: 2 })} className={`px-2.5 py-1 text-[11px] rounded-[8px] border ${config.copiasPorHoja === 2 ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground"}`}>2 (libro)</button>
              </div>
              <p className="text-[9px] text-muted-foreground mt-1">Libro = divide la hoja en 2 mitades</p>
              {config.copiasPorHoja === 2 && ficha.secciones.length > 1 && (
                <div className="mt-2">
                  <label className="block text-[10px] font-medium text-muted-foreground mb-1">Cortar después de:</label>
                  <select
                    value={config.corteDespuesSeccion}
                    onChange={(e) => updateConfig({ corteDespuesSeccion: Number(e.target.value) })}
                    className="text-[11px] px-2 py-1 rounded-[8px] border border-border bg-background w-full"
                  >
                    <option value={-1}>Automático (mitad)</option>
                    {ficha.secciones.map((s, i) => (
                      <option key={i} value={i}>
                        {s.nombre || `Sección ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>          </div>
        </div>
      )}

      {/* Hoja imprimible */}
      <div
        id="ficha-imprimible"
        style={{
          background: "white",
          color: "#1A1D2E",
          borderRadius: "14px",
          border: "1px solid #ECEEF5",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          maxWidth: config.orientacion === "landscape" ? "297mm" : "210mm",
          aspectRatio: config.orientacion === "landscape" ? "297/210" : "210/297",
          margin: "0 auto",
          padding: config.copiasPorHoja === 2 ? "3mm 4mm" : "5mm 7mm",
          display: "flex",
          flexDirection: config.copiasPorHoja === 2 ? "row" : "column",
          overflow: "hidden",
        }}
      >
        {config.copiasPorHoja === 2 ? (
          <>
            {/* Copia izquierda */}
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", paddingRight: "3mm" }}>
              <FichaContenido ficha={ficha} config={config} infoColegio={infoColegio} profesorNombre={profesorNombre} curso={curso} mitad />
            </div>
            {/* Línea de corte vertical */}
            <div style={{ borderLeft: "1px dashed #FDDDE6", margin: "0", flexShrink: 0, position: "relative", alignSelf: "stretch" }}>
              <span style={{ position: "absolute", top: "50%", left: "-3px", transform: "translateY(-50%) rotate(-90deg)", background: "white", padding: "0 4px", fontSize: "6px", color: "#7B809A", whiteSpace: "nowrap" }}>{"✂ cortar"}</span>
            </div>
            {/* Copia derecha */}
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", paddingLeft: "3mm" }}>
              <FichaContenido ficha={ficha} config={config} infoColegio={infoColegio} profesorNombre={profesorNombre} curso={curso} mitad />
            </div>
          </>
        ) : (
          <FichaContenido ficha={ficha} config={config} infoColegio={infoColegio} profesorNombre={profesorNombre} curso={curso} />
        )}
      </div>

      {/* Print styles - using a style tag without template literal interpolation */}
      <style
        dangerouslySetInnerHTML={{ __html: `
          @media print {
            body * { visibility: hidden; }
            #ficha-imprimible, #ficha-imprimible * { visibility: visible !important; }
            #ficha-imprimible {
              position: fixed;
              top: 0; left: 0;
              width: 100%; height: 100%;
              z-index: 99999;
              border: none !important;
              border-radius: 0 !important;
              box-shadow: none !important;
              max-width: none !important;
              aspect-ratio: auto !important;
              padding: ${printPadding} !important;
            }
            @page {
              margin: 0;
              size: letter ${pageOrientation};
            }
          }
        `}}
      />
    </>
  )
}

// ── Sub-componente: una copia de la ficha ────────────────────────────────────

interface FichaContenidoProps {
  ficha: FichaLecturaMusicaData
  config: ConfigImpresion
  infoColegio?: InfoColegio | null
  profesorNombre?: string
  curso?: string
  mitad?: boolean
}

function FichaContenido({ ficha, config, infoColegio, profesorNombre, curso, mitad }: FichaContenidoProps) {
  const scaledLetra = mitad ? Math.max(8, config.tamanoLetra - 2) : config.tamanoLetra
  const scaledPartitura = mitad ? Math.max(25, config.tamanoPartitura - 15) : config.tamanoPartitura
  const scaledEspaciado = mitad ? Math.max(1, config.espaciado - 2) : config.espaciado

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {config.mostrarHeader && (
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "2px", marginBottom: "3px", borderBottom: "1.5px solid #FDDDE6", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            {infoColegio?.logoBase64 && <img src={infoColegio.logoBase64} alt="Logo" style={{ width: mitad ? 18 : 24, height: mitad ? 18 : 24, objectFit: "contain", borderRadius: 3 }} />}
            <div>
              {infoColegio?.nombre && <p style={{ fontSize: mitad ? "7px" : "8px", fontWeight: 700, color: "#374151", margin: 0, lineHeight: 1.2 }}>{infoColegio.nombre}</p>}
              {profesorNombre && <p style={{ fontSize: mitad ? "6px" : "7px", color: "#7B809A", margin: 0 }}>Prof. {profesorNombre}</p>}
            </div>
          </div>
          <div style={{ textAlign: "center", flex: 1, padding: "0 8px" }}>
            <p style={{ fontSize: mitad ? "6px" : "7px", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, color: "#F03E6E", margin: 0 }}>{"🎵 Ficha de Lectura Musical"}</p>
            <h1 style={{ fontSize: mitad ? "12px" : "15px", fontWeight: 800, color: "#1A1D2E", margin: "0", lineHeight: 1.1 }}>{ficha.cancion}</h1>
            <p style={{ fontSize: mitad ? "8px" : "9px", color: "#7B809A", fontWeight: 500, margin: 0 }}>{ficha.artista}</p>
          </div>
          <div>{curso && <span style={{ fontSize: mitad ? "6px" : "7px", fontWeight: 700, color: "#F03E6E", background: "#FFF0F4", padding: "1px 5px", borderRadius: 8, border: "1px solid #FDDDE6" }}>{curso}</span>}</div>
        </header>
      )}

      <div style={{ flex: 1, columnCount: mitad ? 1 : config.columnas, columnGap: "4mm", columnRule: config.columnas > 1 && !mitad ? "1px solid #FDDDE6" : "none", overflow: "hidden" }}>
        {ficha.secciones.map((seccion, sIdx) => (
          <div key={sIdx} style={{ breakInside: "avoid-column", marginBottom: `${scaledEspaciado}px` }}>
            {config.mostrarNombreSeccion && seccion.nombre && (
              <div style={{ textAlign: "center", margin: `${scaledEspaciado / 2}px 0` }}>
                <span style={{ fontSize: mitad ? "6px" : "7px", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700, color: "#F03E6E", background: "#FFF0F4", padding: "1px 5px", borderRadius: 6, border: "1px solid #FDDDE6", display: "inline-block" }}>
                  {seccion.nombre}
                </span>
              </div>
            )}
            {seccion.bloques.map((bloque, bIdx) => {
              if (bloque.tipo === "partitura") {
                if (!bloque.imagenSrc) return null
                return (
                  <div key={bIdx} style={{ border: "1px solid #FDDDE6", borderRadius: 3, overflow: "hidden", margin: `${scaledEspaciado / 2}px 0`, background: "white" }}>
                    <img src={bloque.imagenSrc} alt={bloque.alt || "Partitura"} style={{ width: "100%", height: "auto", maxHeight: `${scaledPartitura}px`, objectFit: "contain", padding: "1px", display: "block" }} />
                  </div>
                )
              }
              if (bloque.tipo === "letra") {
                const tieneContenido = bloque.lineas.some(l => l.trim().length > 0)
                if (!tieneContenido) return null
                return (
                  <div key={bIdx} style={{ paddingLeft: "4px", borderLeft: "2px solid rgba(240,62,110,0.25)", margin: `${scaledEspaciado / 2}px 0` }}>
                    {bloque.lineas.map((linea, li) => (
                      <p key={li} style={{ fontSize: `${scaledLetra}px`, lineHeight: 1.35, margin: 0, color: "#1A1D2E" }}>
                        {linea || "\u00A0"}
                      </p>
                    ))}
                  </div>
                )
              }
              if (bloque.tipo === "sticker") {
                if (!bloque.imagenSrc) return null
                const justify = bloque.posicion === "izquierda" ? "flex-start" : bloque.posicion === "derecha" ? "flex-end" : "center"
                const size = mitad ? Math.min((bloque.tamano || 30) - 10, 25) : Math.min(bloque.tamano || 30, 40)
                return (
                  <div key={bIdx} style={{ display: "flex", justifyContent: justify, margin: `${scaledEspaciado / 2}px 0` }}>
                    <img src={bloque.imagenSrc} alt="Sticker" style={{ width: size, height: "auto", objectFit: "contain" }} />
                  </div>
                )
              }
              return null
            })}
          </div>
        ))}
      </div>

      <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: mitad ? "6px" : "7px", color: "#7B809A", paddingTop: "1px", marginTop: "2px", borderTop: "1px solid #FDDDE6", flexShrink: 0 }}>
        <span>{"♪ EduPanel"}</span>
        <span>{ficha.cancion} — {ficha.artista}</span>
      </footer>
    </div>
  )
}
