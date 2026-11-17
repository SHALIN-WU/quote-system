(function (NG) {
  function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  const LB_TO_KG = 0.453592;

  function dimUnitOf(unit) {
    return unit === "inch" ? "inch" : "cm";
  }

  function weightUnitOf(cargo) {
    return cargo && cargo.weightUnit === "lb" ? "lb" : "kg";
  }

  function grossKg(cargo) {
    const n = NG.num(cargo && cargo.grossWeightKg);
    return weightUnitOf(cargo) === "lb" ? n * LB_TO_KG : n;
  }

  function grossLb(cargo) {
    const n = NG.num(cargo && cargo.grossWeightKg);
    return weightUnitOf(cargo) === "lb" ? n : n / LB_TO_KG;
  }

  function oneDecimal(value) {
    const n = Math.round((value + Number.EPSILON) * 10) / 10;
    return n.toLocaleString("zh-TW", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  function weightHint(cargo) {
    if (weightUnitOf(cargo) !== "lb") return "";
    if (!cargo || cargo.grossWeightKg === "" || cargo.grossWeightKg == null) return "";
    return "= " + oneDecimal(NG.num(cargo.grossWeightKg) * LB_TO_KG) + " kg";
  }

  function convertWeight(value, from, to) {
    if (value === "" || value == null || String(value).trim() === "") return "";
    const n = NG.num(value);
    const kg = from === "lb" ? n * LB_TO_KG : n;
    const next = to === "lb" ? kg / LB_TO_KG : kg;
    return (Math.round((next + Number.EPSILON) * 10) / 10).toFixed(1);
  }

  function weightQuoteText(cargo) {
    const source = cargo || {};
    const n = NG.num(source.grossWeightKg);
    const shown = NG.formatMeasure(source.grossWeightKg === "" || source.grossWeightKg == null ? 0 : n, 3);
    if (weightUnitOf(source) === "lb") return shown + " lb（" + oneDecimal(n * LB_TO_KG) + " kg）";
    return shown + " kg";
  }

  function toCm(value, unit) {
    const n = NG.num(value);
    return dimUnitOf(unit) === "inch" ? n * 2.54 : n;
  }

  function rowCbm(row, unit) {
    return toCm(row.l, unit) * toCm(row.w, unit) * toCm(row.h, unit) / 1000000 * NG.num(row.pieces);
  }

  function cmSizeText(row) {
    function one(value) {
      const n = Math.round((NG.num(value) * 2.54 + Number.EPSILON) * 10) / 10;
      return n.toFixed(1);
    }
    return "(" + one(row.l) + "×" + one(row.w) + "×" + one(row.h) + " cm)";
  }

  function dimensionText(rows, unit) {
    const label = dimUnitOf(unit);
    return (rows || []).map(function (row) {
      if (row.l === "" && row.w === "" && row.h === "") return "";
      function shown(value) {
        if (value === "" || value == null) return "0";
        return String(value).trim();
      }
      let text = shown(row.l) + " × " + shown(row.w) + " × " + shown(row.h) + " " + label;
      if (row.pieces !== "" && row.pieces != null) text += " × " + shown(row.pieces) + " 件";
      return text;
    }).filter(Boolean).join("、");
  }

  function summarize(cargo, settingsIn) {
    const settings = Object.assign({}, NG.config.defaults, settingsIn || {});
    const source = cargo || {};
    const dimensions = Array.isArray(source.dimensions) ? source.dimensions : [];
    const mode = ["air", "lcl", "fcl", "express"].indexOf(source.mode) >= 0 ? source.mode : "air";
    const unit = dimUnitOf(source.dimUnit);
    const fromDims = round(dimensions.reduce(function (sum, row) { return sum + rowCbm(row, unit); }, 0), 6);
    const hasDimInput = dimensions.some(function (row) {
      return row && (row.l !== "" && row.l != null || row.w !== "" && row.w != null || row.h !== "" && row.h != null);
    });
    const cbmFromImport = !hasDimInput && source.volumeCbm !== "" && source.volumeCbm != null;
    const cbm = cbmFromImport ? round(NG.num(source.volumeCbm), 6) : fromDims;
    const cai = round(cbm * NG.num(settings.caiFactor), 3);
    const piecesFromDims = round(dimensions.reduce(function (sum, row) {
      return sum + NG.num(row.pieces);
    }, 0), 3);
    const pieces = source.pieces === "" || source.pieces == null
      ? piecesFromDims
      : round(NG.num(source.pieces), 3);
    const gross = round(grossKg(source), 3);
    let volumetric = 0;
    let warning = "";

    if (mode === "express") {
      const divisor = NG.num(settings.expressDivisor);
      if (divisor <= 0) warning = "快遞除數需大於 0";
      else {
        volumetric = round(dimensions.reduce(function (sum, row) {
          return sum + (toCm(row.l, unit) * toCm(row.w, unit) * toCm(row.h, unit) * NG.num(row.pieces)) / divisor;
        }, 0), 3);
      }
    } else if (mode === "air") {
      const perCbm = NG.num(settings.airKgPerCbm);
      if (perCbm <= 0) warning = "空運每 CBM 公斤數需大於 0";
      else volumetric = round(cbm * perCbm, 3);
    } else {
      const perCbm = NG.num(settings.seaKgPerCbm);
      if (perCbm <= 0) warning = "海運每 CBM 公斤數需大於 0";
      else volumetric = round(cbm * perCbm, 3);
    }

    return {
      mode: mode,
      cbm: cbm,
      cbmFromImport: cbmFromImport,
      cai: cai,
      pieces: pieces,
      piecesFromDims: piecesFromDims,
      gross: gross,
      volumetric: volumetric,
      chargeable: round(Math.max(gross, volumetric), 3),
      warning: warning,
    };
  }

  function formulaText(summary, settingsIn) {
    const settings = Object.assign({}, NG.config.defaults, settingsIn || {});
    let formula = "";
    if (summary.mode === "express") {
      formula = "材積重 = 各列長 × 寬 × 高 × 件數的加總 ÷ " + NG.num(settings.expressDivisor);
    } else if (summary.mode === "air") {
      formula = "材積重 = CBM × " + NG.num(settings.airKgPerCbm);
    } else {
      formula = "材積重 = CBM × " + NG.num(settings.seaKgPerCbm) + "（1 CBM = " + NG.num(settings.seaKgPerCbm) + " 公斤）";
    }
    return formula + "。計費重量取毛重與材積重較大者。才 = CBM × " + NG.num(settings.caiFactor) + "。";
  }

  function containerTotals(cargo) {
    const rows = Array.isArray(cargo && cargo.containers) ? cargo.containers : [];
    const byType = {};
    let total = 0;
    rows.forEach(function (row) {
      const count = NG.num(row.count);
      if (!count) return;
      const type = NG.normalizeContainerType(row.type);
      byType[type] = (byType[type] || 0) + count;
      total += count;
    });
    Object.keys(byType).forEach(function (key) {
      byType[key] = round(byType[key], 3);
    });
    return { byType: byType, total: round(total, 3) };
  }

  function containerSummary(cargo) {
    const totals = containerTotals(cargo);
    const rows = Array.isArray(cargo && cargo.containers) ? cargo.containers : [];
    const order = [];
    rows.forEach(function (row) {
      if (!NG.num(row.count)) return;
      const type = NG.normalizeContainerType(row.type);
      if (order.indexOf(type) < 0) order.push(type);
    });
    if (!order.length) return "";
    return order.map(function (type) {
      const shown = NG.formatQty(totals.byType[type]);
      if (!type) return shown + "（未指定櫃型）";
      return shown + " × " + type;
    }).join("、");
  }

  function qtyForUnit(unit, cargo, summary, containerType) {
    if (!unit) return "";
    if (unit === "shipment" || unit === "set") return 1;
    if (unit === "container") {
      const source = cargo || {};
      if (source.mode === "fcl") {
        const totals = containerTotals(source);
        const type = NG.normalizeContainerType(containerType);
        if (type) return totals.byType[type] || 0;
        return totals.total;
      }
      if (source.containerCount === "" || source.containerCount == null) return 0;
      return round(NG.num(source.containerCount), 3);
    }
    const empty = summary.gross === 0 && summary.cbm === 0 && summary.pieces === 0;
    if (empty) return "";
    if (unit === "kg") return summary.chargeable;
    if (unit === "lb") {
      if (!cargo || cargo.grossWeightKg === "" || cargo.grossWeightKg == null) return "";
      return round(grossLb(cargo), 3);
    }
    if (unit === "cbm") return summary.cbm;
    if (unit === "piece") return summary.pieces;
    return "";
  }

  NG.cargo = {
    rowCbm: rowCbm,
    cmSizeText: cmSizeText,
    dimensionText: dimensionText,
    weightQuoteText: weightQuoteText,
    weightHint: weightHint,
    convertWeight: convertWeight,
    summarize: summarize,
    formulaText: formulaText,
    qtyForUnit: qtyForUnit,
    containerTotals: containerTotals,
    containerSummary: containerSummary,
  };
})(window.NG = window.NG || {});
