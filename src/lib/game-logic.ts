/**
 * 은우 루미큐브 - 순수 게임 로직
 * UI와 완전히 분리된 순수 함수들.
 * 서버/클라이언트 양쪽에서 사용 가능.
 */

import {
  Tile, TileColor, MeldSet,
  COLORS, INITIAL_MELD_SCORE, JOKER_PENALTY,
} from '@/types/game';

/* ═══════════════════════════════════════════
   검증 (Validation)
   ═══════════════════════════════════════════ */

/**
 * 그룹 검증: 다른 색, 같은 숫자, 3~4장
 */
export function isValidGroup(tiles: Tile[]): boolean {
  if (tiles.length < 3 || tiles.length > 4) return false;
  const nonJokers = tiles.filter(t => !t.isJoker);
  if (nonJokers.length === 0) return false;

  const num = nonJokers[0].number;
  if (!nonJokers.every(t => t.number === num)) return false;

  const colors = new Set(nonJokers.map(t => t.color));
  return colors.size === nonJokers.length;
}

/**
 * 런 검증: 같은 색, 연속 숫자, 3장 이상
 */
export function isValidRun(tiles: Tile[]): boolean {
  if (tiles.length < 3) return false;
  const nonJokers = tiles.filter(t => !t.isJoker);
  if (nonJokers.length === 0) return false;

  const color = nonJokers[0].color;
  if (!nonJokers.every(t => t.color === color)) return false;

  const jokerCount = tiles.length - nonJokers.length;
  const nums = nonJokers.map(t => t.number).sort((a, b) => a - b);

  // 중복 숫자 검사
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] === nums[i - 1]) return false;
  }

  // 가능한 시작점을 탐색하여 유효한 연속 배치 확인
  const minStart = Math.max(1, nums[0] - jokerCount);
  const maxStart = Math.min(13 - tiles.length + 1, nums[0]);

  for (let start = minStart; start <= maxStart; start++) {
    const needed: number[] = [];
    for (let i = 0; i < tiles.length; i++) needed.push(start + i);
    if (needed[needed.length - 1] > 13) continue;

    let jokersLeft = jokerCount;
    const numsCopy = [...nums];
    let valid = true;

    for (const n of needed) {
      const idx = numsCopy.indexOf(n);
      if (idx >= 0) numsCopy.splice(idx, 1);
      else if (jokersLeft > 0) jokersLeft--;
      else { valid = false; break; }
    }

    if (valid && numsCopy.length === 0) return true;
  }
  return false;
}

/**
 * 세트 유효성 검사 (런 또는 그룹)
 */
export function isValidSet(tiles: Tile[]): boolean {
  if (!tiles || tiles.length === 0) return false;
  return isValidGroup(tiles) || isValidRun(tiles);
}

/**
 * 보드 전체 유효성 검사
 */
export function isBoardValid(board: Tile[][]): boolean {
  return board.every(set => isValidSet(set));
}

/* ═══════════════════════════════════════════
   점수 계산 (Scoring)
   ═══════════════════════════════════════════ */

/**
 * 세트의 점수 계산 (첫 등록 판정용)
 * 조커는 해당 위치의 숫자값으로 계산
 */
export function calcSetScore(tiles: Tile[]): number {
  if (isValidRun(tiles)) {
    const nonJokers = tiles.filter(t => !t.isJoker);
    const nums = nonJokers.map(t => t.number).sort((a, b) => a - b);
    const jokerCount = tiles.length - nonJokers.length;
    const minStart = Math.max(1, nums[0] - jokerCount);
    const maxStart = Math.min(13 - tiles.length + 1, nums[0]);

    for (let start = minStart; start <= maxStart; start++) {
      const needed: number[] = [];
      for (let i = 0; i < tiles.length; i++) needed.push(start + i);
      if (needed[needed.length - 1] > 13) continue;

      let jokersLeft = jokerCount;
      const numsCopy = [...nums];
      let valid = true;

      for (const n of needed) {
        const idx = numsCopy.indexOf(n);
        if (idx >= 0) numsCopy.splice(idx, 1);
        else if (jokersLeft > 0) jokersLeft--;
        else { valid = false; break; }
      }

      if (valid && numsCopy.length === 0) {
        return needed.reduce((a, b) => a + b, 0);
      }
    }
  }

  if (isValidGroup(tiles)) {
    const nonJokers = tiles.filter(t => !t.isJoker);
    return nonJokers[0].number * tiles.length;
  }

  return 0;
}

/**
 * 벌점 계산 (패배자의 남은 손패)
 */
export function calcPenalty(hand: Tile[]): number {
  return hand.reduce((sum, t) => sum + (t.isJoker ? JOKER_PENALTY : t.number), 0);
}

/* ═══════════════════════════════════════════
   첫 등록 검증 (Initial Meld)
   ═══════════════════════════════════════════ */

/**
 * 첫 등록 조건 검증
 * - 손패에서 나온 타일만으로 구성된 세트의 합이 30점 이상
 * - 기존 보드 타일은 재조합 불가
 */
export function validateInitialMeld(
  board: Tile[][],
  snapshotBoard: Tile[][],
  tilesPlayedFromHand: number[]
): { valid: boolean; score: number; error?: string } {
  // 기존 보드 타일 위치 변경 검사
  const snapPositions: Record<string, string> = {};
  for (let si = 0; si < snapshotBoard.length; si++) {
    for (let ti = 0; ti < snapshotBoard[si].length; ti++) {
      snapPositions[snapshotBoard[si][ti].id] = `${si}-${ti}`;
    }
  }

  const curPositions: Record<string, string> = {};
  for (let si = 0; si < board.length; si++) {
    for (let ti = 0; ti < board[si].length; ti++) {
      curPositions[board[si][ti].id] = `${si}-${ti}`;
    }
  }

  for (const id of Object.keys(snapPositions)) {
    if (curPositions[id] !== snapPositions[id]) {
      return {
        valid: false,
        score: 0,
        error: '첫 등록 시에는 기존 세트를 재조합할 수 없습니다!',
      };
    }
  }

  // 손패에서 나온 타일로만 구성된 세트의 점수 합산
  const newTileIds = new Set(tilesPlayedFromHand);
  let initialScore = 0;

  for (const set of board) {
    if (set.every(t => newTileIds.has(t.id))) {
      initialScore += calcSetScore(set);
    }
  }

  if (initialScore < INITIAL_MELD_SCORE) {
    return {
      valid: false,
      score: initialScore,
      error: `첫 등록은 ${INITIAL_MELD_SCORE}점 이상이어야 합니다! (현재: ${initialScore}점)`,
    };
  }

  return { valid: true, score: initialScore };
}

/* ═══════════════════════════════════════════
   보드 비교 (Board Diff)
   ═══════════════════════════════════════════ */

/**
 * 보드 변경 여부 확인 (스냅샷 대비)
 */
export function isBoardDifferent(current: Tile[][], snapshot: Tile[][]): boolean {
  if (current.length !== snapshot.length) return true;
  for (let i = 0; i < current.length; i++) {
    if (current[i].length !== snapshot[i].length) return true;
    for (let j = 0; j < current[i].length; j++) {
      if (current[i][j].id !== snapshot[i][j].id) return true;
    }
  }
  return false;
}

/* ═══════════════════════════════════════════
   유틸리티
   ═══════════════════════════════════════════ */

/**
 * 깊은 복사
 */
export function deepCopyBoard(board: Tile[][]): Tile[][] {
  return board.map(set => set.map(t => ({ ...t })));
}

export function deepCopyHand(hand: Tile[]): Tile[] {
  return hand.map(t => ({ ...t }));
}
