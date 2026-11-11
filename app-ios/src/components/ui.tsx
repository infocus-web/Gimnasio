import type { ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
  type RefreshControlProps,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { colors, fonts, radius } from '@/lib/theme'

export function Screen({
  children,
  scroll = true,
  refreshControl,
  edges = ['top'],
}: {
  children: ReactNode
  scroll?: boolean
  refreshControl?: React.ReactElement<RefreshControlProps>
  edges?: ('top' | 'bottom')[]
}) {
  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  )
}

export function Title({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <View style={{ gap: 4, marginBottom: 4 }}>
      <Text style={styles.title}>{children}</Text>
      {sub ? <Text style={styles.muted}>{sub}</Text> : null}
    </View>
  )
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function Txt({
  children,
  muted,
  bold,
  size = 15,
  color,
  center,
}: {
  children: ReactNode
  muted?: boolean
  bold?: boolean
  size?: number
  color?: string
  center?: boolean
}) {
  return (
    <Text
      style={{
        color: color ?? (muted ? colors.muted : colors.text),
        fontFamily: bold ? fonts.bold : fonts.regular,
        fontSize: size,
        lineHeight: Math.round(size * 1.35),
        textAlign: center ? 'center' : undefined,
      }}
    >
      {children}
    </Text>
  )
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  busy,
  disabled,
  small,
}: {
  label: string
  onPress: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  busy?: boolean
  disabled?: boolean
  small?: boolean
}) {
  const off = disabled || busy
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      disabled={off}
      onPress={() => {
        void Haptics.selectionAsync()
        onPress()
      }}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        variant === 'primary' && { backgroundColor: colors.accent },
        variant === 'ghost' && { backgroundColor: colors.cardAlt, borderColor: colors.border, borderWidth: 1 },
        variant === 'danger' && { backgroundColor: colors.dangerBg, borderColor: 'rgba(248,113,113,0.4)', borderWidth: 1 },
        (pressed || off) && { opacity: off ? 0.5 : 0.8 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={variant === 'primary' ? colors.onAccent : colors.text} />
      ) : (
        <Text
          style={[
            styles.btnText,
            small && { fontSize: 14 },
            { color: variant === 'primary' ? colors.onAccent : variant === 'danger' ? colors.danger : colors.text },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  )
}

export function LinkText({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} hitSlop={10}>
      <Text style={[styles.link]}>{label}</Text>
    </Pressable>
  )
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.faint} selectionColor={colors.accent} style={styles.input} {...props} />
    </View>
  )
}

export function Notice({ text, tone = 'danger' }: { text: string; tone?: 'danger' | 'info' }) {
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.notice,
        tone === 'danger'
          ? { backgroundColor: colors.dangerBg, borderColor: 'rgba(248,113,113,0.4)' }
          : { backgroundColor: 'rgba(237,204,54,0.08)', borderColor: 'rgba(237,204,54,0.35)' },
      ]}
    >
      <Text style={{ color: tone === 'danger' ? '#fecaca' : colors.text, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 }}>{text}</Text>
    </View>
  )
}

export function Loading() {
  return (
    <View style={{ paddingVertical: 48, alignItems: 'center' }}>
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  title: { color: colors.text, fontFamily: fonts.bold, fontSize: 26, letterSpacing: -0.3 },
  muted: { color: colors.muted, fontFamily: fonts.regular, fontSize: 14 },
  card: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 18, gap: 10 },
  btn: { minHeight: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  btnSmall: { minHeight: 44, borderRadius: radius.sm, paddingHorizontal: 14 },
  btnText: { fontFamily: fonts.bold, fontSize: 16 },
  link: { color: colors.accent, fontFamily: fonts.medium, fontSize: 15, textAlign: 'center' },
  label: { color: colors.muted, fontFamily: fonts.medium, fontSize: 13 },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardAlt,
    color: colors.text,
    paddingHorizontal: 16,
    fontFamily: fonts.regular,
    fontSize: 16,
  },
  notice: { borderWidth: 1, borderRadius: radius.md, padding: 12 },
})
