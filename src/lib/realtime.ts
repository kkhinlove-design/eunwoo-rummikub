/**
 * 은우 루미큐브 - Supabase Realtime 훅
 * 게임 상태 실시간 동기화를 위한 React hooks.
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';
import { Room, RoomPlayer } from '@/types/game';

/**
 * 방 상태 실시간 구독
 */
export function useRoomRealtime(roomId: string | null) {
  const [room, setRoom] = useState<Room | null>(null);

  useEffect(() => {
    if (!roomId) return;

    // 초기 로드
    supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single()
      .then(({ data }) => { if (data) setRoom(data as Room); });

    // 실시간 구독
    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          if (payload.new) setRoom(payload.new as Room);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  return room;
}

/**
 * 방 참가자 목록 실시간 구독
 */
export function useRoomPlayersRealtime(roomId: string | null) {
  const [players, setPlayers] = useState<RoomPlayer[]>([]);

  const fetchPlayers = useCallback(async () => {
    if (!roomId) return;
    const { data } = await supabase
      .from('room_players')
      .select('*, player:players(*)')
      .eq('room_id', roomId)
      .order('seat_order');
    if (data) setPlayers(data as RoomPlayer[]);
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;

    fetchPlayers();

    const channel = supabase
      .channel(`room_players:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_players',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          // 변경 시 전체 재조회 (join 데이터 포함)
          fetchPlayers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, fetchPlayers]);

  return players;
}

/**
 * 내 손패 실시간 구독
 * (다른 플레이어에게는 보이지 않아야 하므로 별도 구독)
 */
export function useMyHandRealtime(roomId: string | null, playerId: string | null) {
  const [hand, setHand] = useState<any[]>([]);

  useEffect(() => {
    if (!roomId || !playerId) return;

    // 초기 로드
    supabase
      .from('room_players')
      .select('hand')
      .eq('room_id', roomId)
      .eq('player_id', playerId)
      .single()
      .then(({ data }) => {
        if (data?.hand) setHand(data.hand);
      });

    // 실시간 구독
    const channel = supabase
      .channel(`my_hand:${roomId}:${playerId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'room_players',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const updated = payload.new as RoomPlayer;
          if (updated.player_id === playerId && updated.hand) {
            setHand(updated.hand);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, playerId]);

  return hand;
}
