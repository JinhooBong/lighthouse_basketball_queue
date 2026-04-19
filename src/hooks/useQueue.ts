import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { QueueEntry } from '../types'

export function useQueue() {
  const [queue, setQueue] = useState<QueueEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchQueue = useCallback(async () => {
    const { data, error } = await supabase
      .from('queue')
      .select('*, player:players(id, name, member, insured, has_played, created_at)')
      .order('position', { ascending: true })

    if (!error && data) {
      setQueue(data as QueueEntry[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const initQueue = async () => {
      // Reset queue if oldest entry is from a previous calendar day
      const { data: oldest } = await supabase
        .from('queue').select('created_at').order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (oldest) {
        const entryDate = new Date(oldest.created_at).toLocaleDateString()
        const today = new Date().toLocaleDateString()
        if (entryDate !== today) {
          await supabase.from('queue').delete().neq('id', '00000000-0000-0000-0000-000000000000')
          await supabase.from('court').update({
            team_a: [], team_b: [],
            team_a_score: 0, team_b_score: 0,
            team_a_games: 0, team_b_games: 0,
            game_active: false,
          }).eq('id', 1)
        }
      }
      fetchQueue()
    }

    initQueue()

    const channel = supabase
      .channel('queue-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue' }, () => {
        fetchQueue()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchQueue])

  return { queue, loading, refetch: fetchQueue }
}
