/**
 * 은우 루미큐브 - 규칙 기반 AI 플레이어
 * 보드 재조합 없이 손패에서 유효한 세트를 찾아 내려놓는 단순 전략.
 * 레벨별로 사고 시간, 패스 확률, 내려놓는 세트 수를 다르게 함.
 */

import { Tile, TileColor, COLORS, INITIAL_MELD_SCORE } from '@/types/game';
import { calcSetScore } from './game-logic';

export type AiLevel = 'baby' | 'student' | 'genius' | 'robot';

export interface AiLevelConfig {
  label: string;
  emoji: string;
  description: string;
  thinkMs: number;       // 턴 시작 전 "생각 중" 지연
  passChance: number;    // 유효 수가 있어도 패스할 확률 (실수 시뮬레이션)
  playAll: boolean;      // 찾은 세트를 모두 내려놓을지 (false = 1개만)
  useJoker: boolean;     // 조커를 첫 등록 외에도 적극 사용할지
}

export const AI_LEVELS: Record<AiLevel, AiLevelConfig> = {
  baby:    { label: '아기 AI',  emoji: '👶', description: '느리고 가끔 실수해요',  thinkMs: 4500, passChance: 0.35, playAll: false, useJoker: false },
  student: { label: '학생 AI',  emoji: '🧑‍🎓', description: '적당한 실력이에요',    thinkMs: 2500, passChance: 0.1,  playAll: false, useJoker: false },
  genius:  { label: '천재 AI',  emoji: '🧠', description: '빠르고 영리해요',      thinkMs: 1500, passChance: 0,    playAll: true,  useJoker: true  },
  robot:   { label: '로봇 AI',  emoji: '🤖', description: '거의 지지 않아요',    thinkMs: 700,  passChance: 0,    playAll: true,  useJoker: true  },
};

/* ═══════════════════════════════════════════
   손패 분석 — 그룹 찾기 (같은 숫자, 다른 색 3~4장)
   ═══════════════════════════════════════════ */
function findGroupsInHand(hand: Tile[]): Tile[][] {
  const byNumber = new Map<number, Tile[]>();
  for (const t of hand) {
    if (t.isJoker) continue;
    const arr = byNumber.get(t.number);
    if (arr) arr.push(t);
    else byNumber.set(t.number, [t]);
  }

  const groups: Tile[][] = [];
  for (const tiles of byNumber.values()) {
    // 같은 숫자 안에서 색을 중복 없이 수집
    const byColor = new Map<string, Tile>();
    for (const t of tiles) {
      if (!byColor.has(t.color as string)) byColor.set(t.color as string, t);
    }
    const unique = Array.from(byColor.values());
    if (unique.length >= 3) groups.push(unique);
  }
  return groups;
}

/* ═══════════════════════════════════════════
   손패 분석 — 런 찾기 (같은 색, 연속 숫자 3장 이상)
   연속 숫자 시퀀스를 찾되, 시퀀스가 너무 길면 3~5 길이의 부분 런으로 쪼개 제공
   ═══════════════════════════════════════════ */
function findRunsInHand(hand: Tile[]): Tile[][] {
  const runs: Tile[][] = [];

  for (const color of COLORS) {
    const tiles = hand.filter(t => !t.isJoker && t.color === color);
    // 같은 숫자 중복 제거 (하나의 런에는 같은 숫자가 못 들어감)
    const byNum = new Map<number, Tile>();
    for (const t of tiles) if (!byNum.has(t.number)) byNum.set(t.number, t);
    const sorted = Array.from(byNum.values()).sort((a, b) => a.number - b.number);

    // 연속 숫자 청크로 분할
    let chunk: Tile[] = [];
    const chunks: Tile[][] = [];
    for (const t of sorted) {
      if (chunk.length === 0 || t.number === chunk[chunk.length - 1].number + 1) {
        chunk.push(t);
      } else {
        if (chunk.length >= 3) chunks.push(chunk);
        chunk = [t];
      }
    }
    if (chunk.length >= 3) chunks.push(chunk);

    // 각 청크에서 가능한 런을 수집 — 가장 긴 것 + 분할된 것 모두 후보에 넣음
    for (const c of chunks) {
      runs.push(c);
      if (c.length >= 6) {
        for (let len = 3; len <= 5; len++) {
          for (let start = 0; start + len <= c.length; start++) {
            runs.push(c.slice(start, start + len));
          }
        }
      }
    }
  }
  return runs;
}

/* ═══════════════════════════════════════════
   탐욕 전략으로 여러 세트 찾기
   - 가장 점수 높은 세트부터 골라내고, 사용된 타일은 제외
   - 겹치지 않는 세트 목록을 점수순으로 반환
   ═══════════════════════════════════════════ */
export function findAllPlayableSets(hand: Tile[]): Tile[][] {
  let remaining = [...hand];
  const result: Tile[][] = [];

  while (true) {
    const groups = findGroupsInHand(remaining);
    const runs = findRunsInHand(remaining);
    const candidates = [...groups, ...runs];
    if (candidates.length === 0) break;

    // 가장 점수 높은 세트 우선
    candidates.sort((a, b) => calcSetScore(b) - calcSetScore(a));
    const best = candidates[0];
    if (!best || best.length === 0) break;

    result.push(best);
    const bestIds = new Set(best.map(t => t.id));
    remaining = remaining.filter(t => !bestIds.has(t.id));
  }

  return result;
}

/* ═══════════════════════════════════════════
   AI 수 계산
   입력: 손패, 보드, 첫 등록 여부, 레벨
   출력: 변경된 보드/손패, 실제로 수를 뒀는지
   ═══════════════════════════════════════════ */
export interface AiMoveResult {
  newBoard: Tile[][];
  newHand: Tile[];
  played: boolean;          // 수를 뒀는지 (false면 뽑기 필요)
  tilesPlayedIds: number[]; // 이번 턴에 내려놓은 타일 ID
}

export function computeAiMove(
  hand: Tile[],
  board: Tile[][],
  hasMelded: boolean,
  level: AiLevel
): AiMoveResult {
  const config = AI_LEVELS[level];

  // 실수 시뮬레이션: 확률적으로 패스
  if (Math.random() < config.passChance) {
    return { newBoard: board, newHand: hand, played: false, tilesPlayedIds: [] };
  }

  const allSets = findAllPlayableSets(hand);
  if (allSets.length === 0) {
    return { newBoard: board, newHand: hand, played: false, tilesPlayedIds: [] };
  }

  let setsToPlay: Tile[][] = [];

  if (!hasMelded) {
    // 첫 등록: 누적 점수 30점 이상 되도록 세트를 누적 선택
    let cumulative = 0;
    for (const s of allSets) {
      setsToPlay.push(s);
      cumulative += calcSetScore(s);
      if (cumulative >= INITIAL_MELD_SCORE) break;
    }
    if (cumulative < INITIAL_MELD_SCORE) {
      // 첫 등록 불가 → 패스
      return { newBoard: board, newHand: hand, played: false, tilesPlayedIds: [] };
    }
  } else {
    setsToPlay = config.playAll ? allSets : [allSets[0]];
  }

  const playedIds = new Set<number>();
  for (const s of setsToPlay) for (const t of s) playedIds.add(t.id);

  const newHand = hand.filter(t => !playedIds.has(t.id));
  const newBoard = [...board, ...setsToPlay];

  return {
    newBoard,
    newHand,
    played: true,
    tilesPlayedIds: Array.from(playedIds),
  };
}
