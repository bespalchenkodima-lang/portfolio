-- ============================================================
-- DMITRY PORTFOLIO — SECURE DATABASE SETUP / MIGRATION
-- ============================================================
-- ВАЖНО:
-- 1) В Supabase: Authentication -> Users -> открой свой аккаунт.
-- 2) Скопируй его User ID (UUID).
-- 3) Ниже замени 00000000-0000-0000-0000-000000000000 на свой User ID.
-- 4) Выполни весь файл в SQL Editor.
--
-- Не вставляй service_role key в сайт. Никогда.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Admin check ----------
create or replace function public.is_portfolio_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() = '50619d6f-8a63-4706-95c4-c5d2341d52c4'::uuid;
$$;

revoke all on function public.is_portfolio_admin() from public;
grant execute on function public.is_portfolio_admin() to authenticated;

-- ---------- Projects ----------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  short_description text not null default '',
  description text not null default '',
  tags text[] not null default '{}',
  cover_url text,
  gallery_urls text[] not null default '{}',
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_title_len check (char_length(title) between 1 and 120),
  constraint projects_short_len check (char_length(short_description) <= 350),
  constraint projects_desc_len check (char_length(description) <= 5000)
);

alter table public.projects enable row level security;

-- Удаляем политики из V1, которые давали права любому authenticated user.
drop policy if exists "Authenticated can read all projects" on public.projects;
drop policy if exists "Authenticated can insert projects" on public.projects;
drop policy if exists "Authenticated can update projects" on public.projects;
drop policy if exists "Authenticated can delete projects" on public.projects;

revoke all on public.projects from anon, authenticated;
grant select on public.projects to anon;
grant select, insert, update, delete on public.projects to authenticated;

drop policy if exists "Public can read published projects" on public.projects;
create policy "Public can read published projects" on public.projects for select to anon using (published = true);

drop policy if exists "Admin can read all projects" on public.projects;
create policy "Admin can read all projects" on public.projects for select to authenticated using (public.is_portfolio_admin());

drop policy if exists "Admin can insert projects" on public.projects;
create policy "Admin can insert projects" on public.projects for insert to authenticated with check (public.is_portfolio_admin());

drop policy if exists "Admin can update projects" on public.projects;
create policy "Admin can update projects" on public.projects for update to authenticated using (public.is_portfolio_admin()) with check (public.is_portfolio_admin());

drop policy if exists "Admin can delete projects" on public.projects;
create policy "Admin can delete projects" on public.projects for delete to authenticated using (public.is_portfolio_admin());

-- ---------- Servers ----------
create table if not exists public.servers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  url text,
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint servers_name_len check (char_length(name) between 1 and 100),
  constraint servers_description_len check (char_length(description) <= 700),
  constraint servers_url_len check (url is null or char_length(url) <= 300),
  constraint servers_sort_range check (sort_order between 0 and 9999)
);

alter table public.servers enable row level security;
revoke all on public.servers from anon, authenticated;
grant select on public.servers to anon;
grant select, insert, update, delete on public.servers to authenticated;

drop policy if exists "Public can read published servers" on public.servers;
create policy "Public can read published servers" on public.servers for select to anon using (published = true);

drop policy if exists "Admin can read all servers" on public.servers;
create policy "Admin can read all servers" on public.servers for select to authenticated using (public.is_portfolio_admin());

drop policy if exists "Admin can insert servers" on public.servers;
create policy "Admin can insert servers" on public.servers for insert to authenticated with check (public.is_portfolio_admin());

drop policy if exists "Admin can update servers" on public.servers;
create policy "Admin can update servers" on public.servers for update to authenticated using (public.is_portfolio_admin()) with check (public.is_portfolio_admin());

drop policy if exists "Admin can delete servers" on public.servers;
create policy "Admin can delete servers" on public.servers for delete to authenticated using (public.is_portfolio_admin());

-- ---------- Reviews ----------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  nickname text not null,
  rating smallint not null default 0,
  body text not null,
  published boolean not null default true,
  owner_added boolean not null default false,
  source_label text,
  ip_hash text,
  created_at timestamptz not null default now(),
  constraint reviews_nickname_len check (char_length(nickname) between 2 and 32),
  constraint reviews_rating_range check (rating between 0 and 5),
  constraint reviews_body_len check (char_length(body) between 10 and 1000),
  constraint reviews_source_len check (source_label is null or char_length(source_label) <= 80)
);

create index if not exists reviews_created_at_idx on public.reviews (created_at desc);
create index if not exists reviews_ip_hash_created_idx on public.reviews (ip_hash, created_at desc) where ip_hash is not null;

alter table public.reviews enable row level security;
revoke all on public.reviews from anon, authenticated;
grant select, insert, update, delete on public.reviews to authenticated;

-- Анонимный клиент НЕ получает INSERT/UPDATE/DELETE к reviews.
-- Публичные отзывы создаются только через Edge Function с Turnstile.

drop policy if exists "Admin can read reviews" on public.reviews;
create policy "Admin can read reviews" on public.reviews for select to authenticated using (public.is_portfolio_admin());

drop policy if exists "Admin can insert reviews" on public.reviews;
create policy "Admin can insert reviews" on public.reviews for insert to authenticated with check (public.is_portfolio_admin() and owner_added = true);

drop policy if exists "Admin can update reviews" on public.reviews;
create policy "Admin can update reviews" on public.reviews for update to authenticated using (public.is_portfolio_admin()) with check (public.is_portfolio_admin());

drop policy if exists "Admin can delete reviews" on public.reviews;
create policy "Admin can delete reviews" on public.reviews for delete to authenticated using (public.is_portfolio_admin());

-- Отдельное безопасное представление для сайта: ip_hash наружу не отдаётся.
drop view if exists public.review_public;
create view public.review_public
with (security_barrier = true)
as
select id, nickname, rating, body, owner_added, source_label, created_at
from public.reviews
where published = true;

revoke all on public.review_public from public;
grant select on public.review_public to anon, authenticated;

-- ---------- Storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portfolio', 'portfolio', true, 6291456, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = true,
  file_size_limit = 6291456,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- Удаляем старые слишком широкие политики, если они были из первой версии.
drop policy if exists "Public can view portfolio images" on storage.objects;
drop policy if exists "Authenticated can upload portfolio images" on storage.objects;
drop policy if exists "Authenticated can update portfolio images" on storage.objects;
drop policy if exists "Authenticated can delete portfolio images" on storage.objects;
drop policy if exists "Admin can upload portfolio images" on storage.objects;
drop policy if exists "Admin can update portfolio images" on storage.objects;
drop policy if exists "Admin can delete portfolio images" on storage.objects;

-- Bucket public: скачивание публичных картинок работает по URL.
-- Все изменения файлов только от конкретного admin UID.
create policy "Admin can upload portfolio images"
on storage.objects for insert to authenticated
with check (bucket_id = 'portfolio' and public.is_portfolio_admin());

create policy "Admin can update portfolio images"
on storage.objects for update to authenticated
using (bucket_id = 'portfolio' and public.is_portfolio_admin())
with check (bucket_id = 'portfolio' and public.is_portfolio_admin());

create policy "Admin can delete portfolio images"
on storage.objects for delete to authenticated
using (bucket_id = 'portfolio' and public.is_portfolio_admin());
