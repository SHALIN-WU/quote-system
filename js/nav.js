(function (NG) {
  var cache = [];
  var COLLAPSED = "quote-nav-collapsed";

  function collapsedKeys() {
    try {
      var parsed = JSON.parse(sessionStorage.getItem(COLLAPSED) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function saveCollapsed(keys) {
    sessionStorage.setItem(COLLAPSED, JSON.stringify(keys));
  }

  function highlightKey() {
    if (typeof NG.navHighlight === "function") return NG.navHighlight();
    var path = location.pathname;
    if (path.indexOf("/admin/users") >= 0) return "users";
    if (path.indexOf("/admin/menus") >= 0) return "menus";
    return "";
  }

  function safeTarget(target) {
    var value = String(target || "");
    if (value.indexOf("view:") === 0 && /^view:[a-z-]+$/.test(value)) return value;
    if (value.charAt(0) === "/" && value.indexOf("//") !== 0 && value.indexOf("\\") < 0 && value.indexOf("..") < 0) return value;
    if (value.indexOf("https://") === 0) return value;
    return "";
  }

  function closeNav() {
    document.body.classList.remove("nav-open");
    var open = document.getElementById("nav-open");
    if (open) open.setAttribute("aria-expanded", "false");
    var backdrop = document.getElementById("nav-backdrop");
    if (backdrop) backdrop.hidden = true;
  }

  function openNav() {
    document.body.classList.add("nav-open");
    var open = document.getElementById("nav-open");
    if (open) open.setAttribute("aria-expanded", "true");
    var backdrop = document.getElementById("nav-backdrop");
    if (backdrop) backdrop.hidden = false;
  }

  function render() {
    var root = document.getElementById("sidenav-tree");
    if (!root) return;
    var active = highlightKey();
    var closed = collapsedKeys();
    root.replaceChildren();
    if (!cache.length) {
      var empty = document.createElement("p");
      empty.className = "sidenav-empty";
      empty.textContent = "沒有可用的功能";
      root.appendChild(empty);
      return;
    }
    cache.forEach(function (group) {
      var children = group.children || [];
      var hasActive = children.some(function (item) { return item.key === active; });
      var isOpen = hasActive || closed.indexOf(group.key) < 0;
      var section = document.createElement("section");
      section.className = "nav-group" + (isOpen ? " is-open" : "");
      section.dataset.group = group.key;
      var button = document.createElement("button");
      button.type = "button";
      button.className = "nav-group-btn";
      button.setAttribute("aria-expanded", isOpen ? "true" : "false");
      var name = document.createElement("span");
      name.textContent = group.label;
      var chev = document.createElement("span");
      chev.className = "nav-chev";
      chev.setAttribute("aria-hidden", "true");
      chev.textContent = "▸";
      button.append(name, chev);
      button.addEventListener("click", function () {
        var willOpen = !section.classList.contains("is-open");
        section.classList.toggle("is-open", willOpen);
        button.setAttribute("aria-expanded", willOpen ? "true" : "false");
        var keys = collapsedKeys().filter(function (key) { return key !== group.key; });
        if (!willOpen) keys.push(group.key);
        saveCollapsed(keys);
      });
      var list = document.createElement("div");
      list.className = "nav-items";
      children.forEach(function (item) {
        var target = safeTarget(item.target);
        var link = document.createElement("a");
        link.className = "nav-link" + (item.key === active ? " is-active" : "");
        if (item.key === active) link.setAttribute("aria-current", "page");
        var text = document.createElement("span");
        text.textContent = item.label;
        link.appendChild(text);
        if (target.indexOf("view:") === 0) {
          link.href = "/?nav=" + encodeURIComponent(target.slice(5));
          link.addEventListener("click", function (event) {
            if (typeof NG.showView !== "function") return;
            if (location.pathname !== "/" && !location.pathname.endsWith("/index.html")) return;
            event.preventDefault();
            NG.showView(target.slice(5));
          });
        } else if (target.indexOf("https://") === 0) {
          link.href = target;
          link.target = "_blank";
          link.rel = "noopener";
        } else if (target) {
          link.href = target;
        } else {
          link.href = "#";
        }
        link.addEventListener("click", function () { closeNav(); });
        list.appendChild(link);
      });
      section.append(button, list);
      root.appendChild(section);
    });
  }

  function load() {
    return fetch("/api/menus", { cache: "no-store", credentials: "same-origin" })
      .then(function (res) {
        if (res.status === 401) {
          location.href = "/login";
          return null;
        }
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (data) {
        if (!data) return;
        cache = Array.isArray(data.items) ? data.items : [];
        render();
      })
      .catch(function () { /* 選單暫時讀不到時，其他畫面仍可留著 */ });
  }

  NG.refreshNav = render;
  NG.closeNav = closeNav;
  NG.reloadNav = load;

  var opener = document.getElementById("nav-open");
  if (opener) opener.addEventListener("click", openNav);
  var closer = document.getElementById("nav-close");
  if (closer) closer.addEventListener("click", closeNav);
  var backdrop = document.getElementById("nav-backdrop");
  if (backdrop) backdrop.addEventListener("click", closeNav);
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeNav();
  });

  load();
})(window.NG = window.NG || {});
