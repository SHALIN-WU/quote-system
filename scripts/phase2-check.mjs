import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PHASE2_BASE || "http://127.0.0.1:8080";
const failures = [];

function check(name, ok, detail) {
  if (ok) {
    console.log("通過 " + name);
    return;
  }
  failures.push(name + (detail ? "：" + detail : ""));
  console.log("失敗 " + name + (detail ? "：" + detail : ""));
}

function loadNg() {
  const context = { console, Number, Math, String, parseFloat, isFinite, Object, Array, JSON, Date };
  context.window = context;
  vm.createContext(context);
  for (const file of ["js/config.js", "js/parse.js", "js/cargo.js", "js/pricing.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  }
  return context.NG;
}

function sameSummary(left, right) {
  return left.volumetric === right.volumetric && left.chargeable === right.chargeable && left.cbm === right.cbm && left.cai === right.cai;
}

function quoteTotal(groups) {
  return groups.map((group) => group.currency + ":" + group.quote).join("|");
}

function walkKeys(value, found) {
  if (Array.isArray(value)) {
    value.forEach((item) => walkKeys(item, found));
    return;
  }
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      found.add(key);
      walkKeys(value[key], found);
    }
  }
}

function loadDevVars() {
  const file = path.join(root, ".dev.vars");
  const out = {};
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[trimmed.slice(0, eq).trim()] = value;
  }
  return out;
}

function cookieFrom(response) {
  const rows = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  const line = rows.find((item) => item.startsWith("quote_session="));
  if (!line) return "";
  return line.split(";")[0];
}

async function login(username, password) {
  const response = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    const error = new Error("login " + response.status);
    error.status = response.status;
    throw error;
  }
  const cookie = cookieFrom(response);
  if (!cookie) throw new Error("login missing cookie");
  return cookie;
}

async function api(cookie, method, urlPath, body) {
  const response = await fetch(base + urlPath, {
    method,
    headers: {
      Cookie: cookie,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

function sampleCargo(mode) {
  return {
    grossWeightKg: "80",
    pieces: "2",
    volumeCbm: "",
    mode,
    containerCount: mode === "fcl" ? "1" : "",
    containers: mode === "fcl" ? [{ id: "c1", type: "20GP", count: "1" }] : [],
    dimensions: [{ id: "d1", l: "100", w: "80", h: "60", pieces: "2" }],
    dimUnit: "cm",
    weightUnit: "kg",
  };
}

function sampleItems() {
  return [
    { id: "i1", name: "運費", costPrice: "12.34", quotePrice: "20.5", unit: "kg", currency: "USD", minCharge: "", note: "請用木箱", qty: "10.5", qtyManual: true },
    { id: "i2", name: "文件", costPrice: "4", quotePrice: "5", unit: "shipment", currency: "USD", minCharge: "20", note: "", qty: "2", qtyManual: true },
    { id: "i3", name: "報關", costPrice: "80", quotePrice: "100", unit: "shipment", currency: "TWD", minCharge: "", note: "", qty: "1", qtyManual: true },
    { id: "i4", name: "空白數量", costPrice: "9", quotePrice: "9", unit: "kg", currency: "USD", minCharge: "", note: "", qty: "", qtyManual: false },
  ];
}

function sampleDocument(customer, mode) {
  return {
    customerName: customer,
    quoteDate: "2026-11-26",
    validUntil: "2026-12-10",
    remarks: "假資料",
    route: "KHH-LAX",
    cargo: sampleCargo(mode),
    items: sampleItems(),
    markupPercent: "17.25",
    showTwdTotal: false,
    showZeroLines: false,
    rates: {},
  };
}

const NG = loadNg();
const defaults = { airKgPerCbm: 167, seaKgPerCbm: 1000, expressDivisor: 5000, caiFactor: 35.315 };
for (const mode of ["air", "lcl", "fcl", "express"]) {
  const cargo = sampleCargo(mode);
  const first = NG.cargo.summarize(cargo, defaults);
  const again = NG.cargo.summarize(JSON.parse(JSON.stringify(cargo)), { ...defaults });
  check(mode + " 同一份貨物材積與計費重量一致", sameSummary(first, again));
}
const air = NG.cargo.summarize(sampleCargo("air"), defaults);
const airChanged = NG.cargo.summarize(sampleCargo("air"), { ...defaults, airKgPerCbm: 200 });
check("共用參數改變後，舊參數算出的空運材積不同", air.volumetric !== airChanged.volumetric && air.chargeable !== airChanged.chargeable);
const priced = NG.pricing.groupByCurrency(sampleItems());
const pricedAgain = NG.pricing.groupByCurrency(JSON.parse(JSON.stringify(sampleItems())));
check("同一份費用的報價合計一致", quoteTotal(priced) === quoteTotal(pricedAgain) && quoteTotal(priced).includes("USD:") && quoteTotal(priced).includes("TWD:"));

const dev = loadDevVars();
const adminCookie = await login(dev.ADMIN_USERNAME || "admin", dev.ADMIN_PASSWORD);
check("管理員可以登入", !!adminCookie);

const uiPassword = process.env.PHASE2_UI_PASSWORD || "";
if (uiPassword.length < 8) {
  console.log("失敗 請用環境變數 PHASE2_UI_PASSWORD 提供測試帳號密碼，不要寫進程式");
  process.exit(1);
}
async function ensureUser(username, displayName, role) {
  const created = await api(adminCookie, "POST", "/api/users", {
    username,
    displayName,
    role,
    password: uiPassword,
    active: true,
  });
  if (created.status === 201 || created.status === 409) {
    const list = await api(adminCookie, "GET", "/api/users");
    const found = (list.data?.items || []).find((item) => item.username === username);
    if (!found) throw new Error("missing user " + username);
    if (created.status === 409) {
      const updated = await api(adminCookie, "PATCH", "/api/users/" + found.id, { password: uiPassword, active: true, role });
      if (updated.status !== 200) throw new Error("reset user " + updated.status);
    }
    return login(username, uiPassword);
  }
  throw new Error("create user " + username + " " + created.status);
}

const salesA = await ensureUser("p2salesa", "測試業務甲", "sales");
const salesB = await ensureUser("p2salesb", "測試業務乙", "sales");
const service = await ensureUser("p2service", "測試客服", "service");

const original = await api(adminCookie, "GET", "/api/settings");
check("可以讀取計算設定", original.status === 200 && original.data.airKgPerCbm > 0);
const salesSettings = await api(salesA, "PUT", "/api/settings", {
  airKgPerCbm: 180,
  seaKgPerCbm: original.data.seaKgPerCbm,
  expressDivisor: original.data.expressDivisor,
  caiFactor: original.data.caiFactor,
  updatedAt: original.data.updatedAt,
});
check("業務不能改計算參數", salesSettings.status === 403);
const serviceNumbers = await api(service, "POST", "/api/quote-numbers", { quoteDate: "2026-11-26" });
check("客服不能取單號", serviceNumbers.status === 403);

const numbers = await Promise.all([0, 1, 2, 3, 4, 5, 6, 7].map(() =>
  api(salesA, "POST", "/api/quote-numbers", { quoteDate: "2026-11-26" })
));
const issued = numbers.map((item) => item.data && item.data.quoteNumber).filter(Boolean);
check("八次同時取號都成功", numbers.every((item) => item.status === 201) && issued.length === 8);
check("八次同時取號不重複", new Set(issued).size === 8);

const created = [];
async function makeQuote(cookie, customer, mode, quoteNumber) {
  const document = sampleDocument(customer, mode);
  if (quoteNumber) document.quoteNumber = quoteNumber;
  const result = await api(cookie, "POST", "/api/quotes", { document });
  if (result.status === 201) created.push(result.data.item);
  return result;
}

const pair = await Promise.all([
  makeQuote(salesA, "PHASE2TEST-A", "air", issued[0]),
  makeQuote(salesB, "PHASE2TEST-B", "lcl", issued[1]),
]);
check("兩個業務同時開單都成功", pair.every((item) => item.status === 201));
check("兩個業務同時開單的單號不同", pair[0].data?.item?.quoteNumber !== pair[1].data?.item?.quoteNumber);

const duplicate = await makeQuote(salesB, "PHASE2TEST-DUP", "air", issued[0]);
check("已使用的單號不能再開一張", duplicate.status === 409);

const airQuote = pair[0].data.item;
const serverTotals = quoteTotal(airQuote.sellingTotals || []);
check("伺服器報價合計與現有公式相同", serverTotals === quoteTotal(priced));
const snapshot = airQuote.document.calcSettings;
const fromSnapshot = NG.cargo.summarize(airQuote.document.cargo, snapshot);
check("存檔當下的空運材積與計費重量相同", sameSummary(fromSnapshot, air));

const bumped = await api(adminCookie, "PUT", "/api/settings", {
  airKgPerCbm: Number(original.data.airKgPerCbm) + 33,
  seaKgPerCbm: original.data.seaKgPerCbm,
  expressDivisor: original.data.expressDivisor,
  caiFactor: original.data.caiFactor,
  updatedAt: (await api(adminCookie, "GET", "/api/settings")).data.updatedAt,
});
check("管理員可以改計算參數", bumped.status === 200);

const reopened = await api(salesA, "GET", "/api/quotes/" + airQuote.id);
const reopenedSummary = NG.cargo.summarize(reopened.data.item.document.cargo, reopened.data.item.document.calcSettings);
check("改了共用參數後，舊報價仍用存檔參數", reopened.status === 200 && sameSummary(reopenedSummary, air) && reopened.data.item.document.calcSettings.airKgPerCbm === snapshot.airKgPerCbm);

const renamed = await api(salesB, "PUT", "/api/quotes/" + airQuote.id, {
  updatedAt: reopened.data.item.updatedAt,
  document: { ...reopened.data.item.document, customerName: "PHASE2TEST-A-EDIT" },
});
check("業務可以改別人的報價", renamed.status === 200 && renamed.data.item.customerName === "PHASE2TEST-A-EDIT");
check("修改舊報價不會換成新的計算參數", renamed.data.item.document.calcSettings.airKgPerCbm === snapshot.airKgPerCbm);

const fresh = await makeQuote(salesA, "PHASE2TEST-NEW", "express", issued[2]);
check("新報價使用改過後的共用參數", fresh.status === 201 && fresh.data.item.document.calcSettings.airKgPerCbm === bumped.data.airKgPerCbm);

const fcl = await makeQuote(salesA, "PHASE2TEST-FCL", "fcl", issued[3]);
check("可以依海運整櫃篩選", fcl.status === 201);
const lclOnly = await api(salesA, "GET", "/api/quotes?q=PHASE2TEST&mode=lcl&dateFrom=2026-11-01&dateTo=2026-11-30");
const lclItems = lclOnly.data?.items || [];
check("關鍵字加起迄日期與海運併櫃篩選", lclOnly.status === 200 && lclItems.length === 1 && lclItems[0].mode === "lcl" && lclItems[0].customerName === "PHASE2TEST-B");

const serviceRead = await api(service, "GET", "/api/quotes/" + airQuote.id);
const keys = new Set();
walkKeys(serviceRead.data, keys);
const raw = JSON.stringify(serviceRead.data || {});
check("客服讀得到報價與備註", serviceRead.status === 200 && raw.includes("請用木箱") && raw.includes("20.5"));
check("客服回應沒有成本、加成與毛利欄位", serviceRead.status === 200 && !keys.has("costPrice") && !keys.has("markupPercent") && !keys.has("margin") && !keys.has("marginRate") && !keys.has("cost") && !raw.includes("12.34") && !raw.includes("17.25"));
const servicePost = await api(service, "POST", "/api/quotes", { document: sampleDocument("PHASE2TEST-NO", "air") });
const servicePut = await api(service, "PUT", "/api/quotes/" + airQuote.id, { updatedAt: renamed.data.item.updatedAt, document: renamed.data.item.document });
const serviceDelete = await api(service, "DELETE", "/api/quotes/" + airQuote.id);
check("客服不能新增、修改、刪除", servicePost.status === 403 && servicePut.status === 403 && serviceDelete.status === 403);
const serviceExport = await api(service, "GET", "/api/backups/export");
const serviceImport = await api(service, "POST", "/api/backups/import", { mode: "merge", backup: {} });
check("客服不能下載或匯入備份", serviceExport.status === 403 && serviceImport.status === 403);
const salesDelete = await api(salesA, "DELETE", "/api/quotes/" + airQuote.id);
check("業務不能刪除", salesDelete.status === 403);

const salesExport = await api(salesA, "GET", "/api/backups/export");
check("業務可以下載備份", salesExport.status === 200 && Array.isArray(salesExport.data?.quotes));

const backup = {
  kind: "northgo-quote-backup",
  version: 1,
  exportedAt: "2020-01-02T00:00:00.000Z",
  quotes: [{
    id: "backup-fake-1",
    quoteNumber: "NG-20200102-004",
    customerName: "PHASE2TEST-IMPORT",
    quoteDate: "2020-01-02",
    validUntil: "2020-01-16",
    remarks: "",
    route: "",
    cargo: sampleCargo("express"),
    items: sampleItems(),
    markupPercent: "9",
    createdAt: "2020-01-02T03:04:05.000Z",
    updatedAt: "2020-01-02T03:04:05.000Z",
  }],
  draft: null,
  settings: { ...defaults, airKgPerCbm: 150, dimUnit: "cm", weightUnit: "kg", defaultCurrency: "USD" },
  seq: { "20200102": 4 },
};
const imported = await api(adminCookie, "POST", "/api/backups/import", { mode: "merge", backup });
check("管理員可以合併匯入假備份", imported.status === 200 && imported.data.inserted >= 1);
const importedList = await api(adminCookie, "GET", "/api/quotes?q=PHASE2TEST-IMPORT");
const importedRow = (importedList.data?.items || [])[0];
const importedFull = importedRow ? await api(adminCookie, "GET", "/api/quotes/" + importedRow.id) : { data: null };
check("匯入的報價顯示由備份匯入", importedFull.data?.item?.createdBy?.displayName === "由備份匯入");
const importedSummary = importedFull.data ? NG.cargo.summarize(importedFull.data.item.document.cargo, importedFull.data.item.document.calcSettings) : null;
const importedExpected = NG.cargo.summarize(sampleCargo("express"), { ...defaults, airKgPerCbm: 150 });
check("匯入的報價使用備份裡的計算參數", !!importedSummary && sameSummary(importedSummary, importedExpected));
const replaced = await api(adminCookie, "POST", "/api/backups/import", { mode: "replace", backup });
check("第二期不接受全部取代", replaced.status === 400);

const currentSettings = await api(adminCookie, "GET", "/api/settings");
const restored = await api(adminCookie, "PUT", "/api/settings", {
  airKgPerCbm: original.data.airKgPerCbm,
  seaKgPerCbm: original.data.seaKgPerCbm,
  expressDivisor: original.data.expressDivisor,
  caiFactor: original.data.caiFactor,
  updatedAt: currentSettings.data.updatedAt,
});
check("測試後恢復原本的計算參數", restored.status === 200 && restored.data.airKgPerCbm === original.data.airKgPerCbm);

const leftover = await api(adminCookie, "GET", "/api/quotes?q=PHASE2TEST");
for (const item of leftover.data?.items || []) {
  if (!String(item.customerName || "").startsWith("PHASE2TEST")) continue;
  await api(adminCookie, "DELETE", "/api/quotes/" + item.id);
}
const after = await api(adminCookie, "GET", "/api/quotes?q=PHASE2TEST");
check("假資料已從資料庫刪除", (after.data?.items || []).length === 0);

if (failures.length) {
  console.log("未通過 " + failures.length + " 項");
  process.exit(1);
}
console.log("全部 API 與計算檢查通過");
