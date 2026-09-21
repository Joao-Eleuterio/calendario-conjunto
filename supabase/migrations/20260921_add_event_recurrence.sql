-- Migração idempotente para bases de dados já existentes.
-- A ordem é importante: as colunas têm de existir antes da criação do índice.
alter table public.events add column if not exists recurrence_id uuid;
alter table public.events add column if not exists recurrence_rule jsonb;

create index if not exists events_recurrence_idx
  on public.events (recurrence_id);
