'use client';

import { Tile as TileType } from '@/types/game';
import { isValidSet } from '@/lib/game-logic';
import Tile from './Tile';

interface MeldSetProps {
  tiles: TileType[];
  setIdx: number;
  selectedTileId: number | null;
  isMyTurn: boolean;
  onTileClick: (tile: TileType, setIdx: number) => void;
  onDrop: (setIdx: number, position?: number) => void;
  onDragStart: (tile: TileType, setIdx: number) => void;
}

export default function MeldSet({
  tiles,
  setIdx,
  selectedTileId,
  isMyTurn,
  onTileClick,
  onDrop,
  onDragStart,
}: MeldSetProps) {
  const valid = isValidSet(tiles);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    onDrop(setIdx);
  };

  return (
    <div
      className={`meld-set ${valid ? 'valid' : 'invalid'}`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={(e) => {
        // 빈 영역 클릭 시 세트 끝에 삽입
        if ((e.target as HTMLElement).classList.contains('meld-set') && isMyTurn) {
          onDrop(setIdx);
        }
      }}
    >
      {tiles.map((tile) => (
        <Tile
          key={tile.id}
          tile={tile}
          selected={selectedTileId === tile.id}
          draggable={isMyTurn}
          onClick={() => isMyTurn && onTileClick(tile, setIdx)}
          onDragStart={() => onDragStart(tile, setIdx)}
        />
      ))}
    </div>
  );
}
