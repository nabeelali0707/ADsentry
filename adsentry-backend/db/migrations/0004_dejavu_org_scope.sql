-- Add organization_id to dejavu_songs table to scope fingerprints by organization
alter table dejavu_songs add column if not exists organization_id uuid references organizations(id) on delete cascade;
