(function (NG) {
  const STEPS = ["import", "cargo", "price", "quote"];
  let state = null;
  let settings = null;
  let currentStep = "";
  let excelSession = null;
  let airPlanState = { plans: [], appliedRoute: "" };
  let rateSig = "";
  let draftTimer = 0;
  let draftGeneration = 0;
  let suppressDraft = false;
  let pendingBackup = null;
  let settingsReady = false;
  let settingsTimer = 0;
  let historyTimer = 0;
  let historyToken = 0;

  function $(id) { return document.getElementById(id); }

  function blankDim() {
    return { id: NG.uid(), l: "", w: "", h: "", pieces: "" };
  }

  function blankState() {
    const today = NG.todayISO();
    return {
      id: null,
      quoteNumber: "",
      customerName: "",
      quoteDate: today,
      validUntil: NG.addDays(today, 14),
      remarks: "",
      route: "",
      cargo: {
        grossWeightKg: "",
        pieces: "",
        volumeCbm: "",
        mode: "air",
        containerCount: "",
        containers: [],
        dimensions: [blankDim()],
        dimUnit: settings && settings.dimUnit === "inch" ? "inch" : "cm",
        weightUnit: settings && settings.weightUnit === "lb" ? "lb" : "kg",
      },
      items: [],
      markupPercent: "",
      showTwdTotal: false,
      showZeroLines: false,
      direction: "",
      taxRate: 0.05,
      rates: {},
      calcSettings: null,
      createdAt: null,
    };
  }

  function cleanCalc(value) {
    if (!value || typeof value !== "object") return null;
    const keys = ["airKgPerCbm", "seaKgPerCbm", "expressDivisor", "caiFactor"];
    const out = {};
    for (let i = 0; i < keys.length; i++) {
      const n = Number(value[keys[i]]);
      if (!isFinite(n)) return null;
      out[keys[i]] = n;
    }
    return out;
  }

  function roleName() {
    return NG.currentUser && NG.currentUser.role ? NG.currentUser.role : "";
  }

  function can(permission) {
    const list = NG.currentUser && NG.currentUser.permissions;
    return Array.isArray(list) && list.indexOf(permission) >= 0;
  }

  function canWrite() {
    return can("quote.write");
  }

  function canSeeCost() {
    return can("quote.cost");
  }

  function canCopy() {
    return can("quote.copy");
  }

  function canDeleteQuote() {
    return can("quote.delete");
  }

  function canCalc() {
    return can("settings.calc");
  }

  function canExportBackup() {
    return can("backup.export");
  }

  function canImportBackup() {
    return can("backup.import");
  }

  function canOpenBackup() {
    return canImportBackup();
  }

  let currentView = "new-quote";

  function formatParam(value) {
    const n = Number(value);
    if (!isFinite(n)) return "—";
    return String(n);
  }

  function renderCalcLine() {
    const el = $("calc-line");
    if (!el) return;
    const frozen = state && cleanCalc(state.calcSettings);
    if (!canSeeCost() || (!frozen && !settingsReady)) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    const calc = frozen || calcForQuote();
    el.hidden = false;
    el.textContent = "空運 " + formatParam(calc.airKgPerCbm) + "／海運 " + formatParam(calc.seaKgPerCbm) + "／快遞 " + formatParam(calc.expressDivisor) + "／才 " + formatParam(calc.caiFactor);
  }

  function showView(name) {
    const views = {
      "new-quote": "view-new",
      history: "view-history",
      calc: "view-settings",
      backup: "view-backup",
    };
    if (!views[name]) return;
    if (name === "calc" && !canCalc()) {
      setStatus("沒有權限");
      return;
    }
    if (name === "backup" && !canOpenBackup()) {
      setStatus("沒有權限");
      return;
    }
    currentView = name;
    Object.keys(views).forEach(function (key) {
      const el = $(views[key]);
      if (el) el.hidden = key !== name;
    });
    document.body.dataset.nav = name;
    if (name === "history") renderHistory();
    renderCalcLine();
    if (typeof NG.refreshNav === "function") NG.refreshNav();
    if (typeof NG.closeNav === "function") NG.closeNav();
  }

  function navHighlight() {
    if (currentView === "new-quote" && state && state.id) return "history";
    return currentView;
  }

  NG.showView = showView;
  NG.navHighlight = navHighlight;

  function normalizeState(raw) {
    const blank = blankState();
    const source = raw || {};
    const cargo = Object.assign({}, blank.cargo, source.cargo || {});
    const dimensions = Array.isArray(cargo.dimensions) ? cargo.dimensions : [];
    cargo.dimensions = (dimensions.length ? dimensions : [blankDim()]).map(function (row) {
      return {
        id: row.id || NG.uid(),
        l: row.l == null ? "" : row.l,
        w: row.w == null ? "" : row.w,
        h: row.h == null ? "" : row.h,
        pieces: row.pieces == null ? "" : row.pieces,
      };
    });
    if (["air", "lcl", "fcl", "express"].indexOf(cargo.mode) < 0) cargo.mode = "air";
    const hadContainers = Array.isArray((source.cargo || {}).containers);
    cargo.containers = (hadContainers ? cargo.containers : []).map(function (row) {
      return {
        id: row.id || NG.uid(),
        type: NG.normalizeContainerType(row.type),
        count: row.count == null ? "" : row.count,
      };
    });
    if (!hadContainers && cargo.mode === "fcl" && cargo.containerCount !== "" && cargo.containerCount != null) {
      cargo.containers.push({ id: NG.uid(), type: "", count: cargo.containerCount });
    }
    const givenUnit = source.cargo && source.cargo.dimUnit;
    cargo.dimUnit = givenUnit === "inch" || givenUnit === "cm" ? givenUnit : "cm";
    const givenWeight = source.cargo && source.cargo.weightUnit;
    cargo.weightUnit = givenWeight === "lb" || givenWeight === "kg" ? givenWeight : "kg";
    return {
      id: source.id || null,
      quoteNumber: source.quoteNumber || "",
      customerName: source.customerName || "",
      quoteDate: source.quoteDate || blank.quoteDate,
      validUntil: source.validUntil || "",
      remarks: source.remarks || "",
      route: source.route || "",
      cargo: cargo,
      items: (Array.isArray(source.items) ? source.items : []).map(function (item) {
        return {
          id: item.id || NG.uid(),
          name: item.name || "",
          costPrice: item.costPrice == null ? "" : item.costPrice,
          quotePrice: item.quotePrice == null ? "" : item.quotePrice,
          unit: item.unit || "",
          containerType: NG.normalizeContainerType(item.containerType),
          currency: item.currency || "",
          minCharge: item.minCharge == null || item.minCharge === "" ? "" : item.minCharge,
          note: item.note || "",
          qty: item.qty == null ? "" : item.qty,
          qtyManual: !!item.qtyManual,
          hideFromQuote: !!item.hideFromQuote,
          fromAirPlan: !!item.fromAirPlan,
        };
      }),
      markupPercent: source.markupPercent || "",
      showTwdTotal: !!source.showTwdTotal,
      showZeroLines: !!source.showZeroLines,
      direction: source.direction === "import" || source.direction === "export" ? source.direction : "",
      taxRate: (function () {
        if (source.taxRate == null || source.taxRate === "") return source.id ? 0 : 0.05;
        const n = Number(source.taxRate);
        return isFinite(n) && n >= 0 && n <= 1 ? n : 0;
      })(),
      rates: source.rates || {},
      calcSettings: cleanCalc(source.calcSettings),
      createdAt: source.createdAt || null,
      updatedAt: source.updatedAt || null,
    };
  }

  function snapshot() {
    return {
      id: state.id,
      quoteNumber: state.quoteNumber,
      customerName: state.customerName,
      quoteDate: state.quoteDate,
      validUntil: state.validUntil,
      remarks: state.remarks,
      route: state.route || "",
      cargo: state.cargo,
      items: state.items,
      markupPercent: state.markupPercent,
      showTwdTotal: state.showTwdTotal,
      showZeroLines: !!state.showZeroLines,
      direction: state.direction === "import" || state.direction === "export" ? state.direction : "",
      taxRate: state.taxRate,
      rates: state.rates,
      calcSettings: state.calcSettings || null,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt || null,
    };
  }

  function hasContent(data) {
    if (!data) return false;
    if (data.customerName || data.remarks || data.route || (data.items && data.items.length)) return true;
    const cargo = data.cargo || {};
    if (cargo.grossWeightKg || cargo.pieces || cargo.containerCount || cargo.volumeCbm) return true;
    if ((cargo.containers || []).some(function (row) { return row && (row.type || row.count); })) return true;
    return (cargo.dimensions || []).some(function (row) {
      return row.l || row.w || row.h || row.pieces;
    });
  }

  function setStatus(text) { $("status").textContent = text || ""; }

  function scheduleDraft() {
    window.clearTimeout(draftTimer);
    draftTimer = 0;
    if (suppressDraft) return;
    const generation = draftGeneration;
    draftTimer = window.setTimeout(function () {
      draftTimer = 0;
      if (suppressDraft || generation !== draftGeneration) return;
      if (!NG.storage.saveDraft(snapshot(), true)) setStatus("無法寫入瀏覽器儲存空間");
    }, 250);
  }

  function stopDraft() {
    draftGeneration += 1;
    window.clearTimeout(draftTimer);
    draftTimer = 0;
  }

  function calcForQuote() {
    const frozen = state && cleanCalc(state.calcSettings);
    if (frozen) return frozen;
    if (!settingsReady) {
      return { airKgPerCbm: 0, seaKgPerCbm: 0, expressDivisor: 0, caiFactor: 0 };
    }
    return {
      airKgPerCbm: settings.airKgPerCbm,
      seaKgPerCbm: settings.seaKgPerCbm,
      expressDivisor: settings.expressDivisor,
      caiFactor: settings.caiFactor,
    };
  }

  function currentSummary() {
    return NG.cargo.summarize(state.cargo, calcForQuote());
  }

  function stepChargeableKg() {
    const summary = currentSummary();
    return summary && summary.chargeable > 0 ? summary.chargeable : null;
  }

  function syncAutoQty() {
    const summary = currentSummary();
    state.items.forEach(function (item) {
      if (item.qtyManual || !item.unit) return;
      const qty = NG.cargo.qtyForUnit(item.unit, state.cargo, summary, item.containerType);
      item.qty = qty === "" || qty == null ? "" : qty;
    });
    return summary;
  }

  function makeItem(raw) {
    const cost = raw.costPrice == null || raw.costPrice === "" ? "" : NG.trimNum(raw.costPrice, 4);
    const quote = raw.quotePrice == null || raw.quotePrice === "" ? cost : NG.trimNum(raw.quotePrice, 4);
    const item = {
      id: NG.uid(),
      name: raw.name || "",
      costPrice: cost,
      quotePrice: quote,
      unit: raw.unit || "",
      containerType: NG.normalizeContainerType(raw.containerType),
      currency: NG.parse.normalizeCurrency(raw.currency || ""),
      minCharge: raw.minCharge == null || raw.minCharge === "" ? "" : NG.trimNum(raw.minCharge, 2),
      note: raw.note || "",
      qty: "",
      qtyManual: false,
      hideFromQuote: !!raw.hideFromQuote,
      fromAirPlan: !!raw.fromAirPlan,
    };
    if (item.unit) {
      const qty = NG.cargo.qtyForUnit(item.unit, state.cargo, currentSummary(), item.containerType);
      item.qty = qty === "" || qty == null ? "" : qty;
    }
    return item;
  }

  function isMoneyField(field) {
    return field === "costPrice" || field === "minCharge" || field === "quotePrice";
  }

  function moneyInputValue(value) {
    if (value === "" || value == null || String(value).trim() === "") return "";
    const n = Number(String(value).replace(/,/g, ""));
    if (!isFinite(n)) return String(value);
    return n.toFixed(2);
  }

  function shownQty(item) {
    if (!item || item.qty === "" || item.qty == null) return "";
    if (state.cargo.mode === "air" && item.unit === "kg") {
      const n = NG.num(item.qty);
      if (isFinite(n)) return n.toFixed(1);
    }
    return item.qty;
  }

  function numInput(field, value, label) {
    const input = document.createElement("input");
    const money = isMoneyField(field);
    input.type = "number";
    input.step = "any";
    input.dataset.field = field;
    input.value = money ? moneyInputValue(value) : (value == null ? "" : value);
    input.setAttribute("aria-label", label);
    input.inputMode = "decimal";
    if (money) {
      input.addEventListener("blur", function () {
        const shown = moneyInputValue(input.value);
        if (shown !== input.value) input.value = shown;
      });
    }
    return input;
  }

  function textInput(field, value, label) {
    const input = document.createElement("input");
    input.dataset.field = field;
    input.value = value == null ? "" : value;
    input.setAttribute("aria-label", label);
    return input;
  }

  function containerTypeSelect(item) {
    const select = document.createElement("select");
    select.dataset.field = "containerType";
    select.setAttribute("aria-label", "櫃型");
    select.hidden = item.unit !== "container";
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "不指定（總櫃數）";
    select.appendChild(blank);
    NG.config.containerTypes.forEach(function (code) {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = code;
      if (item.containerType === code) option.selected = true;
      select.appendChild(option);
    });
    return select;
  }

  function unitField(item) {
    const wrap = document.createElement("div");
    wrap.className = "unit-cell";
    wrap.appendChild(unitSelect(item));
    wrap.appendChild(containerTypeSelect(item));
    return wrap;
  }

  function unitSelect(item) {
    const select = document.createElement("select");
    select.dataset.field = "unit";
    select.setAttribute("aria-label", "計價單位");
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "請選擇";
    select.appendChild(blank);
    NG.config.units.forEach(function (unit) {
      const option = document.createElement("option");
      option.value = unit.id;
      option.textContent = unit.label;
      if (item.unit === unit.id) option.selected = true;
      select.appendChild(option);
    });
    return select;
  }

  function currencyInput(item) {
    const input = textInput("currency", item.currency, "幣別");
    input.setAttribute("list", "currency-list");
    input.maxLength = 12;
    input.spellcheck = false;
    input.autocomplete = "off";
    return input;
  }

  function deleteButton(action, id) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn ghost";
    button.dataset.action = action;
    button.dataset.id = id;
    button.textContent = "刪除";
    return button;
  }

  function buildItemRow(item, mode) {
    const tr = document.createElement("tr");
    tr.dataset.id = item.id;
    const totals = NG.pricing.lineTotals(item);
    function addCell(node, className) {
      const td = document.createElement("td");
      if (className) td.className = className;
      td.appendChild(node);
      tr.appendChild(td);
      return td;
    }
    const nameCell = addCell(textInput("name", item.name, "項目名稱"), "cell-name");
    nameCell.firstChild.autocomplete = "off";
    if (mode === "price") addCell(unitField(item));
    if (mode === "price") addCell(numInput("qty", shownQty(item), "數量"));
    addCell(numInput("costPrice", item.costPrice, "成本單價"));
    if (mode === "import") addCell(unitField(item));
    addCell(numInput("minCharge", item.minCharge, "最低收費"));
    if (mode === "price") {
      const cost = document.createElement("td");
      cost.dataset.out = "cost";
      cost.className = "num";
      cost.textContent = NG.formatMoney(totals.cost);
      tr.appendChild(cost);
      addCell(numInput("quotePrice", item.quotePrice, "報價單價"));
      const quote = document.createElement("td");
      quote.dataset.out = "quote";
      quote.className = "num";
      quote.textContent = NG.formatMoney(totals.quote);
      tr.appendChild(quote);
    }
    addCell(currencyInput(item));
    const note = textInput("note", item.note, "備註");
    note.autocomplete = "off";
    addCell(note, "cell-note");
    const hide = document.createElement("input");
    hide.type = "checkbox";
    hide.dataset.field = "hideFromQuote";
    hide.checked = !!item.hideFromQuote;
    hide.setAttribute("aria-label", "不顯示在報價單");
    addCell(hide);
    addCell(deleteButton("delete-item", item.id));
    return tr;
  }

  function renderImportTable() {
    const body = $("import-body");
    body.replaceChildren();
    state.items.forEach(function (item) { body.appendChild(buildItemRow(item, "import")); });
    $("import-empty").hidden = state.items.length > 0;
    paintGuard();
  }

  function renderPriceTable() {
    const body = $("price-body");
    body.replaceChildren();
    state.items.forEach(function (item) { body.appendChild(buildItemRow(item, "price")); });
    $("price-empty").hidden = state.items.length > 0;
    paintGuard();
  }

  function paintWeightUnit() {
    const unit = state.cargo.weightUnit === "lb" ? "lb" : "kg";
    ["kg", "lb"].forEach(function (name) {
      const button = $("weight-unit-" + name);
      if (!button) return;
      const on = unit === name;
      button.classList.toggle("is-active", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
    const hint = $("weight-kg");
    if (!hint) return;
    const text = NG.cargo.weightHint(state.cargo);
    hint.hidden = !text;
    hint.textContent = text;
  }

  function setWeightUnit(next) {
    if (!canWrite()) return;
    const target = next === "lb" ? "lb" : "kg";
    const current = state.cargo.weightUnit === "lb" ? "lb" : "kg";
    if (target === current) return;
    state.cargo.grossWeightKg = NG.cargo.convertWeight(state.cargo.grossWeightKg, current, target);
    state.cargo.weightUnit = target;
    settings.weightUnit = target;
    NG.storage.saveSettings(settings);
    $("gross-weight").value = state.cargo.grossWeightKg;
    paintWeightUnit();
    syncAutoQty();
    renderMetrics();
    renderTotals();
    scheduleDraft();
  }

  function dimUnit() {
    return state.cargo.dimUnit === "inch" ? "inch" : "cm";
  }

  function hasDimSize(dim) {
    return dim.l !== "" && dim.l != null || dim.w !== "" && dim.w != null || dim.h !== "" && dim.h != null;
  }

  function paintDimCbm(cell, dim) {
    const amount = cell.querySelector('[data-out="cbm"]');
    const hint = cell.querySelector('[data-out="cm-size"]');
    if (amount) amount.textContent = NG.formatMeasure(NG.cargo.rowCbm(dim, dimUnit()), 4);
    if (!hint) return;
    const show = dimUnit() === "inch" && hasDimSize(dim);
    hint.hidden = !show;
    hint.textContent = show ? NG.cargo.cmSizeText(dim) : "";
  }

  function paintDimUnit() {
    const unit = dimUnit();
    ["cm", "inch"].forEach(function (name) {
      const button = $("dim-unit-" + name);
      if (!button) return;
      const on = unit === name;
      button.classList.toggle("is-active", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function convertLength(value, fromUnit, toUnit) {
    if (value === "" || value == null || String(value).trim() === "") return "";
    const n = NG.num(value);
    const cm = fromUnit === "inch" ? n * 2.54 : n;
    const next = toUnit === "inch" ? cm / 2.54 : cm;
    return (Math.round((next + Number.EPSILON) * 10) / 10).toFixed(1);
  }

  function setDimUnit(next) {
    if (!canWrite()) return;
    const target = next === "inch" ? "inch" : "cm";
    const current = dimUnit();
    if (target === current) return;
    state.cargo.dimensions.forEach(function (dim) {
      dim.l = convertLength(dim.l, current, target);
      dim.w = convertLength(dim.w, current, target);
      dim.h = convertLength(dim.h, current, target);
    });
    state.cargo.dimUnit = target;
    settings.dimUnit = target;
    NG.storage.saveSettings(settings);
    paintDimUnit();
    renderDims();
    syncAutoQty();
    renderMetrics();
    renderTotals();
    scheduleDraft();
  }

  function renderDims() {
    const body = $("dim-body");
    body.replaceChildren();
    state.cargo.dimensions.forEach(function (dim) {
      const tr = document.createElement("tr");
      tr.dataset.id = dim.id;
      [["l", "長"], ["w", "寬"], ["h", "高"], ["pieces", "件數"]].forEach(function (pair) {
        const td = document.createElement("td");
        td.appendChild(numInput(pair[0], dim[pair[0]], pair[1]));
        tr.appendChild(td);
      });
      const cbm = document.createElement("td");
      cbm.className = "num dim-cbm";
      const amount = document.createElement("span");
      amount.dataset.out = "cbm";
      const hint = document.createElement("span");
      hint.dataset.out = "cm-size";
      hint.className = "dim-cm";
      cbm.append(amount, hint);
      paintDimCbm(cbm, dim);
      tr.appendChild(cbm);
      const action = document.createElement("td");
      action.appendChild(deleteButton("delete-dim", dim.id));
      tr.appendChild(action);
      body.appendChild(tr);
    });
    paintDimUnit();
    paintGuard();
  }

  function blankContainer() {
    return { id: NG.uid(), type: "", count: "" };
  }

  function cargoTypeSelect(row) {
    const select = document.createElement("select");
    select.dataset.field = "type";
    select.setAttribute("aria-label", "櫃型");
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "未指定";
    select.appendChild(blank);
    NG.config.containerTypes.forEach(function (code) {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = code;
      if (row.type === code) option.selected = true;
      select.appendChild(option);
    });
    return select;
  }

  function renderContainers() {
    const body = $("container-body");
    if (!body) return;
    body.replaceChildren();
    state.cargo.containers.forEach(function (row) {
      const tr = document.createElement("tr");
      tr.dataset.id = row.id;
      const typeCell = document.createElement("td");
      typeCell.appendChild(cargoTypeSelect(row));
      tr.appendChild(typeCell);
      const countCell = document.createElement("td");
      countCell.appendChild(numInput("count", row.count, "櫃數"));
      tr.appendChild(countCell);
      const action = document.createElement("td");
      action.appendChild(deleteButton("delete-container", row.id));
      tr.appendChild(action);
      body.appendChild(tr);
    });
    paintGuard();
  }

  function paintDirection() {
    ["import", "export"].forEach(function (name) {
      const button = $("direction-" + name);
      if (!button) return;
      const on = state.direction === name;
      button.classList.toggle("is-active", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function paintMode() {
    const fcl = state.cargo.mode === "fcl";
    if (fcl && !state.cargo.containers.length) state.cargo.containers.push(blankContainer());
    $("container-field").hidden = fcl;
    $("container-block").hidden = !fcl;
  }

  function fillCargoForm() {
    $("gross-weight").value = state.cargo.grossWeightKg;
    paintWeightUnit();
    $("total-pieces").value = state.cargo.pieces;
    $("ship-mode").value = state.cargo.mode || "air";
    paintDirection();
    $("container-count").value = state.cargo.containerCount;
    paintMode();
    renderContainers();
    paintDimUnit();
  }

  function fillSettings() {
    $("set-air").value = settings.airKgPerCbm;
    $("set-sea").value = settings.seaKgPerCbm;
    $("set-express").value = settings.expressDivisor;
    $("set-cai").value = settings.caiFactor;
    const currency = $("default-currency");
    if (currency && !currency.options.length) {
      NG.config.currencies.forEach(function (code) {
        const option = document.createElement("option");
        option.value = code;
        option.textContent = code;
        currency.appendChild(option);
      });
    }
    if (currency) {
      const code = settings.defaultCurrency || "USD";
      if (code && !Array.prototype.some.call(currency.options, function (option) { return option.value === code; })) {
        const extra = document.createElement("option");
        extra.value = code;
        extra.textContent = code;
        currency.appendChild(extra);
      }
      currency.value = code;
    }
  }

  function fillQuoteForm() {
    $("customer-name").value = state.customerName || "";
    $("quote-date").value = state.quoteDate || "";
    $("valid-until").value = state.validUntil || "";
    $("quote-number").value = state.quoteNumber || "";
    $("remarks").value = state.remarks || "";
    $("route").value = state.route || "";
    $("markup-percent").value = state.markupPercent || "";
    $("show-twd").checked = !!state.showTwdTotal;
  }

  function renderMetrics() {
    const summary = currentSummary();
    $("m-cbm").textContent = NG.formatMeasure(summary.cbm, 4);
    $("m-cai").textContent = NG.formatMeasure(summary.cai, 3);
    $("m-vol").textContent = NG.formatMeasure(summary.volumetric, 3);
    $("m-chg").textContent = summary.mode === "air"
      ? NG.formatFixed(summary.chargeable, 1)
      : NG.formatMeasure(summary.chargeable, 3);
    const imported = summary.cbmFromImport ? "合計 CBM 使用匯入的材積。" : "";
    const frozen = state && state.calcSettings ? "這張報價的材積重與計費重量使用存檔時的計算參數。" : "";
    $("metric-note").textContent = (summary.warning ? summary.warning + "。" : "") + imported + NG.cargo.formulaText(summary, calcForQuote()) + frozen;
    renderCalcLine();
  }

  function renderTotals() {
    const host = $("totals");
    host.replaceChildren();
    const groups = NG.pricing.groupByCurrency(state.items);
    if (!groups.length) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = "尚未有可加總的項目。";
      host.appendChild(p);
      return;
    }
    groups.forEach(function (group) {
      const card = document.createElement("article");
      const title = document.createElement("h3");
      title.textContent = group.currency;
      card.appendChild(title);
      [
        ["成本總額", NG.formatMoney(group.cost), ""],
        ["報價總額", NG.formatMoney(group.quote), ""],
        ["毛利", NG.formatMoney(group.margin), group.margin < 0 ? "loss" : ""],
        ["毛利率", NG.formatPercent(group.marginRate), group.margin < 0 ? "loss" : ""],
      ].forEach(function (row) {
        const p = document.createElement("p");
        if (row[2]) p.className = row[2];
        const name = document.createElement("span");
        name.textContent = row[0];
        const value = document.createElement("span");
        value.textContent = row[1];
        p.append(name, value);
        card.appendChild(p);
      });
      if (group.incomplete) {
        const note = document.createElement("p");
        note.className = "hint";
        note.textContent = "有項目還沒有數量，未計入。";
        card.appendChild(note);
      }
      host.appendChild(card);
    });
  }

  function isZeroQty(item) {
    if (!item || item.qty === "" || item.qty == null) return false;
    return NG.num(item.qty) === 0;
  }

  function quoteItems() {
    return state.items.filter(function (item) {
      if (item.hideFromQuote) return false;
      if (!state.showZeroLines && isZeroQty(item)) return false;
      return true;
    });
  }

  function formatByCurrency(currency, value) {
    if (value == null || !isFinite(Number(value))) return "—";
    return currency === "TWD" ? NG.formatInteger(value) : NG.formatMoney(value);
  }

  function currencyCaption(currency) {
    return currency === "未指定" ? "未指定　請確認幣別" : currency;
  }

  function lineSubtotalText(item) {
    const totals = NG.pricing.lineTotals(item);
    if (totals.quote == null) return "—";
    const currency = NG.parse.currencyKey(item.currency);
    if (currency === "TWD") return NG.formatInteger(NG.pricing.roundMoney(totals.quote, 0));
    return NG.formatMoney(totals.quote);
  }

  function appendTotalRows(dl, groups) {
    groups.forEach(function (group) {
      const caption = currencyCaption(group.currency);
      const subtotal = group.subtotal != null ? group.subtotal : group.quote;
      const rows = group.taxed
        ? [[caption + " 未稅小計", subtotal], [caption + " 營業稅 5%", group.tax], [caption + " 含稅總計", group.total]]
        : [[caption, subtotal]];
      rows.forEach(function (row) {
        const div = document.createElement("div");
        const dt = document.createElement("dt");
        dt.textContent = row[0];
        const dd = document.createElement("dd");
        dd.textContent = formatByCurrency(group.currency, row[1]);
        div.append(dt, dd);
        dl.appendChild(div);
      });
    });
  }

  function buildModel() {
    const summary = currentSummary();
    const visible = quoteItems();
    const groups = NG.pricing.displayTotals(visible, { taxRate: state.taxRate, direction: state.direction });
    return {
      companyName: NG.config.companyName,
      quoteNumber: state.quoteNumber,
      customerName: state.customerName,
      quoteDate: state.quoteDate,
      validUntil: state.validUntil,
      remarks: state.remarks,
      mode: state.cargo.mode,
      modeLabel: NG.modeLabel(state.cargo.mode),
      containerCount: state.cargo.containerCount,
      containerSummary: NG.cargo.containerSummary(state.cargo),
      route: state.route || "",
      weightText: NG.cargo.weightQuoteText(state.cargo),
      dimUnit: state.cargo.dimUnit === "inch" ? "inch" : "cm",
      dimensions: state.cargo.dimensions,
      summary: summary,
      lines: visible.map(function (item) {
        const totals = NG.pricing.lineTotals(item);
        return {
          name: item.name || "（未命名）",
          unit: NG.quoteUnitLabel(item.unit, item.containerType),
          qty: totals.qty,
          price: item.quotePrice === "" ? null : NG.num(item.quotePrice),
          currency: NG.parse.currencyKey(item.currency),
          subtotal: totals.quote == null ? null : (NG.parse.currencyKey(item.currency) === "TWD" ? NG.pricing.roundMoney(totals.quote, 0) : totals.quote),
          minCharge: NG.num(item.minCharge) > 0 ? NG.num(item.minCharge) : null,
        };
      }),
      groups: groups,
      showTwd: !!state.showTwdTotal,
      twd: NG.pricing.twdEquivalent(groups, state.rates, { taxRate: state.taxRate }),
    };
  }

  function quoteUnitField(item) {
    const wrap = document.createElement("div");
    wrap.className = "unit-cell";
    const select = document.createElement("select");
    select.dataset.field = "unit";
    select.setAttribute("aria-label", "計價單位");
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "Select unit";
    select.appendChild(blank);
    NG.config.units.forEach(function (unit) {
      const option = document.createElement("option");
      option.value = unit.id;
      option.textContent = unit.label;
      if (item.unit === unit.id) option.selected = true;
      select.appendChild(option);
    });
    wrap.appendChild(select);
    wrap.appendChild(containerTypeSelect(item));
    if (NG.num(item.minCharge) > 0) {
      const min = document.createElement("span");
      min.className = "q-min";
      min.textContent = "MIN " + NG.formatMoney(item.minCharge);
      wrap.appendChild(min);
    }
    return wrap;
  }

  function buildQuoteEditRow(item) {
    const tr = document.createElement("tr");
    tr.dataset.id = item.id;
    function add(node, className) {
      const td = document.createElement("td");
      if (className) td.className = className;
      td.appendChild(node);
      tr.appendChild(td);
    }
    const name = textInput("name", item.name, "項目名稱");
    name.autocomplete = "off";
    add(name, "cell-name");
    add(quoteUnitField(item));
    add(numInput("qty", shownQty(item), "數量"));
    add(numInput("quotePrice", item.quotePrice, "報價單價"));
    add(currencyInput(item));
    const sub = document.createElement("td");
    sub.className = "num";
    sub.dataset.out = "subtotal";
    sub.textContent = lineSubtotalText(item);
    tr.appendChild(sub);
    const action = document.createElement("td");
    action.appendChild(deleteButton("delete-quote-line", item.id));
    tr.appendChild(action);
    return tr;
  }

  function renderQuoteEditor() {
    const host = $("quote-edit");
    if (!host) return;
    host.replaceChildren();
    const toggle = document.createElement("label");
    toggle.className = "check";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.id = "show-zero-lines";
    box.checked = !!state.showZeroLines;
    toggle.append(box, document.createTextNode("顯示數量為 0 的項目"));
    host.appendChild(toggle);
    const hiddenItems = state.items.filter(function (item) { return item.hideFromQuote; });
    if (hiddenItems.length) {
      const hiddenBox = document.createElement("div");
      hiddenBox.className = "hidden-lines";
      hiddenItems.forEach(function (item) {
        const label = document.createElement("label");
        label.className = "check";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = true;
        input.addEventListener("change", function () {
          if (!canWrite()) {
            input.checked = true;
            return;
          }
          item.hideFromQuote = input.checked;
          renderQuoteBody();
          renderTotals();
          scheduleDraft();
        });
        label.append(input, document.createTextNode("不顯示在報價單：" + (item.name || "（未命名）")));
        hiddenBox.appendChild(label);
      });
      host.appendChild(hiddenBox);
    }
    const visible = quoteItems();
    if (!visible.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = state.items.length ? "數量為 0 的項目已隱藏。" : "尚未有費用項目。";
      host.appendChild(empty);
    } else {
      const table = document.createElement("table");
      const headRow = document.createElement("tr");
      ["項目", "計價單位", "數量", "報價單價", "幣別", "報價小計", ""].forEach(function (label) {
        const th = document.createElement("th");
        th.textContent = label;
        headRow.appendChild(th);
      });
      const thead = document.createElement("thead");
      thead.appendChild(headRow);
      const tbody = document.createElement("tbody");
      visible.forEach(function (item) { tbody.appendChild(buildQuoteEditRow(item)); });
      table.append(thead, tbody);
      host.appendChild(table);
    }
    const add = document.createElement("button");
    add.type = "button";
    add.className = "btn q-add";
    add.dataset.action = "add-quote-line";
    add.textContent = "＋ 新增一列";
    host.appendChild(add);
    paintGuard();
  }

  function refreshQuoteTotals() {
    const section = document.querySelector("#quote-body .q-totals");
    if (!section) return;
    const model = buildModel();
    const note = section.querySelector(".q-note");
    Array.from(section.children).forEach(function (child) {
      if (child.tagName === "H3" || child.classList.contains("q-note")) return;
      child.remove();
    });
    const node = document.createElement(model.groups.length ? "dl" : "p");
    if (!model.groups.length) node.textContent = "—";
    appendTotalRows(node, model.groups);
    if (note) section.insertBefore(node, note);
    else section.appendChild(node);
  }

  function afterQuoteNumbers(tr, item) {
    if (isZeroQty(item) && !state.showZeroLines) {
      renderQuoteBody();
      renderTotals();
      syncTwdEditor(true);
      updateTwdPrint();
      scheduleDraft();
      return;
    }
    const cell = tr && tr.querySelector('[data-out="subtotal"]');
    if (cell) cell.textContent = lineSubtotalText(item);
    refreshQuoteTotals();
    renderTotals();
    syncTwdEditor(true);
    updateTwdPrint();
    scheduleDraft();
  }

  function onQuoteEdit(event) {
    if (!canWrite()) return;
    const target = event.target;
    if (target.id === "show-zero-lines") {
      if (event.type !== "change") return;
      state.showZeroLines = target.checked;
      renderQuoteBody();
      scheduleDraft();
      return;
    }
    if (!target.closest || !target.closest("#quote-edit")) return;
    const field = target.dataset && target.dataset.field;
    if (!field) return;
    const isSelect = target.tagName === "SELECT";
    if (isSelect && event.type !== "change") return;
    if (!isSelect && field !== "currency" && event.type !== "input") return;
    if (!isSelect && event.type === "change" && field !== "currency") return;
    const tr = target.closest("tr");
    const item = state.items.find(function (row) { return row.id === tr.dataset.id; });
    if (!item) return;
    if (field === "name") {
      item.name = target.value;
      scheduleDraft();
      return;
    }
    if (field === "quotePrice") {
      item.quotePrice = target.value;
    } else if (field === "qty") {
      item.qty = target.value;
      item.qtyManual = true;
    } else if (field === "unit") {
      item.unit = target.value;
      const typeSelect = tr.querySelector('[data-field="containerType"]');
      if (typeSelect) typeSelect.hidden = item.unit !== "container";
      applyAutoQty(item, tr);
    } else if (field === "containerType") {
      item.containerType = NG.normalizeContainerType(target.value);
      applyAutoQty(item, tr);
    } else if (field === "currency") {
      item.currency = event.type === "change" ? NG.parse.normalizeCurrency(target.value) : target.value;
      if (event.type === "change") target.value = item.currency;
    } else return;
    afterQuoteNumbers(tr, item);
  }

  function addQuoteLine() {
    if (!canWrite()) return;
    state.items.push(makeItem({ name: "" }));
    renderQuoteBody();
    renderTotals();
    const input = document.querySelector("#quote-edit tbody tr:last-child input");
    if (input) input.focus();
    scheduleDraft();
  }

  function deleteQuoteLine(id) {
    if (!canWrite()) return;
    state.items = state.items.filter(function (item) { return item.id !== id; });
    renderQuoteBody();
    renderTotals();
    syncTwdEditor(true);
    updateTwdPrint();
    scheduleDraft();
  }

  function renderQuoteBody() {
    const model = buildModel();
    $("quote-body").innerHTML = NG.quoteDoc.renderBody(model);
    renderQuoteEditor();
    const remarks = $("quote-remarks");
    const text = String(model.remarks || "").trim();
    if (!remarks) return;
    remarks.hidden = !text;
    remarks.textContent = text ? "備註　" + text : "";
  }

  function rateCodes() {
    return NG.pricing.groupByCurrency(quoteItems())
      .map(function (group) { return group.currency; })
      .filter(function (code) { return code !== "TWD" && code !== "未指定"; });
  }

  function syncTwdEditor(force) {
    const box = $("twd-editor");
    const codes = rateCodes();
    const sig = codes.join("|") + (state.showTwdTotal ? ":on" : ":off");
    box.hidden = !state.showTwdTotal;
    if (!force && sig === rateSig) return;
    rateSig = sig;
    box.replaceChildren();
    if (!state.showTwdTotal) return;
    const unspecified = NG.pricing.groupByCurrency(quoteItems()).some(function (group) {
      return group.currency === "未指定";
    });
    if (unspecified) {
      const warn = document.createElement("p");
      warn.className = "hint";
      warn.textContent = "有未指定幣別的項目，請先補上幣別，否則不算進約當台幣。";
      box.appendChild(warn);
    }
    if (!codes.length) {
      const note = document.createElement("p");
      note.className = "hint";
      note.textContent = "明細若都是台幣，約當合計就等於台幣報價合計。";
      box.appendChild(note);
    }
    codes.forEach(function (code) {
      const label = document.createElement("label");
      label.className = "rate-row";
      const prefix = document.createElement("span");
      prefix.textContent = "1 " + code + " =";
      const input = document.createElement("input");
      input.type = "number";
      input.step = "any";
      input.min = "0";
      input.dataset.currency = code;
      input.setAttribute("aria-label", code + " 對台幣匯率");
      input.value = state.rates[code] == null ? "" : state.rates[code];
      input.addEventListener("input", onRateInput);
      const suffix = document.createElement("span");
      suffix.textContent = "TWD";
      label.append(prefix, input, suffix);
      box.appendChild(label);
    });
    paintGuard();
  }

  function updateTwdPrint() {
    const host = $("twd-print");
    host.replaceChildren();
    if (!state.showTwdTotal) return;
    const model = buildModel();
    const heading = document.createElement("h3");
    heading.textContent = "約當台幣合計";
    host.appendChild(heading);
    const note = document.createElement("p");
    note.className = "q-note";
    note.textContent = "匯率為手動輸入，未連線查詢，僅供參考。";
    host.appendChild(note);
    if (!model.twd.lines.length) {
      const empty = document.createElement("p");
      empty.textContent = "沒有可換算的費用。";
      host.appendChild(empty);
      return;
    }
    const list = document.createElement("ul");
    list.className = "twd-lines";
    model.twd.lines.forEach(function (line) {
      const item = document.createElement("li");
      item.textContent = NG.pricing.twdLineParts(line).text;
      list.appendChild(item);
    });
    host.appendChild(list);
    NG.pricing.twdTotalParts(model).forEach(function (row) {
      const sum = document.createElement("p");
      sum.className = row.emphasis ? "twd-sum" : "twd-part";
      sum.textContent = row.text;
      host.appendChild(sum);
    });
  }

  function applyAutoQty(item, tr) {
    if (item.qtyManual) return;
    const qty = NG.cargo.qtyForUnit(item.unit, state.cargo, currentSummary(), item.containerType);
    item.qty = qty === "" || qty == null ? "" : qty;
    if (!tr) return;
    const qtyInput = tr.querySelector('[data-field="qty"]');
    if (qtyInput) qtyInput.value = shownQty(item);
  }

  function refreshDerivedRow(tr, item) {
    const totals = NG.pricing.lineTotals(item);
    const cost = tr.querySelector('[data-out="cost"]');
    const quote = tr.querySelector('[data-out="quote"]');
    if (cost) cost.textContent = NG.formatMoney(totals.cost);
    if (quote) quote.textContent = NG.formatMoney(totals.quote);
  }

  function afterItemsChanged() {
    renderTotals();
    if (currentStep === "quote") {
      renderQuoteBody();
      syncTwdEditor(true);
      updateTwdPrint();
    }
    scheduleDraft();
  }

  function onItemEdit(event) {
    if (!canWrite()) return;
    const target = event.target;
    const field = target.dataset && target.dataset.field;
    if (!field) return;
    if (field === "hideFromQuote") {
      if (event.type !== "change") return;
      const row = target.closest("tr");
      const item = state.items.find(function (entry) { return entry.id === row.dataset.id; });
      if (!item) return;
      item.hideFromQuote = !!target.checked;
      afterItemsChanged();
      return;
    }
    const isSelect = target.tagName === "SELECT";
    if (isSelect && event.type !== "change") return;
    if (!isSelect && field !== "currency" && event.type !== "input") return;
    if (field === "currency" && event.type === "input") {
      /* 幣別在離開欄位時再正規化 */
    } else if (!isSelect && event.type === "change" && field !== "currency") return;
    const tr = target.closest("tr");
    const item = state.items.find(function (row) { return row.id === tr.dataset.id; });
    if (!item) return;
    if (field === "qty") {
      item.qty = target.value;
      item.qtyManual = true;
    } else if (field === "unit") {
      item.unit = target.value;
      const typeSelect = tr.querySelector('[data-field="containerType"]');
      if (typeSelect) typeSelect.hidden = item.unit !== "container";
      applyAutoQty(item, tr);
    } else if (field === "containerType") {
      item.containerType = NG.normalizeContainerType(target.value);
      applyAutoQty(item, tr);
    } else if (field === "currency") {
      item.currency = event.type === "change" ? NG.parse.normalizeCurrency(target.value) : target.value;
      if (event.type === "change") target.value = item.currency;
    } else {
      item[field] = target.value;
    }
    refreshDerivedRow(tr, item);
    afterItemsChanged();
  }

  function renderVisibleItems() {
    if (currentStep === "price") renderPriceTable();
    else renderImportTable();
    afterItemsChanged();
  }

  function addItem() {
    if (!canWrite()) return;
    state.items.push(makeItem({ name: "" }));
    renderVisibleItems();
    const body = currentStep === "price" ? $("price-body") : $("import-body");
    const input = body.querySelector("tr:last-child input");
    if (input) input.focus();
  }

  function onCargoEdit(event) {
    if (!canWrite()) return;
    const target = event.target;
    if (target.dataset && target.dataset.setting) {
      if (!canCalc()) return;
      const key = target.dataset.setting;
      const value = parseFloat(target.value);
      if (!isFinite(value) || !(value > 0)) return;
      settings[key] = value;
      syncAutoQty();
      renderMetrics();
      renderTotals();
      scheduleDraft();
      scheduleSharedSettings();
      return;
    }
    const field = target.dataset && target.dataset.field;
    if (!field) return;
    const isSelect = target.tagName === "SELECT";
    if (isSelect && event.type !== "change") return;
    if (!isSelect && event.type !== "input") return;
    const box = target.closest("#container-body tr");
    if (box) {
      const row = state.cargo.containers.find(function (item) { return item.id === box.dataset.id; });
      if (!row) return;
      if (field === "type") row.type = NG.normalizeContainerType(target.value);
      else row[field] = target.value;
    } else {
      const tr = target.closest("#dim-body tr");
      if (tr) {
        const dim = state.cargo.dimensions.find(function (row) { return row.id === tr.dataset.id; });
        if (!dim) return;
        dim[field] = target.value;
        const cell = tr.querySelector(".dim-cbm");
        if (cell) paintDimCbm(cell, dim);
      } else {
        state.cargo[field] = target.value;
        if (field === "grossWeightKg") paintWeightUnit();
        if (field === "mode") {
          paintMode();
          renderContainers();
        }
      }
    }
    syncAutoQty();
    renderMetrics();
    renderTotals();
    scheduleDraft();
  }

  async function ensureNumber() {
    if (String(state.quoteNumber || "").trim()) return state.quoteNumber;
    if (!canWrite()) return "";
    try {
      const data = await NG.api.post("/api/quote-numbers", {
        quoteDate: state.quoteDate || NG.todayISO(),
      });
      state.quoteNumber = data.quoteNumber;
      if ($("quote-number")) $("quote-number").value = state.quoteNumber;
      scheduleDraft();
      return state.quoteNumber;
    } catch (error) {
      setStatus("無法取得單號，沒有另外編號。畫面上的內容還在。");
      throw error;
    }
  }

  function setStep(name, force) {
    if (!canSeeCost() && (name === "import" || name === "price")) name = "quote";
    if (!force && name === currentStep) return;
    if (name === "price" || name === "quote") syncAutoQty();
    if (name === "quote" && canWrite()) ensureNumber().catch(function () {});
    currentStep = name;
    STEPS.forEach(function (step) {
      $("panel-" + step).hidden = step !== name;
      const button = document.querySelector('[data-step="' + step + '"]');
      const on = step === name;
      button.classList.toggle("is-active", on);
      button.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (name === "import") renderImportTable();
    if (name === "cargo") {
      fillCargoForm();
      renderDims();
      renderMetrics();
    }
    if (name === "price") {
      renderPriceTable();
      renderTotals();
    }
    if (name === "quote") {
      fillQuoteForm();
      renderQuoteBody();
      syncTwdEditor(true);
      updateTwdPrint();
    }
    paintGuard();
    scheduleDraft();
  }

  function appendRawItems(rawItems) {
    if (rawItems.route && !state.route) state.route = rawItems.route;
    const fallback = settings.defaultCurrency || "USD";
    rawItems.forEach(function (raw) {
      if (!raw.currency) raw.currency = fallback;
      state.items.push(makeItem(raw));
    });
    renderImportTable();
    renderTotals();
    scheduleDraft();
  }

  function commitExcel(rawItems) {
    const drop = new Set((excelSession && excelSession.importedIds) || []);
    state.items = state.items.filter(function (item) { return !drop.has(item.id); });
    const before = state.items.length;
    rawItems.forEach(function (raw) { state.items.push(makeItem(raw)); });
    excelSession.importedIds = state.items.slice(before).map(function (item) { return item.id; });
    renderImportTable();
    renderTotals();
    scheduleDraft();
  }

  function columnLetter(index) {
    let n = index + 1;
    let letters = "";
    while (n > 0) {
      const mod = (n - 1) % 26;
      letters = String.fromCharCode(65 + mod) + letters;
      n = Math.floor((n - 1) / 26);
    }
    return letters;
  }

  function fillSelect(select, options, selected) {
    select.replaceChildren();
    options.forEach(function (option) {
      const node = document.createElement("option");
      node.value = option.value;
      node.textContent = option.label;
      if (String(selected) === String(option.value)) node.selected = true;
      select.appendChild(node);
    });
  }

  function openMapping() {
    if (!excelSession) return;
    const rows = excelSession.rows || [];
    const width = rows.reduce(function (max, row) { return Math.max(max, (row || []).length); }, 0);
    const headerOptions = [{ value: "-1", label: "沒有表頭" }].concat(rows.slice(0, 20).map(function (row, index) {
      return { value: String(index), label: "第 " + (index + 1) + " 列：" + (row || []).slice(0, 4).join(" | ") };
    }));
    const detected = excelSession.detected;
    fillSelect($("map-header"), headerOptions, detected ? detected.headerRow : 0);
    ["name", "price", "unit", "currency"].forEach(function (field) {
      const options = [{ value: "", label: field === "name" || field === "price" ? "請選擇" : "（無此欄）" }];
      for (let i = 0; i < width; i += 1) {
        const sample = rows.slice(0, 6).map(function (row) { return (row || [])[i]; }).filter(Boolean)[0] || "";
        options.push({ value: String(i), label: columnLetter(i) + "（" + sample + "）" });
      }
      const selected = detected && detected.map[field] != null ? detected.map[field] : "";
      fillSelect($("map-" + field), options, selected);
    });
    const preview = $("map-preview");
    preview.replaceChildren();
    const table = document.createElement("table");
    rows.slice(0, 8).forEach(function (row) {
      const tr = document.createElement("tr");
      for (let i = 0; i < Math.max(width, 1); i += 1) {
        const td = document.createElement("td");
        td.textContent = (row || [])[i] == null ? "" : (row || [])[i];
        tr.appendChild(td);
      }
      table.appendChild(tr);
    });
    preview.appendChild(table);
    $("excel-map").hidden = false;
    $("btn-remap").hidden = false;
  }

  function applyMapping() {
    if (!canWrite()) return;
    if (!excelSession) return;
    const headerRow = Number($("map-header").value);
    function col(id) {
      const value = $(id).value;
      return value === "" ? null : Number(value);
    }
    const map = { name: col("map-name"), price: col("map-price"), unit: col("map-unit"), currency: col("map-currency") };
    if (map.name == null || map.price == null) {
      setStatus("請至少對應項目名稱和單價");
      return;
    }
    const items = NG.importExcel.rowsToItems(excelSession.rows, headerRow, map);
    if (!items.length) {
      setStatus("這個對應沒有讀到項目，請改欄位");
      return;
    }
    excelSession.detected = { headerRow: headerRow, map: map };
    commitExcel(items);
    setStatus("已依欄位對應加入 " + items.length + " 個項目");
  }

  function feesOnlyChecked() {
    const box = $("fees-only");
    return !box || box.checked;
  }

  function convertDim(value, fromUnit, target) {
    const n = Number(value);
    if (!isFinite(n)) return "";
    let cm = n;
    if (fromUnit === "mm") cm = n / 10;
    else if (fromUnit === "inch") cm = n * 2.54;
    const out = target === "inch" ? cm / 2.54 : cm;
    return String(Math.round((out + Number.EPSILON) * 1000) / 1000);
  }

  async function onWord(file) {
    if (!canWrite()) return;
    const result = await NG.importWord.fromFile(file, {
      feesOnly: feesOnlyChecked(),
      chargeableKg: stepChargeableKg(),
    });
    $("word-text").textContent = result.text || "（沒有文字）";
    $("word-text-wrap").hidden = false;
    const applied = applyParsedCargo(result.items);
    presentAirPlans(result.items);
    const skipped = result.items.skipped || [];
    showParseReport(result.items.length, skipped);
    if (!result.items.length) {
      $("paste-text").value = result.text;
      scheduleDraft();
      const summary = "已匯入 0 筆費用，略過 " + skipped.length + " 行非費用文字";
      setStatus((applied.length ? summary + "，已帶入" + applied.join("、") : summary) + "。文字已放到下方");
      return;
    }
    appendRawItems(result.items);
    const summary = "已從 Word 加入 " + result.items.length + " 個項目";
    const planNote = result.items.airPlans && result.items.airPlans.length ? "。請選一個航空方案" : "";
    setStatus((applied.length ? summary + "，已帶入" + applied.join("、") : summary) + planNote);
  }

  async function onExcel(file) {
    if (!canWrite()) return;
    const result = await NG.importExcel.fromFile(file);
    excelSession = {
      rows: result.rows,
      sheetName: result.sheetName,
      detected: result.detected,
      importedIds: [],
    };
    $("btn-remap").hidden = false;
    const extra = result.sheetCount > 1 ? "（只讀第一個工作表「" + result.sheetName + "」）" : "";
    if (!result.items.length) {
      openMapping();
      setStatus("認不出欄位，請指定對應" + extra);
      return;
    }
    commitExcel(result.items);
    setStatus("已從「" + result.sheetName + "」加入 " + result.items.length + " 個項目" + extra);
  }

  async function onPdf(file) {
    if (!canWrite()) return;
    setStatus("正在讀取 PDF…");
    const result = await NG.importPdf.fromFile(file);
    if (!result.text) {
      setStatus("這個 PDF 是圖片，無法讀取文字，請改用手動輸入或貼上文字");
      return;
    }
    $("paste-text").value = result.text;
    setStatus("已讀取 PDF 文字，請檢查後按「解析文字」");
  }

  function dimsHaveSize(cargo) {
    return (cargo.dimensions || []).some(function (row) {
      return row && (row.l !== "" && row.l != null || row.w !== "" && row.w != null || row.h !== "" && row.h != null);
    });
  }

  function fieldEmpty(value) {
    return value === "" || value == null;
  }

  function applyParsedCargo(parsed) {
    const cargo = parsed && parsed.cargo ? parsed.cargo : {};
    const applied = [];
    const weightHit = cargo.weight || cargo.chargeableWeight;
    if (weightHit && fieldEmpty(state.cargo.grossWeightKg)) {
      if (weightHit.unit === "lb") {
        state.cargo.weightUnit = "lb";
        state.cargo.grossWeightKg = String(weightHit.value);
      } else {
        const target = state.cargo.weightUnit === "lb" ? "lb" : "kg";
        state.cargo.grossWeightKg = weightHit.unit === target
          ? String(weightHit.value)
          : NG.cargo.convertWeight(weightHit.value, weightHit.unit, target);
      }
      applied.push("毛重");
    }
    if (!fieldEmpty(cargo.pieces) && fieldEmpty(state.cargo.pieces)) {
      state.cargo.pieces = cargo.pieces;
      applied.push("件數");
    }
    const incomingDims = Array.isArray(cargo.dimensions) ? cargo.dimensions : [];
    if (incomingDims.length && !dimsHaveSize(state.cargo)) {
      if (incomingDims.every(function (dim) { return dim.unit === "inch"; })) state.cargo.dimUnit = "inch";
      const target = state.cargo.dimUnit === "inch" ? "inch" : "cm";
      state.cargo.dimensions = incomingDims.map(function (dim) {
        const keep = dim.unit === "inch" && target === "inch";
        return {
          id: NG.uid(),
          l: keep ? String(dim.l == null ? "" : dim.l) : convertDim(dim.l, dim.unit, target),
          w: keep ? String(dim.w == null ? "" : dim.w) : convertDim(dim.w, dim.unit, target),
          h: keep ? String(dim.h == null ? "" : dim.h) : convertDim(dim.h, dim.unit, target),
          pieces: dim.pieces == null ? "" : String(dim.pieces),
        };
      });
      applied.push("尺寸");
      if (applied.indexOf("件數") < 0 && incomingDims.some(function (dim) { return dim.pieces !== "" && dim.pieces != null; })) {
        applied.push("件數");
      }
      renderDims();
    }
    if (!fieldEmpty(cargo.volumeCbm) && fieldEmpty(state.cargo.volumeCbm) && !dimsHaveSize(state.cargo)) {
      state.cargo.volumeCbm = cargo.volumeCbm;
      applied.push("合計 CBM");
    }
    const bits = [];
    if (cargo.airline) bits.push(cargo.airline);
    if (cargo.route) bits.push(cargo.route);
    if (bits.length) {
      const joined = bits.join(" / ");
      if (!state.route) {
        state.route = joined;
        applied.push("航線");
      } else if (!state.remarks) {
        state.remarks = joined;
        applied.push("備註");
      } else if (state.remarks.indexOf(joined) < 0) {
        state.remarks = state.remarks + "\n" + joined;
        applied.push("備註");
      }
    }
    if (cargo.mode && ["air", "lcl", "fcl", "express"].indexOf(cargo.mode) >= 0 && state.cargo.mode !== cargo.mode) {
      state.cargo.mode = cargo.mode;
      const ship = $("ship-mode");
      if (ship) ship.value = state.cargo.mode;
      paintMode();
      applied.push("運輸方式");
    }
    $("gross-weight").value = state.cargo.grossWeightKg;
    $("total-pieces").value = state.cargo.pieces;
    paintWeightUnit();
    paintDimUnit();
    fillQuoteForm();
    renderMetrics();
    return applied;
  }

  function showParseReport(count, skipped) {
    const box = $("parse-report");
    const summary = $("parse-report-summary");
    const list = $("parse-report-list");
    const lines = skipped || [];
    summary.textContent = "已匯入 " + count + " 筆費用，略過 " + lines.length + " 行非費用文字";
    list.replaceChildren();
    lines.forEach(function (line) {
      const li = document.createElement("li");
      const text = document.createElement("span");
      text.textContent = line;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn ghost";
      button.textContent = "加回";
      button.addEventListener("click", function () {
        state.items.push(makeItem({
          name: line,
          costPrice: "",
          quotePrice: "",
          unit: "",
          currency: settings.defaultCurrency || "USD",
        }));
        renderImportTable();
        renderTotals();
        scheduleDraft();
        setStatus("已加回 1 行，請補上單價和單位");
      });
      li.append(text, button);
      list.appendChild(li);
    });
    box.hidden = false;
    box.open = false;
  }

  function airPlanText(plan) {
    const bits = [plan.code];
    if (plan.freight != null) bits.push((plan.breakLabel || "+100K") + " 運費 " + plan.freight + " Per KG");
    if (plan.my != null) bits.push("MY " + plan.my + " Per KG");
    if (plan.extras && plan.extras.length) {
      bits.push(plan.extras.map(function (extra) {
        if (extra.unpriced || !extra.amount) return extra.name;
        return extra.name + " " + extra.amount + " " + NG.unitLabel(extra.unit);
      }).join("、"));
    }
    if (plan.route) bits.push(plan.route);
    if (plan.note) bits.push(plan.note);
    return bits.join("｜");
  }

  function showAirPlans(plans) {
    const box = $("air-plans");
    const list = $("air-plan-list");
    if (!box || !list) return;
    airPlanState.plans = plans || [];
    list.replaceChildren();
    if (!airPlanState.plans.length) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    airPlanState.plans.forEach(function (plan, index) {
      const label = document.createElement("label");
      label.className = "air-plan";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "air-plan";
      input.value = String(index);
      input.addEventListener("change", function () {
        if (input.checked) applyAirPlan(index);
      });
      const text = document.createElement("span");
      text.textContent = airPlanText(plan);
      label.append(input, text);
      list.appendChild(label);
    });
  }

  function applyAirPlan(index) {
    const plan = airPlanState.plans[index];
    if (!plan) return;
    state.items = state.items.filter(function (item) { return !item.fromAirPlan; });
    NG.parse.expandAirPlan(plan).forEach(function (raw) {
      const item = makeItem(raw);
      item.fromAirPlan = true;
      state.items.push(item);
    });
    const prev = airPlanState.appliedRoute || "";
    if (plan.route && (!state.route || state.route === prev)) {
      state.route = plan.route;
      airPlanState.appliedRoute = plan.route;
      const route = $("route");
      if (route) route.value = state.route;
    }
    renderImportTable();
    if (currentStep === "price") renderPriceTable();
    renderTotals();
    if (currentStep === "quote") {
      fillQuoteForm();
      renderQuoteBody();
    }
    scheduleDraft();
    setStatus("已帶入 " + plan.code + " 方案" + (plan.route ? "，航線 " + plan.route : ""));
  }

  function presentAirPlans(items) {
    const plans = items && items.airPlans ? items.airPlans : [];
    if (plans.length) {
      const prev = airPlanState.appliedRoute || "";
      state.items = state.items.filter(function (item) { return !item.fromAirPlan; });
      if (prev && state.route === prev) {
        state.route = "";
        const route = $("route");
        if (route) route.value = "";
      }
      airPlanState.appliedRoute = "";
    }
    showAirPlans(plans);
  }

  function parsePaste() {
    if (!canWrite()) return;
    const items = NG.parse.parseCostText($("paste-text").value, {
      feesOnly: feesOnlyChecked(),
      chargeableKg: stepChargeableKg(),
    });
    const applied = applyParsedCargo(items);
    presentAirPlans(items);
    const skipped = items.skipped || [];
    showParseReport(items.length, skipped);
    if (items.length) appendRawItems(items);
    else scheduleDraft();
    const summary = "已匯入 " + items.length + " 筆費用，略過 " + skipped.length + " 行非費用文字";
    const planNote = items.airPlans && items.airPlans.length ? "。請選一個航空方案" : "";
    setStatus((applied.length ? summary + "，已帶入" + applied.join("、") : summary) + planNote);
  }

  function applyMarkup() {
    if (!canWrite()) return;
    const raw = $("markup-percent").value;
    const percent = parseFloat(raw);
    if (!isFinite(percent)) {
      setStatus("請輸入加成百分比，例如 10");
      return;
    }
    state.markupPercent = raw;
    state.items.forEach(function (item) {
      item.quotePrice = NG.trimNum(NG.num(item.costPrice) * (1 + percent / 100), 4);
    });
    renderPriceTable();
    renderTotals();
    scheduleDraft();
    setStatus("已套用加成 " + raw + "%");
  }

  function recalcQty() {
    if (!canWrite()) return;
    state.items.forEach(function (item) { item.qtyManual = false; });
    syncAutoQty();
    renderPriceTable();
    renderTotals();
    scheduleDraft();
    setStatus("已依目前貨物重算數量");
  }

  function applyState(next, options) {
    state = normalizeState(next);
    rateSig = "";
    fillCargoForm();
    fillQuoteForm();
    syncAutoQty();
    renderDims();
    renderImportTable();
    renderPriceTable();
    renderMetrics();
    renderTotals();
    renderQuoteBody();
    syncTwdEditor(true);
    updateTwdPrint();
    if (!options || options.skipDraft !== true) scheduleDraft();
    if (!canWrite()) paintGuard();
    if (typeof NG.refreshNav === "function") NG.refreshNav();
  }

  function saveFailure(error) {
    scheduleDraft();
    if (error && error.status === 409) {
      setStatus("這筆剛剛被其他人改過。伺服器上的版本沒被蓋掉。你畫面上的修改還在。");
      return;
    }
    if (error && error.status === 403) {
      setStatus("沒有權限，沒有存到伺服器。畫面上的內容還在。");
      return;
    }
    if (error && error.status === 400) {
      setStatus(error.message || "沒有存到伺服器，這筆還在這台電腦");
      return;
    }
    setStatus("沒有存到伺服器，這筆還在這台電腦");
  }

  async function saveQuote() {
    if (!canWrite()) {
      setStatus("沒有權限，沒有存到伺服器。畫面上的內容還在。");
      return;
    }
    if (!settingsReady && !(state && state.calcSettings)) {
      setStatus("讀不到計算設定，先不要儲存報價");
      return;
    }
    const needsDirection = !(state.id && Number(state.taxRate) === 0);
    if (needsDirection && state.direction !== "import" && state.direction !== "export") {
      setStatus("請選擇進口或出口");
      return;
    }
    stopDraft();
    try {
      await ensureNumber();
      const body = { document: snapshot() };
      let payload;
      if (state.id) {
        body.updatedAt = state.updatedAt;
        payload = await NG.api.put("/api/quotes/" + encodeURIComponent(state.id), body);
      } else {
        payload = await NG.api.post("/api/quotes", body);
      }
      applyState(payload.item.document, { skipDraft: true });
      if (!NG.storage.saveDraft(snapshot(), false)) setStatus("已存入共用資料庫，但這台瀏覽器的草稿無法更新");
      fillQuoteForm();
      renderQuoteBody();
      setStatus(state.customerName ? "已儲存 " + state.quoteNumber : "已儲存 " + state.quoteNumber + "（尚未填客戶名稱）");
    } catch (error) {
      saveFailure(error);
    }
  }

  function moneyText(quote) {
    const groups = quote.sellingTotals || [];
    if (!groups.length) return "沒有費用項目";
    return groups.map(function (group) {
      const caption = currencyCaption(group.currency);
      const subtotal = group.subtotal != null ? group.subtotal : group.quote;
      if (!group.taxed) return caption + " " + formatByCurrency(group.currency, subtotal);
      return caption + " 未稅 " + formatByCurrency(group.currency, subtotal)
        + "、營業稅 " + formatByCurrency(group.currency, group.tax)
        + "、含稅 " + formatByCurrency(group.currency, group.total);
    }).join("、");
  }

  function historyButtons(quote) {
    const pairs = [["載入", "load-quote"]];
    if (canCopy()) pairs.push(["複製", "copy-quote"]);
    if (canDeleteQuote()) pairs.push(["刪除", "delete-quote"]);
    return pairs.map(function (pair) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = pair[1] === "delete-quote" ? "btn danger" : "btn ghost";
      button.dataset.action = pair[1];
      button.dataset.id = quote.id;
      button.dataset.number = quote.quoteNumber || "";
      button.textContent = pair[0];
      return button;
    });
  }

  async function renderHistory() {
    const host = $("history-list");
    if (!host) return;
    const token = ++historyToken;
    host.replaceChildren();
    const waiting = document.createElement("p");
    waiting.className = "empty";
    waiting.textContent = "讀取報價中";
    host.appendChild(waiting);
    const params = new URLSearchParams();
    const q = $("history-q") ? $("history-q").value : "";
    const mode = $("history-mode") ? $("history-mode").value : "";
    const dateFrom = $("history-from") ? $("history-from").value : "";
    const dateTo = $("history-to") ? $("history-to").value : "";
    if (q.trim()) params.set("q", q.trim());
    if (mode) params.set("mode", mode);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    let data;
    try {
      data = await NG.api.get("/api/quotes" + (params.toString() ? "?" + params.toString() : ""));
      if (token !== historyToken) return;
    } catch (error) {
      if (token !== historyToken) return;
      host.replaceChildren();
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = "讀不到報價";
      host.appendChild(p);
      return;
    }
    host.replaceChildren();
    const quotes = data && Array.isArray(data.items) ? data.items : [];
    if (!quotes.length) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = "沒有符合的報價紀錄";
      host.appendChild(p);
      return;
    }
    quotes.forEach(function (quote) {
      const card = document.createElement("article");
      card.className = "history-card";
      const title = document.createElement("h3");
      title.textContent = quote.quoteNumber || "（無單號）";
      const meta = document.createElement("p");
      meta.textContent = (quote.customerName || "未填客戶") + "　" + (quote.quoteDate || "") + "　" + NG.modeLabel(quote.mode);
      const flow = document.createElement("p");
      flow.textContent = "進出口　" + (quote.direction === "import" ? "進口" : quote.direction === "export" ? "出口" : "—");
      const who = document.createElement("p");
      const created = quote.createdBy && quote.createdBy.displayName ? quote.createdBy.displayName : "未知使用者";
      const updated = quote.updatedBy && quote.updatedBy.displayName ? quote.updatedBy.displayName : created;
      who.textContent = "建立：" + created + "　最後修改：" + updated;
      const money = document.createElement("p");
      money.textContent = moneyText(quote);
      const actions = document.createElement("div");
      actions.className = "row-actions";
      historyButtons(quote).forEach(function (button) { actions.appendChild(button); });
      card.append(title, meta, flow, who, money, actions);
      host.appendChild(card);
    });
    if (data.limit && quotes.length >= data.limit) {
      const more = document.createElement("p");
      more.className = "hint";
      more.textContent = "只顯示最新 " + data.limit + " 筆，請用搜尋縮小範圍。";
      host.appendChild(more);
    }
  }

  async function loadQuote(id) {
    let payload;
    try {
      payload = await NG.api.get("/api/quotes/" + encodeURIComponent(id));
    } catch (error) {
      setStatus("讀不到這筆報價，畫面上的內容還在");
      return;
    }
    const next = payload.item.document;
    (next.items || []).forEach(function (item) { item.qtyManual = true; });
    applyState(next, { skipDraft: true });
    NG.storage.saveDraft(snapshot(), false);
    showView("new-quote");
    setStep(canSeeCost() ? "price" : "quote", true);
    setStatus("已載入 " + (next.quoteNumber || "") + "。數量先維持原報價。材積重與計費重量使用這張報價存檔時的計算參數。");
  }

  async function copyQuote(id) {
    if (!canCopy()) {
      setStatus("沒有權限，沒有新增報價");
      return;
    }
    let payload;
    try {
      payload = await NG.api.get("/api/quotes/" + encodeURIComponent(id));
    } catch (error) {
      setStatus("讀不到這筆報價，畫面上的內容還在");
      return;
    }
    const next = payload.item.document;
    next.id = null;
    next.createdAt = null;
    next.updatedAt = null;
    next.calcSettings = null;
    next.direction = "";
    next.taxRate = 0.05;
    next.quoteDate = NG.todayISO();
    next.validUntil = NG.addDays(next.quoteDate, 14);
    next.quoteNumber = "";
    (next.items || []).forEach(function (item) {
      item.id = NG.uid();
      item.qtyManual = true;
    });
    (next.cargo.dimensions || []).forEach(function (dim) { dim.id = NG.uid(); });
    if (Array.isArray(next.cargo.containers)) {
      next.cargo.containers.forEach(function (row) { row.id = NG.uid(); });
    }
    applyState(next, { skipDraft: true });
    scheduleDraft();
    showView("new-quote");
    setStep(canSeeCost() ? "price" : "quote", true);
    if (!canWrite()) {
      setStatus("已複製內容，沒有編輯權限，尚未存到伺服器。");
      return;
    }
    try {
      await ensureNumber();
    } catch (error) {
      setStatus("已複製內容，但沒有取得新單號。畫面上的內容還在，尚未存到伺服器。");
      return;
    }
    setStatus("已複製成新單 " + state.quoteNumber + "，尚未儲存。請選擇進口或出口。計算參數用現在的共用設定。");
  }

  async function deleteQuote(id, quoteNumber) {
    if (!canDeleteQuote()) {
      setStatus("沒有權限，沒有刪除");
      return;
    }
    const label = quoteNumber || "這筆報價";
    if (!window.confirm("刪除 " + label + "？會從共用資料庫刪除，所有人都看不到。")) return;
    try {
      await NG.api.del("/api/quotes/" + encodeURIComponent(id));
    } catch (error) {
      setStatus("沒有刪除。畫面上的內容還在。");
      return;
    }
    if (state.id === id) state.id = null;
    renderHistory();
    setStatus("已從共用資料庫刪除報價");
  }

  function clearImportArtifacts() {
    const paste = $("paste-text");
    if (paste) paste.value = "";
    const word = $("word-text");
    if (word) word.textContent = "";
    const wordWrap = $("word-text-wrap");
    if (wordWrap) wordWrap.hidden = true;
    ["file-word", "file-excel", "file-pdf"].forEach(function (id) {
      const input = $(id);
      if (input) input.value = "";
    });
    const report = $("parse-report");
    if (report) {
      report.hidden = true;
      report.open = false;
    }
    const summary = $("parse-report-summary");
    if (summary) summary.textContent = "";
    const list = $("parse-report-list");
    if (list) list.replaceChildren();
    const remap = $("btn-remap");
    if (remap) remap.hidden = true;
    const map = $("excel-map");
    if (map) map.hidden = true;
    const preview = $("map-preview");
    if (preview) preview.replaceChildren();
    airPlanState = { plans: [], appliedRoute: "" };
    const plans = $("air-plans");
    if (plans) plans.hidden = true;
    const planList = $("air-plan-list");
    if (planList) planList.replaceChildren();
    ["map-header", "map-name", "map-price", "map-unit", "map-currency"].forEach(function (id) {
      const select = $(id);
      if (select) select.replaceChildren();
    });
  }

  function emptyQuoteControls() {
    document.querySelectorAll("textarea").forEach(function (el) {
      if (el.closest("#view-history") || el.closest("#view-backup") || el.closest("#view-settings")) return;
      el.value = "";
    });
    document.querySelectorAll("input").forEach(function (el) {
      if (el.closest("#view-history") || el.closest("#view-backup") || el.closest("#view-settings")) return;
      if (el.dataset && el.dataset.setting) return;
      if (el.id === "default-currency" || el.id === "fees-only" || el.id === "history-q") return;
      if (el.type === "file") {
        el.value = "";
        return;
      }
      if (el.type === "checkbox" || el.type === "radio") {
        if (el.id !== "fees-only") el.checked = false;
        return;
      }
      el.value = "";
    });
    ["import-body", "price-body", "dim-body", "container-body"].forEach(function (id) {
      const body = $(id);
      if (body) body.replaceChildren();
    });
  }

  function newQuote() {
    if (!canWrite()) return;
    if (hasContent(snapshot()) && !window.confirm("要清除目前內容，開始一筆新報價嗎？已儲存的歷史報價不會被刪除。")) return;
    suppressDraft = true;
    try {
      stopDraft();
      NG.storage.clearDraft();
      excelSession = null;
      rateSig = "";
      clearImportArtifacts();
      emptyQuoteControls();
      applyState(blankState(), { skipDraft: true });
      setStep("import", true);
    } finally {
      suppressDraft = false;
      stopDraft();
      NG.storage.clearDraft();
    }
    setStatus("已開始新報價");
    showView("new-quote");
  }

  function onRateInput(event) {
    if (!canWrite()) return;
    const code = event.target.dataset.currency;
    state.rates[code] = event.target.value;
    updateTwdPrint();
    scheduleDraft();
  }

  function onMeta(event) {
    if (!canWrite()) return;
    const map = {
      "customer-name": "customerName",
      "quote-date": "quoteDate",
      "valid-until": "validUntil",
      "quote-number": "quoteNumber",
      "remarks": "remarks",
      "route": "route",
      "markup-percent": "markupPercent",
    };
    const key = map[event.target.id];
    if (!key || key === "quoteNumber") return;
    state[key] = event.target.value;
    if (currentStep === "quote" && key !== "markupPercent") renderQuoteBody();
    scheduleDraft();
  }

  function showBackupMsg(text, isError) {
    const el = $("backup-msg");
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || "";
    el.classList.toggle("backup-error", !!isError);
  }

  function hideBackupPanel() {
    pendingBackup = null;
    const panel = $("backup-import-panel");
    if (panel) panel.hidden = true;
  }

  function backupFileName(date) {
    const d = date || new Date();
    const z = function (n) { return String(n).padStart(2, "0"); };
    return "quote-backup-" + d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + "-" + z(d.getHours()) + z(d.getMinutes()) + ".json";
  }

  function flushDraft() {
    stopDraft();
    return NG.storage.saveDraft(snapshot());
  }

  let confirmedCalc = null;

  function applySharedSettings(data) {
    settings.airKgPerCbm = data.airKgPerCbm;
    settings.seaKgPerCbm = data.seaKgPerCbm;
    settings.expressDivisor = data.expressDivisor;
    settings.caiFactor = data.caiFactor;
    settings.updatedAt = data.updatedAt;
    settingsReady = true;
    confirmedCalc = {
      airKgPerCbm: data.airKgPerCbm,
      seaKgPerCbm: data.seaKgPerCbm,
      expressDivisor: data.expressDivisor,
      caiFactor: data.caiFactor,
      updatedAt: data.updatedAt,
    };
  }

  function revertSharedSettings() {
    if (!confirmedCalc) return;
    settings.airKgPerCbm = confirmedCalc.airKgPerCbm;
    settings.seaKgPerCbm = confirmedCalc.seaKgPerCbm;
    settings.expressDivisor = confirmedCalc.expressDivisor;
    settings.caiFactor = confirmedCalc.caiFactor;
    settings.updatedAt = confirmedCalc.updatedAt;
    fillSettings();
    syncAutoQty();
    renderMetrics();
    renderTotals();
  }

  function scheduleSharedSettings() {
    if (!canCalc()) return;
    window.clearTimeout(settingsTimer);
    settingsTimer = window.setTimeout(function () {
      settingsTimer = 0;
      const payload = {
        airKgPerCbm: settings.airKgPerCbm,
        seaKgPerCbm: settings.seaKgPerCbm,
        expressDivisor: settings.expressDivisor,
        caiFactor: settings.caiFactor,
        updatedAt: settings.updatedAt,
      };
      NG.api.put("/api/settings", payload).then(function (data) {
        applySharedSettings(data);
      }).catch(function (error) {
        if (error.status === 409 && error.data && error.data.settings) {
          applySharedSettings(error.data.settings);
          fillSettings();
          syncAutoQty();
          renderMetrics();
          renderTotals();
          setStatus("計算設定剛剛被其他人改過，已改顯示最新的共用設定。");
          return;
        }
        revertSharedSettings();
        setStatus("計算設定沒有存到伺服器");
      });
    }, 400);
  }

  function showLegacyBanner() {
    const banner = $("legacy-banner");
    if (!banner) return;
    const quotes = NG.storage.loadQuotes();
    if (!quotes.length) {
      banner.hidden = true;
      return;
    }
    banner.hidden = false;
    const text = $("legacy-banner-text");
    if (text) {
      text.textContent = "這台瀏覽器還有 " + quotes.length + " 筆舊報價，尚未進共用資料庫。請下載後交給管理員匯入。系統不會自動上傳。";
    }
  }

  function paintGuard() {
    if (canWrite()) return;
    document.querySelectorAll("#panel-import input, #panel-import textarea, #panel-import select, #panel-import button, #panel-cargo input, #panel-cargo textarea, #panel-cargo select, #panel-cargo button, #panel-price input, #panel-price textarea, #panel-price select, #panel-price button, #panel-quote input, #panel-quote textarea, #panel-quote select, #panel-quote button").forEach(function (el) {
      if (el.id === "print-quote" || el.id === "export-quote") return;
      if (el.dataset && (el.dataset.step || el.dataset.stepNext)) return;
      el.disabled = true;
    });
  }

  function applyRole() {
    const cost = canSeeCost();
    const write = canWrite();
    const calc = canCalc();
    document.body.dataset.role = roleName();
    document.body.dataset.write = write ? "1" : "0";
    document.body.dataset.cost = cost ? "1" : "0";
    renderCalcLine();
    if ($("new-quote")) $("new-quote").hidden = !write;
    if ($("save-quote")) $("save-quote").hidden = !write;
    ["btn-word", "btn-excel", "btn-pdf", "parse-text"].forEach(function (id) {
      if ($(id)) $(id).hidden = !write;
    });
    if ($("backup-import")) $("backup-import").hidden = !canImportBackup();
    if ($("backup-export")) $("backup-export").hidden = !canExportBackup();
    ["import", "price"].forEach(function (step) {
      const button = document.querySelector('[data-step="' + step + '"]');
      if (button) button.hidden = !cost;
    });
    const bar = document.querySelector(".markup-bar");
    if (bar) bar.hidden = !cost;
    if ($("reset-settings")) $("reset-settings").hidden = !calc;
    ["set-air", "set-sea", "set-express", "set-cai"].forEach(function (id) {
      if ($(id)) $(id).disabled = !calc;
    });
    if ($("quote-number")) $("quote-number").readOnly = true;
    paintGuard();
  }

  function downloadBackup(payload) {
    const name = backupFileName();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    return name;
  }

  async function exportBackupFile() {
    if (!canExportBackup()) {
      const message = "沒有權限，沒有下載備份。";
      showBackupMsg(message, true);
      setStatus(message);
      return "";
    }
    flushDraft();
    try {
      const remote = await NG.api.get("/api/backups/export");
      const prefs = NG.storage.loadPrefs();
      const name = downloadBackup({
        kind: "northgo-quote-backup",
        version: 1,
        exportedAt: new Date().toISOString(),
        quotes: remote.quotes || [],
        draft: NG.storage.loadDraft(),
        settings: {
          airKgPerCbm: remote.settings.airKgPerCbm,
          seaKgPerCbm: remote.settings.seaKgPerCbm,
          expressDivisor: remote.settings.expressDivisor,
          caiFactor: remote.settings.caiFactor,
          dimUnit: prefs.dimUnit,
          weightUnit: prefs.weightUnit,
          defaultCurrency: prefs.defaultCurrency,
        },
        seq: remote.seq || {},
      });
      const message = "已下載 " + name + "。這是共用資料庫的備份，檔案在這台電腦。";
      showBackupMsg(message, false);
      setStatus(message);
      return name;
    } catch (error) {
      const message = "沒有下載備份。";
      showBackupMsg(message, true);
      setStatus(message);
      return "";
    }
  }

  async function confirmBackupImport() {
    if (!canImportBackup()) {
      const message = "沒有權限，沒有變更現有資料。";
      showBackupMsg(message, true);
      setStatus(message);
      return;
    }
    const backup = pendingBackup;
    if (!backup) return;
    pendingBackup = null;
    try {
      const result = await NG.api.post("/api/backups/import", { mode: "merge", backup: backup });
      $("backup-import-panel").hidden = true;
      renderHistory();
      const message = "已合併備份。新增 " + result.inserted + "、更新 " + result.updated + "、略過 " + result.skipped + "。目前共 " + result.count + " 筆。";
      showBackupMsg(message, false);
      setStatus(message);
    } catch (error) {
      pendingBackup = backup;
      const message = (error && error.message) || "沒有變更現有資料。";
      showBackupMsg(message, true);
      setStatus(message);
    }
  }

  function openBackupFile(file) {
    const reader = new FileReader();
    reader.onload = function () {
      const parsed = NG.storage.parseBackup(String(reader.result || ""));
      if (!parsed.ok) {
        hideBackupPanel();
        showBackupMsg(parsed.error, true);
        setStatus(parsed.error);
        return;
      }
      pendingBackup = parsed.backup;
      const merge = document.querySelector('#backup-import-panel input[value="merge"]');
      if (merge) merge.checked = true;
      $("backup-import-count").textContent = "檔案內有 " + parsed.backup.quotes.length + " 筆報價";
      $("backup-import-panel").hidden = false;
      showBackupMsg("", false);
    };
    reader.onerror = function () {
      hideBackupPanel();
      const message = "無法讀取檔案，沒有變更現有資料。";
      showBackupMsg(message, true);
      setStatus(message);
    };
    reader.readAsText(file, "UTF-8");
  }

  function bind() {
    document.querySelectorAll("[data-step]").forEach(function (button) {
      button.addEventListener("click", function () { setStep(button.dataset.step); });
    });
    document.querySelectorAll("[data-step-next]").forEach(function (button) {
      button.addEventListener("click", function () { setStep(button.dataset.stepNext); });
    });
    $("btn-word").addEventListener("click", function () { $("file-word").click(); });
    $("btn-excel").addEventListener("click", function () { $("file-excel").click(); });
    $("btn-pdf").addEventListener("click", function () { $("file-pdf").click(); });
    $("file-word").addEventListener("change", function (event) {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (!file) return;
      onWord(file).catch(function (error) { setStatus("無法讀取 Word：" + (error.message || error)); });
    });
    $("file-excel").addEventListener("change", function (event) {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (!file) return;
      onExcel(file).catch(function (error) { setStatus("無法讀取 Excel：" + (error.message || error)); });
    });
    $("file-pdf").addEventListener("change", function (event) {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (!file) return;
      onPdf(file).catch(function (error) {
        if (error && error.code === "password") {
          setStatus(error.message);
          return;
        }
        setStatus("無法讀取 PDF：" + (error && error.message ? error.message : error));
      });
    });
    $("parse-text").addEventListener("click", parsePaste);
    $("paste-text").addEventListener("keydown", function (event) {
      if (event.ctrlKey && event.key === "Enter") parsePaste();
    });
    $("add-item").addEventListener("click", addItem);
    $("add-item-price").addEventListener("click", addItem);
    $("add-dim").addEventListener("click", function () {
      state.cargo.dimensions.push(blankDim());
      renderDims();
      const input = $("dim-body").querySelector("tr:last-child input");
      if (input) input.focus();
      scheduleDraft();
    });
    $("add-container").addEventListener("click", function () {
      state.cargo.containers.push(blankContainer());
      renderContainers();
      const input = $("container-body").querySelector("tr:last-child select");
      if (input) input.focus();
      scheduleDraft();
    });
    $("clear-items").addEventListener("click", function () {
      if (state.items.length && !window.confirm("清空所有成本項目？")) return;
      state.items = [];
      if (excelSession) excelSession.importedIds = [];
      renderImportTable();
      renderTotals();
      scheduleDraft();
      setStatus("已清空成本項目");
    });
    $("import-body").addEventListener("input", onItemEdit);
    $("import-body").addEventListener("change", onItemEdit);
    $("price-body").addEventListener("input", onItemEdit);
    $("price-body").addEventListener("change", onItemEdit);
    document.querySelectorAll("[data-direction]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (!canWrite()) return;
        const next = button.dataset.direction === "export" ? "export" : "import";
        state.direction = next;
        paintDirection();
        scheduleDraft();
      });
    });
    document.querySelectorAll("[data-weight-unit]").forEach(function (button) {
      button.addEventListener("click", function () { setWeightUnit(button.dataset.weightUnit); });
    });
    document.querySelectorAll("[data-dim-unit]").forEach(function (button) {
      button.addEventListener("click", function () { setDimUnit(button.dataset.dimUnit); });
    });
    $("panel-cargo").addEventListener("input", onCargoEdit);
    $("panel-cargo").addEventListener("change", onCargoEdit);
    const settingsView = $("view-settings");
    if (settingsView) {
      settingsView.addEventListener("input", onCargoEdit);
      settingsView.addEventListener("change", onCargoEdit);
    }
    $("apply-markup").addEventListener("click", applyMarkup);
    $("recalc-qty").addEventListener("click", recalcQty);
    $("reset-settings").addEventListener("click", function () {
      if (!canCalc()) {
        setStatus("沒有權限，計算設定沒有變更");
        return;
      }
      NG.api.put("/api/settings", {
        airKgPerCbm: NG.config.defaults.airKgPerCbm,
        seaKgPerCbm: NG.config.defaults.seaKgPerCbm,
        expressDivisor: NG.config.defaults.expressDivisor,
        caiFactor: NG.config.defaults.caiFactor,
        updatedAt: settings.updatedAt,
      }).then(function (data) {
        applySharedSettings(data);
        fillSettings();
        syncAutoQty();
        renderMetrics();
        renderTotals();
        setStatus("已恢復全公司計算預設值");
      }).catch(function (error) {
        if (error.status === 409 && error.data && error.data.settings) applySharedSettings(error.data.settings);
        else revertSharedSettings();
        fillSettings();
        setStatus("計算設定沒有存到伺服器");
      });
    });
    $("default-currency").addEventListener("change", function (event) {
      const code = NG.parse.normalizeCurrency(event.target.value);
      settings.defaultCurrency = /^[A-Za-z]{3}$/.test(code) ? code : "USD";
      event.target.value = settings.defaultCurrency;
      NG.storage.saveSettings(settings);
    });
    ["customer-name", "quote-date", "valid-until", "quote-number", "remarks", "route", "markup-percent"].forEach(function (id) {
      $(id).addEventListener("input", onMeta);
    });
    $("show-twd").addEventListener("change", function (event) {
      if (!canWrite()) {
        event.target.checked = !!state.showTwdTotal;
        return;
      }
      state.showTwdTotal = event.target.checked;
      syncTwdEditor(true);
      updateTwdPrint();
      scheduleDraft();
    });
    $("panel-quote").addEventListener("input", onQuoteEdit);
    $("panel-quote").addEventListener("change", onQuoteEdit);
    $("panel-quote").addEventListener("click", function (event) {
      if (!canWrite()) return;
      const button = event.target.closest("[data-action]");
      if (!button || !button.closest("#quote-edit")) return;
      if (button.dataset.action === "add-quote-line") addQuoteLine();
      if (button.dataset.action === "delete-quote-line") deleteQuoteLine(button.dataset.id);
    });
    $("save-quote").addEventListener("click", saveQuote);
    $("print-quote").addEventListener("click", function () {
      ensureNumber().then(function () {
        fillQuoteForm();
        renderQuoteBody();
        updateTwdPrint();
        setStep("quote");
        window.print();
      }).catch(function () {});
    });
    let exportingQuote = false;
    $("export-quote").addEventListener("click", function () {
      if (exportingQuote) return;
      exportingQuote = true;
      ensureNumber().then(function () {
        fillQuoteForm();
        return NG.quoteDoc.exportXlsx(buildModel());
      }).then(function () {
        setStatus("已匯出 Excel");
      }).catch(function (error) {
        if (error && error.status === 0) return;
        const message = error && error.message ? error.message : String(error || "");
        const exportFailed = message === "ExcelJS 沒有載入" || message === "Logo 沒有載入" || message === "無法匯出";
        if (!exportFailed && !state.quoteNumber) return;
        setStatus("無法匯出：" + message);
      }).then(function () {
        exportingQuote = false;
      });
    });
    $("new-quote").addEventListener("click", newQuote);
    $("backup-export").addEventListener("click", exportBackupFile);
    $("backup-import").addEventListener("click", function () { $("backup-file").click(); });
    $("backup-file").addEventListener("change", function (event) {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (!file) return;
      openBackupFile(file);
    });
    $("backup-import-confirm").addEventListener("click", confirmBackupImport);
    $("backup-import-cancel").addEventListener("click", function () {
      hideBackupPanel();
      showBackupMsg("", false);
    });
    function queueHistory() {
      window.clearTimeout(historyTimer);
      historyTimer = window.setTimeout(renderHistory, 250);
    }
    $("history-q").addEventListener("input", queueHistory);
    ["history-mode", "history-from", "history-to"].forEach(function (id) {
      const el = $(id);
      if (el) el.addEventListener("change", renderHistory);
    });
    const legacyButton = $("legacy-download");
    if (legacyButton) {
      legacyButton.addEventListener("click", function () {
        try {
          const name = downloadBackup(NG.storage.exportBackup());
          setStatus("已下載 " + name + "。請交給管理員匯入，系統沒有自動上傳。");
        } catch (error) {
          setStatus("無法下載這台瀏覽器的舊報價");
        }
      });
    }
    $("history-list").addEventListener("click", function (event) {
      const button = event.target.closest("[data-action]");
      if (!button) return;
      const id = button.dataset.id;
      if (button.dataset.action === "load-quote") loadQuote(id);
      if (button.dataset.action === "copy-quote") copyQuote(id);
      if (button.dataset.action === "delete-quote") deleteQuote(id, button.dataset.number);
    });
    $("btn-remap").addEventListener("click", openMapping);
    $("map-apply").addEventListener("click", applyMapping);
    $("map-close").addEventListener("click", function () { $("excel-map").hidden = true; });
    document.body.addEventListener("click", function (event) {
      const button = event.target.closest("[data-action]");
      if (!button) return;
      if (!canWrite()) return;
      if (button.dataset.action === "delete-item") {
        state.items = state.items.filter(function (item) { return item.id !== button.dataset.id; });
        renderVisibleItems();
      }
      if (button.dataset.action === "delete-dim") {
        state.cargo.dimensions = state.cargo.dimensions.filter(function (dim) { return dim.id !== button.dataset.id; });
        if (!state.cargo.dimensions.length) state.cargo.dimensions.push(blankDim());
        renderDims();
        syncAutoQty();
        renderMetrics();
        renderTotals();
        scheduleDraft();
      }
      if (button.dataset.action === "delete-container") {
        state.cargo.containers = state.cargo.containers.filter(function (row) { return row.id !== button.dataset.id; });
        if (!state.cargo.containers.length) state.cargo.containers.push(blankContainer());
        renderContainers();
        syncAutoQty();
        renderTotals();
        scheduleDraft();
      }
    });
    window.addEventListener("beforeprint", function () {
      document.body.dataset.printReturn = currentView;
      showView("new-quote");
      if (!String(state.quoteNumber || "").trim() && canWrite()) ensureNumber().catch(function () {});
      renderQuoteBody();
      updateTwdPrint();
      setStep("quote");
    });
    window.addEventListener("afterprint", function () {
      const back = document.body.dataset.printReturn;
      if (back && back !== currentView) showView(back);
    });
    document.addEventListener("click", function (event) {
      if (canWrite()) return;
      const button = event.target.closest("button, a");
      if (!button) return;
      if (button.closest("#sidenav") || button.id === "nav-open" || button.id === "nav-close") return;
      if (button.id === "print-quote" || button.id === "export-quote" || button.id === "backup-export" || button.id === "btn-logout" || button.id === "legacy-download") return;
      if (button.dataset && button.dataset.action === "load-quote") return;
      if (button.dataset && (button.dataset.step || button.dataset.stepNext)) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);
  }

  async function init() {
    const libsReady = !!(window.mammoth && window.XLSX);
    const prefs = NG.storage.loadPrefs();
    settings = Object.assign({}, NG.config.defaults, prefs);
    settingsReady = false;
    state = normalizeState(blankState());
    fillSettings();
    fillCargoForm();
    fillQuoteForm();
    bind();
    showLegacyBanner();
    applyRole();
    try {
      applySharedSettings(await NG.api.get("/api/settings"));
      fillSettings();
      renderMetrics();
    } catch (error) {
      settingsReady = false;
      setStatus("讀不到計算設定，先不要儲存報價");
    }
    const pending = NG.storage.pendingDraft();
    if (pending) {
      applyState(pending, { skipDraft: true });
      const note = "有一份尚未存到伺服器的報價，已恢復在畫面上。";
      setStatus(settingsReady ? note : "讀不到計算設定，先不要儲存報價。" + note);
    }
    renderMetrics();
    setStep(canSeeCost() ? "import" : "quote", true);
    const opening = new URLSearchParams(location.search);
    const requested = opening.get("nav");
    let view = canWrite() ? "new-quote" : "history";
    if (requested === "history") view = "history";
    if (requested === "new-quote" && canWrite()) view = "new-quote";
    if (requested === "calc" && canCalc()) view = "calc";
    if (requested === "backup" && canOpenBackup()) view = "backup";
    showView(view);
    if (requested) history.replaceState(null, "", location.pathname);
    const paste = $("paste-text");
    if (paste) paste.value = "";
    window.addEventListener("pageshow", function (event) {
      if (!event.persisted) return;
      suppressDraft = true;
      try {
        stopDraft();
        excelSession = null;
        rateSig = "";
        airPlanState = { plans: [], appliedRoute: "" };
        clearImportArtifacts();
        emptyQuoteControls();
        applyState(blankState(), { skipDraft: true });
        setStep(canSeeCost() ? "import" : "quote", true);
        showView(canWrite() ? "new-quote" : "history");
      } finally {
        suppressDraft = false;
        stopDraft();
      }
    });
    if (!libsReady) setStatus("函式庫未載入。請用 start.ps1 開啟這個資料夾的網頁。");
  }

  NG.startApp = function () {
    if (NG._appStarted) return;
    NG._appStarted = true;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  };
})(window.NG = window.NG || {});
