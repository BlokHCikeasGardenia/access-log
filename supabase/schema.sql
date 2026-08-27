# Supabase schema for Log Akses
# Run this in the Supabase SQL editor, then create an admin user (see bottom).

create extension if not exists "uuid-ossp";

create table if not exists residents (
  id          uuid primary key default uuid_generate_v4(),
  blok        text not null,
  nama        text not null,
  status      text not null default 'Active',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists cards (
  id           uuid primary key default uuid_generate_v4(),
  -- Unique constraint enforced at DB level: rejects duplicate reader UIDs.
  uid          text not null,
  label_a      text,
  label_b      text,
  resident_id  uuid references residents(id),
  card_status  text not null default 'Aktif' check (card_status in ('Aktif','Rusak','Hilang')),
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  constraint cards_uid_unique unique (uid)
);

create index if not exists cards_resident_idx on cards(resident_id);
create index if not exists cards_labelb_idx on cards(label_b);
create index if not exists residents_blok_idx on residents(blok);

-- Keep updated_at fresh
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists residents_updated_at on residents;
create trigger residents_updated_at before update on residents
  for each row execute function set_updated_at();

drop trigger if exists cards_updated_at on cards;
create trigger cards_updated_at before update on cards
  for each row execute function set_updated_at();

-- Row Level Security: authenticated users only
alter table residents enable row level security;
alter table cards enable row level security;

do $$
declare t text;
begin
  foreach t in array array['residents','cards'] loop
    execute format('drop policy if exists %I on %I;', t || '_select', t);
    execute format('drop policy if exists %I on %I;', t || '_insert', t);
    execute format('drop policy if exists %I on %I;', t || '_update', t);
    execute format('drop policy if exists %I on %I;', t || '_delete', t);

    execute format('create policy %I on %I for select to authenticated using (auth.uid() is not null);', t || '_select', t);
    execute format('create policy %I on %I for insert to authenticated with check (auth.uid() is not null);', t || '_insert', t);
    execute format('create policy %I on %I for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);', t || '_update', t);
    execute format('create policy %I on %I for delete to authenticated using (auth.uid() is not null);', t || '_delete', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Create the first admin account.
-- Option A (recommended): sign up through the app UI at /login ("Sign up"
--   is not wired in this MVP, so use Option B).
-- Option B: insert directly via the Supabase dashboard
--   (Authentication -> Users -> Add user) using a real email + password.
--   No SQL needed. The app only relies on auth.uid() being present.
-- ---------------------------------------------------------------------------
