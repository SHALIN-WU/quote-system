(function (NG) {
  function isPasswordError(error) {
    if (!error) return false;
    if (error.name === "PasswordException") return true;
    const responses = window.pdfjsLib && window.pdfjsLib.PasswordResponses;
    if (responses && (error.code === responses.NEED_PASSWORD || error.code === responses.INCORRECT_PASSWORD)) return true;
    return /password/i.test(String(error.message || ""));
  }

  function linesFromItems(items, viewport) {
    const parts = [];
    (items || []).forEach(function (item) {
      if (!item || item.str == null) return;
      const raw = String(item.str);
      if (!raw.replace(/\s+/g, "")) return;
      const transform = item.transform || [1, 0, 0, 1, 0, 0];
      const x0 = transform[4] || 0;
      const y0 = transform[5] || 0;
      const width = item.width || 0;
      let x = x0;
      let y = y0;
      let advance = Math.abs(width);
      if (viewport && viewport.convertToViewportPoint) {
        const start = viewport.convertToViewportPoint(x0, y0);
        const end = viewport.convertToViewportPoint(x0 + width, y0);
        x = Math.min(start[0], end[0]);
        y = start[1];
        advance = Math.abs(end[0] - start[0]);
      }
      parts.push({
        x: x,
        y: y,
        str: raw,
        width: advance,
        height: Math.abs(item.height || transform[3] || 0) || 10,
      });
    });
    parts.sort(function (a, b) {
      if (Math.abs(a.y - b.y) > 0.8) return a.y - b.y;
      return a.x - b.x;
    });
    const lines = [];
    parts.forEach(function (part) {
      const tolerance = Math.min(Math.max(part.height * 0.5, 2), 6);
      const line = lines.length ? lines[lines.length - 1] : null;
      if (line && Math.abs(line.y - part.y) <= Math.max(line.tolerance, tolerance)) {
        line.parts.push(part);
        line.tolerance = Math.max(line.tolerance, tolerance);
        return;
      }
      lines.push({ y: part.y, tolerance: tolerance, parts: [part] });
    });
    return lines;
  }

  function joinLine(line) {
    const parts = line.parts.slice().sort(function (a, b) { return a.x - b.x; });
    let text = "";
    let cursor = null;
    parts.forEach(function (part) {
      if (cursor != null && part.x - cursor > 1.5 && text && !/\s$/.test(text) && !/^\s/.test(part.str)) {
        text += " ";
      }
      text += part.str;
      const end = part.x + (part.width || 0);
      if (cursor == null || end > cursor) cursor = end;
    });
    return text.replace(/[ \t\u00a0]+/g, " ").trim();
  }

  function clusterCells(parts) {
    const sorted = (parts || []).slice().sort(function (a, b) { return a.x - b.x; });
    const cells = [];
    sorted.forEach(function (part) {
      const prev = cells[cells.length - 1];
      const width = Math.max(part.width || 0, 1);
      const charW = Math.max(width / Math.max(String(part.str || "").length, 1), 3);
      const limit = Math.max(charW * 1.8, 8);
      const gap = prev ? part.x - prev.end : 0;
      if (prev && gap <= limit) {
        if (gap > Math.max(1.2, charW * 0.2) && prev.text && !/\s$/.test(prev.text)) prev.text += " ";
        prev.text += part.str;
        prev.end = Math.max(prev.end, part.x + (part.width || 0));
        return;
      }
      cells.push({
        text: String(part.str || ""),
        x: part.x,
        end: part.x + (part.width || 0),
        y: part.y || 0,
      });
    });
    return cells;
  }

  function mergeHeaderPhrases(cells) {
    const merged = [];
    cells.forEach(function (cell) {
      const text = String(cell.text || "").replace(/\s+/g, " ").trim();
      const prev = merged[merged.length - 1];
      if (prev && /^per$/i.test(text) && /amount$/i.test(prev.text)) {
        prev.text += " per";
        prev.end = Math.max(prev.end, cell.end);
        return;
      }
      if (prev && /^amount$/i.test(text) && /minimum$/i.test(prev.text)) {
        prev.text += " Amount";
        prev.end = Math.max(prev.end, cell.end);
        return;
      }
      merged.push({ text: text, x: cell.x, end: cell.end, y: cell.y || 0 });
    });
    return merged;
  }

  function classifyHeaderCell(text) {
    const cleaned = String(text || "")
      .replace(/\([^)]*\)/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[:：.]+$/g, "")
      .trim();
    if (/^amount\s*per$/i.test(cleaned)) return "unit";
    if (/^minimum\s+amount$/i.test(cleaned)) return "minimum";
    if (/^sub\s*total$/i.test(cleaned)) return "subtotal";
    if (/^currency$/i.test(cleaned)) return "currency";
    if (/^amount$/i.test(cleaned)) return "amount";
    if (/^(?:description|charge|charges|item|details|fee|fees|name)$/i.test(cleaned)) return "name";
    return "";
  }

  function columnsFromLines(lineList) {
    let cells = [];
    lineList.forEach(function (line) {
      clusterCells(line.parts).forEach(function (cell) {
        const hit = cells.find(function (prev) { return prev.x < cell.end + 2 && cell.x < prev.end + 2; });
        if (!hit) {
          cells.push({ text: cell.text, x: cell.x, end: cell.end, y: cell.y || 0 });
          return;
        }
        if ((cell.y || 0) >= (hit.y || 0)) hit.text = (hit.text + " " + cell.text).replace(/\s+/g, " ").trim();
        else hit.text = (cell.text + " " + hit.text).replace(/\s+/g, " ").trim();
        hit.x = Math.min(hit.x, cell.x);
        hit.end = Math.max(hit.end, cell.end);
        hit.y = Math.min(hit.y || 0, cell.y || 0);
      });
    });
    cells = mergeHeaderPhrases(cells.sort(function (a, b) { return a.x - b.x; }));
    const cols = [];
    const seen = {};
    cells.forEach(function (cell) {
      const key = classifyHeaderCell(cell.text);
      if (!key || seen[key]) return;
      seen[key] = true;
      cols.push({ key: key, x: cell.x, end: cell.end });
    });
    if (!seen.currency || !seen.amount || !seen.unit || !seen.minimum || !seen.subtotal) return null;
    return cols;
  }

  function headerAt(lines, index) {
    if (!window.NG || !NG.parse || !NG.parse.isQuoteTableHeader) return null;
    const first = joinLine(lines[index]);
    if (NG.parse.isQuoteTableHeader(first)) {
      const cols = columnsFromLines([lines[index]]);
      if (cols) return { columns: cols, skip: 1 };
    }
    if (index + 1 < lines.length) {
      const merged = joinLine({ parts: lines[index].parts.concat(lines[index + 1].parts) });
      if (NG.parse.isQuoteTableHeader(merged) && !NG.parse.isQuoteTableHeader(first)) {
        const cols = columnsFromLines([lines[index], lines[index + 1]]);
        if (cols) return { columns: cols, skip: 2 };
      }
    }
    return null;
  }

  function columnBounds(cols) {
    const list = cols.slice().sort(function (a, b) { return a.x - b.x; });
    const map = {};
    list.forEach(function (col, i) {
      map[col.key] = {
        left: i === 0 ? col.x - 8 : (list[i - 1].end + col.x) / 2,
        right: i === list.length - 1 ? 1e9 : (col.end + list[i + 1].x) / 2,
        x: col.x,
      };
    });
    return map;
  }

  function textIn(parts, bound) {
    if (!bound) return "";
    const chosen = (parts || []).filter(function (part) {
      const mid = part.x + Math.max(part.width || 0, 0) / 2;
      return mid >= bound.left && mid < bound.right;
    });
    return joinLine({ parts: chosen });
  }

  function moneyToken(text) {
    const match = /(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+,\d+|\d+(?:\.\d+)?)/.exec(String(text || ""));
    return match ? match[1] : "";
  }

  function readTableRow(line, cols) {
    const bounds = columnBounds(cols);
    const parts = line.parts || [];
    let name = textIn(parts, bounds.name);
    if (!name) {
      const leftMost = cols.reduce(function (min, col) { return Math.min(min, col.x); }, 1e9);
      const chosen = parts.filter(function (part) {
        return part.x + Math.max(part.width || 0, 0) / 2 < leftMost - 6;
      });
      name = joinLine({ parts: chosen });
    }
    const currencyText = textIn(parts, bounds.currency);
    const amountText = textIn(parts, bounds.amount);
    const unitText = textIn(parts, bounds.unit);
    const minText = textIn(parts, bounds.minimum);
    const subText = textIn(parts, bounds.subtotal);
    const currencyHit = NG.parse.findCurrency(currencyText) || NG.parse.findCurrency(amountText);
    const amount = moneyToken(amountText);
    const subtotal = moneyToken(subText);
    const joined = joinLine(line);
    if (NG.parse.isTotalLabelLine(name) || NG.parse.isTotalLabelLine(joined)) return { skip: true };
    if (!amount && !subtotal && !currencyText && name && name.length <= 40 && name.split(/\s+/).length <= 6) {
      return { continuation: name };
    }
    if (!amount) return subtotal ? { skip: true } : null;
    return {
      name: name,
      currency: currencyHit ? currencyHit.code : currencyText,
      amount: amount,
      unit: unitText,
      min: moneyToken(minText),
      subtotal: subtotal,
    };
  }

  function renderLines(lines) {
    const out = [];
    let active = null;
    for (let i = 0; i < lines.length; i += 1) {
      const header = headerAt(lines, i);
      if (header) {
        active = header.columns;
        i += header.skip - 1;
        continue;
      }
      if (active) {
        const row = readTableRow(lines[i], active);
        if (row && row.continuation) {
          if (out.length) out[out.length - 1] += " " + row.continuation;
          continue;
        }
        if (row && row.skip) continue;
        if (row) {
          const formatted = NG.parse.formatQuotedFee(row);
          if (formatted) out.push(formatted);
          continue;
        }
        active = null;
      }
      const text = joinLine(lines[i]);
      if (text) out.push(text);
    }
    return out.join("\n");
  }

  function passwordError() {
    const blocked = new Error("這個 PDF 有密碼保護，無法讀取");
    blocked.code = "password";
    return blocked;
  }

  async function readDocument(data, useCMap) {
    const pdfjsLib = window.pdfjsLib;
    pdfjsLib.GlobalWorkerOptions.workerSrc = "libs/pdf.worker.min.js";
    const options = { data: data };
    if (useCMap) {
      options.cMapUrl = "libs/cmaps/";
      options.cMapPacked = true;
    }
    const task = pdfjsLib.getDocument(options);
    try {
      const pdf = await task.promise;
      const pages = [];
      for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
        const page = await pdf.getPage(pageNo);
        try {
          const content = await page.getTextContent();
          const lines = linesFromItems(content.items, page.getViewport({ scale: 1 }));
          const text = renderLines(lines);
          if (text) pages.push(text);
        } finally {
          page.cleanup();
        }
      }
      return pages.join("\n").trim();
    } finally {
      try {
        const done = task.destroy();
        if (done && done.catch) done.catch(function () {});
      } catch (ignore) {}
    }
  }

  NG.importPdf = {
    renderLines: renderLines,
    fromFile: async function (file) {
      if (!window.pdfjsLib || !window.pdfjsLib.getDocument) {
        throw new Error("pdf.js 沒有載入");
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      try {
        return { text: await readDocument(bytes.slice(0), true) };
      } catch (error) {
        if (isPasswordError(error)) throw passwordError();
        if (!/cmap/i.test(String(error && error.message))) throw error;
      }
      try {
        return { text: await readDocument(bytes.slice(0), false) };
      } catch (error) {
        if (isPasswordError(error)) throw passwordError();
        throw error;
      }
    },
  };
})(window.NG = window.NG || {});
