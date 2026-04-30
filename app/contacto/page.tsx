import Link from "next/link"
import { Mail } from "lucide-react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Contacto — EduPanel",
  description: "Cómo contactar al equipo de EduPanel.",
}

export default function ContactoPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
          ← Volver
        </Link>

        <h1 className="text-3xl font-extrabold mt-4 mb-3">Contacto</h1>
        <p className="text-muted-foreground mb-8">
          Estamos en fase alfa cerrada. Si encontraste un error, tienes una sugerencia o
          quieres ejercer tus derechos sobre tus datos, escríbenos.
        </p>

        <div className="bg-card border border-border rounded-[14px] p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-pink-light dark:bg-pink-900/30 grid place-items-center shrink-0">
              <Mail className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-bold text-[15px]">Correo electrónico</p>
              <p className="text-sm text-muted-foreground mb-1">
                Respondemos en un plazo máximo de 7 días hábiles.
              </p>
              <a
                href="mailto:contacto@edupanel.cl"
                className="text-sm font-mono text-primary hover:underline"
              >
                contacto@edupanel.cl
              </a>
            </div>
          </div>

          <div className="border-t border-border pt-4 text-sm text-muted-foreground space-y-2">
            <p>
              <strong className="text-foreground">¿Quieres una invitación a la alfa?</strong>{" "}
              Indícanos tu nombre, colegio, nivel(es) y asignatura(s) que enseñas.
            </p>
            <p>
              <strong className="text-foreground">¿Quieres eliminar tu cuenta?</strong>{" "}
              Avísanos desde el correo asociado a tu cuenta de Google y eliminaremos todos
              tus datos en un máximo de 7 días.
            </p>
            <p>
              <strong className="text-foreground">¿Encontraste un bug?</strong> Cuéntanos qué
              hiciste antes del error y, si puedes, adjunta una captura de pantalla.
            </p>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border text-sm text-muted-foreground">
          <Link href="/terminos" className="underline mr-4">Términos de Uso</Link>
          <Link href="/privacidad" className="underline">Política de Privacidad</Link>
        </div>
      </div>
    </div>
  )
}
