
import { Colors } from '@/constants/theme'
import { useAppTheme } from '@/context/ThemeContext'

export function useTheme() {
  const { resolvedTheme } = useAppTheme()
  return Colors[resolvedTheme]
}
