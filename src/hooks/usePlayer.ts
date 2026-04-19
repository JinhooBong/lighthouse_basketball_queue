import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { LocalPlayer } from '../types'

const STORAGE_KEY = 'basketball_player'

function loadFromStorage(): LocalPlayer | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as LocalPlayer) : null
  } catch {
    return null
  }
}

export function usePlayer() {
  const [player, setPlayerState] = useState<LocalPlayer | null>(loadFromStorage)

  const setPlayer = useCallback(async (name: string, member = false, insured = false): Promise<LocalPlayer | null> => {
    const { data, error } = await supabase
      .from('players')
      .insert({ name, member, insured, has_played: false })
      .select('id, name')
      .single()

    if (error || !data) return null

    const localPlayer: LocalPlayer = { playerId: data.id, playerName: data.name }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(localPlayer))
    setPlayerState(localPlayer)
    return localPlayer
  }, [])

  const clearPlayer = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setPlayerState(null)
  }, [])

  return { player, setPlayer, clearPlayer }
}
