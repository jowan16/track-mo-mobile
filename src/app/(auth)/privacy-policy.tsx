import { router } from 'expo-router'
import { ScrollView, StyleSheet, Text, Pressable, View } from 'react-native'

const sections = [
  {
    title: '1. Information We Collect',
    body: 'Track Mo, Pake Ko! may collect information such as your name, email address, expense records, and budget information when you use the application.',
  },
  {
    title: '2. How We Use Your Information',
    body: "Your information is used to provide account access, track expenses, manage budgets, generate reports, and support the application's financial literacy features.",
  },
  {
    title: '3. Data Storage',
    body: "Information submitted through the application is stored using its configured backend services. Access should be restricted according to the application's security settings.",
  },
  {
    title: '4. Data Protection',
    body: 'We aim to protect user information through appropriate security measures. Users should also keep their account credentials private.',
  },
  {
    title: '5. Sharing of Information',
    body: 'Personal information should not be shared with unauthorized parties. Information may be processed by service providers necessary to operate the application.',
  },
  {
    title: '6. Privacy Policy Updates',
    body: "This Privacy Policy may be updated when the application's data practices or requirements change.",
  },
]

export default function PrivacyPolicyScreen() {
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.title}>Privacy Policy</Text>
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
