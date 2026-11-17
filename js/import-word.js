(function (NG) {
  NG.importWord = {
    fromFile: async function (file, options) {
      if (!window.mammoth || !window.mammoth.extractRawText) {
        throw new Error("mammoth.js 沒有載入");
      }
      const arrayBuffer = await file.arrayBuffer();
      const result = await window.mammoth.extractRawText({ arrayBuffer: arrayBuffer });
      const text = result.value || "";
      return {
        text: text,
        items: NG.parse.parseCostText(text, options),
        messages: (result.messages || []).map(function (message) {
          return message.message || String(message);
        }),
      };
    },
  };
})(window.NG = window.NG || {});
