# Menzin Finance

A personal finance tracker — net worth across personal, business, credit-card,
investment, and retirement accounts, plus a monthly budget. React + Vite frontend,
Supabase (Postgres + Auth) backend, deployed on Netlify.

```
src/
  lib/        supabase client, formatters, insert helper
  pages/      NetWorth, Accounts, Budget
  components/ Auth, ImportStarter
  data/       starterData.json  (your Excel history)
supabase/
  schema.sql  tables + row-level security + net-worth view
  seed.sql    your history as SQL (alternative to the in-app importer)
```

## Data model
- **accounts** — one row per account; `group` (Cash / Business / Investment / Retirement)
  drives the net-worth rollups, `is_liability` flags credit cards.
- **balance_snapshots** — every account's balance on a date. A net-worth snapshot is
  all accounts sharing one date.
- **budget_categories** / **budget_entries** — signed monthly amounts
  (negative = expense, positive = income).

Row-Level Security ties every row to `auth.uid()`, so each signed-in user sees only their own data.

## 1. Supabase
1. Create a project at supabase.com.
2. SQL Editor → paste **`supabase/schema.sql`** → Run.
3. Project Settings → API → copy the **Project URL** and **anon public key**.
4. (Optional) Authentication → Providers → Email: turn off "Confirm email" for the
   quickest single-user setup.

## 2. Run locally
```bash
npm install
cp .env.example .env        # paste your Supabase URL + anon key
npm run dev                 # http://localhost:5173
```
Create an account, then click **Import my Excel history** on first load to pull in
your 13 accounts, 14 snapshots, and 23 budget categories.

## 3. Deploy to Netlify
1. Push this folder to a GitHub repo.
2. Netlify → Add new site → Import from Git → pick the repo.
   Build settings are read from `netlify.toml` (build `npm run build`, publish `dist`).
3. Site configuration → Environment variables → add `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` (same values as `.env`).
4. Deploy. Add your Netlify URL under Supabase → Authentication → URL Configuration.

## Notes & assumptions
- The anon key is safe to ship in the browser; RLS is what protects your data.
- Budget months from the spreadsheet were imported as **Jan–Apr 2026** (the most recent
  year in your history). Adjust the year selector on the Budget tab if that's wrong —
  or edit `src/data/starterData.json` before importing.
- Credit cards are grouped under **Cash** as net-liquid liabilities, matching your
  original spreadsheet's rollup logic. Change any account's group on the Accounts tab.
