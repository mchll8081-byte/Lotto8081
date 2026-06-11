const MODEL = 'gemini-2.5-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

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
  const yearMod = ((birthYear % 45) || 45);

  let conversation = '';
  if (history?.length) {
    conversation = '\n\n이전 대화:\n' + history.map((m) => `${m.role === 'user' ? '사용자' : '상담'}: ${m.text}`).join('\n');
  }

  const userRequest = message?.trim()
    ? `\n\n사용자 요청: ${message.trim()}`
    : '\n\n사용자 요청: 출생년도와 역대 추첨 빈도를 바탕으로 로또 번호 6개와 보너스 1개를 추천해 주세요.';

  return `당신은 동행복권 로또6/45 번호 추천 챗봇입니다.
동행복권 통계 페이지(lt645/stats)와 같은 방식의 역대 당첨번호 빈도를 참고합니다.

## 역대 추첨 통계 (1회~${stats.totalDraws}회, 당첨 6개 번호 기준)
- 가장 많이 나온 번호 TOP 10: ${top10}
- 가장 적게 나온 번호 BOTTOM 10: ${bottom10}
- 빈도 TOP 6: ${top6}
- 빈도 BOTTOM 6: ${bottom6}

## 사용자 정보
- 출생년도: ${birthYear}년 (만 ${age}세)
- 출생년도 숫자 합: ${yearDigitSum}
- 출생년도 끝 두 자리: ${yearLastTwo}
- 출생년도 ÷ 45 나머지(1~45): ${yearMod}
${conversation}${userRequest}

## 지침
1. 역대 추첨 빈도가 높은 번호와 출생년도에서 파생된 숫자를 조합해 추천하세요.
2. 6개 메인 번호는 1~45 중 중복 없이 오름차순, 보너스는 메인에 없는 번호 1개.
3. explanation에는 (a) 어떤 고빈도/저빈도 번호를 참고했는지 (b) 출생년도와 어떻게 연결했는지를 한국어로 구체적으로 작성하세요.
4. 로또는 확률 게임임을 한 문장 포함하세요.
5. JSON만 출력하세요.

{"main":[6개 정수],"bonus":정수,"explanation":"추천 이유"}`;
}

async function callGemini(apiKey, prompt) {
  const response = await fetch(GEMINI_URL, {
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
            main: {
              type: 'array',
              items: { type: 'integer' },
            },
            bonus: { type: 'integer' },
            explanation: { type: 'string' },
          },
          required: ['main', 'bonus', 'explanation'],
        },
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini 응답이 비어 있습니다.');

  return JSON.parse(text);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용됩니다.' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' });
  }

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

    const prompt = buildPrompt({ birthYear: year, age, stats, message, history });
    let result = await callGemini(apiKey, prompt);

    result.main = [...result.main].sort((a, b) => a - b);

    if (!validateNumbers(result.main, result.bonus)) {
      throw new Error('AI가 유효하지 않은 번호를 반환했습니다.');
    }

    return res.status(200).json({
      main: result.main,
      bonus: result.bonus,
      explanation: result.explanation,
    });
  } catch (err) {
    console.error('recommend error:', err);
    return res.status(500).json({ error: err.message || '번호 추천 중 오류가 발생했습니다.' });
  }
};
