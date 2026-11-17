import { describe, expect, it, jest } from '@jest/globals'
import { emptyBoard, hasMoves, mergeLine, moveBoard, newGame, sameBoard, spawnTile } from '@/utils/financial2048'

describe('financial literacy 2048 rules', () => {
  it('merges one pair once and reports points gained', () => {
    expect(mergeLine([2, 2, 2, 0])).toEqual({ values: [4, 2, 0, 0], gained: 4 })
    expect(mergeLine([4, 4, 4, 4])).toEqual({ values: [8, 8, 0, 0], gained: 16 })
  })

  it('moves and merges a row toward each direction without mutating the original', () => {
    const board = emptyBoard()
    board[0] = [2, 0, 2, 0]
    expect(moveBoard(board, 'left')).toEqual({ board: [[4, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], gained: 4 })
    expect(moveBoard(board, 'right').board[0]).toEqual([0, 0, 0, 4])
    expect(board[0]).toEqual([2, 0, 2, 0])
  })

  it('moves columns up and down', () => {
    const board = emptyBoard()
    board[0][0] = 2
    board[2][0] = 2
    expect(moveBoard(board, 'up').board.map((row) => row[0])).toEqual([4, 0, 0, 0])
    expect(moveBoard(board, 'down').board.map((row) => row[0])).toEqual([0, 0, 0, 4])
  })

  it('detects no-op boards and terminal boards', () => {
    const blocked: number[][] = [
      [2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2],
    ]
    expect(sameBoard(blocked, moveBoard(blocked, 'left').board)).toBe(true)
    expect(hasMoves(blocked)).toBe(false)
    expect(hasMoves(emptyBoard())).toBe(true)
  })

  it('spawns only 2 or 4 in an empty cell, and does not alter a full board', () => {
    const chooseFirstCell = jest.fn<() => number>().mockReturnValueOnce(0).mockReturnValueOnce(0.95)
    const board = spawnTile(emptyBoard(), chooseFirstCell)
    expect(board[0][0]).toBe(4)
    expect(board.flat().filter((value) => value !== 0)).toHaveLength(1)
    const full = Array.from({ length: 4 }, () => [2, 2, 2, 2])
    expect(spawnTile(full, () => 0)).toBe(full)
  })

  it('starts with two deterministically generated tiles', () => {
    let calls = 0
    const board = newGame(() => { calls += 1; return calls % 2 === 1 ? 0 : 0.5 })
    expect(board.flat().filter((value) => value !== 0)).toHaveLength(2)
    expect(board.flat().filter((value) => value === 2 || value === 4)).toHaveLength(2)
  })
})
