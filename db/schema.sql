-- うおやんクッキングメモ: 共有データベースのスキーマ（Neon Postgres）
-- 何度実行しても安全（create ... if not exists）。API が起動時に自動で実行する。
--
-- categories : カテゴリ（揚げ物、ピザ…）とその共通メモ（ピザの焼き方など）
-- menus      : 1行で1メニュー。deleted_at が入っていれば「ゴミ箱」の中（本当には消さない）
--              version は保存のたびに増える番号。2人が同時に編集したときの上書き防止に使う
-- history    : 変更履歴。誰が・いつ・何をしたか、とその時点の中身（snapshot）。ここから元に戻せる
-- meta       : 初期データを入れたかどうかの印

create table if not exists categories (
  name        text primary key check (char_length(name) between 1 and 30),
  sort        integer not null default 0,
  note_title  text not null default '',
  note_steps  jsonb not null default '[]',
  version     integer not null default 1,
  updated_at  timestamptz not null default now()
);

create table if not exists menus (
  id          uuid primary key default gen_random_uuid(),
  category    text not null,
  name        text not null check (char_length(name) between 1 and 60),
  tags        jsonb not null default '[]',
  steps       jsonb not null default '[]',
  plating     text not null default '',
  memo        text not null default '',
  sort        integer not null default 0,
  version     integer not null default 1,
  deleted_at  timestamptz,
  deleted_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text not null default ''
);

create table if not exists history (
  id          bigserial primary key,
  target      text not null check (target in ('menu', 'category')),
  target_id   text not null,
  action      text not null,
  editor      text not null,
  snapshot    jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists history_target_idx on history (target, target_id, id desc);

create table if not exists meta (
  key   text primary key,
  value text not null default ''
);

-- ---- 追加: お店のこと・お知らせ（既存のDBにも何度実行しても安全） ----
-- categories.section : 'cook'=調理 / 'shop'=お店のこと（掃除・ドリンクなど）
-- notices            : お知らせ。作ってから2週間は一番上に出て、そのあとは「過去のお知らせ」へ
alter table categories add column if not exists section text not null default 'cook';
alter table history drop constraint if exists history_target_check;

create table if not exists notices (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 60),
  body        text not null default '',
  version     integer not null default 1,
  created_at  timestamptz not null default now(),
  created_by  text not null,
  updated_at  timestamptz not null default now(),
  updated_by  text not null default '',
  deleted_at  timestamptz,
  deleted_by  text
);
