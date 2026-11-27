(function () {
  var state = { me: null, items: [], roles: [], mode: "create", editing: null };

  var rows = document.getElementById("user-rows");
  var pageStatus = document.getElementById("page-status");
  var dialog = document.getElementById("user-dialog");
  var form = document.getElementById("user-form");
  var formError = document.getElementById("form-error");
  var formHint = document.getElementById("form-hint");

  function setStatus(message, isError) {
    pageStatus.textContent = message || "";
    pageStatus.classList.toggle("error", Boolean(isError));
  }

  function formatTime(value) {
    if (!value) return "—";
    var date = new Date(value);
    if (isNaN(date.getTime())) return "—";
    return date.toLocaleString("zh-TW", { hour12: false });
  }

  function api(path, options) {
    var init = options || {};
    init.credentials = "same-origin";
    init.cache = "no-store";
    if (init.body) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(init.body);
    }
    return fetch(path, init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { status: res.status, data: data };
      });
    });
  }

  function render() {
    rows.replaceChildren();
    if (!state.items.length) {
      var empty = document.createElement("tr");
      var cell = document.createElement("td");
      cell.colSpan = 6;
      cell.textContent = "尚無帳號";
      empty.appendChild(cell);
      rows.appendChild(empty);
      return;
    }
    state.items.forEach(function (user) {
      var tr = document.createElement("tr");
      [user.username, user.displayName, roleLabel(user.role), user.active ? "啟用" : "停用", formatTime(user.lastLoginAt)]
        .forEach(function (value) {
          var td = document.createElement("td");
          td.textContent = value;
          tr.appendChild(td);
        });
      var action = document.createElement("td");
      var button = document.createElement("button");
      button.type = "button";
      button.className = "btn ghost";
      button.textContent = "編輯";
      button.addEventListener("click", function () { openEditor(user); });
      action.appendChild(button);
      tr.appendChild(action);
      rows.appendChild(tr);
    });
  }

  function roleLabel(id) {
    var found = state.roles.filter(function (role) { return role.id === id; })[0];
    return found ? found.label : (id || "");
  }

  function fillRoleSelect(selected) {
    var select = document.getElementById("field-role");
    select.replaceChildren();
    state.roles.forEach(function (role) {
      var option = document.createElement("option");
      option.value = role.id;
      option.textContent = role.label;
      select.appendChild(option);
    });
    if (selected) select.value = selected;
    if (!select.value) {
      var sales = state.roles.filter(function (role) { return role.id === "sales"; })[0];
      select.value = sales ? sales.id : (state.roles[0] ? state.roles[0].id : "");
    }
  }

  function openEditor(user) {
    state.mode = user ? "edit" : "create";
    state.editing = user || null;
    formError.textContent = "";
    document.getElementById("dialog-title").textContent = user ? "編輯帳號" : "新增帳號";
    var username = document.getElementById("field-username");
    username.value = user ? user.username : "";
    username.disabled = Boolean(user);
    document.getElementById("field-display").value = user ? user.displayName : "";
    fillRoleSelect(user ? user.role : "sales");
    document.getElementById("field-active").value = !user || user.active ? "true" : "false";
    document.getElementById("field-password").value = "";
    var self = Boolean(user && state.me && user.id === state.me.id);
    document.getElementById("field-role").disabled = self;
    document.getElementById("field-active").disabled = self;
    document.getElementById("password-caption").textContent = user ? "重設密碼" : "密碼";
    formHint.textContent = self
      ? "不能變更自己的角色，也不能停用自己。密碼留白表示不變更。"
      : (user ? "密碼留白表示不變更。" : "密碼至少 8 碼。");
    dialog.showModal();
  }

  function load() {
    setStatus("讀取中");
    return Promise.all([api("/api/auth/me"), api("/api/users"), api("/api/roles")]).then(function (results) {
      var me = results[0];
      var list = results[1];
      var roles = results[2];
      if (me.status === 401) {
        location.href = "/login";
        return;
      }
      var permissions = me.data && Array.isArray(me.data.permissions) ? me.data.permissions : [];
      if (me.status === 403 || list.status === 403 || permissions.indexOf("users.manage") < 0) {
        setStatus("沒有權限", true);
        return;
      }
      if (list.status !== 200 || !Array.isArray(list.data.items)) {
        setStatus("無法讀取帳號", true);
        return;
      }
      if (roles.status !== 200 || !Array.isArray(roles.data.items)) {
        setStatus("無法讀取角色", true);
        return;
      }
      state.me = me.data;
      state.items = list.data.items;
      state.roles = roles.data.items;
      setStatus("");
      render();
    }).catch(function () {
      setStatus("無法連線，請稍後再試。", true);
    });
  }

  document.getElementById("btn-new").addEventListener("click", function () { openEditor(null); });
  document.getElementById("btn-cancel").addEventListener("click", function () { dialog.close(); });
  document.getElementById("btn-logout").addEventListener("click", function () {
    fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", cache: "no-store" })
      .catch(function () {})
      .then(function () { location.href = "/login"; });
  });
  fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (user) {
      var name = document.getElementById("current-user");
      if (name && user) name.textContent = user.displayName || user.username || "";
    })
    .catch(function () {});

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    formError.textContent = "";
    var password = document.getElementById("field-password").value;
    var save = document.getElementById("btn-save");
    save.disabled = true;
    var request;
    if (state.mode === "create") {
      request = api("/api/users", {
        method: "POST",
        body: {
          username: document.getElementById("field-username").value,
          displayName: document.getElementById("field-display").value,
          role: document.getElementById("field-role").value,
          active: document.getElementById("field-active").value === "true",
          password: password
        }
      });
    } else {
      var body = {
        displayName: document.getElementById("field-display").value,
        role: document.getElementById("field-role").value,
        active: document.getElementById("field-active").value === "true"
      };
      if (password) body.password = password;
      request = api("/api/users/" + encodeURIComponent(state.editing.id), { method: "PATCH", body: body });
    }
    request.then(function (result) {
      document.getElementById("field-password").value = "";
      if (result.status === 401) {
        location.href = "/login";
        return;
      }
      if (result.status !== 200 && result.status !== 201) {
        formError.textContent = result.data && result.data.error ? result.data.error : "無法儲存";
        return;
      }
      dialog.close();
      return load();
    }).catch(function () {
      document.getElementById("field-password").value = "";
      formError.textContent = "無法連線，請稍後再試。";
    }).then(function () {
      save.disabled = false;
    });
  });

  load();
})();
