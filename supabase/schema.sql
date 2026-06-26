-- AI活用想像力ボード: 部屋(room)モデル + RLS + RPC + Realtime
-- Supabase の SQL Editor にこの内容を貼り付けて実行する。
-- ポイント:
--   - 参加者(anon)は「投稿」と「閲覧」だけ可能。
--   - 管理操作(非表示/移動/リセット/部屋を閉じる)は、管理者トークンを
--     検証する SECURITY DEFINER 関数(RPC)経由でのみ実行できる。
--   - アカウント不要。部屋コード+管理者トークン(推測不能)で保護する。

create extension if not exists pgcrypto;

-- ============================================================
-- テーブル
-- ============================================================
create table if not exists public.rooms (
  id          text        primary key,           -- 部屋コード(6文字)
  admin_token text        not null,              -- 管理者トークン(秘密)
  title       text        not null default '',   -- お題
  is_open     boolean     not null default true, -- 開いている間だけ投稿可
  created_at  timestamptz not null default now()
);

create table if not exists public.posts (
  id          uuid        primary key default gen_random_uuid(),
  room_id     text        not null references public.rooms(id) on delete cascade,
  body        text        not null check (char_length(body) between 1 and 100),
  x           real        not null default 0.1,  -- 正規化座標 0..1(ボード幅基準)
  y           real        not null default 0.1,  -- 正規化座標 0..1(ボード高さ基準)
  hidden      boolean     not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists posts_room_idx on public.posts(room_id, created_at);

-- ============================================================
-- RLS
--   rooms: anon に直接 SELECT は許可しない(admin_token 漏えい防止)。
--          公開情報は下の rooms_public ビュー経由で読む。
--   posts: anon は SELECT 可、INSERT は「開いている部屋」のみ可。
--          UPDATE/DELETE は不可(管理は RPC 経由)。
-- ============================================================
alter table public.rooms enable row level security;
alter table public.posts enable row level security;

-- 部屋が開いているか(insert ポリシーから利用するため先に定義)
create or replace function public.room_is_open(p_room_id text)
returns boolean
language sql security definer set search_path = public as $$
  select coalesce((select is_open from public.rooms where id = p_room_id), false);
$$;

drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts for select to anon using (true);

drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert to anon
  with check (public.room_is_open(room_id));

-- 公開ビュー(トークンを含まない)。view 所有者権限で動くので anon でも読める。
create or replace view public.rooms_public as
  select id, title, is_open, created_at from public.rooms;
grant select on public.rooms_public to anon;

-- ============================================================
-- 関数(RPC)
-- ============================================================

-- 管理者トークン検証(内部利用。anon には grant しない)
create or replace function public.verify_admin(p_room_id text, p_token text)
returns boolean
language sql security definer set search_path = public as $$
  select exists(select 1 from public.rooms where id = p_room_id and admin_token = p_token);
$$;

-- 部屋を作成し、コードと管理者トークンを返す
create or replace function public.create_room(p_title text)
returns table(room_id text, admin_token text)
language plpgsql security definer set search_path = public as $$
declare
  v_alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; -- 紛らわしい文字を除外
  v_id text;
  v_token text;
  k int;
begin
  loop
    v_id := '';
    for k in 1..6 loop
      v_id := v_id || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists(select 1 from public.rooms where id = v_id);
  end loop;
  -- 管理者トークン: pgcrypto(gen_random_bytes)に依存せず、組込みの
  -- gen_random_uuid()(pg_catalog)を2回連結して64桁の十分長い秘密値にする。
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.rooms(id, admin_token, title)
    values (v_id, v_token, coalesce(nullif(trim(p_title), ''), ''));
  return query select v_id, v_token;
end;
$$;

-- 付箋を移動(座標更新)
create or replace function public.admin_move_post(p_room_id text, p_token text, p_post_id uuid, p_x real, p_y real)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.verify_admin(p_room_id, p_token) then raise exception 'unauthorized'; end if;
  update public.posts set x = p_x, y = p_y where id = p_post_id and room_id = p_room_id;
end;
$$;

-- 付箋を非表示
create or replace function public.admin_hide_post(p_room_id text, p_token text, p_post_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.verify_admin(p_room_id, p_token) then raise exception 'unauthorized'; end if;
  update public.posts set hidden = true where id = p_post_id and room_id = p_room_id;
end;
$$;

-- 全リセット(部屋の投稿を全削除)
create or replace function public.admin_reset(p_room_id text, p_token text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.verify_admin(p_room_id, p_token) then raise exception 'unauthorized'; end if;
  delete from public.posts where room_id = p_room_id;
end;
$$;

-- 部屋を閉じる(以降は投稿不可)
create or replace function public.admin_close_room(p_room_id text, p_token text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.verify_admin(p_room_id, p_token) then raise exception 'unauthorized'; end if;
  update public.rooms set is_open = false where id = p_room_id;
end;
$$;

grant execute on function public.create_room(text)                              to anon;
grant execute on function public.room_is_open(text)                             to anon;
grant execute on function public.admin_move_post(text, text, uuid, real, real)  to anon;
grant execute on function public.admin_hide_post(text, text, uuid)              to anon;
grant execute on function public.admin_reset(text, text)                        to anon;
grant execute on function public.admin_close_room(text, text)                   to anon;

-- ============================================================
-- Realtime(posts の変更を配信。rooms はトークン保護のため配信しない)
-- 部屋を閉じた通知は、管理者→参加者へ broadcast チャンネルで送る。
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'posts'
  ) then
    alter publication supabase_realtime add table public.posts;
  end if;
end $$;

-- DELETE イベントでも全カラム(room_id 含む)を配信させる。
-- これがないと、購読フィルタ(room_id=eq.X)に DELETE が一致せず、
-- 全リセット等の削除が参加者側にリアルタイム反映されない。
alter table public.posts replica identity full;
