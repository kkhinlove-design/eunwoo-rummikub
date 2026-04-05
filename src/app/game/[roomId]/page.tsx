'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useRoomRealtime, useRoomPlayersRealtime, useMyHandRealtime } from '@/lib/realtime';
import {
  isBoardValid, isBoardDifferent, validateInitialMeld,
  calcPenalty, deepCopyBoard, deepCopyHand,
} from '@/lib/game-logic';
import { distributeInitialTiles, sortHand } from '@/lib/tile-utils';
import { Tile as TileType, Player, RoomPlayer, TurnSnapshot } from '@/types/game';

import GameBoard from '@/components/GameBoard';
import PlayerHand from '@/components/PlayerHand';
import PlayerInfo from '@/components/PlayerInfo';
import GameControls from '@/components/GameControls';

export default function GamePage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = use(params);
  const router = useRouter();

  // 플레이어 정보
  const [player, setPlayer] = useState<Player | null>(null);

  // 실시간 상태
  const room = useRoomRealtime(roomId);
  const roomPlayers = useRoomPlayersRealtime(roomId);
  const serverHand = useMyHandRealtime(roomId, player?.id || null);

  // 로컬 게임 상태
  const [localBoard, setLocalBoard] = useState<TileType[][]>([]);
  const [localHand, setLocalHand] = useState<TileType[]>([]);
  const [snapshot, setSnapshot] = useState<TurnSnapshot | null>(null);

  // UI 상태
  const [selectedTile, setSelectedTile] = useState<{
    tile: TileType;
    from: 'hand' | 'board';
    setIdx?: number;
  } | null>(null);
  const [dragTile, setDragTile] = useState<{
    tile: TileType;
    from: 'hand' | 'board';
    setIdx?: number;
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [initialized, setInitialized] = useState(false);

  const isMyTurn = room?.current_turn === player?.id;
  const myRoomPlayer = roomPlayers.find(rp => rp.player_id === player?.id);

  // 플레이어 정보 로드
  useEffect(() => {
    const saved = localStorage.getItem('rummikub_player');
    if (!saved) { router.push('/'); return; }
    setPlayer(JSON.parse(saved));
  }, [router]);

  // 타일 배분 (방장만, 게임 시작 직후 1회)
  useEffect(() => {
    if (!room || !player || initialized) return;
    if (room.status !== 'playing') return;

    // 이미 타일이 배분되어 있으면 스킵
    if (room.tile_pool && room.tile_pool.length > 0) {
      setInitialized(true);
      return;
    }

    // 방장만 배분
    if (room.host_id !== player.id) {
      // 방장이 아니면 배분될 때까지 대기
      const interval = setInterval(async () => {
        const { data } = await supabase
          .from('rummikub_rooms')
          .select('tile_pool')
          .eq('id', roomId)
          .single();
        if (data?.tile_pool && data.tile_pool.length > 0) {
          setInitialized(true);
          clearInterval(interval);
        }
      }, 1000);
      return () => clearInterval(interval);
    }

    // 방장: 타일 배분 실행
    (async () => {
      const { hands, pool } = distributeInitialTiles(roomPlayers.length);

      // 각 플레이어에게 손패 배분
      for (let i = 0; i < roomPlayers.length; i++) {
        await supabase
          .from('rummikub_room_players')
          .update({ hand: hands[i] as any })
          .eq('id', roomPlayers[i].id);
      }

      // 풀 저장
      await supabase
        .from('rummikub_rooms')
        .update({ tile_pool: pool as any, board: [] as any })
        .eq('id', roomId);

      // 첫 턴 스냅샷
      const firstPlayer = room.turn_order[0];
      const firstRp = roomPlayers.find(rp => rp.player_id === firstPlayer);
      const firstHandIdx = roomPlayers.indexOf(firstRp!);
      await supabase
        .from('rummikub_turn_snapshots')
        .insert({
          room_id: roomId,
          player_id: firstPlayer,
          snapshot_board: [] as any,
          snapshot_hand: hands[firstHandIdx] as any,
          snapshot_pool: pool as any,
        });

      setInitialized(true);
    })();
  }, [room, player, roomPlayers, roomId, initialized]);

  // 서버 보드 → 로컬 보드 동기화 (상대 턴일 때)
  useEffect(() => {
    if (!room) return;
    if (!isMyTurn) {
      setLocalBoard(room.board || []);
    }
  }, [room?.board, isMyTurn]);

  // 서버 손패 → 로컬 손패 동기화
  useEffect(() => {
    if (serverHand && serverHand.length > 0) {
      setLocalHand(serverHand);
    }
  }, [serverHand]);

  // 턴 시작 시 스냅샷 로드
  useEffect(() => {
    if (!isMyTurn || !room || !player) return;

    // 현재 보드를 로컬에 복사
    setLocalBoard(room.board || []);

    // 스냅샷 로드
    (async () => {
      const { data } = await supabase
        .from('rummikub_turn_snapshots')
        .select('*')
        .eq('room_id', roomId)
        .eq('player_id', player.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (data) setSnapshot(data as TurnSnapshot);
    })();

    setMessage('');
    setSelectedTile(null);
  }, [isMyTurn, room?.current_turn]);

  // 보드 변경 여부
  const hasBoardChanged = snapshot
    ? isBoardDifferent(localBoard, snapshot.snapshot_board)
    : localBoard.length > 0;

  // 턴 종료 가능 여부
  const canEndTurn = isMyTurn && (
    hasBoardChanged
      ? isBoardValid(localBoard)  // 보드 변경 시: 모든 세트 유효해야
      : false                     // 변경 없으면 뽑아야 함
  );

  /* ═══ 타일 이동 핸들러 ═══ */

  // 손패에서 타일 선택
  const handleHandTileClick = useCallback((tile: TileType) => {
    if (!isMyTurn) return;

    if (selectedTile && selectedTile.tile.id === tile.id) {
      setSelectedTile(null);
      return;
    }

    setSelectedTile({ tile, from: 'hand' });
  }, [isMyTurn, selectedTile]);

  // 보드에서 타일 선택
  const handleBoardTileClick = useCallback((tile: TileType, setIdx: number) => {
    if (!isMyTurn) return;

    if (selectedTile && selectedTile.tile.id === tile.id) {
      setSelectedTile(null);
      return;
    }

    // 선택된 타일이 있으면 → 해당 세트에 삽입
    if (selectedTile) {
      moveTileToSet(setIdx);
      return;
    }

    setSelectedTile({ tile, from: 'board', setIdx });
  }, [isMyTurn, selectedTile]);

  // 타일을 세트로 이동
  function moveTileToSet(targetSetIdx: number) {
    if (!selectedTile) return;

    const newBoard = deepCopyBoard(localBoard);
    let newHand = deepCopyHand(localHand);

    // 소스에서 제거
    if (selectedTile.from === 'hand') {
      newHand = newHand.filter(t => t.id !== selectedTile.tile.id);
    } else if (selectedTile.from === 'board' && selectedTile.setIdx !== undefined) {
      newBoard[selectedTile.setIdx] = newBoard[selectedTile.setIdx].filter(
        t => t.id !== selectedTile.tile.id
      );
      // 빈 세트 제거
      if (newBoard[selectedTile.setIdx].length === 0) {
        newBoard.splice(selectedTile.setIdx, 1);
        // 인덱스 조정
        if (targetSetIdx > selectedTile.setIdx) targetSetIdx--;
      }
    }

    // 타겟 세트에 추가
    if (targetSetIdx < newBoard.length) {
      newBoard[targetSetIdx].push(selectedTile.tile);
    }

    setLocalBoard(newBoard);
    setLocalHand(newHand);
    setSelectedTile(null);
  }

  // 새 세트로 이동
  function moveTileToNewSet() {
    if (!selectedTile) return;

    const newBoard = deepCopyBoard(localBoard);
    let newHand = deepCopyHand(localHand);

    // 소스에서 제거
    if (selectedTile.from === 'hand') {
      newHand = newHand.filter(t => t.id !== selectedTile.tile.id);
    } else if (selectedTile.from === 'board' && selectedTile.setIdx !== undefined) {
      newBoard[selectedTile.setIdx] = newBoard[selectedTile.setIdx].filter(
        t => t.id !== selectedTile.tile.id
      );
      if (newBoard[selectedTile.setIdx].length === 0) {
        newBoard.splice(selectedTile.setIdx, 1);
      }
    }

    // 새 세트 생성
    newBoard.push([selectedTile.tile]);

    setLocalBoard(newBoard);
    setLocalHand(newHand);
    setSelectedTile(null);
  }

  // 드래그 핸들러
  const handleDragStartFromHand = useCallback((tile: TileType) => {
    setDragTile({ tile, from: 'hand' });
  }, []);

  const handleDragStartFromBoard = useCallback((tile: TileType, setIdx: number) => {
    setDragTile({ tile, from: 'board', setIdx });
  }, []);

  const handleDropToSet = useCallback((targetSetIdx: number) => {
    if (!dragTile) return;
    // dragTile을 selectedTile로 설정하고 moveTileToSet 호출
    const newBoard = deepCopyBoard(localBoard);
    let newHand = deepCopyHand(localHand);

    if (dragTile.from === 'hand') {
      newHand = newHand.filter(t => t.id !== dragTile.tile.id);
    } else if (dragTile.from === 'board' && dragTile.setIdx !== undefined) {
      newBoard[dragTile.setIdx] = newBoard[dragTile.setIdx].filter(
        t => t.id !== dragTile.tile.id
      );
      if (newBoard[dragTile.setIdx].length === 0) {
        newBoard.splice(dragTile.setIdx, 1);
        if (targetSetIdx > dragTile.setIdx) targetSetIdx--;
      }
    }

    if (targetSetIdx < newBoard.length) {
      newBoard[targetSetIdx].push(dragTile.tile);
    }

    setLocalBoard(newBoard);
    setLocalHand(newHand);
    setDragTile(null);
  }, [dragTile, localBoard, localHand]);

  const handleDropToNewSet = useCallback(() => {
    if (!dragTile) return;
    const newBoard = deepCopyBoard(localBoard);
    let newHand = deepCopyHand(localHand);

    if (dragTile.from === 'hand') {
      newHand = newHand.filter(t => t.id !== dragTile.tile.id);
    } else if (dragTile.from === 'board' && dragTile.setIdx !== undefined) {
      newBoard[dragTile.setIdx] = newBoard[dragTile.setIdx].filter(
        t => t.id !== dragTile.tile.id
      );
      if (newBoard[dragTile.setIdx].length === 0) {
        newBoard.splice(dragTile.setIdx, 1);
      }
    }

    newBoard.push([dragTile.tile]);
    setLocalBoard(newBoard);
    setLocalHand(newHand);
    setDragTile(null);
  }, [dragTile, localBoard, localHand]);

  /* ═══ 게임 액션 ═══ */

  // 뽑기
  async function handleDraw() {
    if (!room || !player || !isMyTurn || hasBoardChanged) return;
    setLoading(true);

    try {
      const pool = [...(room.tile_pool || [])];
      if (pool.length === 0) {
        setMessage('더 이상 뽑을 타일이 없습니다!');
        setLoading(false);
        return;
      }

      const drawn = pool.pop()!;
      const newHand = [...localHand, drawn];

      // DB 업데이트
      await supabase
        .from('rummikub_room_players')
        .update({ hand: newHand as any })
        .eq('room_id', roomId)
        .eq('player_id', player.id);

      // 다음 턴
      const turnOrder = room.turn_order;
      const myIdx = turnOrder.indexOf(player.id);
      const nextIdx = (myIdx + 1) % turnOrder.length;
      const nextPlayer = turnOrder[nextIdx];

      await supabase
        .from('rummikub_rooms')
        .update({
          tile_pool: pool as any,
          current_turn: nextPlayer,
        })
        .eq('id', roomId);

      // 다음 플레이어 스냅샷
      const nextRp = roomPlayers.find(rp => rp.player_id === nextPlayer);
      if (nextRp) {
        // 기존 스냅샷 삭제 후 새로 생성
        await supabase
          .from('rummikub_turn_snapshots')
          .delete()
          .eq('room_id', roomId)
          .eq('player_id', nextPlayer);

        await supabase
          .from('rummikub_turn_snapshots')
          .insert({
            room_id: roomId,
            player_id: nextPlayer,
            snapshot_board: localBoard as any,
            snapshot_hand: nextRp.hand as any,
            snapshot_pool: pool as any,
          });
      }

      setLocalHand(newHand);
      setSelectedTile(null);
    } catch (err: any) {
      setMessage(err.message || '오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  }

  // 되돌리기
  function handleUndo() {
    if (!snapshot) return;
    setLocalBoard(snapshot.snapshot_board);
    setLocalHand(snapshot.snapshot_hand);
    setSelectedTile(null);
    setMessage('');
  }

  // 턴 종료
  async function handleEndTurn() {
    if (!room || !player || !isMyTurn || !canEndTurn) return;
    setLoading(true);
    setMessage('');

    try {
      // 보드 유효성 검사
      if (!isBoardValid(localBoard)) {
        setMessage('테이블 위의 모든 세트가 유효해야 합니다!');
        setLoading(false);
        return;
      }

      // 첫 등록 검사
      if (!myRoomPlayer?.has_melded && snapshot) {
        const tilesFromHand = findTilesPlayedFromHand(
          localHand, snapshot.snapshot_hand
        );
        const result = validateInitialMeld(
          localBoard, snapshot.snapshot_board, tilesFromHand
        );
        if (!result.valid) {
          setMessage(result.error || '첫 등록 조건을 만족하지 않습니다');
          setLoading(false);
          return;
        }

        // 첫 등록 성공 표시
        await supabase
          .from('rummikub_room_players')
          .update({ has_melded: true })
          .eq('room_id', roomId)
          .eq('player_id', player.id);
      }

      // 승리 체크
      if (localHand.length === 0) {
        await handleWin();
        return;
      }

      // 손패 & 보드 저장
      await supabase
        .from('rummikub_room_players')
        .update({ hand: localHand as any })
        .eq('room_id', roomId)
        .eq('player_id', player.id);

      // 다음 턴
      const turnOrder = room.turn_order;
      const myIdx = turnOrder.indexOf(player.id);
      const nextIdx = (myIdx + 1) % turnOrder.length;
      const nextPlayer = turnOrder[nextIdx];

      await supabase
        .from('rummikub_rooms')
        .update({
          board: localBoard as any,
          current_turn: nextPlayer,
        })
        .eq('id', roomId);

      // 다음 플레이어 스냅샷
      const nextRp = roomPlayers.find(rp => rp.player_id === nextPlayer);
      if (nextRp) {
        await supabase
          .from('rummikub_turn_snapshots')
          .delete()
          .eq('room_id', roomId)
          .eq('player_id', nextPlayer);

        await supabase
          .from('rummikub_turn_snapshots')
          .insert({
            room_id: roomId,
            player_id: nextPlayer,
            snapshot_board: localBoard as any,
            snapshot_hand: nextRp.hand as any,
            snapshot_pool: (room.tile_pool || []) as any,
          });
      }

      setSelectedTile(null);
    } catch (err: any) {
      setMessage(err.message || '오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  }

  // 승리 처리
  async function handleWin() {
    if (!room || !player) return;

    // 벌점 계산 & 기록
    for (const rp of roomPlayers) {
      const penalty = rp.player_id === player.id ? 0 : calcPenalty(rp.hand);

      await supabase
        .from('rummikub_room_players')
        .update({ penalty_score: penalty })
        .eq('id', rp.id);

      await supabase
        .from('rummikub_game_history')
        .insert({
          player_id: rp.player_id,
          room_id: roomId,
          penalty_score: penalty,
          is_winner: rp.player_id === player.id,
        });

      // 플레이어 루미큐브 전적 업데이트
      const { data: p } = await supabase
        .from('players')
        .select('rummikub_games_played, rummikub_games_won, rummikub_total_penalty')
        .eq('id', rp.player_id)
        .single();
      if (p) {
        await supabase
          .from('players')
          .update({
            rummikub_games_played: (p.rummikub_games_played || 0) + 1,
            rummikub_games_won: (p.rummikub_games_won || 0) + (rp.player_id === player.id ? 1 : 0),
            rummikub_total_penalty: (p.rummikub_total_penalty || 0) + penalty,
          })
          .eq('id', rp.player_id);
      }
    }

    // 방 상태 업데이트
    await supabase
      .from('rummikub_rooms')
      .update({
        status: 'finished',
        winner_id: player.id,
        board: localBoard as any,
        finished_at: new Date().toISOString(),
      })
      .eq('id', roomId);

    setLoading(false);
  }

  // 손패에서 내려놓은 타일 ID 찾기
  function findTilesPlayedFromHand(
    currentHand: TileType[],
    snapshotHand: TileType[]
  ): number[] {
    const currentIds = new Set(currentHand.map(t => t.id));
    return snapshotHand
      .filter(t => !currentIds.has(t.id))
      .map(t => t.id);
  }

  // 정렬
  const handleSortByNumber = () => setLocalHand(sortHand(localHand, 'number'));
  const handleSortByColor = () => setLocalHand(sortHand(localHand, 'color'));

  /* ═══ 렌더링 ═══ */

  // 게임 종료 화면
  if (room?.status === 'finished') {
    const winner = roomPlayers.find(rp => rp.player_id === room.winner_id);
    const sorted = [...roomPlayers].sort((a, b) => a.penalty_score - b.penalty_score);

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card w-full max-w-md text-center">
          <div className="text-6xl mb-4">🏆</div>
          <h2 className="text-2xl font-bold mb-2">게임 종료!</h2>
          <p className="text-xl text-yellow-300 mb-6">
            {winner?.player?.avatar_emoji} {winner?.player?.name} 승리!
          </p>

          <div className="space-y-2 mb-6">
            {sorted.map((rp, i) => (
              <div
                key={rp.id}
                className={`flex items-center justify-between px-4 py-3 rounded-xl ${
                  rp.player_id === room.winner_id
                    ? 'bg-yellow-400/20'
                    : 'bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-white/40">{i + 1}</span>
                  <span className="text-xl">{rp.player?.avatar_emoji}</span>
                  <span>{rp.player?.name}</span>
                </div>
                <span className={`font-bold ${
                  rp.penalty_score === 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {rp.penalty_score === 0 ? '승리!' : `-${rp.penalty_score}점`}
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={() => router.push('/lobby')}
            className="btn btn-primary w-full"
          >
            로비로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  // 로딩
  if (!room || !player) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white/60">로딩 중...</div>
      </div>
    );
  }

  // 타일 배분 대기
  if (!initialized || (!room.tile_pool || room.tile_pool.length === 0)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-bounce">🎲</div>
          <div className="text-white/60">타일을 섞는 중...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col p-3 gap-3">
      {/* 상단: 플레이어 정보 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <PlayerInfo
          players={roomPlayers}
          currentTurn={room.current_turn}
          myPlayerId={player.id}
        />
        <div className="text-sm text-white/40">
          남은 타일: {room.tile_pool?.length || 0}장
        </div>
      </div>

      {/* 중앙: 게임 보드 */}
      <div className="flex-1">
        <GameBoard
          board={localBoard}
          selectedTileId={selectedTile?.tile.id || null}
          isMyTurn={isMyTurn}
          onTileClick={handleBoardTileClick}
          onDropToSet={handleDropToSet}
          onDropToNewSet={handleDropToNewSet}
          onDragStartFromBoard={handleDragStartFromBoard}
        />
      </div>

      {/* 하단: 컨트롤 + 손패 */}
      <div className="space-y-3">
        <GameControls
          isMyTurn={isMyTurn}
          canEndTurn={canEndTurn}
          hasBoardChanged={hasBoardChanged}
          poolCount={room.tile_pool?.length || 0}
          onDraw={handleDraw}
          onUndo={handleUndo}
          onEndTurn={handleEndTurn}
          loading={loading}
          message={message}
        />

        <PlayerHand
          hand={localHand}
          selectedTileId={selectedTile?.from === 'hand' ? selectedTile.tile.id : null}
          isMyTurn={isMyTurn}
          onTileClick={handleHandTileClick}
          onDragStart={handleDragStartFromHand}
          onSortByNumber={handleSortByNumber}
          onSortByColor={handleSortByColor}
        />
      </div>
    </div>
  );
}
