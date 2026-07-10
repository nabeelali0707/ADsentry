alter table organizations enable row level security;
alter table profiles enable row level security;
alter table contracts enable row level security;
alter table contract_field_corrections enable row level security;
alter table broadcast_logs enable row level security;
alter table discrepancies enable row level security;
alter table audit_reports enable row level security;

drop policy if exists organizations_select_own_organization on organizations;
create policy organizations_select_own_organization
on organizations
for select
to authenticated
using (
    id = (
        select organization_id
        from profiles
        where profiles.id = auth.uid()
    )
);

drop policy if exists organizations_update_own_organization on organizations;
create policy organizations_update_own_organization
on organizations
for update
to authenticated
using (
    id = (
        select organization_id
        from profiles
        where profiles.id = auth.uid()
    )
)
with check (
    id = (
        select organization_id
        from profiles
        where profiles.id = auth.uid()
    )
);

drop policy if exists profiles_select_own_organization on profiles;
create policy profiles_select_own_organization
on profiles
for select
to authenticated
using (
    organization_id = (
        select current_profile.organization_id
        from profiles as current_profile
        where current_profile.id = auth.uid()
    )
);

drop policy if exists profiles_update_own_row on profiles;
create policy profiles_update_own_row
on profiles
for update
to authenticated
using (id = auth.uid())
with check (
    id = auth.uid()
    and organization_id = (
        select current_profile.organization_id
        from profiles as current_profile
        where current_profile.id = auth.uid()
    )
);

drop policy if exists contracts_select_own_organization on contracts;
create policy contracts_select_own_organization
on contracts
for select
to authenticated
using (
    organization_id = (
        select profiles.organization_id
        from profiles
        where profiles.id = auth.uid()
    )
);

drop policy if exists contracts_insert_own_organization on contracts;
create policy contracts_insert_own_organization
on contracts
for insert
to authenticated
with check (
    organization_id = (
        select profiles.organization_id
        from profiles
        where profiles.id = auth.uid()
    )
);

drop policy if exists contracts_update_own_organization on contracts;
create policy contracts_update_own_organization
on contracts
for update
to authenticated
using (
    organization_id = (
        select profiles.organization_id
        from profiles
        where profiles.id = auth.uid()
    )
)
with check (
    organization_id = (
        select profiles.organization_id
        from profiles
        where profiles.id = auth.uid()
    )
);

drop policy if exists contracts_delete_own_organization on contracts;
create policy contracts_delete_own_organization
on contracts
for delete
to authenticated
using (
    organization_id = (
        select profiles.organization_id
        from profiles
        where profiles.id = auth.uid()
    )
);

drop policy if exists contract_field_corrections_select_own_organization on contract_field_corrections;
create policy contract_field_corrections_select_own_organization
on contract_field_corrections
for select
to authenticated
using (
    exists (
        select 1
        from contracts
        join profiles on profiles.organization_id = contracts.organization_id
        where contracts.id = contract_field_corrections.contract_id
          and profiles.id = auth.uid()
    )
);

drop policy if exists contract_field_corrections_insert_own_organization on contract_field_corrections;
create policy contract_field_corrections_insert_own_organization
on contract_field_corrections
for insert
to authenticated
with check (
    exists (
        select 1
        from contracts
        join profiles on profiles.organization_id = contracts.organization_id
        where contracts.id = contract_field_corrections.contract_id
          and profiles.id = auth.uid()
    )
);

drop policy if exists contract_field_corrections_update_own_organization on contract_field_corrections;
create policy contract_field_corrections_update_own_organization
on contract_field_corrections
for update
to authenticated
using (
    exists (
        select 1
        from contracts
        join profiles on profiles.organization_id = contracts.organization_id
        where contracts.id = contract_field_corrections.contract_id
          and profiles.id = auth.uid()
    )
)
with check (
    exists (
        select 1
        from contracts
        join profiles on profiles.organization_id = contracts.organization_id
        where contracts.id = contract_field_corrections.contract_id
          and profiles.id = auth.uid()
    )
);

drop policy if exists contract_field_corrections_delete_own_organization on contract_field_corrections;
create policy contract_field_corrections_delete_own_organization
on contract_field_corrections
for delete
to authenticated
using (
    exists (
        select 1
        from contracts
        join profiles on profiles.organization_id = contracts.organization_id
        where contracts.id = contract_field_corrections.contract_id
          and profiles.id = auth.uid()
    )
);

drop policy if exists broadcast_logs_select_own_organization on broadcast_logs;
create policy broadcast_logs_select_own_organization
on broadcast_logs
for select
to authenticated
using (
    exists (
        select 1
        from contracts
        join profiles on profiles.organization_id = contracts.organization_id
        where contracts.id = broadcast_logs.contract_id
          and profiles.id = auth.uid()
    )
);

drop policy if exists broadcast_logs_insert_own_organization on broadcast_logs;
create policy broadcast_logs_insert_own_organization
on broadcast_logs
for insert
to authenticated
with check (
    exists (
        select 1
        from contracts
        join profiles on profiles.organization_id = contracts.organization_id
        where contracts.id = broadcast_logs.contract_id
          and profiles.id = auth.uid()
    )
);

drop policy if exists broadcast_logs_update_own_organization on broadcast_logs;
create policy broadcast_logs_update_own_organization
on broadcast_logs
for update
to authenticated
using (
    exists (
        select 1
        from contracts
        join profiles on profiles.organization_id = contracts.organization_id
        where contracts.id = broadcast_logs.contract_id
          and profiles.id = auth.uid()
    )
)
with check (
    exists (
        select 1
        from contracts
        join profiles on profiles.organization_id = contracts.organization_id
        where contracts.id = broadcast_logs.contract_id
          and profiles.id = auth.uid()
    )
);

drop policy if exists broadcast_logs_delete_own_organization on broadcast_logs;
create policy broadcast_logs_delete_own_organization
on broadcast_logs
for delete
to authenticated
using (
    exists (
        select 1
        from contracts
        join profiles on profiles.organization_id = contracts.organization_id
        where contracts.id = broadcast_logs.contract_id
          and profiles.id = auth.uid()
    )
);

drop policy if exists discrepancies_select_own_organization on discrepancies;
create policy discrepancies_select_own_organization
on discrepancies
for select
to authenticated
using (
    exists (
        select 1
        from contracts
        join profiles on profiles.organization_id = contracts.organization_id
        where contracts.id = discrepancies.contract_id
          and profiles.id = auth.uid()
    )
);

drop policy if exists discrepancies_insert_own_organization on discrepancies;
create policy discrepancies_insert_own_organization
on discrepancies
for insert
to authenticated
with check (
    exists (
        select 1
        from contracts
        join profiles on profiles.organization_id = contracts.organization_id
        where contracts.id = discrepancies.contract_id
          and profiles.id = auth.uid()
    )
);

drop policy if exists discrepancies_update_own_organization on discrepancies;
create policy discrepancies_update_own_organization
on discrepancies
for update
to authenticated
using (
    exists (
        select 1
        from contracts
        join profiles on profiles.organization_id = contracts.organization_id
        where contracts.id = discrepancies.contract_id
          and profiles.id = auth.uid()
    )
)
with check (
    exists (
        select 1
        from contracts
        join profiles on profiles.organization_id = contracts.organization_id
        where contracts.id = discrepancies.contract_id
          and profiles.id = auth.uid()
    )
);

drop policy if exists discrepancies_delete_own_organization on discrepancies;
create policy discrepancies_delete_own_organization
on discrepancies
for delete
to authenticated
using (
    exists (
        select 1
        from contracts
        join profiles on profiles.organization_id = contracts.organization_id
        where contracts.id = discrepancies.contract_id
          and profiles.id = auth.uid()
    )
);

drop policy if exists audit_reports_select_own_organization on audit_reports;
create policy audit_reports_select_own_organization
on audit_reports
for select
to authenticated
using (
    exists (
        select 1
        from contracts
        join profiles on profiles.organization_id = contracts.organization_id
        where contracts.id = audit_reports.contract_id
          and profiles.id = auth.uid()
    )
);

drop policy if exists audit_reports_insert_own_organization on audit_reports;
create policy audit_reports_insert_own_organization
on audit_reports
for insert
to authenticated
with check (
    exists (
        select 1
        from contracts
        join profiles on profiles.organization_id = contracts.organization_id
        where contracts.id = audit_reports.contract_id
          and profiles.id = auth.uid()
    )
);

drop policy if exists audit_reports_update_own_organization on audit_reports;
create policy audit_reports_update_own_organization
on audit_reports
for update
to authenticated
using (
    exists (
        select 1
        from contracts
        join profiles on profiles.organization_id = contracts.organization_id
        where contracts.id = audit_reports.contract_id
          and profiles.id = auth.uid()
    )
)
with check (
    exists (
        select 1
        from contracts
        join profiles on profiles.organization_id = contracts.organization_id
        where contracts.id = audit_reports.contract_id
          and profiles.id = auth.uid()
    )
);

drop policy if exists audit_reports_delete_own_organization on audit_reports;
create policy audit_reports_delete_own_organization
on audit_reports
for delete
to authenticated
using (
    exists (
        select 1
        from contracts
        join profiles on profiles.organization_id = contracts.organization_id
        where contracts.id = audit_reports.contract_id
          and profiles.id = auth.uid()
    )
);
