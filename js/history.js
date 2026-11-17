(function (NG) {
  function search(list, query) {
    const needle = String(query || "").trim().toLowerCase();
    const filtered = !needle ? list.slice() : list.filter(function (quote) {
      return [quote.quoteNumber, quote.customerName, quote.quoteDate, quote.validUntil]
        .join(" ")
        .toLowerCase()
        .indexOf(needle) >= 0;
    });
    filtered.sort(function (a, b) {
      return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    });
    return filtered;
  }

  function moneyLine(quote) {
    const groups = NG.pricing.groupByCurrency(quote.items || []);
    if (!groups.length) return "沒有費用項目";
    return groups.map(function (group) {
      return group.currency + " " + NG.formatMoney(group.quote);
    }).join("、");
  }

  NG.history = {
    search: search,
    moneyLine: moneyLine,
  };
})(window.NG = window.NG || {});
