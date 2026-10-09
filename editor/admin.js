/* CV Editor. Publications live in data/pubs.json on GitHub (public).
   The CV text and the GitHub settings live in your private Backprompter user data. */
(function () {
  "use strict";
  const K = window.CVKit;
  const esc = K.esc;
  const FILES = { pubs: "data/pubs.json" };
  const DOC = { cv: "cv", github: "github" };
  const A = window.CVAuth;
  const LS_DRAFT = "cvkit.draft";
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const S = {
    data: { pubs: null, cv: null },
    orig: { pubs: "", cv: "" },
    sha: { pubs: null, cv: null },
    gh: null,
    tab: "pubs",
    selId: null,
    filter: { q: "", cat: "" },
    imported: [],
    folded: new Set(),
    cvMissing: false,
  };

  const ser = (o) => JSON.stringify(o, null, 2) + "\n";
  const isDirty = (k) => ser(S.data[k]) !== S.orig[k];
  const anyDirty = () => isDirty("pubs") || isDirty("cv");

  /* ---------- storage ---------- */
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }


  /* ---------- status ---------- */
  function setStatus(text, cls) {
    const el = $("#status");
    el.textContent = text; el.className = "status" + (cls ? " " + cls : "");
  }
  function refreshStatus() {
    const dirty = anyDirty();
    const blocked = isDirty("pubs") && !S.gh;
    $("#saveBtn").disabled = !dirty;
    if (dirty) {
      const parts = [];
      if (isDirty("pubs")) parts.push("publications");
      if (isDirty("cv")) parts.push("CV");
      setStatus("Unsaved changes: " + parts.join(", ") + (blocked ? ". Connect GitHub in Settings to save publications." : ""), "dirty");
    } else if (S.cvMissing) {
      setStatus("No CV is stored yet. Import cv.json in Import and export.", "dirty");
    } else if (S.gh) {
      setStatus("Signed in. Publications save to " + S.gh.owner + "/" + S.gh.repo + ". No unsaved changes.");
    } else {
      setStatus("Signed in. Connect GitHub in Settings to save publications.");
    }
  }
  let draftTimer = null;
  function changed() {
    refreshStatus();
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      if (anyDirty()) lsSet(LS_DRAFT, { at: Date.now(), pubs: S.data.pubs, cv: S.data.cv });
      else lsSet(LS_DRAFT, null);
    }, 300);
  }
  function toast(msg) {
    const t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
  }

  /* ---------- load / save ---------- */
  function emptyCV() {
    return { profile: { name: "", title: "", affiliation: "", email: "", homepage: "", orcid: "" },
      settings: { pubGroupBy: "category", pubOrder: "newest", numbering: "per-group" },
      sections: [{ id: "publications", title: "Publications", kind: "publications", body: "" }] };
  }

  async function load() {
    setStatus("Loading…");
    const [gh, cv] = await Promise.all([A.loadDoc(DOC.github), A.loadDoc(DOC.cv)]);
    S.gh = gh && gh.token && gh.owner && gh.repo ? Object.assign({ branch: "main" }, gh) : null;
    let pubsText = null;
    if (S.gh) {
      try {
        const p = await K.GitHub(S.gh).get(FILES.pubs);
        S.sha.pubs = p.sha; pubsText = p.text;
      } catch (e) {
        S.gh = null;
        toast("Could not read from GitHub. Check Settings.");
        console.error(e);
      }
    }
    if (pubsText == null) pubsText = ser(await K.loadJSON(FILES.pubs));
    S.data.pubs = JSON.parse(pubsText); S.orig.pubs = ser(S.data.pubs);
    S.cvMissing = !cv;
    S.data.cv = cv || emptyCV(); S.orig.cv = ser(S.data.cv);

    const draft = lsGet(LS_DRAFT);
    if (draft && (ser(draft.pubs) !== S.orig.pubs || ser(draft.cv) !== S.orig.cv)) {
      const when = new Date(draft.at).toLocaleString();
      if (window.confirm("You have unsaved changes from " + when + ". Restore them?")) {
        S.data.pubs = draft.pubs; S.data.cv = draft.cv;
      } else lsSet(LS_DRAFT, null);
    }
    normalize();
    refreshStatus();
    render();
  }

  function normalize() {
    const d = S.data.pubs;
    d.categories = d.categories || [];
    d.types = d.types || ["conference", "journal", "workshop", "chapter", "preprint", "thesis"];
    d.statuses = d.statuses || ["published", "accepted", "under review", "preprint"];
    d.owner = d.owner || { name: "", highlight: [] };
    d.publications = d.publications || [];
    const c = S.data.cv;
    c.profile = c.profile || {};
    c.settings = Object.assign({ pubGroupBy: "category", pubOrder: "newest", numbering: "per-group" }, c.settings || {});
    c.sections = c.sections || [];
    if (!c.sections.some((s) => s.kind === "publications")) c.sections.push({ id: "publications", title: "Publications", kind: "publications", body: "" });
  }

  async function save() {
    if (isDirty("pubs") && !S.gh) { switchTab("settings"); toast("Connect GitHub to save publications."); return; }
    $("#saveBtn").disabled = true;
    setStatus("Saving…");
    const done = [];
    try {
      if (isDirty("cv")) {
        const text = ser(S.data.cv);
        await A.saveDoc(DOC.cv, S.data.cv);
        S.orig.cv = text; S.cvMissing = false; done.push("CV");
      }
      if (isDirty("pubs")) {
        const text = ser(S.data.pubs);
        const r = await K.GitHub(S.gh).put(FILES.pubs, text, S.sha.pubs, "Update publications");
        S.sha.pubs = r.sha; S.orig.pubs = text; done.push("publications");
      }
      if (!anyDirty()) lsSet(LS_DRAFT, null);
      refreshStatus();
      setStatus("Saved " + done.join(" and ") + (done.includes("publications") ? ". Your website updates in about one minute." : "."), "ok");
      toast("Saved.");
    } catch (e) {
      const conflict = /409|does not match/.test(e.message);
      setStatus((done.length ? "Saved " + done.join(" and ") + ", but " : "") +
        (conflict ? "publications changed on GitHub. Your edits are kept as a draft. Reload the page to merge." : "save failed: " + e.message), "err");
      $("#saveBtn").disabled = false;
    }
  }

  /* ---------- helpers ---------- */
  function slugId(p) {
    const first = ((p.authors && p.authors[0]) || "anon").split(/\s+/).pop().toLowerCase().replace(/[^a-z]/g, "") || "anon";
    const stop = new Set(["a", "an", "the", "on", "of", "for", "to", "in", "and", "with"]);
    const word = (String(p.title || "").toLowerCase().match(/[a-z0-9]+/g) || []).find((w) => !stop.has(w)) || "paper";
    let id = first + (p.year || "") + word, n = 1;
    const taken = new Set(S.data.pubs.publications.filter((x) => x !== p).map((x) => x.id));
    while (taken.has(id)) id = first + (p.year || "") + word + String.fromCharCode(97 + n++);
    return id;
  }
  function optionList(values, current, labels) {
    return values.map((v) => '<option value="' + esc(v) + '"' + (v === current ? " selected" : "") + ">" + esc(labels ? labels[v] || v : v) + "</option>").join("");
  }
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain" }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------- tabs ---------- */
  function switchTab(t) {
    S.tab = t;
    $$(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
    render();
  }
  function render() {
    const m = $("#main");
    ({ pubs: renderPubs, cv: renderCV, themes: renderThemes, io: renderIO, settings: renderSettings })[S.tab](m);
  }

  /* ---------- publications tab ---------- */
  function filteredPubs() {
    const q = S.filter.q.toLowerCase();
    const list = S.data.pubs.publications.filter((p) => {
      if (S.filter.cat === "__none") { if (p.category) return false; }
      else if (S.filter.cat && p.category !== S.filter.cat) return false;
      if (!q) return true;
      const hay = [p.title, p.venue, (p.authors || []).join(" "), (p.keywords || []).join(" "), p.year, p.award, p.status].join(" ").toLowerCase();
      return q.split(/\s+/).every((w) => hay.includes(w));
    });
    return K.sortPubs(list, "newest");
  }

  function renderPubs(m) {
    const d = S.data.pubs;
    m.innerHTML =
      '<div class="pubgrid"><section class="panel">' +
      '<div class="listhead"><input class="inp" id="pq" type="search" placeholder="Search title, author, venue, keyword" value="' + esc(S.filter.q) + '">' +
      '<select class="inp" id="pcat"><option value="">All themes</option>' + optionList(d.categories, S.filter.cat) + '<option value="__none"' + (S.filter.cat === "__none" ? " selected" : "") + ">No theme</option></select>" +
      '<button class="btn primary" id="newPub" type="button">New publication</button></div>' +
      '<p class="hint" id="pcount"></p>' +
      '<div class="tablewrap"><table class="ptable"><thead><tr><th>Year</th><th>Publication</th><th>Theme</th></tr></thead><tbody id="ptbody"></tbody></table></div>' +
      '</section><aside class="panel editor" id="editor"></aside></div>';
    $("#pq").oninput = (e) => { S.filter.q = e.target.value.trim(); renderList(); };
    $("#pcat").onchange = (e) => { S.filter.cat = e.target.value; renderList(); };
    $("#newPub").onclick = newPub;
    renderList();
    renderEditor();
  }

  function rowHTML(p) {
    const pills = [];
    if (p.award) pills.push('<span class="pill gold">' + esc(p.award) + "</span>");
    if (p.status && p.status !== "published" && p.status !== p.type) pills.push('<span class="pill warn">' + esc(p.status) + "</span>");
    pills.push('<span class="pill">' + esc(p.type) + "</span>");
    return '<tr data-id="' + esc(p.id) + '"' + (p.id === S.selId ? ' class="sel"' : "") + '><td class="y">' + esc(p.year) + "</td>" +
      '<td><div class="t">' + esc(p.title || "(untitled)") + '</div><div class="a">' + esc((p.authors || []).join(", ")) + "</div><div>" + pills.join("") + "</div></td>" +
      '<td class="c">' + esc(p.category || "—") + "</td></tr>";
  }

  function renderList() {
    const list = filteredPubs();
    const tb = $("#ptbody"); if (!tb) return;
    tb.innerHTML = list.map(rowHTML).join("");
    $("#pcount").textContent = list.length + " of " + S.data.pubs.publications.length + " publications. Select a row to edit it.";
    $$("tr[data-id]", tb).forEach((tr) => (tr.onclick = () => { S.selId = tr.dataset.id; renderList(); renderEditor(); }));
  }

  function selected() { return S.data.pubs.publications.find((p) => p.id === S.selId) || null; }

  function newPub() {
    const d = S.data.pubs;
    const p = { id: "", title: "", authors: (d.owner.highlight || []).slice(0, 1), venue: "", year: new Date().getFullYear(), type: "conference", status: "accepted",
      category: S.filter.cat && S.filter.cat !== "__none" ? S.filter.cat : d.categories[0] || "", keywords: [], award: "", url: "", note: "" };
    p.id = "new" + Date.now().toString(36);
    d.publications.unshift(p);
    S.selId = p.id; S.filter.q = "";
    changed(); renderPubs($("#main"));
    const t = $("#e-title"); if (t) t.focus();
  }

  function renderEditor() {
    const box = $("#editor"); if (!box) return;
    const p = selected();
    if (!p) { box.innerHTML = '<div class="emptyed">Select a publication to edit it, or add a new one.</div>'; return; }
    const d = S.data.pubs;
    box.innerHTML =
      '<h2>Edit publication</h2><p class="hint">Changes are kept in this browser until you save to GitHub.</p>' +
      '<div class="grid2">' +
      '<label class="f span2">Title<input id="e-title" value="' + esc(p.title) + '"></label>' +
      '<label class="f span2">Authors (one per line; use "et al." as the last line for long lists)<textarea id="e-authors" rows="4">' + esc((p.authors || []).join("\n")) + "</textarea></label>" +
      '<label class="f span2">Venue<input id="e-venue" value="' + esc(p.venue) + '" placeholder="Conference, journal, or arXiv:xxxx.xxxxx"></label>' +
      '<label class="f">Year<input id="e-year" type="number" min="1990" max="2100" value="' + esc(p.year) + '"></label>' +
      '<label class="f">Type<select id="e-type">' + optionList(d.types, p.type) + "</select></label>" +
      '<label class="f">Status<select id="e-status">' + optionList(d.statuses, p.status) + "</select></label>" +
      '<label class="f">Theme<select id="e-cat"><option value="">(none)</option>' + optionList(d.categories, p.category) + "</select></label>" +
      '<label class="f span2">Keywords<div class="kwbox" id="e-kw"></div></label>' +
      '<label class="f span2">Award or highlight<input id="e-award" value="' + esc(p.award) + '" placeholder="Best Paper Award"></label>' +
      '<label class="f span2">Link<input id="e-url" type="url" value="' + esc(p.url) + '" placeholder="https://"></label>' +
      '<label class="f span2">Note (shown after the entry)<input id="e-note" value="' + esc(p.note) + '"></label>' +
      '<label class="f span2">BibTeX key<input id="e-id" value="' + esc(p.id) + '"></label>' +
      "</div>" +
      '<div class="preview-line" id="e-prev"></div>' +
      '<div class="actions"><div class="row"><button class="btn" id="e-dup" type="button">Duplicate</button>' +
      '<button class="btn danger" id="e-del" type="button">Delete</button></div>' +
      '<button class="btn" id="e-close" type="button">Close</button></div>' +
      '<datalist id="kwlist">' + K.allKeywords(d.publications).map(([k]) => '<option value="' + esc(k) + '">').join("") + "</datalist>";

    const upd = () => { renderPreview(p); changed(); const tr = $('tr[data-id="' + CSS.escape(p.id) + '"]'); if (tr) tr.outerHTML = rowHTML(p); bindRows(); };
    const bind = (id, fn) => { $(id).addEventListener("input", (e) => { fn(e.target.value); upd(); }); };
    bind("#e-title", (v) => (p.title = v));
    bind("#e-authors", (v) => (p.authors = v.split("\n").map((s) => s.trim()).filter(Boolean)));
    bind("#e-venue", (v) => (p.venue = v));
    bind("#e-year", (v) => (p.year = parseInt(v, 10) || p.year));
    bind("#e-award", (v) => (p.award = v.trim()));
    bind("#e-url", (v) => (p.url = v.trim()));
    bind("#e-note", (v) => (p.note = v));
    ["#e-type", "#e-status", "#e-cat"].forEach((id) => $(id).addEventListener("change", (e) => {
      p[{ "#e-type": "type", "#e-status": "status", "#e-cat": "category" }[id]] = e.target.value; upd();
    }));
    $("#e-title").addEventListener("blur", () => {
      if (/^new[a-z0-9]+$/.test(p.id) && p.title) { const old = p.id; p.id = slugId(p); S.selId = p.id; $("#e-id").value = p.id; const tr = $('tr[data-id="' + CSS.escape(old) + '"]'); if (tr) tr.outerHTML = rowHTML(p); bindRows(); changed(); }
    });
    $("#e-id").addEventListener("change", (e) => {
      const v = e.target.value.trim().replace(/\s+/g, "");
      if (!v || S.data.pubs.publications.some((x) => x !== p && x.id === v)) { toast("That key is empty or already in use."); e.target.value = p.id; return; }
      p.id = v; S.selId = v; changed(); renderList();
    });
    $("#e-dup").onclick = () => {
      const c = JSON.parse(JSON.stringify(p)); c.title = p.title + " (copy)"; c.id = slugId(c);
      const list = S.data.pubs.publications; list.splice(list.indexOf(p) + 1, 0, c);
      S.selId = c.id; changed(); renderList(); renderEditor();
    };
    $("#e-del").onclick = () => {
      if (!window.confirm('Delete "' + (p.title || "this entry") + '"?')) return;
      const list = S.data.pubs.publications; list.splice(list.indexOf(p), 1);
      S.selId = null; changed(); renderList(); renderEditor();
    };
    $("#e-close").onclick = () => { S.selId = null; renderList(); renderEditor(); };
    renderKw(p);
    renderPreview(p);
  }

  function bindRows() { $$("#ptbody tr[data-id]").forEach((tr) => (tr.onclick = () => { S.selId = tr.dataset.id; renderList(); renderEditor(); })); }

  function renderPreview(p) {
    const el = $("#e-prev"); if (el) el.innerHTML = K.fmtPub(p, S.data.pubs.owner.highlight, "html");
  }

  function renderKw(p) {
    const box = $("#e-kw");
    box.innerHTML = (p.keywords || []).map((k, i) => '<span class="k">' + esc(k) + '<button type="button" aria-label="Remove ' + esc(k) + '" data-i="' + i + '">×</button></span>').join("") +
      '<input id="e-kwin" list="kwlist" placeholder="Add keyword, press Enter">';
    $$("button[data-i]", box).forEach((b) => (b.onclick = () => { p.keywords.splice(+b.dataset.i, 1); changed(); renderKw(p); $("#e-kwin").focus(); }));
    const inp = $("#e-kwin");
    const add = () => {
      const vals = inp.value.split(",").map((s) => s.trim()).filter(Boolean);
      if (!vals.length) return;
      p.keywords = p.keywords || [];
      vals.forEach((v) => {
        const existing = K.allKeywords(S.data.pubs.publications).map(([k]) => k).find((k) => k.toLowerCase() === v.toLowerCase());
        const name = existing || v;
        if (!p.keywords.includes(name)) p.keywords.push(name);
      });
      changed(); renderKw(p); $("#e-kwin").focus();
    };
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
      else if (e.key === "Backspace" && !inp.value && p.keywords.length) { p.keywords.pop(); changed(); renderKw(p); $("#e-kwin").focus(); }
    });
    inp.addEventListener("change", () => { if (inp.value && !/,/.test(inp.value)) add(); });
  }

  /* ---------- CV sections tab ---------- */
  function renderCV(m) {
    const c = S.data.cv, pr = c.profile;
    const f = (key, label, ph) => '<label class="f">' + label + '<input data-pr="' + key + '" value="' + esc(pr[key] || "") + '" placeholder="' + esc(ph || "") + '"></label>';
    m.innerHTML =
      '<section class="panel"><h2>Header</h2><p class="hint">The name and contact line at the top of the CV.</p><div class="grid3">' +
      f("name", "Name") + f("title", "Title") + f("affiliation", "Affiliation") + f("email", "Email", "name@northeastern.edu") + f("homepage", "Homepage") + f("orcid", "ORCID") +
      "</div></section>" +
      '<section class="panel"><div class="row" style="justify-content:space-between"><div><h2>Sections</h2><p class="hint">Write each section in Markdown. The Publications section is built from your publication list.</p></div>' +
      '<button class="btn" id="addSec" type="button">Add section</button></div><div id="secs"></div></section>';
    $$("input[data-pr]", m).forEach((i) => i.addEventListener("input", () => { pr[i.dataset.pr] = i.value; changed(); }));
    $("#addSec").onclick = () => {
      c.sections.push({ id: "sec" + Date.now().toString(36), title: "New section", kind: "markdown", body: "- " });
      changed(); renderSecs(); const all = $$(".sec input.title"); all[all.length - 1].select();
    };
    renderSecs();
  }

  function renderSecs() {
    const c = S.data.cv, box = $("#secs");
    box.innerHTML = c.sections.map((s, i) => {
      const isPub = s.kind === "publications";
      return '<div class="sec' + (s.hidden ? " hiddensec" : "") + (S.folded.has(s.id) ? " collapsed" : "") + '" data-i="' + i + '">' +
        '<div class="sec-h"><input class="title" value="' + esc(s.title) + '" aria-label="Section title">' +
        '<label class="row" style="font-size:13px;gap:4px"><input type="checkbox" class="hide"' + (s.hidden ? " checked" : "") + "> Hide</label>" +
        '<button class="btn mini up" type="button" ' + (i === 0 ? "disabled" : "") + ' aria-label="Move up">↑</button>' +
        '<button class="btn mini down" type="button" ' + (i === c.sections.length - 1 ? "disabled" : "") + ' aria-label="Move down">↓</button>' +
        '<button class="btn mini tog" type="button">' + (S.folded.has(s.id) ? "Open" : "Fold") + "</button>" +
        (isPub ? "" : '<button class="btn mini danger del" type="button">Delete</button>') + "</div>" +
        '<div class="sec-b"><textarea class="inp body" spellcheck="true" placeholder="' + (isPub ? "Optional intro line above the list" : "Markdown") + '">' + esc(s.body || "") + "</textarea>" +
        '<div class="pv"></div></div></div>';
    }).join("");
    $$(".sec", box).forEach((el) => {
      const i = +el.dataset.i, s = c.sections[i];
      const pv = $(".pv", el);
      const draw = () => {
        if (s.kind === "publications") {
          pv.innerHTML = (s.body ? window.marked.parse(s.body) : "") + '<p class="hint">Built from ' + S.data.pubs.publications.length +
            " publications, grouped by " + esc(S.data.cv.settings.pubGroupBy) + '. Change grouping in Settings. Use "Preview CV" to see the full list.</p>';
        } else pv.innerHTML = window.marked.parse(s.body || "");
      };
      draw();
      $(".title", el).addEventListener("input", (e) => { s.title = e.target.value; changed(); });
      $(".body", el).addEventListener("input", (e) => { s.body = e.target.value; draw(); changed(); });
      $(".hide", el).onchange = (e) => { s.hidden = e.target.checked || undefined; if (!s.hidden) delete s.hidden; changed(); renderSecs(); };
      $(".up", el).onclick = () => { c.sections.splice(i - 1, 0, c.sections.splice(i, 1)[0]); changed(); renderSecs(); };
      $(".down", el).onclick = () => { c.sections.splice(i + 1, 0, c.sections.splice(i, 1)[0]); changed(); renderSecs(); };
      $(".tog", el).onclick = () => { if (S.folded.has(s.id)) S.folded.delete(s.id); else S.folded.add(s.id); renderSecs(); };
      const del = $(".del", el);
      if (del) del.onclick = () => { if (window.confirm('Delete the section "' + s.title + '"?')) { c.sections.splice(i, 1); changed(); renderSecs(); } };
    });
  }

  /* ---------- themes and keywords tab ---------- */
  function renderThemes(m) {
    const d = S.data.pubs;
    const counts = new Map(); d.publications.forEach((p) => counts.set(p.category || "", (counts.get(p.category || "") || 0) + 1));
    const kws = K.allKeywords(d.publications);
    m.innerHTML =
      '<div class="grid2" style="align-items:start">' +
      '<section class="panel"><h2>Themes</h2><p class="hint">Themes group publications on your website and in the CV. The order here is the order in the CV. Renaming a theme updates every publication in it.</p>' +
      '<table class="ltable"><tbody>' + d.categories.map((c, i) =>
        '<tr data-i="' + i + '"><td><input class="inp nm" value="' + esc(c) + '"></td><td class="n">' + (counts.get(c) || 0) + "</td>" +
        '<td class="act"><button class="btn mini up" type="button" ' + (i === 0 ? "disabled" : "") + ' aria-label="Move up">↑</button> ' +
        '<button class="btn mini down" type="button" ' + (i === d.categories.length - 1 ? "disabled" : "") + ' aria-label="Move down">↓</button> ' +
        '<button class="btn mini danger del" type="button">Delete</button></td></tr>').join("") +
      "</tbody></table>" +
      (counts.get("") ? '<p class="hint" style="margin-top:10px">' + counts.get("") + " publications have no theme.</p>" : "") +
      '<div class="row" style="margin-top:12px"><input class="inp" id="newTheme" placeholder="New theme name" style="flex:1"><button class="btn" id="addTheme" type="button">Add theme</button></div></section>' +
      '<section class="panel"><h2>Keywords</h2><p class="hint">Rename a keyword to fix it everywhere. Rename it to an existing keyword to merge the two.</p>' +
      '<table class="ltable"><tbody>' + kws.map(([k, n]) =>
        '<tr data-k="' + esc(k) + '"><td><input class="inp nm" value="' + esc(k) + '"></td><td class="n">' + n + '</td><td class="act"><button class="btn mini danger del" type="button">Remove</button></td></tr>').join("") +
      "</tbody></table></section></div>";

    $$("tr[data-i]", m).forEach((tr) => {
      const i = +tr.dataset.i;
      $(".nm", tr).addEventListener("change", (e) => {
        const old = d.categories[i], nv = e.target.value.trim();
        if (!nv || (nv !== old && d.categories.includes(nv))) { toast("That theme name is empty or already in use."); e.target.value = old; return; }
        d.categories[i] = nv; d.publications.forEach((p) => { if (p.category === old) p.category = nv; });
        changed(); renderThemes(m);
      });
      $(".up", tr).onclick = () => { d.categories.splice(i - 1, 0, d.categories.splice(i, 1)[0]); changed(); renderThemes(m); };
      $(".down", tr).onclick = () => { d.categories.splice(i + 1, 0, d.categories.splice(i, 1)[0]); changed(); renderThemes(m); };
      $(".del", tr).onclick = () => {
        const name = d.categories[i], n = counts.get(name) || 0;
        if (!window.confirm(n ? 'Delete "' + name + '"? Its ' + n + " publications will have no theme." : 'Delete "' + name + '"?')) return;
        d.categories.splice(i, 1); d.publications.forEach((p) => { if (p.category === name) p.category = ""; });
        changed(); renderThemes(m);
      };
    });
    $("#addTheme").onclick = () => {
      const v = $("#newTheme").value.trim();
      if (!v || d.categories.includes(v)) { toast("Enter a new theme name."); return; }
      d.categories.push(v); changed(); renderThemes(m);
    };
    $$("tr[data-k]", m).forEach((tr) => {
      const k = tr.dataset.k;
      $(".nm", tr).addEventListener("change", (e) => {
        const nv = e.target.value.trim(); if (!nv) { e.target.value = k; return; }
        d.publications.forEach((p) => {
          if (!(p.keywords || []).includes(k)) return;
          p.keywords = Array.from(new Set(p.keywords.map((x) => (x === k ? nv : x))));
        });
        changed(); renderThemes(m);
      });
      $(".del", tr).onclick = () => {
        if (!window.confirm('Remove the keyword "' + k + '" from all publications?')) return;
        d.publications.forEach((p) => { p.keywords = (p.keywords || []).filter((x) => x !== k); });
        changed(); renderThemes(m);
      };
    });
  }

  /* ---------- import and export tab ---------- */
  function renderIO(m) {
    const d = S.data.pubs;
    m.innerHTML =
      '<section class="panel"><h2>Import BibTeX</h2><p class="hint">Paste entries from Google Scholar, DBLP, or a .bib file. Entries with a title that is already in your list are skipped.</p>' +
      '<textarea class="inp" id="bibin" rows="8" style="width:100%" placeholder="@inproceedings{...}"></textarea>' +
      '<div class="row" style="margin-top:8px"><input type="file" id="bibfile" accept=".bib,.txt"><button class="btn" id="bibread" type="button">Read entries</button></div>' +
      '<div id="bibres"></div></section>' +
      '<section class="panel"><h2>Import CV</h2><p class="hint">Load a cv.json file. It replaces the CV sections in the editor. Click Save to store it in your private data.</p>' +
      '<div class="row"><input type="file" id="cvfile" accept=".json,application/json"><button class="btn" id="cvload" type="button">Load CV file</button></div></section>' +
      '<section class="panel"><h2>Export</h2><p class="hint">Downloads use the data in this editor, including unsaved changes.</p><div class="row">' +
      '<button class="btn" id="x-bib" type="button">Publications (.bib)</button>' +
      '<button class="btn" id="x-md" type="button">CV (Markdown)</button>' +
      '<button class="btn" id="x-pj" type="button">pubs.json</button>' +
      '<button class="btn" id="x-cj" type="button">cv.json</button></div></section>';
    $("#bibfile").onchange = async (e) => { const f = e.target.files[0]; if (f) $("#bibin").value = await f.text(); };
    $("#cvload").onclick = async () => {
      const f = $("#cvfile").files[0];
      if (!f) { toast("Choose a cv.json file first."); return; }
      let obj;
      try { obj = JSON.parse(await f.text()); } catch (e) { toast("That file is not valid JSON."); return; }
      if (!obj || !Array.isArray(obj.sections) || !obj.profile) { toast("That file does not look like a cv.json file."); return; }
      if (!S.cvMissing && !window.confirm("Replace the CV in the editor with this file?")) return;
      S.data.cv = obj; normalize(); changed();
      toast("CV loaded. Click Save to store it.");
      switchTab("cv");
    };
    $("#bibread").onclick = () => {
      const got = K.parseBibtex($("#bibin").value);
      const norm = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
      const have = new Set(d.publications.map((p) => norm(p.title)));
      const fresh = got.filter((p) => p.title && !have.has(norm(p.title)));
      S.imported = fresh;
      $("#bibres").innerHTML = '<p class="hint" style="margin-top:10px">Found ' + got.length + " entries. " + fresh.length + " are new." + (got.length - fresh.length ? " " + (got.length - fresh.length) + " are already in your list." : "") + "</p>" +
        (fresh.length ? '<ul style="font-size:14px">' + fresh.map((p) => "<li>" + K.fmtPub(p, d.owner.highlight, "html") + "</li>").join("") + "</ul>" +
          '<div class="row"><label class="f">Theme for new entries<select class="inp" id="bibcat"><option value="">(none)</option>' + optionList(d.categories, "") + "</select></label>" +
          '<button class="btn primary" id="bibadd" type="button" style="align-self:flex-end">Add ' + fresh.length + " entries</button></div>" : "");
      const add = $("#bibadd");
      if (add) add.onclick = () => {
        const cat = $("#bibcat").value;
        S.imported.forEach((p) => {
          if (cat && !p.category) p.category = cat;
          if (p.category && !d.categories.includes(p.category)) d.categories.push(p.category);
          if (d.publications.some((x) => x.id === p.id)) p.id = slugId(p);
          d.publications.unshift(p);
        });
        toast("Added " + S.imported.length + " entries. Review them in Publications.");
        S.imported = []; changed(); switchTab("pubs");
      };
    };
    const name = (S.data.cv.profile.name || "CV").replace(/\s+/g, "_");
    $("#x-bib").onclick = () => download("publications.bib", K.sortPubs(d.publications, "newest").map(K.toBibtex).join("\n"), "application/x-bibtex");
    $("#x-md").onclick = () => download(name + "_CV.md", K.cvMarkdown(S.data.cv, d), "text/markdown");
    $("#x-pj").onclick = () => download("pubs.json", ser(d), "application/json");
    $("#x-cj").onclick = () => download("cv.json", ser(S.data.cv), "application/json");
  }

  /* ---------- settings tab ---------- */
  function renderSettings(m) {
    const cfg = Object.assign({ branch: "main" }, S.gh || {});
    const st = S.data.cv.settings;
    m.innerHTML =
      '<section class="panel"><h2>GitHub connection</h2>' +
      '<p class="hint">Publications save by committing to your GitHub repository. Create a fine-grained personal access token that can access only that repository, with "Contents" set to "Read and write". The token is stored in your private Backprompter data, so you enter it once for all your devices. It is never stored in the repository.</p>' +
      '<div class="grid3">' +
      '<label class="f">Owner<input id="g-owner" value="' + esc(cfg.owner || "") + '" placeholder="github-username"></label>' +
      '<label class="f">Repository<input id="g-repo" value="' + esc(cfg.repo || "") + '" placeholder="cv"></label>' +
      '<label class="f">Branch<input id="g-branch" value="' + esc(cfg.branch || "main") + '"></label>' +
      '<label class="f span3">Token<input id="g-token" type="password" autocomplete="off" value="' + esc(cfg.token || "") + '" placeholder="github_pat_…"></label></div>' +
      '<div class="row" style="margin-top:12px"><button class="btn primary" id="g-connect" type="button">Save and connect</button>' +
      '<button class="btn" id="g-forget" type="button">Delete stored token</button></div></section>' +
      '<section class="panel"><h2>Publications in the CV</h2><div class="grid3">' +
      '<label class="f">Group by<select id="s-group">' + optionList(["category", "type", "year", "none"], st.pubGroupBy, { category: "Theme", type: "Type", year: "Year", none: "No groups" }) + "</select></label>" +
      '<label class="f">Order<select id="s-order">' + optionList(["newest", "oldest"], st.pubOrder, { newest: "Newest first", oldest: "Oldest first" }) + "</select></label>" +
      '<label class="f">Numbering<select id="s-num">' + optionList(["per-group", "continuous"], st.numbering, { "per-group": "Restart in each group", continuous: "Continuous" }) + "</select></label>" +
      '<label class="f span3">Names to show in bold (comma-separated)<input id="s-hl" value="' + esc((S.data.pubs.owner.highlight || []).join(", ")) + '"></label>' +
      "</div></section>";
    $("#g-connect").onclick = async () => {
      const next = { owner: $("#g-owner").value.trim(), repo: $("#g-repo").value.trim(), branch: $("#g-branch").value.trim() || "main", token: $("#g-token").value.trim() };
      if (!next.owner || !next.repo || !next.token) { toast("Enter the owner, repository, and token."); return; }
      setStatus("Checking GitHub access…");
      let p;
      try { p = await K.GitHub(next).get(FILES.pubs); }
      catch (e) { setStatus("GitHub check failed: " + e.message, "err"); toast("GitHub rejected these settings. Nothing was stored."); return; }
      try { await A.saveDoc(DOC.github, next); }
      catch (e) { setStatus("Could not store the settings: " + e.message, "err"); return; }
      S.gh = next; S.sha.pubs = p.sha;
      const remote = JSON.parse(p.text);
      if (!isDirty("pubs")) { S.data.pubs = remote; S.orig.pubs = ser(remote); normalize(); }
      else { S.orig.pubs = ser(remote); }
      refreshStatus();
      toast("Connected. Settings stored in your private data.");
      switchTab("pubs");
    };
    $("#g-forget").onclick = async () => {
      if (!window.confirm("Delete the stored GitHub token? You can enter a new one later.")) return;
      try { await A.deleteDoc(DOC.github); } catch (e) { toast("Could not delete: " + e.message); return; }
      S.gh = null; $("#g-token").value = ""; refreshStatus(); toast("Stored token deleted.");
    };
    $("#s-group").onchange = (e) => { st.pubGroupBy = e.target.value; changed(); };
    $("#s-order").onchange = (e) => { st.pubOrder = e.target.value; changed(); };
    $("#s-num").onchange = (e) => { st.numbering = e.target.value; changed(); };
    $("#s-hl").addEventListener("input", (e) => { S.data.pubs.owner.highlight = e.target.value.split(",").map((s) => s.trim()).filter(Boolean); changed(); });
  }

  /* ---------- preview ---------- */
  function preview() {
    const ov = document.createElement("div");
    ov.className = "overlay";
    ov.innerHTML = '<div class="sheet"><div class="sheet-h"><strong>CV preview (includes unsaved changes)</strong><button class="btn" type="button">Close</button></div><div class="cv">' +
      K.cvHTML(S.data.cv, S.data.pubs) + "</div></div>";
    $("button", ov).onclick = () => ov.remove();
    ov.addEventListener("click", (e) => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
  }

  /* ---------- boot ---------- */
  $$(".tabs button").forEach((b) => (b.onclick = () => switchTab(b.dataset.tab)));
  $("#saveBtn").onclick = save;
  $("#previewBtn").onclick = preview;
  $("#signOutBtn").onclick = () => {
    if (anyDirty() && !window.confirm("You have unsaved changes. Sign out and discard them?")) return;
    A.signOut();
  };
  window.addEventListener("beforeunload", (e) => { if (anyDirty()) { e.preventDefault(); e.returnValue = ""; } });
  window.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); if (anyDirty()) save(); } });
  A.start(() => load().then(() => {
    if (S.cvMissing) { switchTab("io"); toast("No CV is stored yet. Load your cv.json file here."); }
  }).catch((e) => setStatus("Could not load data: " + e.message, "err")));
})();
