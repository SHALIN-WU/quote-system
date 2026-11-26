(function (NG) {
  function cargoRows(model) {
    const summary = model.summary;
    const rows = [
      ["運輸方式", model.modeLabel],
      ["毛重", model.weightText || NG.formatMeasure(summary.gross, 3) + " kg"],
      ["件數", summary.pieces],
      ["材積（CBM）", summary.cbm],
      ["才", summary.cai],
      ["材積重（公斤）", summary.volumetric],
      ["計費重量（公斤）", summary.chargeable],
    ];
    if (model.mode === "fcl") {
      rows.push(["櫃型", model.containerSummary || "—"]);
    } else if (model.containerCount !== "" && model.containerCount != null) {
      rows.push(["櫃數", model.containerCount]);
    }
    const sizeText = NG.cargo.dimensionText(model.dimensions, model.dimUnit);
    if (sizeText) rows.push(["尺寸", sizeText]);
    if (model.route) rows.unshift(["航線", model.route]);
    return rows;
  }

  function isCargoDecimal(label) {
    return label === "材積（CBM）" || label === "才" || label === "材積重（公斤）";
  }

  function cargoFacts(model) {
    const summary = model.summary || {};
    return cargoRows(model).filter(function (row) {
      if (row[0] === "件數" && NG.num(summary.pieces) === 0) return false;
      if (row[0] === "材積重（公斤）" && NG.num(summary.volumetric) === 0) return false;
      if (NG.num(summary.cbm) === 0 && (row[0] === "材積（CBM）" || row[0] === "才")) return false;
      return true;
    }).map(function (row) {
      if (row[0] === "計費重量（公斤）") {
        if (model.mode === "air") return [row[0], NG.formatFixed(row[1], 1)];
        return [row[0], NG.formatMeasure(row[1], 3)];
      }
      if (isCargoDecimal(row[0])) return [row[0], NG.formatFixed(row[1], 2)];
      return row;
    });
  }

  function factTable(pairs) {
    let html = "<table class=\"q-facts\"><tbody>";
    for (let i = 0; i < pairs.length; i += 2) {
      const left = pairs[i];
      const right = pairs[i + 1];
      html += "<tr><td class=\"q-k\">" + NG.esc(left[0]) + "</td><td>" + NG.esc(left[1]) + "</td>";
      html += right
        ? "<td class=\"q-k\">" + NG.esc(right[0]) + "</td><td>" + NG.esc(right[1]) + "</td>"
        : "<td></td><td></td>";
      html += "</tr>";
    }
    return html + "</tbody></table>";
  }

  function renderBody(model) {
    function qtyText(line) {
      if (model.mode === "air" && line.unit === "Per KG") return NG.formatFixed(line.qty, 1);
      return NG.formatQty(line.qty);
    }
    const lines = model.lines.map(function (line) {
      return "<tr><td>" + NG.esc(line.name) + "</td><td>" + NG.esc(line.unit) +
        (line.minCharge ? " <span class=\"q-min\">MIN " + NG.esc(NG.formatMoney(line.minCharge)) + "</span>" : "") +
        "</td><td class=\"num\">" + NG.esc(qtyText(line)) +
        "</td><td class=\"num\">" + NG.esc(line.price == null ? "—" : NG.formatMoney(line.price)) +
        "</td><td>" + NG.esc(line.currency) +
        "</td><td class=\"num\">" + NG.esc(line.currency === "TWD" ? NG.formatInteger(line.subtotal) : NG.formatMoney(line.subtotal)) + "</td></tr>";
    }).join("");
    function amountText(currency, value) {
      if (value == null || !isFinite(Number(value))) return "—";
      return currency === "TWD" ? NG.formatInteger(value) : NG.formatMoney(value);
    }
    function caption(currency) {
      return currency === "未指定" ? "未指定　請確認幣別" : currency;
    }
    const totals = model.groups.map(function (group) {
      const title = caption(group.currency);
      const subtotal = group.subtotal != null ? group.subtotal : group.quote;
      if (!group.taxed) {
        return "<div><dt>" + NG.esc(title) + "</dt><dd>" + NG.esc(amountText(group.currency, subtotal)) + "</dd></div>";
      }
      return "<div><dt>" + NG.esc(title) + " 未稅小計</dt><dd>" + NG.esc(amountText(group.currency, subtotal)) + "</dd></div>"
        + "<div><dt>" + NG.esc(title) + " 營業稅 5%</dt><dd>" + NG.esc(amountText(group.currency, group.tax)) + "</dd></div>"
        + "<div><dt>" + NG.esc(title) + " 含稅總計</dt><dd>" + NG.esc(amountText(group.currency, group.total)) + "</dd></div>";
    }).join("");
    return ""
      + "<header class=\"q-head\">"
      + "<div class=\"q-brand\"><img class=\"q-logo\" src=\"images/northgo-logo.png?v=4\" alt=\"\">"
      + "<div><p class=\"q-company\">" + NG.esc(model.companyName) + "</p><h2 class=\"q-title\">報價單</h2></div></div>"
      + "<div class=\"q-id\">"
      + "<p>報價單號　" + NG.esc(model.quoteNumber || "—") + "</p>"
      + "<p>報價日期　" + NG.esc(model.quoteDate || "—") + "</p>"
      + "<p>有效期限　" + NG.esc(model.validUntil || "—") + "</p>"
      + "</div></header>"
      + "<p class=\"q-customer\">客戶：" + NG.esc(model.customerName || "（尚未填寫）") + "</p>"
      + "<section><h3>貨物資料</h3>" + factTable(cargoFacts(model)) + "</section>"
      + "<section class=\"q-fees\"><h3>費用明細</h3>"
      + "<div id=\"quote-edit\" class=\"no-print\"></div>"
      + "<div class=\"q-print-lines\">"
      + (model.lines.length
        ? "<table><thead><tr><th>項目</th><th>計價單位</th><th>數量</th><th>報價單價</th><th>幣別</th><th>報價小計</th></tr></thead><tbody>"
          + lines + "</tbody></table>"
        : "<p>尚未有費用項目。</p>")
      + "</div>"
      + "<div class=\"q-totals\">"
      + (model.groups.length ? "<dl>" + totals + "</dl>" : "<p>—</p>")
      + "</div></section>";
  }

  function cell(value) {
    if (typeof value === "string" && /^[=+\-@]/.test(value)) return "'" + value;
    return value;
  }

  function rememberMoney(marks, rowIndex, values, columns, formats) {
    columns.forEach(function (column) {
      if (typeof values[column] === "number") marks.push({ r: rowIndex, c: column, z: formats && formats[column] });
    });
  }

  function moneyFormat(currency) {
    return currency === "TWD" ? "#,##0" : "#,##0.00";
  }

  function exportXlsx(model) {
    if (!window.XLSX) throw new Error("SheetJS 沒有載入");
    const rows = [
      [cell(model.companyName)],
      ["報價單"],
      ["報價單號", cell(model.quoteNumber || "")],
      ["客戶名稱", cell(model.customerName || "")],
      ["報價日期", model.quoteDate || ""],
      ["有效期限", model.validUntil || ""],
      ["備註", cell(model.remarks || "")],
    ];
    const moneyCells = [];
    const measureCells = [];
    const cargoDecimalCells = [];
    cargoRows(model).forEach(function (row) {
      if (model.mode === "air" && row[0] === "計費重量（公斤）" && typeof row[1] === "number") {
        measureCells.push({ r: rows.length, c: 1 });
      }
      if (isCargoDecimal(row[0]) && typeof row[1] === "number") {
        cargoDecimalCells.push({ r: rows.length, c: 1 });
      }
      rows.push(row);
    });
    rows.push([]);
    rows.push(["項目", "計價單位", "數量", "報價單價", "幣別", "報價小計"]);
    model.lines.forEach(function (line) {
      const values = [
        cell(line.name),
        line.minCharge ? line.unit + " (MIN " + NG.formatMoney(line.minCharge) + ")" : line.unit,
        line.qty == null ? "" : line.qty,
        line.price == null ? "" : line.price,
        line.currency,
        line.subtotal == null ? "" : line.subtotal,
      ];
      rememberMoney(moneyCells, rows.length, values, [3, 5], { 5: moneyFormat(line.currency) });
      if (model.mode === "air" && line.unit === "Per KG" && typeof values[2] === "number") {
        measureCells.push({ r: rows.length, c: 2 });
      }
      rows.push(values);
    });
    rows.push([]);
    rows.push(["幣別", "金額"]);
    model.groups.forEach(function (group) {
      const title = group.currency === "未指定" ? "未指定　請確認幣別" : group.currency;
      const subtotal = group.subtotal != null ? group.subtotal : group.quote;
      const lines = group.taxed
        ? [[title + " 未稅小計", subtotal], [title + " 營業稅 5%", group.tax], [title + " 含稅總計", group.total]]
        : [[title, subtotal]];
      lines.forEach(function (line) {
        rememberMoney(moneyCells, rows.length, line, [1], { 1: moneyFormat(group.currency) });
        rows.push(line);
      });
    });
    const twdRows = [];
    if (model.showTwd) {
      rows.push([]);
      rows.push(["約當台幣合計"]);
      rows.push(["匯率為手動輸入，未連線查詢，僅供參考。"]);
      if (!model.twd.lines.length) {
        rows.push(["沒有可換算的費用。"]);
      } else {
        model.twd.lines.forEach(function (line) {
          rows.push([NG.pricing.twdLineParts(line).text]);
        });
        NG.pricing.twdTotalParts(model).forEach(function (row) {
          if (row.value == null) rows.push([row.text]);
          else {
            rows.push([row.label, row.value]);
            twdRows.push(rows.length - 1);
          }
        });
      }
    }
    const sheet = window.XLSX.utils.aoa_to_sheet(rows);
    moneyCells.forEach(function (pos) {
      const money = sheet[window.XLSX.utils.encode_cell(pos)];
      if (money && typeof money.v === "number") money.z = pos.z || "#,##0.00";
    });
    measureCells.forEach(function (pos) {
      const measure = sheet[window.XLSX.utils.encode_cell(pos)];
      if (measure && typeof measure.v === "number") measure.z = "#,##0.0";
    });
    cargoDecimalCells.forEach(function (pos) {
      const decimalCell = sheet[window.XLSX.utils.encode_cell(pos)];
      if (decimalCell && typeof decimalCell.v === "number") decimalCell.z = "#,##0.00";
    });
    twdRows.forEach(function (index) {
      const cell = sheet[window.XLSX.utils.encode_cell({ r: index, c: 1 })];
      if (cell && typeof cell.v === "number") cell.z = "#,##0";
    });
    sheet["!cols"] = [{ wch: 46 }, { wch: 32 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 16 }];
    const book = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(book, sheet, "報價單");
    const base = String(model.quoteNumber || "報價單").replace(/[\\/:*?"<>|]/g, "-");
    window.XLSX.writeFile(book, base + ".xlsx");
  }

  NG.quoteDoc = {
    renderBody: renderBody,
    exportXlsx: exportXlsx,
  };
})(window.NG = window.NG || {});
