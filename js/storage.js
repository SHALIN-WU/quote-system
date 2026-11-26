(function (NG) {
  const KEYS = {
    quotes: "northgo.quotes.v1",
    seq: "northgo.seq.v1",
    settings: "northgo.settings.v1",
    draft: "northgo.draft.v1",
    dirty: "northgo.draft.dirty.v1",
  };
  const memory = {};

  function store() {
    try {
      if (typeof localStorage === "undefined") return null;
      return localStorage;
    } catch (error) {
      return null;
    }
  }

  function read(key) {
    const box = store();
    if (!box) return memory[key] == null ? null : memory[key];
    try {
      const raw = box.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return memory[key] == null ? null : memory[key];
    }
  }

  function write(key, value) {
    memory[key] = value;
    const box = store();
    if (!box) return false;
    try {
      box.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  function remove(key) {
    delete memory[key];
    const box = store();
    if (!box) return false;
    try {
      box.removeItem(key);
      return true;
    } catch (error) {
      return false;
    }
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function backupError(reason) {
    return { ok: false, error: "備份格式不對（" + reason + "），沒有變更現有資料。" };
  }

  function validateSettings(settings) {
    if (!isPlainObject(settings)) return "沒有計算設定";
    const keys = ["airKgPerCbm", "seaKgPerCbm", "expressDivisor", "caiFactor"];
    for (let i = 0; i < keys.length; i++) {
      const value = settings[keys[i]];
      if (typeof value !== "number" || !isFinite(value)) return "計算設定不完整";
    }
    if (settings.dimUnit !== "cm" && settings.dimUnit !== "inch") return "單位偏好不正確";
    if (settings.weightUnit !== "kg" && settings.weightUnit !== "lb") return "單位偏好不正確";
    if (!/^[A-Za-z]{3}$/.test(String(settings.defaultCurrency || ""))) return "預設幣別不正確";
    return "";
  }

  function validateStateLike(value, isDraft) {
    const reason = isDraft ? "草稿內容不正確" : "報價清單內容不正確";
    if (!isPlainObject(value)) return reason;
    if (isDraft && !Array.isArray(value.items)) return reason;
    if (value.items != null && !Array.isArray(value.items)) return reason;
    if (Array.isArray(value.items)) {
      for (let i = 0; i < value.items.length; i++) {
        if (!isPlainObject(value.items[i])) return reason;
      }
    }
    if (value.cargo != null && !isPlainObject(value.cargo)) return reason;
    if (value.rates != null && !isPlainObject(value.rates)) return reason;
    return "";
  }

  function validateSeq(seq) {
    if (!isPlainObject(seq)) return "單號序號不正確";
    const days = Object.keys(seq);
    for (let i = 0; i < days.length; i++) {
      const n = seq[days[i]];
      if (!/^\d{8}$/.test(days[i])) return "單號序號不正確";
      if (typeof n !== "number" || !isFinite(n) || n < 0 || Math.floor(n) !== n) return "單號序號不正確";
    }
    return "";
  }

  function validateBackup(data) {
    if (!isPlainObject(data) || data.kind !== "northgo-quote-backup") return backupError("不是這個系統的備份檔");
    if (data.version !== 1) return backupError("版本無法讀取");
    if (!Array.isArray(data.quotes)) return backupError("沒有報價清單");
    for (let i = 0; i < data.quotes.length; i++) {
      const reason = validateStateLike(data.quotes[i], false);
      if (reason) return backupError(reason);
    }
    const settingReason = validateSettings(data.settings);
    if (settingReason) return backupError(settingReason);
    if (!Object.prototype.hasOwnProperty.call(data, "draft")) return backupError("草稿內容不正確");
    if (data.draft != null) {
      const reason = validateStateLike(data.draft, true);
      if (reason) return backupError(reason);
    }
    const seqReason = validateSeq(data.seq);
    if (seqReason) return backupError(seqReason);
    return { ok: true, backup: data };
  }

  function exportSeq() {
    const raw = read(KEYS.seq);
    const seq = {};
    if (!isPlainObject(raw)) return seq;
    Object.keys(raw).forEach(function (day) {
      const n = Number(raw[day]);
      if (/^\d{8}$/.test(day) && isFinite(n) && n >= 0) seq[day] = Math.floor(n);
    });
    return seq;
  }

  function settingsFromBackup(settings) {
    return {
      airKgPerCbm: settings.airKgPerCbm,
      seaKgPerCbm: settings.seaKgPerCbm,
      expressDivisor: settings.expressDivisor,
      caiFactor: settings.caiFactor,
      dimUnit: settings.dimUnit,
      weightUnit: settings.weightUnit,
      defaultCurrency: String(settings.defaultCurrency).toUpperCase(),
    };
  }

  function quoteKey(quote) {
    const number = String(quote.quoteNumber || "").trim();
    if (number) return "n:" + number;
    const id = quote.id == null ? "" : String(quote.id).trim();
    if (id) return "id:" + id;
    try { return "x:" + JSON.stringify(quote); } catch (error) { return ""; }
  }

  function quoteTime(quote) {
    const time = Date.parse(quote.updatedAt || quote.createdAt || "");
    return isFinite(time) ? time : null;
  }

  function newerQuote(current, incoming) {
    const currentTime = quoteTime(current);
    const incomingTime = quoteTime(incoming);
    if (incomingTime == null) return current;
    if (currentTime != null && incomingTime <= currentTime) return current;
    if (current.id) incoming.id = current.id;
    return incoming;
  }

  function mergeQuoteLists(local, incoming) {
    const map = Object.create(null);
    const order = [];
    function take(quote) {
      const copy = clone(quote);
      const key = quoteKey(copy);
      if (!key) return;
      if (!Object.prototype.hasOwnProperty.call(map, key)) order.push(key);
      map[key] = Object.prototype.hasOwnProperty.call(map, key) ? newerQuote(map[key], copy) : copy;
    }
    (Array.isArray(local) ? local : []).forEach(take);
    (Array.isArray(incoming) ? incoming : []).forEach(take);
    return order.map(function (key) { return map[key]; });
  }

  function assignIds(quotes) {
    const seen = Object.create(null);
    quotes.forEach(function (quote) {
      let id = quote.id == null ? "" : String(quote.id);
      if (!id || seen[id]) id = NG.uid();
      seen[id] = true;
      quote.id = id;
    });
    return quotes;
  }

  function absorbSeq(target, source) {
    if (!isPlainObject(source)) return;
    Object.keys(source).forEach(function (day) {
      const n = Number(source[day]);
      if (!/^\d{8}$/.test(day) || !isFinite(n) || n < 0) return;
      target[day] = Math.max(target[day] || 0, Math.floor(n));
    });
  }

  function absorbQuoteNumbers(target, quotes) {
    quotes.forEach(function (quote) {
      const match = /^NG-(\d{8})-(\d+)$/.exec(String(quote.quoteNumber || "").trim());
      if (!match) return;
      const n = parseInt(match[2], 10);
      if (!isFinite(n)) return;
      target[match[1]] = Math.max(target[match[1]] || 0, n);
    });
  }

  function commit(changes) {
    const previous = changes.map(function (change) {
      return { key: change.key, value: read(change.key) };
    });
    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];
      const ok = change.remove ? remove(change.key) : write(change.key, change.value);
      if (!ok) {
        previous.forEach(function (item) {
          if (item.value == null) remove(item.key);
          else write(item.key, item.value);
        });
        return false;
      }
    }
    return true;
  }

  NG.storage = {
    loadSettings: function () {
      const saved = read(KEYS.settings) || {};
      const settings = Object.assign({}, NG.config.defaults, saved);
      settings.dimUnit = saved.dimUnit === "inch" ? "inch" : "cm";
      settings.weightUnit = saved.weightUnit === "lb" ? "lb" : "kg";
      settings.defaultCurrency = /^[A-Za-z]{3}$/.test(saved.defaultCurrency || "")
        ? String(saved.defaultCurrency).toUpperCase()
        : "USD";
      return settings;
    },
    loadPrefs: function () {
      const saved = read(KEYS.settings) || {};
      return {
        dimUnit: saved.dimUnit === "inch" ? "inch" : "cm",
        weightUnit: saved.weightUnit === "lb" ? "lb" : "kg",
        defaultCurrency: /^[A-Za-z]{3}$/.test(saved.defaultCurrency || "")
          ? String(saved.defaultCurrency).toUpperCase()
          : "USD",
      };
    },
    saveSettings: function (settings) {
      const prev = read(KEYS.settings) || {};
      const defaults = NG.config && NG.config.defaults ? NG.config.defaults : {};
      function keep(key) {
        return typeof prev[key] === "number" && isFinite(prev[key]) ? prev[key] : defaults[key];
      }
      return write(KEYS.settings, {
        airKgPerCbm: keep("airKgPerCbm"),
        seaKgPerCbm: keep("seaKgPerCbm"),
        expressDivisor: keep("expressDivisor"),
        caiFactor: keep("caiFactor"),
        dimUnit: settings.dimUnit === "inch" ? "inch" : "cm",
        weightUnit: settings.weightUnit === "lb" ? "lb" : "kg",
        defaultCurrency: /^[A-Za-z]{3}$/.test(settings.defaultCurrency || "")
          ? String(settings.defaultCurrency).toUpperCase()
          : "USD",
      });
    },
    loadQuotes: function () {
      const list = read(KEYS.quotes);
      return Array.isArray(list) ? list : [];
    },
    upsertQuote: function (quote) {
      const list = NG.storage.loadQuotes();
      const index = list.findIndex(function (item) { return item.id === quote.id; });
      if (index >= 0) list[index] = quote;
      else list.push(quote);
      return write(KEYS.quotes, list);
    },
    deleteQuote: function (id) {
      return write(KEYS.quotes, NG.storage.loadQuotes().filter(function (item) {
        return item.id !== id;
      }));
    },
    allocateNumber: function (dateISO) {
      const day = String(dateISO || NG.todayISO()).replace(/-/g, "");
      const safeDay = /^\d{8}$/.test(day) ? day : NG.todayISO().replace(/-/g, "");
      const seq = read(KEYS.seq) || {};
      const next = (Number(seq[safeDay]) || 0) + 1;
      seq[safeDay] = next;
      write(KEYS.seq, seq);
      return "NG-" + safeDay + "-" + String(next).padStart(3, "0");
    },
    loadDraft: function () {
      const draft = read(KEYS.draft);
      if (!draft || typeof draft !== "object" || !Array.isArray(draft.items)) return null;
      return draft;
    },
    saveDraft: function (draft, pending) {
      const ok = write(KEYS.draft, draft);
      if (!ok) return false;
      if (pending === true) write(KEYS.dirty, true);
      else if (pending === false) write(KEYS.dirty, false);
      return true;
    },
    pendingDraft: function () {
      if (read(KEYS.dirty) !== true) return null;
      return NG.storage.loadDraft();
    },
    clearDraft: function () {
      remove(KEYS.draft);
      remove(KEYS.dirty);
    },
    cloneData: function (value) {
      return JSON.parse(JSON.stringify(value));
    },
    exportBackup: function () {
      const settings = NG.storage.loadSettings();
      const draft = NG.storage.loadDraft();
      return {
        kind: "northgo-quote-backup",
        version: 1,
        exportedAt: new Date().toISOString(),
        quotes: clone(NG.storage.loadQuotes()),
        draft: draft ? clone(draft) : null,
        settings: {
          airKgPerCbm: settings.airKgPerCbm,
          seaKgPerCbm: settings.seaKgPerCbm,
          expressDivisor: settings.expressDivisor,
          caiFactor: settings.caiFactor,
          dimUnit: settings.dimUnit === "inch" ? "inch" : "cm",
          weightUnit: settings.weightUnit === "lb" ? "lb" : "kg",
          defaultCurrency: settings.defaultCurrency || "USD",
        },
        seq: exportSeq(),
      };
    },
    parseBackup: function (text) {
      const clean = String(text == null ? "" : text).replace(/^\uFEFF/, "").trim();
      if (!clean) return { ok: false, error: "檔案是空的，沒有變更現有資料。" };
      try {
        return validateBackup(JSON.parse(clean));
      } catch (error) {
        return { ok: false, error: "檔案不是有效的 JSON，沒有變更現有資料。" };
      }
    },
    applyBackup: function (backup, mode) {
      const parsed = validateBackup(backup);
      if (!parsed.ok) return parsed;
      if (mode !== "merge" && mode !== "replace") {
        return { ok: false, error: "備份格式不對，沒有變更現有資料。" };
      }
      const incoming = parsed.backup;
      let quotes;
      const seq = {};
      const changes = [];
      if (mode === "replace") {
        quotes = assignIds(clone(incoming.quotes));
        absorbSeq(seq, incoming.seq);
        absorbQuoteNumbers(seq, quotes);
        changes.push({ key: KEYS.quotes, value: quotes });
        changes.push({ key: KEYS.settings, value: settingsFromBackup(incoming.settings) });
        if (incoming.draft) changes.push({ key: KEYS.draft, value: clone(incoming.draft) });
        else changes.push({ key: KEYS.draft, remove: true });
        changes.push({ key: KEYS.seq, value: seq });
      } else {
        quotes = assignIds(mergeQuoteLists(NG.storage.loadQuotes(), incoming.quotes));
        absorbSeq(seq, read(KEYS.seq));
        absorbSeq(seq, incoming.seq);
        absorbQuoteNumbers(seq, quotes);
        changes.push({ key: KEYS.quotes, value: quotes });
        changes.push({ key: KEYS.seq, value: seq });
      }
      if (!commit(changes)) {
        return { ok: false, error: "無法寫入瀏覽器儲存空間，沒有變更現有資料。" };
      }
      return { ok: true, count: quotes.length, mode: mode };
    },
  };
})(window.NG = window.NG || {});
