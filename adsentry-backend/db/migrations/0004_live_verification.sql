-- Phase 2 & Phase 3 migration: Live Verification Tables, Columns, and RLS

-- 1. Create broadcast_log_source enum and add source column to broadcast_logs
do $$
begin
    if not exists (select 1 from pg_type where typname = 'broadcast_log_source') then
        create type broadcast_log_source as enum (
            'operator_submitted',
            'independent_audio_verification'
        );
    end if;
end
$$;

alter table broadcast_logs add column if not exists source broadcast_log_source default 'operator_submitted';

-- 2. Add live_source_url column to contracts
alter table contracts add column if not exists live_source_url text;

-- 3. Create live_sessions table
create table if not exists live_sessions (
    id uuid primary key default gen_random_uuid(),
    contract_id uuid references contracts(id) on delete cascade not null,
    youtube_url text not null,
    status text not null,
    started_at timestamptz not null default now(),
    ended_at timestamptz,
    error_message text,
    user_id uuid references profiles(id) on delete set null,
    created_at timestamptz default now()
);

-- 4. Create live_matches table
create table if not exists live_matches (
    id uuid primary key default gen_random_uuid(),
    session_id uuid references live_sessions(id) on delete cascade not null,
    matched_title text not null,
    confidence numeric(5,2) not null,
    matched_at timestamptz not null default now(),
    offset_seconds numeric(8,2) not null,
    evidence_clip_path text
);

-- 5. Enable Row Level Security (RLS)
alter table live_sessions enable row level security;
alter table live_matches enable row level security;

-- 6. RLS Policies for live_sessions
drop policy if exists live_sessions_select_own_organization on live_sessions;
create policy live_sessions_select_own_organization
on live_sessions
for select
to authenticated
using (
    exists (
        select 1
        from contracts
        join profiles on profiles.organization_id = contracts.organization_id
        where contracts.id = live_sessions.contract_id
          and profiles.id = auth.uid()
    )
);

drop policy if exists live_sessions_insert_own_organization on live_sessions;
create policy live_sessions_insert_own_organization
on live_sessions
for insert
to authenticated
with check (
    exists (
        select 1
        from contracts
        join profiles on profiles.organization_id = contracts.organization_id
        where contracts.id = live_sessions.contract_id
          and profiles.id = auth.uid()
    )
);

drop policy if exists live_sessions_update_own_organization on live_sessions;
create policy live_sessions_update_own_organization
on live_sessions
for update
to authenticated
using (
    exists (
        select 1
        from contracts
        join profiles on profiles.organization_id = contracts.organization_id
        where contracts.id = live_sessions.contract_id
          and profiles.id = auth.uid()
    )
)
with check (
    exists (
        select 1
        from contracts
        join profiles on profiles.organization_id = contracts.organization_id
        where contracts.id = live_sessions.contract_id
          and profiles.id = auth.uid()
    )
);

drop policy if exists live_sessions_delete_own_organization on live_sessions;
create policy live_sessions_delete_own_organization
on live_sessions
for delete
to authenticated
using (
    exists (
        select 1
        from contracts
        join profiles on profiles.organization_id = contracts.organization_id
        where contracts.id = live_sessions.contract_id
          and profiles.id = auth.uid()
    )
);

-- 7. RLS Policies for live_matches
drop policy if exists live_matches_select_own_organization on live_matches;
create policy live_matches_select_own_organization
on live_matches
for select
to authenticated
using (
    exists (
        select 1
        from live_sessions
        join contracts on contracts.id = live_sessions.contract_id
        join profiles on profiles.organization_id = contracts.organization_id
        where live_sessions.id = live_matches.session_id
          and profiles.id = auth.uid()
    )
);

drop policy if exists live_matches_insert_own_organization on live_matches;
create policy live_matches_insert_own_organization
on live_matches
for insert
to authenticated
with check (
    exists (
        select 1
        from live_sessions
        join contracts on contracts.id = live_sessions.contract_id
        join profiles on profiles.organization_id = contracts.organization_id
        where live_sessions.id = live_matches.session_id
          and profiles.id = auth.uid()
    )
);

drop policy if exists live_matches_update_own_organization on live_matches;
create policy live_matches_update_own_organization
on live_matches
for update
to authenticated
using (
    exists (
        select 1
        from live_sessions
        join contracts on contracts.id = live_sessions.contract_id
        join profiles on profiles.organization_id = contracts.organization_id
        where live_sessions.id = live_matches.session_id
          and profiles.id = auth.uid()
    )
)
with check (
    exists (
        select 1
        from live_sessions
        join contracts on contracts.id = live_sessions.contract_id
        join profiles on profiles.organization_id = contracts.organization_id
        where live_sessions.id = live_matches.session_id
          and profiles.id = auth.uid()
    )
);

drop policy if exists live_matches_delete_own_organization on live_matches;
create policy live_matches_delete_own_organization
on live_matches
for delete
to authenticated
using (
    exists (
        select 1
        from live_sessions
        join contracts on contracts.id = live_sessions.contract_id
        join profiles on profiles.organization_id = contracts.organization_id
        where live_sessions.id = live_matches.session_id
          and profiles.id = auth.uid()
    )
);
