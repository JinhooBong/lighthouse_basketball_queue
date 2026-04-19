import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useCourt } from '../hooks/useCourt'
import { useQueue } from '../hooks/useQueue'
import type { CourtPlayer } from '../hooks/useCourt'

// ─── Score controls ──────────────────────────────────────────────────────────

function ScoreControl({
  label,
  score,
  accent,
  onIncrement,
  onDecrement,
  disabled,
}: {
  label: string
  score: number
  accent: string
  onIncrement: () => void
  onDecrement: () => void
  disabled: boolean
}) {
  return (
    <div className="flex-1 flex flex-col items-center gap-2">
      <span className={`text-xs font-bold uppercase tracking-widest ${accent}`}>{label}</span>
      <span className={`text-6xl font-black tabular-nums leading-none ${accent}`}>{score}</span>
      <div className="flex gap-2 mt-1">
        <button
          onClick={onDecrement}
          disabled={disabled || score === 0}
          className="w-10 h-10 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed font-bold text-lg transition-colors"
        >
          −
        </button>
        <button
          onClick={onIncrement}
          disabled={disabled}
          className="w-10 h-10 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed font-bold text-lg transition-colors"
        >
          +
        </button>
      </div>
    </div>
  )
}

// ─── Team roster ─────────────────────────────────────────────────────────────

function TeamRoster({
  label,
  players,
  games,
  accent,
}: {
  label: string
  players: CourtPlayer[]
  games: number
  accent: string
}) {
  return (
    <div className="flex-1">
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-xs font-bold uppercase tracking-wider ${accent}`}>{label}</span>
        <span className="text-xs text-gray-500">Game {games || 1}</span>
      </div>
      <ul className="space-y-1">
        {players.length === 0 ? (
          <li className="text-gray-600 text-sm">Empty</li>
        ) : (
          players.map(p => (
            <li key={p.id} className="text-sm text-white truncate">
              {p.name}
            </li>
          ))
        )}
      </ul>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Admin() {
  const { court, teamA, teamB, loading: courtLoading, refetch: refetchCourt } = useCourt()
  const { queue, loading: queueLoading, refetch: refetchQueue } = useQueue()

  const [busy, setBusy] = useState(false)
  const [endGameOverride, setEndGameOverride] = useState<'team_a' | 'team_b' | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false)

  // ── Score helpers ──────────────────────────────────────────────────────────

  const adjustScore = async (team: 'team_a' | 'team_b', delta: number) => {
    if (!court) return
    const field = team === 'team_a' ? 'team_a_score' : 'team_b_score'
    const current = team === 'team_a' ? court.team_a_score : court.team_b_score
    const next = Math.max(0, current + delta)
    await supabase.from('court').update({ [field]: next }).eq('id', 1)
    refetchCourt()
  }

  // ── Start game ─────────────────────────────────────────────────────────────

  const handleStartGame = async () => {
    setBusy(true)
    try {
      await supabase.from('court').update({ game_active: true }).eq('id', 1)
      await refetchCourt()
    } finally {
      setBusy(false)
    }
  }

  // ── End game ───────────────────────────────────────────────────────────────

  const handleEndGame = async () => {
    if (!court) return
    setBusy(true)
    setConfirmEnd(false)

    try {
      // 1. Determine winner
      const winner: 'team_a' | 'team_b' =
        endGameOverride ??
        (court.team_a_score >= court.team_b_score ? 'team_a' : 'team_b')
      const loser: 'team_a' | 'team_b' = winner === 'team_a' ? 'team_b' : 'team_a'

      const winnerIds = winner === 'team_a' ? court.team_a : court.team_b
      const loserIds = loser === 'team_a' ? court.team_a : court.team_b
      const winnerGames = winner === 'team_a' ? court.team_a_games : court.team_b_games

      // 2. Save game history
      await supabase.from('games').insert({
        team_a: court.team_a,
        team_b: court.team_b,
        team_a_score: court.team_a_score,
        team_b_score: court.team_b_score,
        winner,
      })

      // 3. Mark all loser players as has_played=true
      if (loserIds.length > 0) {
        await supabase
          .from('players')
          .update({ has_played: true })
          .in('id', loserIds)
      }

      // 4. Get current max queue position for appending
      const { data: qData } = await supabase
        .from('queue')
        .select('position')
        .order('position', { ascending: false })
        .limit(1)
      let maxPos = qData?.[0]?.position ?? 0

      // 5. Send loser players to back of queue
      for (const pid of loserIds) {
        maxPos += 1
        await supabase.from('queue').insert({ player_id: pid, position: maxPos, is_new: false })
      }

      // 6. Determine if winner must leave (games === 2)
      const winnerLeaves = winnerGames >= 2

      if (winnerLeaves) {
        // Mark winner players has_played, send to back of queue
        if (winnerIds.length > 0) {
          await supabase
            .from('players')
            .update({ has_played: true })
            .in('id', winnerIds)
        }
        for (const pid of winnerIds) {
          maxPos += 1
          await supabase.from('queue').insert({ player_id: pid, position: maxPos, is_new: false })
        }
      }

      // 7. Pull next 5 from queue to form challenger team
      // Re-fetch fresh queue state after insertions
      const { data: freshQueue } = await supabase
        .from('queue')
        .select('id, player_id, position')
        .order('position', { ascending: true })
        .limit(5)

      const challengerIds = (freshQueue ?? []).map((e: { player_id: string }) => e.player_id)
      const challengerQueueIds = (freshQueue ?? []).map((e: { id: string }) => e.id)

      // Remove challenger players from queue
      if (challengerQueueIds.length > 0) {
        await supabase.from('queue').delete().in('id', challengerQueueIds)
      }

      // 8. Update court
      if (winnerLeaves) {
        // Both teams leave — winner was team that just finished game 2
        // New game: challenger vs fresh team from queue (pull another 5)
        const { data: secondQueue } = await supabase
          .from('queue')
          .select('id, player_id, position')
          .order('position', { ascending: true })
          .limit(5)

        const secondIds = (secondQueue ?? []).map((e: { player_id: string }) => e.player_id)
        const secondQueueIds = (secondQueue ?? []).map((e: { id: string }) => e.id)

        if (secondQueueIds.length > 0) {
          await supabase.from('queue').delete().in('id', secondQueueIds)
        }

        await supabase.from('court').update({
          team_a: challengerIds,
          team_b: secondIds,
          team_a_games: 1,
          team_b_games: 1,
          team_a_score: 0,
          team_b_score: 0,
          game_active: false,
        }).eq('id', 1)
      } else {
        // Winner stays, challenger becomes the other team
        const stayingIsA = winner === 'team_a'
        await supabase.from('court').update({
          team_a: stayingIsA ? winnerIds : challengerIds,
          team_b: stayingIsA ? challengerIds : winnerIds,
          team_a_games: stayingIsA ? winnerGames + 1 : 1,
          team_b_games: stayingIsA ? 1 : winnerGames + 1,
          team_a_score: 0,
          team_b_score: 0,
          game_active: false,
        }).eq('id', 1)
      }

      // 9. Renumber queue positions to stay contiguous
      const { data: remaining } = await supabase
        .from('queue')
        .select('id')
        .order('position', { ascending: true })
      if (remaining && remaining.length > 0) {
        await Promise.all(
          remaining.map((e: { id: string }, idx: number) =>
            supabase.from('queue').update({ position: idx + 1 }).eq('id', e.id)
          )
        )
      }

      setEndGameOverride(null)
      await Promise.all([refetchCourt(), refetchQueue()])
    } finally {
      setBusy(false)
    }
  }

  // ── Queue management ───────────────────────────────────────────────────────

  const handleRemoveFromQueue = async (entryId: string) => {
    await supabase.from('queue').delete().eq('id', entryId)
    // Renumber
    const { data: remaining } = await supabase
      .from('queue')
      .select('id')
      .order('position', { ascending: true })
    if (remaining && remaining.length > 0) {
      await Promise.all(
        remaining.map((e: { id: string }, idx: number) =>
          supabase.from('queue').update({ position: idx + 1 }).eq('id', e.id)
        )
      )
    }
    await refetchQueue()
  }

  const handleMove = async (entryId: string, direction: 'up' | 'down') => {
    const idx = queue.findIndex(e => e.id === entryId)
    if (idx === -1) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= queue.length) return

    const a = queue[idx]
    const b = queue[swapIdx]

    await Promise.all([
      supabase.from('queue').update({ position: b.position }).eq('id', a.id),
      supabase.from('queue').update({ position: a.position }).eq('id', b.id),
    ])
    await refetchQueue()
  }

  // ─────────────────────────────────────────────────────────────────────────

  if (courtLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <p className="text-gray-500">Loading…</p>
      </div>
    )
  }

  const scoresByA = (court?.team_a_score ?? 0) >= (court?.team_b_score ?? 0)
  const autoWinner: 'team_a' | 'team_b' = scoresByA ? 'team_a' : 'team_b'
  const displayWinner = endGameOverride ?? autoWinner

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-2xl mx-auto p-4 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between pt-2">
          <h1 className="text-xl font-bold">Admin</h1>
          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
            court?.game_active
              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
              : 'bg-gray-800 text-gray-500 border border-gray-700'
          }`}>
            {court?.game_active ? 'Game active' : 'No game'}
          </span>
        </div>

        {/* ── Court panel ── */}
        <section className="bg-gray-800 rounded-2xl p-4 space-y-4">

          {/* Team rosters */}
          <div className="flex gap-4">
            <TeamRoster
              label="Team A"
              players={teamA}
              games={court?.team_a_games ?? 0}
              accent="text-orange-400"
            />
            <div className="w-px bg-gray-700 self-stretch" />
            <TeamRoster
              label="Team B"
              players={teamB}
              games={court?.team_b_games ?? 0}
              accent="text-blue-400"
            />
          </div>

          {/* Score controls */}
          <div className="border-t border-gray-700 pt-4 flex items-start gap-4">
            <ScoreControl
              label="Team A"
              score={court?.team_a_score ?? 0}
              accent="text-orange-400"
              onIncrement={() => adjustScore('team_a', 1)}
              onDecrement={() => adjustScore('team_a', -1)}
              disabled={busy}
            />
            <div className="flex flex-col items-center justify-center pt-4 shrink-0">
              <span className="text-2xl font-black text-gray-700">:</span>
            </div>
            <ScoreControl
              label="Team B"
              score={court?.team_b_score ?? 0}
              accent="text-blue-400"
              onIncrement={() => adjustScore('team_b', 1)}
              onDecrement={() => adjustScore('team_b', -1)}
              disabled={busy}
            />
          </div>

          {/* Game controls */}
          <div className="border-t border-gray-700 pt-4 space-y-3">
            {!court?.game_active ? (
              <button
                onClick={handleStartGame}
                disabled={busy}
                className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-40 font-bold transition-colors"
              >
                Start Game
              </button>
            ) : (
              <>
                {!confirmEnd ? (
                  <button
                    onClick={() => setConfirmEnd(true)}
                    disabled={busy}
                    className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-40 font-bold transition-colors"
                  >
                    End Game
                  </button>
                ) : (
                  <div className="bg-gray-900 rounded-xl p-4 space-y-3">
                    <p className="text-sm font-semibold text-center text-gray-300">
                      Confirm winner before ending
                    </p>

                    {/* Winner override */}
                    <div className="flex gap-2">
                      {(['team_a', 'team_b'] as const).map(t => {
                        const isSelected = displayWinner === t
                        const isAuto = endGameOverride === null && autoWinner === t
                        return (
                          <button
                            key={t}
                            onClick={() =>
                              setEndGameOverride(endGameOverride === t ? null : t)
                            }
                            className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                              isSelected
                                ? t === 'team_a'
                                  ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                                  : 'bg-blue-500/20 border-blue-500 text-blue-300'
                                : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                            }`}
                          >
                            {t === 'team_a' ? 'Team A' : 'Team B'} wins
                            {isAuto && !endGameOverride && (
                              <span className="ml-1 text-xs opacity-60">(auto)</span>
                            )}
                          </button>
                        )
                      })}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => { setConfirmEnd(false); setEndGameOverride(null) }}
                        className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-semibold transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleEndGame}
                        disabled={busy}
                        className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 text-sm font-bold transition-colors"
                      >
                        {busy ? 'Processing…' : 'Confirm End'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* ── Queue panel ── */}
        <section className="bg-gray-800 rounded-2xl p-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
            Queue — {queue.length} players
          </h2>

          {queueLoading ? (
            <p className="text-gray-600 text-sm text-center py-6">Loading…</p>
          ) : queue.length === 0 ? (
            <p className="text-gray-600 text-sm text-center py-6">Queue is empty</p>
          ) : (
            <ul className="space-y-1.5">
              {queue.map((entry, idx) => {
                const teamDivider = idx > 0 && idx % 5 === 0
                return (
                  <li key={entry.id}>
                    {teamDivider && (
                      <div className="flex items-center gap-2 my-2">
                        <div className="flex-1 border-t border-gray-700" />
                        <span className="text-xs text-gray-600">next team</span>
                        <div className="flex-1 border-t border-gray-700" />
                      </div>
                    )}
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-900">
                      <span className="text-gray-600 text-xs w-5 text-right tabular-nums shrink-0">
                        {entry.position}
                      </span>
                      <span className="flex-1 text-sm text-white font-medium truncate">
                        {entry.player?.name ?? '—'}
                      </span>
                      {entry.is_new && (
                        <span className="text-xs bg-blue-500/15 text-blue-400 border border-blue-500/25 px-1.5 py-0.5 rounded-full shrink-0">
                          New
                        </span>
                      )}
                      {/* Move buttons */}
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => handleMove(entry.id, 'up')}
                          disabled={idx === 0}
                          className="w-6 h-6 flex items-center justify-center rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-20 text-xs transition-colors"
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => handleMove(entry.id, 'down')}
                          disabled={idx === queue.length - 1}
                          className="w-6 h-6 flex items-center justify-center rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-20 text-xs transition-colors"
                          title="Move down"
                        >
                          ↓
                        </button>
                      </div>
                      {/* Remove */}
                      <button
                        onClick={() => handleRemoveFromQueue(entry.id)}
                        className="w-6 h-6 flex items-center justify-center rounded bg-red-900/50 hover:bg-red-700 text-red-400 hover:text-white text-xs transition-colors shrink-0"
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
