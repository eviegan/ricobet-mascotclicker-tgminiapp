-- Players table
create table if not exists players (
id bigserial primary key,
tg_user_id bigint unique not null,
username text,
first_name text,
last_name text,
photo_url text,
created_at timestamptz default now(),
updated_at timestamptz default now()
);


-- Game state (authoritative)
create table if not exists game_state (
player_id bigint references players(id) on delete cascade,
tokens bigint not null default 0,
level int not null default 1,
tap_power int not null default 1,
energy numeric(10,2) not null default 0,
cap int not null default 500,
regen_per_sec numeric(6,2) not null default 1.0,
shirt_idx int not null default 0,
theme text not null default 'auto',
city jsonb not null default '{"buildings":[],"population":0}',
last_tick timestamptz not null default now(),
last_daily_bonus date,
primary key (player_id)
);


-- Purchases / audit
create table if not exists tx_log (
id bigserial primary key,
player_id bigint references players(id) on delete cascade,
kind text not null, -- 'tap','cap','regen','shirt','bg','bonus'
amount int not null default 0,
tokens_delta int not null default 0,
meta jsonb not null default '{}',
created_at timestamptz default now()
);
