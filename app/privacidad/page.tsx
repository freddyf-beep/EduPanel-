import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Política de Privacidad — EduPanel",
  description: "Cómo EduPanel trata tus datos personales y los de tus estudiantes.",
}

export default function PrivacidadPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
          ← Volver
        </Link>
        <h1 className="text-3xl font-extrabold mt-4 mb-2">Política de Privacidad</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Última actualización: 29 de abril de 2026 · Conforme a la Ley 19.628 de Chile
        </p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-4 text-[14px] leading-relaxed">
          <section>
            <h2 className="text-lg font-bold mt-6 mb-2">1. Quién es el responsable</h2>
            <p>
              El responsable del tratamiento de los datos es el propietario de EduPanel.
              Contacto: <Link href="/contacto" className="underline">página de contacto</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mt-6 mb-2">2. Qué datos recolectamos</h2>
            <p><strong>Del docente (al iniciar sesión con Google):</strong></p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Nombre completo, correo electrónico y foto de perfil de Google.</li>
              <li>UID asignado por Firebase Authentication.</li>
            </ul>
            <p><strong>Que el docente ingresa voluntariamente:</strong></p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Datos de su perfil profesional (colegio, asignaturas, niveles).</li>
              <li>Planificaciones, unidades, clases, objetivos de aprendizaje.</li>
              <li>Listas de estudiantes (nombre, curso) — sin RUT salvo que el docente lo ingrese.</li>
              <li>Asistencia, calificaciones, observaciones pedagógicas.</li>
            </ul>
            <p><strong>NO recolectamos:</strong> RUT del docente, datos de pago, ubicación,
            datos biométricos, ni información de salud.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold mt-6 mb-2">3. Para qué usamos los datos</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Permitirle al docente gestionar su trabajo pedagógico.</li>
              <li>Personalizar su experiencia (asignatura activa, tema, cursos).</li>
              <li>Generar planificaciones con copiloto IA (cuando el docente lo solicita).</li>
              <li>Sincronizar opcionalmente con Google Calendar (solo si el docente lo activa).</li>
            </ul>
            <p>
              <strong>No usamos los datos para publicidad, perfilado comercial ni los vendemos
              a terceros.</strong>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mt-6 mb-2">4. Datos de estudiantes</h2>
            <p>
              Los datos de estudiantes (nombre, asistencia, notas, observaciones) son
              ingresados por el docente y se consideran <strong>datos sensibles</strong> al
              referirse a menores de edad. EduPanel:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Sólo permite que el docente dueño de la cuenta los vea.</li>
              <li>Aplica reglas de seguridad de Firestore que aíslan los datos por cuenta.</li>
              <li>No los comparte con otros docentes, padres ni terceros.</li>
              <li>No los usa para entrenar modelos de IA.</li>
            </ul>
            <p>
              Es responsabilidad del docente cumplir con las normas de su establecimiento
              respecto al manejo de datos de menores.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mt-6 mb-2">5. Dónde se almacenan</h2>
            <p>
              Los datos se almacenan en <strong>Google Firebase Firestore</strong>, en
              servidores ubicados en Estados Unidos. Google Cloud cumple con estándares
              SOC 2, ISO 27001 e ISO 27018. La transferencia internacional se realiza con
              su consentimiento expreso al usar la Plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mt-6 mb-2">6. Inteligencia Artificial</h2>
            <p>
              Cuando usted solicita generar una clase con el copiloto IA, el contenido del
              prompt se envía al proveedor de IA elegido (Google Gemini por defecto, u
              OpenAI, Anthropic, Groq, Ollama si configura BYOK). Esos proveedores tienen
              sus propias políticas de retención. Para máxima privacidad recomendamos:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>No incluir nombres reales de estudiantes en los prompts.</li>
              <li>Usar Ollama local si necesita confidencialidad total.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold mt-6 mb-2">7. Sus derechos</h2>
            <p>Conforme a la Ley 19.628, usted puede:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Acceder</strong> a sus datos (visibles en la propia Plataforma).</li>
              <li><strong>Rectificarlos</strong> en cualquier momento desde la app.</li>
              <li><strong>Eliminarlos</strong> escribiendo a contacto — eliminamos toda la cuenta en máximo 7 días.</li>
              <li><strong>Exportarlos</strong> usando la función de exportación a Word.</li>
              <li><strong>Oponerse</strong> al tratamiento (cierre de cuenta).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold mt-6 mb-2">8. Seguridad</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Conexiones siempre HTTPS.</li>
              <li>Autenticación delegada a Google (sin contraseñas locales).</li>
              <li>Reglas de Firestore que impiden acceso entre cuentas.</li>
              <li>Verificación de token en endpoints sensibles.</li>
            </ul>
            <p>
              Ningún sistema es 100% invulnerable. Le recomendamos exportar sus
              planificaciones críticas a Word como respaldo.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mt-6 mb-2">9. Cookies y almacenamiento local</h2>
            <p>
              Usamos almacenamiento local del navegador (<code>localStorage</code>) para guardar:
              tema visual, asignatura activa, configuración de IA (BYOK), y token de Google
              Calendar (si lo activó). No usamos cookies de seguimiento ni publicidad.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mt-6 mb-2">10. Cambios</h2>
            <p>
              Si esta política cambia, le notificaremos dentro de la Plataforma. Cambios
              materiales requerirán aceptación explícita.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mt-6 mb-2">11. Contacto</h2>
            <p>
              Para ejercer derechos o reclamos: <Link href="/contacto" className="underline">página de contacto</Link>.
              Si considera que sus derechos no fueron respetados, puede acudir al Consejo
              para la Transparencia (Chile).
            </p>
          </section>
        </div>

        <div className="mt-8 pt-6 border-t border-border text-sm text-muted-foreground">
          <Link href="/terminos" className="underline mr-4">Términos de Uso</Link>
          <Link href="/contacto" className="underline">Contacto</Link>
        </div>
      </div>
    </div>
  )
}
