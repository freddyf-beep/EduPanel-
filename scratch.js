const fs = require('fs');

const path = 'c:/Users/fredd/Documents/edupanel/components/edu-panel/actividades/actividades-content.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Imports
content = content.replace(/import\s*\{\s*AI_PROVIDER_OPTIONS[\s\S]*?getGenerativeModel\s*from\s*"@firebase\/vertexai"/g, '');
content = content.replace(/import\s*\{\s*MessageSquare,\s*Settings2,\s*Wand2\s*\}\s*from\s*"lucide-react"\r?\n?/g, '');

// 2. AI States and Logic
content = content.replace(
    /\s*\/\/\s*Copiloto IA State\s*const\s*\[showCopilot,\s*setShowCopilot\]\s*=\s*useState\(false\)[\s\S]*?setIsGeneratingAI\(false\)\r?\n?\s*\}\r?\n?\s*\}/g,
    '\n  // Copiloto IA State (Reconstruyendo)\n  const [showCopilot, setShowCopilot] = useState(false)\n  const [isClassesRailCollapsed, setIsClassesRailCollapsed] = useState(false)'
);

// 3. Borrar hooks que interactuan con AI
content = content.replace(
    /\s*useEffect\(\(\)\s*=>\s*\{\r?\n?\s*setChatHistory\(\[\]\)\r?\n?\s*setMensajeLocal\(""\)\r?\n?\s*setCopilotTab\("chat"\)\r?\n?\s*setShowSettings\(false\)\r?\n?\s*\},\s*\[cursoParam,\s*unidadParam,\s*selectedClase\]\)/g,
    ''
);

// 4. Validacion Copiloto & variables locales
content = content.replace(
    /\s*\/\/\s*Validación Copiloto\s*const\s*requisitosCompletos\s*=[\s\S]*?const\s*evaluacionesSugeridas\s*=\s*\(unidadData\?\.ejemplos_evaluacion\s*\|\|\s*\[\]\)\s*as\s*EjemploEvaluacion\[\]/g,
    '\n  const actividadesSugeridas = (unidadData?.actividades_sugeridas || []) as ActividadSugerida[]\n  const evaluacionesSugeridas = (unidadData?.ejemplos_evaluacion || []) as EjemploEvaluacion[]'
);

// 5. Modificar la cabecera
content = content.replace(
    /const handleOpenCopilot = \(\) => \{\r?\n?\s*setShowSettings\(false\)\r?\n?\s*setCopilotTab\("chat"\)\r?\n?\s*setShowCopilot\(true\)\r?\n?\s*\}/g,
    'const handleOpenCopilot = () => {\n    setShowCopilot(true)\n  }'
);

content = content.replace(
    /const handleOpenCopilot = \(\) => \{\r?\n?\s*setShowCopilot\(true\)\r?\n?\s*\}\r?\n?\s*const providerMeta =[\s\S]*?const contentGridTemplate =/g,
    'const handleOpenCopilot = () => {\n    setShowCopilot(true)\n  }\n  const contentGridTemplate ='
);

// 6. Limpiar los botones 'Llevar al copiloto' de sugerencias
content = content.replace(
    /setMensajeLocal\(`Considera esta actividad sugerida[\s\S]*?setCopilotTab\("chat"\)/g,
    'setShowCopilot(true)'
);
content = content.replace(
    /setMensajeLocal\(`Integra una evaluacion inspirada[\s\S]*?setCopilotTab\("chat"\)/g,
    'setShowCopilot(true)'
);

// 7. Reemplazar el ASIDE visual
const newAside = `            {/* Panel fijo de pantalla completa — full viewport height */}
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
            </aside>`;

content = content.replace(
    /\s*\{\/\*\s*Panel fijo de pantalla completa — full viewport height\s*\*\/\}[\s\S]*?\s*<\/aside>/g,
    '\n' + newAside
);

fs.writeFileSync(path, content, 'utf8');
console.log("Modificado con exito");
