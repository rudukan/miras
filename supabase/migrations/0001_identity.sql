-- 0001_identity: profiles + saves, varsayilan ret / acik izin durusu

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null,
  created_at timestamptz not null default now(),
  constraint nickname_format check (nickname ~ '^[A-Za-z0-9_çğıöşüÇĞİÖŞÜ]{3,20}$')
);
create unique index profiles_nickname_lower_idx on public.profiles (lower(nickname));

create table public.saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  schema_version int not null,
  updated_at timestamptz not null default now()
);

-- updated_at sunucu saatiyle atilir; client kendi zamanini yazamaz
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;
create trigger saves_touch before insert or update on public.saves
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.saves enable row level security;

-- GRANT katmani: once hepsini kapat, sonra gerekeni ac (spec §4 matrisi)
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.saves from anon, authenticated;

grant select on table public.profiles to anon, authenticated;
grant insert (id, nickname), update (nickname) on table public.profiles to authenticated;
grant select, insert (user_id, payload, schema_version), update (payload, schema_version)
  on table public.saves to authenticated;

-- RLS katmani
create policy profiles_select_all on public.profiles
  for select using (true);
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy saves_select_own on public.saves
  for select to authenticated using (user_id = auth.uid());
create policy saves_insert_own on public.saves
  for insert to authenticated with check (user_id = auth.uid());
create policy saves_update_own on public.saves
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
