function num(value) {
  if (value == null || value === "") return 0;
  const n = parseFloat(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function applyMin(amount, item) {
  if (!item || item.minCharge === "" || item.minCharge == null) return amount;
  const min = num(item.minCharge);
  if (!(min > 0)) return amount;
  return Math.max(amount, min);
}

const CURRENCY_ALIASES = {
  "US$": "USD", "USD": "USD", "美金": "USD", "美元": "USD",
  "NT$": "TWD", "NTD": "TWD", "TWD": "TWD", "台幣": "TWD", "臺幣": "TWD", "新台幣": "TWD", "新臺幣": "TWD",
  "RMB": "CNY", "CNY": "CNY", "人民幣": "CNY", "人民币": "CNY",
  "EUR": "EUR", "歐元": "EUR", "欧元": "EUR",
  "JPY": "JPY", "日圓": "JPY", "日元": "JPY",
  "HKD": "HKD", "港幣": "HKD", "港币": "HKD",
  "GBP": "GBP", "英鎊": "GBP", "英镑": "GBP",
  "SGD": "SGD", "KRW": "KRW", "AUD": "AUD"
};

function currencyKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "未指定";
  const compact = raw.replace(/\s+/g, "");
  if (CURRENCY_ALIASES[compact]) return CURRENCY_ALIASES[compact];
  const upper = compact.toUpperCase();
  if (CURRENCY_ALIASES[upper]) return CURRENCY_ALIASES[upper];
  if (/^[A-Za-z]{3}$/.test(compact)) return upper;
  return compact;
}

// 只加總報價單價，公式與 js/pricing.js 的 quote 那一側相同。
// 數量空白的列不計入。這裡不重算材積、計費重量或數量。
export function sellingTotals(items) {
  const order = [];
  const map = {};
  for (const item of items || []) {
    const key = currencyKey(item && item.currency);
    if (!map[key]) {
      map[key] = { currency: key, quote: 0 };
      order.push(key);
    }
    if (!item || item.qty === "" || item.qty == null) continue;
    const qty = num(item.qty);
    map[key].quote += applyMin(num(item.quotePrice) * qty, item);
  }
  return order.map((key) => map[key]);
}

export function roundMoney(value, digits) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function lineQuote(item) {
  if (!item || item.qty === "" || item.qty == null) return null;
  return applyMin(num(item.quotePrice) * num(item.qty), item);
}

// 稅金只加在各幣別合計之後。TWD 先把每列小計四捨五入成整數再相加；外幣先加總再四捨五入到小數兩位。
export function displayTotals(items, options) {
  const taxRate = Number(options && options.taxRate);
  const direction = options && (options.direction === "import" || options.direction === "export") ? options.direction : "";
  const rate = Number.isFinite(taxRate) && taxRate > 0 ? taxRate : 0;
  const order = [];
  const map = {};
  for (const item of items || []) {
    const key = currencyKey(item && item.currency);
    if (!map[key]) {
      map[key] = { currency: key, raw: 0, lines: 0, incomplete: false };
      order.push(key);
    }
    const quote = lineQuote(item);
    if (quote == null) {
      map[key].incomplete = true;
      continue;
    }
    if (key === "TWD") map[key].lines += roundMoney(quote, 0);
    else map[key].raw += quote;
  }
  return order.map((key) => {
    const group = map[key];
    const twd = key === "TWD";
    const subtotal = twd ? group.lines : roundMoney(group.raw, 2);
    const taxed = rate > 0 && (direction === "export" || (direction === "import" && twd));
    const tax = taxed ? roundMoney(subtotal * rate, twd ? 0 : 2) : null;
    const total = taxed ? roundMoney(subtotal + tax, twd ? 0 : 2) : null;
    return {
      currency: key,
      quote: subtotal,
      subtotal,
      tax,
      total,
      taxed,
      incomplete: group.incomplete
    };
  });
}
