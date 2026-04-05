-- 은우 루미큐브 게임 DB 마이그레이션
-- Supabase SQL Editor에서 실행하세요

-- 플레이어 테이블
CREATE TABLE players (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  avatar_emoji TEXT DEFAULT '😊',
  games_played INT DEFAULT 0,
  games_won INT DEFAULT 0,
  total_penalty_score INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 게임 방 테이블
CREATE TABLE rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  host_id UUID REFERENCES players(id),
  -- 게임 설정
  max_players INT DEFAULT 4 CHECK (max_players BETWEEN 2 AND 4),
  turn_timer INT DEFAULT 0,  -- 0=무제한, 60, 90 (초)
  -- 게임 상태
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'playing', 'finished')),
  current_turn UUID REFERENCES players(id),
  turn_order UUID[] DEFAULT '{}',
  -- 타일 풀 & 보드
  tile_pool JSONB DEFAULT '[]'::jsonb,
  board JSONB DEFAULT '[]'::jsonb,        -- [[tile, tile, ...], ...]  세트 배열
  -- 결과
  winner_id UUID REFERENCES players(id),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 방 참가자 테이블
CREATE TABLE room_players (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id),
  -- 손패 (각자만 볼 수 있는 데이터)
  hand JSONB DEFAULT '[]'::jsonb,
  -- 첫 등록 여부
  has_melded BOOLEAN DEFAULT false,
  -- 게임 종료 시 벌점
  penalty_score INT DEFAULT 0,
  -- 순서
  seat_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(room_id, player_id)
);

-- 게임 기록 테이블
CREATE TABLE game_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID REFERENCES players(id),
  room_id UUID REFERENCES rooms(id),
  penalty_score INT DEFAULT 0,
  is_winner BOOLEAN DEFAULT false,
  played_at TIMESTAMPTZ DEFAULT now()
);

-- 턴 스냅샷 테이블 (되돌리기 기능용)
CREATE TABLE turn_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id),
  -- 턴 시작 시점의 상태
  snapshot_board JSONB NOT NULL,
  snapshot_hand JSONB NOT NULL,
  snapshot_pool JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_rooms_code ON rooms(code);
CREATE INDEX idx_rooms_status ON rooms(status);
CREATE INDEX idx_room_players_room ON room_players(room_id);
CREATE INDEX idx_room_players_player ON room_players(player_id);
CREATE INDEX idx_game_history_player ON game_history(player_id);
CREATE INDEX idx_turn_snapshots_room ON turn_snapshots(room_id);

-- RLS 활성화
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE turn_snapshots ENABLE ROW LEVEL SECURITY;

-- 공개 접근 정책 (아이들 게임이므로 간단하게)
CREATE POLICY "public_players" ON players FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_rooms" ON rooms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_room_players" ON room_players FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_game_history" ON game_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_turn_snapshots" ON turn_snapshots FOR ALL USING (true) WITH CHECK (true);

-- Realtime 활성화 (방 상태, 참가자 변경 실시간 감지)
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE room_players;
