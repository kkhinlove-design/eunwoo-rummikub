'use client';

import { Tile as TileType, COLOR_DISPLAY, JOKER_COLOR } from '@/types/game';

interface TileProps {
  tile: TileType;
  selected?: boolean;
  draggable?: boolean;
  onClick?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}

export default function Tile({
  tile,
  selected = false,
  draggable = false,
  onClick,
  onDragStart,
  onDragEnd,
}: TileProps) {
  const color = tile.isJoker
    ? JOKER_COLOR
    : COLOR_DISPLAY[tile.color as keyof typeof COLOR_DISPLAY]?.hex || '#333';

  return (
    <div
      className={`tile ${selected ? 'selected' : ''}`}
      style={{ color }}
      draggable={draggable}
      onClick={onClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      data-tile-id={tile.id}
    >
      {tile.isJoker ? (
        <span className="text-3xl leading-none">🃏</span>
      ) : (
        <span>{tile.number}</span>
      )}
    </div>
  );
}
