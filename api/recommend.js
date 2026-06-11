const { generateLocalRecommendation } = require('./recommend-fallback');

const MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
];

function validateNumbers(main, bonus) {
  if (!Array.isArray(main) || main.length !== 6) return false;
  const set = new Set(main);
  if (set.size !== 6) return false;
  for (const n of main) {
    if (!Number.isInteger(n) || n < 1 || n > 45) return false;
  }
  if (!Number.isInteger(bonus) || bonus < 1 || bonus > 45) return false;
  if (main.includes(bonus)) return false;
  return true;
}

function buildPrompt({ birthYear, age, stats, message, history }) {
  const top10 = stats.topFrequent.slice(0, 10).map((x) => `${x.num}(${x.count}회)`).join(', ');
  const bottom10 = stats.leastFrequent.slice(0, 10).map((x) => `${x.num}(${x.count}회)`).join(', ');
  const top6 = stats.topFrequent.slice(0, 6).map((x) => x.num).join(', ');
  const bottom6 = stats.leastFrequent.slice(0, 6).map((x) => x.num).join(', ');

  const yearDigitSum = String(birthYear).split('').reduce((s, d) => s + Number(d), 0);
  const yearLastTwo = birthYear % 100;
  const yearMod = (birthYear % 45) || 45;

  let conversation = '';
  if (history?.length) {
    conversation = '\n\n이전 대화:\n' + history.map((m) => `${m.role === 'user' ? '사용자' : '상담'}: ${m.text}`).join('\n');
  }

  const userRequest = message?.trim()
    ? `\n\n사용자 요청: ${message.trim()}`
    : '\n\n사용자 요청: 출생년도와 역대 추첨 빈도를 바탕으로 로또 번호 6개와 보너스 1개를 추천해 주세요.';

  return `당신은 동행복권 로또6/45 번호 추천 챗봇입니다.

## 역대 추첨 통계 (1회~${stats.totalDraws}회)
- TOP 10: ${top10}
- BOTTOM 10: ${bottom10}
- TOP 6: ${top6} / BOTTOM 6: ${bottom6}

## 사용자: ${birthYear}년생 (만 ${age}세), 숫자합 ${yearDigitSum}, mod45 ${yearMod}, 끝자리 ${yearLastTwo}
${conversation}${userRequest}

6개 main(1~45, 중복없음, 오름차순) + bonus 1개. explanation은 한국어로 고빈도·출생년도 근거 포함. JSON만:
{"main":[...],"bonus":N,"explanation":"..."}`;
}

function parseGeminiJson(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('AI 응답 JSON 파싱에 실패했습니다.');
  }
}

async function callGeminiModel(apiKey, model, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.8,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            main: { type: 'array', items: { type: 'integer' } },
            bonus: { type: 'integer' },
            explanation: { type: 'string' },
          },
          required: ['main', 'bonus', 'explanation'],
        },
      },
    }),
  });

  const errText = !response.ok ? await response.text() : '';
  if (!response.ok) {
    const err = new Error(`Gemini ${model} (${response.status}): ${errText.slice(0, 300)}`);
    err.status = response.status;
    err.retryable = response.status === 429 || response.status >= 500;
    throw err;
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini 응답이 비어 있습니다.');
  return parseGeminiJson(text);
}

async function callGemini(apiKey, prompt) {
  let lastError;
  for (const model of MODELS) {
    try {
      return await callGeminiModel(apiKey, model, prompt);
    } catch (err) {
      lastError = err;
      if (err.status === 404) continue;
      if (err.retryable) throw err;
      throw err;
    }
  }
  throw lastError || new Error('사용 가능한 Gemini 모델이 없습니다.');
}

function shouldUseFallback(err) {
  if (!err) return true;
  const msg = err.message || '';
  return err.status === 429
    || err.status >= 500
    || msg.includes('quota')
    || msg.includes('Quota')
    || msg.includes('RESOURCE_EXHAUSTED');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용됩니다.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { birthYear, stats, message, history } = body;

    const currentYear = new Date().getFullYear();
    const year = parseInt(birthYear, 10);

    if (!Number.isInteger(year) || year < 1920 || year > currentYear) {
      return res.status(400).json({ error: '유효한 출생년도가 필요합니다.' });
    }

    const age = currentYear - year;
    if (age < 19) {
      return res.status(400).json({ error: '만 19세 이상만 이용할 수 있습니다.' });
    }

    if (!stats?.totalDraws || !Array.isArray(stats.topFrequent) || !Array.isArray(stats.leastFrequent)) {
      return res.status(400).json({ error: '추첨 빈도 통계 데이터가 필요합니다.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      const local = generateLocalRecommendation(year, stats, '⚠️ GEMINI_API_KEY가 설정되지 않아 통계 기반 추천을 제공합니다.');
      return res.status(200).json(local);
    }

    const prompt = buildPrompt({ birthYear: year, age, stats, message, history });

    try {
      let result = await callGemini(apiKey, prompt);
      result.main = [...result.main].sort((a, b) => a - b);

      if (!validateNumbers(result.main, result.bonus)) {
        throw new Error('AI가 유효하지 않은 번호를 반환했습니다.');
      }

      return res.status(200).json({
        main: result.main,
        bonus: result.bonus,
        explanation: result.explanation,
        source: 'gemini',
      });
    } catch (geminiErr) {
      console.error('Gemini error:', geminiErr.message);
      const note = shouldUseFallback(geminiErr)
        ? '⚠️ AI API 할당량/일시 오류로 통계 기반 추천으로 전환했습니다.'
        : `⚠️ AI 호출 실패: ${geminiErr.message}`;
      const local = generateLocalRecommendation(year, stats, note);
      return res.status(200).json(local);
    }
  } catch (err) {
    console.error('recommend error:', err);
    return res.status(500).json({ error: err.message || '번호 추천 중 오류가 발생했습니다.' });
  }
};
