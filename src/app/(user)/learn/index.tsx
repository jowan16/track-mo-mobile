import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { UserMenuButton } from '@/components/user-navigation'
import { supabase } from '@/services/supabase'

type Lesson = {
  id: number
  topic: string
  title: string
  body: string
  sort_order: number
}

const C = {
  bg: '#f6f7f5',
  card: '#ffffff',
  ink: '#14201c',
  muted: '#64716c',
  line: '#e4e8e5',
  brand: '#0f766e',
}

const topics = [
  { id: 'budgeting', title: 'Budgeting', icon: '📊', description: 'Give every peso a job before the month starts.', color: '#e5f3ef' },
  { id: 'saving', title: 'Saving', icon: '🐷', description: 'Pay yourself first and prepare for future needs.', color: '#fff3d9' },
  { id: 'borrowing', title: 'Borrowing', icon: '🤝', description: 'Know the full cost before you borrow.', color: '#eaf0ff' },
  { id: 'investing', title: 'Investing', icon: '📈', description: 'Start with your goals and time, not tips.', color: '#f2eaff' },
  { id: 'insurance', title: 'Insurance', icon: '🛡️', description: 'Protect your savings from big surprises.', color: '#e5f5fa' },
  { id: 'safety', title: 'Financial safety', icon: '🔐', description: 'Never share your OTP or password.', color: '#ffeded' },
]

export default function LearnHubScreen() {
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      const { data, error: queryError } = await supabase
        .from('lessons')
        .select('*')
        .order('sort_order', { ascending: true })

      if (!active) return

      if (queryError) {
        setError(queryError.message)
      } else {
        setLessons((data || []) as Lesson[])
        setError('')
      }
      setLoading(false)
    }

    load()
    return () => { active = false }
  }, [])

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <UserMenuButton />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Financial Literacy</Text>
          <Text style={styles.subtitle}>Learn to make better money decisions</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>TRACK MO LEARNING HUB</Text>
          <Text style={styles.heroTitle}>Make Better Financial Decisions</Text>
          <Text style={styles.heroText}>
            Build practical money skills one topic at a time. Explore budgeting,
            saving, borrowing, investing, insurance, and financial safety.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Learn the Basics</Text>

        {loading ? (
          <ActivityIndicator size="large" color={C.brand} style={{ margin: 28 }} />
        ) : error ? (
          <View style={styles.card}>
            <Text style={styles.error}>Unable to load lessons: {error}</Text>
          </View>
        ) : null}

        {topics.map((topic) => {
          const matching = lessons.filter((lesson) => lesson.topic === topic.id)

          return (
            <Pressable
              key={topic.id}
              style={styles.topicCard}
              onPress={() => router.push({
                pathname: '/(user)/learn/[id]' as any,
                params: { id: topic.id },
              })}
            >
              <View style={[styles.topicIcon, { backgroundColor: topic.color }]}>
                <Text style={{ fontSize: 25 }}>{topic.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.topicTitle}>{topic.title}</Text>
                <Text style={styles.topicDescription}>{topic.description}</Text>
                <Text style={styles.lessonCount}>
                  {loading ? 'Loading lessons...' : `${matching.length} ${matching.length === 1 ? 'lesson' : 'lessons'}`}
                </Text>
              </View>
              <Text style={styles.arrow}>›</Text>
            </Pressable>
          )
        })}

        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerTitle}>Educational disclaimer</Text>
          <Text style={styles.disclaimerText}>
            For education only. This content is not financial advice. Consider
            your personal circumstances before making financial decisions.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18 },
  title: { color: C.ink, fontSize: 21, fontWeight: '800' },
  subtitle: { color: C.muted, fontSize: 12, marginTop: 3 },
  content: { padding: 16, paddingBottom: 40 },
  hero: { backgroundColor: C.brand, borderRadius: 18, padding: 20, marginBottom: 23 },
  heroEyebrow: { color: '#c9eee6', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  heroTitle: { color: '#ffffff', fontSize: 24, fontWeight: '900', marginTop: 10 },
  heroText: { color: '#e5f5f1', fontSize: 13, lineHeight: 20, marginTop: 9 },
  sectionTitle: { color: C.ink, fontSize: 18, fontWeight: '800', marginBottom: 12 },
  topicCard: {
    flexDirection: 'row', alignItems: 'center', gap: 13,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line,
    borderRadius: 15, padding: 14, marginBottom: 10,
  },
  topicIcon: { width: 50, height: 50, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  topicTitle: { color: C.ink, fontSize: 15, fontWeight: '800' },
  topicDescription: { color: C.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  lessonCount: { color: C.brand, fontSize: 11, fontWeight: '700', marginTop: 6 },
  arrow: { color: C.muted, fontSize: 27 },
  card: { backgroundColor: C.card, padding: 15, borderRadius: 13 },
  error: { color: '#b42318', fontSize: 13 },
  disclaimer: { backgroundColor: '#fff7e8', borderRadius: 13, padding: 15, marginTop: 13 },
  disclaimerTitle: { color: '#80530c', fontWeight: '800', fontSize: 13 },
  disclaimerText: { color: '#765f39', fontSize: 12, lineHeight: 18, marginTop: 5 },
})
