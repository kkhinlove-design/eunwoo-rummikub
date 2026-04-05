-- 은우 루미��브 - 공유 플레이어 기반 마이그레이션
-- 주의: players 테이블은 스도쿠/장기/체스와 공유합니다.
-- players 테이블이 이미 있어야 합니다. 없다면 스도쿠 migration을 먼저 실행하세요.

-- 기존 루미큐브 전용 players 테이블이 있다면 삭제 (의존 테이블 먼저)
-- ⚠️ 이미 게임 데이터가 있다면 이 부분은 건너뛰세요!
DROP TABLE IF EXISTS turn_snapshots CASCADE;
DROP TABLE IF EXISTS game_history CASCADE;
DROP TABLE IF EXISTS room_players CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;

-- 공유 players 테이블에 루미큐브 컬럼 추가
ALTER TABLE players ADD COLUMN IF NOT EXISTS rummikub_games_played INT DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS rummikub_games_won INT DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS rummikub_total_penalty INT DEFAULT 0;

-- 루미큐브 방 테이블
CREATE TABLE rummikub_rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  host_id UUID REFERENCES players(id),
  max_players INT DEFAULT 4 CHECK (max_players BETWEEN 2 AND 4),
  turn_timer INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'playing', 'finished')),
  current_turn UUID REFERENCES players(id),
  turn_order UUID[] DEFAULT '{}',
  tile_pool JSONB DEFAULT '[]'::jsonb,
  board JSONB DEFAULT '[]'::jsonb,
  winner_id UUID REFERENCES players(id),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 루미큐브 방 참가자 테이블
CREATE TABLE rummikub_room_players (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES rummikub_rooms(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id),
  hand JSONB DEFAULT '[]'::jsonb,
  has_melded BOOLEAN DEFAULT false,
  penalty_score INT DEFAULT 0,
  seat_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(room_id, player_id)
);

-- 루미큐브 게임 기록
CREATE TABLE rummikub_game_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id UUID REFERENCES players(id),
  room_id UUID REFERENCES rummikub_rooms(id),
  penalty_score INT DEFAULT 0,
  is_winner BOOLEAN DEFAULT false,
  played_at TIMESTAMPTZ DEFAULT now()
);

-- 루미큐브 턴 스냅샷 (되돌리기 기능용)
CREATE TABLE rummikub_turn_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES rummikub_rooms(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id),
  snapshot_board JSONB NOT NULL,
  snapshot_hand JSONB NOT NULL,
  snapshot_pool JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX idx_rummikub_rooms_code ON rummikub_rooms(code);
CREATE INDEX idx_rummikub_rooms_status ON rummikub_rooms(status);
CREATE INDEX idx_rummikub_room_players_room ON rummikub_room_players(room_id);
CREATE INDEX idx_rummikub_room_players_player ON rummikub_room_players(player_id);
CREATE INDEX idx_rummikub_game_history_player ON rummikub_game_history(player_id);
CREATE INDEX idx_rummikub_turn_snapshots_room ON rummikub_turn_snapshots(room_id);

-- RLS 활성화
ALTER TABLE rummikub_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE rummikub_room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE rummikub_game_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE rummikub_turn_snapshots ENABLE ROW LEVEL SECURITY;

-- 공개 접근 정책
CREATE POLICY "public_rummikub_rooms" ON rummikub_rooms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_rummikub_room_players" ON rummikub_room_players FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_rummikub_game_history" ON rummikub_game_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_rummikub_turn_snapshots" ON rummikub_turn_snapshots FOR ALL USING (true) WITH CHECK (true);

-- Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE rummikub_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE rummikub_room_players;
