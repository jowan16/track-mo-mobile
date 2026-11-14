import { Image } from 'expo-image'
import { StyleSheet, Text, View } from 'react-native'

export const CATEGORY_ICON_OPTIONS = [
  { name: 'Wallet', key: 'wallet', glyph: '👛', group: 'Finance' },
  { name: 'Coins', key: 'coins', glyph: '🪙', group: 'Finance' },
  { name: 'Credit card', key: 'credit-card', glyph: '💳', group: 'Finance' },
  { name: 'Bank', key: 'bank', glyph: '🏦', group: 'Finance' },
  { name: 'Savings', key: 'piggy-bank', glyph: '🐷', group: 'Finance' },
  { name: 'Chart', key: 'chart', glyph: '📊', group: 'Finance' },
  { name: 'Receipt', key: 'receipt', glyph: '🧾', group: 'Finance' },
  { name: 'Bus', key: 'bus', glyph: '🚌', group: 'Transport' },
  { name: 'Car', key: 'car', glyph: '🚗', group: 'Transport' },
  { name: 'Motorcycle', key: 'motorcycle', glyph: '🏍️', group: 'Transport' },
  { name: 'Train', key: 'train', glyph: '🚆', group: 'Transport' },
  { name: 'Airplane', key: 'airplane', glyph: '✈️', group: 'Transport' },
  { name: 'Gas', key: 'gas', glyph: '⛽', group: 'Transport' },
  { name: 'Food', key: 'utensils', glyph: '🍽️', group: 'Food & Drink' },
  { name: 'Groceries', key: 'groceries', glyph: '🛒', group: 'Food & Drink' },
  { name: 'Coffee', key: 'coffee', glyph: '☕', group: 'Food & Drink' },
  { name: 'Water', key: 'water', glyph: '💧', group: 'Food & Drink' },
  { name: 'Home', key: 'home', glyph: '🏠', group: 'Home & Bills' },
  { name: 'Rent', key: 'rent', glyph: '🏡', group: 'Home & Bills' },
  { name: 'Electricity', key: 'zap', glyph: '⚡', group: 'Home & Bills' },
  { name: 'Internet', key: 'internet', glyph: '📶', group: 'Home & Bills' },
  { name: 'Phone', key: 'phone', glyph: '📱', group: 'Home & Bills' },
  { name: 'Tools', key: 'tools', glyph: '🛠️', group: 'Home & Bills' },
  { name: 'Shopping bag', key: 'shopping-bag', glyph: '🛍️', group: 'Shopping' },
  { name: 'Clothing', key: 'clothing', glyph: '👕', group: 'Shopping' },
  { name: 'Gift', key: 'gift', glyph: '🎁', group: 'Shopping' },
  { name: 'Health', key: 'health', glyph: '❤️', group: 'Health' },
  { name: 'Medicine', key: 'plus-square', glyph: '💊', group: 'Health' },
  { name: 'Hospital', key: 'hospital', glyph: '🏥', group: 'Health' },
  { name: 'Fitness', key: 'fitness', glyph: '🏋️', group: 'Health' },
  { name: 'Entertainment', key: 'play', glyph: '🎬', group: 'Lifestyle' },
  { name: 'Games', key: 'games', glyph: '🎮', group: 'Lifestyle' },
  { name: 'Music', key: 'music', glyph: '🎵', group: 'Lifestyle' },
  { name: 'Travel', key: 'travel', glyph: '🧳', group: 'Lifestyle' },
  { name: 'Education', key: 'education', glyph: '🎓', group: 'Lifestyle' },
  { name: 'Book', key: 'book', glyph: '📚', group: 'Lifestyle' },
  { name: 'Pet', key: 'pet', glyph: '🐾', group: 'Lifestyle' },
  { name: 'Savings goal', key: 'target', glyph: '🎯', group: 'Other' },
  { name: 'More', key: 'more', glyph: '✨', group: 'Other' },
] as const

const GLYPHS: Record<string, string> = Object.fromEntries(
  CATEGORY_ICON_OPTIONS.map((item) => [item.key, item.glyph]),
)

type Props = {
  icon: string
  color?: string
  size?: number
  backgroundColor?: string
}

export function CategoryIcon({ icon, color = '#0F766E', size = 40, backgroundColor = 'transparent' }: Props) {
  const customUri = icon.startsWith('custom:') ? icon.slice(7) : ''
  return (
    <View style={[styles.container, { width: size, height: size, backgroundColor }]}>
      {customUri ? (
        <Image source={{ uri: customUri }} style={{ width: size * 0.68, height: size * 0.68 }} contentFit="contain" />
      ) : (
        <Text style={[styles.glyph, { color, fontSize: size * 0.52 }]}>
          {GLYPHS[icon] ?? '◉'}
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', borderRadius: 12, overflow: 'hidden' },
  glyph: { fontWeight: '800', textAlign: 'center' },
})
