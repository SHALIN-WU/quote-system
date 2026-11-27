(function () {
  var state = { items: [], roles: [], mode: "" };
  var tree = document.getElementById("menu-tree");
  var pageStatus = document.getElementById("page-status");
  var dialog = document.getElementById("menu-dialog");
  var form = document.getElementById("menu-form");
  var formError = document.getElementById("form-error");

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

  function groups() {
    return state.items || [];
  }

  function button(label, attrs, disabled) {
    var el = document.createElement("button");
    el.type = "button";
    el.className = "btn ghost";
    el.textContent = label;
    Object.keys(attrs).forEach(function (key) { el.dataset[key] = attrs[key]; });
    if (disabled) el.disabled = true;
    return el;
  }

  function renderRoles(item) {
    if (item.isSystem) {
      var note = document.createElement("p");
      note.className = "hint";
      note.textContent = "依帳號權限顯示";
      return note;
    }
    var wrap = document.createElement("div");
    wrap.className = "menu-roles";
    state.roles.forEach(function (role) {
      var label = document.createElement("label");
      label.className = "check";
      var input = document.createElement("input");
      input.type = "checkbox";
      input.dataset.roleToggle = role.id;
      input.dataset.id = item.id;
      input.checked = item.roles.indexOf(role.id) >= 0;
      if (item.lockAdmin && role.id === "admin") input.disabled = true;
      label.append(input, document.createTextNode(" " + role.label));
      wrap.appendChild(label);
    });
    return wrap;
  }

  function renderRow(item, siblings, index, nested) {
    var row = document.createElement("div");
    row.className = "menu-row" + (nested ? " is-child" : "");
    var title = document.createElement("div");
    title.className = "menu-title";
    var name = document.createElement("strong");
    name.textContent = item.label;
    title.appendChild(name);
    if (!item.visible) {
      var hidden = document.createElement("span");
      hidden.className = "hint";
      hidden.textContent = "已隱藏";
      title.appendChild(hidden);
    }
    if (item.isSystem) {
      var badge = document.createElement("span");
      badge.className = "hint";
      badge.textContent = "內建";
      title.appendChild(badge);
    }
    var actions = document.createElement("div");
    actions.className = "row-actions";
    actions.append(
      button("上移", { move: "up", id: item.id, parent: item.parentId || "" }, index === 0),
      button("下移", { move: "down", id: item.id, parent: item.parentId || "" }, index === siblings.length - 1),
      button("改名", { rename: "1", id: item.id }),
      button(item.visible ? "隱藏" : "顯示", { hide: "1", id: item.id }, item.lockAdmin && item.visible),
    );
    if (!item.isSystem) actions.appendChild(button("刪除", { remove: "1", id: item.id }));
    row.append(title, actions);
    if (item.kind === "item") row.appendChild(renderRoles(item));
    return row;
  }

  function render() {
    tree.replaceChildren();
    groups().forEach(function (group, index, list) {
      var block = document.createElement("section");
      block.className = "menu-block";
      block.appendChild(renderRow(group, list, index, false));
      (group.children || []).forEach(function (item, childIndex, children) {
        block.appendChild(renderRow(item, children, childIndex, true));
      });
      tree.appendChild(block);
    });
  }

  function findItem(id) {
    var found = null;
    groups().forEach(function (group) {
      if (group.id === id) found = group;
      (group.children || []).forEach(function (item) {
        if (item.id === id) found = item;
      });
    });
    return found;
  }

  function applyItems(result) {
    if (result.status === 401) {
      location.href = "/login";
      return false;
    }
    if (result.data && result.data.items) {
      state.items = result.data.items;
      render();
      if (window.NG && typeof NG.reloadNav === "function") NG.reloadNav();
    }
    if (result.status >= 400) {
      setStatus(result.data && result.data.error ? result.data.error : "沒有完成", true);
      return false;
    }
    setStatus("");
    return true;
  }

  function fillRoleField() {
    var field = document.getElementById("role-field");
    var legend = field.querySelector("legend");
    field.replaceChildren(legend);
    state.roles.forEach(function (role) {
      var label = document.createElement("label");
      label.className = "check";
      var input = document.createElement("input");
      input.type = "checkbox";
      input.name = "role";
      input.value = role.id;
      input.checked = role.id === "admin";
      label.append(input, document.createTextNode(" " + role.label));
      field.appendChild(label);
    });
  }

  function load() {
    return Promise.all([api("/api/menus/manage"), api("/api/roles")]).then(function (results) {
      var roles = results[1];
      if (roles.status === 200 && Array.isArray(roles.data.items)) {
        state.roles = roles.data.items;
        fillRoleField();
      }
      if (!applyItems(results[0]) && results[0].status === 403) setStatus("沒有權限", true);
      if (roles.status === 403) setStatus("沒有權限", true);
      else if (roles.status !== 200) setStatus("無法讀取角色", true);
    }).catch(function () {
      setStatus("無法連線，請稍後再試。", true);
    });
  }

  function move(id, parentId, direction) {
    var siblings = parentId
      ? ((findItem(parentId) || {}).children || [])
      : groups();
    var ids = siblings.map(function (item) { return item.id; });
    var index = ids.indexOf(id);
    var next = index + direction;
    if (index < 0 || next < 0 || next >= ids.length) return;
    var swap = ids[index];
    ids[index] = ids[next];
    ids[next] = swap;
    api("/api/menus/order", { method: "PUT", body: { parentId: parentId || null, ids: ids } })
      .then(applyItems)
      .catch(function () { setStatus("無法連線，請稍後再試。", true); });
  }

  function openDialog(mode) {
    state.mode = mode;
    formError.textContent = "";
    document.getElementById("dialog-title").textContent = mode === "group" ? "新增群組" : mode === "item" ? "新增項目" : "改名";
    document.getElementById("field-label").value = mode === "rename" ? (findItem(state.renameId) || {}).label || "" : "";
    document.getElementById("parent-field").hidden = mode !== "item";
    document.getElementById("href-field").hidden = mode !== "item";
    document.getElementById("role-field").hidden = mode !== "item";
    document.getElementById("field-href").value = "";
    var parent = document.getElementById("field-parent");
    parent.replaceChildren();
    groups().forEach(function (group) {
      var option = document.createElement("option");
      option.value = group.id;
      option.textContent = group.label;
      parent.appendChild(option);
    });
    fillRoleField();
    dialog.showModal();
    document.getElementById("field-label").focus();
  }

  tree.addEventListener("click", function (event) {
    var button = event.target.closest("button");
    if (!button) return;
    var id = button.dataset.id;
    if (button.dataset.move) {
      move(id, button.dataset.parent, button.dataset.move === "up" ? -1 : 1);
      return;
    }
    if (button.dataset.rename) {
      state.renameId = id;
      openDialog("rename");
      return;
    }
    if (button.dataset.hide) {
      var item = findItem(id);
      if (!item) return;
      api("/api/menus/" + encodeURIComponent(id), {
        method: "PATCH",
        body: { visible: !item.visible },
      }).then(applyItems).catch(function () { setStatus("無法連線，請稍後再試。", true); });
      return;
    }
    if (button.dataset.remove) {
      var target = findItem(id);
      if (!target) return;
      if (!window.confirm("刪除「" + target.label + "」？")) return;
      api("/api/menus/" + encodeURIComponent(id), { method: "DELETE" })
        .then(applyItems)
        .catch(function () { setStatus("無法連線，請稍後再試。", true); });
    }
  });

  tree.addEventListener("change", function (event) {
    var input = event.target;
    if (!input.dataset || !input.dataset.roleToggle) return;
    var item = findItem(input.dataset.id);
    if (!item) return;
    var roles = state.roles.map(function (role) { return role.id; }).filter(function (role) {
      if (role === input.dataset.roleToggle) return input.checked;
      return item.roles.indexOf(role) >= 0;
    });
    api("/api/menus/" + encodeURIComponent(item.id), { method: "PATCH", body: { roles: roles } })
      .then(function (result) {
        if (!applyItems(result)) load();
      })
      .catch(function () { setStatus("無法連線，請稍後再試。", true); });
  });

  document.getElementById("btn-add-group").addEventListener("click", function () { openDialog("group"); });
  document.getElementById("btn-add-item").addEventListener("click", function () { openDialog("item"); });
  document.getElementById("btn-cancel").addEventListener("click", function () { dialog.close(); });
  document.getElementById("btn-logout").addEventListener("click", function () {
    fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", cache: "no-store" })
      .catch(function () {})
      .then(function () { location.href = "/login"; });
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    formError.textContent = "";
    var label = document.getElementById("field-label").value;
    var request;
    if (state.mode === "rename") {
      request = api("/api/menus/" + encodeURIComponent(state.renameId), { method: "PATCH", body: { label: label } });
    } else if (state.mode === "group") {
      request = api("/api/menus", { method: "POST", body: { kind: "group", label: label } });
    } else {
      var roles = Array.prototype.map.call(form.querySelectorAll("input[name=role]:checked"), function (input) {
        return input.value;
      });
      request = api("/api/menus", {
        method: "POST",
        body: {
          kind: "item",
          label: label,
          parentId: document.getElementById("field-parent").value,
          href: document.getElementById("field-href").value,
          roles: roles,
        },
      });
    }
    var save = document.getElementById("btn-save");
    save.disabled = true;
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

  fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (user) {
      var name = document.getElementById("current-user");
      if (name && user) name.textContent = user.displayName || user.username || "";
    })
    .catch(function () {});

  load();
})();
