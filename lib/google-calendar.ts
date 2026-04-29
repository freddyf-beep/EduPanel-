"use client"

import { cargarCronograma, guardarCronograma } from "@/lib/curriculo"
import type { ActividadCronograma } from "@/lib/curriculo"
import { cargarHorarioSemanal } from "@/lib/horario"

export const GOOGLE_CALENDAR_TOKEN_KEY = "edupanel_google_calendar_token"
export const GOOGLE_CALENDAR_CONNECTED_KEY = "edupanel_google_calendar_connected"
export const GOOGLE_CALENDAR_AUTOSYNC_KEY = "edupanel_google_calendar_autosync"

const TIME_ZONE = "America/Santiago"
const DIAS_MAP: Record<string, number> = {
  Lunes: 1,
  Martes: 2,
  "Miercoles": 3,
  "Miércoles": 3,
  "MiÃ©rcoles": 3,
  Jueves: 4,
  Viernes: 5,
}

export type GoogleCalendarEventPayload = {
  summary: string
  description: string
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
  extendedProperties: {
    private: Record<string, string>
  }
}

export type SincronizacionGoogleResultado = {
  actividades: ActividadCronograma[]
  creados: number
  actualizados: number
  eliminados: number
}

function storage() {
  if (typeof window === "undefined") return null
  return window
}

export function guardarGoogleCalendarToken(token: string) {
  const win = storage()
  if (!win) return
  win.sessionStorage.setItem(GOOGLE_CALENDAR_TOKEN_KEY, token)
  win.localStorage.setItem(GOOGLE_CALENDAR_CONNECTED_KEY, "true")
  if (win.localStorage.getItem(GOOGLE_CALENDAR_AUTOSYNC_KEY) == null) {
    win.localStorage.setItem(GOOGLE_CALENDAR_AUTOSYNC_KEY, "true")
  }
}

export function getGoogleCalendarToken(): string | null {
  const win = storage()
  return win?.sessionStorage.getItem(GOOGLE_CALENDAR_TOKEN_KEY) || null
}

export function isGoogleCalendarConnected(): boolean {
  const win = storage()
  return win?.localStorage.getItem(GOOGLE_CALENDAR_CONNECTED_KEY) === "true"
}

export function isGoogleCalendarAutosyncEnabled(): boolean {
  const win = storage()
  return win?.localStorage.getItem(GOOGLE_CALENDAR_AUTOSYNC_KEY) !== "false"
}

export function setGoogleCalendarAutosync(enabled: boolean) {
  const win = storage()
  win?.localStorage.setItem(GOOGLE_CALENDAR_AUTOSYNC_KEY, enabled ? "true" : "false")
}

export function desconectarGoogleCalendar() {
  const win = storage()
  if (!win) return
  win.sessionStorage.removeItem(GOOGLE_CALENDAR_TOKEN_KEY)
  win.localStorage.removeItem(GOOGLE_CALENDAR_CONNECTED_KEY)
}

function getLunesDeSemana(weekNum: number, year: number): Date {
  const onejan = new Date(year, 0, 1)
  const offsetDays = (weekNum - 1) * 7 - onejan.getDay() + 1
  const d = new Date(year, 0, 1 + offsetDays)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function fechaActividad(act: ActividadCronograma, year: number): Date {
  const lunes = getLunesDeSemana(act.semana, year)
  const fecha = new Date(lunes)
  fecha.setDate(fecha.getDate() + ((DIAS_MAP[act.dia] || 1) - 1))
  const [hh, mm] = (act.hora || "08:30").split(":").map(n => parseInt(n, 10))
  fecha.setHours(Number.isFinite(hh) ? hh : 8, Number.isFinite(mm) ? mm : 30, 0, 0)
  return fecha
}

function parseDuracion(s: string): number {
  const m = (s || "").match(/([\d.]+)\s*(min|h)?/i)
  if (!m) return 45
  const n = parseFloat(m[1])
  return /h/i.test(m[2] || "") ? Math.round(n * 60) : Math.round(n)
}

function localDateTime(date: Date): string {
  const pad = (n: number) => `${n}`.padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`
}

async function googleFetch<T>(accessToken: string, url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`Google Calendar ${res.status}: ${detail}`)
  }
  if (res.status === 204) return {} as T
  return res.json() as Promise<T>
}

export function actividadCronogramaToGoogleEvent(
  act: ActividadCronograma,
  year: number,
  asignatura: string,
  curso: string,
): GoogleCalendarEventPayload {
  const start = fechaActividad(act, year)
  const end = new Date(start)
  end.setMinutes(end.getMinutes() + parseDuracion(act.duracion))

  return {
    summary: `${act.tipo}: ${act.nombre}`,
    description: `EduPanel - ${asignatura} - ${curso}\nUnidad: ${act.unidad || "Sin unidad"}`,
    start: { dateTime: localDateTime(start), timeZone: TIME_ZONE },
    end: { dateTime: localDateTime(end), timeZone: TIME_ZONE },
    extendedProperties: {
      private: {
        edupanelId: act.id,
        edupanelCurso: curso,
        edupanelAsignatura: asignatura,
      },
    },
  }
}

export async function crearEventoGoogle(
  accessToken: string,
  evento: GoogleCalendarEventPayload,
): Promise<{ id: string }> {
  return googleFetch(accessToken, "https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    body: JSON.stringify(evento),
  })
}

export async function actualizarEventoGoogle(
  accessToken: string,
  eventId: string,
  evento: GoogleCalendarEventPayload,
): Promise<{ id: string }> {
  return googleFetch(accessToken, `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    body: JSON.stringify(evento),
  })
}

export async function eliminarEventoGoogle(accessToken: string, eventId: string): Promise<void> {
  await googleFetch(accessToken, `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
  })
}

export async function sincronizarActividadesGoogle(params: {
  accessToken: string
  actividadesAntes: ActividadCronograma[]
  actividadesDespues: ActividadCronograma[]
  year: number
  asignatura: string
  curso: string
}): Promise<SincronizacionGoogleResultado> {
  const { accessToken, actividadesAntes, actividadesDespues, year, asignatura, curso } = params
  const despuesPorId = new Map(actividadesDespues.map(act => [act.id, act]))
  let creados = 0
  let actualizados = 0
  let eliminados = 0

  for (const act of actividadesAntes) {
    if (!despuesPorId.has(act.id) && act.googleEventId) {
      try {
        await eliminarEventoGoogle(accessToken, act.googleEventId)
        eliminados += 1
      } catch {
        // Si el evento ya no existe en Google, el estado local sigue siendo valido.
      }
    }
  }

  const actividades = [...actividadesDespues]
  for (let i = 0; i < actividades.length; i += 1) {
    const act = actividades[i]
    const payload = actividadCronogramaToGoogleEvent(act, year, asignatura, act.cursoOrigen || curso)
    if (act.googleEventId) {
      await actualizarEventoGoogle(accessToken, act.googleEventId, payload)
      actualizados += 1
      continue
    }

    const creado = await crearEventoGoogle(accessToken, payload)
    actividades[i] = { ...act, googleEventId: creado.id }
    creados += 1
  }

  return { actividades, creados, actualizados, eliminados }
}

export async function sincronizarCronogramasGoogle(params: {
  accessToken: string
  asignatura: string
  year: number
}): Promise<SincronizacionGoogleResultado> {
  const { accessToken, asignatura, year } = params
  const horario = await cargarHorarioSemanal()
  const cursos = Array.from(new Set(horario.map(h => h.resumen).filter(Boolean)))
  const total: SincronizacionGoogleResultado = { actividades: [], creados: 0, actualizados: 0, eliminados: 0 }

  for (const curso of cursos) {
    const crono = await cargarCronograma(asignatura, curso)
    const actividades = crono?.actividades || []
    const res = await sincronizarActividadesGoogle({
      accessToken,
      actividadesAntes: actividades,
      actividadesDespues: actividades,
      year,
      asignatura,
      curso,
    })
    total.creados += res.creados
    total.actualizados += res.actualizados
    total.eliminados += res.eliminados
    total.actividades.push(...res.actividades.map(act => ({ ...act, cursoOrigen: curso })))
    if (res.creados > 0) {
      await guardarCronograma(asignatura, curso, res.actividades)
    }
  }

  return total
}
