-- Run as the project owner. No service-role key belongs in the browser.
begin;
create table if not exists public.anafim_vault_heads (
  user_id uuid primary key references auth.users(id) on delete cascade,
  vault_id uuid not null,
  revision_id uuid not null,
  generation bigint not null default 1,
  envelope jsonb not null check (octet_length(envelope::text) < 65536),
  encrypted_bytes bigint not null check (encrypted_bytes between 16 and 52428800),
  updated_at timestamptz not null default now()
);
create table if not exists public.anafim_vault_versions (
  user_id uuid not null references auth.users(id) on delete cascade,
  vault_id uuid not null,
  revision_id uuid not null,
  generation bigint not null,
  envelope jsonb not null check (octet_length(envelope::text) < 65536),
  encrypted_bytes bigint not null check (encrypted_bytes between 16 and 52428800),
  updated_at timestamptz not null default now(),
  primary key (user_id, revision_id)
);
alter table public.anafim_vault_heads enable row level security;
alter table public.anafim_vault_versions enable row level security;
revoke all on public.anafim_vault_heads,public.anafim_vault_versions from public,anon,authenticated;
grant select on public.anafim_vault_heads,public.anafim_vault_versions to authenticated;
drop policy if exists anafim_heads_self on public.anafim_vault_heads;
create policy anafim_heads_self on public.anafim_vault_heads for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists anafim_versions_self on public.anafim_vault_versions;
create policy anafim_versions_self on public.anafim_vault_versions for select to authenticated using (user_id=(select auth.uid()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('anafim-vaults','anafim-vaults',false,52428800,array['application/octet-stream'])
on conflict(id) do update set public=false,file_size_limit=52428800,allowed_mime_types=array['application/octet-stream'];
drop policy if exists anafim_storage_read on storage.objects;
drop policy if exists anafim_storage_insert on storage.objects;
drop policy if exists anafim_storage_delete on storage.objects;
create policy anafim_storage_read on storage.objects for select to authenticated using (bucket_id='anafim-vaults' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy anafim_storage_insert on storage.objects for insert to authenticated with check (bucket_id='anafim-vaults' and (storage.foldername(name))[1]=(select auth.uid())::text and array_length(storage.foldername(name),1)=2);
create policy anafim_storage_delete on storage.objects for delete to authenticated using (bucket_id='anafim-vaults' and (storage.foldername(name))[1]=(select auth.uid())::text);
-- Restrictive guards also protect this bucket from broad policies that may
-- already exist for other buckets in a shared Supabase project.
drop policy if exists anafim_storage_owner_guard on storage.objects;
create policy anafim_storage_owner_guard on storage.objects as restrictive for all to public
 using (bucket_id<>'anafim-vaults' or (storage.foldername(name))[1]=(select auth.uid())::text)
 with check (bucket_id<>'anafim-vaults' or (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists anafim_storage_shape_guard on storage.objects;
create policy anafim_storage_shape_guard on storage.objects as restrictive for insert to public
 with check (bucket_id<>'anafim-vaults' or array_length(storage.foldername(name),1)=2);
drop policy if exists anafim_storage_immutable_guard on storage.objects;
create policy anafim_storage_immutable_guard on storage.objects as restrictive for update to public
 using (bucket_id<>'anafim-vaults') with check (bucket_id<>'anafim-vaults');
-- Object revisions are immutable, never upserted by an ordinary client.

create or replace function public.anafim_commit_vault(p_vault_id uuid,p_revision_id uuid,p_expected_revision uuid,p_envelope jsonb,p_encrypted_bytes bigint)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  u uuid:=auth.uid(); h public.anafim_vault_heads; result public.anafim_vault_heads;
  object_name text; actual_bytes bigint;
begin
  if u is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,0));
  select * into h from public.anafim_vault_heads where user_id=u for update;
  if h.revision_id is distinct from p_expected_revision then raise exception 'ANAFIM_CONFLICT' using errcode='40001'; end if;
  if h.vault_id is not null and h.vault_id<>p_vault_id then raise exception 'Vault mismatch' using errcode='22023'; end if;
  if p_envelope is null or p_vault_id is null or p_revision_id is null or p_encrypted_bytes is null
    or p_envelope->>'format' is distinct from 'anafim-e2ee' or p_envelope->>'version' is distinct from '1'
    or p_envelope->>'ownerId' is distinct from u::text or p_envelope->>'vaultId' is distinct from p_vault_id::text
    or p_envelope->'cipher'->>'revisionId' is distinct from p_revision_id::text
    or coalesce(p_envelope->'cipher'->>'encoding','') not in ('json','json+gzip')
    or jsonb_typeof(p_envelope->'wraps') is distinct from 'array'
    or jsonb_array_length(p_envelope->'wraps') not between 1 and 16
    or octet_length(p_envelope::text)>=65536 or p_encrypted_bytes not between 16 and 52428800 then
    raise exception 'Invalid encrypted manifest' using errcode='22023';
  end if;
  object_name:=u::text||'/'||p_vault_id::text||'/'||p_revision_id::text||'.bin';
  select (metadata->>'size')::bigint into actual_bytes from storage.objects where bucket_id='anafim-vaults' and name=object_name;
  if actual_bytes is distinct from p_encrypted_bytes then raise exception 'Encrypted object missing or size mismatch' using errcode='22023'; end if;
  insert into public.anafim_vault_heads(user_id,vault_id,revision_id,generation,envelope,encrypted_bytes,updated_at)
    values(u,p_vault_id,p_revision_id,coalesce(h.generation,0)+1,p_envelope,p_encrypted_bytes,clock_timestamp())
    on conflict(user_id) do update set revision_id=excluded.revision_id,generation=excluded.generation,envelope=excluded.envelope,encrypted_bytes=excluded.encrypted_bytes,updated_at=excluded.updated_at
    returning * into result;
  insert into public.anafim_vault_versions select result.*;
  return to_jsonb(result);
end $$;
revoke all on function public.anafim_commit_vault(uuid,uuid,uuid,jsonb,bigint) from public,anon;
grant execute on function public.anafim_commit_vault(uuid,uuid,uuid,jsonb,bigint) to authenticated;

-- Explicit deletion only; returns ciphertext paths so the owner can remove blobs.
create or replace function public.anafim_delete_vault(p_expected_revision uuid)
returns text[] language plpgsql security definer set search_path=pg_catalog,public as $$
declare u uuid:=auth.uid(); h public.anafim_vault_heads; paths text[];
begin
 if u is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select * into h from public.anafim_vault_heads where user_id=u for update;
 if h.revision_id is distinct from p_expected_revision then raise exception 'ANAFIM_CONFLICT' using errcode='40001'; end if;
 select array_agg(name) into paths from storage.objects where bucket_id='anafim-vaults' and (storage.foldername(name))[1]=u::text;
 delete from public.anafim_vault_versions where user_id=u;
 delete from public.anafim_vault_heads where user_id=u;
 return coalesce(paths,array[]::text[]);
end $$;
revoke all on function public.anafim_delete_vault(uuid) from public,anon;
grant execute on function public.anafim_delete_vault(uuid) to authenticated;

-- Optional realtime plus client polling; no plaintext is published.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='anafim_vault_heads') then
  alter publication supabase_realtime add table public.anafim_vault_heads;
 end if;
end $$;
commit;
