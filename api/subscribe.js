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
  const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!rawUrl || !rawKey) {
    throw new Error(
      'Supabase 환경변수가 설정되지 않았습니다. Vercel에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY를 등록해 주세요.'
    );
  }

  let projectUrl = stripQuotes(rawUrl).replace(/\/+$/, '');
  projectUrl = projectUrl.replace(/\/rest\/v1.*$/i, '');

  let serviceRoleKey = stripQuotes(rawKey);
  if (serviceRoleKey.startsWith('Bearer ')) {
    serviceRoleKey = serviceRoleKey.slice(7).trim();
  }

  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(projectUrl)) {
    throw new Error(
      `SUPABASE_URL 형식이 올바르지 않습니다. 예: https://uxixntantwykylxjoabs.supabase.co (현재: ${projectUrl})`
    );
  }

  if (serviceRoleKey.length < 100) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY가 올바르지 않습니다. anon 키가 아닌 service_role 키를 사용해 주세요.'
    );
  }

  return {
    insertUrl: `${projectUrl}/rest/v1/signups`,
    serviceRoleKey,
    projectUrl,
  };
}

function mapSupabaseError(status, errText, projectUrl) {
  let parsed = null;
  try {
    parsed = JSON.parse(errText);
  } catch {
    parsed = null;
  }

  const code = parsed?.code || '';
  const message = parsed?.message || errText;

  if (code === 'PGRST125') {
    return `Supabase API 경로 오류입니다. SUPABASE_URL을 ${projectUrl} 형식으로 설정해 주세요.`;
  }

  if (code === 'PGRST205' || /Could not find the table/i.test(message)) {
    return 'signups 테이블이 없습니다. Supabase SQL Editor에서 supabase/schema.sql을 실행해 주세요.';
  }

  if (code === '42501' || /permission denied|row-level security/i.test(message)) {
    return 'signups 테이블 권한이 없습니다. supabase/schema.sql의 권한·정책 구문을 다시 실행해 주세요.';
  }

  if (status === 401 || status === 403 || /Invalid API key/i.test(message)) {
    return 'Supabase API 키가 올바르지 않습니다. service_role 키를 확인해 주세요.';
  }

  return `Supabase 저장 실패 (${status}): ${message}`;
}

async function saveSignupToSupabase({ name, phone, email }) {
  const { insertUrl, serviceRoleKey, projectUrl } = resolveSupabaseConfig();

  const response = await fetch(insertUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ name, phone, email }),
  });

  const responseText = await response.text();

  if (!response.ok) {
    console.error('Supabase insert failed:', {
      status: response.status,
      body: responseText.slice(0, 500),
      insertUrl,
      projectUrl,
    });
    throw new Error(mapSupabaseError(response.status, responseText, projectUrl));
  }

  let rows = [];
  try {
    rows = responseText ? JSON.parse(responseText) : [];
  } catch {
    throw new Error('Supabase 응답을 읽을 수 없습니다.');
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('가입 정보가 저장되지 않았습니다. Supabase signups 테이블 권한을 확인해 주세요.');
  }

  return rows[0];
}

function parseRequestBody(req) {
  if (req.body == null) return {};

  if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body);
  if (!raw.trim()) return {};

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('요청 본문 JSON 형식이 올바르지 않습니다.');
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용됩니다.' });

  try {
    const body = parseRequestBody(req);
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
