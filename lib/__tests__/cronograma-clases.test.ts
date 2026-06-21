import { describe, expect, it } from "vitest"
import {
  ajustarClasesCronograma,
  normalizarTotalClasesUnidad,
  resolverTotalClasesUnidad,
  type ClaseCronogramaLike,
} from "../cronograma-clases"

describe("cronograma de clases de unidad", () => {
  it("crea clases vacias cuando no hay cronograma previo", () => {
    expect(ajustarClasesCronograma(undefined, 3)).toEqual([
      { numero: 1, fecha: "", oaIds: [] },
      { numero: 2, fecha: "", oaIds: [] },
      { numero: 3, fecha: "", oaIds: [] },
    ])
  })

  it("expande sin perder fechas ni OA existentes", () => {
    const actuales: ClaseCronogramaLike[] = [
      { numero: 1, fecha: "01/04/2026", oaIds: ["OA1", "OA1", "OA2"] },
      { numero: 2, fecha: "08/04/2026", oaIds: ["OA3"] },
    ]

    expect(ajustarClasesCronograma(actuales, 4)).toEqual([
      { numero: 1, fecha: "01/04/2026", oaIds: ["OA1", "OA2"] },
      { numero: 2, fecha: "08/04/2026", oaIds: ["OA3"] },
      { numero: 3, fecha: "", oaIds: [] },
      { numero: 4, fecha: "", oaIds: [] },
    ])
  })

  it("recorta al total pedido preservando las primeras clases", () => {
    const actuales: ClaseCronogramaLike[] = [
      { numero: 1, fecha: "01/04/2026", oaIds: ["OA1"] },
      { numero: 2, fecha: "08/04/2026", oaIds: ["OA2"] },
      { numero: 3, fecha: "15/04/2026", oaIds: ["OA3"] },
    ]

    expect(ajustarClasesCronograma(actuales, 2)).toEqual([
      { numero: 1, fecha: "01/04/2026", oaIds: ["OA1"] },
      { numero: 2, fecha: "08/04/2026", oaIds: ["OA2"] },
    ])
  })

  it("normaliza el total a un rango seguro", () => {
    expect(normalizarTotalClasesUnidad(0)).toBe(8)
    expect(normalizarTotalClasesUnidad(-3)).toBe(1)
    expect(normalizarTotalClasesUnidad(99)).toBe(60)
    expect(normalizarTotalClasesUnidad(7.4)).toBe(7)
  })

  it("prioriza cronograma sobre ver unidad para resolver total", () => {
    expect(resolverTotalClasesUnidad({ totalClases: 9, clases: [] }, { clases: 7 })).toBe(9)
    expect(resolverTotalClasesUnidad(null, { clases: 7 })).toBe(7)
  })
})
