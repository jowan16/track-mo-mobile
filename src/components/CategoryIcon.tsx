import { SymbolView } from 'expo-symbols'
import { Image } from 'expo-image'
import { StyleSheet, View } from 'react-native'

type IconOption = {
  name: string
  key: string
  material: string
  ios: string
  group: string
}

export const CATEGORY_ICON_OPTIONS: IconOption[] = [
  { name: 'Wallet', key: 'wallet', material: 'account_balance_wallet', ios: 'wallet.bifold', group: 'Financial' },
  { name: 'Coins', key: 'coins', material: 'paid', ios: 'coins', group: 'Financial' },
  { name: 'Credit card', key: 'credit-card', material: 'credit_card', ios: 'creditcard', group: 'Financial' },
  { name: 'Bank', key: 'bank', material: 'account_balance', ios: 'building.columns', group: 'Financial' },
  { name: 'Savings', key: 'piggy-bank', material: 'savings', ios: 'banknote', group: 'Financial' },
  { name: 'Chart', key: 'chart', material: 'monitoring', ios: 'chart.bar.xaxis', group: 'Financial' },
  { name: 'Receipt', key: 'receipt', material: 'receipt_long', ios: 'receipt', group: 'Financial' },
  { name: 'Cash', key: 'cash', material: 'payments', ios: 'banknote.fill', group: 'Financial' },
  { name: 'Currency exchange', key: 'currency', material: 'currency_exchange', ios: 'arrow.left.arrow.right', group: 'Financial' },
  { name: 'Calculator', key: 'calculator', material: 'calculate', ios: 'calculator', group: 'Financial' },
  { name: 'Trending up', key: 'trending-up', material: 'trending_up', ios: 'chart.line.uptrend.xyaxis', group: 'Financial' },
  { name: 'Shopping cart', key: 'cart', material: 'shopping_cart', ios: 'cart', group: 'Shopping' },
  { name: 'Shopping bag', key: 'shopping-bag', material: 'shopping_bag', ios: 'bag', group: 'Shopping' },
  { name: 'Store', key: 'store', material: 'storefront', ios: 'storefront', group: 'Shopping' },
  { name: 'Tag', key: 'tag', material: 'sell', ios: 'tag', group: 'Shopping' },
  { name: 'Gift', key: 'gift', material: 'redeem', ios: 'gift', group: 'Shopping' },
  { name: 'Clothing', key: 'clothing', material: 'checkroom', ios: 'tshirt', group: 'Shopping' },
  { name: 'Diamond', key: 'diamond', material: 'diamond', ios: 'diamond', group: 'Shopping' },
  { name: 'Bus', key: 'bus', material: 'directions_bus', ios: 'bus', group: 'Transport' },
  { name: 'Car', key: 'car', material: 'directions_car', ios: 'car', group: 'Transport' },
  { name: 'Motorcycle', key: 'motorcycle', material: 'two_wheeler', ios: 'motorcycle', group: 'Transport' },
  { name: 'Train', key: 'train', material: 'train', ios: 'tram', group: 'Transport' },
  { name: 'Airplane', key: 'airplane', material: 'flight', ios: 'airplane', group: 'Transport' },
  { name: 'Gas', key: 'gas', material: 'local_gas_station', ios: 'fuelpump', group: 'Transport' },
  { name: 'Taxi', key: 'taxi', material: 'local_taxi', ios: 'car.side', group: 'Transport' },
  { name: 'Bicycle', key: 'bicycle', material: 'pedal_bike', ios: 'bicycle', group: 'Transport' },
  { name: 'Parking', key: 'parking', material: 'local_parking', ios: 'parkingsign.circle', group: 'Transport' },
  { name: 'Restaurant', key: 'utensils', material: 'restaurant', ios: 'fork.knife', group: 'Food & Drink' },
  { name: 'Groceries', key: 'groceries', material: 'grocery', ios: 'basket', group: 'Food & Drink' },
  { name: 'Coffee', key: 'coffee', material: 'coffee', ios: 'cup.and.saucer', group: 'Food & Drink' },
  { name: 'Water', key: 'water', material: 'water_drop', ios: 'drop', group: 'Food & Drink' },
  { name: 'Fast food', key: 'fast-food', material: 'fastfood', ios: 'takeoutbag.and.cup.and.straw', group: 'Food & Drink' },
  { name: 'Bakery', key: 'bakery', material: 'bakery_dining', ios: 'birthday.cake', group: 'Food & Drink' },
  { name: 'Fruit', key: 'fruit', material: 'nutrition', ios: 'carrot', group: 'Food & Drink' },
  { name: 'Home', key: 'home', material: 'home', ios: 'house', group: 'Home & Bills' },
  { name: 'Rent', key: 'rent', material: 'apartment', ios: 'building.2', group: 'Home & Bills' },
  { name: 'Electricity', key: 'zap', material: 'bolt', ios: 'bolt', group: 'Home & Bills' },
  { name: 'Internet', key: 'internet', material: 'wifi', ios: 'wifi', group: 'Home & Bills' },
  { name: 'Phone', key: 'phone', material: 'smartphone', ios: 'iphone', group: 'Home & Bills' },
  { name: 'Television', key: 'television', material: 'tv', ios: 'tv', group: 'Home & Bills' },
  { name: 'Water bill', key: 'water-bill', material: 'water', ios: 'drop.circle', group: 'Home & Bills' },
  { name: 'Tools', key: 'tools', material: 'build', ios: 'wrench.and.screwdriver', group: 'Home & Bills' },
  { name: 'Furniture', key: 'furniture', material: 'chair', ios: 'chair.lounge', group: 'Home & Bills' },
  { name: 'Health', key: 'health', material: 'favorite', ios: 'heart', group: 'Health' },
  { name: 'Medicine', key: 'plus-square', material: 'medication', ios: 'pills', group: 'Health' },
  { name: 'Hospital', key: 'hospital', material: 'local_hospital', ios: 'cross.case', group: 'Health' },
  { name: 'Dental care', key: 'dental', material: 'dentistry', ios: 'mouth', group: 'Health' },
  { name: 'Fitness', key: 'fitness', material: 'fitness_center', ios: 'dumbbell', group: 'Health' },
  { name: 'Mental wellness', key: 'wellness', material: 'self_improvement', ios: 'brain.head.profile', group: 'Health' },
  { name: 'Eye care', key: 'eye-care', material: 'visibility', ios: 'eye', group: 'Health' },
  { name: 'Entertainment', key: 'play', material: 'movie', ios: 'film', group: 'Lifestyle' },
  { name: 'Games', key: 'games', material: 'sports_esports', ios: 'gamecontroller', group: 'Lifestyle' },
  { name: 'Music', key: 'music', material: 'music_note', ios: 'music.note', group: 'Lifestyle' },
  { name: 'Travel', key: 'travel', material: 'luggage', ios: 'suitcase.rolling', group: 'Lifestyle' },
  { name: 'Camera', key: 'camera', material: 'photo_camera', ios: 'camera', group: 'Lifestyle' },
  { name: 'Sports', key: 'sports', material: 'sports_soccer', ios: 'sportscourt', group: 'Lifestyle' },
  { name: 'Beauty', key: 'beauty', material: 'spa', ios: 'sparkles', group: 'Lifestyle' },
  { name: 'Pets', key: 'pet', material: 'pets', ios: 'pawprint', group: 'Lifestyle' },
  { name: 'Education', key: 'education', material: 'school', ios: 'graduationcap', group: 'Education & Family' },
  { name: 'Books', key: 'book', material: 'menu_book', ios: 'book', group: 'Education & Family' },
  { name: 'Childcare', key: 'childcare', material: 'child_care', ios: 'figure.2.and.child.holdinghands', group: 'Education & Family' },
  { name: 'Family', key: 'family', material: 'family_restroom', ios: 'figure.2', group: 'Education & Family' },
  { name: 'Work', key: 'work', material: 'work', ios: 'briefcase', group: 'Education & Family' },
  { name: 'Office', key: 'office', material: 'business_center', ios: 'building.2.crop.circle', group: 'Education & Family' },
  { name: 'Target', key: 'target', material: 'track_changes', ios: 'scope', group: 'Other' },
  { name: 'More', key: 'more', material: 'category', ios: 'square.grid.2x2', group: 'Other' },
  { name: 'Calendar', key: 'calendar', material: 'calendar_month', ios: 'calendar', group: 'Other' },
  { name: 'Cloud', key: 'cloud', material: 'cloud', ios: 'cloud', group: 'Other' },
  { name: 'Subscriptions', key: 'subscriptions', material: 'subscriptions', ios: 'repeat', group: 'Other' },
  { name: 'Donations', key: 'donations', material: 'volunteer_activism', ios: 'hands.sparkles', group: 'Other' },
] 

const ICON_BY_KEY: Record<string, IconOption> = Object.fromEntries(
  CATEGORY_ICON_OPTIONS.map((item) => [item.key, item]),
)

// Keep older saved keys working while mapping them to the refreshed icon set.
const LEGACY_ICON_KEYS: Record<string, string> = {
  'shopping-cart': 'cart',
  'shopping-basket': 'groceries',
  'food': 'utensils',
  'restaurant': 'utensils',
  'movie': 'play',
  'healthcare': 'health',
}

type Props = {
  icon: string
  color?: string
  size?: number
  backgroundColor?: string
}

export function CategoryIcon({ icon, color = '#0F766E', size = 40, backgroundColor = 'transparent' }: Props) {
  const customUri = icon.startsWith('custom:') ? icon.slice(7) : ''
  const option = ICON_BY_KEY[LEGACY_ICON_KEYS[icon] ?? icon]
  return (
    <View style={[styles.container, { width: size, height: size, backgroundColor }]}>
      {customUri ? (
        <Image source={{ uri: customUri }} style={{ width: size * 0.68, height: size * 0.68 }} contentFit="contain" />
      ) : option ? (
        <SymbolView
          name={{ ios: option.ios, android: option.material, web: option.material } as never}
          tintColor={color}
          size={size * 0.58}
          weight="medium"
          fallback={null}
        />
      ) : (
        <SymbolView
          name={{ ios: 'square.grid.2x2', android: 'category', web: 'category' } as never}
          tintColor={color}
          size={size * 0.58}
          weight="medium"
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', borderRadius: 12, overflow: 'hidden' },
})
