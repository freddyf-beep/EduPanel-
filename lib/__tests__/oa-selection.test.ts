import { describe, expect, it } from "vitest"
import {
  esPrimeroACuartoBasico,
  initOAsSeleccion,
  mergeOAsSeleccion,
  preservarSeleccionLegacyOa,
  sanitizeOaIds,
  type OASeleccion,
} from "../oa-selection"

describe("politica de seleccion de OA", () => {
  it("detecta 1ro a 4to basico y no confunde media", () => {
    expect(esPrimeroACuartoBasico("1ro Basico")).toBe(true)
    expect(esPrimeroACuartoBasico("2do Básico")).toBe(true)
    expect(esPrimeroACuartoBasico("3° A")).toBe(true)
    expect(esPrimeroACuartoBasico("4to basico")).toBe(true)
    expect(esPrimeroACuartoBasico("5to Basico")).toBe(false)
    expect(esPrimeroACuartoBasico("1ro Medio")).toBe(false)
  })

  it("preserva comportamiento legacy si curso o nivel estan entre 1ro y 4to basico", () => {
    expect(preservarSeleccionLegacyOa("3° A")).toBe(true)
    expect(preservarSeleccionLegacyOa("Curso Azul", "4to Básico")).toBe(true)
    expect(preservarSeleccionLegacyOa("5to Básico")).toBe(false)
  })

  it("inicializa OA oficiales desmarcados fuera del rango legacy", () => {
    const oas = initOAsSeleccion([
      { numero: 1, tipo: "OA", descripcion: "Cantar repertorio", indicadores: ["Indicador 1"] },
    ], "Musica", false)

    expect(oas[0].seleccionado).toBe(false)
    expect(oas[0].indicadores[0].seleccionado).toBe(false)
    expect(oas[0].esPropio).toBe(false)
  })

  it("mantiene seleccion legacy cuando se solicita explicitamente", () => {
    const oas = initOAsSeleccion([
      { numero: 1, tipo: "OA", descripcion: "Cantar repertorio", indicadores: ["Indicador 1"] },
    ], "Musica", true)

    expect(oas[0].seleccionado).toBe(true)
    expect(oas[0].indicadores[0].seleccionado).toBe(true)
  })

  it("elimina huerfanos oficiales y conserva propios reales fuera del rango legacy", () => {
    const base: OASeleccion[] = [
      { id: "OA1", numero: 1, descripcion: "Oficial", seleccionado: false, indicadores: [] },
    ]
    const saved: OASeleccion[] = [
      { id: "OA1", numero: 1, descripcion: "Oficial editado", seleccionado: true, indicadores: [] },
      { id: "OA99", numero: 99, descripcion: "Oficial huerfano", seleccionado: true, indicadores: [] },
      { id: "PROP_1", descripcion: "Propio real", seleccionado: true, indicadores: [], esPropio: true },
    ]

    const merged = mergeOAsSeleccion(base, saved, { conservarHuerfanosComoPropios: false })

    expect(merged.map(oa => oa.id)).toEqual(["OA1", "PROP_1"])
    expect(merged.find(oa => oa.id === "OA1")?.seleccionado).toBe(true)
    expect(merged.find(oa => oa.id === "PROP_1")?.esPropio).toBe(true)
  })

  it("preserva huerfanos como propios en comportamiento legacy", () => {
    const merged = mergeOAsSeleccion([], [
      { id: "OA99", numero: 99, descripcion: "Oficial huerfano", seleccionado: true, indicadores: [] },
    ], { conservarHuerfanosComoPropios: true })

    expect(merged).toEqual([
      { id: "OA99", numero: 99, descripcion: "Oficial huerfano", seleccionado: true, indicadores: [], esPropio: true },
    ])
  })

  it("sanea oaIds preservando solo ids validos y deduplicados", () => {
    expect(sanitizeOaIds(["OA1", "OA2", "OA1", "OA99"], new Set(["OA1", "OA2"]))).toEqual(["OA1", "OA2"])
  })
})
