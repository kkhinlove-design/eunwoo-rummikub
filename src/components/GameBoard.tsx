'use client';

import { Tile as TileType } from '@/types/game';
import MeldSet from './MeldSet';

interface GameBoardProps {
  board: TileType[][];
  selectedTileId: number | null;
  isMyTurn: boolean;
  onTileClick: (tile: TileType, setIdx: number) => void;
  onDropToSet: (setIdx: number, position?: number) => void;
  onDropToNewSet: () => void;
  onDragStartFromBoard: (tile: TileType, setIdx: number) => void;
}

export default function GameBoard({
  board,
  selectedTileId,
  isMyTurn,
  onTileClick,
  onDropToSet,
  onDropToNewSet,
  onDragStartFromBoard,
}: GameBoardProps) {
  const handleNewSetDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  return (
    <div className="bg-[var(--board-surface)] rounded-2xl p-4 min-h-[200px]">
      <div className="text-sm text-white/50 mb-3">
        테이블 ({board.length}개 세트)
      </div>

      <div className="flex flex-wrap gap-3 items-start">
        {board.map((set, idx) => (
          <MeldSet
            key={idx}
            tiles={set}
            setIdx={idx}
            selectedTileId={selectedTileId}
            isMyTurn={isMyTurn}
            onTileClick={onTileClick}
            onDrop={onDropToSet}
            onDragStart={onDragStartFromBoard}
          />
        ))}

        {/* 새 세트 드롭 영역 */}
        {isMyTurn && (
          <div
            className="drop-target min-w-[120px] px-4"
            onDragOver={handleNewSetDragOver}
            onDrop={(e) => { e.preventDefault(); onDropToNewSet(); }}
            onClick={onDropToNewSet}
          >
            <span className="text-white/30 text-sm">+ 새 세트</span>
          </div>
        )}
      </div>

      {board.length === 0 && !isMyTurn && (
        <div className="text-white/20 text-center py-8">
          아직 테이블에 세트가 없습니다
        </div>
      )}
    </div>
  );
}
