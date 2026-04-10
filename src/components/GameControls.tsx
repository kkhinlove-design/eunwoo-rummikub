'use client';

import { useEffect, useState, useRef } from 'react';

interface GameControlsProps {
  isMyTurn: boolean;
  canEndTurn: boolean;
  hasBoardChanged: boolean;
  poolCount: number;
  turnTimer: number; // 0 = 무제한, 60/90 = 초
  onDraw: () => void;
  onUndo: () => void;
  onEndTurn: () => void;
  loading: boolean;
  message?: string;
}

export default function GameControls({
  isMyTurn,
  canEndTurn,
  hasBoardChanged,
  poolCount,
  turnTimer,
  onDraw,
  onUndo,
  onEndTurn,
  loading,
  message,
}: GameControlsProps) {
  const [timeLeft, setTimeLeft] = useState(turnTimer);
  const hasAutoDrawn = useRef(false);

  // 턴 시작 시 타이머 리셋
  useEffect(() => {
    if (!isMyTurn || turnTimer === 0) {
      setTimeLeft(turnTimer);
      hasAutoDrawn.current = false;
      return;
    }

    setTimeLeft(turnTimer);
    hasAutoDrawn.current = false;

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isMyTurn, turnTimer]);

  // 타이머 만료 시 자동 뽑기
  useEffect(() => {
    if (isMyTurn && turnTimer > 0 && timeLeft === 0 && !hasAutoDrawn.current && !loading) {
      hasAutoDrawn.current = true;
      if (!hasBoardChanged && poolCount > 0) {
        onDraw();
      }
    }
  }, [timeLeft, isMyTurn, turnTimer, hasBoardChanged, poolCount, loading, onDraw]);

  const timerColor = timeLeft <= 10 ? 'text-red-400' : timeLeft <= 20 ? 'text-yellow-300' : 'text-white/60';

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {isMyTurn ? (
        <>
          {/* 턴 타이머 */}
          {turnTimer > 0 && (
            <div className={`text-lg font-mono font-bold ${timerColor}`}>
              ⏱ {timeLeft}초
            </div>
          )}

          {/* 뽑기 버튼: 보드를 변경하지 않았을 때만 */}
          {!hasBoardChanged && (
            <button
              onClick={onDraw}
              disabled={loading || poolCount === 0}
              className="btn btn-secondary"
            >
              🎴 뽑기 ({poolCount})
            </button>
          )}

          {/* 되돌리기: 보드를 변경했을 때 */}
          {hasBoardChanged && (
            <button
              onClick={onUndo}
              disabled={loading}
              className="btn btn-danger"
            >
              ↩ 되돌리기
            </button>
          )}

          {/* 턴 종료 */}
          <button
            onClick={onEndTurn}
            disabled={loading || !canEndTurn}
            className="btn btn-primary"
          >
            {loading ? '처리 중...' : '✅ 턴 종료'}
          </button>
        </>
      ) : (
        <div className="text-white/50 text-sm">
          상대방의 턴을 기다리는 중...
        </div>
      )}

      {message && (
        <div className="text-yellow-300 text-sm font-medium bg-yellow-400/10 px-3 py-1.5 rounded-lg">
          {message}
        </div>
      )}
    </div>
  );
}
