create table if not exists public.paintings (
  id          uuid primary key default gen_random_uuid(),
  title_es    text,
  title_en    text,
  year        int,
  medium_es   text default 'Óleo sobre tela',
  medium_en   text default 'Oil on canvas',
  width_cm    numeric,
  height_cm   numeric,
  price_usd   numeric,
  price_ars   numeric,
  status      text not null default 'draft' check (status in ('draft','available','reserved','sold')),
  reserved_at timestamptz,
  image_url   text,
  category    text,
  sort_order  int default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  painting_id    uuid references public.paintings(id),
  buyer_name     text,
  buyer_email    text,
  payment_method text,
  amount         numeric,
  currency       text,
  created_at     timestamptz not null default now()
);

alter table public.paintings enable row level security;
alter table public.orders enable row level security;

drop policy if exists public_read_paintings on public.paintings;
create policy public_read_paintings on public.paintings for select using (status <> 'draft');

insert into storage.buckets (id, name, public)
values ('paintings', 'paintings', true)
on conflict (id) do nothing;

drop policy if exists public_read_paintings_bucket on storage.objects;
create policy public_read_paintings_bucket on storage.objects for select using (bucket_id = 'paintings');
