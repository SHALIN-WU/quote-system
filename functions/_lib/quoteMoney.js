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

function currencyKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "未指定";
  if (/^[A-Za-z]{3}$/.test(raw)) return raw.toUpperCase();
  return raw;
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
