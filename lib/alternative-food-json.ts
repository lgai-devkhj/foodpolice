
export type AlternativeFoodJsonTier = 'slight' | 'better' | 'best';

export type AlternativeFoodJsonItem = {
  tier: AlternativeFoodJsonTier;
  productName: string;
  reason: string;
  purchaseUrl: string;
};

export type AlternativeFoodJsonRoot = {
  currentFood: string;
  processingStage: string;
  alternatives: AlternativeFoodJsonItem[];
};

const SHOP_URL_HOST_PATH_RE =
  /(shopping|smartstore|brand\.naver|product|products|\/item\/|\/goods\/|\/p\/|goods|mall|store|mart|market|coupang|ssg\.|emart|gmarket|11st|auction|kurly|lotteon|lotte|costco|homeplus|gsfresh|gs25|traders|interpark|danawa|cjonstyle|hmall|thehyundai|akmall|lfmall|oliveyoung|\.naver\.com|store\.kakao|11번가)/i;

/** 검색·목록·SNS 등 상품 상세가 아닌 호스트 */
function isDeniedAlternativeUrlHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h.startsWith('search.naver') ||
    h.startsWith('m.search.naver') ||
    h.includes('google.') ||
    h.includes('youtube.') ||
    h.includes('youtu.be') ||
    h.includes('facebook.') ||
    h.includes('instagram.') ||
    h.startsWith('blog.naver') ||
    h.startsWith('m.blog.naver') ||
    h.startsWith('cafe.naver') ||
    h.startsWith('news.naver') ||
    h.includes('fmkorea') ||
    h.includes('reddit.') ||
    h.includes('wikipedia.')
  );
}

function looksLikeSearchOrListingPath(u: URL): boolean {
  const path = `${u.pathname}${u.search}`.toLowerCase();
  return (
    /\/np\/search|\/vm\/search|\/bestSeller|\/event\/|\/promotion\/|\/display\/|\/search\b|\/search\.ssg|keyword=|where=nexearch|\bquery=/i.test(
      path
    ) ||
    (/shopping\.naver\.com/i.test(u.hostname) &&
      !/\/catalog\/\d+/i.test(u.pathname) &&
      /\/search|\bwhere=|\bquery=/i.test(path))
  );
}

/** 실제 상품 상세·바로구매로 이어지는 경로·쿼리 신호 */
function hasLikelyProductDetailSignals(u: URL): boolean {
  const path = u.pathname.toLowerCase();
  const host = u.hostname.toLowerCase();
  const q = u.search.toLowerCase();

  if (
    /(?:^|[?&])(?:itemid|item_no|goods_no|goodscode|prdno|productid|product_no)=/i.test(q)
  ) {
    return true;
  }

  if (/smartstore\.naver\.com/.test(host) && /\/products\//.test(path)) return true;
  if (/brand\.naver\.com/.test(host) && /\/products\//.test(path)) return true;
  if (/coupang\.com/.test(host) && /\/vp\/products\//.test(path)) return true;
  if (/market\.coupang\.com/.test(host)) return true;
  if (/shopping\.naver\.com/.test(host) && /\/catalog\/\d+/i.test(path)) return true;

  if (
    /\/(?:vp\/products|products\/|product\/|goods\/|goodsdetail|items\/|item\/|gift\/)/i.test(path)
  ) {
    return true;
  }

  if (/kurly\.com/.test(host) && /\/goods\//.test(path)) return true;
  if (/oliveyoung\.co\.kr/.test(host) && /\/store\/goods\//.test(path)) return true;

  if (/\d{8,}/.test(path)) return true;

  return false;
}

export function isPurchaseableProductUrl(raw: string): boolean {
  const s = String(raw || '').trim();
  if (!/^https?:\/\//i.test(s)) return false;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (isDeniedAlternativeUrlHost(u.hostname)) return false;
    if (looksLikeSearchOrListingPath(u)) return false;

    const hp = `${u.hostname}${u.pathname}`.toLowerCase();
    const hostLooksRetail = SHOP_URL_HOST_PATH_RE.test(hp);
    const pathLooksRetail =
      /(\/product\/|\/products\/|\/item\/|\/goods\/|\/goodsdetail|mall\.product|\/p\/|\/shopping\/)/i.test(
        u.pathname
      );

    if (!hostLooksRetail && !pathLooksRetail) return false;
    return hasLikelyProductDetailSignals(u);
  } catch {
    return false;
  }
}

export function productIdentityCore(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\d+(\.\d+)?\s*(g|kg|mg|ml|m[lL]|l|㎖|리터|그램|gram)\b/gi, ' ')
    .replace(/\d+\s*개입/gi, ' ')
    .replace(/\d+\s*개/gi, ' ')
    .replace(/\d+(\.\d+)?/g, ' ')
    .replace(/[^a-z0-9가-힣]/gi, '')
    .trim();
}

export function scannedProductLooksLikeWholeNutSnack(
  productName: string,
  rawMaterials?: string,
  foodCategory?: string | null
): boolean {
  const name = String(productName || '').trim();
  const text = `${name} ${String(rawMaterials || '')}`.toLowerCase();
  if (!name && !rawMaterials?.trim()) return false;

  if (
    /(땅콩|피넛|peanut|아몬드|almond|견과).{0,8}(버터|butter|스프레드|spread|페이스트|paste)/i.test(
      name
    ) ||
    /(버터|butter).{0,8}(땅콩|피넛|peanut|아몬드|almond)/i.test(name)
  ) {
    return false;
  }

  const nut =
    /땅콩|peanut|피넛|아몬드|almond|호두|walnut|캐슈|cashew|견과|믹스\s*넛|믹스넛|trail\s*mix|넛|nut\b/i.test(
      text
    );
  if (!nut) return false;

  const snackCue =
    /꿀땅콩|허니땅콩|허니\s*땅콩|꿀\s*땅콩|honey\s*peanut|honey\s*roast|허니로스티드|로스티드\s*땅콩|볶음땅콩|볶은땅콩|꿀아몬드|허니아몬드|코팅|시즈닝|스낵땅콩|땅콩스낵/i.test(
      text
    ) ||
    (/꿀|허니|honey/.test(text) && /땅콩|peanut|피넛|아몬드|almond|견과|믹스/i.test(text)) ||
    (/볶음|볶은|로스트|roast/.test(text) && /땅콩|peanut|아몬드|호두|캐슈|견과/i.test(text));

  if (snackCue) return true;

  const snackCategory = foodCategory === '달콤한 간식' || foodCategory === '짭짤한 간식';
  if (
    snackCategory &&
    nut &&
    !/(버터|butter|스프레드|spread|페이스트)/i.test(name)
  ) {
    return true;
  }

  return false;
}

export function alternativeLooksLikeNutSpreadOrPaste(alternativeName: string): boolean {
  const n = String(alternativeName || '').toLowerCase();
  if (!n.trim()) return false;
  return (
    /피넛\s*버터|peanut\s*butter|땅콩\s*버터|아몬드\s*버터|almond\s*butter|넛\s*버터|nut\s*butter/i.test(
      n
    ) ||
    /(땅콩|피넛|peanut|아몬드|almond|캐슈|cashew|헤이즐넛|hazelnut|견과).{0,10}(버터|butter|스프레드|spread|페이스트|paste)/i.test(
      n
    ) ||
    /(버터|butter).{0,12}(땅콩|피넛|peanut|아몬드|almond|캐슈|cashew|견과|넛|nut)/i.test(n) ||
    /땅콩\s*(크림|잼)|아몬드\s*(크림|잼)/i.test(n)
  );
}

export function alternativeLooksLikeSpreadJarOrPaste(alternativeName: string): boolean {
  if (alternativeLooksLikeNutSpreadOrPaste(alternativeName)) return true;
  const n = String(alternativeName || '').toLowerCase();
  if (!n.trim()) return false;
  return (
    /누텔라|nutella|초콜릿\s*스프레드|chocolate\s*spread|카카오\s*스프레드|cacao\s*spread|마멀레이드|marmalade/i.test(
      n
    ) ||
    /(딸기|포도|사과|블루베리|살구|복숭아)\s*잼|딸기잼|포도잼|사과잼|블루베리잼|살구잼|복숭아잼|무설탕잼|저당잼|유기농잼/i.test(
      n
    ) ||
    /\bjam\b/i.test(n)
  );
}

function looksLikeSweetenerBase(text: string): boolean {
  const n = String(text || '').toLowerCase();
  if (!n.trim()) return false;
  return /알룰로스|allulose|에리스리톨|erythritol|스테비아|stevia|자일리톨|xylitol|감미료|대체당|설탕\s*대체|zero\s*sugar\s*sweetener|sweetener/i.test(
    n
  );
}

export function alternativeLooksLikeStandaloneSweetener(alternativeName: string): boolean {
  return looksLikeSweetenerBase(alternativeName);
}

export function scannedLooksLikeSweetenerProduct(
  scannedName: string,
  rawMaterials?: string,
  foodCategory?: string | null
): boolean {
  const cat = String(foodCategory || '').trim();
  if (cat === '음료') return false;
  const name = String(scannedName || '').trim();
  if (!name) return false;

  // 원재료에 알룰로스가 "포함"된 일반 간식(예: 에너지바)을
  // 감미료 단일 제품으로 오인하지 않도록 제품명 신호만 사용해요.
  if (/(에너지\s*바|프로틴\s*바|바\b|초코|쿠키|그래놀라|시리얼|스낵|젤리|캔디|음료|요거트)/i.test(name)) {
    return false;
  }

  const strongSweetenerProductCue =
    /(알룰로스|allulose|에리스리톨|erythritol|스테비아|stevia|자일리톨|xylitol).{0,8}(분말|파우더|시럽|액상)/i.test(
      name
    ) ||
    /(설탕\s*대체|대체당|감미료|sweetener)/i.test(name);
  if (strongSweetenerProductCue) return true;

  // 제품명이 애매할 때만 원재료를 약하게 참고해요.
  const raw = String(rawMaterials || '').trim();
  if (!raw) return false;
  return /(설탕\s*대체|대체당|감미료|sweetener)/i.test(raw) && looksLikeSweetenerBase(name);
}

export function scannedLooksLikeHandheldPieceSnack(
  productName: string,
  rawMaterials?: string,
  foodCategory?: string | null
): boolean {
  if (scannedProductLooksLikeWholeNutSnack(productName, rawMaterials, foodCategory)) return true;

  const name = String(productName || '').trim();
  const text = `${name} ${String(rawMaterials || '')}`.toLowerCase();
  if (!name && !rawMaterials?.trim()) return false;

  if (
    /(잼|스프레드|버터|페이스트).{0,6}(통|용기)/i.test(name) ||
    /(땅콩|피넛|peanut|아몬드|almond|견과).{0,8}(버터|butter|스프레드)/i.test(name)
  ) {
    return false;
  }

  const pieceCue =
    /과자|쿠키|cookie|비스킷|biscuit|cracker|크래커|칩\b|chip\b|팝콘|popcorn|스낵|snack|초코볼|젤리|gummy|구미|마시멜로|사탕|캔디|껌\b|오징어|육포|치즈볼|비스켓/i.test(
      text
    );

  const snackCat = foodCategory === '달콤한 간식' || foodCategory === '짭짤한 간식';
  return snackCat && pieceCue;
}

export function alternativeLikelyWrongFoodCategory(
  alternativeName: string,
  foodCategory: string | null | undefined
): boolean {
  const cat = String(foodCategory || '').trim();
  const n = String(alternativeName || '').trim().toLowerCase();
  if (!cat || cat === '미분류' || !n) return false;

  const hasDrinkCue =
    /\b\d+\s*(ml|m[lL]|ℓ|l)\b/i.test(n) ||
    /주스|juice|에이드|ade|탄산|사이다|콜라|환타|스프라이트|펩시|이온음료|게토레이|파워에이드|생수|drink|스무디|smoothie|아이스티|\b라떼|latte|\b우유\b|milk|\b두유/i.test(
      n
    );
  const looksLikeTeaOrCoffeeDrink =
    /\b차\s*음료|헛개차\s*\d|보리차\s*\d|아이스(?:티|커피)\s*\d/i.test(n) ||
    (/\btea\b|\bcoffee\b|latte|americano|espresso/i.test(n) && /\d+\s*(ml|m[lL])|리터|페트|pet|병|캔/i.test(n));

  const hasMealCue =
    /라면|컵라면|도시락|햄버거|샌드위치|김밥|삼각김밥|주먹밥|볶음밥|컵밥|덮밥|짜장|카레|즉석밥|백반|비빔|한끼밥|볶음우동/i.test(n);

  const hasSnackCue =
    /과자|쿠키|비스킷|cracker|칩\b|chip\b|팝콘|popcorn|스낵|snack|초콜릿|초코|젤리|gummy|캔디|사탕|껌\b|견과|믹스넛|땅콩|아몬드|호두\b/i.test(n);

  const hasBreadCerealCue =
    /빵|bread|베이글|bagel|식빵|모닝빵|크루아상|시리얼|cereal|그래놀라|granola|오트밀|머핀|muffin|와플|waffle|토스트|토스터|scone/i.test(
      n
    );

  const hasDairyDessertCue =
    /요거트|yogurt|요구르트|치즈(?!볼|스낵|칩)|cheese|아이스크림|ice\s*cream|젤라또|gelato|푸딩|pudding|생크림|크림치즈|밀크\b/i.test(
      n
    );

  switch (cat) {
    case '음료':
      if (hasMealCue && !hasDrinkCue) return true;
      if (hasSnackCue && !hasDrinkCue && !/젤리\s*음료|리얼\s*젤리|액상|드링크/i.test(n)) return true;
      if (hasBreadCerealCue && !hasDrinkCue) return true;
      return false;

    case '간편한 한 끼': {
      const drinkOnly =
        hasDrinkCue &&
        !hasMealCue &&
        !hasSnackCue &&
        !hasBreadCerealCue &&
        /주스|탄산|콜라|사이다|\d+\s*(ml|m[lL]|ℓ)|아이스티|생수|이온|게토레이|파워에이드/i.test(n);
      return drinkOnly;
    }

    case '빵·시리얼류':
      if (hasMealCue && !hasBreadCerealCue) return true;
      if (hasDrinkCue && !hasBreadCerealCue && !/\b우유\b|milk|\b두유|요거트\s*음료/i.test(n)) return true;
      return false;

    case '유제품·디저트':
      if (hasMealCue && !hasDairyDessertCue) return true;
      if (hasSnackCue && !hasDairyDessertCue && /과자|칩|팝콘|라면|육포|오징어/i.test(n)) return true;
      return false;

    case '달콤한 간식':
    case '짭짤한 간식':
      if (hasMealCue) return true;
      if (
        hasDrinkCue &&
        !hasSnackCue &&
        /주스|탄산|콜라|사이다|아이스티|\d+\s*(ml|m[lL]|ℓ)|\b페트\b|pet/i.test(n)
      ) {
        return true;
      }
      if (hasDrinkCue && !hasSnackCue && looksLikeTeaOrCoffeeDrink) return true;
      return false;

    default:
      return false;
  }
}

const FLAVOR_TAG_RULES: Array<{ tag: string; re: RegExp }> = [
  { tag: 'strawberry', re: /딸기|strawberry/i },
  { tag: 'banana', re: /바나나|banana/i },
  { tag: 'chocolate', re: /초코|초콜릿|choco|chocolate|코코아|cocoa/i },
  { tag: 'coffee', re: /커피|coffee|라떼|latte|모카|mocha/i },
  { tag: 'vanilla', re: /바닐라|vanilla/i },
  { tag: 'melon', re: /메론|멜론|melon/i },
  { tag: 'grape', re: /포도|grape/i },
  { tag: 'apple', re: /사과|apple/i },
  { tag: 'orange', re: /오렌지|orange/i },
  { tag: 'mango', re: /망고|mango/i },
  { tag: 'peach', re: /복숭아|peach/i },
  { tag: 'blueberry', re: /블루베리|blueberry/i },
];

function extractFlavorTags(text: string): Set<string> {
  const s = String(text || '').trim();
  const out = new Set<string>();
  if (!s) return out;
  for (const rule of FLAVOR_TAG_RULES) {
    if (rule.re.test(s)) out.add(rule.tag);
  }
  return out;
}

function isFlavorSensitiveCategory(foodCategory: string | null | undefined): boolean {
  return foodCategory === '음료' || foodCategory === '유제품·디저트';
}

export function alternativeLikelyFlavorMismatch(
  scannedName: string,
  alternativeName: string,
  foodCategory?: string | null,
  rawMaterials?: string
): boolean {
  if (!isFlavorSensitiveCategory(foodCategory)) return false;

  const sourceTags = extractFlavorTags(`${scannedName} ${rawMaterials || ''}`);
  const altTags = extractFlavorTags(alternativeName);

  if (sourceTags.size === 0 || altTags.size === 0) return false;

  const sourceList = Array.from(sourceTags);
  return !sourceList.some((tag) => altTags.has(tag));
}

export function isSameProductLineOrWeightOnlyVariant(
  alternativeName: string,
  scannedName: string
): boolean {
  const a = String(alternativeName || '').trim();
  const s = String(scannedName || '').trim();
  if (!a || !s) return false;
  const cA = productIdentityCore(a);
  const cS = productIdentityCore(s);
  if (cA && cA === cS) return true;
  const norm = (v: string) =>
    v
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9가-힣]/gi, '');
  const nA = norm(a);
  const nS = norm(s);
  if (nA === nS) return true;
  if (nA.length >= 6 && nS.length >= 6 && (nA.includes(nS) || nS.includes(nA))) {
    const ratio = Math.min(nA.length, nS.length) / Math.max(nA.length, nS.length);
    if (ratio >= 0.88) return true;
  }
  return false;
}

export function unwrapModelJsonBlock(content: string): string {
  let s = String(content || '').trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(s);
  if (fence) s = fence[1].trim();
  return s;
}
