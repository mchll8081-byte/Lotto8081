-- Supabase SQL Editor에서 실행하세요.
-- Table: signups (이름, 전화번호, 이메일)
--
-- [Vercel 환경변수 설정]
-- SUPABASE_URL        = Project Settings → API → Project URL
--                       예: https://abcdefghijklmnop.supabase.co
--                       주의: /rest/v1 을 붙이지 마세요
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

-- RLS: 클라이언트 직접 접근 차단, 서버(service role)만 insert
alter table public.signups enable row level security;

-- anon/authenticated 사용자는 접근 불가 (API service role key 사용)
-- service role은 RLS를 우회하므로 별도 policy 불필요

-- API 스키마 캐시 갱신 (테이블 생성 직후 404가 날 때)
notify pgrst, 'reload schema';
