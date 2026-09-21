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
