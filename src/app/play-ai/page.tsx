'use client';

/**
 * 은우 루미큐브 - AI 대결 (솔로 모드)
 * Supabase 방 없이 로컬 상태만으로 AI와 1:1 대결.
 * 턴 흐름: 플레이어 → AI → 플레이어 ...
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  isBoardValid,
  isBoardDifferent,
  validateInitialMeld,
  calcPenalty,
  deepCopyBoard,
  deepCopyHand,
} from '@/lib/game-logic';
import { distributeInitialTiles, sortHand } from '@/lib/tile-utils';
import { computeAiMove, AI_LEVELS, AiLevel } from '@/lib/ai-player';
import { Tile as TileType, Player } from '@/types/game';

import GameBoard from '@/components/GameBoard';
import PlayerHand from '@/components/PlayerHand';

type Phase = 'select' | 'playing' | 'finished';

export default function PlayAIPage() {
  const router = useRouter();

  // 플레이어 정보
  const [player, setPlayer] = useState<Player | null>(null);

  // 게임 설정
  const [phase, setPhase] = useState<Phase>('select');
  const [aiLevel, setAiLevel] = useState<AiLevel>('student');

  // 게임 상태
  const [localBoard, setLocalBoard] = useState<TileType[][]>([]);
  const [localHand, setLocalHand] = useState<TileType[]>([]);
  const [aiHand, setAiHand] = useState<TileType[]>([]);
  const [pool, setPool] = useState<TileType[]>([]);
  const [playerMelded, setPlayerMelded] = useState(false);
  const [aiMelded, setAiMelded] = useState(false);
  const [currentTurn, setCurrentTurn] = useState<'player' | 'ai'>('player');

  // 턴 스냅샷 (첫 등록 검증 + 되돌리기용)
  const [snapshotBoard, setSnapshotBoard] = useState<TileType[][]>([]);
  const [snapshotHand, setSnapshotHand] = useState<TileType[]>([]);

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

  const [message, setMessage] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [aiLastAction, setAiLastAction] = useState<string>('');

  // 결과
  const [result, setResult] = useState<'win' | 'lose' | null>(null);
  const [penaltyScore, setPenaltyScore] = useState(0);
  const statsSavedRef = useRef(false);

  const isMyTurn = currentTurn === 'player' && phase === 'playing';

  // 플레이어 정보 로드
  useEffect(() => {
    const saved = localStorage.getItem('rummikub_player');
    if (!saved) {
      router.push('/');
      return;
    }
    setPlayer(JSON.parse(saved));
  }, [router]);

  /* ═══════════════════════════════════════════
     게임 시작
     ═══════════════════════════════════════════ */
  function startGame(level: AiLevel) {
    const { hands, pool: initialPool } = distributeInitialTiles(2);
    const playerStart = hands[0];
    const aiStart = hands[1];

    setAiLevel(level);
    setLocalHand(playerStart);
    setAiHand(aiStart);
    setLocalBoard([]);
    setPool(initialPool);
    setPlayerMelded(false);
    setAiMelded(false);
    setCurrentTurn('player');
    setSnapshotBoard([]);
    setSnapshotHand(playerStart);
    setSelectedTile(null);
    setDragTile(null);
    setMessage('');
    setAiThinking(false);
    setAiLastAction('');
    setResult(null);
    setPenaltyScore(0);
    statsSavedRef.current = false;
    setPhase('playing');
  }

  // 보드 변경 여부
  const hasBoardChanged = isBoardDifferent(localBoard, snapshotBoard);

  // 턴 종료 가능 여부
  const canEndTurn = isMyTurn && (hasBoardChanged ? isBoardValid(localBoard) : false);

  /* ═══════════════════════════════════════════
     타일 이동 핸들러 (기존 game 페이지 패턴 그대로)
     ═══════════════════════════════════════════ */
  const handleHandTileClick = useCallback(
    (tile: TileType) => {
      if (!isMyTurn) return;
      if (selectedTile && selectedTile.tile.id === tile.id) {
        setSelectedTile(null);
        return;
      }
      setSelectedTile({ tile, from: 'hand' });
    },
    [isMyTurn, selectedTile]
  );

  const handleBoardTileClick = useCallback(
    (tile: TileType, setIdx: number) => {
      if (!isMyTurn) return;
      if (selectedTile && selectedTile.tile.id === tile.id) {
        setSelectedTile(null);
        return;
      }
      if (selectedTile) {
        moveTileToSet(setIdx);
        return;
      }
      setSelectedTile({ tile, from: 'board', setIdx });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isMyTurn, selectedTile, localBoard, localHand]
  );

  function moveTileToSet(targetSetIdx: number) {
    if (!selectedTile) return;
    const newBoard = deepCopyBoard(localBoard);
    let newHand = deepCopyHand(localHand);

    if (selectedTile.from === 'hand') {
      newHand = newHand.filter(t => t.id !== selectedTile.tile.id);
    } else if (selectedTile.from === 'board' && selectedTile.setIdx !== undefined) {
      newBoard[selectedTile.setIdx] = newBoard[selectedTile.setIdx].filter(
        t => t.id !== selectedTile.tile.id
      );
      if (newBoard[selectedTile.setIdx].length === 0) {
        newBoard.splice(selectedTile.setIdx, 1);
        if (targetSetIdx > selectedTile.setIdx) targetSetIdx--;
      }
    }

    if (targetSetIdx < newBoard.length) {
      newBoard[targetSetIdx].push(selectedTile.tile);
    }

    setLocalBoard(newBoard);
    setLocalHand(newHand);
    setSelectedTile(null);
  }

  const handleDragStartFromHand = useCallback((tile: TileType) => {
    setDragTile({ tile, from: 'hand' });
  }, []);

  const handleDragStartFromBoard = useCallback(
    (tile: TileType, setIdx: number) => {
      setDragTile({ tile, from: 'board', setIdx });
    },
    []
  );

  const handleDropToSet = useCallback(
    (targetSetIdx: number) => {
      const source = dragTile ?? selectedTile;
      if (!source) return;

      const newBoard = deepCopyBoard(localBoard);
      let newHand = deepCopyHand(localHand);

      if (source.from === 'hand') {
        newHand = newHand.filter(t => t.id !== source.tile.id);
      } else if (source.from === 'board' && source.setIdx !== undefined) {
        newBoard[source.setIdx] = newBoard[source.setIdx].filter(
          t => t.id !== source.tile.id
        );
        if (newBoard[source.setIdx].length === 0) {
          newBoard.splice(source.setIdx, 1);
          if (targetSetIdx > source.setIdx) targetSetIdx--;
        }
      }

      if (targetSetIdx < newBoard.length) {
        newBoard[targetSetIdx].push(source.tile);
      }

      setLocalBoard(newBoard);
      setLocalHand(newHand);
      setDragTile(null);
      setSelectedTile(null);
    },
    [dragTile, selectedTile, localBoard, localHand]
  );

  const handleDropToNewSet = useCallback(() => {
    const source = dragTile ?? selectedTile;
    if (!source) return;

    const newBoard = deepCopyBoard(localBoard);
    let newHand = deepCopyHand(localHand);

    if (source.from === 'hand') {
      newHand = newHand.filter(t => t.id !== source.tile.id);
    } else if (source.from === 'board' && source.setIdx !== undefined) {
      newBoard[source.setIdx] = newBoard[source.setIdx].filter(
        t => t.id !== source.tile.id
      );
      if (newBoard[source.setIdx].length === 0) {
        newBoard.splice(source.setIdx, 1);
      }
    }

    newBoard.push([source.tile]);
    setLocalBoard(newBoard);
    setLocalHand(newHand);
    setDragTile(null);
    setSelectedTile(null);
  }, [dragTile, selectedTile, localBoard, localHand]);

  /* ═══════════════════════════════════════════
     게임 액션: 뽑기 / 되돌리기 / 턴 종료
     ═══════════════════════════════════════════ */
  function handleDraw() {
    if (!isMyTurn || hasBoardChanged) return;
    if (pool.length === 0) {
      setMessage('더 이상 뽑을 타일이 없습니다!');
      return;
    }
    const next = [...pool];
    const drawn = next.pop()!;
    setPool(next);
    setLocalHand([...localHand, drawn]);
    setMessage('');
    // 뽑기 후 AI 턴으로
    passToAi([...localHand, drawn], localBoard, next);
  }

  function handleUndo() {
    setLocalBoard(deepCopyBoard(snapshotBoard));
    setLocalHand(deepCopyHand(snapshotHand));
    setSelectedTile(null);
    setMessage('');
  }

  function handleEndTurn() {
    if (!isMyTurn || !canEndTurn) return;

    if (!isBoardValid(localBoard)) {
      setMessage('테이블 위의 모든 세트가 유효해야 합니다!');
      return;
    }

    // 첫 등록 검증
    let nextMelded = playerMelded;
    if (!playerMelded) {
      const tilesFromHand = findTilesPlayedFromHand(localHand, snapshotHand);
      const meldResult = validateInitialMeld(localBoard, snapshotBoard, tilesFromHand);
      if (!meldResult.valid) {
        setMessage(meldResult.error || '첫 등록 조건을 만족하지 않습니다');
        return;
      }
      nextMelded = true;
      setPlayerMelded(true);
    }

    // 승리 체크
    if (localHand.length === 0) {
      finishGame('win');
      return;
    }

    // AI 턴으로 넘김
    passToAi(localHand, localBoard, pool, nextMelded);
  }

  function findTilesPlayedFromHand(
    currentHand: TileType[],
    prevHand: TileType[]
  ): number[] {
    const currentIds = new Set(currentHand.map(t => t.id));
    return prevHand.filter(t => !currentIds.has(t.id)).map(t => t.id);
  }

  /* ═══════════════════════════════════════════
     AI 턴 처리
     ═══════════════════════════════════════════ */
  function passToAi(
    newPlayerHand: TileType[],
    newBoard: TileType[][],
    newPool: TileType[],
    meldedOverride?: boolean
  ) {
    setCurrentTurn('ai');
    setAiThinking(true);
    setSelectedTile(null);
    setDragTile(null);

    const config = AI_LEVELS[aiLevel];

    window.setTimeout(() => {
      runAiTurn(newPlayerHand, newBoard, newPool, meldedOverride ?? playerMelded);
    }, config.thinkMs);
  }

  function runAiTurn(
    playerHandNow: TileType[],
    boardNow: TileType[][],
    poolNow: TileType[],
    playerMeldedNow: boolean
  ) {
    const move = computeAiMove(aiHand, boardNow, aiMelded, aiLevel);

    let nextAiHand = move.newHand;
    let nextBoard = move.newBoard;
    let nextPool = poolNow;
    let actionText = '';
    let nextAiMelded = aiMelded;

    if (move.played) {
      nextAiMelded = true;
      setAiMelded(true);
      actionText = `${move.tilesPlayedIds.length}장 내려놓음`;
    } else {
      // 뽑기
      if (poolNow.length > 0) {
        const nextPoolArr = [...poolNow];
        const drawn = nextPoolArr.pop()!;
        nextPool = nextPoolArr;
        nextAiHand = [...aiHand, drawn];
        actionText = '타일 1장 뽑음';
      } else {
        actionText = '패스 (풀 비었음)';
      }
    }

    setAiHand(nextAiHand);
    setLocalBoard(nextBoard);
    setPool(nextPool);
    setAiLastAction(actionText);
    setAiThinking(false);

    // AI 승리 체크
    if (nextAiHand.length === 0 && nextAiMelded) {
      finishGame('lose');
      return;
    }

    // 플레이어 턴으로 복귀 — 스냅샷 새로 설정
    setSnapshotBoard(deepCopyBoard(nextBoard));
    setSnapshotHand(deepCopyHand(playerHandNow));
    setCurrentTurn('player');
    setMessage('');
  }

  /* ═══════════════════════════════════════════
     게임 종료
     ═══════════════════════════════════════════ */
  async function finishGame(outcome: 'win' | 'lose') {
    setResult(outcome);
    setPhase('finished');
    setCurrentTurn('player');

    const penalty = outcome === 'win' ? 0 : calcPenalty(localHand);
    setPenaltyScore(penalty);

    if (!player || statsSavedRef.current) return;
    statsSavedRef.current = true;

    try {
      const { data: p } = await supabase
        .from('players')
        .select('rummikub_games_played, rummikub_games_won, rummikub_total_penalty')
        .eq('id', player.id)
        .single();
      if (p) {
        await supabase
          .from('players')
          .update({
            rummikub_games_played: (p.rummikub_games_played || 0) + 1,
            rummikub_games_won: (p.rummikub_games_won || 0) + (outcome === 'win' ? 1 : 0),
            rummikub_total_penalty: (p.rummikub_total_penalty || 0) + penalty,
          })
          .eq('id', player.id);
      }
    } catch {
      // 통계 저장 실패는 무시 (게임 결과는 유지)
    }
  }

  const handleSortByNumber = () => setLocalHand(sortHand(localHand, 'number'));
  const handleSortByColor = () => setLocalHand(sortHand(localHand, 'color'));

  /* ═══════════════════════════════════════════
     렌더링
     ═══════════════════════════════════════════ */
  if (!player) return null;

  // ── AI 레벨 선택 화면 ──
  if (phase === 'select') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card w-full max-w-md">
          <div className="text-center mb-6">
            <div className="text-5xl mb-2">🤖</div>
            <h2 className="text-2xl font-bold mb-1">AI 대결</h2>
            <p className="text-white/50 text-sm">AI 상대를 골라주세요!</p>
          </div>

          <div className="space-y-2 mb-6">
            {(Object.keys(AI_LEVELS) as AiLevel[]).map((key) => {
              const cfg = AI_LEVELS[key];
              return (
                <button
                  key={key}
                  onClick={() => startGame(key)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/15 transition-all text-left"
                >
                  <span className="text-3xl">{cfg.emoji}</span>
                  <div className="flex-1">
                    <div className="font-bold">{cfg.label}</div>
                    <div className="text-xs text-white/50">{cfg.description}</div>
                  </div>
                  <span className="text-white/30">{'>'}</span>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => router.push('/lobby')}
            className="btn btn-secondary w-full"
          >
            ← 로비로
          </button>
        </div>
      </div>
    );
  }

  // ── 게임 종료 화면 ──
  if (phase === 'finished' && result) {
    const cfg = AI_LEVELS[aiLevel];
    const isWin = result === 'win';

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card w-full max-w-md text-center">
          <div className="text-6xl mb-4">{isWin ? '🏆' : '😢'}</div>
          <h2 className={`text-2xl font-bold mb-2 ${isWin ? 'text-yellow-300' : 'text-red-300'}`}>
            {isWin ? 'AI를 이겼어!' : 'AI에게 졌어...'}
          </h2>
          <p className="text-white/60 mb-6">
            {isWin
              ? `${player.name}(이)가 ${cfg.emoji} ${cfg.label}를 이겼어!`
              : `${cfg.emoji} ${cfg.label}가 먼저 손패를 털었어!`}
          </p>

          <div className="space-y-2 mb-6">
            <div className={`flex items-center justify-between px-4 py-3 rounded-xl ${isWin ? 'bg-yellow-400/20' : 'bg-white/5'}`}>
              <div className="flex items-center gap-2">
                <span className="text-xl">{player.avatar_emoji}</span>
                <span className="font-bold">{player.name}</span>
              </div>
              <span className={`font-bold ${isWin ? 'text-green-400' : 'text-red-400'}`}>
                {isWin ? '승리!' : `-${penaltyScore}점`}
              </span>
            </div>
            <div className={`flex items-center justify-between px-4 py-3 rounded-xl ${!isWin ? 'bg-yellow-400/20' : 'bg-white/5'}`}>
              <div className="flex items-center gap-2">
                <span className="text-xl">{cfg.emoji}</span>
                <span className="font-bold">{cfg.label}</span>
              </div>
              <span className={`font-bold ${!isWin ? 'text-green-400' : 'text-white/60'}`}>
                {!isWin ? '승리!' : `남은 ${aiHand.length}장`}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button onClick={() => startGame(aiLevel)} className="btn btn-primary w-full">
              다시 대결! 💪
            </button>
            <button onClick={() => setPhase('select')} className="btn btn-secondary w-full">
              AI 변경
            </button>
            <button
              onClick={() => router.push('/lobby')}
              className="text-white/50 hover:text-white/70 mt-1 text-sm"
            >
              ← 로비로
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── 게임 플레이 화면 ──
  const cfg = AI_LEVELS[aiLevel];

  return (
    <div className="min-h-screen flex flex-col p-3 gap-3">
      {/* 상단: 플레이어/AI 정보 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border border-white/20 ${
              isMyTurn ? 'bg-yellow-400/20 ring-2 ring-yellow-400' : 'bg-white/5'
            }`}
          >
            <span className="text-2xl">{player.avatar_emoji}</span>
            <div className="text-sm">
              <div className="font-bold text-yellow-300">
                {player.name} (나)
              </div>
              <div className="text-white/40 text-xs">
                {localHand.length}장{playerMelded && ' ✓'}
              </div>
            </div>
            {isMyTurn && (
              <span className="text-xs bg-yellow-400/30 text-yellow-200 px-2 py-0.5 rounded-full">턴</span>
            )}
          </div>

          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-xl ${
              !isMyTurn ? 'bg-pink-400/20 ring-2 ring-pink-400' : 'bg-white/5'
            }`}
          >
            <span className="text-2xl">{cfg.emoji}</span>
            <div className="text-sm">
              <div className="font-bold">{cfg.label}</div>
              <div className="text-white/40 text-xs">
                {aiHand.length}장{aiMelded && ' ✓'}
              </div>
            </div>
            {!isMyTurn && (
              <span className="text-xs bg-pink-400/30 text-pink-200 px-2 py-0.5 rounded-full">
                {aiThinking ? '생각 중...' : '턴'}
              </span>
            )}
          </div>
        </div>

        <div className="text-sm text-white/40">남은 타일: {pool.length}장</div>
      </div>

      {/* AI 최근 행동 */}
      {aiLastAction && (
        <div className="text-xs text-pink-200 bg-pink-400/10 rounded-lg px-3 py-1.5 self-start">
          {cfg.emoji} {aiLastAction}
        </div>
      )}

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
        <div className="flex items-center gap-3 flex-wrap">
          {isMyTurn ? (
            <>
              {!hasBoardChanged && (
                <button
                  onClick={handleDraw}
                  disabled={pool.length === 0}
                  className="btn btn-secondary"
                >
                  🎴 뽑기 ({pool.length})
                </button>
              )}
              {hasBoardChanged && (
                <button onClick={handleUndo} className="btn btn-danger">
                  ↩ 되돌리기
                </button>
              )}
              <button
                onClick={handleEndTurn}
                disabled={!canEndTurn}
                className="btn btn-primary"
              >
                ✅ 턴 종료
              </button>
            </>
          ) : (
            <div className="text-white/50 text-sm">
              {aiThinking ? `${cfg.emoji} ${cfg.label}가 생각 중...` : '상대 턴'}
            </div>
          )}

          <button
            onClick={() => setPhase('select')}
            className="text-white/40 hover:text-white/60 text-sm ml-auto"
          >
            항복하고 나가기
          </button>

          {message && (
            <div className="text-yellow-300 text-sm font-medium bg-yellow-400/10 px-3 py-1.5 rounded-lg">
              {message}
            </div>
          )}
        </div>

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
