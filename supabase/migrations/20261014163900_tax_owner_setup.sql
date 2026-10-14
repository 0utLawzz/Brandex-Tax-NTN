create table tax_private.owner_setup (id boolean primary key default true check(id),code_hash bytea not null,expires_at timestamptz not null,claimed_by uuid references auth.users(id),claimed_at timestamptz);
alter table tax_private.owner_setup enable row level security;
revoke all on tax_private.owner_setup from public,anon,authenticated;
create policy owner_setup_deny on tax_private.owner_setup for all to authenticated using(false) with check(false);
create function tax_private.claim_owner(p_code text) returns void language plpgsql security definer set search_path='' as $$
declare setup tax_private.owner_setup;
begin
 if auth.uid() is null then raise exception 'Sign in first' using errcode='42501'; end if;
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Confirm your email first'; end if;
 select * into setup from tax_private.owner_setup where id for update;
 if not found or setup.claimed_at is not null or setup.expires_at<now() or setup.code_hash<>extensions.digest(p_code,'sha256') then raise exception 'Setup code is invalid, expired or already used'; end if;
 if exists(select 1 from public.tax_members where role='admin' and active) then raise exception 'An administrator already exists'; end if;
 insert into public.tax_members(user_id,role,active) values(auth.uid(),'admin',true) on conflict(user_id) do update set role='admin',active=true;
 update tax_private.owner_setup set claimed_by=auth.uid(),claimed_at=now() where id;
 insert into public.tax_audit(actor_id,action,details) values(auth.uid(),'owner_setup','{"role":"admin"}');
end $$;
revoke all on function tax_private.claim_owner(text) from public,anon;
grant execute on function tax_private.claim_owner(text) to authenticated;
create function public.tax_claim_owner(p_code text) returns void language sql security invoker set search_path='' as $$select tax_private.claim_owner(p_code)$$;
revoke all on function public.tax_claim_owner(text) from public,anon;
grant execute on function public.tax_claim_owner(text) to authenticated;
