import { Pressable, ScrollView, Text } from 'react-native'
import * as Haptics from 'expo-haptics'
import { useAuth } from '@/features/auth/AuthProvider'
import { colors, fonts } from '@/lib/theme'

/** Cuenta familiar: el pagador elige para quién es el QR o la reserva. No se muestra si es uno solo. */
export function FamilyPicker() {
  const { family, activeMemberId, setActiveMemberId } = useAuth()
  if (family.length < 2) return null
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {family.map((m) => {
        const on = m.id === activeMemberId
        return (
          <Pressable
            key={m.id}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => {
              void Haptics.selectionAsync()
              setActiveMemberId(m.id)
            }}
            style={{
              minHeight: 40,
              paddingHorizontal: 16,
              borderRadius: 999,
              justifyContent: 'center',
              backgroundColor: on ? colors.accent : colors.cardAlt,
              borderWidth: 1,
              borderColor: on ? colors.accent : colors.border,
            }}
          >
            <Text style={{ color: on ? colors.onAccent : colors.text, fontFamily: fonts.medium, fontSize: 14 }}>
              {m.isMe ? 'Yo' : m.firstName}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}
