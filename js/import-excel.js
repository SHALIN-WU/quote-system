(function (NG) {
  const FIELDS = [
    { field: "name", aliases: ["項目名稱", "費用名稱", "費用項目", "收費項目", "description", "itemname", "項目", "品名", "名稱", "item", "charge", "name"] },
    { field: "price", aliases: ["成本單價", "單價", "價格", "unitprice", "price", "rate", "金額"] },
    { field: "unit", aliases: ["計價單位", "計算單位", "單位", "unit", "uom"] },
    { field: "currency", aliases: ["幣別", "幣種", "currency", "cur"] },
  ];

  function normHeader(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[()（）\[\]【】:：_\/\\-]/g, "");
  }

  function headerScore(cell, alias) {
    if (!cell || !alias) return 0;
    if (/合計|小計|總計|total|備註|說明/.test(cell)) return 0;
    if (cell === alias) return 3;
    if (alias.length >= 2 && (cell.endsWith(alias) || cell.startsWith(alias))) return 2;
    return 0;
  }

  function detectHeader(rows) {
    let best = null;
    const limit = Math.min(rows.length, 20);
    for (let r = 0; r < limit; r += 1) {
      const map = {};
      const scoreOf = {};
      let score = 0;
      (rows[r] || []).forEach(function (cell, index) {
        const text = normHeader(cell);
        FIELDS.forEach(function (field) {
          field.aliases.forEach(function (alias) {
          const gained = headerScore(text, normHeader(alias));
          if (!gained) return;
          if (scoreOf[field.field] != null && scoreOf[field.field] >= gained) return;
          if (scoreOf[field.field] != null) score -= scoreOf[field.field];
          map[field.field] = index;
          scoreOf[field.field] = gained;
          score += gained;
          });
        });
      });
      if (map.name != null && map.price != null && (!best || score > best.score)) {
        best = { headerRow: r, map: map, score: score };
      }
    }
    return best;
  }

  function readUnit(value) {
    const text = String(value || "").trim();
    if (/^\/?20$/i.test(text)) return { unit: "container", containerType: "20GP" };
    if (/^\/?40$/i.test(text)) return { unit: "container", containerType: "40GP" };
    if (/^\/?40(?:HQ|HC)$/i.test(text)) return { unit: "container", containerType: "40HQ" };
    const hit = NG.parse.findUnit(text);
    const unit = hit ? hit.id : "";
    let containerType = "";
    if (unit === "container") {
      containerType = (hit && hit.containerType) || "";
      if (!containerType) {
        const typeHit = NG.parse.findContainerType(text);
        if (typeHit) containerType = typeHit.id;
      }
    }
    return { unit: unit, containerType: containerType };
  }

  function cellCurrency(value) {
    return NG.parse.normalizeCurrency(value);
  }

  function rowsToItems(rows, headerRow, map) {
    const items = [];
    const start = Number(headerRow) + 1;
    for (let r = start; r < rows.length; r += 1) {
      const row = rows[r] || [];
      if (row.every(function (cell) { return String(cell || "").trim() === ""; })) continue;
      let name = String(map.name == null ? "" : row[map.name] || "").trim();
      if (!name || /^(合計|小計|總計|total)$/i.test(name)) continue;
      if (name.length > 300) name = name.slice(0, 300);
      const priceCell = map.price == null ? "" : row[map.price];
      const fallbackCurrency = map.currency == null ? "" : cellCurrency(row[map.currency]);
      const priceRates = NG.parse.expandRateItems(priceCell);
      const nameRates = NG.parse.expandRateItems(name);
      const multi = priceRates.length > 1 ? priceRates : (nameRates.length > 1 ? nameRates : null);
      if (multi) {
        const label = priceRates.length > 1 ? name : "";
        multi.forEach(function (item) {
          const itemName = label || item.name;
          if (!itemName) return;
          const currency = item.currency || fallbackCurrency;
          items.push({
            name: itemName,
            costPrice: item.costPrice,
            quotePrice: item.quotePrice,
            unit: item.unit,
            containerType: item.unit === "container" ? item.containerType : "",
            currency: /^[A-Z]{3}$/.test(currency) ? currency : "",
          });
        });
        continue;
      }
      const price = NG.parse.parseNumberToken(priceCell);
      if (price == null) continue;
      let parsed = map.unit == null ? { unit: "", containerType: "" } : readUnit(row[map.unit]);
      let currency = map.currency == null ? "" : cellCurrency(row[map.currency]);
      if (!parsed.unit) {
        const fromName = readUnit(name);
        const fromPrice = readUnit(priceCell);
        parsed = fromName.unit ? fromName : fromPrice;
      } else if (parsed.unit === "container" && !parsed.containerType) {
        const fromName = NG.parse.findContainerType(name);
        const fromPrice = NG.parse.findContainerType(String(priceCell || ""));
        const typeHit = fromName || fromPrice;
        if (typeHit) parsed.containerType = typeHit.id;
      }
      const unit = parsed.unit;
      if (!currency || currency.length > 8) {
        const fromPrice = NG.parse.findCurrency(String(priceCell || ""));
        const fromName = NG.parse.findCurrency(name);
        currency = fromPrice ? fromPrice.code : (fromName ? fromName.code : "");
      }
      if (currency && !/^[A-Z]{3}$/.test(currency)) currency = cellCurrency(currency);
      items.push({
        name: name,
        costPrice: price,
        quotePrice: price,
        unit: unit,
        containerType: unit === "container" ? parsed.containerType : "",
        currency: /^[A-Z]{3}$/.test(currency) ? currency : "",
      });
    }
    return items;
  }

  function decodeCsv(buffer) {
    const bytes = new Uint8Array(buffer);
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (error) {
      try {
        return new TextDecoder("big5").decode(bytes);
      } catch (second) {
        return new TextDecoder("utf-8").decode(bytes);
      }
    }
  }

  function sheetRows(workbook) {
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return { sheetName: "", rows: [] };
    const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      raw: false,
      defval: "",
    });
    return { sheetName: sheetName, rows: rows, sheetCount: workbook.SheetNames.length };
  }

  NG.importExcel = {
    rowsToItems: rowsToItems,
    detectHeader: detectHeader,
    parseRows: function (rows) {
      const detected = detectHeader(rows || []);
      return {
        detected: detected,
        items: detected ? rowsToItems(rows, detected.headerRow, detected.map) : [],
      };
    },
    fromFile: async function (file) {
      if (!window.XLSX) throw new Error("SheetJS 沒有載入");
      const buffer = await file.arrayBuffer();
      const lower = String(file.name || "").toLowerCase();
      const workbook = lower.endsWith(".csv")
        ? window.XLSX.read(decodeCsv(buffer), { type: "string" })
        : window.XLSX.read(buffer, { type: "array" });
      const sheet = sheetRows(workbook);
      const parsed = NG.importExcel.parseRows(sheet.rows);
      return {
        sheetName: sheet.sheetName,
        sheetCount: sheet.sheetCount || 1,
        rows: sheet.rows,
        detected: parsed.detected,
        items: parsed.items,
      };
    },
  };
})(window.NG = window.NG || {});
