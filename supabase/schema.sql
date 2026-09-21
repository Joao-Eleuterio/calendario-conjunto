-- Calendário Conjunto — schema Supabase
-- Corre este ficheiro todo no SQL Editor do teu projeto Supabase (Database > SQL Editor > New query > Run)

create extension if not exists "pgcrypto";

-- ============================================================
-- 1. EVENTOS / TAREFAS DO CALENDÁRIO
-- ============================================================
create table if not exists events (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  notes        text,
  event_date   date not null,
  event_time   time,
  owner        text not null check (owner in ('conjunto','joao','ines')),
  done         boolean not null default false,
  created_by   text not null check (created_by in ('joao','ines')),
  recurrence_id uuid,
  recurrence_rule jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists events_date_idx on events (event_date);

-- Migração segura para instalações já existentes.
alter table events add column if not exists recurrence_id uuid;
alter table events add column if not exists recurrence_rule jsonb;
create index if not exists events_recurrence_idx on events (recurrence_id);

-- ============================================================
-- 2. CONFIRMAÇÃO CONJUNTA DO DIA (o "X" no calendário mensal)
--    Cada pessoa marca a sua própria linha. O dia só fica "fechado"
--    quando existem as duas linhas (joao + ines) para essa data.
-- ============================================================
create table if not exists day_marks (
  event_date  date not null,
  person      text not null check (person in ('joao','ines')),
  marked_at   timestamptz not null default now(),
  primary key (event_date, person)
);

-- ============================================================
-- 3. PROJECT 50 — regras configuráveis
-- ============================================================
create table if not exists project50_rules (
  id          uuid primary key default gen_random_uuid(),
  text        text not null,
  position    int not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Semear as 8 regras iniciais (só corre se a tabela estiver vazia)
insert into project50_rules (text, position)
select v.text, v.position
from (values
  ('Acordar às 6h todos os dias (8h nos fins de semana)', 1),
  ('Rotina matinal de 1 hora sem distrações', 2),
  ('Exercício físico pelo menos 3x por semana', 3),
  ('Alimentação saudável', 4),
  ('Ler 10 páginas', 5),
  ('Não usar o telemóvel depois das 21h', 6),
  ('Dedicar 1 hora a aprender uma nova habilidade ou hobby', 7),
  ('Registar o progresso', 8)
) as v(text, position)
where not exists (select 1 from project50_rules);

-- ============================================================
-- 4. PROJECT 50 — check-ins diários por pessoa e por regra
-- ============================================================
create table if not exists project50_checkins (
  rule_id       uuid not null references project50_rules(id) on delete cascade,
  person        text not null check (person in ('joao','ines')),
  checkin_date  date not null,
  done          boolean not null default true,
  updated_at    timestamptz not null default now(),
  primary key (rule_id, person, checkin_date)
);

-- ============================================================
-- 5. PROJECT 50 — fotos (Manhã / Fitness / Ler / Skill)
-- ============================================================
create table if not exists project50_photos (
  id            uuid primary key default gen_random_uuid(),
  category      text not null check (category in ('Manha','Fitness','Ler','Skill')),
  person        text not null check (person in ('joao','ines')),
  storage_path  text not null,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- RLS — Row Level Security
-- Nota de segurança: esta app não tem login "a sério" (é só o João
-- e a Inês a escolherem o próprio nome), por isso as políticas abaixo
-- deixam qualquer pessoa com o URL + anon key ler/escrever nas tabelas.
-- Isto é aceitável para um projeto privado de casal em que a chave
-- nunca é partilhada publicamente, mas não é segurança "real". Se um
-- dia quiseres reforçar, troca isto por Supabase Auth (magic link)
-- restrito aos dois emails vossos.
-- ============================================================
alter table events              enable row level security;
alter table day_marks           enable row level security;
alter table project50_rules     enable row level security;
alter table project50_checkins  enable row level security;
alter table project50_photos    enable row level security;

create policy "anon full access events"             on events             for all using (true) with check (true);
create policy "anon full access day_marks"          on day_marks          for all using (true) with check (true);
create policy "anon full access project50_rules"    on project50_rules    for all using (true) with check (true);
create policy "anon full access project50_checkins" on project50_checkins for all using (true) with check (true);
create policy "anon full access project50_photos"   on project50_photos   for all using (true) with check (true);

-- ============================================================
-- REALTIME — para o telemóvel do João ver logo o que a Inês adiciona (e vice-versa)
-- ============================================================
alter publication supabase_realtime add table events;
alter publication supabase_realtime add table day_marks;
alter publication supabase_realtime add table project50_rules;
alter publication supabase_realtime add table project50_checkins;
alter publication supabase_realtime add table project50_photos;

-- ============================================================
-- STORAGE — bucket para as fotos do Project 50
-- Não dá para criar buckets por SQL puro em todos os projetos, por
-- isso cria-o à mão: Storage > New bucket > nome "project50-photos" >
-- marca "Public bucket". Depois corre isto para permitir upload/leitura:
-- ============================================================
insert into storage.buckets (id, name, public)
values ('project50-photos', 'project50-photos', true)
on conflict (id) do nothing;

create policy "anon read project50-photos" on storage.objects
  for select using (bucket_id = 'project50-photos');

create policy "anon insert project50-photos" on storage.objects
  for insert with check (bucket_id = 'project50-photos');

create policy "anon delete project50-photos" on storage.objects
  for delete using (bucket_id = 'project50-photos');
