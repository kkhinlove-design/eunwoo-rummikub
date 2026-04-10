-- 스냅샷 테이블에 unique 제약 추가 (upsert 지원)
-- 기존 중복 데이터 정리 후 제약 추가

-- 중복 스냅샷 정리 (가장 최신 것만 유지)
DELETE FROM rummikub_turn_snapshots a
USING rummikub_turn_snapshots b
WHERE a.room_id = b.room_id
  AND a.player_id = b.player_id
  AND a.created_at < b.created_at;

-- unique 제약 추가
ALTER TABLE rummikub_turn_snapshots
  ADD CONSTRAINT uq_snapshot_room_player UNIQUE (room_id, player_id);

-- 성능 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_rummikub_snapshots_room_player
  ON rummikub_turn_snapshots(room_id, player_id);
