-- Independent tax module; existing trademark tables/policies are untouched.
create schema if not exists tax_private;
revoke all on schema tax_private from public,anon,authenticated;
grant usage on schema tax_private to authenticated,service_role;
create table public.tax_members (
 user_id uuid primary key references auth.users(id), role text not null check(role in ('admin','officer','billing','viewer')),
 active boolean not null default true, created_at timestamptz not null default now()
);
create function tax_private.role() returns text language sql stable security definer set search_path='' as $$
 select role from public.tax_members where user_id=auth.uid() and active and auth.uid() is not null
$$;
revoke all on function tax_private.role() from public;
grant execute on function tax_private.role() to authenticated,service_role;
create table public.tax_clients (
 id uuid primary key default gen_random_uuid(), code text not null unique, name text not null check(length(trim(name)) between 1 and 200),
 cnic text not null default '', ntn text not null default '', mobile text not null default '', email text not null default '',
 client_type text not null default 'Individual' check(client_type in ('Individual','AOP','Company')),
 fbr_status text not null default 'Unknown' check(fbr_status in ('Active','Inactive','Unknown')),
 drive_url text not null default '', labels text[] not null default '{}', general_notes text not null default '',
 archived boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index tax_clients_name_idx on public.tax_clients(lower(name) text_pattern_ops);
create index tax_clients_cnic_idx on public.tax_clients(cnic);
create index tax_clients_ntn_idx on public.tax_clients(ntn);
create function tax_private.normalize_client() returns trigger language plpgsql set search_path='' as $$
 declare parts text[];
 begin
 parts:=regexp_match(upper(trim(new.code)),'^([A-Z]+)[ -]*([0-9]+)$');
 if parts is null then raise exception 'Invalid Client Code'; end if;
 new.code:=parts[1]||'-'||(parts[2]::bigint)::text;
 if tg_op='UPDATE' and new.code<>old.code then raise exception 'Client Code is permanent'; end if;
 new.updated_at:=now(); return new;
 end $$;
create trigger tax_client_code before insert or update on public.tax_clients for each row execute function tax_private.normalize_client();
create table public.tax_years (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.tax_clients(id),
 tax_year integer not null check(tax_year between 2000 and 2100),
 filing_status text not null default 'Due' check(filing_status in ('Due','Documents pending','In progress','Filed','On hold')),
 due_date date, filed_at date, filing_reference text not null default '', service_charge numeric(12,2) not null default 0 check(service_charge>=0),
 notes text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(client_id,tax_year), check(filing_status<>'Filed' or filed_at is not null)
);
create index tax_years_client_idx on public.tax_years(client_id);
create table public.tax_payments (
 id uuid primary key default gen_random_uuid(), year_id uuid not null references public.tax_years(id),
 amount numeric(12,2) not null check(amount>0), paid_on date not null, method text not null check(method in ('Cash','Bank','Online','Cheque')),
 reference text not null default '', receipt_no bigint generated always as identity unique,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 voided boolean not null default false, void_reason text,
 idempotency_key uuid not null unique, snapshot jsonb not null
);
create index tax_payments_year_idx on public.tax_payments(year_id);
create table public.tax_notes (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.tax_clients(id),
 body text not null check(length(trim(body)) between 1 and 10000), created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create index tax_notes_client_idx on public.tax_notes(client_id);
create table public.tax_labels (name text primary key check(length(trim(name)) between 1 and 50), color text not null default '#7b2639');
create table public.tax_settings (id boolean primary key default true check(id), firm_name text not null default 'BRANDEX', address text not null default '', phone text not null default '', currency text not null default 'PKR' check(currency='PKR'));
insert into public.tax_settings(id) values(true);
insert into public.tax_labels(name) values('Salary'),('Business'),('VIP');
create table public.tax_documents (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.tax_clients(id),
 kind text not null check(kind in ('ntn','certificate')), path text not null unique, original_name text not null,
 size_bytes bigint not null check(size_bytes between 1 and 10485760), uploaded_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index tax_documents_client_idx on public.tax_documents(client_id);
create table tax_private.credentials (
 client_id uuid primary key references public.tax_clients(id), secret_id uuid not null, updated_at timestamptz not null default now(),
 verified_at date, registered_mobile text not null default '', registered_email text not null default ''
);
alter table tax_private.credentials enable row level security;
revoke all on tax_private.credentials from public,anon,authenticated;
create table public.tax_audit (
 id bigint generated always as identity primary key, actor_id uuid, client_id uuid references public.tax_clients(id),
 action text not null, details jsonb not null default '{}', created_at timestamptz not null default now()
);
create index tax_audit_client_idx on public.tax_audit(client_id,created_at desc);
create index tax_audit_actor_idx on public.tax_audit(actor_id,created_at desc);
do $$ declare t text; begin
 foreach t in array array['tax_members','tax_clients','tax_years','tax_payments','tax_notes','tax_labels','tax_settings','tax_documents','tax_audit'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy tax_members_read on public.tax_members for select to authenticated using(user_id=auth.uid() or tax_private.role()='admin');
do $$ declare t text; begin
 foreach t in array array['tax_clients','tax_years','tax_payments','tax_notes','tax_labels','tax_settings'] loop
 execute format('create policy tax_staff_read on public.%I for select to authenticated using (tax_private.role() in (''admin'',''officer'',''billing'',''viewer''))',t);
 end loop;
end $$;
create policy tax_documents_read on public.tax_documents for select to authenticated using(tax_private.role() in ('admin','officer'));
create policy tax_audit_read on public.tax_audit for select to authenticated using(tax_private.role() in ('admin','officer'));
-- No client Storage SELECT/INSERT policy: PDFs go through audited Edge endpoint.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('tax-private-documents','tax-private-documents',false,10485760,array['application/pdf']);
-- Restrictive guard also prevents existing permissive policies from accidentally exposing this bucket.
create policy tax_document_guard on storage.objects as restrictive for all to anon,authenticated
using(bucket_id<>'tax-private-documents') with check(bucket_id<>'tax-private-documents');

create function tax_private.command(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 r text:=tax_private.role(); uid uuid:=auth.uid(); cid uuid; yid uuid; result jsonb:='{}'; c public.tax_clients;
 y public.tax_years; pay public.tax_payments; cred tax_private.credentials; sid uuid;
 total numeric; payload jsonb; target uuid;
begin
 if uid is null or r is null then raise exception 'Tax module access denied' using errcode='42501'; end if;
 if p_action in ('settings','member','label','payment_void') and r<>'admin' then raise exception 'Administrator required' using errcode='42501'; end if;
 if p_action in ('client_create','client_update','archive','year_save','note','credential_save','credential_reveal','document_access') and r not in ('admin','officer') then raise exception 'Tax officer required' using errcode='42501'; end if;
 if p_action='payment' and r not in ('admin','officer','billing') then raise exception 'Billing access required' using errcode='42501'; end if;
 cid:=nullif(p_data->>'client_id','')::uuid;
 if cid is not null then
 select * into c from public.tax_clients where id=cid for update;
 if not found then raise exception 'Client not found'; end if;
 if c.archived and p_action not in ('archive','credential_meta') then raise exception 'Restore archived client first'; end if;
 end if;
 case p_action
 when 'client_create' then
 insert into public.tax_clients(code,name,cnic,ntn,mobile,email,client_type,fbr_status,drive_url,labels,general_notes)
 values(p_data->>'code',trim(p_data->>'name'),coalesce(p_data->>'cnic',''),coalesce(p_data->>'ntn',''),coalesce(p_data->>'mobile',''),coalesce(p_data->>'email',''),coalesce(p_data->>'client_type','Individual'),coalesce(p_data->>'fbr_status','Unknown'),coalesce(p_data->>'drive_url',''),array(select jsonb_array_elements_text(coalesce(p_data->'labels','[]'))),coalesce(p_data->>'general_notes',''))
 returning id,to_jsonb(tax_clients) into cid,result;
 when 'client_update' then
 if cid is null then raise exception 'Client required'; end if;
 update public.tax_clients set name=trim(p_data->>'name'),cnic=coalesce(p_data->>'cnic',''),ntn=coalesce(p_data->>'ntn',''),mobile=coalesce(p_data->>'mobile',''),email=coalesce(p_data->>'email',''),client_type=p_data->>'client_type',fbr_status=p_data->>'fbr_status',drive_url=coalesce(p_data->>'drive_url',''),labels=array(select jsonb_array_elements_text(coalesce(p_data->'labels','[]'))),general_notes=coalesce(p_data->>'general_notes','') where id=cid returning to_jsonb(tax_clients) into result;
 when 'archive' then
 if cid is null then raise exception 'Client required'; end if;
 update public.tax_clients set archived=(p_data->>'archived')::boolean where id=cid;
 when 'year_save' then
 if cid is null then raise exception 'Client required'; end if;
 insert into public.tax_years(client_id,tax_year,filing_status,due_date,filed_at,filing_reference,service_charge,notes)
 values(cid,(p_data->>'tax_year')::int,p_data->>'filing_status',nullif(p_data->>'due_date','')::date,nullif(p_data->>'filed_at','')::date,coalesce(p_data->>'filing_reference',''),(p_data->>'service_charge')::numeric,coalesce(p_data->>'notes',''))
 on conflict(client_id,tax_year) do update set filing_status=excluded.filing_status,due_date=excluded.due_date,filed_at=excluded.filed_at,filing_reference=excluded.filing_reference,service_charge=excluded.service_charge,notes=excluded.notes,updated_at=now()
 returning to_jsonb(tax_years),id into result,yid;
 select coalesce(sum(amount),0) into total from public.tax_payments where year_id=yid and not voided;
 if total>(p_data->>'service_charge')::numeric then raise exception 'Charge cannot be below payments received'; end if;
 when 'payment' then
 yid:=(p_data->>'year_id')::uuid;
 select * into y from public.tax_years where id=yid for update;
 if not found then raise exception 'Tax year not found'; end if;
 cid:=y.client_id; select * into c from public.tax_clients where id=cid;
 if c.archived then raise exception 'Restore archived client first'; end if;
 select * into pay from public.tax_payments where idempotency_key=(p_data->>'idempotency_key')::uuid;
 if found then
 if pay.year_id<>yid or pay.created_by<>uid then raise exception 'Payment request conflict'; end if;
 return to_jsonb(pay);
 end if;
 select coalesce(sum(amount),0) into total from public.tax_payments where year_id=yid and not voided;
 if total+(p_data->>'amount')::numeric>y.service_charge then raise exception 'Payment exceeds outstanding balance'; end if;
 payload:=jsonb_build_object('client_code',c.code,'client_name',c.name,'tax_year',y.tax_year,'charge',y.service_charge,'filing_status',y.filing_status,'paid_before',total,'firm',(select to_jsonb(s) from public.tax_settings s where id));
 insert into public.tax_payments(year_id,amount,paid_on,method,reference,created_by,idempotency_key,snapshot)
 values(yid,(p_data->>'amount')::numeric,(p_data->>'paid_on')::date,p_data->>'method',coalesce(p_data->>'reference',''),uid,(p_data->>'idempotency_key')::uuid,payload) returning to_jsonb(tax_payments) into result;
 when 'payment_void' then
 if length(trim(coalesce(p_data->>'reason','')))<5 then raise exception 'Void reason required'; end if;
 select * into pay from public.tax_payments where id=(p_data->>'payment_id')::uuid for update;
 if not found or pay.voided then raise exception 'Payment unavailable'; end if;
 select client_id into cid from public.tax_years where id=pay.year_id;
 update public.tax_payments set voided=true,void_reason=p_data->>'reason' where id=pay.id;
 when 'note' then
 if cid is null then raise exception 'Client required'; end if;
 insert into public.tax_notes(client_id,body,created_by) values(cid,p_data->>'body',uid);
 when 'credential_save' then
 if cid is null then raise exception 'Client required'; end if;
 if length(coalesce(p_data->>'password','')) not between 1 and 500 or length(coalesce(p_data->>'pin','')) not between 1 and 100 then raise exception 'Password and PIN required'; end if;
 payload:=jsonb_build_object('password',p_data->>'password','pin',p_data->>'pin');
 select * into cred from tax_private.credentials where client_id=cid;
 if found then perform vault.update_secret(cred.secret_id,payload::text); sid:=cred.secret_id;
 else sid:=vault.create_secret(payload::text); end if;
 insert into tax_private.credentials(client_id,secret_id,verified_at,registered_mobile,registered_email)
 values(cid,sid,nullif(p_data->>'verified_at','')::date,coalesce(p_data->>'registered_mobile',''),coalesce(p_data->>'registered_email',''))
 on conflict(client_id) do update set updated_at=now(),verified_at=excluded.verified_at,registered_mobile=excluded.registered_mobile,registered_email=excluded.registered_email;
 when 'credential_meta' then
 if r not in ('admin','officer') then raise exception 'Tax officer required'; end if;
 select jsonb_build_object('exists',true,'updated_at',updated_at,'verified_at',verified_at,'registered_mobile',registered_mobile,'registered_email',registered_email) into result from tax_private.credentials where client_id=cid;
 return coalesce(result,'{"exists":false}');
 when 'credential_reveal' then
 if length(trim(coalesce(p_data->>'reason','')))<5 then raise exception 'Reveal purpose required'; end if;
 if (select count(*) from public.tax_audit where actor_id=uid and action='credential_reveal' and created_at>now()-interval '1 minute')>=10 then raise exception 'Reveal rate limit reached'; end if;
 select * into cred from tax_private.credentials where client_id=cid;
 if not found then raise exception 'Credentials have not been saved'; end if;
 select decrypted_secret::jsonb into result from vault.decrypted_secrets where id=cred.secret_id;
 when 'document_access' then
 if cid is null then raise exception 'Client required'; end if;
 if length(trim(coalesce(p_data->>'reason','')))<5 then raise exception 'Document retrieval purpose required'; end if;
 if not exists(select 1 from public.tax_documents where id=(p_data->>'document_id')::uuid and client_id=cid) then raise exception 'Document unavailable'; end if;
 when 'label' then
 insert into public.tax_labels(name,color) values(trim(p_data->>'name'),coalesce(p_data->>'color','#7b2639')) on conflict(name) do update set color=excluded.color;
 when 'settings' then
 update public.tax_settings set firm_name=trim(p_data->>'firm_name'),address=coalesce(p_data->>'address',''),phone=coalesce(p_data->>'phone','') where id;
 when 'member' then
 target:=(p_data->>'user_id')::uuid;
 -- Serialize admin changes to preserve at least one active administrator.
 perform pg_advisory_xact_lock(14102026);
 if target=uid and ((p_data->>'role')<>'admin' or not (p_data->>'active')::boolean) then raise exception 'Cannot remove your own administrator access'; end if;
 insert into public.tax_members(user_id,role,active) values(target,p_data->>'role',(p_data->>'active')::boolean) on conflict(user_id) do update set role=excluded.role,active=excluded.active;
 else raise exception 'Unknown action';
 end case;
 -- Never record passwords, PINs, CNICs, or document data in audit payloads.
 insert into public.tax_audit(actor_id,client_id,action,details)
 values(uid,cid,p_action,jsonb_build_object('reason',left(coalesce(p_data->>'reason',''),500),'tax_year',p_data->>'tax_year','target_user',target,'year_id',yid,'role',case when p_action='member' then p_data->>'role' end,'document_id',p_data->>'document_id','receipt_no',result->>'receipt_no','filing_status',p_data->>'filing_status'));
 return coalesce(result,'{}');
end $$;
revoke all on function tax_private.command(text,jsonb) from public,anon;
grant execute on function tax_private.command(text,jsonb) to authenticated;
create function public.tax_command(p_action text,p_data jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select tax_private.command(p_action,p_data)$$;
revoke all on function public.tax_command(text,jsonb) from public,anon;
grant execute on function public.tax_command(text,jsonb) to authenticated;

-- Only the Edge service can register a verified upload; client callers cannot forge metadata/audit.
create function public.tax_register_document(p_actor uuid,p_client uuid,p_kind text,p_path text,p_name text,p_size bigint) returns uuid
language plpgsql security invoker set search_path='' as $$
declare did uuid;
begin
 if not exists(select 1 from public.tax_members where user_id=p_actor and active and role in ('admin','officer')) then raise exception 'Access denied'; end if;
 if not exists(select 1 from public.tax_clients where id=p_client and not archived) then raise exception 'Client unavailable'; end if;
 if p_path not like p_client::text||'/'||p_kind||'/%' or p_kind not in ('ntn','certificate') then raise exception 'Invalid path'; end if;
 insert into public.tax_documents(client_id,kind,path,original_name,size_bytes,uploaded_by) values(p_client,p_kind,p_path,p_name,p_size,p_actor) returning id into did;
 insert into public.tax_audit(actor_id,client_id,action,details) values(p_actor,p_client,'document_upload',jsonb_build_object('kind',p_kind,'document_id',did));
 return did;
end $$;
revoke all on function public.tax_register_document(uuid,uuid,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.tax_register_document(uuid,uuid,text,text,text,bigint) to service_role;
grant all on public.tax_members,public.tax_clients,public.tax_years,public.tax_payments,public.tax_notes,public.tax_labels,public.tax_settings,public.tax_documents,public.tax_audit to service_role;
grant usage,select on sequence public.tax_audit_id_seq,public.tax_payments_receipt_no_seq to service_role;
-- Default PUBLIC execute is removed from private trigger helper too.
revoke all on function tax_private.normalize_client() from public,anon,authenticated;
