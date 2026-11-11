import { Linking } from 'react-native'
import { useAuth } from '@/features/auth/AuthProvider'
import { DeleteAccountButton } from '@/features/auth/DeleteAccountButton'
import { Button, Card, Notice, Screen, Title, Txt } from '@/components/ui'
import { WHATSAPP_URL } from '@/lib/config'

/** Tiene cuenta pero todavía no es socio (no se inscribió, o lo dieron de baja). */
export default function SinPlan() {
  const { session, memberState, reloadMember, signOut } = useAuth()

  if (memberState === 'error') {
    return (
      <Screen edges={['top', 'bottom']}>
        <Title>Sin conexión</Title>
        <Notice text="No pudimos cargar tus datos. Revisá tu internet y probá de nuevo." />
        <Button label="Reintentar" onPress={() => void reloadMember()} />
        <Button label="Cerrar sesión" variant="ghost" onPress={() => void signOut()} />
      </Screen>
    )
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Title>Todavía no sos socio</Title>
      <Card>
        <Txt>
          Tu cuenta <Txt bold>{session?.user.email ?? ''}</Txt> ya está creada, pero todavía no tiene un plan en Evolution Fitness.
        </Txt>
        <Txt muted>Acercate a recepción con este mismo email para inscribirte, o escribinos por WhatsApp. Cuando tengas tu plan, tocá “Ya me inscribí”.</Txt>
      </Card>
      <Button label="Ya me inscribí" onPress={() => void reloadMember()} />
      <Button label="Escribir por WhatsApp" variant="ghost" onPress={() => void Linking.openURL(WHATSAPP_URL)} />
      <Button label="Cerrar sesión" variant="ghost" onPress={() => void signOut()} />
      <DeleteAccountButton />
    </Screen>
  )
}
