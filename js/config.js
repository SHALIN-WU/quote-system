(function (NG) {
  NG.config = {
    // 部署 Worker 後改成實際網址。密碼與金鑰不可寫在這個檔案。
    AUTH_URL: "https://quote-auth.shalin-wu.workers.dev",
    companyName: "Northgo Inc. Kaohsiung Branch",
    units: [
      { id: "kg", label: "Per KG" },
      { id: "lb", label: "Per LB" },
      { id: "cbm", label: "Per CBM" },
      { id: "wm", label: "W/M" },
      { id: "piece", label: "Per PKG" },
      { id: "shipment", label: "Per Shipment" },
      { id: "set", label: "Per Set" },
      { id: "plt", label: "Per PLT" },
      { id: "container", label: "Per Container" },
    ],
    modes: [
      { id: "air", label: "空運" },
      { id: "lcl", label: "海運併櫃" },
      { id: "fcl", label: "海運整櫃" },
      { id: "express", label: "快遞" },
    ],
    currencies: ["USD", "TWD", "CNY", "EUR", "JPY", "HKD", "GBP", "SGD", "KRW", "AUD"],
    containerTypes: ["20GP", "40GP", "40HQ", "20RF", "40RF", "20OT", "40OT", "20FR", "40FR"],
    defaults: {
      airKgPerCbm: 167,
      seaKgPerCbm: 1000,
      expressDivisor: 5000,
      caiFactor: 35.315,
    },
  };

  NG.todayISO = function () {
    const d = new Date();
    const z = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
  };

  NG.addDays = function (iso, days) {
    const parts = String(iso || NG.todayISO()).split("-").map(Number);
    const dt = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
    dt.setDate(dt.getDate() + days);
    const z = function (n) { return String(n).padStart(2, "0"); };
    return dt.getFullYear() + "-" + z(dt.getMonth() + 1) + "-" + z(dt.getDate());
  };

  NG.uid = function () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };

  NG.num = function (value) {
    if (value == null || value === "") return 0;
    const n = parseFloat(String(value).replace(/,/g, ""));
    return isFinite(n) ? n : 0;
  };

  NG.trimNum = function (value, digits) {
    const n = Number(value);
    if (!isFinite(n)) return "";
    const factor = 10 ** digits;
    return String(Math.round((n + Number.EPSILON) * factor) / factor);
  };

  NG.formatMoney = function (value) {
    if (value == null || !isFinite(Number(value))) return "—";
    return Number(value).toLocaleString("zh-TW", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  NG.formatInteger = function (value) {
    if (value == null || !isFinite(Number(value))) return "—";
    return Math.round(Number(value)).toLocaleString("zh-TW", {
      maximumFractionDigits: 0,
    });
  };

  NG.formatQty = function (value) {
    if (value == null || !isFinite(Number(value))) return "—";
    return Number(value).toLocaleString("zh-TW", { maximumFractionDigits: 3 });
  };

  NG.formatMeasure = function (value, digits) {
    if (value == null || !isFinite(Number(value))) return "—";
    return Number(value).toLocaleString("zh-TW", { maximumFractionDigits: digits });
  };

  NG.formatFixed = function (value, digits) {
    if (value == null || !isFinite(Number(value))) return "—";
    return Number(value).toLocaleString("zh-TW", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  };

  NG.formatPercent = function (rate) {
    if (rate == null || !isFinite(rate)) return "—";
    return (rate * 100).toLocaleString("zh-TW", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + "%";
  };

  NG.esc = function (value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };

  NG.unitLabel = function (id) {
    const found = NG.config.units.find(function (unit) { return unit.id === id; });
    return found ? found.label : "Select unit";
  };

  NG.normalizeContainerType = function (value) {
    const code = String(value || "").trim().toUpperCase();
    if (code === "40HC") return "40HQ";
    return NG.config.containerTypes.indexOf(code) >= 0 ? code : "";
  };

  NG.quoteUnitLabel = function (unit, containerType) {
    const type = NG.normalizeContainerType(containerType);
    if (unit === "container" && type) return "Per " + type;
    return NG.unitLabel(unit);
  };

  NG.modeLabel = function (id) {
    const found = NG.config.modes.find(function (mode) { return mode.id === id; });
    return found ? found.label : "—";
  };
})(window.NG = window.NG || {});
