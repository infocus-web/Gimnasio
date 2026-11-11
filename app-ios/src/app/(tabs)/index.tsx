import { useCallback, useRef, useState } from 'react'
import { AppState, RefreshControl, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import * as Brightness from 'expo-brightness'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'
import QRCode from 'react-native-qrcode-svg'
import { useAuth } from '@/features/auth/AuthProvider'
import { formatDate, getPassStatus, useMembership } from '@/features/member/membership'
import { useCheckinToken } from '@/features/member/useCheckinToken'
import { FamilyPicker } from '@/components/FamilyPicker'
import { Button, Card, Loading, Notice, Screen, Title, Txt } from '@/components/ui'
import { colors, radius } from '@/lib/theme'

const KEEP_AWAKE_TAG = 'qr-molinete'

/**
 * Brillo al máximo y pantalla siempre encendida mientras se ve el QR (la tablet del molinete lo lee mejor).
 * Al salir de la pantalla o de la app se devuelve el brillo que tenía el socio.
 */
function useScannerMode() {
  const previous = useRef<number | null>(null)
  useFocusEffect(
    useCallback(() => {
      let active = true
      const boost = async () => {
        try {
          if (previous.current === null) previous.current = await Brightness.getBrightnessAsync()
          if (active) await Brightness.setBrightnessAsync(1)
        } catch {
          /* sin permiso o no disponible: se sigue igual */
        }
      }
      const restore = async () => {
        try {
          if (previous.current !== null) await Brightness.setBrightnessAsync(previous.current)
        } catch {
          /* nada */
        }
        previous.current = null
      }
      void boost()
      void activateKeepAwakeAsync(KEEP_AWAKE_TAG)
      const sub = AppState.addEventListener('change', (s) => {
        if (s === 'active') void boost()
        else void restore()
      })
      return () => {
        active = false
        sub.remove()
        void restore()
        void deactivateKeepAwake(KEEP_AWAKE_TAG)
      }
    }, []),
  )
}

export default function PaseScreen() {
  const { family, activeMemberId } = useAuth()
  const { membership, error: mError, reload } = useMembership(activeMemberId)
  const status = getPassStatus(membership)
  const canEnter = status.kind === 'valid'
  const { token, loading, error, secondsLeft, refresh } = useCheckinToken(activeMemberId, canEnter)
  const [pulling, setPulling] = useState(false)
  useScannerMode()

  const who = family.find((m) => m.id === activeMemberId)
  const onPull = async () => {
    setPulling(true)
    await Promise.all([reload(), refresh()])
    setPulling(false)
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={pulling} onRefresh={() => void onPull()} tintColor={colors.accent} />}>
      <Title sub="Acercá el celular a la tablet del molinete">Mi QR de acceso</Title>
      <FamilyPicker />

      {mError && !membership ? (
        <>
          <Notice text={mError} />
          <Button label="Reintentar" onPress={() => void reload()} />
        </>
      ) : !membership ? (
        <Loading />
      ) : (
        <>
          <Card style={{ alignItems: 'center', gap: 14, paddingVertical: 22 }}>
            {who ? (
              <Txt bold size={20} center>
                {who.firstName} {who.lastName}
              </Txt>
            ) : null}
            <StatusPill label={status.label} kind={status.kind} />

            {canEnter ? (
              error ? (
                <>
                  <Notice text={error} />
                  <Button label="Reintentar" onPress={() => void refresh()} />
                </>
              ) : loading || !token ? (
                <Loading />
              ) : (
                <>
                  {/* Negro sobre blanco: lo leen todos los lectores, con cualquier luz */}
                  <View
                    accessible
                    accessibilityLabel="Código QR de acceso"
                    style={{ backgroundColor: '#ffffff', padding: 18, borderRadius: radius.lg }}
                  >
                    <QRCode value={token.token} size={250} color="#000000" backgroundColor="#ffffff" ecl="M" />
                  </View>
                  <Txt muted size={13} center>
                    El código cambia solo{secondsLeft > 0 ? ` · ${secondsLeft} s` : ''}. No sirve una captura de pantalla.
                  </Txt>
                </>
              )
            ) : (
              <Txt muted center>
                {status.message}
              </Txt>
            )}
          </Card>

          {membership.status !== 'none' ? (
            <Card>
              <Row label="Plan" value={membership.planName} />
              {membership.currentPeriodEnd ? <Row label={canEnter ? 'Vence' : 'Venció'} value={formatDate(membership.currentPeriodEnd)} /> : null}
              {membership.creditsRemaining != null ? <Row label="Clases que te quedan" value={String(membership.creditsRemaining)} /> : null}
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Txt muted>{label}</Txt>
      <Txt bold>{value}</Txt>
    </View>
  )
}

function StatusPill({ label, kind }: { label: string; kind: 'valid' | 'blocked' | 'none' }) {
  const c = kind === 'valid' ? colors.ok : kind === 'blocked' ? colors.danger : colors.muted
  return (
    <View style={{ borderColor: c, borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 4 }}>
      <Txt bold size={13} color={c}>
        {label}
      </Txt>
    </View>
  )
}
