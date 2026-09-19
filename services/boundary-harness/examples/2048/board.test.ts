import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

const here = dirname(fileURLToPath(import.meta.url));
const gameHtml = readFileSync(join(here, "index.html"), "utf8");

describe("2048 QA freeze", () => {
  it("game_2048_loads_playable", () => {
    expect(gameHtml).toContain("新游戏");
    expect(gameHtml).toContain('data-testid="board"');
    expect(gameHtml).toContain("./board.js");
    const board = startBoard(() => 0);
    expect(board.flat().filter(Boolean)).toHaveLength(2);
    expect(canMove(board)).toBe(true);
  });

  it("game_2048_moves", () => {
    const board = [
      [2, 0, 0, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    expect(moveBoard(board, "left").moved).toBe(true);
    expect(moveBoard(board, "left").board[0]).toEqual([4, 0, 0, 0]);
    expect(moveBoard(board, "right").board[0]).toEqual([0, 0, 0, 4]);
    expect(moveBoard(board, "down").board[3]).toEqual([2, 0, 0, 2]);
    expect(moveBoard(board, "up").board[0]).toEqual([2, 0, 0, 2]);
    expect(gameHtml).toMatch(/ArrowLeft|touchend/);
  });

  it("game_2048_score_updates", () => {
    expect(slideAndMerge([2, 2, 0, 0]).score).toBe(4);
    const moved = moveBoard(
      [
        [2, 2, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
      "left",
    );
    expect(moved.score).toBe(4);
    expect(moved.board[0][0]).toBe(4);
  });

  it("game_2048_new_game_resets", () => {
    const played = moveBoard(
      [
        [2, 2, 2, 2],
        [4, 4, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
      "left",
    ).board;
    const fresh = startBoard(() => 0);
    expect(fresh.flat().filter(Boolean)).toHaveLength(2);
    expect(fresh).not.toEqual(played);
    expect(fresh.flat().reduce((a, n) => a + n, 0)).toBe(4);
    expect(gameHtml).toContain('id="new-game"');
  });
});

describe("2048 board merge smoke (non-gate)", () => {
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
