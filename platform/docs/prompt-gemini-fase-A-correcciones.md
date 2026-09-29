Muy buen trabajo con la Fase A: mantené el estilo visual tal cual. Ahora necesito una ronda de CORRECCIONES. No agregues funcionalidades nuevas.

## 1. Quitar (no forman parte del producto)
- Borrá por completo: `GeminiChatbot`, `PredictiveEvolutionView`, `MuscleHeatmap`, `MachineAlternativeFinder`, `CyberHydrationFuel`, `FontSelector` y sus entradas en el menú/tabs.
- Borrá `server.ts` y las dependencias `@google/genai`, `express`, `dotenv`, `@types/express`, `tsx`. Los scripts quedan: `"dev": "vite"`, `"build": "vite build"`, `"lint": "tsc --noEmit"`.
- Borrá los duplicados del prototipo viejo: `src/components/portal/MemberQrPass.tsx`, `src/components/admin/ReceptionScanner.tsx`, `src/data/gymStore.ts` y `src/types/gym.ts`. Todo tiene que usar `src/types/platform.ts` + `src/mocks/demoData.ts`. Nada de localStorage.
- Dejá `CyberLeaderboard` y `CyberIntervalTimer` pero fuera del menú principal (en una sección "Próximamente" de la página demo).
- Agregá `react-is` a dependencies (recharts lo necesita para compilar fuera de AI Studio).
- Sin textos que prometan cosas: nada de "prueba gratis", "100% gratuito", "IA", "holográfico" ni porcentajes inventados.

## 2. Desborde horizontal en celular (crítico)
- En un viewport de 390 px la página mide 474 px de ancho: el header (botones Gemini/Inter/sonido) empuja el layout. Verificá que `document.documentElement.scrollWidth === window.innerWidth` en 360, 390 y 430 px.
- Header en móvil: solo logo + botón de sonido. La barra de pestañas de la demo puede scrollear horizontalmente DENTRO de su contenedor (`overflow-x-auto`), pero nunca la página.
- Ningún elemento con ancho fijo mayor a la pantalla; usá `min-w-0` en hijos de flex y `max-w-full`.
- El contenido no puede quedar tapado por la barra inferior fija: `padding-bottom` = altura de la barra + `env(safe-area-inset-bottom)`.

## 3. Mapa de bicis (ClassSchedule)
- Las ocupadas tienen que verse inequívocamente no disponibles: fondo casi negro, ícono tachado o candado, texto "Ocupada", `disabled` y `aria-disabled="true"`.
- Libres: borde amarillo tenue y hover. Seleccionada: fondo amarillo sólido con texto negro.
- Cada bici es un `button` con `aria-label="Bici 12, libre"` / `"Bici 3, ocupada"` / `"Bici 5, seleccionada"`.
- "Confirmar" deshabilitado hasta elegir una bici (o usar "Asignarme cualquiera").

## 4. Horarios pico
- Recibí por props `openingHours: { weekday: number; open: string; close: string }[]` (usá ISO: 1 = lunes … 7 = domingo; corregí `PeakHourSlot.weekday` a esa convención).
- Si el gimnasio está cerrado, el indicador dice "Cerrado · abre a las 07:00", nunca "Moderado".
- El nivel "ahora" viene de la prop `currentEstimate: 'quiet' | 'moderate' | 'busy' | 'closed'`; no lo calcules con la hora del navegador.

## 5. Formato de horas
- Siempre 24 h con `Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })` → "19:00 – 20:00". Nunca "7:00 p. m. - 8:00 p. m. hs".
- Fechas: "mar 30 sep".

## 6. Accesibilidad (en TODOS los componentes)
- Todo botón que sea solo un ícono lleva `aria-label` en español.
- Áreas táctiles de 44×44 px como mínimo.
- Respetá `prefers-reduced-motion`: con `motion` usá `useReducedMotion()` y en CSS `@media (prefers-reduced-motion: reduce)` desactivá el escaneo láser, los pulsos y los glows animados.
- Los estados (autorizado/denegado, libre/ocupada, activa/pago pendiente) no pueden depender solo del color: sumá ícono y texto.
- Foco visible con teclado (`focus-visible:ring-2 ring-[#edcc36]`).
- Los resultados del escáner se anuncian con `aria-live="assertive"`.
- Contraste AA: los grises sobre negro no pueden ser más oscuros que `zinc-400` para texto.

## 7. Detalles
- ActiveWorkout: cuando se completan las series objetivo, mostrar "Objetivo cumplido ✓" y ofrecer "Siguiente ejercicio" (se puede seguir agregando series, pero marcadas como "extra").
- ReceptionScanner: al desmontar el componente o cambiar de pestaña, apagá la cámara (`stop()` + `clear()`).
- MemberQrPass: si `token` es null o está vencido y `onRefresh` falla, mostrá el estado de error con "Reintentar".

## Entrega
- Mismo proyecto. `npm run build` y `tsc --noEmit` sin errores ni warnings de dependencias.
- Página demo con los 8 componentes de la Fase A y sus estados (cargando / vacío / error / éxito).
- Al final, listá qué archivos borraste y cuáles cambiaste.
