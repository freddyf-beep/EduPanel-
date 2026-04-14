"use client"

import { useAuth } from "@/components/auth/auth-context"
import { useEffect, useState } from "react"
import { cargarPerfil, guardarPerfil, PerfilUsuario } from "@/lib/perfil"
import { cargarHorarioSemanal, guardarHorarioSemanal, ClaseHorario } from "@/lib/horario"
import { cargarEstudiantes, guardarEstudiantes, Estudiante } from "@/lib/estudiantes"
import { Loader2, UserCircle, Briefcase, GraduationCap, FileText, CheckCircle, Calendar, Plus, Trash2, Clock, Users, Pencil, RefreshCw, ChevronDown, ChevronUp, BookMarked } from "lucide-react"
import { cargarNivelMapping, guardarNivelMapping, NIVELES_CURRICULARES, type NivelMapping } from "@/lib/nivel-mapping"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { cn } from "@/lib/utils"

export function PerfilContent() {
  const { user } = useAuth()
  const { asignatura } = useActiveSubject()
  const [activeTab, setActiveTab] = useState<"datos" | "horario" | "estudiantes" | "niveles">("datos")
  const [loading, setLoading] = useState(true)

  // Perfil state
  const [savingPerfil, setSavingPerfil] = useState(false)
  const [savedPerfil, setSavedPerfil] = useState(false)
  const [perfil, setPerfil] = useState<PerfilUsuario>({
    tipoProfesor: "", especialidad: "", estudios: "", biografia: ""
  })

  // Horario state
  const [savingHorario, setSavingHorario] = useState(false)
  const [savedHorario, setSavedHorario] = useState(false)
  const [horario, setHorario] = useState<ClaseHorario[]>([])
  
  // Nuevo/Editar bloque form
  const [editingUid, setEditingUid] = useState<string | null>(null)
  const [nuevoBloque, setNuevoBloque] = useState<{
    dia: ClaseHorario["dia"], horaInicio: string, horaFin: string, resumen: string, tipo: ClaseHorario["tipo"], color: string
  }>({
    dia: "Lunes",
    horaInicio: "08:00",
    horaFin: "09:30",
    resumen: "",
    tipo: "clase",
    color: "#3B82F6"
  })

  // Nivel mapping state
  const [nivelMapping, setNivelMapping] = useState<NivelMapping>({})
  const [savingMapping, setSavingMapping] = useState(false)
  const [savedMapping, setSavedMapping] = useState(false)

  // Estudiantes state
  const [cursoEstudiantes, setCursoEstudiantes] = useState("")
  const [estudiantes, setEstudiantes] = useState<Estudiante[]>([])
  const [loadingEstudiantes, setLoadingEstudiantes] = useState(false)
  const [savingEstudiantes, setSavingEstudiantes] = useState(false)
  const [savedEstudiantes, setSavedEstudiantes] = useState(false)
  const [nuevoNombreEstudiante, setNuevoNombreEstudiante] = useState("")
  const [expandedPie, setExpandedPie] = useState<string | null>(null)

  const cursosDisponibles = Array.from(new Set(horario.map(h => h.resumen)))

  useEffect(() => {
    Promise.all([cargarPerfil(), cargarHorarioSemanal(), cargarNivelMapping()])
      .then(([pData, hData, mapping]) => {
        if (pData) setPerfil(pData)
        if (hData) setHorario(hData)
        if (mapping) setNivelMapping(mapping)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!cursoEstudiantes && cursosDisponibles.length > 0) {
      setCursoEstudiantes(cursosDisponibles[0])
    }
  }, [cursosDisponibles, cursoEstudiantes])

  useEffect(() => {
    if (!cursoEstudiantes) return
    setLoadingEstudiantes(true)
    cargarEstudiantes(cursoEstudiantes)
      .then(setEstudiantes)
      .finally(() => setLoadingEstudiantes(false))
  }, [cursoEstudiantes])

  const handleChangePerfil = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setPerfil({ ...perfil, [e.target.name]: e.target.value })
  }

  const handleSavePerfil = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingPerfil(true)
    setSavedPerfil(false)
    try {
      await guardarPerfil(perfil)
      setSavedPerfil(true)
      setTimeout(() => setSavedPerfil(false), 3000)
    } catch (error) { console.error(error) } 
    finally { setSavingPerfil(false) }
  }

  const handleAddOrEditBloque = (e: React.FormEvent) => {
    e.preventDefault()
    if (!nuevoBloque.resumen || !nuevoBloque.horaInicio || !nuevoBloque.horaFin) return
    
    if (editingUid) {
      setHorario(prev => prev.map(c => c.uid === editingUid ? { ...nuevoBloque, uid: editingUid } as ClaseHorario : c))
      setEditingUid(null)
    } else {
      const id = `${nuevoBloque.dia.toLowerCase().substring(0,3)}-${nuevoBloque.resumen.replace(/\s+/g,"").toLowerCase()}-${Date.now()}`
      setHorario(prev => [...prev, { ...nuevoBloque, uid: id } as ClaseHorario])
    }
    
    setNuevoBloque({ ...nuevoBloque, resumen: "" })
  }

  const startEditBloque = (b: ClaseHorario) => {
    setEditingUid(b.uid)
    setNuevoBloque({
      dia: b.dia,
      horaInicio: b.horaInicio,
      horaFin: b.horaFin,
      resumen: b.resumen,
      tipo: b.tipo,
      color: b.color
    })
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleRemoveBloque = (uid: string) => {
    setHorario(prev => prev.filter(c => c.uid !== uid))
    if (editingUid === uid) {
      setEditingUid(null)
      setNuevoBloque({ ...nuevoBloque, resumen: "" })
    }
  }

  const handleSaveHorario = async () => {
    setSavingHorario(true)
    setSavedHorario(false)
    try {
      await guardarHorarioSemanal(horario)
      setSavedHorario(true)
      setTimeout(() => setSavedHorario(false), 3000)
    } catch (error) { console.error(error) } 
    finally { setSavingHorario(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"] as const

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between animate-fade-up">
        <h1 className="text-[22px] font-extrabold text-foreground">Configuración</h1>
      </div>

      {/* Tabs */}
      <div className="flex w-full max-w-full overflow-x-auto rounded-xl border border-border bg-card p-1.5 animate-fade-up shadow-sm sm:w-fit">
        <button 
          onClick={() => setActiveTab("datos")}
          className={cn("flex items-center gap-2 rounded-lg px-5 py-2 text-[13px] font-bold whitespace-nowrap transition-colors", 
            activeTab === "datos" ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:bg-background")}
        >
          <Briefcase className="w-4 h-4" /> Datos Profesionales
        </button>
        <button 
          onClick={() => setActiveTab("horario")}
          className={cn("flex items-center gap-2 rounded-lg px-5 py-2 text-[13px] font-bold whitespace-nowrap transition-colors", 
            activeTab === "horario" ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:bg-background")}
        >
          <Calendar className="w-4 h-4" /> Mi Horario y Cursos
        </button>
        <button
          onClick={() => setActiveTab("estudiantes")}
          className={cn("flex items-center gap-2 rounded-lg px-5 py-2 text-[13px] font-bold whitespace-nowrap transition-colors",
            activeTab === "estudiantes" ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:bg-background")}
        >
          <Users className="w-4 h-4" /> Mis Estudiantes
        </button>
        <button
          onClick={() => setActiveTab("niveles")}
          className={cn("flex items-center gap-2 rounded-lg px-5 py-2 text-[13px] font-bold whitespace-nowrap transition-colors",
            activeTab === "niveles" ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:bg-background")}
        >
          <BookMarked className="w-4 h-4" /> Niveles Curriculares
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6 animate-fade-up" style={{ animationDelay: "0.1s" }}>
        
        {/* Left Column: Read Only Auth Profile */}
        <div className="bg-card border border-border rounded-2xl p-6 text-center shadow-sm h-fit">
          <div className="relative inline-block mb-4 hover:scale-105 transition-transform">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="Foto" className="w-24 h-24 rounded-full border-4 border-white shadow-xl object-cover" />
            ) : (
              <div className="w-24 h-24 rounded-full border-4 border-white shadow-xl bg-gradient-to-br from-primary to-pink-mid flex items-center justify-center text-white text-3xl font-extrabold">
                {user?.displayName?.charAt(0) || "U"}
              </div>
            )}
            <div className="absolute bottom-1 right-1 w-5 h-5 bg-green-500 border-2 border-white rounded-full"></div>
          </div>
          <h2 className="text-[17px] font-bold text-foreground mb-1">{user?.displayName || "Profesor"}</h2>
          <p className="text-[13px] text-muted-foreground font-medium mb-4">{user?.email}</p>
          <div className="bg-muted/30 border border-border rounded-xl p-3 text-left">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
              <UserCircle className="w-3.5 h-3.5" /> Cuenta de Google
            </p>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              La foto, nombre y correo están vinculados a tu cuenta de Google y no pueden modificarse desde aquí.
            </p>
          </div>
        </div>

        {/* Right Column: Tab Content */}
        <div className="bg-card border border-border rounded-2xl p-6 md:p-8 shadow-sm">
          
          {activeTab === "datos" && (
            <div className="animate-in fade-in slide-in-from-bottom-2">
              <h3 className="text-[16px] font-extrabold mb-5 flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-primary" /> Datos Profesionales
              </h3>
              <form onSubmit={handleSavePerfil} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">Tipo de Docente</label>
                    <select name="tipoProfesor" value={perfil.tipoProfesor} onChange={handleChangePerfil} className="w-full h-11 bg-background border border-border rounded-xl px-4 text-[13px] font-medium outline-none">
                      <option value="">Selecciona tu rol...</option>
                      <option value="General Básica">Profesor(a) de Ed. General Básica</option>
                      <option value="Media">Profesor(a) de Educación Media</option>
                      <option value="Diferencial">Educador(a) Diferencial</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">Especialidad / Asignatura</label>
                    <input type="text" name="especialidad" value={perfil.especialidad} onChange={handleChangePerfil} className="w-full h-11 bg-background border border-border rounded-xl px-4 text-[13px] font-medium outline-none" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><GraduationCap className="w-3.5 h-3.5" /> Estudios y Títulos</label>
                  <input type="text" name="estudios" value={perfil.estudios} onChange={handleChangePerfil} className="w-full h-11 bg-background border border-border rounded-xl px-4 text-[13px] font-medium outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Biografía</label>
                  <textarea name="biografia" value={perfil.biografia} onChange={handleChangePerfil} rows={4} className="w-full bg-background border border-border rounded-xl p-4 text-[13px] font-medium outline-none resize-none" />
                </div>
                <div className="pt-4 flex flex-wrap items-center gap-4">
                  <button type="submit" disabled={savingPerfil} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-[13px] font-bold text-white hover:bg-opacity-90 sm:w-auto">
                    {savingPerfil ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar Datos"}
                  </button>
                  {savedPerfil && <span className="text-green-600 font-bold text-[13px] flex items-center gap-1.5 animate-in fade-in"><CheckCircle className="w-4 h-4" /> Guardado</span>}
                </div>
              </form>
            </div>
          )}

          {activeTab === "horario" && (
            <div className="animate-in fade-in slide-in-from-bottom-2">
              <h3 className="text-[16px] font-extrabold mb-2 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" /> Constructor de Horario
              </h3>
              <p className="text-[13px] text-muted-foreground mb-6">Añade o edita los bloques de clases o talleres semanales. La aplicación extraerá automáticamente tus cursos desde aquí para tu menú lateral.</p>
              
              <form onSubmit={handleAddOrEditBloque} className={cn("mb-6 flex flex-wrap items-end gap-4 rounded-xl border p-4 transition-colors", editingUid ? "bg-pink-50/50 border-primary" : "bg-background border-border")}>
                <div className="min-w-[120px] flex-1 space-y-1">
                  <label className="text-[11px] font-bold uppercase text-muted-foreground">Día</label>
                  <select value={nuevoBloque.dia} onChange={e => setNuevoBloque({...nuevoBloque, dia: e.target.value as any})} className="w-full h-10 rounded-lg border border-border px-3 text-[13px] outline-none">
                    {DIAS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="min-w-[140px] flex-1 space-y-1">
                  <label className="text-[11px] font-bold uppercase text-muted-foreground">Curso (Ej. 1° Medio)</label>
                  <input type="text" required value={nuevoBloque.resumen} onChange={e => setNuevoBloque({...nuevoBloque, resumen: e.target.value})} className="w-full h-10 rounded-lg border border-border px-3 text-[13px] outline-none" />
                </div>
                <div className="w-full space-y-1 sm:w-[90px]">
                  <label className="text-[11px] font-bold uppercase text-muted-foreground"><Clock className="inline w-3 h-3"/> Inicio</label>
                  <input type="time" required value={nuevoBloque.horaInicio} onChange={e => setNuevoBloque({...nuevoBloque, horaInicio: e.target.value})} className="w-full h-10 rounded-lg border border-border px-2 text-[13px] outline-none" />
                </div>
                <div className="w-full space-y-1 sm:w-[90px]">
                  <label className="text-[11px] font-bold uppercase text-muted-foreground"><Clock className="inline w-3 h-3"/> Fin</label>
                  <input type="time" required value={nuevoBloque.horaFin} onChange={e => setNuevoBloque({...nuevoBloque, horaFin: e.target.value})} className="w-full h-10 rounded-lg border border-border px-2 text-[13px] outline-none" />
                </div>
                <div className="min-w-[100px] flex-1 space-y-1">
                  <label className="text-[11px] font-bold uppercase text-muted-foreground">Tipo</label>
                  <select value={nuevoBloque.tipo} onChange={e => setNuevoBloque({...nuevoBloque, tipo: e.target.value as any})} className="w-full h-10 rounded-lg border border-border px-3 text-[13px] outline-none">
                    <option value="clase">Clase regular</option>
                    <option value="taller">Taller / Extra</option>
                    <option value="orientacion">Orientación</option>
                    <option value="consejo">Consejo</option>
                  </select>
                </div>
                <div className="w-full space-y-1 sm:w-[72px]">
                  <label className="text-[11px] font-bold uppercase text-muted-foreground">Color</label>
                  <input type="color" value={nuevoBloque.color} onChange={e => setNuevoBloque({...nuevoBloque, color: e.target.value})} className="w-full h-10 rounded-lg border border-border p-1 cursor-pointer" />
                </div>
                <button type="submit" className={cn("flex h-10 w-full items-center justify-center gap-1.5 rounded-lg px-4 text-white transition-colors sm:w-auto", editingUid ? "bg-primary hover:bg-pink-dark" : "bg-slate-900 hover:bg-slate-800")}>
                  {editingUid ? <RefreshCw className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {editingUid ? "Actualizar" : "Añadir"}
                </button>
                {editingUid && (
                  <button type="button" onClick={() => { setEditingUid(null); setNuevoBloque({...nuevoBloque, resumen: ""}) }} className="text-[13px] font-bold text-muted-foreground hover:text-foreground">
                    Cancelar
                  </button>
                )}
              </form>

              {horario.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-border rounded-xl text-muted-foreground">
                  <Calendar className="w-10 h-10 mx-auto opacity-20 mb-2" />
                  <p className="text-[13px]">No hay bloques añadidos a tu horario.</p>
                </div>
              ) : (
                <div className="border border-border rounded-xl overflow-hidden mb-6 flex flex-col gap-px bg-border">
                  {DIAS.map(dia => {
                    const deHoy = horario.filter(h => h.dia === dia).sort((a,b) => a.horaInicio.localeCompare(b.horaInicio))
                    if (deHoy.length === 0) return null
                    return (
                      <div key={dia} className="flex flex-col bg-card sm:flex-row">
                        <div className="flex items-center justify-center border-b border-border bg-muted/30 p-3 text-[12px] font-extrabold uppercase text-primary sm:w-24 sm:border-b-0 sm:border-r">
                          {dia}
                        </div>
                        <div className="flex-1 p-3 flex flex-wrap gap-3">
                          {deHoy.map(b => (
                            <div key={b.uid} className={cn("flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg border text-[12px] group shadow-sm transition-colors", editingUid === b.uid ? "bg-pink-light border-primary" : "bg-card")}>
                              <span className="w-2.5 h-2.5 rounded-full block" style={{ background: b.color }} />
                              <span className="font-bold">{b.resumen}</span>
                              <span className="text-muted-foreground ml-1">{b.horaInicio}-{b.horaFin}</span>
                              
                              <button onClick={() => startEditBloque(b)} className="ml-auto text-slate-300 transition-all hover:text-blue-500 opacity-100 sm:opacity-0 sm:group-hover:opacity-100" title="Editar">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleRemoveBloque(b.uid)} className="ml-1 text-slate-300 transition-all hover:text-red-500 opacity-100 sm:opacity-0 sm:group-hover:opacity-100" title="Eliminar">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="pt-4 border-t border-border flex flex-wrap items-center gap-4">
                <button onClick={handleSaveHorario} disabled={savingHorario} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-[13px] font-bold text-white hover:bg-opacity-90 sm:w-auto">
                  {savingHorario ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar Horario Completo"}
                </button>
                {savedHorario && <span className="text-green-600 font-bold text-[13px] flex items-center gap-1.5 animate-in fade-in"><CheckCircle className="w-4 h-4" /> Guardado exitosamente</span>}
              </div>
            </div>
          )}

          {activeTab === "estudiantes" && (
            <div className="animate-in fade-in slide-in-from-bottom-2">
              <h3 className="text-[16px] font-extrabold mb-2 flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" /> Estudiantes por Curso
              </h3>
              <p className="text-[13px] text-muted-foreground mb-6">Añade los estudiantes a cada curso para llevar la asistencia y calificaciones.</p>
              
              <div className="mb-5 flex flex-wrap gap-4">
                <div className="w-full space-y-1 sm:max-w-[240px]">
                  <label className="text-[11px] font-bold uppercase text-muted-foreground">Curso</label>
                  <select value={cursoEstudiantes} onChange={e => setCursoEstudiantes(e.target.value)} className="w-full h-10 rounded-lg border border-border px-3 text-[13px] outline-none bg-background">
                    {cursosDisponibles.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {loadingEstudiantes ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : !cursoEstudiantes ? (
                <div className="text-center py-10 border-2 border-dashed border-border rounded-xl text-muted-foreground">
                  <p className="text-[13px]">No hay cursos disponibles. Agrega bloques de clases primero.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <form onSubmit={e => {
                      e.preventDefault()
                      if (!nuevoNombreEstudiante.trim()) return
                      setEstudiantes([...estudiantes, { id: `est_${Date.now()}`, nombre: nuevoNombreEstudiante.trim() }])
                      setNuevoNombreEstudiante("")
                    }} className="flex flex-col gap-2 sm:flex-row">
                    <input type="text" value={nuevoNombreEstudiante} onChange={e => setNuevoNombreEstudiante(e.target.value)} placeholder="Nombre del estudiante (Ej: Tapia, Juan)" className="flex-1 h-10 rounded-lg border border-border px-3 text-[13px] outline-none" />
                    <button type="submit" className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 text-white transition-colors hover:bg-slate-800 sm:w-auto">
                      <Plus className="w-4 h-4" /> Añadir
                    </button>
                  </form>

                  {estudiantes.length === 0 ? (
                    <div className="text-center py-8 border border-border rounded-xl text-muted-foreground bg-muted/30">
                      <p className="text-[13px]">No hay estudiantes añadidos a {cursoEstudiantes}.</p>
                    </div>
                  ) : (
                    <div className="border border-border rounded-xl overflow-hidden bg-background">
                      {estudiantes.map((est, i) => {
                        const isPieExpanded = est.pie && expandedPie === est.id
                        return (
                          <div key={est.id} className="border-b border-border last:border-b-0">
                            <div className="flex items-center justify-between p-3 group hover:bg-muted/30 transition-colors">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-[11px] font-bold text-muted-foreground w-6 text-right flex-shrink-0">{i + 1}.</span>
                                <span className="text-[13px] font-medium text-foreground truncate">{est.nombre}</span>
                                {est.pie && (
                                  <span className="flex-shrink-0 rounded bg-status-pie-bg px-1.5 py-0.5 text-[9px] font-bold text-status-pie-text border border-status-pie-border">
                                    PIE{est.pieDiagnostico ? ` · ${est.pieDiagnostico}` : ""}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => {
                                    const updated = estudiantes.map(e => e.id === est.id ? { ...e, pie: !e.pie } : e)
                                    setEstudiantes(updated)
                                  }}
                                  title={est.pie ? "Quitar PIE" : "Marcar como PIE"}
                                  className={cn(
                                    "rounded px-2 py-1 text-[10px] font-bold transition-colors",
                                    est.pie
                                      ? "bg-status-amber-bg text-status-amber-text border border-status-amber-border"
                                      : "bg-background text-muted-foreground border border-border hover:border-status-amber-border hover:text-status-amber-text"
                                  )}
                                >
                                  PIE
                                </button>
                                {est.pie && (
                                  <button
                                    onClick={() => setExpandedPie(expandedPie === est.id ? null : est.id)}
                                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                                    title="Detalles PIE"
                                  >
                                    {isPieExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                  </button>
                                )}
                                <button onClick={() => setEstudiantes(estudiantes.filter(e => e.id !== est.id))} className="p-1 text-muted-foreground transition-all hover:text-red-500 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                            {isPieExpanded && (
                              <div className="px-4 pb-3 pt-1 bg-status-pie-bg/30 border-t border-status-pie-border/30 space-y-2.5">
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-bold uppercase text-muted-foreground">Diagnóstico</label>
                                  <select
                                    value={est.pieDiagnostico || ""}
                                    onChange={e => setEstudiantes(estudiantes.map(x => x.id === est.id ? { ...x, pieDiagnostico: e.target.value } : x))}
                                    className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] outline-none"
                                  >
                                    <option value="">-- Seleccionar --</option>
                                    <option value="TEL">TEL — Trast. Específico del Lenguaje</option>
                                    <option value="DEA">DEA — Dificultad Específica de Aprendizaje</option>
                                    <option value="DI">DI — Discapacidad Intelectual</option>
                                    <option value="FIL">FIL — Func. Intelectual Limítrofe</option>
                                    <option value="TEA">TEA — Trast. del Espectro Autista</option>
                                    <option value="TDAH">TDAH — Déficit Atencional</option>
                                    <option value="Disc. Visual">Discapacidad Visual</option>
                                    <option value="Disc. Auditiva">Discapacidad Auditiva</option>
                                    <option value="Disc. Motora">Discapacidad Motora</option>
                                    <option value="Trast. Psiquiátrico">Trastorno Psiquiátrico</option>
                                  </select>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-bold uppercase text-muted-foreground">Especialista a cargo</label>
                                  <input
                                    type="text"
                                    value={est.pieEspecialista || ""}
                                    onChange={e => setEstudiantes(estudiantes.map(x => x.id === est.id ? { ...x, pieEspecialista: e.target.value } : x))}
                                    placeholder="Nombre del especialista"
                                    className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] outline-none"
                                  />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-[10px] font-bold uppercase text-muted-foreground">Notas de adecuación</label>
                                  <textarea
                                    value={est.pieNotas || ""}
                                    onChange={e => setEstudiantes(estudiantes.map(x => x.id === est.id ? { ...x, pieNotas: e.target.value } : x))}
                                    placeholder="Adecuaciones curriculares, adaptaciones, observaciones..."
                                    rows={2}
                                    className="rounded-lg border border-border bg-background px-2 py-1.5 text-[12px] outline-none resize-none"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div className="pt-4 flex flex-wrap items-center gap-4">
                    <button onClick={async () => {
                      setSavingEstudiantes(true)
                      setSavedEstudiantes(false)
                      try {
                        await guardarEstudiantes(cursoEstudiantes, estudiantes)
                        setSavedEstudiantes(true)
                        setTimeout(() => setSavedEstudiantes(false), 3000)
                      } catch (error) { console.error(error) }
                      finally { setSavingEstudiantes(false) }
                    }} disabled={savingEstudiantes} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-[13px] font-bold text-white hover:bg-opacity-90 sm:w-auto">
                      {savingEstudiantes ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar Estudiantes"}
                    </button>
                    {savedEstudiantes && <span className="text-green-600 font-bold text-[13px] flex items-center gap-1.5 animate-in fade-in"><CheckCircle className="w-4 h-4" /> Guardado exitosamente</span>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab: Niveles Curriculares */}
          {activeTab === "niveles" && (
            <div className="rounded-[18px] border border-border bg-card p-6 shadow-sm animate-fade-up">
              <div className="mb-5">
                <h2 className="text-[16px] font-extrabold flex items-center gap-2"><BookMarked className="w-4 h-4 text-primary" /> Mapeo de Niveles Curriculares</h2>
                <p className="text-[13px] text-muted-foreground mt-1">
                  Vincula cada curso que impartes con su nivel curricular oficial del Mineduc. Esto permite que el copiloto IA y el currículum carguen los contenidos correctos.
                </p>
              </div>

              {cursosDisponibles.length === 0 ? (
                <div className="rounded-[12px] border border-border bg-background p-6 text-center text-[13px] text-muted-foreground">
                  Primero agrega tus cursos en la pestaña <strong>Mi Horario y Cursos</strong>.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {cursosDisponibles.map(curso => (
                    <div key={curso} className="flex flex-wrap items-center gap-3 rounded-[12px] border border-border bg-background px-4 py-3">
                      <span className="min-w-[80px] text-[14px] font-bold">{curso}</span>
                      <span className="text-muted-foreground text-[13px]">→</span>
                      <select
                        value={nivelMapping[curso] ?? ""}
                        onChange={e => setNivelMapping(prev => ({ ...prev, [curso]: e.target.value }))}
                        className="flex-1 min-w-[200px] rounded-[10px] border border-border bg-card px-3 py-2 text-[13px] font-semibold outline-none focus:border-primary"
                      >
                        <option value="">-- Sin configurar --</option>
                        {NIVELES_CURRICULARES.map(nivel => (
                          <option key={nivel} value={nivel}>{nivel}</option>
                        ))}
                      </select>
                    </div>
                  ))}

                  <div className="mt-2 flex items-center gap-3">
                    <button
                      onClick={async () => {
                        setSavingMapping(true)
                        setSavedMapping(false)
                        try {
                          await guardarNivelMapping(nivelMapping)
                          setSavedMapping(true)
                          setTimeout(() => setSavedMapping(false), 3000)
                        } catch (err) { console.error(err) }
                        finally { setSavingMapping(false) }
                      }}
                      disabled={savingMapping}
                      className="flex items-center gap-2 rounded-[10px] bg-primary px-5 py-2.5 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-60"
                    >
                      {savingMapping ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar configuración"}
                    </button>
                    {savedMapping && (
                      <span className="flex items-center gap-1.5 text-[13px] font-semibold text-green-600">
                        <CheckCircle className="w-4 h-4" /> Guardado
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
