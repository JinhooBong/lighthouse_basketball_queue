import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function CheckIn() {
  const [nameInput, setNameInput] = useState('')
  const [isMember, setIsMember] = useState(false)
  const [isInsured, setIsInsured] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [checkedInName, setCheckedInName] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (done) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-2xl font-bold mb-2">You're in the queue!</h2>
          <p className="text-gray-400 text-sm mb-6">
            {checkedInName} — you've been added. Check the main screen for your position.
          </p>
          <button
            onClick={() => { setDone(false); setNameInput(''); setIsMember(false); setIsInsured(false) }}
            className="px-6 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 text-sm font-semibold transition-colors"
          >
            Check in another player
          </button>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = nameInput.trim()
    if (!trimmed) return
    setSubmitting(true)
    setError(null)

    try {
      // Look up existing player or create new one
      const { data: existing } = await supabase
        .from('players').select('id').ilike('name', trimmed).maybeSingle()

      let playerId: string
      if (existing) {
        playerId = existing.id
        await supabase.from('players').update({ member: isMember, insured: isInsured }).eq('id', playerId)
      } else {
        const { data: created, error: createErr } = await supabase
          .from('players')
          .insert({ name: trimmed, member: isMember, insured: isInsured, has_played: false })
          .select('id').single()
        if (createErr || !created) { setError('Could not sign in. Try again.'); return }
        playerId = created.id
      }

      // Check if already in queue
      const { data: inQueue } = await supabase
        .from('queue').select('id').eq('player_id', playerId).maybeSingle()
      if (inQueue) {
        setCheckedInName(trimmed)
        setDone(true)
        return
      }

      // Add to end of queue
      const { data: currentQueue } = await supabase
        .from('queue').select('position').order('position', { ascending: false }).limit(1).maybeSingle()
      const maxPos = currentQueue?.position ?? 0
      await supabase.from('queue').insert({ player_id: playerId, position: maxPos + 1, is_new: true })

      setCheckedInName(trimmed)
      setDone(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🏀</div>
          <h1 className="text-2xl font-bold">Lighthouse Basketball</h1>
          <p className="text-gray-400 mt-1 text-sm">Sign in to join the game</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Your name</label>
            <input
              type="text"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              placeholder="First name or nickname"
              maxLength={30}
              autoFocus
              className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 text-base"
            />
          </div>

          <div className="flex flex-col gap-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isMember}
                onChange={e => setIsMember(e.target.checked)}
                className="mt-0.5 w-5 h-5 rounded accent-orange-500 cursor-pointer shrink-0"
              />
              <span className="text-sm text-gray-300 leading-snug">
                I regularly attend Lighthouse Church
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isInsured}
                onChange={e => setIsInsured(e.target.checked)}
                className="mt-0.5 w-5 h-5 rounded accent-orange-500 cursor-pointer shrink-0"
              />
              <span className="text-sm text-gray-300 leading-snug">
                I have signed the liability waiver
              </span>
            </label>
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button
            type="submit"
            disabled={!nameInput.trim() || submitting}
            className="w-full py-3.5 rounded-xl bg-orange-500 hover:bg-orange-400 active:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-base transition-colors mt-1"
          >
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
