create table if not exists public.star_stream_documents (
  collection text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at bigint not null default 0,
  primary key (collection, id)
);
create index if not exists star_stream_documents_collection_idx on public.star_stream_documents(collection);

create or replace function public.apply_star_stream_ops(ops jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare op jsonb;
begin
  for op in select * from jsonb_array_elements(ops)
  loop
    if op->>'op' = 'delete' then
      delete from public.star_stream_documents where collection = op->>'collection' and id = op->>'id';
    elsif op->>'op' = 'update' then
      update public.star_stream_documents
      set data = coalesce(data, '{}'::jsonb) || coalesce(op->'data', '{}'::jsonb),
          updated_at = extract(epoch from clock_timestamp()) * 1000
      where collection = op->>'collection' and id = op->>'id';
      if not found then raise exception 'Document not found: %.%', op->>'collection', op->>'id'; end if;
    elsif op->>'op' = 'set' then
      insert into public.star_stream_documents(collection, id, data, updated_at)
      values (op->>'collection', op->>'id', coalesce(op->'data', '{}'::jsonb), extract(epoch from clock_timestamp()) * 1000)
      on conflict (collection, id) do update set data = excluded.data, updated_at = excluded.updated_at;
    end if;
  end loop;
end;
$$;


-- Atomic PVE battle entry: deduct coins and create the room in one PostgreSQL transaction.
create or replace function public.create_battle_room_with_fee(
  p_player_id text,
  p_fee bigint,
  p_room jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare current_data jsonb;
declare current_coins bigint;
begin
  select data into current_data
  from public.star_stream_documents
  where collection = 'characters' and id = p_player_id
  for update;

  if current_data is null then
    raise exception 'Player not found';
  end if;

  current_coins := coalesce((current_data->>'coins')::bigint, 0);
  if current_coins < greatest(0, p_fee) then
    raise exception 'Coins ไม่พอ ต้องใช้ % Coins', p_fee;
  end if;

  update public.star_stream_documents
  set data = current_data
      || jsonb_build_object(
        'coins', current_coins - greatest(0, p_fee),
        'lastUpdated', greatest(
          extract(epoch from clock_timestamp()) * 1000,
          coalesce((current_data->>'lastUpdated')::bigint, 0) + 1
        )
      ),
      updated_at = extract(epoch from clock_timestamp()) * 1000
  where collection = 'characters' and id = p_player_id;

  insert into public.star_stream_documents(collection, id, data, updated_at)
  values ('battle_rooms', p_room->>'id', p_room, extract(epoch from clock_timestamp()) * 1000)
  on conflict (collection, id) do update
    set data = excluded.data, updated_at = excluded.updated_at;
end;
$$;

-- Atomic reward claim: only the first caller can claim a completed PVE room.
create or replace function public.claim_battle_reward(
  p_room_id text,
  p_player_id text,
  p_reward bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare room_data jsonb;
declare char_data jsonb;
declare current_coins bigint;
begin
  select data into room_data
  from public.star_stream_documents
  where collection = 'battle_rooms' and id = p_room_id
  for update;

  if room_data is null
     or room_data->>'status' <> 'completed'
     or room_data->>'mode' <> 'pve'
     or room_data->>'winnerTeam' <> 'a'
     or nullif(room_data->>'rewardClaimedBy', '') is not null then
    return false;
  end if;

  select data into char_data
  from public.star_stream_documents
  where collection = 'characters' and id = p_player_id
  for update;

  if char_data is null then
    raise exception 'Player not found';
  end if;

  current_coins := coalesce((char_data->>'coins')::bigint, 0);

  update public.star_stream_documents
  set data = char_data
      || jsonb_build_object(
        'coins', current_coins + greatest(0, p_reward),
        'lastUpdated', greatest(
          extract(epoch from clock_timestamp()) * 1000,
          coalesce((char_data->>'lastUpdated')::bigint, 0) + 1
        )
      ),
      updated_at = extract(epoch from clock_timestamp()) * 1000
  where collection = 'characters' and id = p_player_id;

  update public.star_stream_documents
  set data = room_data
      || jsonb_build_object(
        'rewardClaimedBy', p_player_id,
        'updatedAt', extract(epoch from clock_timestamp()) * 1000
      ),
      updated_at = extract(epoch from clock_timestamp()) * 1000
  where collection = 'battle_rooms' and id = p_room_id;

  return true;
end;
$$;
