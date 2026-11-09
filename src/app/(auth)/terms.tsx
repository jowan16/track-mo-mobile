import { router } from 'expo-router'
import { ScrollView, StyleSheet, Text, Pressable, View } from 'react-native'

const sections = [
  {
    title: '1. Acceptance of Terms',
    body: 'By creating an account and using Track Mo, Pake Ko!, you agree to follow these Terms and Conditions.',
  },
  {
    title: '2. Purpose of the Application',
    body: 'Track Mo, Pake Ko! is an educational expense-tracking and budgeting application designed to help users monitor their expenses, manage budgets, and improve their financial literacy.',
  },
  {
    title: '3. User Responsibilities',
    body: 'Users are responsible for providing accurate account information, keeping their login credentials secure, and using the application appropriately.',
  },
  {
    title: '4. Account Security',
    body: 'Users should not share their passwords or allow unauthorized individuals to access their accounts.',
  },
  {
    title: '5. Proper Use of the Application',
    body: "Users must not attempt to access another person's account, disrupt the application, or misuse its features.",
  },
  {
    title: '6. Changes to These Terms',
    body: 'These Terms and Conditions may be updated when necessary. Users should review this page for changes.',
  },
]

export default function TermsScreen() {
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.title}>Terms and Conditions</Text>
          <Text style={styles.updated}>Last updated: November 1, 2026</Text>
          {sections.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.body}>{section.body}</Text>
            </View>
          ))}
          <Pressable onPress={() => router.replace('/(auth)/register')} hitSlop={8}>
            <Text style={styles.backLink}>Back to Sign Up</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  scrollContent: { flexGrow: 1, padding: 20, paddingVertical: 32 },
  card: {
    width: '100%', maxWidth: 720, alignSelf: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 16, padding: 22, borderWidth: 1, borderColor: '#E5E7EB',
  },
  title: { color: '#111827', fontSize: 27, fontWeight: '800', marginBottom: 18 },
  updated: { color: '#6B7280', fontSize: 12, marginBottom: 24 },
  section: { marginBottom: 22 },
  sectionTitle: { color: '#111827', fontSize: 17, fontWeight: '700', marginBottom: 8 },
  body: { color: '#374151', fontSize: 14, lineHeight: 22 },
  backLink: { color: '#0F766E', fontSize: 14, fontWeight: '700', textDecorationLine: 'underline', marginTop: 4 },
})
