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

type Board = number[][]
type Direction = 'left' | 'right' | 'up' | 'down'

const SIZE = 4
const emptyBoard = (): Board => Array.from({ length: SIZE }, () => Array(SIZE).fill(0))

function spawnTile(board: Board): Board {
  const empty: Array<[number, number]> = []
  board.forEach((row, r) => row.forEach((value, c) => { if (value === 0) empty.push([r, c]) }))
  if (!empty.length) return board
  const [r, c] = empty[Math.floor(Math.random() * empty.length)]
  const next = board.map((row) => [...row])
  next[r][c] = Math.random() < 0.9 ? 2 : 4
  return next
}

function newGame(): Board {
  return spawnTile(spawnTile(emptyBoard()))
}

function mergeLine(line: number[]): { values: number[]; gained: number } {
  const compact = line.filter((value) => value !== 0)
  const merged: number[] = []
  let gained = 0
  for (let i = 0; i < compact.length; i += 1) {
    if (compact[i] === compact[i + 1]) {
      const value = compact[i] * 2
      merged.push(value)
      gained += value
      i += 1
    } else {
      merged.push(compact[i])
    }
  }
  while (merged.length < SIZE) merged.push(0)
  return { values: merged, gained }
}

function moveBoard(board: Board, direction: Direction): { board: Board; gained: number } {
  const next = emptyBoard()
  let gained = 0

  for (let i = 0; i < SIZE; i += 1) {
    const line = Array.from({ length: SIZE }, (_, j) => {
      if (direction === 'left' || direction === 'right') return board[i][direction === 'left' ? j : SIZE - 1 - j]
      return board[direction === 'up' ? j : SIZE - 1 - j][i]
    })
    const result = mergeLine(line)
    gained += result.gained

    for (let j = 0; j < SIZE; j += 1) {
      const r = direction === 'left' || direction === 'right' ? i : (direction === 'up' ? j : SIZE - 1 - j)
      const c = direction === 'up' || direction === 'down' ? i : (direction === 'left' ? j : SIZE - 1 - j)
      next[r][c] = result.values[j]
    }
  }

  return { board: next, gained }
}

function sameBoard(a: Board, b: Board): boolean {
  return a.every((row, r) => row.every((value, c) => value === b[r][c]))
}

function hasMoves(board: Board): boolean {
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (board[r][c] === 0) return true
      if (r < SIZE - 1 && board[r][c] === board[r + 1][c]) return true
      if (c < SIZE - 1 && board[r][c] === board[r][c + 1]) return true
    }
  }
  return false
}

function tileColors(value: number, dark: boolean) {
  const palette: Record<number, { bg: string; color: string }> = {
    0: { bg: dark ? '#263832' : '#e6ece8', color: 'transparent' },
    2: { bg: dark ? '#40554d' : '#edf2ed', color: dark ? '#edf5f1' : '#34433b' },
    4: { bg: dark ? '#526b5f' : '#dce9df', color: dark ? '#ffffff' : '#34433b' },
    8: { bg: '#8eaa80', color: '#ffffff' },
    16: { bg: '#72a98b', color: '#ffffff' },
    32: { bg: '#4f9b83', color: '#ffffff' },
    64: { bg: '#277f6b', color: '#ffffff' },
    128: { bg: '#d6ae55', color: '#ffffff' },
    256: { bg: '#c9963d', color: '#ffffff' },
    512: { bg: '#bf7b39', color: '#ffffff' },
    1024: { bg: '#aa6538', color: '#ffffff' },
    2048: { bg: '#0f766e', color: '#ffffff' },
  }
  return palette[value] || { bg: dark ? '#6a4e91' : '#8060a8', color: '#ffffff' }
}

export default function Financial2048Screen() {
  const { resolvedTheme } = useAppTheme()
  const dark = resolvedTheme === 'dark'
  const C = getC(dark)
  const styles = makeStyles(C)
  const [board, setBoard] = useState<Board>(() => newGame())
  const [score, setScore] = useState(0)
  const [best, setBest] = useState(0)
  const [won, setWon] = useState(false)
  const [keepPlaying, setKeepPlaying] = useState(false)

  const reset = () => {
    setBoard(newGame())
    setScore(0)
    setWon(false)
    setKeepPlaying(false)
  }

  const move = (direction: Direction) => {
    if (!hasMoves(board) || (won && !keepPlaying)) return
    const result = moveBoard(board, direction)
    if (sameBoard(board, result.board)) return
    const next = spawnTile(result.board)
    setBoard(next)
    const updatedScore = score + result.gained
    setScore(updatedScore)
    setBest((current) => Math.max(current, updatedScore))
    if (!won && next.some((row) => row.some((value) => value >= 2048))) setWon(true)
  }

  const gameOver = !hasMoves(board)

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>2048 Money Mind</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>PLAY & LEARN</Text>
          <Text style={styles.heroTitle}>Merge tiles. Reach 2048.</Text>
          <Text style={styles.heroText}>Slide matching numbers together to make bigger values. Plan your moves, keep the board clear, and aim for 2048!</Text>
        </View>

        <View style={styles.scoreRow}>
          <View style={styles.scoreCard}>
            <Text style={styles.scoreLabel}>SCORE</Text>
            <Text style={styles.scoreValue}>{score}</Text>
          </View>
          <View style={styles.scoreCard}>
            <Text style={styles.scoreLabel}>BEST THIS SESSION</Text>
            <Text style={styles.scoreValue}>{best}</Text>
          </View>
          <Pressable onPress={reset} style={styles.newGameButton}>
            <Text style={styles.newGameText}>New game</Text>
          </Pressable>
        </View>

        <View style={styles.board}>
          {board.map((row, r) => (
            <View key={r} style={styles.boardRow}>
              {row.map((value, c) => {
                const tile = tileColors(value, dark)
                return (
                  <View key={c} style={[styles.tile, { backgroundColor: tile.bg }]}>
                    <Text style={[styles.tileText, { color: tile.color, fontSize: value >= 1024 ? 17 : value >= 128 ? 20 : 25 }]}>
                      {value === 0 ? '' : value}
                    </Text>
                  </View>
                )
              })}
            </View>
          ))}
          {won && !keepPlaying ? (
            <View style={styles.overlay}>
              <Text style={styles.overlayTitle}>🎉 You reached 2048!</Text>
              <Text style={styles.overlayText}>Great strategy. Keep playing or start a new round.</Text>
              <Pressable onPress={() => setKeepPlaying(true)} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Keep playing</Text>
              </Pressable>
              <Pressable onPress={reset} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>New game</Text>
              </Pressable>
            </View>
          ) : gameOver ? (
            <View style={styles.overlay}>
              <Text style={styles.overlayTitle}>No more moves</Text>
              <Text style={styles.overlayText}>Your board is full. Try another round and plan your moves carefully.</Text>
              <Pressable onPress={reset} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Play again</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <Text style={styles.controlTitle}>Choose a direction</Text>
        <View style={styles.controls}>
          <View style={styles.controlSpacer} />
          <Pressable onPress={() => move('up')} style={styles.directionButton}><Text style={styles.directionText}>↑</Text></Pressable>
          <View style={styles.controlSpacer} />
          <Pressable onPress={() => move('left')} style={styles.directionButton}><Text style={styles.directionText}>←</Text></Pressable>
          <Pressable onPress={() => move('down')} style={styles.directionButton}><Text style={styles.directionText}>↓</Text></Pressable>
          <Pressable onPress={() => move('right')} style={styles.directionButton}><Text style={styles.directionText}>→</Text></Pressable>
        </View>

        <View style={styles.tipCard}>
          <Text style={styles.tipTitle}>Money mindset tip</Text>
          <Text style={styles.tipText}>Good financial habits grow through small, consistent decisions. Set a goal, make a plan, and review your progress regularly.</Text>
        </View>
        <Text style={styles.disclaimer}>This number puzzle is a learning activity and does not represent real money or investment returns.</Text>
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

function makeStyles(C: ReturnType<typeof getC>) {
  return StyleSheet.create({
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
    backButton: { width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
    backText: { color: C.brand, fontSize: 12, fontWeight: '800' },
    headerTitle: { position: 'absolute', left: 72, right: 72, textAlign: 'center', color: C.ink, fontSize: 18, fontWeight: '900' },
    headerSpacer: { width: 44, height: 44 },
    content: { padding: 17, paddingBottom: 38 },
    hero: { backgroundColor: C.soft, borderRadius: 18, padding: 19, marginBottom: 16 },
    eyebrow: { color: C.brand, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
    heroTitle: { color: C.ink, fontSize: 23, fontWeight: '900', marginTop: 7 },
    heroText: { color: C.muted, fontSize: 13, lineHeight: 20, marginTop: 7 },
    scoreRow: { flexDirection: 'row', gap: 8, marginBottom: 13, alignItems: 'stretch' },
    scoreCard: { flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 10, alignItems: 'center', justifyContent: 'center' },
    scoreLabel: { color: C.muted, fontSize: 9, fontWeight: '900', letterSpacing: 0.4 },
    scoreValue: { color: C.ink, fontSize: 20, fontWeight: '900', marginTop: 3 },
    newGameButton: { backgroundColor: C.brand, borderRadius: 12, paddingHorizontal: 12, justifyContent: 'center' },
    newGameText: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
    board: { backgroundColor: darkBoard(C), padding: 8, borderRadius: 14, gap: 8, position: 'relative', aspectRatio: 1 },
    boardRow: { flex: 1, flexDirection: 'row', gap: 8 },
    tile: { flex: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    tileText: { fontWeight: '900' },
    overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10, 20, 16, 0.88)', borderRadius: 14, alignItems: 'center', justifyContent: 'center', padding: 24 },
    overlayTitle: { color: '#ffffff', fontSize: 22, fontWeight: '900', textAlign: 'center' },
    overlayText: { color: '#e1ebe5', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8 },
    primaryButton: { backgroundColor: C.brand, borderRadius: 11, paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center', marginTop: 15, width: '100%' },
    primaryButtonText: { color: '#ffffff', fontWeight: '900', fontSize: 13 },
    secondaryButton: { borderWidth: 1, borderColor: '#dce8e1', borderRadius: 11, paddingVertical: 11, paddingHorizontal: 18, alignItems: 'center', marginTop: 9, width: '100%' },
    secondaryButtonText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },
    controlTitle: { color: C.ink, fontSize: 14, fontWeight: '900', textAlign: 'center', marginTop: 20, marginBottom: 9 },
    controls: { flexDirection: 'row', justifyContent: 'center', gap: 9, flexWrap: 'wrap' },
    controlSpacer: { width: 8 },
    directionButton: { width: 58, height: 48, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
    directionText: { color: C.brand, fontSize: 25, fontWeight: '900' },
    tipCard: { backgroundColor: C.soft, borderRadius: 13, padding: 15, marginTop: 20 },
    tipTitle: { color: C.ink, fontSize: 13, fontWeight: '900' },
    tipText: { color: C.muted, fontSize: 12, lineHeight: 19, marginTop: 5 },
    disclaimer: { color: C.muted, fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: 16 },
  })
}

function darkBoard(C: ReturnType<typeof getC>) {
  return C.line
}
