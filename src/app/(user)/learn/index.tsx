import { useAppTheme } from '@/context/ThemeContext'
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { UserPageHeader } from '@/components/user-navigation'
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


const topics = [
  { id: 'budgeting', title: 'Budgeting', icon: '📊', description: 'Give every peso a job before the month starts.', color: '#e5f3ef', accent: '#2a9a7c' },
  { id: 'saving', title: 'Saving', icon: '🐷', description: 'Pay yourself first and prepare for future needs.', color: '#fff3d9', accent: '#e1a337' },
  { id: 'borrowing', title: 'Borrowing', icon: '🤝', description: 'Know the full cost before you borrow.', color: '#eaf0ff', accent: '#628cdb' },
  { id: 'investing', title: 'Investing', icon: '📈', description: 'Start with your goals and time, not tips.', color: '#f2eaff', accent: '#9674d0' },
  { id: 'insurance', title: 'Insurance', icon: '🛡️', description: 'Protect your savings from big surprises.', color: '#e5f5fa', accent: '#59abc6' },
  { id: 'safety', title: 'Financial safety', icon: '🔐', description: 'Never share your OTP or password.', color: '#ffeded', accent: '#d97b76' },
]

export default function LearnHubScreen() {
  const { resolvedTheme } = useAppTheme()
  const dark = resolvedTheme === 'dark'
  const C = getC(dark)
  const styles = makeStyles(dark, C)

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
    <SafeAreaView style={styles.safe} edges={['top']}>
      <UserPageHeader title="Financial Literacy" subtitle="Learn to make better money decisions" />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={['#0a3b34', '#0d6d60', '#159581']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroDecor} />
          <View style={styles.heroBadge}><Text style={styles.heroEyebrow}>✦ TRACK MO LEARNING HUB</Text></View>
          <Text style={styles.heroTitle}>Your money, your next move.</Text>
          <Text style={styles.heroText}>
            Build money confidence with bite-sized lessons and fun challenges for everyday decisions.
          </Text>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}><Text style={styles.heroStatNumber}>06</Text><Text style={styles.heroStatLabel}>TOPICS</Text></View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}><Text style={styles.heroStatNumber}>{loading ? '–' : lessons.length}</Text><Text style={styles.heroStatLabel}>LESSONS</Text></View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}><Text style={styles.heroStatNumber}>02</Text><Text style={styles.heroStatLabel}>GAMES</Text></View>
          </View>
        </LinearGradient>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Play & Learn 🎮</Text>
            <Text style={styles.sectionSubtitle}>Challenge yourself while having fun</Text>
          </View>
        </View>
        <Pressable
          style={({ pressed }) => [styles.gameCard, { backgroundColor: dark ? '#1d3b33' : '#eff8f3' }, pressed && styles.cardPressed]}
          onPress={() => router.push('/(user)/learn/financial-qa' as any)}
          accessibilityRole="button"
        >
          <View style={[styles.gameIcon, { backgroundColor: dark ? '#28483e' : '#e3f4ed' }]}>
            <Text style={{ fontSize: 27 }}>🧠</Text>
          </View>
          <View style={styles.gameText}>
            <Text style={styles.gameTitle}>Financial Q&A</Text>
            <Text style={styles.gameDescription}>Test your money smarts with quick questions and instant feedback.</Text>
            <Text style={styles.gameMeta}>12 QUESTIONS  ·  INSTANT FEEDBACK</Text>
          </View>
          <View style={styles.gameArrowCircle}><Text style={styles.gameArrow}>↗</Text></View>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.gameCard, { backgroundColor: dark ? '#302d43' : '#f4effc' }, pressed && styles.cardPressed]}
          onPress={() => router.push('/(user)/learn/financial-2048' as any)}
          accessibilityRole="button"
        >
          <View style={[styles.gameIcon, { backgroundColor: dark ? '#3d3452' : '#f0eafa' }]}>
            <Text style={{ fontSize: 27 }}>🔢</Text>
          </View>
          <View style={styles.gameText}>
            <Text style={styles.gameTitle}>2048 Money Mind</Text>
            <Text style={styles.gameDescription}>Swipe and merge tiles in a fast, satisfying strategy puzzle.</Text>
            <Text style={styles.gameMeta}>SWIPE PUZZLE  ·  REACH 2048</Text>
          </View>
          <View style={styles.gameArrowCircle}><Text style={styles.gameArrow}>↗</Text></View>
        </Pressable>

        <View style={[styles.sectionHeader, { marginTop: 15 }]}>
          <View>
            <Text style={styles.sectionTitle}>Learn the Basics</Text>
            <Text style={styles.sectionSubtitle}>Everyday skills, one lesson at a time</Text>
          </View>
          <Text style={styles.sectionCount}>6 TOPICS</Text>
        </View>

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
              style={({ pressed }) => [styles.topicCard, { borderLeftColor: topic.accent }, pressed && styles.cardPressed]}
              onPress={() => router.push({
                pathname: '/(user)/learn/[id]' as any,
                params: { id: topic.id },
              })}
              accessibilityRole="button"
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
              <View style={styles.topicArrowCircle}><Text style={styles.topicArrow}>›</Text></View>
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

function makeStyles(dark: boolean, C: any) { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 40 },
  hero: { borderRadius: 24, padding: 22, marginBottom: 25, overflow: 'hidden', minHeight: 229 },
  heroDecor: { position: 'absolute', width: 200, height: 200, right: -75, top: -95, borderRadius: 100, borderWidth: 34, borderColor: 'rgba(255,255,255,0.09)' },
  heroBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 99 },
  heroEyebrow: { color: '#d9fff1', fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 1.1 },
  heroTitle: { color: '#ffffff', fontSize: 26, lineHeight: 32, fontWeight: '900', marginTop: 14, maxWidth: '90%' },
  heroText: { color: '#d6f0e8', fontSize: 12, lineHeight: 19, marginTop: 8 },
  heroStats: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,25,20,0.20)', borderRadius: 15, marginTop: 19, paddingVertical: 12, paddingHorizontal: 8 },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatNumber: { color: '#ffffff', fontSize: 21, lineHeight: 25, fontWeight: '900' },
  heroStatLabel: { color: '#cdeee4', fontSize: 9, fontWeight: '900', letterSpacing: 0.8, marginTop: 2 },
  heroStatDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.2)' },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 13 },
  sectionTitle: { color: C.ink, fontSize: 19, lineHeight: 24, fontWeight: '900' },
  sectionSubtitle: { color: C.muted, fontSize: 11, lineHeight: 17, marginTop: 3 },
  sectionCount: { color: C.brand, fontSize: 10, fontWeight: '900', letterSpacing: 0.7, marginBottom: 3 },
  gameCard: { minHeight: 116, borderWidth: 1, borderColor: C.line, borderRadius: 19, padding: 14, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardPressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
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
  subtitle: { color: C.muted, fontSize: 12, marginTop: 3, textAlign: 'center' },
  title: { color: C.ink, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  gameIcon: { width: 58, height: 58, flexShrink: 0, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  gameText: { flex: 1, minWidth: 0 },
  gameTitle: { color: C.ink, fontSize: 16, lineHeight: 21, fontWeight: '900' },
  gameDescription: { color: C.muted, fontSize: 11, lineHeight: 17, marginTop: 4 },
  gameMeta: { color: C.brand, fontSize: 9, lineHeight: 13, fontWeight: '900', letterSpacing: 0.45, marginTop: 9 },
  gameArrowCircle: { width: 29, height: 29, borderRadius: 15, backgroundColor: dark ? '#29433e' : '#ffffff', alignItems: 'center', justifyContent: 'center' },
  gameArrow: { color: C.brand, fontSize: 17, fontWeight: '900' },
  topicCard: {
    minHeight: 98,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderLeftWidth: 4,
    borderRadius: 17,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  topicIcon: { width: 51, height: 51, flexShrink: 0, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  topicTitle: { color: C.ink, fontSize: 15, lineHeight: 20, fontWeight: '900' },
  topicDescription: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  lessonCount: { color: C.brand, fontSize: 10, lineHeight: 14, fontWeight: '800', marginTop: 6 },
  topicArrowCircle: { width: 27, height: 27, borderRadius: 14, backgroundColor: dark ? '#2a3b34' : '#f2f6f3', alignItems: 'center', justifyContent: 'center' },
  topicArrow: { color: C.brand, fontSize: 23, lineHeight: 26, fontWeight: '700' },
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, padding: 15, borderRadius: 13, marginBottom: 10 },
  error: { color: (dark ? '#ff8178' : '#b42318'), fontSize: 13, lineHeight: 19 },
  disclaimer: { backgroundColor: (dark ? '#3b3020' : '#fff7e8'), borderRadius: 13, padding: 15, marginTop: 8 },
  disclaimerTitle: { color: (dark ? '#f5c56d' : '#80530c'), fontWeight: '900', fontSize: 13, lineHeight: 18 },
  disclaimerText: { color: (dark ? '#c7b48b' : '#765f39'), fontSize: 11, lineHeight: 17, marginTop: 5 },
}) }
