create extension if not exists pgcrypto;

do $$
begin
    if not exists (select 1 from pg_type where typname = 'discrepancy_type') then
        create type discrepancy_type as enum (
            'MISSED',
            'SHORTENED',
            'OUT_OF_SLOT',
            'DUPLICATE_BILLED'
        );
    end if;

    if not exists (select 1 from pg_type where typname = 'compliance_status') then
        create type compliance_status as enum (
            'COMPLIANT',
            'MINOR_DEVIATION',
            'MAJOR_BREACH'
        );
    end if;

    if not exists (select 1 from pg_type where typname = 'report_status') then
        create type report_status as enum (
            'DRAFT',
            'FINAL',
            'EXPORTED'
        );
    end if;

    if not exists (select 1 from pg_type where typname = 'user_role') then
        create type user_role as enum (
            'BRAND',
            'AGENCY',
            'FINANCE'
        );
    end if;
end
$$;

create table if not exists organizations (
    id uuid primary key default gen_random_uuid(),
    name text,
    created_at timestamptz default now()
);

create table if not exists profiles (
    id uuid primary key references auth.users(id),
    organization_id uuid references organizations(id),
    full_name text,
    role user_role not null,
    created_at timestamptz default now()
);

create table if not exists contracts (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid references organizations(id) not null,
    created_by uuid references profiles(id),
    brand_name text not null,
    campaign_name text not null,
    channel text not null,
    start_date date not null,
    end_date date not null,
    contracted_airings integer not null,
    spot_duration_sec integer not null,
    cost_per_airing numeric(14,2) not null,
    total_contract_value numeric(14,2) not null,
    time_window_tolerance_minutes integer default 15,
    compliance_threshold_pct numeric(5,2) default 97.00,
    status text default 'DRAFT',
    raw_upload_path text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create table if not exists contract_field_corrections (
    id uuid primary key default gen_random_uuid(),
    contract_id uuid references contracts(id) on delete cascade,
    field_name text not null,
    original_value text,
    corrected_value text,
    corrected_by uuid references profiles(id),
    corrected_at timestamptz default now()
);

create table if not exists broadcast_logs (
    id uuid primary key default gen_random_uuid(),
    contract_id uuid references contracts(id) on delete cascade,
    channel text not null,
    air_date date not null,
    air_time time not null,
    spot_duration_sec integer not null,
    ad_identifier text,
    raw_upload_path text,
    created_at timestamptz default now()
);

create table if not exists discrepancies (
    id uuid primary key default gen_random_uuid(),
    contract_id uuid references contracts(id) on delete cascade,
    type discrepancy_type not null,
    expected_value text,
    actual_value text,
    financial_impact numeric(14,2) not null default 0,
    air_date date,
    channel text,
    matched_log_id uuid references broadcast_logs(id),
    created_at timestamptz default now()
);

create table if not exists audit_reports (
    id uuid primary key default gen_random_uuid(),
    contract_id uuid references contracts(id) on delete cascade,
    generated_date timestamptz default now(),
    total_overpayment numeric(14,2) not null default 0,
    compliance_rate numeric(5,2) not null default 0,
    compliance_status compliance_status not null default 'COMPLIANT',
    ai_summary_text text,
    status report_status not null default 'DRAFT',
    exported_pdf_path text,
    exported_xlsx_path text,
    created_at timestamptz default now()
);

create index if not exists idx_contracts_organization_id
    on contracts(organization_id);

create index if not exists idx_broadcast_logs_contract_id
    on broadcast_logs(contract_id);

create index if not exists idx_broadcast_logs_channel_air_date
    on broadcast_logs(channel, air_date);

create index if not exists idx_discrepancies_contract_id
    on discrepancies(contract_id);

create index if not exists idx_discrepancies_type
    on discrepancies(type);

create index if not exists idx_audit_reports_contract_id
    on audit_reports(contract_id);

create or replace function update_contracts_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_contracts_updated_at on contracts;

create trigger trg_contracts_updated_at
before update on contracts
for each row
execute function update_contracts_updated_at();
