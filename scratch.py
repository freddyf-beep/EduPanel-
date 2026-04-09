import re

with open('c:/Users/fredd/Documents/edupanel/components/edu-panel/actividades/actividades-content.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Imports
content = re.sub(
    r'import \{\s*AI_PROVIDER_OPTIONS.*?getGenerativeModel from "@firebase/vertexai"',
    '', 
    content, 
    flags=re.DOTALL
)
content = re.sub(
    r'import \{ MessageSquare, Settings2, Wand2 \} from "lucide-react"\s*',
    '',
    content
)

# 2. AI States and Logic
content = re.sub(
    r'  // Copiloto IA State\s*const \[showCopilot, setShowCopilot\] = useState\(false\).*?setIsGeneratingAI\(false\)\s*\}\s*\}',
    '  // Copiloto IA State (Reconstruyendo)\n  const [showCopilot, setShowCopilot] = useState(false)\n  const [isClassesRailCollapsed, setIsClassesRailCollapsed] = useState(false)',
    content,
    flags=re.DOTALL
)

# 3. Borrar hooks que interactuan con AI
content = re.sub(
    r'  useEffect\(\(\) => \{\s*setChatHistory\(\[\]\)\s*setMensajeLocal\(""\)\s*setCopilotTab\("chat"\)\s*setShowSettings\(false\)\s*\}, \[cursoParam, unidadParam, selectedClase\]\)',
    '',
    content,
    flags=re.DOTALL
)

# 4. Validacion Copiloto & variables locales
content = re.sub(
    r'  // Validación Copiloto\s*const requisitosCompletos =.*?const evaluacionesSugeridas = ',
    '  const actividadesSugeridas = ',
    content,
    flags=re.DOTALL
)

# 5. Modificar la cabecera (handleOpenCopilot en la línea de Sparkles)
content = content.replace(
    '  const handleOpenCopilot = () => {\n    setShowSettings(false)\n    setCopilotTab("chat")\n    setShowCopilot(true)\n  }',
    '  const handleOpenCopilot = () => {\n    setShowCopilot(true)\n  }'
)

content = content.replace(
    '  const actividadesSugeridas = ',
    '  const handleOpenCopilot = () => {\n    setShowCopilot(true)\n  }\n\n  const actividadesSugeridas = '
)

content = content.replace(
    '  const handleOpenCopilot = () => {\n    setShowCopilot(true)\n  }\n\n  const handleOpenCopilot = () => {\n    setShowCopilot(true)\n  }\n\n',
    '  const handleOpenCopilot = () => {\n    setShowCopilot(true)\n  }\n\n'
)

# 6. Limpiar los botones 'Llevar al copiloto' de sugerencias
content = re.sub(
    r'setMensajeLocal\(`Considera esta actividad sugerida.*?setCopilotTab\("chat"\)',
    'setShowCopilot(true)',
    content,
    flags=re.DOTALL
)
content = re.sub(
    r'setMensajeLocal\(`Integra una evaluacion inspirada.*?setCopilotTab\("chat"\)',
    'setShowCopilot(true)',
    content,
    flags=re.DOTALL
)

# Fix possible issue: if handleOpenCopilot replacement occurred twice.
content = re.sub(
    r'(const handleOpenCopilot = \(\) => \{\s*setShowCopilot\(true\)\s*\}\s*){2,}',
    '  const handleOpenCopilot = () => {\n    setShowCopilot(true)\n  }\n\n',
    content
)

# 7. Reemplazar el ASIDE visual
new_aside = """            {/* Panel fijo de pantalla completa — full viewport height */}
            <aside
              style={{ width: copilotWidth }}
              className={cn(
                "fixed top-0 right-0 z-[699] flex h-screen flex-col border-l border-slate-200 shadow-[-12px_0_40px_rgba(15,23,42,0.06)] bg-slate-50/50 backdrop-blur-xl",
                !isResizing && "transition-[width] duration-300"
              )}
            >
              {/* Resizer handle */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-fuchsia-500/50 bg-transparent z-[700] transition-colors"
                onMouseDown={() => setIsResizing(true)}
              />

              {/* Nueva cabecera premium */}
              <div className="flex-shrink-0 bg-white/80 backdrop-blur-md border-b border-slate-200/60 px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-gradient-to-br from-indigo-500 via-purple-500 to-fuchsia-500 text-white shadow-sm shadow-purple-500/20">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-[15px] font-extrabold text-slate-900 leading-tight">Copiloto EduPanel</h2>
                    <p className="text-[11px] font-medium text-slate-500 mt-0.5">Asistente pedagógico con IA</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCopilot(false)}
                  className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-rose-100 hover:text-rose-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Contenido en blanco (por ahora) */}
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center" style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/cubes.png')", backgroundBlendMode: "multiply" }}>
                 <div className="w-20 h-20 bg-white rounded-full shadow-xl shadow-fuchsia-100 grid place-items-center mb-6 animate-pulse border border-fuchsia-50">
                    <Bot className="h-8 w-8 text-fuchsia-400" />
                 </div>
                 <h3 className="text-[18px] font-extrabold text-slate-800 mb-2">Completamente Nuevo</h3>
                 <p className="text-[13px] text-slate-500 leading-relaxed max-w-[280px]">
                    Este espacio está reservado para la nueva interfaz del copiloto pedagógico.
                 </p>
              </div>
            </aside>"""

content = re.sub(
    r'            \{\/\* Panel fijo de pantalla completa — full viewport height \*\/\}'
    r'.*?            \<\/aside\>',
    new_aside,
    content,
    flags=re.DOTALL
)

with open('c:/Users/fredd/Documents/edupanel/components/edu-panel/actividades/actividades-content.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Modificado con exito")
