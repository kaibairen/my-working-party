import { describe, expect, it } from "vitest";
import {
  addRandomTile,
  canMove,
  emptyBoard,
  hasWon,
  moveBoard,
  slideAndMerge,
  startBoard,
} from "./board.js";

describe("2048 board merge smoke", () => {
  it("merges a pair left and scores the new tile", () => {
    const { line, score, moved } = slideAndMerge([2, 2, 0, 0]);
    expect(line).toEqual([4, 0, 0, 0]);
    expect(score).toBe(4);
    expect(moved).toBe(true);
  });

  it("does not chain-merge in one slide", () => {
    expect(slideAndMerge([2, 2, 4, 0]).line).toEqual([4, 4, 0, 0]);
    expect(slideAndMerge([4, 2, 2, 0]).line).toEqual([4, 4, 0, 0]);
    expect(slideAndMerge([2, 2, 2, 2]).line).toEqual([4, 4, 0, 0]);
  });

  it("moves the whole board in four directions", () => {
    const board = [
      [2, 0, 0, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    expect(moveBoard(board, "left").board[0]).toEqual([4, 0, 0, 0]);
    expect(moveBoard(board, "right").board[0]).toEqual([0, 0, 0, 4]);
    expect(moveBoard(board, "down").board[3]).toEqual([2, 0, 0, 2]);
    expect(moveBoard(board, "up").board[0]).toEqual([2, 0, 0, 2]);
  });

  it("reports win, stuck, and spawn", () => {
    expect(hasWon([[2048, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])).toBe(true);
    const fullNoMove = [
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ];
    expect(canMove(fullNoMove)).toBe(false);
    const spawned = addRandomTile(emptyBoard(), () => 0);
    expect(spawned.added).toBe(true);
    expect(spawned.board[0][0]).toBe(2);
    expect(startBoard(() => 0).flat().filter(Boolean)).toHaveLength(2);
  });
});
