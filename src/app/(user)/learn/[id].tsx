import { useAppTheme } from '@/context/ThemeContext'
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
import { LinearGradient } from 'expo-linear-gradient'

type Lesson = {
  id: number
  topic: string
  title: string
  body: string
  sort_order: number
}

const LIGHT_C = {
  bg: '#f6f7f5',
  card: '#ffffff',
  ink: '#14201c',
  muted: '#64716c',
  line: '#e4e8e5',
  brand: '#0f766e',
}
function getC(dark: boolean) { return dark ? {
  bg: '#101a18',
  card: '#1b2a26',
  ink: '#edf5f1',
  muted: '#a9b8b1',
  line: '#30413a',
  brand: '#55c6b0',
} : LIGHT_C }


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
  const { resolvedTheme } = useAppTheme()
  const dark = resolvedTheme === 'dark'
  const C = getC(dark)
  const styles = makeStyles(dark, C)

  const { id } = useLocalSearchParams<{ id: string }>()
  const [lessons, setLessons] = useState<Lesson[]>([])
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
        setLessons((data || []) as Lesson[])
        setError('')
      }
      setLoading(false)
    }

    load()
    return () => { active = false }
  }, [])

  const lesson = lessons.find((item) => String(item.id) === id || item.topic === id) || null
  const lessonIndex = lessons.findIndex((item) => item.id === lesson?.id)
  const previousLesson = lessonIndex > 0 ? lessons[lessonIndex - 1] : null
  const nextLesson = lessonIndex >= 0 && lessonIndex < lessons.length - 1 ? lessons[lessonIndex + 1] : null
  const relatedLessons = lessons.filter((item) => item.id !== lesson?.id)
  const paragraphs = (lesson?.body || '').split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean)
  const readingMinutes = Math.max(1, Math.ceil((lesson?.body || '').trim().split(/\s+/).filter(Boolean).length / 170))

  const showLesson = (target: Lesson) => router.replace({
    pathname: '/(user)/learn/[id]' as any,
    params: { id: String(target.id) },
  })

  const openResource = async () => {
    const url = resources[lesson?.topic || '']
    if (!url) return
    try {
      await Linking.openURL(url)
    } catch {
      Alert.alert('Unable to open link', 'Please try again later.')
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <UserMenuButton />
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Learning lesson</Text>
          <Text style={styles.headerSubtitle}>Financial Literacy</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView key={id} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
            <LinearGradient
              colors={['#0a3b34', '#0e7568', '#169581']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.lessonHero}
            >
              <View style={styles.heroTopRow}>
                <View style={styles.topicChip}>
                  <Text style={styles.topic}>{topicNames[lesson.topic] || lesson.topic}</Text>
                </View>
                <View style={styles.lessonBadge}>
                  <Text style={styles.lessonBadgeText}>LESSON {lessonIndex + 1} OF {lessons.length}</Text>
                </View>
              </View>
              <Text style={styles.lessonHeroTitle}>{lesson.title}</Text>
              <Text style={styles.lessonHeroSubtitle}>Practical money knowledge for everyday decisions.</Text>
            </LinearGradient>

            <View style={styles.readingCard}>
              <View style={styles.readerHeader}>
                <View style={styles.readerIcon}><Text style={styles.readerEmoji}>📖</Text></View>
                <View style={styles.readerTitleGroup}>
                  <Text style={styles.readingLabel}>YOUR LEARNING NOTES</Text>
                  <Text style={styles.readingMeta}>About {readingMinutes} min read · Learn at your pace</Text>
                </View>
              </View>
              <View style={styles.readerDivider} />
              {paragraphs.map((paragraph, index) => (
                <Text key={index} style={[styles.body, index > 0 && styles.bodySpacing]}>
                  {paragraph}
                </Text>
              ))}
            </View>

            <View style={styles.reflectCard}>
              <Text style={styles.reflectLabel}>💡 PUT IT INTO PRACTICE</Text>
              <Text style={styles.reflectText}>{"What's one small money habit you can try after reading this lesson?"}</Text>
            </View>

            {resources[lesson.topic] ? (
              <Pressable onPress={openResource} style={({ pressed }) => [styles.resourceButton, pressed && styles.pressed]} accessibilityRole="button">
                <View style={styles.resourceCopy}>
                  <Text style={styles.resourceEyebrow}>WANT TO LEARN MORE?</Text>
                  <Text style={styles.resourceText}>Explore an official resource</Text>
                </View>
                <Text style={styles.resourceArrow}>↗</Text>
              </Pressable>
            ) : null}

            {relatedLessons.length > 0 ? (
              <View style={styles.relatedCard}>
                <Text style={styles.relatedEyebrow}>KEEP EXPLORING</Text>
                <Text style={styles.relatedTitle}>Explore other money topics</Text>
                {relatedLessons.map((item) => (
                  <Pressable key={item.id} style={({ pressed }) => [styles.related, pressed && styles.pressed]} onPress={() => showLesson(item)} accessibilityRole="button">
                    <View style={styles.relatedNumber}><Text style={styles.relatedNumberText}>{lessons.indexOf(item) + 1}</Text></View>
                    <View style={styles.relatedInfo}>
                      <Text style={styles.relatedTopic}>{topicNames[item.topic] || item.topic}</Text>
                      <Text style={styles.relatedText} numberOfLines={2}>{item.title}</Text>
                    </View>
                    <Text style={styles.arrow}>›</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <View style={styles.lessonNav}>
              {previousLesson ? (
                <Pressable style={({ pressed }) => [styles.previousButton, pressed && styles.pressed]} onPress={() => showLesson(previousLesson)} accessibilityRole="button">
                  <Text style={styles.previousLabel}>← Previous</Text>
                  <Text style={styles.navLessonTitle} numberOfLines={1}>{previousLesson.title}</Text>
                </Pressable>
              ) : <View style={styles.lessonNavSpacer} />}
              {nextLesson ? (
                <Pressable style={({ pressed }) => [styles.nextButton, pressed && styles.pressed]} onPress={() => showLesson(nextLesson)} accessibilityRole="button">
                  <Text style={styles.nextLabel}>Next lesson →</Text>
                  <Text style={styles.nextTitle} numberOfLines={1}>{nextLesson.title}</Text>
                </Pressable>
              ) : (
                <Pressable style={({ pressed }) => [styles.nextButton, pressed && styles.pressed]} onPress={() => router.push('/(user)/learn' as any)} accessibilityRole="button">
                  <Text style={styles.nextLabel}>Back to topics →</Text>
                  <Text style={styles.nextTitle}>Explore more</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.disclaimer}>
              <Text style={styles.disclaimerTitle}>Educational disclaimer</Text>
              <Text style={styles.disclaimerText}>
                For education only. This is not financial advice.
              </Text>
            </View>
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

function makeStyles(dark: boolean, C: any) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      paddingVertical: 14,
      minHeight: 72,
      backgroundColor: dark ? '#1b2a26' : '#ffffff',
      borderBottomWidth: 1,
      borderBottomColor: dark ? '#30413a' : '#e4e8e5',
    },
  headerText: { position: 'absolute', left: 72, right: 72, alignItems: 'center' },
  headerSpacer: { width: 44, height: 44 },
  headerTitle: { color: C.ink, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  headerSubtitle: { color: C.muted, fontSize: 12, marginTop: 3, textAlign: 'center' },
  content: { paddingHorizontal: 17, paddingTop: 16, paddingBottom: 48 },
  back: { marginBottom: 16, paddingVertical: 6 },
  backText: { color: C.brand, fontSize: 14, fontWeight: '800' },
  lessonHero: { borderRadius: 23, padding: 22, marginBottom: 16, overflow: 'hidden', minHeight: 184, justifyContent: 'center' },
  heroTopRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  topicChip: { backgroundColor: 'rgba(255,255,255,0.17)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, alignSelf: 'flex-start' },
  topic: { color: '#d8fff0', fontSize: 10, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  lessonBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)' },
  lessonBadgeText: { color: '#e7fff6', fontSize: 9, fontWeight: '900', letterSpacing: 0.45 },
  lessonHeroTitle: { color: '#ffffff', fontSize: 25, lineHeight: 32, fontWeight: '900', marginTop: 13 },
  lessonHeroSubtitle: { color: '#d9eee9', fontSize: 12, lineHeight: 18, marginTop: 7 },
  card: { backgroundColor: C.card, borderRadius: 17, borderWidth: 1, borderColor: C.line, padding: 19, marginBottom: 13 },
  readingCard: { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.line, padding: 19, marginBottom: 14 },
  readerHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  readerIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: dark ? '#29473d' : '#e4f5ec', alignItems: 'center', justifyContent: 'center' },
  readerEmoji: { fontSize: 21 },
  readerTitleGroup: { flex: 1, minWidth: 0 },
  readingLabel: { color: C.brand, fontSize: 10, fontWeight: '900', letterSpacing: 0.85 },
  readingMeta: { color: C.muted, fontSize: 11, marginTop: 4 },
  readerDivider: { height: 1, backgroundColor: C.line, marginTop: 17, marginBottom: 16 },
  body: { color: C.ink, fontSize: 15, lineHeight: 26 },
  bodySpacing: { marginTop: 15 },
  reflectCard: { backgroundColor: dark ? '#203a32' : '#eaf7ef', borderRadius: 17, padding: 17, marginBottom: 14, borderWidth: 1, borderColor: dark ? '#305647' : '#d7ecdf' },
  reflectLabel: { color: C.brand, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  reflectText: { color: C.ink, fontSize: 13, lineHeight: 20, marginTop: 8, fontWeight: '600' },
  resourceButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.brand, borderRadius: 15, paddingHorizontal: 17, paddingVertical: 15, marginBottom: 17 },
  resourceCopy: { flex: 1, minWidth: 0 },
  resourceEyebrow: { color: dark ? '#245a4e' : '#b8eee3', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  resourceText: { color: (dark ? '#14201c' : '#ffffff'), fontWeight: '900', fontSize: 13, marginTop: 4 },
  resourceArrow: { color: dark ? '#14201c' : '#ffffff', fontSize: 24, fontWeight: '800', marginLeft: 10 },
  pressed: { opacity: 0.76 },
  relatedCard: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 16, marginBottom: 16 },
  relatedEyebrow: { color: C.brand, fontSize: 10, letterSpacing: 0.8, fontWeight: '900' },
  relatedTitle: { color: C.ink, fontSize: 17, lineHeight: 23, fontWeight: '900', marginTop: 5, marginBottom: 12 },
  related: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11, borderTopWidth: 1, borderTopColor: C.line },
  relatedNumber: { width: 29, height: 29, borderRadius: 10, backgroundColor: dark ? '#274139' : '#e6f4ed', alignItems: 'center', justifyContent: 'center' },
  relatedNumberText: { color: C.brand, fontSize: 12, fontWeight: '900' },
  relatedInfo: { flex: 1, minWidth: 0 },
  relatedTopic: { color: C.brand, fontSize: 10, fontWeight: '900', marginBottom: 3 },
  relatedText: { color: C.ink, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  arrow: { color: C.brand, fontSize: 23 },
  lessonNav: { flexDirection: 'row', gap: 10, marginBottom: 15 },
  lessonNavSpacer: { flex: 1 },
  previousButton: { flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 15, padding: 13, justifyContent: 'center', minHeight: 67 },
  previousLabel: { color: C.brand, fontSize: 12, fontWeight: '900' },
  navLessonTitle: { color: C.muted, fontSize: 11, marginTop: 5 },
  nextButton: { flex: 1, backgroundColor: C.brand, borderRadius: 15, padding: 13, justifyContent: 'center', minHeight: 67 },
  nextLabel: { color: dark ? '#17382e' : '#ffffff', fontSize: 12, fontWeight: '900' },
  nextTitle: { color: dark ? '#214a3f' : '#d9f5ec', fontSize: 11, marginTop: 5 },
  disclaimer: { backgroundColor: (dark ? '#3b3020' : '#fff7e8'), borderRadius: 13, padding: 15, marginTop: 3 },
  disclaimerTitle: { color: (dark ? '#f5c56d' : '#80530c'), fontWeight: '800', fontSize: 13 },
  disclaimerText: { color: (dark ? '#c7b48b' : '#765f39'), fontSize: 12, marginTop: 5 },
  error: { color: (dark ? '#ff8178' : '#b42318') },
  emptyTitle: { color: C.ink, fontSize: 17, fontWeight: '800' },
  emptyText: { color: C.muted, fontSize: 13, lineHeight: 20, marginTop: 7 },
}) }
