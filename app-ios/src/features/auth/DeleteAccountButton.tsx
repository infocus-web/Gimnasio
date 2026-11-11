import { useState } from 'react'
import { Alert } from 'react-native'
import { supabase } from '@/lib/supabase'
import { SITE_URL } from '@/lib/config'
import { Button } from '@/components/ui'

/**
 * Borrar la cuenta desde la app (Apple lo exige, guía 5.1.1(v)).
 * Llama a POST /api/cuenta/borrar de la web con el token de la sesión.
 */
export function DeleteAccountButton() {
  const [busy, setBusy] = useState(false)

  const run = async () => {
    setBusy(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('no session')
      const res = await fetch(`${SITE_URL}/api/cuenta/borrar`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
      if (!res.ok || !body?.ok) {
        Alert.alert(
          'No se pudo borrar',
          body?.error === 'is_staff'
            ? 'Esta cuenta es del personal del gimnasio. Se da de baja desde el panel de administración.'
            : 'Probá de nuevo en un rato o escribinos por WhatsApp.',
        )
        return
      }
      // El usuario ya no existe: se limpia la sesión guardada en el celular
      await supabase.auth.signOut({ scope: 'local' })
      Alert.alert('Cuenta borrada', 'Tu cuenta se borró. Si querés volver, podés crear una nueva cuando quieras.')
    } catch {
      Alert.alert('Sin conexión', 'Revisá tu internet y probá de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  const ask = () =>
    Alert.alert(
      '¿Borrar tu cuenta?',
      'Se borra tu acceso (email, contraseña e ingreso con Apple o Google) y no vas a poder entrar más con esta cuenta. Tu ficha, tus pagos y tu historial quedan guardados en el gimnasio por motivos contables. No se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Borrar cuenta', style: 'destructive', onPress: () => void run() },
      ],
    )

  return <Button label="Borrar mi cuenta" variant="danger" onPress={ask} busy={busy} />
}
