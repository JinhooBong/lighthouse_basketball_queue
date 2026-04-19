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
    fetchQueue()

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
