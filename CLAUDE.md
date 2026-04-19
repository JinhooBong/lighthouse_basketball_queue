# Basketball Queue App — Claude Code Guide

## Project Overview
A real-time basketball queue management app for a church gym. Players join a queue by entering their name, and an admin manages team assignments and game rotations on a single court.

## Tech Stack
- **Frontend:** React + Vite + TypeScript
- **Database & Realtime:** Supabase (Postgres + Realtime subscriptions)
- **Hosting:** Vercel
- **Styling:** TailwindCSS

## Environment Variables
Create a `.env.local` file in the root with:
```
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

---

## Database Schema

### `players`
| column | type | notes |
|---|---|---|
| id | uuid (PK) | auto generated |
| name | text | player's display name |
| member | boolean | whether player is member |
| insured | boolean | has signed liability waiver |
| has_played | boolean | false until they complete their first game |
| created_at | timestamptz | auto |

### `queue`
| column | type | notes |
|---|---|---|
| id | uuid (PK) | auto generated |
| player_id | uuid (FK → players.id) | |
| position | integer | order in queue (lower = sooner) |
| is_new | boolean | true if player has never played |
| created_at | timestamptz | auto |

### `court`
Single row (id = 1) representing the current game state.
| column | type | notes |
|---|---|---|
| id | integer (PK) | always 1 |
| team_a | uuid[] | array of player_ids |
| team_b | uuid[] | array of player_ids |
| team_a_games | integer | consecutive games played (max 2) |
| team_b_games | integer | consecutive games played (max 2) |
| team_a_score | integer | current game score |
| team_b_score | integer | current game score |
| game_active | boolean | whether a game is in progress |

### `games`
| column | type | notes |
|---|---|---|
| id | uuid (PK) | auto generated |
| team_a | uuid[] | snapshot of player ids |
| team_b | uuid[] | snapshot of player ids |
| team_a_score | integer | |
| team_b_score | integer | |
| winner | text | 'team_a' or 'team_b' |
| played_at | timestamptz | auto |

---

## App Routes
| route | description |
|---|---|
| `/` | Player view — enter name, join/leave queue, see live queue |
| `/court` | Court view — live scoreboard, current teams, queue list (read-only) |
| `/admin` | Admin view — manage queue, assign teams, track score, end game |

---

## Core Business Logic

### Queue Priority & Bumping Rule
- New players (never played) insert themselves into **slots 4 and 5** of the next team, bumping returners out
- **Slots 1–3** of the next team are always locked (first 3 returners by position)
- Only max **2 new players** can bump into the next team
- If both slots 4 & 5 are already new players, the incoming new player becomes the new slot 4 or 5 of the **team after next** (same rule applies recursively)
- Bumped returners go to the back of the general waiting queue

### Game Rotation Logic
- Each team tracks `games_played` (consecutive games on court, max 2)
- **Game 1:** Team A (games=1) vs Team B (games=1) → loser leaves, winner stays and becomes games=2
- **Game 2:** Team A (games=2) vs Team C (games=1) → Team A **always leaves** after this game regardless of result. Team C stays if they win (games=2), leaves if they lose
- Whenever a team leaves the court, all their players go to the **back of the queue** with `is_new = false` and `has_played = true`
- Next team of 5 is pulled from the top of the queue

### Score Tracking
- Admin manually increments/decrements scores during a game
- On game end, admin declares winner or it is auto-determined by score
- Game is saved to `games` table as history

---

## Supabase Client Setup
Create `src/lib/supabase.ts`:
```ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

---

## Player Identity (No Auth)
- On `/`, player enters their name and it is saved to `localStorage` as `{ playerId, playerName }`
- On return visits, their identity is restored from localStorage
- If they are in the queue or on the court, the UI reflects that

---

## Real-time Subscriptions
Use Supabase real-time on these tables:
- `queue` — for live queue updates on all views
- `court` — for live score and team updates on `/court` and `/admin`

Example pattern:
```ts
const channel = supabase
  .channel('queue-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'queue' }, () => {
    fetchQueue() // re-fetch on any change
  })
  .subscribe()
```

---

## Suggested Prompt Sequence for Claude Code

Use these prompts **in order** when building out the app with Claude Code:

---

### Prompt 1 — Project Scaffold
```
Scaffold a new React + Vite + TypeScript project called lighthouse-basketball.
Install and configure: react-router-dom, @supabase/supabase-js, tailwindcss.
Set up the folder structure:
  src/
    lib/supabase.ts       ← Supabase client singleton
    types/index.ts        ← shared TypeScript types for Player, QueueEntry, Court, Game
    hooks/                ← custom hooks folder
    pages/
      Home.tsx            ← route: /
      Court.tsx           ← route: /court
      Admin.tsx           ← route: /admin
    components/           ← shared UI components
    App.tsx               ← router setup

Set up react-router-dom with routes for /, /court, and /admin.
Create the Supabase client in src/lib/supabase.ts using VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY env variables.
Define TypeScript types in src/types/index.ts matching the database schema described in CLAUDE.md.
```

---

### Prompt 2 — Custom Hooks
```
Create the following custom hooks in src/hooks/ using the Supabase client from src/lib/supabase.ts.
Reference the schema and business logic in CLAUDE.md.

1. useQueue.ts
   - Fetches the current queue ordered by position
   - Joins player name from the players table
   - Subscribes to real-time changes on the queue table
   - Returns: { queue, loading, refetch }

2. useCourt.ts
   - Fetches the single court row (id = 1)
   - Resolves team_a and team_b player ids to player names
   - Subscribes to real-time changes on the court table
   - Returns: { court, teamA, teamB, loading, refetch }

3. usePlayer.ts
   - Reads/writes player identity from localStorage ({ playerId, playerName })
   - On first visit, allows setting a name which inserts into the players table
   - Returns: { player, setPlayer, clearPlayer }
```

---

### Prompt 3 — Home Page (Player View)
```
Build the Home page at src/pages/Home.tsx. Reference CLAUDE.md for logic.

Features:
- If no player identity in localStorage, show a name entry form (input + submit button)
- On submit, insert into players table and save { playerId, playerName } to localStorage
- Show the live queue list using useQueue hook (player name + position)
- If the current player is in the queue, show their position and a "Leave Queue" button
- If not in the queue and not on the court, show a "Join Queue" button
- Joining the queue inserts into the queue table with correct position and is_new flag
- Apply the bumping logic from CLAUDE.md when inserting a new (never played) player

Keep the UI clean and mobile-friendly using TailwindCSS.
```

---

### Prompt 4 — Court Page (Spectator View)
```
Build the Court page at src/pages/Court.tsx. Reference CLAUDE.md for logic.

Features:
- Display current Team A vs Team B with player names using useCourt hook
- Display live scores for both teams
- Display the current queue below the court (read-only) using useQueue hook
- All data updates in real-time via Supabase subscriptions
- Show which team is on their 1st vs 2nd game (e.g. a subtle badge)
- No interactive controls on this page — pure display only

Keep the UI clean, bold, and easy to read from across a gym. Use large text for scores.
Use TailwindCSS.
```

---

### Prompt 5 — Admin Page
```
Build the Admin page at src/pages/Admin.tsx. Reference CLAUDE.md for logic.

Features:
- Display current court state using useCourt hook (team names, scores, game counts)
- Score controls: +1 / -1 buttons for each team, updates court table in Supabase
- "End Game" button that:
    1. Determines winner by score (or admin can override)
    2. Saves game to games table
    3. Applies rotation logic from CLAUDE.md:
       - Losing team (or team with games=2) leaves the court → players go to back of queue with is_new=false, has_played=true
       - Winning team stays if games < 2, updates their games count
       - Pulls next 5 from queue to form the new challenger team
       - Resets scores to 0
- Queue management panel:
    - Shows full queue with player names and is_new status
    - Admin can remove any player from the queue
    - Admin can manually reorder players (drag or up/down buttons)
- "Start Game" button to activate a game (sets game_active = true)
- No password protection needed

Use TailwindCSS. Keep the layout practical and functional over pretty.
```

---

### Prompt 6 — Vercel Deployment
```
Prepare this app for deployment on Vercel.

1. Make sure vite.config.ts is set up correctly for React
2. Add a vercel.json file at the root that redirects all routes to index.html for client-side routing:
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
3. Confirm that all environment variables are prefixed with VITE_ so Vite exposes them to the client
4. Add a README.md with instructions on how to set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel's project settings
```

---

## Notes for Claude Code
- Always use the Supabase client from `src/lib/supabase.ts`, never instantiate a new client
- All database types should come from `src/types/index.ts`
- Prefer custom hooks over inline data fetching in components
- Use TailwindCSS for all styling — no CSS modules or inline styles
- The `court` table always has exactly one row with id = 1 — always upsert, never insert
- Queue `position` values should be recalculated as contiguous integers after any insert/delete