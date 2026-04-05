'use client';

import { Tile as TileType } from '@/types/game';
import Tile from './Tile';

interface PlayerHandProps {
  hand: TileType[];
  selectedTileId: number | null;
  isMyTurn: boolean;
  onTileClick: (tile: TileType) => void;
  onDragStart: (tile: TileType) => void;
  onSortByNumber: () => void;
  onSortByColor: () => void;
}

export default function PlayerHand({
  hand,
  selectedTileId,
  isMyTurn,
  onTileClick,
  onDragStart,
  onSortByNumber,
  onSortByColor,
}: PlayerHandProps) {
  return (
    <div className="bg-black/30 rounded-2xl p-4">
      {/* 정렬 버튼 */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-white/60">
          내 손패 ({hand.length}장)
        </span>
        <div className="flex gap-2">
          <button
            onClick={onSortByNumber}
            className="text-xs px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 transition"
          >
            숫자순
          </button>
          <button
            onClick={onSortByColor}
            className="text-xs px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 transition"
          >
            색상순
          </button>
        </div>
      </div>

      {/* 타일 목록 */}
      <div className="flex flex-wrap gap-1.5 min-h-[68px]">
        {hand.map((tile) => (
          <Tile
            key={tile.id}
            tile={tile}
            selected={selectedTileId === tile.id}
            draggable={isMyTurn}
            onClick={() => isMyTurn && onTileClick(tile)}
            onDragStart={() => onDragStart(tile)}
          />
        ))}
        {hand.length === 0 && (
          <div className="text-white/30 text-sm flex items-center">
            손패가 비었습니다!
          </div>
        )}
      </div>
    </div>
  );
}
