import { Image } from 'expo-image'
import { StyleSheet, View } from 'react-native'

export function AnimatedSplashOverlay() {
  return null
}

export function AnimatedIcon() {
  return (
    <View style={styles.iconContainer}>
      <View style={styles.background} />
      <Image style={styles.image} source={require('@/assets/images/expo-logo.png')} contentFit="contain" />
    </View>
  )
}

const styles = StyleSheet.create({
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 128,
    height: 128,
  },
  background: {
    borderRadius: 40,
    backgroundColor: '#1688E8',
    width: 128,
    height: 128,
    position: 'absolute',
  },
  image: {
    width: 76,
    height: 71,
  },
})
