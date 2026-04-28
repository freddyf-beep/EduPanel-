// ═══════════════════════════════════════════════════════════════════════════
// Hoja de evaluación imprimible (PDF) — para uso en clase
//
// Genera una grilla con alumnos ordenados por grupo y columnas por cada parte
// de la rúbrica, con celdas vacías para que el profesor marque a mano con sus
// propias claves (ej: "C" para canto, "R" para ritmo, etc.) durante la
// presentación del grupo.
//
// Estrategia: abre nueva ventana con HTML print-friendly y dispara
// window.print() — el navegador permite "Guardar como PDF" o imprimir directo.
// Sin dependencias nuevas.
// ═══════════════════════════════════════════════════════════════════════════

import type { EvaluacionRubrica, RubricaTemplate } from "@/lib/rubricas"
import type { InfoColegio } from "@/lib/perfil"

export interface HojaEvaluacionOpciones {
  rubrica: RubricaTemplate
  evaluacion: EvaluacionRubrica
  colegio?: InfoColegio | null
  profesorNombre?: string
  fecha?: string
  /** Claves de marcado para mostrar como leyenda al pie. Ej: { C: "Canto", R: "Ritmo" } */
  clavesMarcado?: Record<string, string>
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function formatearFecha(fechaIso?: string): string {
  const d = fechaIso ? new Date(fechaIso) : new Date()
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" })
}

function buildHtml(opts: HojaEvaluacionOpciones): string {
  const { rubrica, evaluacion, colegio, profesorNombre: profesor, fecha, clavesMarcado } = opts

  const partes = (rubrica.partes || []).slice().sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
  const colegioNombre = escapeHtml(colegio?.nombre || "")
  const profesorNombre = escapeHtml(profesor || "")
  const asignatura = escapeHtml(rubrica.asignatura || "")
  const curso = escapeHtml(rubrica.curso || "")
  const rubricaNombre = escapeHtml(rubrica.nombre || "Evaluación")
  const fechaTexto = escapeHtml(formatearFecha(fecha))

  // Tabla — filas
  const filas: string[] = []
  let contadorAlumnos = 0
  for (const grupo of evaluacion.grupos) {
    if (!grupo.estudiantes.length) continue

    // Fila separadora del grupo
    filas.push(`
      <tr class="grupo-row">
        <td colspan="${partes.length + 3}" class="grupo-cell">
          <span class="grupo-tag">${escapeHtml(grupo.nombre || "Grupo")}</span>
          <span class="grupo-count">${grupo.estudiantes.length} alumno${grupo.estudiantes.length === 1 ? "" : "s"}</span>
        </td>
      </tr>
    `)

    // Filas de alumnos
    for (const est of grupo.estudiantes) {
      contadorAlumnos += 1
      const nombre = escapeHtml(est.nombre || "(sin nombre)")
      const pieBadge = est.hasPie ? `<span class="pie-badge">PIE</span>` : ""

      const celdasPartes = partes
        .map(() => `<td class="celda-marcado">&nbsp;</td>`)
        .join("")

      filas.push(`
        <tr>
          <td class="num">${contadorAlumnos}</td>
          <td class="nombre">${nombre} ${pieBadge}</td>
          ${celdasPartes}
          <td class="celda-notas">&nbsp;</td>
        </tr>
      `)
    }
  }

  if (filas.length === 0) {
    filas.push(`
      <tr><td colspan="${partes.length + 3}" class="empty-msg">
        No hay alumnos asignados a grupos. Agrégalos en la vista de evaluación.
      </td></tr>
    `)
  }

  // Cabecera de columnas con las partes
  const headerPartes = partes.map(p => {
    const oas = (p.oasVinculados || []).filter(Boolean)
    const oasText = oas.length ? `<small>${escapeHtml(oas.join(" · "))}</small>` : ""
    return `<th class="parte-th">${escapeHtml(p.nombre || "Parte")}${oasText}</th>`
  }).join("")

  // Leyenda con claves
  const clavesEntries = clavesMarcado ? Object.entries(clavesMarcado).filter(([k, v]) => k && v) : []
  const leyendaHtml = clavesEntries.length
    ? `
      <div class="leyenda">
        <strong>Claves de marcado:</strong>
        ${clavesEntries.map(([k, v]) => `<span class="clave-item"><b>${escapeHtml(k)}</b> = ${escapeHtml(v)}</span>`).join("")}
      </div>
    `
    : `
      <div class="leyenda">
        <strong>Claves de marcado:</strong>
        <span class="clave-item">Define tu sistema (ej. <b>C</b>=Canto, <b>R</b>=Ritmo, <b>A</b>=Afinación, <b>E</b>=Expresión)</span>
      </div>
    `

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Hoja de evaluación — ${rubricaNombre}</title>
<style>
  @page {
    size: A4 landscape;
    margin: 12mm 10mm 14mm 10mm;
  }

  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    padding: 0;
    font-family: 'Calibri', 'Segoe UI', sans-serif;
    color: #111;
    background: #fff;
  }

  body { padding: 14mm 10mm; }

  @media print {
    body { padding: 0; }
    .toolbar { display: none !important; }
  }

  .toolbar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    gap: 10px;
    align-items: center;
    background: #f5f5f5;
    border-bottom: 1px solid #ccc;
    padding: 10px 14px;
    font-size: 13px;
  }
  .toolbar button {
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 600;
    border: 1px solid #888;
    border-radius: 6px;
    background: #fff;
    cursor: pointer;
  }
  .toolbar button.primary {
    background: #ec4899;
    color: #fff;
    border-color: #ec4899;
  }
  .toolbar small { color: #666; }

  header.hoja-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-bottom: 2px solid #111;
    padding-bottom: 8px;
    margin-bottom: 12px;
  }
  header .col-izq h1 {
    margin: 0 0 2px 0;
    font-size: 18pt;
    font-weight: 800;
    color: #111;
    letter-spacing: -0.3px;
  }
  header .col-izq .meta {
    font-size: 10pt;
    color: #444;
    line-height: 1.4;
  }
  header .col-der {
    text-align: right;
    font-size: 9.5pt;
    color: #444;
    line-height: 1.4;
  }
  header .col-der .colegio { font-weight: 700; color: #111; font-size: 11pt; }

  .info-bar {
    display: flex;
    gap: 24px;
    font-size: 9.5pt;
    margin-bottom: 10px;
    color: #333;
  }
  .info-bar span b { color: #111; }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10pt;
    table-layout: fixed;
  }
  th, td {
    border: 1px solid #444;
    padding: 4px 6px;
    text-align: left;
    vertical-align: top;
  }
  thead th {
    background: #ececec;
    font-weight: 700;
    text-align: center;
    font-size: 10pt;
  }
  thead th small {
    display: block;
    font-weight: 400;
    font-size: 8pt;
    color: #555;
    margin-top: 1px;
  }
  th.num-th { width: 30px; text-align: center; }
  th.nombre-th { width: 200px; text-align: left; }
  th.parte-th { /* width auto */ }
  th.notas-th { width: 130px; text-align: left; }

  td.num { text-align: center; font-weight: 600; color: #555; }
  td.nombre { font-weight: 500; }
  td.celda-marcado { height: 32px; }
  td.celda-notas { height: 32px; font-size: 9pt; color: #666; }

  tr.grupo-row td.grupo-cell {
    background: #111;
    color: #fff;
    padding: 4px 8px;
    font-weight: 700;
    font-size: 10pt;
    letter-spacing: 0.3px;
  }
  .grupo-tag { text-transform: uppercase; }
  .grupo-count {
    float: right;
    font-weight: 400;
    opacity: 0.85;
    font-size: 9pt;
  }
  .pie-badge {
    display: inline-block;
    background: #f59e0b;
    color: #fff;
    font-size: 7.5pt;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
    margin-left: 4px;
    vertical-align: middle;
  }
  .empty-msg {
    text-align: center;
    color: #888;
    font-style: italic;
    padding: 20px;
  }

  .leyenda {
    margin-top: 14px;
    padding: 8px 10px;
    border: 1px dashed #888;
    border-radius: 4px;
    font-size: 9.5pt;
    color: #333;
    line-height: 1.5;
  }
  .leyenda .clave-item {
    display: inline-block;
    margin-right: 14px;
  }
  .leyenda b { color: #111; }

  .firma-row {
    display: flex;
    justify-content: space-between;
    margin-top: 28px;
    font-size: 9.5pt;
    color: #555;
  }
  .firma-row .firma {
    width: 38%;
    text-align: center;
    border-top: 1px solid #444;
    padding-top: 4px;
  }
</style>
</head>
<body>

<div class="toolbar">
  <button class="primary" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
  <button onclick="window.close()">Cerrar</button>
  <small>Sugerencia: en el diálogo de impresión, elige "Guardar como PDF" si solo quieres el archivo.</small>
</div>

<header class="hoja-header">
  <div class="col-izq">
    <h1>${rubricaNombre}</h1>
    <div class="meta">
      Hoja de evaluación en clase · ${asignatura}${curso ? ` · ${curso}` : ""}
    </div>
  </div>
  <div class="col-der">
    ${colegioNombre ? `<div class="colegio">${colegioNombre}</div>` : ""}
    ${profesorNombre ? `<div>Prof. ${profesorNombre}</div>` : ""}
    <div>Fecha: ${fechaTexto}</div>
  </div>
</header>

<div class="info-bar">
  <span><b>Total alumnos:</b> ${contadorAlumnos}</span>
  <span><b>Grupos:</b> ${evaluacion.grupos.filter(g => g.estudiantes.length).length}</span>
  <span><b>Partes evaluadas:</b> ${partes.length}</span>
  <span><b>Puntaje máximo:</b> ${rubrica.puntajeMaximo} pts</span>
</div>

<table>
  <thead>
    <tr>
      <th class="num-th">#</th>
      <th class="nombre-th">Alumno</th>
      ${headerPartes}
      <th class="notas-th">Observaciones</th>
    </tr>
  </thead>
  <tbody>
    ${filas.join("\n")}
  </tbody>
</table>

${leyendaHtml}

<div class="firma-row">
  <div class="firma">Firma del profesor</div>
  <div class="firma">Fecha de revisión</div>
</div>

<script>
  // Auto-disparar print después de cargar (con un pequeño delay para que el render termine).
  // Comentado por defecto — el usuario decide cuándo imprimir.
  // window.addEventListener('load', () => setTimeout(() => window.print(), 300))
</script>

</body>
</html>`
}

/**
 * Abre una nueva ventana con la hoja de evaluación imprimible.
 * El usuario puede revisar y luego imprimir / guardar como PDF.
 */
export function abrirHojaEvaluacionImprimible(opts: HojaEvaluacionOpciones): void {
  const html = buildHtml(opts)
  const win = window.open("", "_blank", "width=1100,height=800")
  if (!win) {
    alert("Tu navegador bloqueó la ventana emergente. Por favor permite popups para esta página.")
    return
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
}
