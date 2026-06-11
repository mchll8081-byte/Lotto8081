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

function resolveSupabaseConfig() {
  const rawUrl = process.env.SUPABASE_URL;
  const supabaseKey = stripQuotes(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!rawUrl || !supabaseKey) {
    throw new Error(
      'Supabase 환경변수가 설정되지 않았습니다. Vercel에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY를 등록해 주세요.'
    );
  }

  let baseUrl = stripQuotes(rawUrl).replace(/\/+$/, '');
  baseUrl = baseUrl.replace(/\/rest\/v1(\/.*)?$/i, '');

  if (/supabase\.com\/dashboard/i.test(baseUrl)) {
    throw new Error(
      'SUPABASE_URL에 대시보드 주소가 들어가 있습니다. Supabase → Project Settings → API → Project URL 값을 사용하세요.'
    );
  }

  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(baseUrl)) {
    throw new Error(
      'SUPABASE_URL 형식이 올바르지 않습니다. 예: https://abcdefgh.supabase.co (/rest/v1 은 붙이지 마세요)'
    );
  }

  return {
    insertUrl: `${baseUrl}/rest/v1/signups`,
    supabaseKey,
  };
}

function mapSupabaseError(status, errText) {
  let parsed = null;
  try {
    parsed = JSON.parse(errText);
  } catch {
    parsed = null;
  }

  const code = parsed?.code;
  const message = parsed?.message || errText;

  if (code === 'PGRST125') {
    return 'Supabase API 경로가 잘못되었습니다. Vercel 환경변수 SUPABASE_URL을 https://프로젝트ID.supabase.co 형식으로 수정한 뒤 재배포해 주세요.';
  }

  if (code === 'PGRST205' || /Could not find the table/i.test(message)) {
    return 'signups 테이블이 없습니다. Supabase SQL Editor에서 supabase/schema.sql 내용을 실행해 주세요.';
  }

  if (status === 401 || status === 403) {
    return 'Supabase 인증에 실패했습니다. Vercel의 SUPABASE_SERVICE_ROLE_KEY(service_role) 값을 확인해 주세요.';
  }

  return `Supabase 저장 실패 (${status}): ${message}`;
}

async function saveSignupToSupabase({ name, phone, email }) {
  const { insertUrl, supabaseKey } = resolveSupabaseConfig();

  const response = await fetch(insertUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ name, phone, email }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(mapSupabaseError(response.status, errText));
  }

  const rows = await response.json();
  return rows[0] || { name, phone, email };
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
