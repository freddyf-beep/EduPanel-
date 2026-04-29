import type { Observacion360 } from "@/lib/curriculo"

export type SeveridadAlerta = "alta" | "media" | "baja"

export interface AlertaAlumno {
  id: string
  severidad: SeveridadAlerta
  titulo: string
  detalle: string
  accion: string
}

export interface PerfilAlertaInput {
  promedio: number | null
  porcentajeAsistencia: number | null
  pie: boolean
  notas: Record<string, string>
  observaciones: Observacion360[]
}

function diasDesde(fecha: string): number {
  const ts = new Date(`${fecha}T12:00:00`).getTime()
  if (!Number.isFinite(ts)) return Number.POSITIVE_INFINITY
  return Math.floor((Date.now() - ts) / 86_400_000)
}

export function evaluarAlumno(perfil: PerfilAlertaInput): AlertaAlumno[] {
  const alertas: AlertaAlumno[] = []

  if (perfil.porcentajeAsistencia !== null && perfil.porcentajeAsistencia < 70) {
    alertas.push({
      id: "asistencia-decreto-67",
      severidad: "alta",
      titulo: "Riesgo de repitencia por inasistencia",
      detalle: `Asistencia actual ${perfil.porcentajeAsistencia}%. Decreto 67 exige especial seguimiento cuando la asistencia baja de 85%.`,
      accion: "Citar apoderado y registrar plan de apoyo.",
    })
  }

  if (perfil.promedio !== null && perfil.promedio < 4) {
    alertas.push({
      id: "riesgo-academico",
      severidad: "alta",
      titulo: "Riesgo academico",
      detalle: `Promedio actual ${perfil.promedio.toFixed(1)} bajo nota minima de aprobacion.`,
      accion: "Planificar retroalimentacion focalizada y una oportunidad formativa breve.",
    })
  }

  const notas = Object.values(perfil.notas).map((value) => Number.parseFloat(value)).filter(Number.isFinite)
  if (notas.length >= 3) {
    const ultimas = notas.slice(-3)
    if (ultimas[0] - ultimas[2] > 0.5) {
      alertas.push({
        id: "baja-sostenida",
        severidad: "media",
        titulo: "Baja sostenida",
        detalle: `Ultimas tres evaluaciones: ${ultimas.map(n => n.toFixed(1)).join(" -> ")}.`,
        accion: "Revisar evidencias recientes y conversar con el estudiante antes de la proxima evaluacion.",
      })
    }
  }

  if (perfil.pie) {
    const ultimaPie = perfil.observaciones
      .filter(obs => obs.tipo === "pie")
      .sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
    if (!ultimaPie || diasDesde(ultimaPie.fecha) > 30) {
      alertas.push({
        id: "seguimiento-pie",
        severidad: "media",
        titulo: "Falta seguimiento PIE reciente",
        detalle: "No hay observacion PIE registrada durante los ultimos 30 dias.",
        accion: "Registrar ajuste, reunion o evidencia de seguimiento PIE.",
      })
    }
  }

  return alertas
}
