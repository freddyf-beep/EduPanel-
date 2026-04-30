import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Términos de Uso — EduPanel",
  description: "Términos de uso de la plataforma EduPanel.",
}

export default function TerminosPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
          ← Volver
        </Link>
        <h1 className="text-3xl font-extrabold mt-4 mb-2">Términos de Uso</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Última actualización: 29 de abril de 2026
        </p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-4 text-[14px] leading-relaxed">
          <section>
            <h2 className="text-lg font-bold mt-6 mb-2">1. Aceptación</h2>
            <p>
              Al iniciar sesión en EduPanel ("la Plataforma") usted acepta estos Términos
              de Uso y la Política de Privacidad. Si no está de acuerdo, por favor no use
              la Plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mt-6 mb-2">2. Acceso por invitación</h2>
            <p>
              EduPanel se encuentra actualmente en fase de prueba cerrada (alfa). El acceso
              está limitado a docentes invitados. La invitación es personal e
              intransferible. El acceso puede ser revocado en cualquier momento sin
              previo aviso durante esta fase.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mt-6 mb-2">3. Uso aceptable</h2>
            <p>La Plataforma debe usarse exclusivamente para fines pedagógicos. Está prohibido:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Compartir credenciales de acceso con terceros.</li>
              <li>Usar la Plataforma para acosar, dañar o difamar a estudiantes, colegas u otras personas.</li>
              <li>Intentar vulnerar la seguridad o acceder a datos de otros usuarios.</li>
              <li>Usar las funciones de IA para generar contenido ilegal, ofensivo o discriminatorio.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold mt-6 mb-2">4. Propiedad del contenido</h2>
            <p>
              Las planificaciones, observaciones, calificaciones y demás contenido que el
              docente cree en la Plataforma son <strong>de su propiedad</strong>. EduPanel no
              reclama derechos sobre ese contenido y no lo comparte con terceros sin su
              consentimiento.
            </p>
            <p>
              El currículum oficial (Objetivos de Aprendizaje, indicadores) proviene del
              Ministerio de Educación de Chile y es de dominio público.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mt-6 mb-2">5. Inteligencia Artificial (BYOK)</h2>
            <p>
              Las funciones de copiloto IA usan modelos de terceros (Google Gemini, OpenAI,
              Anthropic, Groq). El usuario puede usar el proveedor público gratuito o
              configurar su propia clave (BYOK). Las claves del usuario se almacenan
              <strong> solo en su navegador</strong> (localStorage), nunca en nuestros
              servidores. EduPanel no se responsabiliza por costos en cuentas de
              proveedores externos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mt-6 mb-2">6. Sin garantía durante la alfa</h2>
            <p>
              Durante la fase alfa, la Plataforma se entrega "tal cual". Pueden ocurrir
              errores, pérdidas de datos o interrupciones. <strong>Le recomendamos
              respaldar manualmente</strong> sus planificaciones importantes mediante la
              función de exportación a Word.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mt-6 mb-2">7. Limitación de responsabilidad</h2>
            <p>
              EduPanel no será responsable por daños indirectos, lucro cesante o pérdida
              de datos. Los datos almacenados en la Plataforma se manejan con cuidado pero
              el docente debe mantener sus propios respaldos.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mt-6 mb-2">8. Cambios</h2>
            <p>
              Estos términos pueden actualizarse. Las versiones futuras se anunciarán
              dentro de la Plataforma. El uso continuado después de un cambio implica
              aceptación.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mt-6 mb-2">9. Contacto</h2>
            <p>
              Dudas, reclamos o solicitudes de baja: <Link href="/contacto" className="underline">página de contacto</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold mt-6 mb-2">10. Ley aplicable</h2>
            <p>
              Estos términos se rigen por las leyes de la República de Chile.
            </p>
          </section>
        </div>

        <div className="mt-8 pt-6 border-t border-border text-sm text-muted-foreground">
          <Link href="/privacidad" className="underline mr-4">Política de Privacidad</Link>
          <Link href="/contacto" className="underline">Contacto</Link>
        </div>
      </div>
    </div>
  )
}
