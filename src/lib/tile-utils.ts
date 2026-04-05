/**
 * 은우 루미큐브 - 타일 유틸리티
 * 타일 생성, 셔플, 배분 등.
 */

import { Tile, TileColor, COLORS, TILES_PER_PLAYER } from '@/types/game';

let tileIdCounter = 0;

/**
 * ID 카운터 초기화 (새 게임 시작 시)
 */
export function resetTileIdCounter(): void {
  tileIdCounter = 0;
}

/**
 * 일반 타일 생성
 */
export function createTile(number: number, color: TileColor): Tile {
  return {
    id: ++tileIdCounter,
    number,
    color,
    isJoker: false,
  };
}

/**
 * 조커 타일 생성
 */
export function createJoker(): Tile {
  return {
    id: ++tileIdCounter,
    number: 0,
    color: 'joker',
    isJoker: true,
  };
}

/**
 * 전체 타일 풀 생성 (106장, 셔플됨)
 */
export function createShuffledPool(): Tile[] {
  resetTileIdCounter();
  const tiles: Tile[] = [];

  // 4색 × 13숫자 × 2세트 = 104장
  for (let set = 0; set < 2; set++) {
    for (const color of COLORS) {
      for (let n = 1; n <= 13; n++) {
        tiles.push(createTile(n, color));
      }
    }
  }

  // 조커 2장
  tiles.push(createJoker());
  tiles.push(createJoker());

  // Fisher-Yates 셔플
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }

  return tiles;
}

/**
 * 플레이어들에게 타일 배분
 * @returns { hands: 각 플레이어의 손패, pool: 나머지 풀 }
 */
export function distributeInitialTiles(
  numPlayers: number
): { hands: Tile[][]; pool: Tile[] } {
  const allTiles = createShuffledPool();
  const hands: Tile[][] = [];
  let idx = 0;

  for (let i = 0; i < numPlayers; i++) {
    hands.push(allTiles.slice(idx, idx + TILES_PER_PLAYER));
    idx += TILES_PER_PLAYER;
  }

  return {
    hands,
    pool: allTiles.slice(idx),
  };
}

/**
 * 손패 정렬
 */
export function sortHand(
  hand: Tile[],
  mode: 'number' | 'color'
): Tile[] {
  const sorted = [...hand];

  if (mode === 'number') {
    sorted.sort((a, b) => {
      if (a.isJoker) return 1;
      if (b.isJoker) return -1;
      return a.number - b.number || COLORS.indexOf(a.color as TileColor) - COLORS.indexOf(b.color as TileColor);
    });
  } else {
    sorted.sort((a, b) => {
      if (a.isJoker) return 1;
      if (b.isJoker) return -1;
      return COLORS.indexOf(a.color as TileColor) - COLORS.indexOf(b.color as TileColor) || a.number - b.number;
    });
  }

  return sorted;
}

/**
 * 방 코드 생성 (4자리 영문 대문자)
 */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // I, O 제외 (혼동 방지)
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
