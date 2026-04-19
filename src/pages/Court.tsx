import { useCourt } from '../hooks/useCourt'
import { useQueue } from '../hooks/useQueue'
import type { CourtPlayer } from '../hooks/useCourt'

function GameBadge({ games }: { games: number }) {
  if (games === 2) {
    return (
      <span className="inline-block text-xs font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
        Game 2
      </span>
    )
  }
  return (
    <span className="inline-block text-xs font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-gray-700 text-gray-400 border border-gray-600">
      Game 1
    </span>
  )
}

function TeamColumn({
  label,
  players,
  score,
  games,
  accent,
}: {
  label: string
  players: CourtPlayer[]
  score: number
  games: number
  accent: string
}) {
  return (
    <div className="flex-1 flex flex-col items-center gap-3">
      <div className="flex flex-col items-center gap-1.5">
        <span className={`text-sm font-bold uppercase tracking-widest ${accent}`}>{label}</span>
        <GameBadge games={games} />
      </div>

      {/* Score */}
      <div className={`text-8xl font-black tabular-nums leading-none ${accent}`}>
        {score}
      </div>

      {/* Players */}
      <ul className="w-full mt-1 space-y-1.5">
        {players.length === 0 ? (
          <li className="text-center text-gray-600 text-sm">No players</li>
        ) : (
          players.map(p => (
            <li
              key={p.id}
              className="text-center text-white font-semibold text-lg leading-tight truncate"
            >
              {p.name}
            </li>
          ))
        )}
      </ul>
    </div>
  )
}

export default function Court() {
  const { court, teamA, teamB, loading: courtLoading } = useCourt()
  const { queue, loading: queueLoading } = useQueue()

  if (courtLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-600 text-lg">Loading…</p>
      </div>
    )
  }

  const gameActive = court?.game_active ?? false

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">

      {/* Header */}
      <div className="text-center pt-6 pb-2">
        <h1 className="text-sm font-bold uppercase tracking-[0.2em] text-gray-500">
          Lighthouse Basketball
        </h1>
      </div>

      {/* Court section */}
      <div className="flex-1 flex flex-col justify-center px-4 py-6 max-w-2xl mx-auto w-full">

        {/* Game status pill */}
        <div className="flex justify-center mb-6">
          {gameActive ? (
            <span className="flex items-center gap-2 bg-green-500/15 border border-green-500/30 text-green-400 text-sm font-semibold px-4 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Game in progress
            </span>
          ) : (
            <span className="bg-gray-800 border border-gray-700 text-gray-500 text-sm font-semibold px-4 py-1.5 rounded-full">
              No game active
            </span>
          )}
        </div>

        {/* Teams + score */}
        <div className="flex items-start gap-4">
          <TeamColumn
            label="Team A"
            players={teamA}
            score={court?.team_a_score ?? 0}
            games={court?.team_a_games ?? 0}
            accent="text-orange-400"
          />

          {/* VS divider */}
          <div className="flex flex-col items-center justify-center pt-10 shrink-0">
            <span className="text-2xl font-black text-gray-700">VS</span>
          </div>

          <TeamColumn
            label="Team B"
            players={teamB}
            score={court?.team_b_score ?? 0}
            games={court?.team_b_games ?? 0}
            accent="text-blue-400"
          />
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-gray-800 mx-4" />

      {/* Queue section */}
      <div className="px-4 pt-4 pb-6 max-w-2xl mx-auto w-full">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Up next — {queue.length} waiting
        </p>

        {queueLoading ? (
          <p className="text-gray-700 text-sm text-center py-6">Loading…</p>
        ) : queue.length === 0 ? (
          <p className="text-gray-700 text-sm text-center py-6">Queue is empty</p>
        ) : (
          <ul className="space-y-1">
            {queue.map((entry, idx) => {
              const teamDivider = idx > 0 && idx % 5 === 0
              return (
                <li key={entry.id}>
                  {teamDivider && (
                    <div className="flex items-center gap-2 my-2.5">
                      <div className="flex-1 border-t border-gray-800" />
                      <span className="text-xs text-gray-700">next team</span>
                      <div className="flex-1 border-t border-gray-800" />
                    </div>
                  )}
                  <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-900">
                    <span className="text-gray-600 text-sm w-5 text-right shrink-0 tabular-nums">
                      {entry.position}
                    </span>
                    <span className="flex-1 text-gray-300 font-medium truncate">
                      {entry.player?.name ?? '—'}
                    </span>
                    {entry.is_new && (
                      <span className="text-xs bg-blue-500/15 text-blue-400 border border-blue-500/25 px-2 py-0.5 rounded-full shrink-0">
                        New
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
