(function () {
  var state = { items: [], catalog: [], mode: "create", editing: null };
  var rows = document.getElementById("role-rows");
  var pageStatus = document.getElementById("page-status");
  var dialog = document.getElementById("role-dialog");
  var form = document.getElementById("role-form");
  var formError = document.getElementById("form-error");
  var formHint = document.getElementById("form-hint");

  function setStatus(message, isError) {
    pageStatus.textContent = message || "";
    pageStatus.classList.toggle("error", Boolean(isError));
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

  function labelOf(key) {
    var found = state.catalog.filter(function (item) { return item.key === key; })[0];
    return found ? found.label : key;
  }

  function summary(role) {
    return (role.permissions || []).map(labelOf).join("、") || "沒有權限";
  }

  function render() {
    rows.replaceChildren();
    if (!state.items.length) {
      var empty = document.createElement("tr");
      var cell = document.createElement("td");
      cell.colSpan = 4;
      cell.textContent = "尚無角色";
      empty.appendChild(cell);
      rows.appendChild(empty);
      return;
    }
    state.items.forEach(function (role) {
      var tr = document.createElement("tr");
      [role.label, role.isSystem ? "內建" : "自訂", summary(role)].forEach(function (value, index) {
        var td = document.createElement("td");
        if (index === 2) td.className = "role-perms";
        td.textContent = value;
        tr.appendChild(td);
      });
      var action = document.createElement("td");
      var edit = document.createElement("button");
      edit.type = "button";
      edit.className = "btn ghost";
      edit.textContent = "編輯";
      edit.addEventListener("click", function () { openEditor(role); });
      action.appendChild(edit);
      if (!role.isSystem) {
        var remove = document.createElement("button");
        remove.type = "button";
        remove.className = "btn ghost";
        remove.textContent = "刪除";
        remove.addEventListener("click", function () { removeRole(role); });
        action.appendChild(remove);
      }
      tr.appendChild(action);
      rows.appendChild(tr);
    });
  }

  function fillPermissions(role) {
    var grid = document.getElementById("perm-grid");
    var locked = Boolean(role && role.id === "admin");
    grid.replaceChildren();
    state.catalog.forEach(function (item) {
      var label = document.createElement("label");
      label.className = "check";
      var input = document.createElement("input");
      input.type = "checkbox";
      input.value = item.key;
      input.checked = locked || Boolean(role && role.permissions && role.permissions.indexOf(item.key) >= 0);
      input.disabled = locked;
      label.append(input, document.createTextNode(" " + item.label));
      grid.appendChild(label);
    });
    formHint.textContent = locked ? "管理員權限不能拿掉。" : "沒勾的功能，這個角色會看到「沒有權限」。";
  }

  function openEditor(role) {
    state.mode = role ? "edit" : "create";
    state.editing = role || null;
    formError.textContent = "";
    document.getElementById("dialog-title").textContent = role ? "編輯角色" : "新增角色";
    document.getElementById("field-label").value = role ? role.label : "";
    fillPermissions(role);
    dialog.showModal();
    document.getElementById("field-label").focus();
  }

  function chosenPermissions() {
    return Array.prototype.map.call(document.querySelectorAll("#perm-grid input"), function (input) {
      return input.checked ? input.value : "";
    }).filter(Boolean);
  }

  function load() {
    setStatus("讀取中");
    return Promise.all([api("/api/auth/me"), api("/api/roles")]).then(function (results) {
      var me = results[0];
      var list = results[1];
      if (me.status === 401) {
        location.href = "/login";
        return;
      }
      var permissions = me.data && Array.isArray(me.data.permissions) ? me.data.permissions : [];
      if (me.status === 403 || list.status === 403 || permissions.indexOf("roles.manage") < 0) {
        setStatus("沒有權限", true);
        return;
      }
      if (list.status !== 200 || !Array.isArray(list.data.items)) {
        setStatus("無法讀取角色", true);
        return;
      }
      state.items = list.data.items;
      state.catalog = Array.isArray(list.data.permissions) ? list.data.permissions : [];
      setStatus("");
      render();
    }).catch(function () {
      setStatus("無法連線，請稍後再試。", true);
    });
  }

  function removeRole(role) {
    if (!window.confirm("刪除「" + role.label + "」？")) return;
    api("/api/roles/" + encodeURIComponent(role.id), { method: "DELETE" }).then(function (result) {
      if (result.status === 401) {
        location.href = "/login";
        return;
      }
      if (result.status !== 200) {
        setStatus(result.data && result.data.error ? result.data.error : "無法刪除", true);
        return;
      }
      setStatus("已刪除角色");
      return load();
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
    var save = document.getElementById("btn-save");
    save.disabled = true;
    var body = {
      label: document.getElementById("field-label").value,
      permissions: chosenPermissions()
    };
    var request = state.mode === "create"
      ? api("/api/roles", { method: "POST", body: body })
      : api("/api/roles/" + encodeURIComponent(state.editing.id), { method: "PATCH", body: body });
    request.then(function (result) {
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
      formError.textContent = "無法連線，請稍後再試。";
    }).then(function () {
      save.disabled = false;
    });
  });

  load();
})();
