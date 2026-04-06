'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { AVATAR_EMOJIS } from '@/types/game';

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('😊');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [existingPlayers, setExistingPlayers] = useState<any[]>([]);

  // 기존 플레이어 정보 복원
  useEffect(() => {
    const saved = localStorage.getItem('rummikub_player');
    if (saved) {
      const player = JSON.parse(saved);
      setName(player.name || '');
      setEmoji(player.avatar_emoji || '😊');
    }
  }, []);

  // 공유 players 테이블에서 기존 플레이어 목록 불러오기
  useEffect(() => {
    const fetchPlayers = async () => {
      const { data } = await supabase
        .from('players')
        .select('*')
        .order('created_at', { ascending: false });
      if (data) setExistingPlayers(data);
    };
    fetchPlayers();
  }, []);

  // 기존 플레이어 바로 접속
  const handleQuickLogin = async (player: any) => {
    setLoading(true);
    localStorage.setItem('rummikub_player', JSON.stringify(player));
    router.push('/lobby');
  };

  const handleStart = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('이름을 입력해주세요!');
      return;
    }
    if (trimmed.length > 8) {
      setError('이름은 8자 이내로 입력해주세요!');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 기존 플레이어 조회 또는 생성
      const { data: existing } = await supabase
        .from('players')
        .select('*')
        .eq('name', trimmed)
        .single();

      let player;
      if (existing) {
        // 이모지 업데이트
        const { data } = await supabase
          .from('players')
          .update({ avatar_emoji: emoji })
          .eq('id', existing.id)
          .select()
          .single();
        player = data;
      } else {
        const { data, error: insertErr } = await supabase
          .from('players')
          .insert({ name: trimmed, avatar_emoji: emoji })
          .select()
          .single();
        if (insertErr) throw insertErr;
        player = data;
      }

      localStorage.setItem('rummikub_player', JSON.stringify(player));
      router.push('/lobby');
    } catch (err: any) {
      setError(err.message || '오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-start py-8 px-4 gap-0">
      <div className="card w-full max-w-md text-center">
        {/* 로고 */}
        <div className="mb-6">
          <div className="text-6xl mb-3">🎲</div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            은우의 루미큐브
          </h1>
          <p className="text-white/60 mt-1 text-sm">친구들과 함께하는 온라인 루미큐브</p>
        </div>

        {/* 캐릭터 선택 */}
        <div className="mb-6">
          <p className="text-sm text-white/70 mb-3">캐릭터를 골라주세요</p>
          <div className="grid grid-cols-6 gap-2 max-w-xs mx-auto">
            {AVATAR_EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => setEmoji(e)}
                className={`text-3xl p-2 rounded-xl transition-all ${
                  emoji === e
                    ? 'bg-white/20 scale-110 ring-2 ring-yellow-400'
                    : 'hover:bg-white/10'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* 선택된 캐릭터 미리보기 */}
        <div className="text-5xl mb-4">{emoji}</div>

        {/* 이름 입력 */}
        <div className="mb-4">
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleStart()}
            placeholder="닉네임을 입력하세요"
            maxLength={8}
            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white text-center text-lg placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-yellow-400/50"
          />
        </div>

        {error && (
          <p className="text-red-400 text-sm mb-3">{error}</p>
        )}

        {/* 시작 버튼 */}
        <button
          onClick={handleStart}
          disabled={loading || !name.trim()}
          className="btn btn-primary w-full text-lg py-3"
        >
          {loading ? '접속 중...' : '새로 시작하기!'}
        </button>

        {/* 전적 표시 (저장된 플레이어가 있을 때) */}
        <PlayerStats />
      </div>

      {/* 등록된 친구들 */}
      {existingPlayers.length > 0 && (
        <div className="card w-full max-w-md mt-6">
          <h2 className="text-xl font-bold text-center mb-1">
            등록된 친구들 ({existingPlayers.length}명)
          </h2>
          <p className="text-sm text-white/50 text-center mb-4">
            이름을 눌러서 바로 접속해요!
          </p>
          <div className="space-y-3">
            {existingPlayers.map((p) => (
              <button
                key={p.id}
                onClick={() => handleQuickLogin(p)}
                disabled={loading}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/15 transition-all text-left"
              >
                <span className="text-3xl">{p.avatar_emoji || '😊'}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-white">{p.name}</div>
                  <div className="text-xs text-white/50">
                    {(p.rummikub_games_played || 0) > 0
                      ? `${p.rummikub_games_played}게임 · ${p.rummikub_games_won || 0}승`
                      : '첫 게임 도전!'}
                  </div>
                </div>
                <span className="text-white/30 text-sm">{'>'}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerStats() {
  const [stats, setStats] = useState<{ games_played: number; games_won: number } | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('rummikub_player');
    if (saved) {
      const player = JSON.parse(saved);
      setStats({ games_played: player.rummikub_games_played || 0, games_won: player.rummikub_games_won || 0 });
    }
  }, []);

  if (!stats || stats.games_played === 0) return null;

  return (
    <div className="mt-4 text-sm text-white/50">
      전적: {stats.games_won}승 / {stats.games_played}전
    </div>
  );
}
