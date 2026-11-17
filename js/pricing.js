(function (NG) {
  function applyMin(amount, item) {
    if (!item || item.minCharge === "" || item.minCharge == null) return amount;
    const min = NG.num(item.minCharge);
    if (!(min > 0)) return amount;
    return Math.max(amount, min);
  }

  function lineTotals(item) {
    if (!item || item.qty === "" || item.qty == null) {
      return { qty: null, cost: null, quote: null, margin: null };
    }
    const qty = NG.num(item.qty);
    const cost = applyMin(NG.num(item.costPrice) * qty, item);
    const quote = applyMin(NG.num(item.quotePrice) * qty, item);
    return { qty: qty, cost: cost, quote: quote, margin: quote - cost };
  }

  function groupByCurrency(items) {
    const order = [];
    const map = {};
    (items || []).forEach(function (item) {
      const key = NG.parse.currencyKey(item.currency);
      if (!map[key]) {
        map[key] = { currency: key, cost: 0, quote: 0, margin: 0, incomplete: false };
        order.push(key);
      }
      const totals = lineTotals(item);
      if (totals.cost == null) {
        map[key].incomplete = true;
        return;
      }
      map[key].cost += totals.cost;
      map[key].quote += totals.quote;
      map[key].margin += totals.margin;
    });
    return order.map(function (key) {
      const group = map[key];
      group.marginRate = group.quote ? group.margin / group.quote : null;
      return group;
    });
  }

  function twdEquivalent(groups, rates) {
    const lines = [];
    let missing = false;
    let sum = 0;
    (groups || []).forEach(function (group) {
      if (group.currency === "未指定") {
        missing = true;
        lines.push({ currency: group.currency, quote: group.quote, rate: null, twd: null });
        return;
      }
      if (group.currency === "TWD") {
        lines.push({ currency: "TWD", quote: group.quote, rate: 1, twd: group.quote });
        sum += group.quote;
        return;
      }
      const rate = parseFloat(rates && rates[group.currency]);
      if (!isFinite(rate) || rate <= 0) {
        missing = true;
        lines.push({ currency: group.currency, quote: group.quote, rate: null, twd: null });
        return;
      }
      const twd = group.quote * rate;
      sum += twd;
      lines.push({ currency: group.currency, quote: group.quote, rate: rate, twd: twd });
    });
    return { lines: lines, missing: missing, sum: missing ? null : sum };
  }

  NG.pricing = {
    lineTotals: lineTotals,
    groupByCurrency: groupByCurrency,
    twdEquivalent: twdEquivalent,
  };
})(window.NG = window.NG || {});
