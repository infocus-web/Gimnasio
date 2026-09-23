import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, SettingsProvider } from './lib/auth'
import { Loading, ToastProvider } from './components/ui'
const AdminLayout = lazy(() => import('./layouts/AdminLayout').then((m) => ({ default: m.AdminLayout })))
import { Home } from './pages/public/Home'
import { Login, ChangePassword } from './pages/Login'
const Portal = lazy(() => import('./pages/portal/Portal').then((m) => ({ default: m.Portal })))
const Dashboard = lazy(() => import('./pages/admin/Dashboard').then((m) => ({ default: m.Dashboard })))
const Reception = lazy(() => import('./pages/admin/Reception').then((m) => ({ default: m.Reception })))
const Members = lazy(() => import('./pages/admin/Members').then((m) => ({ default: m.Members })))
const MemberDetail = lazy(() => import('./pages/admin/MemberDetail').then((m) => ({ default: m.MemberDetail })))
const Payments = lazy(() => import('./pages/admin/Payments').then((m) => ({ default: m.Payments })))
const Plans = lazy(() => import('./pages/admin/Plans').then((m) => ({ default: m.Plans })))
const Exercises = lazy(() => import('./pages/admin/Exercises').then((m) => ({ default: m.Exercises })))
const Routines = lazy(() => import('./pages/admin/Routines').then((m) => ({ default: m.Routines })))
const RoutineEditor = lazy(() => import('./pages/admin/Routines').then((m) => ({ default: m.RoutineEditor })))
const Activities = lazy(() => import('./pages/admin/Activities').then((m) => ({ default: m.Activities })))
const Settings = lazy(() => import('./pages/admin/Settings').then((m) => ({ default: m.Settings })))

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <SettingsProvider>
          <AuthProvider>
            <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/cambiar-clave" element={<ChangePassword />} />
              <Route path="/m/:token" element={<Portal />} />
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="recepcion" element={<Reception />} />
                <Route path="socios" element={<Members />} />
                <Route path="socios/:id" element={<MemberDetail />} />
                <Route path="pagos" element={<Payments />} />
                <Route path="planes" element={<Plans />} />
                <Route path="ejercicios" element={<Exercises />} />
                <Route path="rutinas" element={<Routines />} />
                <Route path="rutinas/:id" element={<RoutineEditor />} />
                <Route path="actividades" element={<Activities />} />
                <Route path="configuracion" element={<Settings />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
          </AuthProvider>
        </SettingsProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
