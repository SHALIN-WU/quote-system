import { displayTotals } from "./quoteMoney.js";

const MODES = ["air", "lcl", "fcl", "express"];
const CALC_KEYS = ["airKgPerCbm", "seaKgPerCbm", "expressDivisor", "caiFactor"];
export const IMPORT_ACTOR = "__import__";
const LIST_LIMIT = 200;

function fail(message) {
  const error = new Error(message);
  error.code = "INVALID";
  throw error;
}

function num(value) {
  if (value == null || value === "") return 0;
  const n = parseFloat(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function text(value, max) {
  const out = String(value == null ? "" : value);
  return out.length > max ? out.slice(0, max) : out;
}

function keepAmount(value) {
  if (value == null || value === "") return "";
  return text(value, 40);
}

export function calcFromRow(row) {
  return {
    airKgPerCbm: Number(row.air_kg_per_cbm),
    seaKgPerCbm: Number(row.sea_kg_per_cbm),
    expressDivisor: Number(row.express_divisor),
    caiFactor: Number(row.cai_factor),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by || null
  };
}

function cleanCalc(value) {
  if (!value || typeof value !== "object") return null;
  const out = {};
  for (const key of CALC_KEYS) {
    const n = Number(value[key]);
    if (!Number.isFinite(n)) return null;
    out[key] = n;
  }
  return out;
}

function requireCalc(value) {
  const calc = cleanCalc(value);
  if (!calc) fail("計算設定不完整");
  for (const key of CALC_KEYS) {
    if (!(calc[key] > 0)) fail("計算設定需大於 0");
  }
  return calc;
}

export async function getSettings(db) {
  const row = await db.prepare("SELECT * FROM calc_settings WHERE id = 1").first();
  if (!row) fail("讀不到計算設定");
  return calcFromRow(row);
}

export async function updateSettings(db, user, input) {
  const current = await getSettings(db);
  if (input.updatedAt != null && String(input.updatedAt) !== current.updatedAt) {
    const error = new Error("計算設定剛剛被其他人改過");
    error.code = "CONFLICT";
    error.settings = current;
    throw error;
  }
  const calc = requireCalc(input);
  const now = new Date().toISOString();
  const result = await db.prepare(`UPDATE calc_settings
    SET air_kg_per_cbm = ?, sea_kg_per_cbm = ?, express_divisor = ?, cai_factor = ?, updated_at = ?, updated_by = ?
    WHERE id = 1 AND updated_at = ?`).bind(
    calc.airKgPerCbm,
    calc.seaKgPerCbm,
    calc.expressDivisor,
    calc.caiFactor,
    now,
    user.id,
    current.updatedAt
  ).run();
  if (!Number(result?.meta?.changes || 0)) {
    const again = await getSettings(db);
    const error = new Error("計算設定剛剛被其他人改過");
    error.code = "CONFLICT";
    error.settings = again;
    throw error;
  }
  return getSettings(db);
}

function dayKey(iso) {
  const value = String(iso || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value.replace(/-/g, "");
}

function formatNumber(day, n) {
  return "NG-" + day + "-" + String(n).padStart(3, "0");
}

function parseNumber(quoteNumber) {
  const match = /^NG-(\d{8})-(\d+)$/.exec(String(quoteNumber || "").trim());
  if (!match) return null;
  const n = Number(match[2]);
  if (!Number.isInteger(n) || n < 1) return null;
  return { day: match[1], n, quoteNumber: formatNumber(match[1], n) };
}

export async function allocateNumber(db, quoteDate) {
  const day = dayKey(quoteDate);
  if (!day) fail("報價日期不正確");
  const row = await db.prepare(`INSERT INTO quote_counters (day_key, last_n) VALUES (?, 1)
    ON CONFLICT(day_key) DO UPDATE SET last_n = last_n + 1
    RETURNING last_n`).bind(day).first();
  const n = Number(row?.last_n);
  if (!Number.isInteger(n) || n < 1) fail("無法取得單號");
  return formatNumber(day, n);
}

async function assertIssued(db, quoteNumber) {
  const parsed = parseNumber(quoteNumber);
  if (!parsed) fail("單號不正確");
  const row = await db.prepare("SELECT last_n FROM quote_counters WHERE day_key = ?").bind(parsed.day).first();
  if (!row || parsed.n > Number(row.last_n)) fail("單號尚未核發");
  return parsed.quoteNumber;
}

function cleanDate(value) {
  const textValue = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(textValue) ? textValue : "";
}

function cleanCargo(cargo) {
  const source = cargo && typeof cargo === "object" ? cargo : {};
  const mode = MODES.includes(source.mode) ? source.mode : "air";
  const dimensions = Array.isArray(source.dimensions) ? source.dimensions.slice(0, 80) : [];
  const containers = Array.isArray(source.containers) ? source.containers.slice(0, 40) : [];
  return {
    grossWeightKg: keepAmount(source.grossWeightKg),
    pieces: keepAmount(source.pieces),
    volumeCbm: keepAmount(source.volumeCbm),
    mode,
    containerCount: keepAmount(source.containerCount),
    containers: containers.map((row) => ({
      id: text(row && row.id, 80),
      type: text(row && row.type, 20),
      count: keepAmount(row && row.count)
    })),
    dimensions: dimensions.map((row) => ({
      id: text(row && row.id, 80),
      l: keepAmount(row && row.l),
      w: keepAmount(row && row.w),
      h: keepAmount(row && row.h),
      pieces: keepAmount(row && row.pieces)
    })),
    dimUnit: source.dimUnit === "inch" ? "inch" : "cm",
    weightUnit: source.weightUnit === "lb" ? "lb" : "kg"
  };
}

function cleanItems(items) {
  const list = Array.isArray(items) ? items : [];
  if (list.length > 400) fail("費用項目太多，沒有存到伺服器");
  return list.map((item) => {
    const source = item && typeof item === "object" ? item : {};
    return {
      id: text(source.id, 80),
      name: text(source.name, 200),
      costPrice: keepAmount(source.costPrice),
      quotePrice: keepAmount(source.quotePrice),
      unit: text(source.unit, 40),
      containerType: text(source.containerType, 20),
      currency: text(source.currency, 12),
      minCharge: keepAmount(source.minCharge),
      note: text(source.note, 500),
      qty: keepAmount(source.qty),
      qtyManual: !!source.qtyManual,
      hideFromQuote: !!source.hideFromQuote,
      fromAirPlan: !!source.fromAirPlan
    };
  });
}

function cleanDirection(value) {
  return value === "import" || value === "export" ? value : "";
}

function cleanTaxRate(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) return 0;
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

function customerItems(doc) {
  const showZero = !!(doc && doc.showZeroLines);
  return ((doc && doc.items) || []).filter((item) => {
    if (!item || item.hideFromQuote) return false;
    if (!showZero && item.qty !== "" && item.qty != null && num(item.qty) === 0) return false;
    return true;
  });
}

function presentedTotals(row) {
  try {
    const doc = JSON.parse(row.document || "{}");
    const taxRate = row.tax_rate != null && row.tax_rate !== "" ? row.tax_rate : doc.taxRate;
    const direction = row.direction || doc.direction || "";
    return displayTotals(customerItems(doc), { taxRate: cleanTaxRate(taxRate), direction: cleanDirection(direction) });
  } catch {
    return JSON.parse(row.selling_totals || "[]");
  }
}

function cleanRates(value) {
  const out = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const key of Object.keys(value).slice(0, 20)) {
    out[text(key, 12)] = text(value[key], 40);
  }
  return out;
}

function buildDocument(input, fixed) {
  const source = input && typeof input === "object" ? input : {};
  const cargo = cleanCargo(source.cargo);
  const items = cleanItems(source.items);
  return {
    id: fixed.id,
    quoteNumber: fixed.quoteNumber,
    customerName: text(source.customerName, 200),
    quoteDate: fixed.quoteDate,
    validUntil: cleanDate(source.validUntil),
    remarks: text(source.remarks, 5000),
    route: text(source.route, 300),
    cargo,
    items,
    markupPercent: text(source.markupPercent, 40),
    showTwdTotal: !!source.showTwdTotal,
    showZeroLines: !!source.showZeroLines,
    rates: cleanRates(source.rates),
    direction: cleanDirection(source.direction),
    taxRate: cleanTaxRate(source.taxRate),
    calcSettings: fixed.calcSettings,
    createdAt: fixed.createdAt,
    updatedAt: fixed.updatedAt
  };
}

function clearIncomingCost(document) {
  document.markupPercent = "";
  document.items = document.items.map((item) => ({ ...item, costPrice: "" }));
  return document;
}

function keepStoredCost(document, previous) {
  const prevItems = new Map();
  for (const item of (previous && previous.items) || []) {
    if (item && item.id) prevItems.set(item.id, item);
  }
  document.markupPercent = text(previous && previous.markupPercent, 40);
  document.items = document.items.map((item) => {
    const prev = item.id ? prevItems.get(item.id) : null;
    return { ...item, costPrice: prev ? keepAmount(prev.costPrice) : "" };
  });
  return document;
}

// 沒有「看成本與毛利」時使用。不回 costPrice、markupPercent，也不回 profit、margin、marginRate。
function stripDocument(doc) {
  return {
    id: doc.id,
    quoteNumber: doc.quoteNumber,
    customerName: doc.customerName,
    quoteDate: doc.quoteDate,
    validUntil: doc.validUntil,
    remarks: doc.remarks,
    route: doc.route,
    cargo: doc.cargo,
    items: (doc.items || []).map((item) => ({
      id: item.id,
      name: item.name,
      quotePrice: item.quotePrice,
      unit: item.unit,
      containerType: item.containerType,
      currency: item.currency,
      minCharge: item.minCharge,
      note: item.note,
      qty: item.qty,
      qtyManual: item.qtyManual,
      hideFromQuote: item.hideFromQuote,
      fromAirPlan: item.fromAirPlan
    })),
    showTwdTotal: doc.showTwdTotal,
    showZeroLines: doc.showZeroLines,
    direction: cleanDirection(doc.direction),
    taxRate: cleanTaxRate(doc.taxRate),
    rates: doc.rates,
    calcSettings: doc.calcSettings,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

function actor(id, names) {
  if (id === IMPORT_ACTOR) return { id: null, displayName: "由備份匯入" };
  const found = names.get(id);
  return { id: id || null, displayName: found || "未知使用者" };
}

async function loadNames(db) {
  const result = await db.prepare("SELECT id, display_name FROM users").all();
  const names = new Map();
  for (const row of result.results || []) names.set(row.id, row.display_name);
  return names;
}

function present(row, names, canSeeCost, withDocument) {
  const item = {
    id: row.id,
    quoteNumber: row.quote_number,
    customerName: row.customer_name,
    quoteDate: row.quote_date,
    validUntil: row.valid_until,
    mode: row.mode,
    route: row.route,
    direction: cleanDirection(row.direction),
    taxRate: cleanTaxRate(row.tax_rate),
    sellingTotals: presentedTotals(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: actor(row.created_by, names),
    updatedBy: actor(row.updated_by, names)
  };
  if (withDocument) {
    const doc = JSON.parse(row.document);
    item.document = canSeeCost ? doc : stripDocument(doc);
  }
  return item;
}

function likePattern(value) {
  return "%" + String(value).replace(/[\\%_]/g, (ch) => "\\" + ch) + "%";
}

export async function listQuotes(db, query) {
  const where = [];
  const binds = [];
  const q = text(query.q, 80).trim();
  if (q) {
    const like = likePattern(q);
    where.push("(quote_number LIKE ? ESCAPE '\\' OR customer_name LIKE ? ESCAPE '\\' OR quote_date LIKE ? ESCAPE '\\')");
    binds.push(like, like, like);
  }
  if (query.mode) {
    if (!MODES.includes(query.mode)) fail("運輸方式不正確");
    where.push("mode = ?");
    binds.push(query.mode);
  }
  if (query.dateFrom) {
    if (!cleanDate(query.dateFrom)) fail("起日不正確");
    where.push("quote_date >= ?");
    binds.push(query.dateFrom);
  }
  if (query.dateTo) {
    if (!cleanDate(query.dateTo)) fail("迄日不正確");
    where.push("quote_date <= ?");
    binds.push(query.dateTo);
  }
  if (query.dateFrom && query.dateTo && query.dateFrom > query.dateTo) fail("起日不能晚於迄日");
  const sql = `SELECT id, quote_number, customer_name, quote_date, valid_until, mode, route,
      direction, tax_rate, document, selling_totals, created_at, created_by, updated_at, updated_by
    FROM quotes ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY updated_at DESC, quote_number DESC
    LIMIT ${LIST_LIMIT}`;
  const result = await db.prepare(sql).bind(...binds).all();
  const names = await loadNames(db);
  return {
    items: (result.results || []).map((row) => present(row, names, !!query.canSeeCost, false)),
    limit: LIST_LIMIT
  };
}

async function readRow(db, id) {
  return db.prepare("SELECT * FROM quotes WHERE id = ?").bind(id).first();
}

export async function getQuote(db, id, canSeeCost) {
  const row = await readRow(db, id);
  if (!row) return null;
  const names = await loadNames(db);
  return present(row, names, !!canSeeCost, true);
}

function quoteDateOf(input) {
  return cleanDate(input && input.quoteDate) || new Date().toISOString().slice(0, 10);
}

export async function createQuote(db, user, input, options = {}) {
  const requested = text(input && input.quoteNumber, 40).trim();
  const quoteNumber = requested ? await assertIssued(db, requested) : await allocateNumber(db, quoteDateOf(input));
  const taken = await db.prepare("SELECT id FROM quotes WHERE quote_number = ?").bind(quoteNumber).first();
  if (taken) {
    const error = new Error("單號已被使用");
    error.code = "CONFLICT";
    throw error;
  }
  const shared = await getSettings(db);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const quoteDate = quoteDateOf(input);
  const document = buildDocument(input, {
    id,
    quoteNumber,
    quoteDate,
    calcSettings: {
      airKgPerCbm: shared.airKgPerCbm,
      seaKgPerCbm: shared.seaKgPerCbm,
      expressDivisor: shared.expressDivisor,
      caiFactor: shared.caiFactor
    },
    createdAt: now,
    updatedAt: now
  });
  if (!document.direction) fail("請選擇進口或出口");
  document.taxRate = 0.05;
  if (!options.canSeeCost) clearIncomingCost(document);
  const totals = JSON.stringify(displayTotals(customerItems(document), document));
  try {
    await db.prepare(`INSERT INTO quotes (
      id, quote_number, customer_name, quote_date, valid_until, mode, route, direction, tax_rate, document, selling_totals,
      created_at, created_by, updated_at, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      id,
      quoteNumber,
      document.customerName,
      quoteDate,
      document.validUntil,
      document.cargo.mode,
      document.route,
      document.direction,
      document.taxRate,
      JSON.stringify(document),
      totals,
      now,
      user.id,
      now,
      user.id
    ).run();
  } catch (error) {
    if (String(error?.message || "").includes("UNIQUE")) {
      const conflict = new Error("單號已被使用");
      conflict.code = "CONFLICT";
      throw conflict;
    }
    throw error;
  }
  return getQuote(db, id, !!options.canSeeCost);
}

export async function updateQuote(db, user, id, input, updatedAt, options = {}) {
  const current = await readRow(db, id);
  if (!current) return null;
  if (!updatedAt || String(updatedAt) !== current.updated_at) {
    const error = new Error("這筆剛剛被其他人改過");
    error.code = "CONFLICT";
    throw error;
  }
  const previous = JSON.parse(current.document);
  const shared = await getSettings(db);
  const calc = cleanCalc(previous.calcSettings) || {
    airKgPerCbm: shared.airKgPerCbm,
    seaKgPerCbm: shared.seaKgPerCbm,
    expressDivisor: shared.expressDivisor,
    caiFactor: shared.caiFactor
  };
  const now = new Date().toISOString();
  const document = buildDocument(input, {
    id: current.id,
    quoteNumber: current.quote_number,
    quoteDate: quoteDateOf(input),
    calcSettings: calc,
    createdAt: current.created_at,
    updatedAt: now
  });
  document.taxRate = cleanTaxRate(current.tax_rate);
  if (document.taxRate > 0 && !document.direction) fail("請選擇進口或出口");
  if (!options.canSeeCost) keepStoredCost(document, previous);
  const totals = JSON.stringify(displayTotals(customerItems(document), document));
  const result = await db.prepare(`UPDATE quotes SET
      customer_name = ?, quote_date = ?, valid_until = ?, mode = ?, route = ?, direction = ?, tax_rate = ?, document = ?, selling_totals = ?,
      updated_at = ?, updated_by = ?
    WHERE id = ? AND updated_at = ?`).bind(
    document.customerName,
    document.quoteDate,
    document.validUntil,
    document.cargo.mode,
    document.route,
    document.direction || null,
    document.taxRate,
    JSON.stringify(document),
    totals,
    now,
    user.id,
    id,
    current.updated_at
  ).run();
  if (!Number(result?.meta?.changes || 0)) {
    const error = new Error("這筆剛剛被其他人改過");
    error.code = "CONFLICT";
    throw error;
  }
  return getQuote(db, id, !!options.canSeeCost);
}

export async function deleteQuote(db, id) {
  const result = await db.prepare("DELETE FROM quotes WHERE id = ?").bind(id).run();
  return Number(result?.meta?.changes || 0) > 0;
}

function quoteTime(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time : null;
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validateBackup(data) {
  if (!isPlainObject(data) || data.kind !== "northgo-quote-backup") fail("不是這個系統的備份檔");
  if (data.version !== 1) fail("版本無法讀取");
  if (!Array.isArray(data.quotes)) fail("沒有報價清單");
  if (data.quotes.length > 500) fail("備份超過 500 筆，沒有變更現有資料");
  for (const quote of data.quotes) {
    if (!isPlainObject(quote)) fail("報價清單內容不正確");
    if (quote.items != null && !Array.isArray(quote.items)) fail("報價清單內容不正確");
    if (Array.isArray(quote.items)) {
      for (const item of quote.items) {
        if (!isPlainObject(item)) fail("報價清單內容不正確");
      }
    }
    if (quote.cargo != null && !isPlainObject(quote.cargo)) fail("報價清單內容不正確");
  }
  const settings = data.settings;
  if (!isPlainObject(settings)) fail("沒有計算設定");
  for (const key of CALC_KEYS) {
    if (typeof settings[key] !== "number" || !Number.isFinite(settings[key])) fail("計算設定不完整");
  }
  if (settings.dimUnit !== "cm" && settings.dimUnit !== "inch") fail("單位偏好不正確");
  if (settings.weightUnit !== "kg" && settings.weightUnit !== "lb") fail("單位偏好不正確");
  if (!/^[A-Za-z]{3}$/.test(String(settings.defaultCurrency || ""))) fail("預設幣別不正確");
  if (!Object.prototype.hasOwnProperty.call(data, "draft")) fail("草稿內容不正確");
  if (!isPlainObject(data.seq)) fail("單號序號不正確");
  for (const day of Object.keys(data.seq)) {
    const n = data.seq[day];
    if (!/^\d{8}$/.test(day)) fail("單號序號不正確");
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || Math.floor(n) !== n) fail("單號序號不正確");
  }
  return data;
}

function backupCalc(quote, settings) {
  return cleanCalc(quote.calcSettings) || {
    airKgPerCbm: settings.airKgPerCbm,
    seaKgPerCbm: settings.seaKgPerCbm,
    expressDivisor: settings.expressDivisor,
    caiFactor: settings.caiFactor
  };
}

function absorbCounter(counters, day, n) {
  if (!/^\d{8}$/.test(day)) return;
  const value = Math.floor(Number(n));
  if (!Number.isFinite(value) || value < 0) return;
  counters[day] = Math.max(counters[day] || 0, value);
}

export async function importBackup(db, user, payload) {
  if (payload?.mode != null && payload.mode !== "merge") fail("第二期只支援合併匯入");
  const backup = validateBackup(payload?.backup || payload);
  const existing = await db.prepare("SELECT id, quote_number, document, created_at, updated_at FROM quotes").all();
  const byNumber = new Map();
  for (const row of existing.results || []) byNumber.set(row.quote_number, row);

  const counters = {};
  const statements = [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const usedNumbers = new Set(byNumber.keys());
  const collapsed = [];
  const seenInFile = new Map();
  for (const quote of backup.quotes) {
    const parsed = parseNumber(quote.quoteNumber);
    if (!parsed) {
      collapsed.push(quote);
      continue;
    }
    const key = parsed.quoteNumber;
    if (!seenInFile.has(key)) {
      seenInFile.set(key, collapsed.length);
      collapsed.push(quote);
      continue;
    }
    const index = seenInFile.get(key);
    const kept = collapsed[index];
    const incomingTime = quoteTime(quote.updatedAt || quote.createdAt || "");
    const keptTime = quoteTime(kept.updatedAt || kept.createdAt || "");
    if (incomingTime != null && (keptTime == null || incomingTime > keptTime)) collapsed[index] = quote;
  }

  for (const incoming of collapsed) {
    const parsed = parseNumber(incoming.quoteNumber);
    let quoteNumber = parsed ? parsed.quoteNumber : "";
    if (!quoteNumber) {
      quoteNumber = await allocateNumber(db, quoteDateOf(incoming));
    }
    const current = byNumber.get(quoteNumber);
    const incomingTime = quoteTime(incoming.updatedAt || incoming.createdAt || "");
    const currentTime = current ? quoteTime(current.updated_at || current.created_at || "") : null;
    if (current && (incomingTime == null || (currentTime != null && incomingTime <= currentTime))) {
      skipped += 1;
      absorbCounter(counters, parsed ? parsed.day : "", parsed ? parsed.n : 0);
      continue;
    }
    const calc = backupCalc(incoming, backup.settings);
    const createdAt = quoteTime(incoming.createdAt) != null ? new Date(incoming.createdAt).toISOString() : new Date().toISOString();
    const updatedAt = quoteTime(incoming.updatedAt) != null ? new Date(incoming.updatedAt).toISOString() : createdAt;
    const id = current ? current.id : crypto.randomUUID();
    const document = buildDocument(incoming, {
      id,
      quoteNumber,
      quoteDate: quoteDateOf(incoming),
      calcSettings: calc,
      createdAt,
      updatedAt
    });
    const totals = JSON.stringify(displayTotals(customerItems(document), document));
    if (current) {
      statements.push(db.prepare(`UPDATE quotes SET
        customer_name = ?, quote_date = ?, valid_until = ?, mode = ?, route = ?, direction = ?, tax_rate = ?, document = ?, selling_totals = ?,
        created_at = ?, created_by = ?, updated_at = ?, updated_by = ?
        WHERE id = ?`).bind(
        document.customerName,
        document.quoteDate,
        document.validUntil,
        document.cargo.mode,
        document.route,
        document.direction || null,
        document.taxRate,
        JSON.stringify(document),
        totals,
        createdAt,
        IMPORT_ACTOR,
        updatedAt,
        IMPORT_ACTOR,
        id
      ));
      updated += 1;
    } else {
      if (usedNumbers.has(quoteNumber)) {
        skipped += 1;
        continue;
      }
      usedNumbers.add(quoteNumber);
      statements.push(db.prepare(`INSERT INTO quotes (
        id, quote_number, customer_name, quote_date, valid_until, mode, route, direction, tax_rate, document, selling_totals,
        created_at, created_by, updated_at, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        id,
        quoteNumber,
        document.customerName,
        document.quoteDate,
        document.validUntil,
        document.cargo.mode,
        document.route,
        document.direction || null,
        document.taxRate,
        JSON.stringify(document),
        totals,
        createdAt,
        IMPORT_ACTOR,
        updatedAt,
        IMPORT_ACTOR
      ));
      inserted += 1;
    }
    if (parsed) absorbCounter(counters, parsed.day, parsed.n);
  }

  for (const day of Object.keys(backup.seq || {})) absorbCounter(counters, day, backup.seq[day]);
  for (const day of Object.keys(counters)) {
    statements.push(db.prepare(`INSERT INTO quote_counters (day_key, last_n) VALUES (?, ?)
      ON CONFLICT(day_key) DO UPDATE SET last_n = MAX(quote_counters.last_n, excluded.last_n)`).bind(day, counters[day]));
  }
  const now = new Date().toISOString();
  statements.push(db.prepare(`INSERT INTO backup_imports (id, mode, quote_count, created_at, created_by)
    VALUES (?, 'merge', ?, ?, ?)`).bind(crypto.randomUUID(), backup.quotes.length, now, user.id));

  if (statements.length) await db.batch(statements);
  const countRow = await db.prepare("SELECT COUNT(*) AS total FROM quotes").first();
  return {
    count: Number(countRow?.total || 0),
    inserted,
    updated,
    skipped,
    mode: "merge"
  };
}

export async function exportRows(db) {
  const result = await db.prepare("SELECT document FROM quotes ORDER BY updated_at DESC, quote_number DESC").all();
  const counters = await db.prepare("SELECT day_key, last_n FROM quote_counters").all();
  const settings = await getSettings(db);
  const seq = {};
  for (const row of counters.results || []) seq[row.day_key] = Number(row.last_n);
  return {
    quotes: (result.results || []).map((row) => JSON.parse(row.document)),
    seq,
    settings: {
      airKgPerCbm: settings.airKgPerCbm,
      seaKgPerCbm: settings.seaKgPerCbm,
      expressDivisor: settings.expressDivisor,
      caiFactor: settings.caiFactor
    }
  };
}
