-- Cada pessoa liga o seu Google Calendar. Só a Edge Function lê os tokens.
create table if not exists public.google_calendar_connections (
  person text primary key check (person in ('joao', 'ines')),
  owner_user_id uuid not null unique references auth.users(id) on delete cascade,
  google_email text not null,
  token_ciphertext text not null,
  token_iv text not null,
  updated_at timestamptz not null default now()
);

alter table public.google_calendar_connections enable row level security;
revoke all on public.google_calendar_connections from anon, authenticated;
grant all on public.google_calendar_connections to service_role;
-- Sem políticas RLS: apenas a função com service_role acede aos tokens.
