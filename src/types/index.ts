export interface Player {
  id: string
  name: string
  member: boolean
  insured: boolean
  has_played: boolean
  created_at: string
}

export interface QueueEntry {
  id: string
  player_id: string
  position: number
  is_new: boolean
  created_at: string
  player?: Player
}

export interface Court {
  id: number
  team_a: string[]
  team_b: string[]
  team_a_games: number
  team_b_games: number
  team_a_score: number
  team_b_score: number
  game_active: boolean
}

export interface Game {
  id: string
  team_a: string[]
  team_b: string[]
  team_a_score: number
  team_b_score: number
  winner: 'team_a' | 'team_b'
  played_at: string
}

export interface LocalPlayer {
  playerId: string
  playerName: string
}
