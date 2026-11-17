(function (NG) {
  const CURRENCY_DEFS = [
    { code: "USD", re: /US\s*\$|\bUSD(?=\d|\b)|美金|美元/i },
    { code: "TWD", re: /NT\s*\$|\bTWD(?=\d|\b)|\bNTD(?=\d|\b)|新台幣|新臺幣|台幣|臺幣/i },
    { code: "CNY", re: /\bCNY(?=\d|\b)|\bRMB(?=\d|\b)|人民幣|人民币/i },
    { code: "EUR", re: /\bEUR(?=\d|\b)|歐元|欧元/i },
    { code: "JPY", re: /\bJPY(?=\d|\b)|日圓|日元/i },
    { code: "HKD", re: /\bHKD(?=\d|\b)|港幣|港币/i },
    { code: "GBP", re: /\bGBP(?=\d|\b)|英鎊|英镑/i },
    { code: "SGD", re: /\bSGD(?=\d|\b)|新加坡幣|新幣/i },
    { code: "KRW", re: /\bKRW(?=\d|\b)|韓元|韩元/i },
    { code: "AUD", re: /\bAUD(?=\d|\b)|澳幣|澳币/i },
  ];

  const UNIT_DEFS = [
    { id: "kg", re: /每\s*公斤|每\s*kgs?|\/\s*kgs?\b|per\s*kgs?\b|\/\s*k(?![A-Za-z])|per\s+k(?![A-Za-z])|\bkgs?\b|公斤/i },
    { id: "lb", re: /每\s*英磅|\/\s*lbs?\b|per\s*lbs?\b/i },
    { id: "cbm", re: /每\s*(?:cbm|m³|m3|立方米)|\/\s*(?:cbm|m³|m3)\b|per\s*(?:cbm|m3)\b|\bcbm\b|\bm³\b|\bm3\b|立方米/i },
    { id: "piece", re: /每\s*件|\/\s*件|per\s*(?:piece|pcs?|pkgs?|ctns?)\b|\/\s*(?:pcs?|pkgs?|ctns?)\b|\b(?:pcs?|pkgs?|ctns?)\b/i },
    { id: "set", re: /(?:\/|／|per\s+)sets?\b/i },
    { id: "shipment", re: /每\s*票|\/\s*票|每票|per\s*(?:shipment|shpt|b\/l|bl|hawb|awb|trip)\b|\/\s*(?:shipment|shpt|bl|hawb|awb|trip)\b|\b(?:shipment|shpt)\b|\bb\/l\b/i },
    { id: "container", re: /每\s*[櫃柜]|\/\s*[櫃柜]|per\s*(?:container|cntr)\b|\bcntr\b|\bcontainer\b/i },
  ];

  const CONTAINER_MARK = "['\u2018\u2019\u2032\u00B4`\u2033\uFF02" + String.fromCharCode(34) + "]";

  function containerTypeDefs() {
    const mark = CONTAINER_MARK;
    function re(source) { return new RegExp(source, "i"); }
    return [
      { id: "40HQ", re: re("(?<!\\d)40\\s*" + mark + "?\\s*(?:HQ|HC)(?![A-Za-z])|(?<!\\d)40\\s*(?:英尺|呎|尺)\\s*高[櫃柜]|(?<!\\d)40\\s*高[櫃柜]") },
      { id: "20RF", re: re("(?<!\\d)20\\s*" + mark + "?\\s*RF(?![A-Za-z])") },
      { id: "40RF", re: re("(?<!\\d)40\\s*" + mark + "?\\s*RF(?![A-Za-z])") },
      { id: "20OT", re: re("(?<!\\d)20\\s*" + mark + "?\\s*OT(?![A-Za-z])") },
      { id: "40OT", re: re("(?<!\\d)40\\s*" + mark + "?\\s*OT(?![A-Za-z])") },
      { id: "20FR", re: re("(?<!\\d)20\\s*" + mark + "?\\s*FR(?![A-Za-z])") },
      { id: "40FR", re: re("(?<!\\d)40\\s*" + mark + "?\\s*FR(?![A-Za-z])") },
      { id: "20GP", re: re("(?<!\\d)20\\s*" + mark + "?\\s*GP(?![A-Za-z])|(?<!\\d)20\\s*(?:英尺|呎|尺|ft)(?![A-Za-z])|(?<!\\d)20\\s*" + mark + "(?!\\s*[A-Za-z])|(?:\\/|／|per\\s+)20(?!\\d)(?!\\s*(?:GP|HQ|HC|RF|OT|FR|ft|呎|尺|英尺)|[A-Za-z])") },
      { id: "40GP", re: re("(?<!\\d)40\\s*" + mark + "?\\s*GP(?![A-Za-z])|(?<!\\d)40\\s*(?:英尺|呎|尺|ft)(?![A-Za-z])|(?<!\\d)40\\s*" + mark + "(?!\\s*[A-Za-z])|(?:\\/|／|per\\s+)40(?!\\d)(?!\\s*(?:GP|HQ|HC|RF|OT|FR|ft|呎|尺|英尺)|[A-Za-z])") },
    ];
  }

  const CONTAINER_TYPE_DEFS = containerTypeDefs();

  const ALIASES = {
    "US$": "USD",
    "USD": "USD",
    "美金": "USD",
    "美元": "USD",
    "NT$": "TWD",
    "NTD": "TWD",
    "TWD": "TWD",
    "台幣": "TWD",
    "臺幣": "TWD",
    "新台幣": "TWD",
    "新臺幣": "TWD",
    "RMB": "CNY",
    "CNY": "CNY",
    "人民幣": "CNY",
    "人民币": "CNY",
    "EUR": "EUR",
    "歐元": "EUR",
    "欧元": "EUR",
    "JPY": "JPY",
    "日圓": "JPY",
    "日元": "JPY",
    "HKD": "HKD",
    "港幣": "HKD",
    "港币": "HKD",
    "GBP": "GBP",
    "英鎊": "GBP",
    "英镑": "GBP",
    "SGD": "SGD",
    "新加坡幣": "SGD",
    "新幣": "SGD",
    "KRW": "KRW",
    "韓元": "KRW",
    "韩元": "KRW",
    "AUD": "AUD",
    "澳幣": "AUD",
    "澳币": "AUD",
  };

  function execFresh(re, text) {
    return new RegExp(re.source, re.flags).exec(text);
  }

  function findCurrency(text) {
    let best = null;
    CURRENCY_DEFS.forEach(function (def) {
      const match = execFresh(def.re, text);
      if (!match) return;
      if (!best || match.index < best.index) {
        best = { code: def.code, raw: match[0], index: match.index };
      }
    });
    return best;
  }

  function findContainerType(text) {
    const hits = [];
    CONTAINER_TYPE_DEFS.forEach(function (def) {
      const re = new RegExp(def.re.source, "gi");
      let match;
      while ((match = re.exec(text))) {
        hits.push({ id: def.id, raw: match[0], index: match.index });
        if (!match[0].length) re.lastIndex += 1;
      }
    });
    if (!hits.length) return null;
    hits.sort(function (a, b) {
      return a.index - b.index || b.raw.length - a.raw.length;
    });
    return hits[0];
  }

  function spansOverlap(start, end, span) {
    if (!span) return false;
    return start < span.index + span.raw.length && end > span.index;
  }

  function findUnit(text) {
    const hits = [];
    UNIT_DEFS.forEach(function (def) {
      const match = execFresh(def.re, text);
      if (match) hits.push({ id: def.id, raw: match[0], index: match.index });
    });
    const typeHit = findContainerType(text);
    if (typeHit) {
      hits.push({
        id: "container",
        raw: typeHit.raw,
        index: typeHit.index,
        containerType: typeHit.id,
        fromType: true,
      });
    }
    if (!hits.length) return null;
    const strong = hits.filter(function (hit) { return /每|\/|per/i.test(hit.raw); });
    const pool = strong.length ? strong : hits;
    pool.sort(function (a, b) {
      return b.raw.length - a.raw.length || a.index - b.index;
    });
    return pool[0];
  }

  function canonicalizeNumbers(text) {
    return String(text || "")
      .replace(/(\d)\.{2,}(?=\d)/g, "$1.")
      .replace(/\d{1,3}(?:,\d+)+/g, function (token) {
        const parts = token.split(",");
        const head = parts[0];
        const rest = parts.slice(1);
        const thousands = !/^0+$/.test(head) && rest.every(function (part) { return part.length === 3; });
        if (thousands) return token;
        if (rest.length > 1 && !/^0+$/.test(head) && rest.slice(0, -1).every(function (part) { return part.length === 3; })) {
          return head + "," + rest.slice(0, -1).join(",") + "." + rest[rest.length - 1];
        }
        return head + "." + rest.join("");
      });
  }

  function numericValue(raw) {
    const n = parseFloat(canonicalizeNumbers(raw).replace(/,/g, ""));
    return isFinite(n) ? n : null;
  }

  function parseNumberToken(value) {
    if (value == null) return null;
    return numericValue(String(value));
  }

  function findNumbers(text) {
    const re = /(?<![\d.])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+,\d+|\d+(?:\.\d+)?)(?![\d.])/g;
    const nums = [];
    let match;
    while ((match = re.exec(text))) {
      const value = numericValue(match[0]);
      if (value == null) continue;
      nums.push({ raw: match[0], value: value, index: match.index });
    }
    return nums;
  }

  function chooseNumber(nums, unitHit, currencyHit) {
    if (unitHit) {
      const beforeUnit = nums.slice().reverse().find(function (num) {
        const gap = unitHit.index - (num.index + num.raw.length);
        return gap >= 0 && gap <= 12;
      });
      if (beforeUnit) return beforeUnit;
    }
    if (currencyHit) {
      const afterCurrency = nums.find(function (num) {
        const gap = num.index - (currencyHit.index + currencyHit.raw.length);
        return gap >= 0 && gap <= 12;
      });
      if (afterCurrency) return afterCurrency;
      const beforeCurrency = nums.slice().reverse().find(function (num) {
        const gap = currencyHit.index - (num.index + num.raw.length);
        return gap >= 0 && gap <= 8;
      });
      if (beforeCurrency) return beforeCurrency;
    }
    return nums[nums.length - 1];
  }

  function normalizeCurrency(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const compact = raw.replace(/\s+/g, "");
    if (ALIASES[compact]) return ALIASES[compact];
    if (ALIASES[compact.toUpperCase()]) return ALIASES[compact.toUpperCase()];
    const hit = findCurrency(raw);
    if (hit && compact.length <= 8) return hit.code;
    if (/^[A-Za-z]{3}$/.test(compact)) return compact.toUpperCase();
    return compact;
  }

  function currencyKey(value) {
    return normalizeCurrency(value) || "未指定";
  }

  function cleanName(text, numberHit, unitHit, currencyHit, typeHit) {
    let name = text.slice(0, numberHit.index) + " " + text.slice(numberHit.index + numberHit.raw.length);
    if (currencyHit) name = name.split(currencyHit.raw).join(" ");
    if (unitHit) name = name.split(unitHit.raw).join(" ");
    if (typeHit && (!unitHit || typeHit.raw !== unitHit.raw)) name = name.split(typeHit.raw).join(" ");
    name = name
      .replace(/[／/]/g, " ")
      .replace(/每|per\b/gi, " ")
      .replace(/[：:，,（）()＠@]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^[\-–—.．]+|[\-–—.．]+$/g, "")
      .trim();
    return name;
  }

  function normalizeWidth(text) {
    return canonicalizeNumbers(String(text || "")
      .replace(/\u3000/g, " ")
      .replace(/\uFF0C/g, ",")
      .replace(/\uFF1B/g, ";")
      .replace(/\t+/g, " ")
      .trim());
  }

  function badName(name) {
    if (!name || /^[\d\s.,]+$/.test(name)) return true;
    if (/^(項目|費用|名稱|單價|幣別|單位|item|description|amount)$/i.test(name)) return true;
    return false;
  }

  function cleanLead(text) {
    return String(text || "")
      .replace(/(?:每\s*)?(?:公斤|kgs?|cbm|m³|m3|立方米|件|pcs?|piece|pkgs?|ctns?|票|shipment|shpt|b\/l|bl|櫃|柜|container|cntr)\s*$/i, "")
      .replace(/每\s*$/i, "")
      .replace(/[\s:：,，、;；/／\-–—.．]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function currencyImmediatelyBefore(text, index) {
    const head = text.slice(0, index);
    let best = null;
    CURRENCY_DEFS.forEach(function (def) {
      const re = new RegExp(def.re.source, "gi");
      let match;
      while ((match = re.exec(head))) {
        if (!/^\s*$/.test(head.slice(match.index + match[0].length))) continue;
        if (!best || match.index > best.index) {
          best = { code: def.code, raw: match[0], index: match.index };
        }
      }
    });
    return best;
  }

  function unitAfterSlash(text, index) {
    const slice = text.slice(index);
    let best = null;
    function consider(hit) {
      if (!hit || !hit.raw) return;
      if (!best || hit.raw.length > best.raw.length) best = hit;
    }
    CONTAINER_TYPE_DEFS.forEach(function (def) {
      const match = new RegExp(def.re.source, "i").exec(slice);
      if (!match || match.index !== 0) return;
      if (/^(?:\/|／|per\s+)/i.test(match[0])) return;
      consider({ id: "container", containerType: def.id, raw: match[0] });
    });
    const bare = /^(20|40)(?!\d)(?!\s*(?:GP|HQ|HC|RF|OT|FR|ft|呎|尺|英尺)|[A-Za-z])/i.exec(slice);
    if (bare) consider({ id: "container", containerType: bare[1] + "GP", raw: bare[0] });
    [
      { id: "kg", re: /^(?:kgs?|k|公斤)(?![A-Za-z0-9])/i },
      { id: "lb", re: /^(?:lbs?)(?![A-Za-z])/i },
      { id: "cbm", re: /^(?:cbm|m³|m3|立方米)(?![A-Za-z0-9])/i },
      { id: "piece", re: /^(?:pcs?|piece|pkgs?|ctns?|件)(?![A-Za-z])/i },
      { id: "set", re: /^(?:sets?)(?![A-Za-z0-9])/i },
      { id: "shipment", re: /^(?:hawb|awb|shipment|shpt|trip|b\/l|bl|票)(?![A-Za-z0-9])/i },
      { id: "shipment", re: /^(?:h|m)(?![A-Za-z0-9])/i, loose: true },
      { id: "container", re: /^(?:container|cntr|[櫃柜])(?![A-Za-z])/i },
    ].forEach(function (def) {
      const match = def.re.exec(slice);
      if (match) consider({ id: def.id, containerType: "", raw: match[0], loose: !!def.loose });
    });
    return best;
  }

  function bareUnitAt(text, index) {
    const match = /^(kgs?|cbm|m³|m3|pkgs?|shpt|b\/l|bl)(?![A-Za-z0-9])/i.exec(String(text || "").slice(index));
    if (!match) return null;
    const token = match[1].toLowerCase();
    let id = "shipment";
    if (/^kgs?$/.test(token)) id = "kg";
    else if (token === "cbm" || token === "m3" || token === "m³") id = "cbm";
    else if (/^pkgs?$/.test(token)) id = "piece";
    return { id: id, raw: match[1], containerType: "" };
  }

  function bareUnitFollows(text, index) {
    const spaces = /^\s+/.exec(String(text || "").slice(index));
    if (!spaces) return false;
    return !!bareUnitAt(text, index + spaces[0].length);
  }

  function findRateGroups(text) {
    const groups = [];
    const re = /(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+,\d+|\d+(?:\.\d+)?)(\s*(?:\/|／|per\s+)\s*|\s+)/gi;
    let match;
    while ((match = re.exec(text))) {
      const bare = !/[\/／]/i.test(match[2]) && !/per/i.test(match[2]);
      const unitIndex = match.index + match[0].length;
      if (bare && !currencyImmediatelyBefore(text, match.index)) continue;
      const unit = bare ? bareUnitAt(text, unitIndex) : unitAfterSlash(text, unitIndex);
      if (!unit) continue;
      const end = unitIndex + unit.raw.length;
      if (re.lastIndex < end) re.lastIndex = end;
      const amount = numericValue(match[1]);
      if (amount == null) continue;
      if (groups.some(function (group) { return match.index < group.end && end > group.start; })) continue;
      const currency = currencyImmediatelyBefore(text, match.index);
      groups.push({
        start: currency ? currency.index : match.index,
        end: end,
        amount: amount,
        raw: match[1],
        currency: currency ? currency.code : "",
        unit: unit.id,
        containerType: unit.containerType || "",
        looseUnit: unit.loose ? unit.raw : "",
        bare: bare,
      });
    }
    return groups;
  }

  function lumpAfterRate(text, rate) {
    if (!rate || !rate.bare) return null;
    const slice = text.slice(rate.end);
    const match = /^\s*[,，]?\s*(?:(USD|TWD|EUR|GBP|CNY|JPY|HKD|SGD|KRW|AUD|RMB|NTD)\s+)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/i.exec(slice);
    if (!match) return null;
    const raw = match[2];
    const value = numericValue(raw);
    if (value == null) return null;
    const end = rate.end + match[0].length;
    if (/^\s*(?:\/|／|per\s+)/i.test(text.slice(end))) return null;
    if (bareUnitFollows(text, end)) return null;
    let start = end - raw.length;
    if (match[1]) {
      const at = match[0].toUpperCase().lastIndexOf(match[1].toUpperCase());
      if (at >= 0) start = rate.end + at;
    }
    return {
      raw: raw,
      value: value,
      currency: match[1] ? normalizeCurrency(match[1]) : (rate.currency || ""),
      start: start,
      end: end,
      numberStart: end - raw.length,
      numberEnd: end,
    };
  }

  function expandRateItems(line) {
    const original = normalizeWidth(line);
    if (!original || original.length > 800) return [];
    const groups = findRateGroups(original);
    if (!groups.length) return [];
    const name = cleanLead(original.slice(0, groups[0].start));
    let carried = "";
    return groups.map(function (group) {
      if (group.currency) carried = group.currency;
      return {
        name: name,
        costPrice: group.amount,
        quotePrice: group.amount,
        unit: group.unit,
        containerType: group.unit === "container" ? group.containerType : "",
        currency: carried,
        looseUnit: group.looseUnit || "",
      };
    });
  }

  function parseSingle(original) {
    if (!original || original.length < 2 || original.length > 800) return null;
    if (/^(dear|hi|hello|thanks|thank you|best regards|regards|此致|敬上|您好|你好)/i.test(original)) return null;
    if (/^[-─=_*#]{3,}$/.test(original)) return null;
    if (/^(合計|小計|總計|總額|total|grand total|sub\s*total)\b/i.test(original)) return null;
    if (/項目/.test(original) && /單價/.test(original)) return null;

    const currencyHit = findCurrency(original);
    const typeHit = findContainerType(original);
    const unitHit = findUnit(original);
    const hinted = !!(currencyHit || unitHit || typeHit || /\/|／|每|per\b|單價/i.test(original));
    if (!hinted) return null;

    const nums = findNumbers(original).filter(function (num) {
      return !spansOverlap(num.index, num.index + num.raw.length, typeHit);
    });
    if (!nums.length) return null;
    const chosen = chooseNumber(nums, unitHit, currencyHit);
    let activeUnit = unitHit;
    let activeType = typeHit;
    if (unitHit && unitHit.fromType && !containerFollowsAmount(original, chosen)) {
      activeUnit = null;
      activeType = null;
    }
    const name = cleanName(original, chosen, activeUnit, currencyHit, activeType);
    if (badName(name)) return null;

    const unit = activeUnit ? activeUnit.id : "";
    let containerType = "";
    if (unit === "container") {
      containerType = (activeUnit && activeUnit.containerType) || (activeType ? activeType.id : "");
    }

    return {
      name: name,
      costPrice: chosen.value,
      quotePrice: chosen.value,
      unit: unit,
      containerType: containerType,
      currency: currencyHit ? currencyHit.code : "",
    };
  }

  function boilerplate(original) {
    if (/^(dear|hi|hello|thanks|thank you|best regards|regards|此致|敬上|您好|你好)/i.test(original)) return true;
    if (/^[-─=_*#]{3,}$/.test(original)) return true;
    return false;
  }

  function parseLabeledLine(original) {
    const colon = original.search(/[:：]/);
    if (colon <= 0) return null;
    const name = original.slice(0, colon).trim();
    if (!name || badName(name) || findNumbers(name).length || findRateGroups(name).length) return null;
    let rest = original.slice(colon + 1);
    let minCharge = "";
    const notes = [];
    rest = rest.replace(/\(([^)]*)\)|（([^）]*)）/g, function (_, inner, full) {
      const text = String(inner != null ? inner : full).trim();
      if (!text) return " ";
      if (/min(?:imum)?|最低/i.test(text)) {
        const nums = findNumbers(text);
        if (nums.length) minCharge = nums[nums.length - 1].value;
      } else notes.push(text);
      return " ";
    });
    const band = /^\s*([+-]\d+(?:\.\d+)?\s*KG)\b/i.exec(rest);
    if (band) {
      notes.unshift("級距 " + band[1].replace(/\s+/g, "").replace(/kg$/i, "KG"));
      rest = rest.slice(band.index + band[0].length).replace(/^\s*(?:\/|／)\s*/, "");
    }
    rest = rest.replace(/\s+/g, " ").trim();
    const labeledRates = findRateGroups(rest);
    if (labeledRates.length === 1 && labeledRates[0].bare) {
      const trailed = lumpAfterRate(rest, labeledRates[0]);
      if (trailed) {
        const cur = trailed.currency || labeledRates[0].currency || "";
        notes.push(cur ? "報價總額 " + cur + " " + trailed.raw : "報價總額 " + trailed.raw);
      }
    }
    const note = notes.join("；");
    function finish(amount, unit, containerType, currency) {
      return {
        name: name,
        costPrice: amount,
        quotePrice: amount,
        unit: unit,
        containerType: containerType || "",
        currency: currency || "",
        minCharge: minCharge,
        note: note,
        looseUnit: "",
      };
    }
    const groups = labeledRates;
    if (groups.length) {
      let carried = "";
      return groups.map(function (group) {
        if (group.currency) carried = group.currency;
        const item = finish(group.amount, group.unit, group.unit === "container" ? group.containerType : "", carried);
        item.looseUnit = group.looseUnit || "";
        return item;
      });
    }
    const nums = findNumbers(rest);
    if (!nums.length) return null;
    const currencyHit = findCurrency(rest);
    return [finish(chooseNumber(nums, null, currencyHit).value, "shipment", "", currencyHit ? currencyHit.code : "")];
  }

  function findAllCurrencies(text) {
    const hits = [];
    CURRENCY_DEFS.forEach(function (def) {
      const re = new RegExp(def.re.source, "gi");
      let match;
      while ((match = re.exec(text))) {
        hits.push({ code: def.code, raw: match[0], index: match.index, end: match.index + match[0].length });
        if (!match[0].length) re.lastIndex += 1;
      }
    });
    hits.sort(function (a, b) { return a.index - b.index || b.raw.length - a.raw.length; });
    const kept = [];
    hits.forEach(function (hit) {
      if (kept.some(function (prev) { return hit.index < prev.end && hit.end > prev.index; })) return;
      kept.push(hit);
    });
    return kept;
  }

  function amountAfterCurrency(text, currency) {
    const match = new RegExp("^\\s*(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)").exec(text.slice(currency.end));
    if (!match) return null;
    const raw = match[1];
    const numberStart = currency.end + match[0].length - raw.length;
    const numberEnd = numberStart + raw.length;
    const value = numericValue(raw);
    if (value == null) return null;
    return {
      raw: raw,
      value: value,
      start: currency.index,
      end: numberEnd,
      numberStart: numberStart,
      numberEnd: numberEnd,
      currency: currency.code,
      isRate: /^\s*(?:\/|／|per\s+|每\s*)/i.test(text.slice(numberEnd)) || bareUnitFollows(text, numberEnd),
    };
  }

  function findMinCharge(text) {
    const match = /\b(?:minimum|min)\.?(?![A-Za-z])\s*:?\s*((?:US\s*\$|NT\s*\$|USD|TWD|EUR|GBP|CNY|JPY|HKD|SGD|KRW|AUD|RMB|NTD|台幣|臺幣)\s*)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/i.exec(text);
    if (!match) return null;
    let start = match.index;
    let end = match.index + match[0].length;
    const before = text.slice(0, start);
    const dash = /[-–—]\s*$/.exec(before);
    if (dash && (dash.index === 0 || /\s/.test(before.charAt(dash.index - 1)))) start = dash.index;
    let currency = match[1] ? normalizeCurrency(match[1]) : "";
    const unitAfter = /^\s*(?:\/|／|per\s+)\s*(?:kgs?|k|sets?|shipment|shpt|b\/l|bl|hawb|awb|trip|h|m)(?![A-Za-z0-9])/i.exec(text.slice(end));
    if (unitAfter) {
      end += unitAfter[0].length;
    } else {
      const afterCur = /^\s*(US\s*\$|NT\s*\$|USD|TWD|EUR|GBP|CNY|JPY|HKD|SGD|KRW|AUD|RMB|NTD|台幣|臺幣)\b/i.exec(text.slice(end));
      if (afterCur) {
        end += afterCur[0].length;
        if (!currency) currency = normalizeCurrency(afterCur[1]);
      }
    }
    if (start > 0 && (text.charAt(start - 1) === "(" || text.charAt(start - 1) === "（")) start -= 1;
    if (text.charAt(end) === ")" || text.charAt(end) === "）") end += 1;
    const value = numericValue(match[2]);
    if (value == null) return null;
    return { value: value, start: start, end: end, currency: currency };
  }

  function maskedRemainder(text, spans) {
    const hidden = [];
    spans.forEach(function (span) {
      for (let i = span.start; i < span.end && i < text.length; i += 1) hidden[i] = true;
    });
    let out = "";
    for (let i = 0; i < text.length; i += 1) out += hidden[i] ? " " : text.charAt(i);
    return out.replace(/\s+/g, " ").replace(/^[\s,，;；\-–—]+|[\s,，;；\-–—]+$/g, "").trim();
  }

  function parentheticalOnly(text) {
    return /^[（(][^()（）]*[)）]$/.test(String(text || "").trim());
  }

  function remainderIsUnit(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return false;
    if (/^(?:每|per\b|\/|／)/i.test(trimmed)) return true;
    const unit = unitAfterSlash(trimmed, 0);
    return !!(unit && unit.raw.length === trimmed.length);
  }

  function parseEuropeanQuote(original) {
    const rates = findRateGroups(original);
    if (rates.length > 1) return null;
    const first = findCurrency(original);
    if (!first) return null;
    const head = original.slice(0, first.index);
    if (/[:：]/.test(head)) return null;
    const name = cleanLead(head);
    if (!name || badName(name) || findNumbers(name).length) return null;
    if (/^(?:min(?:imum)?|最低(?:收費)?)$/i.test(name)) return null;

    const rate = rates[0] || null;
    const min = findMinCharge(original);
    const lumps = [];
    findAllCurrencies(original).forEach(function (currency) {
      const amount = amountAfterCurrency(original, currency);
      if (!amount || amount.isRate) return;
      if (min && amount.numberStart < min.end && amount.numberEnd > min.start) return;
      if (rate && amount.numberStart < rate.end && amount.numberEnd > rate.start) return;
      lumps.push(amount);
    });
    const trailed = rates.length === 1 ? lumpAfterRate(original, rates[0]) : null;
    if (trailed && !(min && trailed.numberStart < min.end && trailed.numberEnd > min.start) && !lumps.some(function (lump) {
      return lump.numberStart < trailed.numberEnd && lump.numberEnd > trailed.numberStart;
    })) {
      lumps.push({
        raw: trailed.raw,
        value: trailed.value,
        start: trailed.start,
        end: trailed.end,
        numberStart: trailed.numberStart,
        numberEnd: trailed.numberEnd,
        currency: trailed.currency || rates[0].currency || "",
      });
    }
    const priceLump = rate ? null : (lumps[0] || null);
    if (!rate && !priceLump) return null;

    const spans = [{ start: 0, end: first.index }];
    if (rate) spans.push({ start: rate.start, end: rate.end });
    if (min) spans.push({ start: min.start, end: min.end });
    lumps.forEach(function (lump) { spans.push({ start: lump.start, end: lump.end }); });
    let remark = maskedRemainder(original, spans);
    if (remainderIsUnit(remark)) return null;
    if (parentheticalOnly(remark)) remark = "";

    const extraLumps = priceLump ? lumps.slice(1) : lumps;
    const take = extraLumps.length > 0 || !!min || !!remark || (priceLump && /[.]/.test(priceLump.raw));
    if (!take) return null;

    const notes = extraLumps.map(function (lump) {
      return "報價總額 " + lump.currency + " " + lump.raw;
    });
    if (remark) notes.push(remark);
    const unit = rate ? rate.unit : "shipment";
    return {
      name: name,
      costPrice: rate ? rate.amount : priceLump.value,
      quotePrice: rate ? rate.amount : priceLump.value,
      unit: unit,
      containerType: rate && unit === "container" ? (rate.containerType || "") : "",
      currency: rate ? (rate.currency || (priceLump ? priceLump.currency : "")) : priceLump.currency,
      minCharge: min ? min.value : "",
      note: notes.join("；"),
      looseUnit: rate ? (rate.looseUnit || "") : "",
    };
  }

  function stripLeadIndex(text) {
    return String(text || "").replace(/^\d{1,2}\s*[\.、．](?!\d)\s*/, "");
  }

  function tidyFeeName(name) {
    let text = String(name || "").replace(/\s+/g, " ").trim();
    text = text.replace(/^\d{1,2}\s*[\.、．](?!\d)\s*/, "");
    let prev = "";
    while (text !== prev) {
      prev = text;
      text = text.replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, "$1$2");
    }
    return text.trim();
  }

  function joinNote(note, extra) {
    const next = String(extra || "").trim();
    if (!next) return String(note || "").trim();
    const prev = String(note || "").trim();
    if (!prev) return next;
    if (prev.indexOf(next) >= 0) return prev;
    return prev + "；" + next;
  }

  function maskSpan(text, span) {
    if (!span) return text;
    return text.slice(0, span.start) + new Array(Math.max(0, span.end - span.start) + 1).join(" ") + text.slice(span.end);
  }

  function isWeightTier(text) {
    const value = String(text || "").trim();
    if (!value) return false;
    if (/\d+\s*[-~～到至]\s*\d+\s*kgs?\b/i.test(value)) return true;
    return /^[+]?\d+\s*kgs?\b/i.test(value);
  }

  function tierLabel(text) {
    const range = /(\d+)\s*[-~～到至]\s*(\d+)\s*kgs?/i.exec(text);
    if (range) return range[1] + "-" + range[2] + " KGS";
    const plus = /(\+)?\s*(\d+)\s*kgs?/i.exec(text);
    if (!plus) return String(text || "").trim();
    const sign = plus[1] || (/以上/.test(text) ? "+" : "");
    return sign + plus[2] + " KGS";
  }

  function liftParens(text) {
    const notes = [];
    const next = String(text || "").replace(/\(([^)]*)\)|（([^）]*)）/g, function (_, inner, full) {
      const value = String(inner != null ? inner : full).trim();
      if (!value) return " ";
      if (isWeightTier(value) || /^(?:min(?:imum)?|最低)/i.test(value)) return "(" + value + ")";
      notes.push(value);
      return " ";
    });
    return { text: next, notes: notes };
  }

  function applyLooseUnit(item) {
    if (!item) return;
    const token = String(item.looseUnit || "").replace(/\s+/g, "");
    if (/^h$/i.test(token)) item.note = joinNote(item.note, "原單位 /H");
    else if (/^m$/i.test(token)) item.note = joinNote(item.note, "原單位 /M");
    delete item.looseUnit;
  }

  function isMinOnlyLine(text) {
    const min = findMinCharge(text);
    if (!min) return false;
    const rest = maskSpan(text, min);
    if (findRateGroups(rest).length) return false;
    return !findNumbers(rest).some(function (num) { return num.value !== 0; });
  }

  function parseWeightTierLine(original) {
    const min = findMinCharge(original);
    const masked = maskSpan(original, min);
    const groups = findRateGroups(masked);
    if (!groups.length) return null;
    const tiers = groups.map(function (group, index) {
      const next = groups[index + 1];
      const between = masked.slice(group.end, next ? next.start : masked.length);
      const paren = /\(([^)]*)\)|（([^）]*)）/.exec(between);
      const inner = paren ? String(paren[1] != null ? paren[1] : paren[2]).trim() : "";
      return isWeightTier(inner) ? tierLabel(inner) : "";
    });
    if (!tiers.some(Boolean)) return null;
    const base = tidyFeeName(cleanLead(masked.slice(0, groups[0].start)));
    let carried = "";
    return groups.map(function (group, index) {
      if (group.currency) carried = group.currency;
      const tier = tiers[index];
      return {
        name: tidyFeeName([base, tier].filter(Boolean).join(" ")),
        tier: tier,
        baseName: base,
        costPrice: group.amount,
        quotePrice: group.amount,
        unit: group.unit,
        containerType: group.unit === "container" ? (group.containerType || "") : "",
        currency: carried,
        minCharge: index === 0 && min ? min.value : "",
        note: "",
        looseUnit: group.looseUnit || "",
      };
    });
  }

  function parseLeadingMinRate(original) {
    const min = findMinCharge(original);
    if (!min) return null;
    const rates = findRateGroups(original);
    if (rates.some(function (rate) { return rate.end <= min.start; })) return null;
    const after = rates.filter(function (rate) { return rate.start >= min.end; });
    if (after.length !== 1) return null;
    const name = tidyFeeName(cleanLead(original.slice(0, min.start)));
    if (name && badName(name)) return null;
    const rate = after[0];
    return [{
      name: name,
      costPrice: rate.amount,
      quotePrice: rate.amount,
      unit: rate.unit,
      containerType: rate.unit === "container" ? (rate.containerType || "") : "",
      currency: rate.currency || min.currency || "",
      minCharge: min.value,
      note: "",
      looseUnit: rate.looseUnit || "",
    }];
  }

  function parseUnpriced(original) {
    const text = stripLeadIndex(normalizeWidth(original));
    if (!text || findRateGroups(text).length) return null;
    const flagged = /依航司公告|實報實銷|\bon\s+consignee\s+account\b|\bat\s+cost\b/i.test(text);
    const gst = /\bgst\b/i.test(text);
    if (!flagged && !gst) return null;
    let name = text;
    const colon = text.search(/[:：]/);
    if (colon > 0) name = text.slice(0, colon).trim();
    name = tidyFeeName(name).replace(/^\d+(?:\.\d+)?\s*%\s*/, "");
    if (gst) name = "GST";
    else if (/^at\s+cost$/i.test(text.trim()) || /^at\s+cost$/i.test(name)) name = "at cost";
    else if (/^實報實銷$/.test(text.trim())) name = "實報實銷";
    if (!name) name = tidyFeeName(text);
    return {
      name: tidyFeeName(name),
      costPrice: 0,
      quotePrice: 0,
      unit: "shipment",
      containerType: "",
      currency: "",
      minCharge: "",
      note: String(original || "").trim(),
      hideFromQuote: true,
      unpriced: true,
    };
  }

  function unitFromToken(token) {
    const hit = unitAfterSlash(String(token || ""), 0);
    if (!hit) return { id: "shipment", loose: "" };
    return { id: hit.id, loose: hit.loose ? hit.raw : "" };
  }

  function parseAirlinePlan(line) {
    const original = normalizeWidth(line);
    const head = /^BY\s+(CI|BR|CX|SQ|TG)\b/i.exec(original);
    if (!head) return null;
    const notes = [];
    let body = original.slice(head[0].length);
    body = body.replace(/\(([^)]*)\)|（([^）]*)）/g, function (_, inner, full) {
      const value = String(inner != null ? inner : full).trim();
      if (value) notes.push(value);
      return " ";
    });
    let route = "";
    body = body.replace(/\b([A-Z]{3}(?:\s*[-–\/]\s*[A-Z]{3}){1,})\b/, function (_, token) {
      route = token.replace(/\s+/g, "").replace(/[–\/]/g, "-");
      return " ";
    });
    let breakLabel = "";
    body = body.replace(/\+\s*(\d+)\s*k(?:gs?)?(?![A-Za-z])/i, function (_, n) {
      if (!breakLabel) breakLabel = "+" + n + "K";
      return " ";
    });
    const extras = [];
    let freight = null;
    let my = null;
    let myUnit = "kg";
    const patterns = [
      { kind: "code", re: /\b([A-Z]{2,6})\s*[:：]\s*(\d+(?:\.\d+)?)\s*(?:\/|／)\s*([A-Za-z]+)/i },
      { kind: "code", re: /\b([A-Z]{2,6})\s+(\d+(?:\.\d+)?)\s*(?:\/|／)\s*([A-Za-z]+)/i },
      { kind: "pair", re: /\b([A-Z]{2,6}\s*\/\s*[A-Z]{2,6})\b/ },
      { kind: "bare", re: /(\d+(?:\.\d+)?)\s*(?:\/|／)\s*([A-Za-z]+)/i },
    ];
    let guard = 0;
    while (guard < 12) {
      guard += 1;
      let best = null;
      patterns.forEach(function (pattern) {
        const match = pattern.re.exec(body);
        if (!match) return;
        if (!best || match.index < best.index) best = { pattern: pattern, match: match };
      });
      if (!best) break;
      const match = best.match;
      body = body.slice(0, match.index) + " " + body.slice(match.index + match[0].length);
      if (best.pattern.kind === "pair") {
        const name = match[1].replace(/\s+/g, "");
        extras.push({ name: name, amount: 0, unit: "shipment", unpriced: true, raw: name });
        continue;
      }
      if (best.pattern.kind === "bare") {
        if (freight == null) freight = numericValue(match[1]);
        continue;
      }
      const code = match[1].toUpperCase();
      const amount = numericValue(match[2]);
      const mapped = unitFromToken(match[3]);
      if (code === "MY") {
        my = amount;
        myUnit = mapped.id || "kg";
        continue;
      }
      extras.push({
        name: code,
        amount: amount,
        unit: mapped.id || "shipment",
        loose: mapped.loose,
        unpriced: false,
      });
    }
    return {
      code: head[1].toUpperCase(),
      route: route,
      breakLabel: breakLabel,
      freight: freight,
      my: my,
      myUnit: myUnit,
      extras: extras,
      note: notes.join("；"),
      currency: "TWD",
    };
  }

  function expandAirPlan(plan) {
    if (!plan) return [];
    const bump = plan.note || "";
    const items = [];
    if (plan.freight != null) {
      items.push({
        name: "Freight",
        costPrice: plan.freight,
        quotePrice: plan.freight,
        unit: "kg",
        currency: plan.currency || "TWD",
        minCharge: "",
        note: joinNote(plan.breakLabel, bump),
        fromAirPlan: true,
      });
    }
    if (plan.my != null) {
      items.push({
        name: "MY Fuel Surcharge",
        costPrice: plan.my,
        quotePrice: plan.my,
        unit: plan.myUnit || "kg",
        currency: plan.currency || "TWD",
        minCharge: "",
        note: bump,
        fromAirPlan: true,
      });
    }
    (plan.extras || []).forEach(function (extra) {
      const item = {
        name: extra.name,
        costPrice: extra.unpriced ? 0 : extra.amount,
        quotePrice: extra.unpriced ? 0 : extra.amount,
        unit: extra.unit || "shipment",
        currency: extra.currency || plan.currency || "TWD",
        minCharge: "",
        note: extra.unpriced ? (extra.raw || extra.name) : "",
        hideFromQuote: !!extra.unpriced,
        unpriced: !!extra.unpriced,
        fromAirPlan: true,
        looseUnit: extra.loose || "",
      };
      applyLooseUnit(item);
      items.push(item);
    });
    return items;
  }

  function parseCore(original) {
    const tiers = parseWeightTierLine(original);
    if (tiers) return tiers;
    const leading = parseLeadingMinRate(original);
    if (leading) return leading;
    const european = parseEuropeanQuote(original);
    if (european && european.name) return [european];
    const labeled = parseLabeledLine(original);
    if (labeled && labeled.length) return labeled;
    const expanded = expandRateItems(original);
    if (expanded.length > 1) return badName(expanded[0].name) ? [] : expanded;
    if (expanded.length === 1 && !badName(expanded[0].name)) return expanded;
    const single = parseSingle(original);
    if (single) return [single];
    const coded = parseFeeCodeAmount(original);
    if (coded) return [coded];
    const unpriced = parseUnpriced(original);
    return unpriced ? [unpriced] : [];
  }

  function parseCostLine(line) {
    let original = stripLeadIndex(normalizeWidth(line));
    if (!original || original.length < 2 || original.length > 800) return [];
    if (boilerplate(original)) return [];
    if (parseAirlinePlan(original)) return [];
    if (/^(合計|小計|總計|總額|total|grand total|sub\s*total)\b/i.test(original)) return [];
    if (/項目/.test(original) && /單價/.test(original)) return [];
    if (isMinOnlyLine(original)) return [];
    const lifted = liftParens(original);
    original = normalizeWidth(lifted.text);
    return parseCore(original).map(function (item) {
      item.name = tidyFeeName(item.name);
      lifted.notes.forEach(function (note) { item.note = joinNote(item.note, note); });
      applyLooseUnit(item);
      return item;
    });
  }

  function sectionHeader(line) {
    const text = String(line || "").trim();
    if (!text || text.length > 40) return "";
    if (/local\s*charge/i.test(text)) return "local";
    if (/dap\s*charge/i.test(text)) return "dap";
    return "";
  }

  function isBareName(original) {
    const raw = String(original || "").trim();
    const body = stripLeadIndex(raw);
    const hadIndex = body !== raw;
    const text = tidyFeeName(body);
    if (!text || findNumbers(body).length) return false;
    if (sectionHeader(original) || parseAirlinePlan(original)) return false;
    if (/[:：]/.test(text)) return false;
    if (hadIndex && text.length <= 30) return true;
    return /^[\u4e00-\u9fff]{1,6}$/.test(text);
  }

  function consumeSectionLine(original, section, pending) {
    if (boilerplate(original)) return { handled: false, items: [] };
    if (isMinOnlyLine(original)) {
      const min = findMinCharge(original);
      pending.min = min.value;
      pending.minCurrency = min.currency || (section === "local" ? "TWD" : "");
      return { handled: true, items: [] };
    }
    if (isBareName(original)) {
      pending.base = tidyFeeName(stripLeadIndex(original));
      return { handled: true, items: [] };
    }
    let parsed = parseCostLine(original);
    if (!parsed.length) return { handled: false, items: [] };
    let usedPendingMin = false;
    parsed.forEach(function (item) {
      if (item.tier && pending.base && !item.baseName) {
        item.name = tidyFeeName(pending.base + " " + item.tier);
      } else if (!item.name && pending.base) {
        item.name = pending.base;
      }
      item.name = tidyFeeName(item.name);
      if (item.baseName) pending.base = item.baseName;
      else if (item.name && !item.tier) pending.base = item.name;
      if (!item.currency && section === "local") item.currency = "TWD";
      if (!usedPendingMin && pending.min != null && pending.min !== "" && (item.minCharge === "" || item.minCharge == null)) {
        item.minCharge = pending.min;
        usedPendingMin = true;
        if (!item.currency && pending.minCurrency) item.currency = pending.minCurrency;
      }
    });
    if (usedPendingMin || parsed.some(function (item) { return item.minCharge !== "" && item.minCharge != null; })) {
      pending.min = null;
    }
    return { handled: true, items: parsed.filter(keptFee) };
  }

  const FEE_CODE_RE = /\b(?:A\/F|FSC|SSC|SCR|THC|CFS|DOC|EDI|H\/C|W\/H|I\/L|AMS|ENS|VGM|BAF|FAF|LCL)\b/i;
  const FEE_WORD_RE = /^(?:freight|charges?|fees?|surcharges?|handling|customs|clearance|pick\s*-?\s*up|delivery|trucking)\b/i;
  const FEE_ZH_RE = /^(?:運費|海運費|空運費|報關費|燃油(?:附加)?費|附加費|倉儲費|倉租|提貨費|送貨費|拖車費)/;

  function hasFeeCode(line) {
    return FEE_CODE_RE.test(line) || FEE_WORD_RE.test(line) || FEE_ZH_RE.test(line);
  }

  function lineHasCurrency(line) {
    return !!findCurrency(line);
  }

  function lineHasPricingUnit(line) {
    if (findRateGroups(line).length) return true;
    const unit = findUnit(line);
    if (unit && !unit.fromType) return true;
    return /\d(?:\.\d+)?\s+(?:20|40)\s*(?:GP|HQ|HC|RF|OT|FR)\b/i.test(line);
  }

  function strongFee(line) {
    return findNumbers(line).length > 0 && (lineHasCurrency(line) || lineHasPricingUnit(line) || hasFeeCode(line));
  }

  function containerFollowsAmount(text, numberHit) {
    if (!numberHit) return false;
    const typeHit = findContainerType(text);
    if (!typeHit) return false;
    if (typeHit.index < numberHit.index + numberHit.raw.length) return false;
    const gap = text.slice(numberHit.index + numberHit.raw.length, typeHit.index);
    return /^[\s]*(?:\/|／|per\s+)?[\s]*$/i.test(gap);
  }

  function isMetaLine(line) {
    if (/^(?:to|from|attn|attention|dear)\b/i.test(line)) return true;
    if (/^(?:date|valid(?:ity)?)\b/i.test(line)) return true;
    if (/^(?:quote|quotation)\b/i.test(line)) return true;
    if (/^(?:payment|transit(?:\s*time)?)\b/i.test(line)) return true;
    if (/^(?:tel|telephone|phone|mobile|fax|e-?mail|email)\b/i.test(line)) return true;
    if (/^(?:routing|route|airline|flight)\b/i.test(line) && !strongFee(line)) return true;
    if (/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(line) && !strongFee(line)) return true;
    if (/https?:\/\/|www\.\w/i.test(line) && !strongFee(line)) return true;
    if (/\b(?:post(?:al)?\s*code|zip(?:\s*code)?|address)\b/i.test(line) && !strongFee(line)) return true;
    if (/\b\d{1,4}\s*days?\b/i.test(line) && !strongFee(line)) return true;
    if (/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/.test(line) && !strongFee(line)) return true;
    if (/\b[A-Z]{3}(?:\s*[-–\/]\s*[A-Z]{3}){1,}\b/.test(line) && !strongFee(line)) return true;
    if (/\bvia\s+(?:air|sea|ocean|truck)\b/i.test(line) && !strongFee(line)) return true;
    if (/\binvoice\b/i.test(line) && !strongFee(line)) return true;
    return false;
  }

  function isFeeItems(line, items) {
    const hasAmount = items.some(function (item) {
      return item.costPrice !== "" && item.costPrice != null && isFinite(Number(item.costPrice));
    });
    if (!hasAmount) return false;
    return lineHasCurrency(line) || lineHasPricingUnit(line) || hasFeeCode(line);
  }

  function readCargoLine(line) {
    let match = /^(?:total\s+weight|gross\s+weight|gross\s+wt|g\.?\s*w\.?|毛重|總重量|總重)\b\s*[:：]?\s*(.*)$/i.exec(line);
    if (match && !lineHasCurrency(line)) {
      const nums = findNumbers(line);
      if (!nums.length) return { kind: "empty" };
      return { kind: "weight", value: nums[0].value, unit: /\blbs?\b|英磅/i.test(line) ? "lb" : "kg" };
    }
    if (/^(?:total\s+volume|measurement|總材積|體積)\b/i.test(line) || /^(?:total\s+)?(?:cbm|m3|m³|合計\s*cbm)\b\s*[:：]?\s*[\d,]+(?:\.\d+)?\s*(?:cbm|m3|m³)?\s*$/i.test(line)) {
      if (!lineHasCurrency(line)) {
        const scanned = scanLine(line);
        if (scanned.volumes.length) return { kind: "cbm", value: scanned.volumes[0] };
        const cleaned = line.replace(/\b[Mm]\s*3\b/g, " ").replace(/m³/gi, " ");
        const nums = findNumbers(cleaned);
        if (!nums.length) return { kind: "empty" };
        return { kind: "cbm", value: nums[nums.length - 1].value };
      }
    }
    if ((/^(?:total\s+)?(?:no\.?\s+of\s+)?(?:pieces|pkgs?|packages|pcs|ctns|cartons)\b/i.test(line) || /^(?:總件數|件數)\b/i.test(line)) && !lineHasCurrency(line)) {
      const nums = findNumbers(line);
      if (!nums.length) return { kind: "empty" };
      return { kind: "pieces", value: nums[0].value };
    }
    match = /^(?:airline|flight|航空公司)\b\s*[:：-]?\s*(.*)$/i.exec(line);
    if (match && !strongFee(line)) {
      const value = match[1].trim();
      return value ? { kind: "airline", value: value } : { kind: "empty" };
    }
    match = /^(?:routing|route|航線)\b\s*[:：-]?\s*(.*)$/i.exec(line);
    if (match && !strongFee(line)) {
      const value = match[1].trim();
      return value ? { kind: "route", value: value } : { kind: "empty" };
    }
    if (/^[A-Z]{3}(?:\s*[-–\/]\s*[A-Z]{3}){1,}(?:\s+via\s+\w+)?$/i.test(line)) return { kind: "route", value: line };
    if (/^via\s+(?:air|sea|ocean|truck)\b/i.test(line)) return { kind: "route", value: line };
    return null;
  }

  function parseFeeCodeAmount(original) {
    if (!hasFeeCode(original) || isMetaLine(original)) return null;
    const typeHit = findContainerType(original);
    const nums = findNumbers(original).filter(function (num) {
      return !spansOverlap(num.index, num.index + num.raw.length, typeHit);
    });
    if (!nums.length) return null;
    const currencyHit = findCurrency(original);
    const chosen = chooseNumber(nums, null, currencyHit);
    const follow = containerFollowsAmount(original, chosen);
    const unitHit = follow && typeHit ? {
      id: "container",
      raw: typeHit.raw,
      index: typeHit.index,
      containerType: typeHit.id,
    } : null;
    const name = cleanName(original, chosen, unitHit, currencyHit, follow ? typeHit : null);
    if (badName(name)) return null;
    return {
      name: name,
      costPrice: chosen.value,
      quotePrice: chosen.value,
      unit: unitHit ? "container" : "",
      containerType: unitHit ? unitHit.containerType : "",
      currency: currencyHit ? currencyHit.code : "",
    };
  }

  function blankCargo() {
    return {
      weight: null,
      chargeableWeight: null,
      volumeCbm: "",
      pieces: "",
      piecesExplicit: false,
      dimensions: [],
      airline: "",
      route: "",
    };
  }

  function isCargoKeywordLine(line) {
    if (/\b(?:weights?|volumes?|chargeable|goods|dimensions?|pieces|remarks|type|service)\b/i.test(line)) return true;
    if (/(?:^|[^A-Za-z])G\s*\.\s*W\b\.?/i.test(line) || /\bGW\b/i.test(line) || /\bG\/W\b/i.test(line)) return true;
    if (/\bshipment\s+details\b/i.test(line)) return true;
    if (/毛重|總重量|總重|材積|體積|計費重量|計費重|件數|尺寸|備註/.test(line)) return true;
    return false;
  }

  function normalizeDimUnit(unit) {
    const raw = String(unit || "").toLowerCase();
    if (raw === "mm") return "mm";
    if (raw === "inch" || raw === "in" || raw === "英吋") return "inch";
    return "cm";
  }

  function plainNum(raw) {
    const n = parseFloat(String(raw).replace(/,/g, ""));
    return isFinite(n) ? String(n) : "";
  }

  function scanLine(line) {
    const dims = [];
    const masked = String(line).replace(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)(?:\s*[（(]\s*(cm|mm|inch|in|英吋|公分)\s*[)）]|\s*(cm|mm|inch|in|英吋|公分)\b)?/gi, function (all, l, w, h, parenUnit, bareUnit) {
      dims.push({
        l: plainNum(l),
        w: plainNum(w),
        h: plainNum(h),
        unit: normalizeDimUnit(parenUnit || bareUnit || "cm"),
        pieces: "",
      });
      return " ".repeat(all.length);
    });
    const weights = [];
    const volumes = [];
    const pieces = [];
    let bareSize = false;
    const re = /(?<![\d.])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(kgs?|lbs?|cbm|m³|m3|pkgs?|pcs?|ctns?|pieces?|cm|mm)\b/gi;
    let match;
    while ((match = re.exec(masked))) {
      if (currencyImmediatelyBefore(line, match.index)) continue;
      const after = masked.slice(match.index + match[0].length);
      if (/^\s*(?:\/|／|per\b|每)/i.test(after)) continue;
      const value = parseFloat(match[1].replace(/,/g, ""));
      if (!isFinite(value)) continue;
      const unit = match[2].toLowerCase();
      if (/^kgs?$/.test(unit)) weights.push({ value: value, unit: "kg" });
      else if (/^lbs?$/.test(unit)) weights.push({ value: value, unit: "lb" });
      else if (unit === "cbm" || unit === "m3" || unit === "m³") volumes.push(value);
      else if (/^(?:pkgs?|pcs?|ctns?|pieces?)$/.test(unit)) pieces.push(value);
      else bareSize = true;
    }
    return { dims: dims, weights: weights, volumes: volumes, pieces: pieces, bareSize: bareSize };
  }

  function hasPerUnitRate(line) {
    if (findRateGroups(line).length) return true;
    const re = /(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+,\d+|\d+(?:\.\d+)?)\s*每\s*/g;
    let match;
    while ((match = re.exec(line))) {
      if (unitAfterSlash(line, match.index + match[0].length)) return true;
    }
    return false;
  }

  function hasCurrencyAmount(line) {
    if (!lineHasCurrency(line)) return false;
    return findNumbers(line).some(function (num) { return num.value !== 0; });
  }

  function hasFeeCodeAmount(line) {
    if (!hasFeeCode(line)) return false;
    const colon = line.search(/[:：]/);
    if (colon < 0) return false;
    return findNumbers(line.slice(colon + 1)).some(function (num) { return num.value !== 0; });
  }

  function isStrictFee(line) {
    return hasPerUnitRate(line) || hasCurrencyAmount(line) || hasFeeCodeAmount(line);
  }

  function isMeasureOnlyLine(line) {
    if (isStrictFee(line)) return false;
    const scanned = scanLine(line);
    return scanned.weights.length > 0 || scanned.volumes.length > 0 || scanned.pieces.length > 0 || scanned.dims.length > 0 || scanned.bareSize;
  }

  function setWeight(cargo, hit) {
    if (!hit || hit.value == null || !isFinite(Number(hit.value))) return;
    if (hit.kind === "chargeable") {
      if (!cargo.chargeableWeight) cargo.chargeableWeight = { value: hit.value, unit: hit.unit || "kg" };
      return;
    }
    if (!cargo.weight) cargo.weight = { value: hit.value, unit: hit.unit || "kg" };
  }

  function setVolume(cargo, value) {
    if (value === "" || value == null || !isFinite(Number(value))) return;
    if (cargo.volumeCbm === "" || cargo.volumeCbm == null) {
      cargo.volumeCbm = value;
      return;
    }
    if (Number(cargo.volumeCbm) === 0 && Number(value) !== 0) cargo.volumeCbm = value;
  }

  function setPieces(cargo, value, explicit) {
    if (value === "" || value == null || !isFinite(Number(value))) return;
    if (cargo.pieces === "" || cargo.pieces == null) {
      cargo.pieces = value;
      cargo.piecesExplicit = !!explicit;
      return;
    }
    if (explicit && !cargo.piecesExplicit) {
      cargo.pieces = value;
      cargo.piecesExplicit = true;
    }
  }

  function mergeLegacy(cargo, hit) {
    if (!hit || hit.kind === "empty") return;
    if (hit.kind === "weight") setWeight(cargo, { value: hit.value, unit: hit.unit || "kg", kind: "gross" });
    else if (hit.kind === "cbm") setVolume(cargo, hit.value);
    else if (hit.kind === "pieces") setPieces(cargo, hit.value, true);
    else if (hit.kind === "airline" && !cargo.airline) cargo.airline = hit.value;
    else if (hit.kind === "route" && !cargo.route) cargo.route = hit.value;
  }

  function collectLoose(cargo, line) {
    const scanned = scanLine(line);
    const grossLine = /(?:\bG\s*\.\s*W\b|\bGW\b|\bG\/W\b|\bgross\s+weight\b|\btotal\s+weight\b|毛重|總重量|總重)/i.test(line);
    const chargeLine = (/\bchargeable\b|計費重量|計費重/i.test(line)) && !grossLine;
    scanned.weights.forEach(function (hit) {
      setWeight(cargo, { value: hit.value, unit: hit.unit, kind: chargeLine ? "chargeable" : "gross" });
    });
    scanned.volumes.forEach(function (value) { setVolume(cargo, value); });
    if (!scanned.volumes.length && /\bvolume\b|\bmeasurement\b|材積|體積/i.test(line)) {
      const cleaned = line.replace(/\b[Mm]\s*3\b/g, " ").replace(/m³/gi, " ").replace(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/g, " ");
      const nums = findNumbers(cleaned);
      if (nums.length) setVolume(cargo, nums[nums.length - 1].value);
    }
    const explicitPieces = /^(?:total\s+)?(?:no\.?\s+of\s+)?(?:pieces|pkgs?|packages|pcs|ctns|cartons)\b|^(?:總件數|件數)\b/i.test(line);
    if (explicitPieces && scanned.pieces.length) setPieces(cargo, scanned.pieces[0], true);
    else if (scanned.dims.length === 1 && scanned.pieces.length) scanned.dims[0].pieces = String(scanned.pieces[0]);
    else if (!scanned.dims.length && scanned.pieces.length) setPieces(cargo, scanned.pieces[0], false);
    scanned.dims.forEach(function (dim) { cargo.dimensions.push(dim); });
  }

  function keptFee(item) {
    if (!item || !item.name) return false;
    if (item.unpriced) return true;
    const n = Number(item.costPrice);
    return item.costPrice !== "" && item.costPrice != null && isFinite(n) && n !== 0;
  }

  function isTotalLabelLine(line) {
    const text = String(line || "").trim();
    if (/^(?:合計|小計|總計|總額|grand\s*total|sub\s*total)\b/i.test(text)) return true;
    if (/^total\b/i.test(text) && !/^total\s+(?:weight|volume|pieces|pkgs?|packages|cbm|gross|no\b)/i.test(text)) return true;
    return false;
  }

  function isQuoteTableHeader(line) {
    const text = String(line || "");
    if (!/\bcurrency\b/i.test(text) || !/\bamount\s*per\b/i.test(text)) return false;
    if (!/\bminimum\s+amount\b/i.test(text) || !/\bsub\s*total\b/i.test(text)) return false;
    const stripped = text.replace(/amount\s*per/ig, " ").replace(/minimum\s+amount/ig, " ");
    return /\bamount\b/i.test(stripped);
  }

  function slotsFromHeader(line) {
    const minAt = String(line).search(/minimum\s+amount/i);
    const subAt = String(line).search(/sub\s*total/i);
    if (subAt >= 0 && minAt >= 0 && subAt < minAt) return ["subtotal", "minimum"];
    return ["minimum", "subtotal"];
  }

  function assignTrailing(nums, slots) {
    const out = {};
    const list = nums || [];
    const keys = slots || [];
    if (!list.length || !keys.length) return out;
    const start = Math.max(0, keys.length - list.length);
    list.slice(Math.max(0, list.length - keys.length)).forEach(function (num, index) {
      out[keys[start + index]] = num;
    });
    return out;
  }

  function unitTokenForRate(rate) {
    if (!rate) return "";
    if (rate.unit === "kg") return "kg";
    if (rate.unit === "lb") return "lb";
    if (rate.unit === "cbm") return "cbm";
    if (rate.unit === "piece") return "pkg";
    if (rate.unit === "shipment") return "shpt";
    if (rate.unit === "container") return rate.containerType || "";
    return "";
  }

  function normalizeRateUnit(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    const stripped = text.replace(/^(?:per\s+|\/|／)+/i, "");
    const bare = bareUnitAt(stripped, 0);
    if (bare && bare.raw.length === stripped.length) return unitTokenForRate({ unit: bare.id, containerType: bare.containerType || "" });
    const unit = unitAfterSlash(stripped, 0);
    if (unit && unit.raw.length === stripped.length) return unitTokenForRate({ unit: unit.id, containerType: unit.containerType || "" });
    return "";
  }

  function formatQuotedFee(row) {
    const source = row || {};
    const name = cleanLead(source.name);
    if (!name || isTotalLabelLine(name)) return "";
    const currency = normalizeCurrency(source.currency);
    const cur = /^[A-Z]{3}$/.test(currency) ? currency : "";
    const amount = String(source.amount == null ? "" : source.amount).trim();
    if (!amount || numericValue(amount) == null) return "";
    const unit = normalizeRateUnit(source.unit);
    const min = String(source.min == null ? "" : source.min).trim();
    const sub = String(source.subtotal == null ? "" : source.subtotal).trim();
    const hasMin = !!(min && numericValue(min) != null);
    const hasSub = !!(sub && numericValue(sub) != null);
    let line = name;
    if (unit) {
      if (hasSub) line += " " + [cur, sub].filter(Boolean).join(" ");
      line += " " + [cur, amount + "/" + unit].filter(Boolean).join(" ");
    } else {
      line += " " + [cur, amount].filter(Boolean).join(" ");
      if (hasSub) line += " " + [cur, sub].filter(Boolean).join(" ");
    }
    if (hasMin) line += " - min " + min + (cur ? " " + cur : "");
    if (source.tail) line += " " + String(source.tail).trim();
    return line.replace(/\s+/g, " ").trim();
  }

  function tailAfter(line, index) {
    return String(line || "").slice(index).replace(/^[\s,，;；]+/, "").trim();
  }

  function rewriteTableRow(line, slots) {
    if (isTotalLabelLine(line)) return "";
    const rates = findRateGroups(line);
    if (rates.length > 1) return undefined;
    if (rates.length === 1) {
      const rate = rates[0];
      if (!rate.bare || /\bmin(?:imum)?\b/i.test(line)) return line;
      const name = cleanLead(line.slice(0, rate.start));
      if (!name || badName(name)) return undefined;
      if (isTotalLabelLine(name)) return "";
      const nums = findNumbers(line.slice(rate.end));
      const assigned = assignTrailing(nums, slots);
      const last = nums.length ? nums[nums.length - 1] : null;
      const tailIndex = last ? rate.end + last.index + last.raw.length : rate.end;
      const formatted = formatQuotedFee({
        name: name,
        currency: rate.currency,
        amount: rate.raw || String(rate.amount),
        unit: unitTokenForRate(rate),
        min: assigned.minimum ? assigned.minimum.raw : "",
        subtotal: assigned.subtotal ? assigned.subtotal.raw : "",
        tail: tailAfter(line, tailIndex),
      });
      return formatted || undefined;
    }
    const cur = findCurrency(line);
    if (!cur) return undefined;
    const name = cleanLead(line.slice(0, cur.index));
    if (!name || badName(name)) return undefined;
    if (isTotalLabelLine(name)) return "";
    const nums = findNumbers(line.slice(cur.end));
    if (!nums.length) return undefined;
    const last = nums[nums.length - 1];
    const tail = tailAfter(line, cur.end + last.index + last.raw.length);
    if (tail && /[A-Za-z\u4e00-\u9fff]/.test(tail)) return line;
    const assigned = assignTrailing(nums.slice(1), slots);
    return formatQuotedFee({
      name: name,
      currency: cur.code,
      amount: nums[0].raw,
      unit: "",
      min: assigned.minimum ? assigned.minimum.raw : "",
      subtotal: assigned.subtotal ? assigned.subtotal.raw : "",
    }) || undefined;
  }

  function toKg(hit) {
    if (!hit || hit.value == null || !isFinite(Number(hit.value))) return null;
    const n = Number(hit.value);
    if (!(n > 0)) return null;
    return hit.unit === "lb" ? n * 0.453592 : n;
  }

  function weightForCheck(cargo) {
    if (!cargo) return null;
    const chargeable = toKg(cargo.chargeableWeight);
    if (chargeable != null) return chargeable;
    const cbm = cargo.volumeCbm === "" || cargo.volumeCbm == null ? 0 : Number(cargo.volumeCbm);
    if (cbm > 0) return null;
    return toKg(cargo.weight);
  }

  function annotateTotals(items, cargo, externalKg) {
    const external = Number(externalKg);
    const weight = isFinite(external) && external > 0 ? external : weightForCheck(cargo);
    if (weight == null) return;
    items.forEach(function (item) {
      if (!item || item.unit !== "kg" || !item.note || /[✓⚠]/.test(item.note)) return;
      const match = /報價總額\s+[A-Z]{3}\s+(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/.exec(item.note);
      if (!match) return;
      const total = numericValue(match[1]);
      const price = Number(item.costPrice);
      if (total == null || !isFinite(price)) return;
      const expected = price * weight;
      const diff = Math.abs(expected - total);
      const rel = diff / Math.max(Math.abs(total), Math.abs(expected), 1);
      let mark = "";
      if (diff <= 0.5 || rel <= 0.02) mark = "✓";
      else if (diff >= 1 && rel >= 0.05) mark = "⚠ 與重量不符";
      if (!mark) return;
      const end = match.index + match[0].length;
      item.note = item.note.slice(0, end) + " " + mark + item.note.slice(end);
    });
  }

  function acceptFeeLine(line, feesOnly, into) {
    const parsed = parseCostLine(line).filter(keptFee);
    if (parsed.some(function (item) { return item.unpriced; })) {
      parsed.forEach(function (item) { into.push(item); });
      return true;
    }
    const accept = feesOnly ? isStrictFee(line) : isFeeItems(line, parsed);
    if (!parsed.length || !accept) return false;
    parsed.forEach(function (item) { into.push(item); });
    return true;
  }

  function parseCostText(text, options) {
    const feesOnly = !options || options.feesOnly !== false;
    const items = [];
    const skipped = [];
    const cargo = blankCargo();
    let tableSlots = null;
    let section = "";
    const pending = { base: "", min: null, minCurrency: "" };
    const plans = [];
    String(text || "").split(/\r?\n/).forEach(function (line) {
      const original = normalizeWidth(line);
      if (!original) {
        tableSlots = null;
        return;
      }
      const header = sectionHeader(original);
      if (header) {
        section = header;
        pending.base = "";
        pending.min = null;
        pending.minCurrency = "";
        return;
      }
      const plan = parseAirlinePlan(original);
      if (plan) {
        plans.push(plan);
        return;
      }
      if (section === "local" || section === "dap") {
        const outcome = consumeSectionLine(original, section, pending);
        if (outcome.handled) {
          outcome.items.forEach(function (item) { items.push(item); });
          return;
        }
      }
      if (isQuoteTableHeader(original)) {
        tableSlots = slotsFromHeader(original);
        return;
      }
      const legacy = readCargoLine(original);
      if (legacy) {
        if (legacy.kind !== "empty") {
          mergeLegacy(cargo, legacy);
          collectLoose(cargo, original);
        }
        skipped.push(original);
        return;
      }
      if (/^sub\s*total\b/i.test(original)) return;
      if (tableSlots && isStrictFee(original)) {
        const rewritten = rewriteTableRow(original, tableSlots);
        if (rewritten !== undefined) {
          if (!rewritten) return;
          if (!acceptFeeLine(rewritten, feesOnly, items)) skipped.push(original);
          return;
        }
        tableSlots = null;
      }
      const cargoLine = isCargoKeywordLine(original) || isMeasureOnlyLine(original);
      if (cargoLine) collectLoose(cargo, original);
      if (cargoLine && feesOnly) {
        skipped.push(original);
        return;
      }
      if (boilerplate(original) || isMetaLine(original)) {
        skipped.push(original);
        return;
      }
      if (!acceptFeeLine(original, feesOnly, items)) skipped.push(original);
    });
    if ((cargo.pieces === "" || cargo.pieces == null) && cargo.dimensions.length) {
      const summed = cargo.dimensions.reduce(function (sum, dim) {
        return sum + (dim.pieces === "" || dim.pieces == null ? 0 : Number(dim.pieces));
      }, 0);
      if (summed) cargo.pieces = summed;
    }
    items.skipped = skipped;
    items.cargo = cargo;
    if (cargo.airline || cargo.route) {
      items.route = [cargo.airline, cargo.route].filter(Boolean).join(" / ");
    }
    annotateTotals(items, cargo, options && options.chargeableKg);
    items.airPlans = plans;
    return items;
  }

  NG.parse = {
    parseCostText: parseCostText,
    parseCostLine: parseCostLine,
    expandRateItems: expandRateItems,
    parseNumberToken: parseNumberToken,
    normalizeCurrency: normalizeCurrency,
    currencyKey: currencyKey,
    findUnit: findUnit,
    findCurrency: findCurrency,
    findContainerType: findContainerType,
    isQuoteTableHeader: isQuoteTableHeader,
    isTotalLabelLine: isTotalLabelLine,
    formatQuotedFee: formatQuotedFee,
    expandAirPlan: expandAirPlan,
  };
})(window.NG = window.NG || {});
