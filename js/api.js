(function (NG) {
  function failed(status, message) {
    const error = new Error(message || "請稍後再試");
    error.status = status;
    return error;
  }

  async function request(path, options) {
    let response;
    try {
      response = await fetch(path, {
        method: options.method,
        cache: "no-store",
        credentials: "same-origin",
        headers: options.body ? { "Content-Type": "application/json" } : undefined,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (error) {
      throw failed(0, "沒有連上伺服器");
    }
    const data = await response.json().catch(function () { return null; });
    if (!response.ok) {
      const error = failed(response.status, data && data.error ? data.error : "請稍後再試");
      error.data = data;
      throw error;
    }
    return data;
  }

  NG.api = {
    get: function (path) { return request(path, { method: "GET" }); },
    post: function (path, body) { return request(path, { method: "POST", body: body }); },
    put: function (path, body) { return request(path, { method: "PUT", body: body }); },
    del: function (path) { return request(path, { method: "DELETE" }); },
  };
})(window.NG = window.NG || {});
