'use client';

import { AVATAR_EMOJIS } from '@/types/game';

interface CharacterSelectProps {
  selected: string;
  onSelect: (emoji: string) => void;
}

export default function CharacterSelect({ selected, onSelect }: CharacterSelectProps) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {AVATAR_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => onSelect(emoji)}
          className={`text-3xl p-2 rounded-xl transition-all ${
            selected === emoji
              ? 'bg-white/20 scale-110 ring-2 ring-yellow-400'
              : 'hover:bg-white/10'
          }`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
