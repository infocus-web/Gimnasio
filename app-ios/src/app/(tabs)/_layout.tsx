import { Tabs } from 'expo-router'
import { CalendarIcon, QrIcon, UserIcon } from '@/components/TabIcons'
import { colors, fonts } from '@/lib/theme'

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.faint,
        tabBarStyle: { backgroundColor: '#050505', borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 12 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Mi QR', tabBarIcon: ({ color }) => <QrIcon color={String(color)} /> }} />
      <Tabs.Screen name="clases" options={{ title: 'Clases', tabBarIcon: ({ color }) => <CalendarIcon color={String(color)} /> }} />
      <Tabs.Screen name="cuenta" options={{ title: 'Mi cuenta', tabBarIcon: ({ color }) => <UserIcon color={String(color)} /> }} />
    </Tabs>
  )
}
