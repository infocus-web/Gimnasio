import { Alert, Linking, View } from 'react-native'
import Constants from 'expo-constants'
import * as WebBrowser from 'expo-web-browser'
import { useAuth } from '@/features/auth/AuthProvider'
import { DeleteAccountButton } from '@/features/auth/DeleteAccountButton'
import { formatDate, getPassStatus, useMembership } from '@/features/member/membership'
import { Button, Card, LinkText, Screen, Title, Txt } from '@/components/ui'
import { SITE_URL, WHATSAPP_URL } from '@/lib/config'
import { colors } from '@/lib/theme'

export default function CuentaScreen() {
  const { session, family, meId, signOut } = useAuth()
  const me = family.find((m) => m.id === meId)
  const { membership } = useMembership(meId)
  const status = getPassStatus(membership)

  const askSignOut = () =>
    Alert.alert('Cerrar sesión', '¿Querés salir de tu cuenta en este celular?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: () => void signOut() },
    ])

  return (
    <Screen>
      <Title>Mi cuenta</Title>

      <Card>
        <Txt bold size={20}>
          {me ? `${me.firstName} ${me.lastName}` : 'Socio'}
        </Txt>
        <Txt muted>{session?.user.email ?? ''}</Txt>
      </Card>

      <Card>
        <Txt bold>Mi cuota</Txt>
        {!membership ? (
          <Txt muted>Cargando…</Txt>
        ) : membership.status === 'none' ? (
          <Txt muted>{status.message}</Txt>
        ) : (
          <>
            <Row label="Plan" value={membership.planName} />
            <Row label="Estado" value={status.label} color={status.kind === 'valid' ? colors.ok : colors.danger} />
            {membership.currentPeriodEnd ? <Row label={status.kind === 'valid' ? 'Vence' : 'Venció'} value={formatDate(membership.currentPeriodEnd)} /> : null}
            {membership.creditsRemaining != null ? <Row label="Clases que te quedan" value={String(membership.creditsRemaining)} /> : null}
            {status.message ? <Txt muted size={14}>{status.message}</Txt> : null}
          </>
        )}
      </Card>

      {family.length > 1 ? (
        <Card>
          <Txt bold>Grupo familiar</Txt>
          {family
            .filter((m) => !m.isMe)
            .map((m) => (
              <Txt key={m.id} muted>
                {m.firstName} {m.lastName}
              </Txt>
            ))}
          <Txt muted size={13}>
            Podés mostrar el QR o reservar por ellos eligiendo su nombre arriba de cada pantalla.
          </Txt>
        </Card>
      ) : null}

      <Card>
        <Txt bold>Evolution Fitness GYM</Txt>
        <Txt muted>Lunes a viernes de 7 a 22 · sábados de 10 a 12</Txt>
        <Button small variant="ghost" label="Escribir por WhatsApp" onPress={() => void Linking.openURL(WHATSAPP_URL)} />
      </Card>

      <Button label="Cerrar sesión" variant="ghost" onPress={askSignOut} />
      <DeleteAccountButton />

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 4 }}>
        <LinkText label="Privacidad" onPress={() => void WebBrowser.openBrowserAsync(`${SITE_URL}/privacidad`)} />
        <LinkText label="Términos" onPress={() => void WebBrowser.openBrowserAsync(`${SITE_URL}/terminos`)} />
      </View>
      <Txt muted size={12} center>
        Versión {Constants.expoConfig?.version ?? ''}
      </Txt>
    </Screen>
  )
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Txt muted>{label}</Txt>
      <Txt bold color={color}>
        {value}
      </Txt>
    </View>
  )
}
