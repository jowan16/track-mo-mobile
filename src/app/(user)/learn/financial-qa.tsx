import { useAppTheme } from '@/context/ThemeContext'
import React, { useState } from 'react'
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { router } from 'expo-router'

type Question = {
  question: string
  options: string[]
  answer: number
  explanation: string
  topic: string
}

const questions: Question[] = [
  {
    question: 'You receive your allowance for the week. What is the best first step?',
    options: ['Spend on wants immediately', 'Plan needs, savings, and wants', 'Borrow money for extra spending', 'Ignore how much you have'],
    answer: 1,
    explanation: 'A simple plan helps you cover important needs, save for goals, and control optional spending.',
    topic: 'Budgeting',
  },
  {
    question: 'What does “pay yourself first” mean?',
    options: ['Buy something before paying bills', 'Save a planned amount before spending on wants', 'Lend all your money to friends', 'Keep no record of savings'],
    answer: 1,
    explanation: 'Set aside savings as soon as you receive money, then plan the rest for expenses.',
    topic: 'Saving',
  },
  {
    question: 'Which is an example of a need?',
    options: ['A new game skin', 'A designer bag', 'Food for your daily meals', 'The latest phone'],
    answer: 2,
    explanation: 'Needs are essentials such as food, housing, utilities, and necessary transportation.',
    topic: 'Needs and wants',
  },
  {
    question: 'Why should you keep an emergency fund?',
    options: ['To buy every sale item', 'To prepare for unexpected expenses', 'To avoid making a budget', 'To increase daily spending'],
    answer: 1,
    explanation: 'An emergency fund can help with unexpected costs such as urgent repairs or medical needs.',
    topic: 'Emergency savings',
  },
  {
    question: 'What happens when you spend more than you earn?',
    options: ['You automatically save more', 'You may need to use savings or borrow', 'Your expenses disappear', 'Your income increases'],
    answer: 1,
    explanation: 'Spending beyond your income can lead to debt or reduce money saved for future needs.',
    topic: 'Cash flow',
  },
  {
    question: 'Before borrowing money, what should you check?',
    options: ['Only the amount you will receive', 'The interest, fees, due dates, and total repayment', 'Whether a friend has borrowed too', 'Only the advertisement'],
    answer: 1,
    explanation: 'Know the full repayment cost and make sure the payments fit your budget.',
    topic: 'Borrowing',
  },
  {
    question: 'What is interest on a loan?',
    options: ['The cost of borrowing money', 'A free gift', 'A type of savings goal', 'A payment reminder'],
    answer: 0,
    explanation: 'Interest is the cost charged for borrowing, usually expressed as a rate.',
    topic: 'Borrowing',
  },
  {
    question: 'Which action helps protect your online banking account?',
    options: ['Share your OTP with a caller', 'Use the same easy password everywhere', 'Keep your password and OTP private', 'Click every unexpected link'],
    answer: 2,
    explanation: 'Never share passwords or one-time PINs, even with someone claiming to be from a bank.',
    topic: 'Financial safety',
  },
  {
    question: 'What is diversification when investing?',
    options: ['Putting all money in one investment', 'Spreading investments across different assets', 'Borrowing to invest without a plan', 'Choosing an investment only because it is popular'],
    answer: 1,
    explanation: 'Diversification spreads exposure across investments. It can reduce concentration risk, but it cannot remove all risk.',
    topic: 'Investing',
  },
  {
    question: 'What should you do before buying something that is not essential?',
    options: ['Compare it with your budget and goals', 'Use your emergency fund every time', 'Ignore the price', 'Borrow without checking repayment'],
    answer: 0,
    explanation: 'Pause and check whether the purchase fits your budget and priorities.',
    topic: 'Smart spending',
  },
  {
    question: 'What is inflation?',
    options: ['A general rise in prices over time', 'A decrease in every person’s income', 'A type of bank account', 'A way to avoid taxes'],
    answer: 0,
    explanation: 'When prices generally rise, the same amount of money buys fewer goods and services.',
    topic: 'Money basics',
  },
  {
    question: 'Why is it useful to track your expenses?',
    options: ['It makes every item cheaper', 'It shows where your money goes', 'It guarantees higher income', 'It removes the need for saving'],
    answer: 1,
    explanation: 'Expense tracking helps you spot spending patterns and make informed adjustments.',
    topic: 'Expense tracking',
  },
]

export default function FinancialQAScreen() {
  const { resolvedTheme } = useAppTheme()
  const dark = resolvedTheme === 'dark'
  const C = getC(dark)
  const styles = makeStyles(C, dark)
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const [finished, setFinished] = useState(false)

  const current = questions[index]
  const progress = finished ? 1 : (index + (selected === null ? 0 : 1)) / questions.length

  const chooseAnswer = (optionIndex: number) => {
    if (selected !== null || finished) return
    setSelected(optionIndex)
    if (optionIndex === current.answer) setScore((value) => value + 1)
  }

  const nextQuestion = () => {
    if (index === questions.length - 1) {
      setFinished(true)
      return
    }
    setIndex((value) => value + 1)
    setSelected(null)
  }

  const restart = () => {
    setIndex(0)
    setSelected(null)
    setScore(0)
    setFinished(false)
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Financial Q&A</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>PLAY & LEARN</Text>
          <Text style={styles.heroTitle}>Test your money smarts</Text>
          <Text style={styles.heroText}>Answer each question, learn from the explanation, and see how much you know about personal finance.</Text>
        </View>

        {finished ? (
          <View style={styles.resultCard}>
            <Text style={styles.resultEmoji}>{score >= 9 ? '🏆' : score >= 6 ? '🌟' : '💪'}</Text>
            <Text style={styles.resultTitle}>Quiz completed!</Text>
            <Text style={styles.resultScore}>{score} / {questions.length}</Text>
            <Text style={styles.resultText}>
              {score >= 9 ? 'Excellent work! You have a strong understanding of these money basics.' : score >= 6 ? 'Good effort! Review the explanations and keep building your money skills.' : 'Keep practicing. Every question is a chance to learn something useful.'}
            </Text>
            <Pressable onPress={restart} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Play again</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.statsRow}>
              <Text style={styles.progressLabel}>QUESTION {index + 1} OF {questions.length}</Text>
              <Text style={styles.scoreLabel}>Score: {score}</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.max(4, progress * 100)}%` }]} />
            </View>

            <View style={styles.questionCard}>
              <Text style={styles.topicLabel}>{current.topic.toUpperCase()}</Text>
              <Text style={styles.questionText}>{current.question}</Text>
              {current.options.map((option, optionIndex) => {
                const isSelected = selected === optionIndex
                const isCorrect = selected !== null && optionIndex === current.answer
                const isWrong = isSelected && optionIndex !== current.answer
                return (
                  <Pressable
                    key={option}
                    onPress={() => chooseAnswer(optionIndex)}
                    disabled={selected !== null}
                    style={[
                      styles.option,
                      isCorrect && styles.correctOption,
                      isWrong && styles.wrongOption,
                    ]}
                  >
                    <View style={[styles.optionLetter, isCorrect && styles.correctLetter, isWrong && styles.wrongLetter]}>
                      <Text style={[styles.optionLetterText, (isCorrect || isWrong) && styles.selectedLetterText]}>
                        {String.fromCharCode(65 + optionIndex)}
                      </Text>
                    </View>
                    <Text style={[styles.optionText, (isCorrect || isWrong) && styles.selectedOptionText]}>{option}</Text>
                    {isCorrect ? <Text style={styles.optionMark}>✓</Text> : isWrong ? <Text style={styles.optionMark}>✕</Text> : null}
                  </Pressable>
                )
              })}
            </View>

            {selected !== null ? (
              <View style={[styles.feedback, selected === current.answer ? styles.feedbackCorrect : styles.feedbackWrong]}>
                <Text style={styles.feedbackTitle}>{selected === current.answer ? 'Correct answer!' : 'Not quite. Keep learning!'}</Text>
                <Text style={styles.feedbackText}>{current.explanation}</Text>
                <Pressable onPress={nextQuestion} style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>{index === questions.length - 1 ? 'See my result' : 'Next question'}</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.helperText}>Choose the best answer to reveal a short explanation.</Text>
            )}
          </>
        )}
        <Text style={styles.disclaimer}>For educational purposes only. This quiz is not financial advice.</Text>
      </ScrollView>
    </SafeAreaView>
  )
}

function getC(dark: boolean) {
  return dark ? {
    bg: '#101a18', card: '#1b2a26', ink: '#edf5f1', muted: '#a9b8b1',
    line: '#30413a', brand: '#55c6b0', soft: '#203a33',
  } : {
    bg: '#f6f7f5', card: '#ffffff', ink: '#14201c', muted: '#64716c',
    line: '#e4e8e5', brand: '#0f766e', soft: '#e8f5f1',
  }
}

function makeStyles(C: ReturnType<typeof getC>, dark: boolean) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    header: { minHeight: 62, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' ,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    backgroundColor: C.card},
    backButton: { width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
    backText: { color: C.brand, fontSize: 12, fontWeight: '800' },
    headerTitle: { position: 'absolute', left: 72, right: 72, textAlign: 'center', color: C.ink, fontSize: 20, fontWeight: '900' },
    headerSpacer: { width: 44, height: 44 },
    content: { padding: 17, paddingBottom: 36 },
    hero: { backgroundColor: C.soft, borderRadius: 18, padding: 19, marginBottom: 18 },
    eyebrow: { color: C.brand, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
    heroTitle: { color: C.ink, fontSize: 23, fontWeight: '900', marginTop: 7 },
    heroText: { color: C.muted, fontSize: 13, lineHeight: 20, marginTop: 7 },
    statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 9 },
    progressLabel: { color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
    scoreLabel: { color: C.brand, fontSize: 12, fontWeight: '900' },
    progressTrack: { height: 7, backgroundColor: C.line, borderRadius: 10, overflow: 'hidden', marginBottom: 15 },
    progressFill: { height: 7, backgroundColor: C.brand, borderRadius: 10 },
    questionCard: { backgroundColor: C.card, borderRadius: 17, borderWidth: 1, borderColor: C.line, padding: 16 },
    topicLabel: { color: C.brand, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
    questionText: { color: C.ink, fontSize: 18, lineHeight: 26, fontWeight: '800', marginTop: 8, marginBottom: 15 },
    option: { minHeight: 56, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 10, marginTop: 9, flexDirection: 'row', alignItems: 'center', gap: 10 },
    optionLetter: { width: 30, height: 30, borderRadius: 9, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' },
    optionLetterText: { color: C.brand, fontWeight: '900', fontSize: 12 },
    optionText: { color: C.ink, fontSize: 13, lineHeight: 19, fontWeight: '600', flex: 1 },
    correctOption: { borderColor: '#1b9a65', backgroundColor: dark ? '#17392d' : '#e9f8f0' },
    wrongOption: { borderColor: '#d65a54', backgroundColor: dark ? '#422523' : '#fff0ef' },
    correctLetter: { backgroundColor: '#1b9a65' },
    wrongLetter: { backgroundColor: '#c94d48' },
    selectedLetterText: { color: '#ffffff' },
    selectedOptionText: { fontWeight: '800' },
    optionMark: { color: C.ink, fontSize: 17, fontWeight: '900' },
    feedback: { borderRadius: 14, padding: 15, marginTop: 13 },
    feedbackCorrect: { backgroundColor: dark ? '#17392d' : '#e9f8f0' },
    feedbackWrong: { backgroundColor: dark ? '#422523' : '#fff0ef' },
    feedbackTitle: { color: C.ink, fontSize: 14, fontWeight: '900' },
    feedbackText: { color: C.ink, fontSize: 13, lineHeight: 20, marginTop: 5 },
    primaryButton: { backgroundColor: C.brand, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 13 },
    primaryButtonText: { color: dark ? '#10201b' : '#ffffff', fontWeight: '900', fontSize: 14 },
    helperText: { color: C.muted, fontSize: 12, textAlign: 'center', marginTop: 15 },
    resultCard: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 22, alignItems: 'center' },
    resultEmoji: { fontSize: 48 },
    resultTitle: { color: C.ink, fontSize: 22, fontWeight: '900', marginTop: 10 },
    resultScore: { color: C.brand, fontSize: 38, fontWeight: '900', marginTop: 8 },
    resultText: { color: C.muted, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 },
    disclaimer: { color: C.muted, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 22 },
  })
}
