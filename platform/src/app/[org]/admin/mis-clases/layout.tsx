/** Panel del profe: sus clases, su grilla, el control de socios y sus mensajes de WhatsApp.
 *  Las pestañas de la sección «Clases» las arma el panel (features/admin/sections.ts). */
export default function MyClassesLayout({ children }: LayoutProps<'/[org]/admin/mis-clases'>) {
  return <div className="space-y-5">{children}</div>
}
