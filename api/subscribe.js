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

async function saveSignupToSupabase({ name, phone, email }) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase 환경변수(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)가 설정되지 않았습니다.');
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/signups`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ name, phone, email }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Supabase 저장 실패 (${response.status}): ${errText.slice(0, 200)}`);
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
