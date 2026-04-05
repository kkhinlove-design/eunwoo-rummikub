'use client';

interface GameControlsProps {
  isMyTurn: boolean;
  canEndTurn: boolean;
  hasBoardChanged: boolean;
  poolCount: number;
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
  onDraw,
  onUndo,
  onEndTurn,
  loading,
  message,
}: GameControlsProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {isMyTurn ? (
        <>
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
