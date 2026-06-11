const { createClient } = require('@supabase/supabase-js');

function validateSignupInput({ name, phone, email }) {
  const trimmedName = (name || '').trim();
  const trimmedPhone = (phone || '').trim();
  const trimmedEmail = (email || '').trim().toLowerCase();

  if (trimmedName.length < 2) {
    return { ok: false, error: '이름을 2자 이상 입력해 주세요.' };
  }

  const phoneDigits = trimmedPhone.replace(/\D/g, '');
  if (!/^01[016789]\d{7,8}$/.test(phoneDigits)) {
    return { ok: false, error: '올바른 전화번호 형식(010-0000-0000)을 입력해 주세요.' };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return { ok: false, error: '올바른 이메일 주소를 입력해 주세요.' };
  }

  return {
    ok: true,
    data: {
      name: trimmedName,
      phone: trimmedPhone,
      email: trimmedEmail,
    },
  };
}

function stripQuotes(value) {
  return (value || '').trim().replace(/^["']|["']$/g, '');
}

function normalizeSupabaseProjectUrl(rawUrl) {
  let url = stripQuotes(rawUrl);

  if (!url) {
    throw new Error(
      'SUPABASE_URL이 비어 있습니다. Vercel 환경변수에 프로젝트 URL을 등록해 주세요.'
    );
  }

  url = url.replace(/\/+$/, '');
  url = url.replace(/\/rest\/v1.*$/i, '');

  if (/supabase\.com\/dashboard/i.test(url)) {
    throw new Error(
      'SUPABASE_URL에 대시보드 주소가 들어가 있습니다. Supabase → Project Settings → API → Project URL 값을 사용하세요.'
    );
  }

  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
    throw new Error(
      `SUPABASE_URL 형식이 올바르지 않습니다. 현재 값: ${url}. 올바른 예: https://uxixntantwykylxjoabs.supabase.co`
    );
  }

  return url;
}

function normalizeServiceRoleKey(rawKey) {
  let key = stripQuotes(rawKey);

  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY가 비어 있습니다. Supabase → Project Settings → API → service_role 키를 등록해 주세요.'
    );
  }

  if (key.startsWith('Bearer ')) {
    key = key.slice(7).trim();
  }

  if (key.length < 100) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY가 너무 짧습니다. anon 키가 아닌 service_role 키인지 확인해 주세요.'
    );
  }

  return key;
}

function createSupabaseAdmin() {
  const projectUrl = normalizeSupabaseProjectUrl(process.env.SUPABASE_URL);
  const serviceRoleKey = normalizeServiceRoleKey(process.env.SUPABASE_SERVICE_ROLE_KEY);

  const client = createClient(projectUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return { client, projectUrl };
}

function mapSupabaseError(error, projectUrl) {
  const code = error?.code || '';
  const message = error?.message || '알 수 없는 오류';
  const details = error?.details || '';
  const hint = error?.hint || '';

  if (code === 'PGRST125') {
    return [
      'Supabase API 경로 오류(PGRST125)입니다.',
      `등록된 프로젝트 URL: ${projectUrl}`,
      'Vercel SUPABASE_URL을 https://uxixntantwykylxjoabs.supabase.co 처럼 /rest/v1 없이 설정하고 재배포해 주세요.',
    ].join(' ');
  }

  if (code === 'PGRST205' || /Could not find the table/i.test(message)) {
    return 'signups 테이블이 없습니다. Supabase SQL Editor에서 supabase/schema.sql 내용을 실행해 주세요.';
  }

  if (code === '42501' || /permission denied/i.test(message)) {
    return 'signups 테이블 권한이 없습니다. supabase/schema.sql을 다시 실행해 주세요.';
  }

  if (/Invalid API key/i.test(message)) {
    return 'Supabase API 키가 올바르지 않습니다. service_role 키를 다시 복사해 Vercel에 등록해 주세요.';
  }

  return `Supabase 저장 실패: ${message}${details ? ` (${details})` : ''}${hint ? ` — ${hint}` : ''}`;
}

async function saveSignupToSupabase({ name, phone, email }) {
  const { client, projectUrl } = createSupabaseAdmin();

  const { data, error } = await client
    .from('signups')
    .insert({ name, phone, email })
    .select('id, name, phone, email, created_at')
    .single();

  if (error) {
    console.error('Supabase insert error:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      projectUrl,
    });
    throw new Error(mapSupabaseError(error, projectUrl));
  }

  return data;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용됩니다.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const validation = validateSignupInput(body);

    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }

    const saved = await saveSignupToSupabase(validation.data);

    return res.status(201).json({
      success: true,
      id: saved.id,
      message: '가입 신청이 저장되었습니다.',
    });
  } catch (err) {
    console.error('subscribe error:', err);
    return res.status(500).json({ error: err.message || '가입 저장 중 오류가 발생했습니다.' });
  }
};
