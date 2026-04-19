# Lighthouse Basketball

Real-time basketball queue management app for a church gym. Players join a queue, and an admin manages team assignments and game rotations on a single court.

## Routes

| Path | Description |
|------|-------------|
| `/` | Player view — enter name, join/leave queue |
| `/court` | Court display — live scoreboard and queue (read-only) |
| `/admin` | Admin view — manage scores, end games, reorder queue |

## Local development

1. Clone the repo and install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env.local` file in the project root:
   ```
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
   Both values are found in your Supabase project under **Settings → API**.

3. Start the dev server:
   ```bash
   npm run dev
   ```

## Deploying to Vercel

1. Push the repo to GitHub (or connect directly to Vercel).

2. In the Vercel dashboard, create a new project and import the repo.

3. Add the following environment variables under **Settings → Environment Variables**:

   | Name | Value |
   |------|-------|
   | `VITE_SUPABASE_URL` | Your Supabase project URL |
   | `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key |

   Both values are found in your Supabase project under **Settings → API**.

4. Deploy. The `vercel.json` at the repo root handles client-side routing so that `/court` and `/admin` resolve correctly.

## Tech stack

- React + Vite + TypeScript
- Supabase (Postgres + Realtime)
- TailwindCSS
- Vercel
