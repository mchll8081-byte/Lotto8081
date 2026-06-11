-- Supabase SQL Editor에서 전체 실행하세요.
-- Table: signups (이름, 전화번호, 이메일)
--
-- [Vercel 환경변수]
-- SUPABASE_URL = https://uxixntantwykylxjoabs.supabase.co  (/rest/v1 붙이지 않음)
-- SUPABASE_SERVICE_ROLE_KEY = Project Settings → API → service_role (secret)

create table if not exists public.signups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) >= 2),
  phone text not null,
  email text not null check (position('@' in email) > 1),
  created_at timestamptz not null default now()
);

create index if not exists signups_created_at_idx on public.signups (created_at desc);
create index if not exists signups_email_idx on public.signups (email);

comment on table public.signups is 'AI 로또 추천 서비스 가입 신청';

alter table public.signups enable row level security;

-- 권한 (service_role + 대시보드 조회용 postgres)
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all privileges on table public.signups to postgres, service_role;
grant select, insert, update, delete on table public.signups to service_role;

-- RLS 정책: service_role은 insert/select 허용
drop policy if exists "service_role_all_signups" on public.signups;
create policy "service_role_all_signups"
  on public.signups
  for all
  to service_role
  using (true)
  with check (true);

-- API 스키마 캐시 갱신
notify pgrst, 'reload schema';

-- [확인] Table Editor → public → signups 에서 저장된 가입 정보 확인
