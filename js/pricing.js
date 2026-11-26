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

  // 稅率 0：各幣別用未稅金額乘匯率，加總後再四捨五入，維持一行。
  // 稅率 > 0：有稅的幣別那一行用含稅總計；沒稅的（進口外幣、進口的未指定）用未稅金額。
  // 下面三行是每個幣別的未稅、稅金各自乘匯率並四捨五入成整數後相加。含稅合計 = 未稅合計 + 營業稅合計。
  function twdEquivalent(groups, rates, options) {
    const taxRate = Number(options && options.taxRate);
    const withTax = isFinite(taxRate) && taxRate > 0;
    const lines = [];
    let missing = false;
    let rawSum = 0;
    let pretaxSum = 0;
    let taxSum = 0;
    (groups || []).forEach(function (group) {
      const subtotal = group.subtotal != null ? group.subtotal : group.quote;
      const taxed = withTax && !!group.taxed && group.total != null;
      const amount = taxed ? group.total : subtotal;
      const kind = !withTax ? "" : (taxed ? "taxed" : "untaxed");
      const base = { currency: group.currency, quote: amount, amount: amount, kind: kind, subtotal: subtotal };
      if (group.currency === "未指定") {
        missing = true;
        lines.push(Object.assign(base, { rate: null, twd: null }));
        return;
      }
      const rate = group.currency === "TWD" ? 1 : parseFloat(rates && rates[group.currency]);
      if (group.currency !== "TWD" && (!isFinite(rate) || rate <= 0)) {
        missing = true;
        lines.push(Object.assign(base, { rate: null, twd: null }));
        return;
      }
      const twd = amount * rate;
      if (!withTax) rawSum += twd;
      else {
        pretaxSum += roundMoney(subtotal * rate, 0);
        taxSum += roundMoney((taxed ? Number(group.tax) || 0 : 0) * rate, 0);
      }
      lines.push(Object.assign(base, { rate: rate, twd: twd }));
    });
    if (!withTax) {
      return { lines: lines, missing: missing, mode: "legacy", sum: missing ? null : Math.round(rawSum) };
    }
    return {
      lines: lines,
      missing: missing,
      mode: "tax",
      pretax: missing ? null : pretaxSum,
      tax: missing ? null : taxSum,
      sum: missing ? null : pretaxSum + taxSum,
    };
  }

  function twdSourceText(line) {
    return line.currency === "TWD" ? NG.formatInteger(line.quote) : NG.formatMoney(line.quote);
  }

  function twdLineParts(line) {
    const amount = twdSourceText(line);
    const head = line.kind === "taxed"
      ? line.currency + " 含稅 " + amount
      : line.kind === "untaxed"
        ? line.currency + " 未稅 " + amount
        : line.currency + " " + amount;
    if (line.rate == null) return { text: head + "：尚未填匯率", value: null };
    const value = line.kind ? roundMoney(line.twd, 0) : Math.round(Number(line.twd));
    return { text: head + " × " + line.rate + " = " + NG.formatInteger(value), value: value };
  }

  function twdTotalParts(model) {
    const twd = model && model.twd;
    const blocked = "尚有幣別未填匯率或未指定幣別，無法計算約當台幣合計。";
    if (!twd || twd.missing) return [{ text: blocked, label: blocked, value: null, emphasis: true }];
    if (twd.mode === "tax") {
      return [
        { text: "約當台幣未稅合計　TWD " + NG.formatInteger(twd.pretax), label: "約當台幣未稅合計", value: twd.pretax, emphasis: false },
        { text: "約當台幣營業稅　TWD " + NG.formatInteger(twd.tax), label: "約當台幣營業稅", value: twd.tax, emphasis: false },
        { text: "約當台幣含稅合計　TWD " + NG.formatInteger(twd.sum), label: "約當台幣含稅合計", value: twd.sum, emphasis: true },
      ];
    }
    return [{ text: "約當台幣合計　TWD " + NG.formatInteger(twd.sum), label: "約當台幣合計", value: twd.sum, emphasis: true }];
  }

  function roundMoney(value, digits) {
    const factor = 10 ** digits;
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
  }

  // 與 functions/_lib/quoteMoney.js 的 displayTotals 同一套。lineTotals 本身不進位。
  function displayTotals(items, options) {
    const taxRate = Number(options && options.taxRate);
    const direction = options && (options.direction === "import" || options.direction === "export") ? options.direction : "";
    const rate = isFinite(taxRate) && taxRate > 0 ? taxRate : 0;
    const order = [];
    const map = {};
    (items || []).forEach(function (item) {
      const key = NG.parse.currencyKey(item && item.currency);
      if (!map[key]) {
        map[key] = { currency: key, raw: 0, lines: 0, incomplete: false };
        order.push(key);
      }
      const totals = lineTotals(item);
      if (totals.quote == null) {
        map[key].incomplete = true;
        return;
      }
      if (key === "TWD") map[key].lines += roundMoney(totals.quote, 0);
      else map[key].raw += totals.quote;
    });
    return order.map(function (key) {
      const group = map[key];
      const twd = key === "TWD";
      const subtotal = twd ? group.lines : roundMoney(group.raw, 2);
      const taxed = rate > 0 && (direction === "export" || (direction === "import" && twd));
      const tax = taxed ? roundMoney(subtotal * rate, twd ? 0 : 2) : null;
      const total = taxed ? roundMoney(subtotal + tax, twd ? 0 : 2) : null;
      return {
        currency: key,
        quote: subtotal,
        subtotal: subtotal,
        tax: tax,
        total: total,
        taxed: taxed,
        incomplete: group.incomplete
      };
    });
  }

  NG.pricing = {
    lineTotals: lineTotals,
    groupByCurrency: groupByCurrency,
    twdEquivalent: twdEquivalent,
    twdLineParts: twdLineParts,
    twdTotalParts: twdTotalParts,
    roundMoney: roundMoney,
    displayTotals: displayTotals,
  };
})(window.NG = window.NG || {});
