'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { generateRoomCode } from '@/lib/tile-utils';
import { Player, Room, RoomPlayer } from '@/types/game';

export default function LobbyPage() {
  const router = useRouter();
  const [player, setPlayer] = useState<Player | null>(null);
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [joinCode, setJoinCode] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [turnTimer, setTurnTimer] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 대기방 상태
  const [waitingRoom, setWaitingRoom] = useState<Room | null>(null);
  const [waitingPlayers, setWaitingPlayers] = useState<RoomPlayer[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('rummikub_player');
    if (!saved) {
      router.push('/');
      return;
    }
    setPlayer(JSON.parse(saved));
  }, [router]);

  // 대기방 실시간 구독
  useEffect(() => {
    if (!waitingRoom) return;

    const roomChannel = supabase
      .channel(`lobby_room:${waitingRoom.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'rummikub_rooms',
        filter: `id=eq.${waitingRoom.id}`,
      }, (payload) => {
        const updated = payload.new as Room;
        setWaitingRoom(updated);
        // 게임 시작됨!
        if (updated.status === 'playing') {
          router.push(`/game/${updated.id}`);
        }
      })
      .subscribe();

    const playersChannel = supabase
      .channel(`lobby_players:${waitingRoom.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'rummikub_room_players',
        filter: `room_id=eq.${waitingRoom.id}`,
      }, () => {
        fetchWaitingPlayers(waitingRoom.id);
      })
      .subscribe();

    fetchWaitingPlayers(waitingRoom.id);

    return () => {
      supabase.removeChannel(roomChannel);
      supabase.removeChannel(playersChannel);
    };
  }, [waitingRoom?.id, router]);

  async function fetchWaitingPlayers(roomId: string) {
    const { data } = await supabase
      .from('rummikub_room_players')
      .select('*, player:players(*)')
      .eq('room_id', roomId)
      .order('seat_order');
    if (data) setWaitingPlayers(data as RoomPlayer[]);
  }

  // 방 생성
  async function handleCreate() {
    if (!player) return;
    setLoading(true);
    setError('');

    try {
      const code = generateRoomCode();
      const { data: room, error: roomErr } = await supabase
        .from('rummikub_rooms')
        .insert({
          code,
          host_id: player.id,
          max_players: maxPlayers,
          turn_timer: turnTimer,
          status: 'waiting',
        })
        .select()
        .single();
      if (roomErr) throw roomErr;

      // 방장 참가
      const { error: joinErr } = await supabase
        .from('rummikub_room_players')
        .insert({
          room_id: room.id,
          player_id: player.id,
          seat_order: 0,
        });
      if (joinErr) throw joinErr;

      setWaitingRoom(room as Room);
    } catch (err: any) {
      setError(err.message || '방 생성에 실패했습니다');
    } finally {
      setLoading(false);
    }
  }

  // 방 참가
  async function handleJoin() {
    if (!player) return;
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 4) {
      setError('4자리 코드를 입력해주세요');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data: room, error: roomErr } = await supabase
        .from('rummikub_rooms')
        .select('*')
        .eq('code', code)
        .eq('status', 'waiting')
        .single();
      if (roomErr || !room) {
        setError('방을 찾을 수 없습니다');
        setLoading(false);
        return;
      }

      // 인원 확인
      const { count } = await supabase
        .from('rummikub_room_players')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', room.id);

      if ((count || 0) >= room.max_players) {
        setError('방이 가득 찼습니다');
        setLoading(false);
        return;
      }

      // 이미 참가했는지 확인
      const { data: existing } = await supabase
        .from('rummikub_room_players')
        .select('id')
        .eq('room_id', room.id)
        .eq('player_id', player.id)
        .single();

      if (!existing) {
        const { error: joinErr } = await supabase
          .from('rummikub_room_players')
          .insert({
            room_id: room.id,
            player_id: player.id,
            seat_order: count || 0,
          });
        if (joinErr) throw joinErr;
      }

      setWaitingRoom(room as Room);
    } catch (err: any) {
      setError(err.message || '참가에 실패했습니다');
    } finally {
      setLoading(false);
    }
  }

  // 게임 시작 (방장만)
  async function handleStartGame() {
    if (!waitingRoom || !player) return;
    if (waitingRoom.host_id !== player.id) return;
    if (waitingPlayers.length < 2) {
      setError('최소 2명이 필요합니다');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 타일 배분은 게임 페이지에서 처리 (방장 클라이언트)
      const turnOrder = waitingPlayers.map(rp => rp.player_id);

      const { error: updateErr } = await supabase
        .from('rummikub_rooms')
        .update({
          status: 'playing',
          current_turn: turnOrder[0],
          turn_order: turnOrder,
          started_at: new Date().toISOString(),
        })
        .eq('id', waitingRoom.id);
      if (updateErr) throw updateErr;

      router.push(`/game/${waitingRoom.id}`);
    } catch (err: any) {
      setError(err.message || '게임 시작에 실패했습니다');
    } finally {
      setLoading(false);
    }
  }

  // 대기방 나가기
  async function handleLeave() {
    if (!waitingRoom || !player) return;
    await supabase
      .from('rummikub_room_players')
      .delete()
      .eq('room_id', waitingRoom.id)
      .eq('player_id', player.id);
    setWaitingRoom(null);
    setWaitingPlayers([]);
  }

  if (!player) return null;

  // 대기방 화면
  if (waitingRoom) {
    const isHost = waitingRoom.host_id === player.id;
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card w-full max-w-lg">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold mb-2">대기실</h2>
            <div className="bg-white/10 rounded-xl px-6 py-3 inline-block">
              <span className="text-white/50 text-sm">방 코드</span>
              <div className="text-3xl font-mono font-bold tracking-widest text-yellow-300">
                {waitingRoom.code}
              </div>
            </div>
            <p className="text-white/50 text-sm mt-2">
              친구에게 이 코드를 알려주세요!
            </p>
          </div>

          {/* 참가자 목록 */}
          <div className="space-y-2 mb-6">
            <p className="text-sm text-white/60">
              참가자 ({waitingPlayers.length}/{waitingRoom.max_players})
            </p>
            {waitingPlayers.map((rp) => (
              <div
                key={rp.id}
                className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3"
              >
                <span className="text-2xl">{rp.player?.avatar_emoji || '😊'}</span>
                <span className="font-medium">{rp.player?.name || '???'}</span>
                {rp.player_id === waitingRoom.host_id && (
                  <span className="text-xs bg-yellow-400/20 text-yellow-300 px-2 py-0.5 rounded-full">
                    방장
                  </span>
                )}
                {rp.player_id === player.id && (
                  <span className="text-xs text-white/40">(나)</span>
                )}
              </div>
            ))}
          </div>

          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

          <div className="flex gap-3">
            <button onClick={handleLeave} className="btn btn-secondary flex-1">
              나가기
            </button>
            {isHost && (
              <button
                onClick={handleStartGame}
                disabled={loading || waitingPlayers.length < 2}
                className="btn btn-primary flex-1"
              >
                {loading ? '시작 중...' : '게임 시작! 🎲'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 로비 메인 화면
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-md">
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-6">
          <span className="text-3xl">{player.avatar_emoji}</span>
          <div>
            <h2 className="text-xl font-bold">{player.name}</h2>
            <button
              onClick={() => router.push('/')}
              className="text-xs text-white/40 hover:text-white/60"
            >
              캐릭터 변경
            </button>
          </div>
        </div>

        {/* AI 대결 바로가기 */}
        <button
          onClick={() => router.push('/play-ai')}
          className="w-full flex items-center gap-3 p-3 mb-4 rounded-xl bg-gradient-to-r from-pink-500/20 to-purple-500/20 hover:from-pink-500/30 hover:to-purple-500/30 transition-all ring-1 ring-pink-400/30"
        >
          <span className="text-3xl">🤖</span>
          <div className="flex-1 text-left">
            <div className="font-bold">AI와 1:1 대결</div>
            <div className="text-xs text-white/60">혼자서도 바로 플레이!</div>
          </div>
          <span className="text-white/40">{'>'}</span>
        </button>

        {/* 탭 */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => { setTab('create'); setError(''); }}
            className={`flex-1 py-2 rounded-xl font-medium transition ${
              tab === 'create' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/70'
            }`}
          >
            방 만들기
          </button>
          <button
            onClick={() => { setTab('join'); setError(''); }}
            className={`flex-1 py-2 rounded-xl font-medium transition ${
              tab === 'join' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/70'
            }`}
          >
            참가하기
          </button>
        </div>

        {tab === 'create' ? (
          <div className="space-y-4">
            {/* 최대 인원 */}
            <div>
              <label className="text-sm text-white/60 block mb-2">최대 인원</label>
              <div className="flex gap-2">
                {[2, 3, 4].map((n) => (
                  <button
                    key={n}
                    onClick={() => setMaxPlayers(n)}
                    className={`flex-1 py-2 rounded-xl transition ${
                      maxPlayers === n
                        ? 'bg-yellow-400/20 text-yellow-300 ring-1 ring-yellow-400'
                        : 'bg-white/5 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    {n}명
                  </button>
                ))}
              </div>
            </div>

            {/* 턴 타이머 */}
            <div>
              <label className="text-sm text-white/60 block mb-2">턴 타이머</label>
              <div className="flex gap-2">
                {[
                  { v: 0, label: '무제한' },
                  { v: 60, label: '60초' },
                  { v: 90, label: '90초' },
                ].map(({ v, label }) => (
                  <button
                    key={v}
                    onClick={() => setTurnTimer(v)}
                    className={`flex-1 py-2 rounded-xl transition ${
                      turnTimer === v
                        ? 'bg-yellow-400/20 text-yellow-300 ring-1 ring-yellow-400'
                        : 'bg-white/5 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              onClick={handleCreate}
              disabled={loading}
              className="btn btn-primary w-full"
            >
              {loading ? '생성 중...' : '방 만들기 🏠'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-sm text-white/60 block mb-2">방 코드</label>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                placeholder="ABCD"
                maxLength={4}
                className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white text-center text-2xl font-mono tracking-widest placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-yellow-400/50"
              />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              onClick={handleJoin}
              disabled={loading || joinCode.trim().length !== 4}
              className="btn btn-primary w-full"
            >
              {loading ? '참가 중...' : '참가하기 🚪'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
