import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Court, Player } from '../types'

export interface CourtPlayer {
  id: string
  name: string
}

export function useCourt() {
  const [court, setCourt] = useState<Court | null>(null)
  const [teamA, setTeamA] = useState<CourtPlayer[]>([])
  const [teamB, setTeamB] = useState<CourtPlayer[]>([])
  const [loading, setLoading] = useState(true)

  const fetchCourt = useCallback(async () => {
    const { data: courtData, error } = await supabase
      .from('court')
      .select('*')
      .eq('id', 1)
      .single()

    if (error || !courtData) {
      setLoading(false)
      return
    }

    setCourt(courtData as Court)

    const allIds = [...(courtData.team_a ?? []), ...(courtData.team_b ?? [])]

    if (allIds.length === 0) {
      setTeamA([])
      setTeamB([])
      setLoading(false)
      return
    }

    const { data: players } = await supabase
      .from('players')
      .select('id, name')
      .in('id', allIds)

    const playerMap = new Map<string, string>(
      (players ?? []).map((p: Pick<Player, 'id' | 'name'>) => [p.id, p.name])
    )

    setTeamA(
      (courtData.team_a ?? []).map((id: string) => ({ id, name: playerMap.get(id) ?? id }))
    )
    setTeamB(
      (courtData.team_b ?? []).map((id: string) => ({ id, name: playerMap.get(id) ?? id }))
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchCourt()

    const channel = supabase
      .channel('court-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'court' }, () => {
        fetchCourt()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchCourt])

  return { court, teamA, teamB, loading, refetch: fetchCourt }
}
