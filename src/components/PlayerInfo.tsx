'use client';

import { RoomPlayer } from '@/types/game';

interface PlayerInfoProps {
  players: RoomPlayer[];
  currentTurn: string | null;
  myPlayerId: string;
}

export default function PlayerInfo({ players, currentTurn, myPlayerId }: PlayerInfoProps) {
  return (
    <div className="flex gap-3 flex-wrap">
      {players.map((rp) => {
        const isCurrentTurn = rp.player_id === currentTurn;
        const isMe = rp.player_id === myPlayerId;
        const player = rp.player;

        return (
          <div
            key={rp.id}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all ${
              isCurrentTurn
                ? 'bg-yellow-400/20 ring-2 ring-yellow-400'
                : 'bg-white/5'
            } ${isMe ? 'border border-white/20' : ''}`}
          >
            <span className="text-2xl">{player?.avatar_emoji || '😊'}</span>
            <div className="text-sm">
              <div className={`font-bold ${isMe ? 'text-yellow-300' : ''}`}>
                {player?.name || '???'}
                {isMe && ' (나)'}
              </div>
              <div className="text-white/40 text-xs">
                {rp.hand?.length || 0}장
                {rp.has_melded && ' ✓'}
              </div>
            </div>
            {isCurrentTurn && (
              <span className="text-xs bg-yellow-400/30 text-yellow-200 px-2 py-0.5 rounded-full ml-1">
                턴
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
