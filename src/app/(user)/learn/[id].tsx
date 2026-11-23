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

const topicDetails: Record<string, { icon: string; intro: string; question: string; lightBg: string; accent: string }> = {
  budgeting: {
    icon: '🧮', intro: 'A simple plan for every peso you earn.',
    question: 'What is one spending category you can set a limit for this week?',
    lightBg: '#e8f4ed', accent: '#0f766e',
  },
  saving: {
    icon: '🐷', intro: 'Small amounts today can build peace of mind tomorrow.',
    question: 'What small amount could you set aside regularly, even on busy weeks?',
    lightBg: '#fff2db', accent: '#9c6822',
  },
  borrowing: {
    icon: '🤝', intro: 'Borrow with confidence by knowing the full cost.',
    question: 'What would you check before saying yes to a loan?',
    lightBg: '#eaf0fe', accent: '#496eae',
  },
  investing: {
    icon: '🌱', intro: 'Grow your money with goals, patience, and care.',
    question: 'What future goal would you like to prepare for first?',
    lightBg: '#f1eafa', accent: '#7956ad',
  },
  insurance: {
    icon: '🛡️', intro: 'Make room in your plan for life’s unexpected moments.',
    question: 'Which unexpected expense would you most want to prepare for?',
    lightBg: '#e7f4fa', accent: '#397b9a',
  },
  safety: {
    icon: '🔐', intro: 'Keep your money and personal information protected.',
    question: 'What is one security habit you can improve today?',
    lightBg: '#fbecea', accent: '#ab5b53',
  },
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
  const topic = topicDetails[lesson?.topic || ''] || topicDetails.budgeting

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
        <Pressable onPress={() => router.replace('/(user)/learn' as any)} style={styles.back} accessibilityRole="button">
          <Text style={styles.backText}>←  All topics</Text>
        </Pressable>

        {loading ? (
          <ActivityIndicator size="large" color={C.brand} style={{ marginTop: 40 }} />
        ) : error ? (
          <View style={styles.card}>
            <Text style={styles.error}>Unable to load lesson: {error}</Text>
          </View>
        ) : lesson ? (
          <>
            <View style={styles.progressSection}>
              <View style={styles.progressHeading}>
                <Text style={styles.progressEyebrow}>YOUR LEARNING JOURNEY</Text>
                <Text style={styles.progressCount}>{String(lessonIndex + 1).padStart(2, '0')} / {String(lessons.length).padStart(2, '0')}</Text>
              </View>
              <View style={styles.progressTrack}>
                {lessons.map((item, index) => (
                  <View key={item.id} style={[styles.progressSegment, index <= lessonIndex && styles.progressSegmentActive]} />
                ))}
              </View>
            </View>

            <View style={[styles.lessonHero, { backgroundColor: dark ? '#20342d' : topic.lightBg, borderColor: dark ? '#38554a' : '#e0e9e2' }]}>
              <View style={styles.heroTopRow}>
                <View style={[styles.heroIcon, { backgroundColor: dark ? '#355246' : '#ffffff' }]}>
                  <Text style={styles.heroIconText}>{topic.icon}</Text>
                </View>
                <View style={styles.heroMeta}>
                  <Text style={[styles.topic, { color: dark ? C.brand : topic.accent }]}>{topicNames[lesson.topic] || lesson.topic}</Text>
                  <Text style={styles.lessonBadgeText}>LESSON {lessonIndex + 1} · {readingMinutes} MIN READ</Text>
                </View>
              </View>
              <Text style={styles.lessonHeroTitle}>{lesson.title}</Text>
              <Text style={styles.lessonHeroSubtitle}>{topic.intro}</Text>
            </View>

            <View style={styles.readingCard}>
              <View style={styles.readerHeader}>
                <Text style={styles.readingLabel}>LET’S BREAK IT DOWN</Text>
                <Text style={styles.readingMeta}>{String(paragraphs.length).padStart(2, '0')} {paragraphs.length === 1 ? 'PART' : 'PARTS'}</Text>
              </View>
              {paragraphs.map((paragraph, index) => (
                <View key={index} style={[styles.readingSection, index > 0 && styles.readingSectionBorder]}>
                  <View style={styles.sectionNumber}><Text style={styles.sectionNumberText}>{String(index + 1).padStart(2, '0')}</Text></View>
                  <Text style={styles.body}>{paragraph}</Text>
                </View>
              ))}
            </View>

            <View style={styles.reflectCard}>
              <View style={styles.reflectIcon}><Text style={styles.reflectIconText}>✦</Text></View>
              <View style={styles.reflectCopy}>
                <Text style={styles.reflectLabel}>YOUR LITTLE MONEY CHALLENGE</Text>
                <Text style={styles.reflectText}>{topic.question}</Text>
                <Text style={styles.reflectHint}>Take a moment to think about it. No pressure.</Text>
              </View>
            </View>

            {resources[lesson.topic] ? (
              <Pressable onPress={openResource} style={({ pressed }) => [styles.resourceButton, pressed && styles.pressed]} accessibilityRole="button">
                <View style={styles.resourceIcon}><Text style={styles.resourceIconText}>↗</Text></View>
                <View style={styles.resourceCopy}>
                  <Text style={styles.resourceText}>Want to go deeper?</Text>
                  <Text style={styles.resourceEyebrow}>Read more from an official source</Text>
                </View>
                <Text style={styles.resourceArrow}>›</Text>
              </Pressable>
            ) : null}

            {relatedLessons.length > 0 ? (
              <View style={styles.relatedSection}>
                <Text style={styles.relatedEyebrow}>STAY CURIOUS</Text>
                <Text style={styles.relatedTitle}>More lessons for you</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.relatedRow}>
                  {relatedLessons.map((item) => (
                    <Pressable key={item.id} style={({ pressed }) => [styles.related, pressed && styles.pressed]} onPress={() => showLesson(item)} accessibilityRole="button">
                      <Text style={styles.relatedEmoji}>{topicDetails[item.topic]?.icon || '📚'}</Text>
                      <Text style={styles.relatedTopic}>{topicNames[item.topic] || item.topic}</Text>
                      <Text style={styles.relatedText} numberOfLines={2}>{item.title}</Text>
                      <Text style={styles.relatedArrow}>Read lesson  →</Text>
                    </Pressable>
                  ))}
                </ScrollView>
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
  headerTitle: { color: C.ink, fontSize: 19, fontWeight: '900', textAlign: 'center' },
  headerSubtitle: { color: C.muted, fontSize: 12, marginTop: 3, textAlign: 'center' },
  content: { paddingHorizontal: 18, paddingTop: 13, paddingBottom: 42 },
  back: { alignSelf: 'flex-start', paddingVertical: 9, paddingRight: 15, marginBottom: 14 },
  backText: { color: C.brand, fontSize: 13, fontWeight: '800' },
  progressSection: { marginBottom: 18 },
  progressHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  progressEyebrow: { color: C.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  progressCount: { color: C.brand, fontSize: 12, fontWeight: '900' },
  progressTrack: { flexDirection: 'row', gap: 5 },
  progressSegment: { flex: 1, height: 5, backgroundColor: C.line, borderRadius: 8 },
  progressSegmentActive: { backgroundColor: C.brand },
  lessonHero: { borderRadius: 24, borderWidth: 1, padding: 23, marginBottom: 15, minHeight: 210 },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIcon: { width: 58, height: 58, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  heroIconText: { fontSize: 29 },
  heroMeta: { flex: 1, gap: 6 },
  topic: { fontSize: 11, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  lessonBadgeText: { color: C.muted, fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  lessonHeroTitle: { color: C.ink, fontSize: 27, lineHeight: 35, fontWeight: '900', marginTop: 19 },
  lessonHeroSubtitle: { color: C.muted, fontSize: 13, lineHeight: 21, marginTop: 8 },
  card: { backgroundColor: C.card, borderRadius: 17, borderWidth: 1, borderColor: C.line, padding: 19, marginBottom: 13 },
  readingCard: { backgroundColor: C.card, borderRadius: 22, borderWidth: 1, borderColor: C.line, paddingHorizontal: 19, paddingTop: 20, paddingBottom: 10, marginBottom: 16 },
  readerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 },
  readingLabel: { color: C.brand, fontSize: 10, fontWeight: '900', letterSpacing: 1.05 },
  readingMeta: { color: C.muted, fontSize: 10, fontWeight: '800' },
  readingSection: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 18 },
  readingSectionBorder: { borderTopWidth: 1, borderTopColor: C.line },
  sectionNumber: { width: 31, height: 31, borderRadius: 11, backgroundColor: dark ? '#294139' : '#ecf6f1', alignItems: 'center', justifyContent: 'center' },
  sectionNumberText: { color: C.brand, fontSize: 11, fontWeight: '900' },
  body: { flex: 1, minWidth: 0, color: C.ink, fontSize: 15, lineHeight: 26 },
  reflectCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 13, backgroundColor: dark ? '#28362f' : '#f4f0e6', borderRadius: 20, padding: 18, marginBottom: 13, borderWidth: 1, borderColor: dark ? '#475145' : '#ebe5d6' },
  reflectIcon: { width: 36, height: 36, backgroundColor: dark ? '#4a5032' : '#fff2c7', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  reflectIconText: { color: dark ? '#ffdf8a' : '#8a5c1b', fontSize: 19, fontWeight: '800' },
  reflectCopy: { flex: 1, minWidth: 0 },
  reflectLabel: { color: dark ? '#f7d48a' : '#976322', fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  reflectText: { color: C.ink, fontSize: 15, lineHeight: 22, marginTop: 7, fontWeight: '800' },
  reflectHint: { color: C.muted, fontSize: 11, lineHeight: 17, marginTop: 8 },
  resourceButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 17, paddingHorizontal: 15, paddingVertical: 14, marginBottom: 25, gap: 12 },
  resourceIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: dark ? '#294139' : '#eaf5ef', alignItems: 'center', justifyContent: 'center' },
  resourceIconText: { color: C.brand, fontSize: 22, fontWeight: '800' },
  resourceCopy: { flex: 1, minWidth: 0 },
  resourceEyebrow: { color: C.muted, fontSize: 11, marginTop: 4 },
  resourceText: { color: C.ink, fontWeight: '900', fontSize: 14 },
  resourceArrow: { color: C.brand, fontSize: 24, fontWeight: '800', marginLeft: 4 },
  pressed: { opacity: 0.76 },
  relatedSection: { marginBottom: 22 },
  relatedEyebrow: { color: C.brand, fontSize: 10, letterSpacing: 0.8, fontWeight: '900' },
  relatedTitle: { color: C.ink, fontSize: 19, lineHeight: 25, fontWeight: '900', marginTop: 4, marginBottom: 12 },
  relatedRow: { gap: 11, paddingRight: 18, paddingBottom: 3 },
  related: { width: 164, minHeight: 155, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 14 },
  relatedEmoji: { fontSize: 23, marginBottom: 9 },
  relatedTopic: { color: C.brand, fontSize: 10, fontWeight: '900', marginBottom: 4 },
  relatedText: { color: C.ink, fontSize: 12, lineHeight: 18, fontWeight: '800', flex: 1 },
  relatedArrow: { color: C.brand, fontSize: 10, fontWeight: '900', marginTop: 9 },
  lessonNav: { flexDirection: 'row', gap: 10, marginBottom: 15 },
  lessonNavSpacer: { flex: 1 },
  previousButton: { flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 15, justifyContent: 'center', minHeight: 76 },
  previousLabel: { color: C.brand, fontSize: 12, fontWeight: '900' },
  navLessonTitle: { color: C.muted, fontSize: 11, marginTop: 5 },
  nextButton: { flex: 1, backgroundColor: C.brand, borderRadius: 16, padding: 15, justifyContent: 'center', minHeight: 76 },
  nextLabel: { color: dark ? '#17382e' : '#ffffff', fontSize: 12, fontWeight: '900' },
  nextTitle: { color: dark ? '#214a3f' : '#d9f5ec', fontSize: 11, marginTop: 5 },
  disclaimer: { backgroundColor: (dark ? '#3b3020' : '#fff7e8'), borderRadius: 13, padding: 15, marginTop: 3 },
  disclaimerTitle: { color: (dark ? '#f5c56d' : '#80530c'), fontWeight: '800', fontSize: 13 },
  disclaimerText: { color: (dark ? '#c7b48b' : '#765f39'), fontSize: 12, marginTop: 5 },
  error: { color: (dark ? '#ff8178' : '#b42318') },
  emptyTitle: { color: C.ink, fontSize: 17, fontWeight: '800' },
  emptyText: { color: C.muted, fontSize: 13, lineHeight: 20, marginTop: 7 },
}) }
