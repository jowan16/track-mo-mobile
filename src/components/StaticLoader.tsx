import { StyleSheet, View, type ViewStyle } from 'react-native'

type Props = {
  size?: 'small' | 'large' | number
  color?: string
  style?: ViewStyle
}

export function StaticLoader({ size = 'small', color = '#0F766E', style }: Props) {
  const dimension = typeof size === 'number' ? size : size === 'large' ? 28 : 16
  const dot = Math.max(4, Math.round(dimension * 0.28))

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={[
        styles.indicator,
        {
          width: dimension,
          height: dimension,
          borderColor: color,
        },
        style,
      ]}
    >
      <View style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: color }} />
    </View>
  )
}

const styles = StyleSheet.create({
  indicator: {
    borderWidth: 2,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
