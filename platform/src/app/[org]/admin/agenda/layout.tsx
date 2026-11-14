/** Las pestañas de la sección «Clases» las arma el panel (features/admin/sections.ts). */
export default function AgendaLayout({ children }: LayoutProps<'/[org]/admin/agenda'>) {
  return <div className="space-y-5">{children}</div>
}
