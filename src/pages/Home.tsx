import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../lib/supabase'
import { useQueue } from '../hooks/useQueue'
import { useCourt } from '../hooks/useCourt'

const GAME_DURATION = 7 * 60

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function ScoreButtons({ team, score, accent }: { team: 'a' | 'b'; score: number; accent: string }) {
  const col = team === 'a' ? 'team_a_score' : 'team_b_score'

  const adjust = async (delta: number) => {
    const next = Math.max(0, score + delta)
    await supabase.from('court').update({ [col]: next }).eq('id', 1)
  }

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <div className="flex gap-1.5 justify-center">
        {[3, 2, 1].map(n => (
          <button key={n} onClick={() => adjust(n)}
            className={`px-3 py-1.5 rounded-lg font-bold text-sm bg-gray-800 hover:bg-gray-700 border border-gray-700 ${accent} transition-colors`}>
            +{n}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5 justify-center">
        {[1, 2].map(n => (
          <button key={n} onClick={() => adjust(-n)}
            className="px-3 py-1.5 rounded-lg font-bold text-sm bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 transition-colors">
            -{n}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Home() {
  const { queue, loading: queueLoading, refetch: refetchQueue } = useQueue()
  const { court, refetch: refetchCourt } = useCourt()

  const [nameInput, setNameInput] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [timerSeconds, setTimerSeconds] = useState(GAME_DURATION)
  const [timerRunning, setTimerRunning] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [showQR, setShowQR] = useState(false)

  const checkInUrl = `${window.location.origin}/checkin`

  const gameActive = court?.game_active ?? false
  const gameHasStarted = gameActive || timerSeconds < GAME_DURATION
  const teamAPlayers = queue.slice(0, 5)
  const teamBPlayers = queue.slice(5, 10)

  useEffect(() => {
    if (!timerRunning) return
    if (timerSeconds <= 0) { setTimerRunning(false); return }
    const id = setInterval(() => {
      setTimerSeconds(s => { if (s <= 1) { setTimerRunning(false); return 0 } return s - 1 })
    }, 1000)
    return () => clearInterval(id)
  }, [timerRunning, timerSeconds])

  // Re-fetch court on any court change (so scores update live)
  useEffect(() => {
    const channel = supabase
      .channel('home-court')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'court' }, () => refetchCourt())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [refetchCourt])

  const handleStart = async () => {
    await supabase.from('court').update({ game_active: true }).eq('id', 1)
    setTimerSeconds(GAME_DURATION)
    setTimerRunning(true)
    refetchCourt()
  }

  const handlePauseResume = () => setTimerRunning(r => !r)

  const handleReset = async () => {
    await supabase.from('court').update({ game_active: false, team_a_score: 0, team_b_score: 0 }).eq('id', 1)
    setTimerSeconds(GAME_DURATION)
    setTimerRunning(false)
    refetchCourt()
  }

  const handleRemove = async (entryId: string) => {
    await supabase.from('queue').delete().eq('id', entryId)
    const { data: remaining } = await supabase.from('queue').select('id').order('position', { ascending: true })
    if (remaining?.length) {
      await Promise.all(remaining.map((e, i) => supabase.from('queue').update({ position: i + 1 }).eq('id', e.id)))
    }
    await refetchQueue()
  }

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDragIdx(idx); e.dataTransfer.effectAllowed = 'move'
  }
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault(); setDragOverIdx(idx)
  }
  const handleDrop = async (dropIdx: number) => {
    if (dragIdx === null || dragIdx === dropIdx) { setDragIdx(null); setDragOverIdx(null); return }
    const reordered = [...queue]
    const [moved] = reordered.splice(dragIdx, 1)
    reordered.splice(dropIdx, 0, moved)
    await Promise.all(reordered.map((entry, i) => supabase.from('queue').update({ position: i + 1 }).eq('id', entry.id)))
    setDragIdx(null); setDragOverIdx(null)
    await refetchQueue()
  }
  const handleDragEnd = () => { setDragIdx(null); setDragOverIdx(null) }

  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = nameInput.trim()
    if (!trimmed) return
    setAdding(true); setError(null)
    try {
      const { data: existing } = await supabase.from('players').select('id, has_played').ilike('name', trimmed).maybeSingle()
      let playerId: string
      let hasPlayed: boolean
      if (existing) {
        playerId = existing.id; hasPlayed = existing.has_played
      } else {
        const { data: created, error: createErr } = await supabase
          .from('players').insert({ name: trimmed, member: false, insured: false, has_played: false }).select('id').single()
        if (createErr || !created) { setError('Could not add player.'); return }
        playerId = created.id; hasPlayed = false
      }
      const { data: inQueue } = await supabase.from('queue').select('id').eq('player_id', playerId).maybeSingle()
      if (inQueue) { setError(`${trimmed} is already in the list.`); return }

      const isNew = !hasPlayed
      const { data: currentQueue } = await supabase.from('queue').select('id, player_id, position, is_new').order('position', { ascending: true })
      const q = currentQueue ?? []
      const maxPos = q.length > 0 ? q[q.length - 1].position : 0

      if (!isNew) {
        await supabase.from('queue').insert({ player_id: playerId, position: maxPos + 1, is_new: false })
      } else {
        let insertPosition = maxPos + 1
        let bumpEntryId: string | null = null
        let bumpNewPosition: number | null = null
        for (let teamStart = 0; ; teamStart += 5) {
          const s4 = teamStart + 3; const s5 = teamStart + 4
          if (s4 >= q.length) { insertPosition = maxPos + 1; break }
          const slot4 = q[s4]; const slot5 = q[s5]
          if (!slot4.is_new) { bumpEntryId = slot4.id; bumpNewPosition = maxPos + 1; insertPosition = slot4.position; break }
          if (slot5 === undefined) { insertPosition = slot4.position + 1; break }
          if (!slot5.is_new) { bumpEntryId = slot5.id; bumpNewPosition = maxPos + 1; insertPosition = slot5.position; break }
        }
        if (bumpEntryId && bumpNewPosition) {
          await supabase.from('queue').update({ position: bumpNewPosition, is_new: false }).eq('id', bumpEntryId)
        }
        await supabase.from('queue').insert({ player_id: playerId, position: insertPosition, is_new: true })
      }
      setNameInput('')
      await refetchQueue()
    } finally { setAdding(false) }
  }

  const timerColor = timerSeconds <= 60 ? 'text-red-400' : timerSeconds <= 120 ? 'text-yellow-400' : 'text-white'

  // Split queue into columns of 10
  const columns: typeof queue[] = []
  for (let i = 0; i < queue.length; i += 10) {
    columns.push(queue.slice(i, i + 10))
  }

  return (
    <div className="h-screen bg-gray-950 text-white flex flex-col overflow-hidden">

      {/* ── TOP: Scoreboard ── */}
      <div className="h-[40%] flex flex-col border-b border-gray-800">

        {/* Header */}
        <div className="px-8 pt-3 pb-1 flex items-center justify-between">
          <div className="w-20" />
          <h1 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-600">
            Lighthouse Basketball
          </h1>
          <button
            onClick={() => setShowQR(true)}
            className="w-20 text-right text-xs font-semibold text-gray-500 hover:text-white transition-colors"
          >
            QR Check-in
          </button>
        </div>

        <div className="flex flex-1 min-h-0 px-6 pb-4 gap-6">

          {/* Home team card */}
          <div className="flex-1 flex flex-col items-center justify-between bg-orange-500/8 rounded-2xl py-4 px-5 border border-orange-500/15">
            <span className="text-sm font-bold uppercase tracking-widest text-orange-400">Home</span>
            <div className="text-[4rem] font-black tabular-nums leading-none text-orange-400">
              {court?.team_a_score ?? 0}
            </div>
            <ul className="w-full space-y-0.5">
              {teamAPlayers.length === 0
                ? <li className="text-center text-gray-600 text-sm">—</li>
                : teamAPlayers.map(e => (
                  <li key={e.id} className="text-center text-orange-100 font-semibold text-base leading-snug truncate">
                    {e.player?.name ?? '—'}
                  </li>
                ))
              }
            </ul>
            <ScoreButtons team="a" score={court?.team_a_score ?? 0} accent="text-orange-400" />
          </div>

          {/* Center: timer + controls */}
          <div className="flex flex-col items-center justify-between py-2 shrink-0 w-48">
            <div className="flex flex-col items-center gap-1">
              <span className={`text-[3.5rem] font-black tabular-nums leading-none ${timerColor}`}>
                {formatTime(timerSeconds)}
              </span>
              {gameActive ? (
                <span className="flex items-center gap-1.5 text-green-400 text-xs font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  Live
                </span>
              ) : (
                <span className="text-gray-600 text-xs font-semibold">No game</span>
              )}
            </div>

            <div className="text-2xl font-black text-gray-700">VS</div>

            <div className="flex flex-col gap-2 w-full">
              <button onClick={handleStart} disabled={gameActive}
                className="w-full py-2 rounded-xl bg-green-700 hover:bg-green-600 disabled:opacity-30 disabled:cursor-not-allowed font-bold text-sm transition-colors">
                Start
              </button>
              <button onClick={handlePauseResume} disabled={!gameHasStarted}
                className="w-full py-2 rounded-xl bg-yellow-700 hover:bg-yellow-600 disabled:opacity-30 disabled:cursor-not-allowed font-bold text-sm transition-colors">
                {timerRunning ? 'Pause' : 'Resume'}
              </button>
              <button onClick={handleReset}
                className="w-full py-2 rounded-xl bg-gray-700 hover:bg-gray-600 font-bold text-sm transition-colors">
                Reset
              </button>
            </div>
          </div>

          {/* Away team card */}
          <div className="flex-1 flex flex-col items-center justify-between bg-blue-500/8 rounded-2xl py-4 px-5 border border-blue-500/15">
            <span className="text-sm font-bold uppercase tracking-widest text-blue-400">Away</span>
            <div className="text-[4rem] font-black tabular-nums leading-none text-blue-400">
              {court?.team_b_score ?? 0}
            </div>
            <ul className="w-full space-y-0.5">
              {teamBPlayers.length === 0
                ? <li className="text-center text-gray-600 text-sm">—</li>
                : teamBPlayers.map(e => (
                  <li key={e.id} className="text-center text-blue-100 font-semibold text-base leading-snug truncate">
                    {e.player?.name ?? '—'}
                  </li>
                ))
              }
            </ul>
            <ScoreButtons team="b" score={court?.team_b_score ?? 0} accent="text-blue-400" />
          </div>

        </div>
      </div>

      {/* ── BOTTOM: Queue ── */}
      <div className="h-[60%] flex flex-col px-6 py-4 min-h-0">

        {/* Add player + header */}
        <div className="flex items-center gap-4 mb-3 shrink-0">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 shrink-0">
            Players — {queue.length}
          </p>
          <form onSubmit={handleAddPlayer} className="flex gap-2 flex-1">
            <input
              type="text"
              value={nameInput}
              onChange={e => { setNameInput(e.target.value); setError(null) }}
              placeholder="Add player…"
              maxLength={30}
              className="flex-1 px-3 py-1.5 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
            />
            <button type="submit" disabled={!nameInput.trim() || adding}
              className="px-5 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-sm transition-colors whitespace-nowrap">
              {adding ? '…' : 'Add'}
            </button>
          </form>
          {error && <p className="text-red-400 text-xs shrink-0">{error}</p>}
        </div>

        {/* Multi-column player list */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          {queueLoading ? (
            <p className="text-gray-700 text-sm text-center py-8">Loading…</p>
          ) : queue.length === 0 ? (
            <p className="text-gray-700 text-sm text-center py-8">No players yet</p>
          ) : (
            <div className="flex gap-4 h-full">
              {columns.map((col, colIdx) => (
                <div key={colIdx} className={`w-56 shrink-0 flex flex-col h-full ${col.length === 10 ? 'justify-between' : 'gap-1.5 justify-start'}`}>
                  {col.map((entry) => {
                    const idx = queue.indexOf(entry)
                    const isHome = idx < 5
                    const isAway = idx >= 5 && idx < 10
                    const isDragging = dragIdx === idx
                    const isDragOver = dragOverIdx === idx && dragIdx !== idx

                    const rowBg = isHome
                      ? 'bg-orange-500/10 border-orange-500/25'
                      : isAway
                      ? 'bg-blue-500/10 border-blue-500/25'
                      : 'bg-gray-900 border-transparent'

                    const nameColor = isHome ? 'text-orange-100' : isAway ? 'text-blue-100' : 'text-gray-300'

                    return (
                      <div
                        key={entry.id}
                        draggable
                        onDragStart={e => handleDragStart(e, idx)}
                        onDragOver={e => handleDragOver(e, idx)}
                        onDrop={() => handleDrop(idx)}
                        onDragEnd={handleDragEnd}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border transition-all cursor-grab active:cursor-grabbing select-none ${rowBg} ${isDragging ? 'opacity-25' : ''} ${isDragOver ? 'ring-2 ring-white/25' : ''}`}
                      >
                        <span className="text-gray-600 text-xs w-4 shrink-0 tabular-nums text-right">{idx + 1}</span>
                        <span className="text-gray-500 shrink-0 text-sm">⠿</span>
                        <span className={`flex-1 font-semibold truncate text-sm ${nameColor}`}>
                          {entry.player?.name ?? '—'}
                        </span>
                        {entry.is_new && (
                          <span className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded-full shrink-0">
                            New
                          </span>
                        )}
                        <button
                          onClick={() => handleRemove(entry.id)}
                          className="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors text-base leading-none"
                        >
                          ×
                        </button>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* QR modal */}
      {showQR && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={() => setShowQR(false)}
        >
          <div
            className="bg-gray-900 rounded-3xl p-8 flex flex-col items-center gap-4 shadow-2xl border border-gray-700"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-white">Player Check-in</h2>
            <p className="text-sm text-gray-400 text-center">Scan to sign in before joining the queue</p>
            <div className="bg-white p-4 rounded-2xl">
              <QRCodeSVG value={checkInUrl} size={220} />
            </div>
            <p className="text-xs text-gray-600 font-mono">{checkInUrl}</p>
            <button
              onClick={() => setShowQR(false)}
              className="mt-1 px-6 py-2 rounded-xl bg-gray-700 hover:bg-gray-600 text-sm font-semibold transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
