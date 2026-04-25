
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

export function isPurchaseableProductUrl(raw: string): boolean {
  const s = String(raw || '').trim();
  if (!/^https?:\/\//i.test(s)) return false;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const hp = `${u.hostname}${u.pathname}`.toLowerCase();
    if (SHOP_URL_HOST_PATH_RE.test(hp)) return true;
    if (
      /(\/product\/|\/products\/|\/item\/|\/goods\/|\/goodsdetail|mall\.product|\/p\/|\/shopping\/)/i.test(
        u.pathname
      )
    ) {
      return true;
    }
    return false;
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
