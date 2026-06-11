function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateLocalRecommendation(birthYear, stats, reasonNote = '') {
  const topNums = stats.topFrequent.slice(0, 15).map((x) => x.num);
  const bottomNums = stats.leastFrequent.slice(0, 10).map((x) => x.num);
  const yearSum = String(birthYear).split('').reduce((s, d) => s + Number(d), 0);
  const derived = [...new Set([
    (yearSum % 45) || 45,
    (birthYear % 45) || 45,
    ((birthYear % 100) % 45) || 45,
    Math.min(45, Math.max(1, (birthYear % 100) || 45)),
  ])];

  const picked = new Set();
  shuffle(topNums).slice(0, 4).forEach((n) => picked.add(n));
  derived.slice(0, 2).forEach((n) => picked.add(n));
  shuffle(bottomNums).slice(0, 2).forEach((n) => picked.add(n));

  for (const n of topNums) {
    if (picked.size >= 6) break;
    picked.add(n);
  }
  for (let n = 1; n <= 45 && picked.size < 6; n++) {
    picked.add(n);
  }

  const main = [...picked].sort((a, b) => a - b).slice(0, 6);
  let bonus = 1;
  for (let n = 1; n <= 45; n++) {
    if (!main.includes(n)) {
      bonus = n;
      break;
    }
  }

  const topUsed = main.filter((n) => topNums.slice(0, 10).includes(n));
  const bottomUsed = main.filter((n) => bottomNums.slice(0, 6).includes(n));
  const derivedUsed = main.filter((n) => derived.includes(n));
  const topList = stats.topFrequent.slice(0, 6).map((x) => `${x.num}(${x.count}회)`).join(', ');

  const prefix = reasonNote ? `${reasonNote}\n\n` : '';
  const explanation = `${prefix}역대 ${stats.totalDraws}회 당첨번호 빈도(동행복권 통계 방식)를 분석했습니다.\n\n`
    + `• 고빈도 참고: ${topList}\n`
    + `• 이번 조합에 반영된 고빈도 번호: ${topUsed.join(', ') || '없음'}\n`
    + `• 저빈도 반영 번호: ${bottomUsed.join(', ') || '없음'}\n`
    + `• ${birthYear}년생 파생 번호(합 ${yearSum}, mod45 ${(birthYear % 45) || 45}): ${derivedUsed.join(', ') || derived.join(', ')}\n\n`
    + `출생년도와 역대 추첨 빈도를 조합한 추천입니다. 로또는 확률 게임이며 당첨을 보장하지 않습니다.`;

  return { main, bonus, explanation, source: 'local' };
}

module.exports = { generateLocalRecommendation };
