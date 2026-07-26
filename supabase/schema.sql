-- =============================================================
--  Menzin Finance — Supabase schema
--  Run this once in the Supabase SQL editor (or via the CLI).
--  Every table is owned by the authenticated user and protected
--  by Row-Level Security so each user only ever sees their own rows.
-- =============================================================

-- ---------- ACCOUNTS ----------
-- One row per financial account you track (checking, a credit card,
-- a brokerage, a retirement account, a business account, etc.)
create table if not exists public.accounts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null,
  account_type text not null default 'other',
      -- checking | savings | treasury | savings_bond | credit_card
      -- | business | brokerage | hsa | retirement | other
  "group"      text not null default 'Cash',
      -- rollup bucket for net worth: Cash | Business | Investment | Retirement
  is_liability boolean not null default false,
      -- true for credit cards / loans (stored as a negative balance)
  sort_order   integer not null default 0,
  archived     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- ---------- BALANCE SNAPSHOTS ----------
-- The balance of one account on one date. A "net worth snapshot" is
-- simply every account's balance sharing the same snapshot_date.
create table if not exists public.balance_snapshots (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  account_id    uuid not null references public.accounts (id) on delete cascade,
  snapshot_date date not null,
  balance       numeric(14,2) not null default 0,
  created_at    timestamptz not null default now(),
  unique (account_id, snapshot_date)
);

-- ---------- BUDGET CATEGORIES ----------
create table if not exists public.budget_categories (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  name           text not null,
  sort_order     integer not null default 0,
  monthly_target numeric(14,2),  -- optional flat monthly spending target, same every month
  created_at     timestamptz not null default now()
);
alter table public.budget_categories add column if not exists monthly_target numeric(14,2);

-- ---------- BUDGET ENTRIES ----------
-- A signed amount for one category in one month (first-of-month date).
-- Negative = expense / outflow, positive = income / inflow.
create table if not exists public.budget_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null references public.budget_categories (id) on delete cascade,
  month       date not null,            -- always the 1st of the month
  amount      numeric(14,2) not null default 0,
  created_at  timestamptz not null default now(),
  unique (category_id, month)
);

-- ---------- IMPORTED TRANSACTIONS LOG ----------
-- Records every transaction applied via CSV import.
-- The unique constraint prevents the same transaction from being imported twice.
create table if not exists public.imported_transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  tx_date     date not null,
  description text not null,
  amount      numeric(14,2) not null,
  imported_at timestamptz not null default now(),
  unique (user_id, tx_date, description, amount),
  category   text
);

-- ---------- CATEGORIZATION RULES ----------
-- Keyword-based auto-categorization for CSV import.
-- keywords: comma-separated substrings matched case-insensitively, first match wins.
create table if not exists public.categorization_rules (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  keywords   text not null,
  category   text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- INDEXES ----------
create index if not exists idx_snapshots_user_date on public.balance_snapshots (user_id, snapshot_date);
create index if not exists idx_entries_user_month  on public.budget_entries (user_id, month);

-- ---------- NET WORTH VIEW ----------
-- Convenience view: total net worth per snapshot date, plus the
-- per-group breakdown. security_invoker makes it respect RLS.
create or replace view public.net_worth_by_date
with (security_invoker = true) as
select
  s.user_id,
  s.snapshot_date,
  sum(s.balance)                                                  as total,
  sum(s.balance) filter (where a."group" = 'Cash')               as cash,
  sum(s.balance) filter (where a."group" = 'Business')           as business,
  sum(s.balance) filter (where a."group" = 'Investment')         as investment,
  sum(s.balance) filter (where a."group" = 'Retirement')         as retirement
from public.balance_snapshots s
join public.accounts a on a.id = s.account_id
group by s.user_id, s.snapshot_date
order by s.snapshot_date;

-- =============================================================
--  ROW-LEVEL SECURITY
-- =============================================================
alter table public.accounts               enable row level security;
alter table public.imported_transactions  enable row level security;
alter table public.balance_snapshots      enable row level security;
alter table public.budget_categories      enable row level security;
alter table public.budget_entries         enable row level security;
alter table public.categorization_rules   enable row level security;

-- One policy per table covering all actions, scoped to the owner.
create policy "own rows" on public.accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.imported_transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.balance_snapshots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.budget_categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.budget_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on public.categorization_rules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
