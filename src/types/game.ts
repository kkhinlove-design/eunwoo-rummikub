// 은우 루미큐브 - 타입 정의

/* ─── 타일 ─── */
export type TileColor = 'red' | 'blue' | 'orange' | 'black';

export interface Tile {
  id: number;
  number: number;       // 1~13, 조커는 0
  color: TileColor | 'joker';
  isJoker: boolean;
}

/* ─── 게임 상태 ─── */
export type GameStatus = 'waiting' | 'playing' | 'finished';

export interface MeldSet {
  tiles: Tile[];
  isValid: boolean;
}

/* ─── DB 모델 ─── */
export interface Player {
  id: string;
  name: string;
  avatar_emoji: string;
  // 루미큐브 전용 전적 (공유 players 테이블의 컬럼)
  rummikub_games_played: number;
  rummikub_games_won: number;
  rummikub_total_penalty: number;
  created_at: string;
}

export interface Room {
  id: string;
  code: string;
  host_id: string;
  max_players: number;
  turn_timer: number;
  status: GameStatus;
  current_turn: string | null;
  turn_order: string[];
  tile_pool: Tile[];
  board: Tile[][];           // 세트 배열 (각 세트는 타일 배열)
  winner_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface RoomPlayer {
  id: string;
  room_id: string;
  player_id: string;
  hand: Tile[];
  has_melded: boolean;
  penalty_score: number;
  seat_order: number;
  created_at: string;
  // join으로 가져올 때
  player?: Player;
}

export interface GameHistory {
  id: string;
  player_id: string;
  room_id: string;
  penalty_score: number;
  is_winner: boolean;
  played_at: string;
}

export interface TurnSnapshot {
  id: string;
  room_id: string;
  player_id: string;
  snapshot_board: Tile[][];
  snapshot_hand: Tile[];
  snapshot_pool: Tile[];
  created_at: string;
}

/* ─── 클라이언트 상태 ─── */
export interface DragSource {
  from: 'hand' | 'board';
  tile: Tile;
  setIdx?: number;         // from === 'board'일 때 원본 세트 인덱스
}

export interface SelectedTile {
  from: 'hand' | 'board';
  tile: Tile;
  setIdx?: number;
}

export interface MoveTarget {
  to: 'newSet' | 'set';
  setIdx?: number;
  position?: number;       // 세트 내 삽입 위치
}

/* ─── 게임 액션 (실시간 동기화용) ─── */
export type GameAction =
  | { type: 'PLACE_TILES'; board: Tile[][]; hand: Tile[]; tilesPlayed: number[] }
  | { type: 'DRAW_TILE'; drawnTile: Tile; remainingPool: Tile[] }
  | { type: 'END_TURN'; nextPlayer: string }
  | { type: 'UNDO_TURN' }
  | { type: 'WIN'; winnerId: string };

/* ─── 설정 상수 ─── */
export const COLORS: TileColor[] = ['red', 'blue', 'orange', 'black'];

export const COLOR_DISPLAY: Record<TileColor, { hex: string; name: string }> = {
  red:    { hex: '#E63946', name: '빨강' },
  blue:   { hex: '#457B9D', name: '파랑' },
  orange: { hex: '#F4A261', name: '주황' },
  black:  { hex: '#264653', name: '검정' },
};

export const JOKER_COLOR = '#9B5DE5';
export const INITIAL_MELD_SCORE = 30;
export const TILES_PER_PLAYER = 14;
export const JOKER_PENALTY = 30;

export const AVATAR_EMOJIS = [
  '😊', '🦊', '🐱', '🐶', '🐰', '🐼',
  '🦁', '🐸', '🐵', '🦄', '🐯', '🐮',
];
