import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
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

const resources: Record<string, string> = {
  budgeting: 'https://filiapp.treasury.gov.ph/budgeting.html',
  saving: 'https://www.bsp.gov.ph/Pages/InclusiveFinance/FinancialEducationLearningModules.aspx',
  investing: 'https://appointment.sec.gov.ph/investors-education-and-information/investment-101/',
  borrowing: 'https://www.bsp.gov.ph/Pages/InclusiveFinance/FinancialEducationLearningModules.aspx',
  insurance: 'https://www.insurance.gov.ph/',
  safety: 'https://www.bsp.gov.ph/Pages/InclusiveFinance/FinEdConsumerProtectionCampaigns1.aspx',
}

const topicNames: Record<string, string> = {
  budgeting: 'Budgeting',
  saving: 'Saving',
  borrowing: 'Borrowing',
  investing: 'Investing',
  insurance: 'Insurance',
  safety: 'Financial safety',
}

export default function LessonDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    const load = async () => {
      const { data, error: queryError } = await supabase
        .from('lessons')
        .select('*')
        .order('sort_order', { ascending: true })

      if (!active) return

      if (queryError) {
        setError(queryError.message)
      } else {
        const all = (data || []) as Lesson[]
        setLessons(all)
        const selected = all.find((item) =>
          String(item.id) === id || item.topic === id,
        )
        setLesson(selected || null)
      }
      setLoading(false)
    }

    load()
    return () => { active = false }
  }, [id])

  const openResource = async () => {
    const url = resources[lesson?.topic || '']
    if (!url) return
    try {
      await Linking.openURL(url)
    } catch {
      Alert.alert('Unable to open link', 'Please try again later.')
    }
  }

  const topicLessons = lessons.filter((item) => item.topic === id)

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <UserMenuButton />
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Learning lesson</Text>
          <Text style={styles.headerSubtitle}>Financial Literacy</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>‹  Back to topics</Text>
        </Pressable>

        {loading ? (
          <ActivityIndicator size="large" color={C.brand} style={{ marginTop: 40 }} />
        ) : error ? (
          <View style={styles.card}>
            <Text style={styles.error}>Unable to load lesson: {error}</Text>
          </View>
        ) : lesson ? (
          <>
            <Text style={styles.topic}>{topicNames[lesson.topic] || lesson.topic}</Text>
            <Text style={styles.title}>{lesson.title}</Text>
            <View style={styles.card}>
              <Text style={styles.body}>{lesson.body}</Text>
            </View>

            <Pressable onPress={openResource} style={styles.resourceButton}>
              <Text style={styles.resourceText}>Read more from an official resource ↗</Text>
            </Pressable>

            <View style={styles.disclaimer}>
              <Text style={styles.disclaimerTitle}>Educational disclaimer</Text>
              <Text style={styles.disclaimerText}>
                For education only. This is not financial advice.
              </Text>
            </View>

            {topicLessons.length > 1 ? (
              <View style={styles.card}>
                <Text style={styles.relatedTitle}>More lessons in this topic</Text>
                {topicLessons.filter((item) => item.id !== lesson.id).map((item) => (
                  <Pressable
                    key={item.id}
                    style={styles.related}
                    onPress={() => router.replace({
                      pathname: '/(user)/learn/[id]' as any,
                      params: { id: String(item.id) },
                    })}
                  >
                    <Text style={styles.relatedText}>{item.title}</Text>
                    <Text style={styles.arrow}>›</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <View style={styles.card}>
            <Text style={styles.emptyTitle}>Lessons coming soon</Text>
            <Text style={styles.emptyText}>
              There are no published lessons for {topicNames[id || ''] || 'this topic'} yet.
              Please check back later.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 18 },
  headerTitle: { color: C.ink, fontSize: 20, fontWeight: '800' },
  headerSubtitle: { color: C.muted, fontSize: 12, marginTop: 3 },
  content: { padding: 17, paddingBottom: 40 },
  back: { marginBottom: 18, paddingVertical: 5 },
  backText: { color: C.brand, fontSize: 14, fontWeight: '800' },
  topic: { color: C.brand, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  title: { color: C.ink, fontSize: 25, fontWeight: '900', marginTop: 7, marginBottom: 17 },
  card: { backgroundColor: C.card, borderRadius: 15, borderWidth: 1, borderColor: C.line, padding: 17, marginBottom: 13 },
  body: { color: C.ink, fontSize: 15, lineHeight: 25 },
  resourceButton: { backgroundColor: C.brand, borderRadius: 12, padding: 15, alignItems: 'center', marginVertical: 8 },
  resourceText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },
  disclaimer: { backgroundColor: '#fff7e8', borderRadius: 13, padding: 15, marginTop: 7 },
  disclaimerTitle: { color: '#80530c', fontWeight: '800', fontSize: 13 },
  disclaimerText: { color: '#765f39', fontSize: 12, marginTop: 5 },
  relatedTitle: { color: C.ink, fontSize: 15, fontWeight: '800', marginBottom: 8 },
  related: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.line },
  relatedText: { color: C.ink, fontSize: 13, fontWeight: '600', flex: 1 },
  arrow: { color: C.muted, fontSize: 23 },
  error: { color: '#b42318' },
  emptyTitle: { color: C.ink, fontSize: 17, fontWeight: '800' },
  emptyText: { color: C.muted, fontSize: 13, lineHeight: 20, marginTop: 7 },
})
