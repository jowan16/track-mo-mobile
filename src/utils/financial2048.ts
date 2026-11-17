export type Board = number[][]
export type Direction = 'left' | 'right' | 'up' | 'down'

export const SIZE = 4

export const emptyBoard = (): Board =>
  Array.from({ length: SIZE }, () => Array(SIZE).fill(0))

export function spawnTile(board: Board, random = Math.random): Board {
  const empty: Array<[number, number]> = []
  board.forEach((row, r) => row.forEach((value, c) => { if (value === 0) empty.push([r, c]) }))
  if (!empty.length) return board
  const [r, c] = empty[Math.floor(random() * empty.length)]
  const next = board.map((row) => [...row])
  next[r][c] = random() < 0.9 ? 2 : 4
  return next
}

export function newGame(random = Math.random): Board {
  return spawnTile(spawnTile(emptyBoard(), random), random)
}

export function mergeLine(line: number[]): { values: number[]; gained: number } {
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

export function moveBoard(board: Board, direction: Direction): { board: Board; gained: number } {
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

export function sameBoard(a: Board, b: Board): boolean {
  return a.every((row, r) => row.every((value, c) => value === b[r][c]))
}

export function hasMoves(board: Board): boolean {
  for (let r = 0; r < SIZE; r += 1) {
    for (let c = 0; c < SIZE; c += 1) {
      if (board[r][c] === 0) return true
      if (r < SIZE - 1 && board[r][c] === board[r + 1][c]) return true
      if (c < SIZE - 1 && board[r][c] === board[r][c + 1]) return true
    }
  }
  return false
}
