/**
 * 네이버 쇼핑 이마트 마켓 홈 HTML 수집 시도.
 *
 * 주의: 네이버는 비정상 접근에 **캡차·접속 제한**을 걸어, 서버·데이터센터 IP에서는
 * 대부분 본문 대신 차단 페이지만 옵니다. 성공 시에만 Gemini 프롬프트에 붙입니다.
 * 상업적 대량 수집·약관 위반 용도는 금지입니다.
 *
 * @see https://shopping.naver.com/market/emart/home
 */

export const NAVER_EMART_MARKET_HOME = 'https://shopping.naver.com/market/emart/home';

const BLOCK_PATTERNS: RegExp[] = [
  /WtmCaptcha/i,
  /wcpt\/m\/challenge/i,
  /쇼핑 서비스 접속이 일시적으로 제한/i,
  /비정상적인 접근이 감지/i,
  /잠시 후 다시 확인해주세요/i,
  /title="captcha"/i,
  /content_error/i,
];

const MIN_USEFUL_LENGTH = 80;

function htmlToPlainText(html: string): string {
  const noScript = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const text = noScript
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

function detectBlock(html: string): NaverEmartBlockedReason | null {
  for (const re of BLOCK_PATTERNS) {
    if (re.test(html)) {
      if (/WtmCaptcha|wcpt|captcha/i.test(html)) return 'captcha';
      if (/제한|비정상/i.test(html)) return 'rate_limit';
      return 'error_page';
    }
  }
  return null;
}

export type NaverEmartBlockedReason = 'captcha' | 'rate_limit' | 'error_page' | 'http_error' | 'empty';

export type NaverEmartCrawlResult = {
  /** 차단이 아니고 의미 있는 길이의 본문일 때만 */
  plainText: string | null;
  blockedReason: NaverEmartBlockedReason | null;
};

/**
 * 이마트 마켓 홈 GET. 성공해도 대부분 환경에서는 null.
 */
export async function tryFetchNaverEmartMarketHome(
  maxChars = 6000,
  timeoutMs = 8000
): Promise<NaverEmartCrawlResult> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(NAVER_EMART_MARKET_HOME, {
      method: 'GET',
      signal: ac.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
      cache: 'no-store',
    });
    if (!res.ok) {
      return { plainText: null, blockedReason: 'http_error' };
    }
    const html = await res.text();
    const blocked = detectBlock(html);
    if (blocked) {
      return { plainText: null, blockedReason: blocked };
    }
    const plain = htmlToPlainText(html);
    if (plain.length < MIN_USEFUL_LENGTH) {
      return { plainText: null, blockedReason: 'empty' };
    }
    return { plainText: plain.slice(0, maxChars), blockedReason: null };
  } catch {
    return { plainText: null, blockedReason: 'http_error' };
  } finally {
    clearTimeout(t);
  }
}
