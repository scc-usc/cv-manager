/* Shared helpers for the publication list, the CV page, and the editor. No build step. */
(function (global) {
  "use strict";

  const TYPE_LABELS = {
    conference: "Conference papers",
    journal: "Journal articles",
    workshop: "Workshop papers",
    chapter: "Book chapters",
    preprint: "Preprints",
    thesis: "Thesis",
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  async function loadJSON(path) {
    const res = await fetch(path + (path.includes("?") ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load " + path + " (" + res.status + ")");
    return res.json();
  }

  function isHighlighted(name, highlight) {
    return (highlight || []).some((h) => h.toLowerCase() === String(name).trim().toLowerCase());
  }

  /* mode: "html" | "md" | "text" */
  function fmtAuthors(authors, highlight, mode) {
    return (authors || []).map((a) => {
      if (!isHighlighted(a, highlight)) return mode === "html" ? esc(a) : a;
      if (mode === "html") return "<strong>" + esc(a) + "</strong>";
      if (mode === "md") return "**" + a + "**";
      return a;
    }).join(", ");
  }

  function statusSuffix(p) {
    if (p.status === "accepted") return " (to appear)";
    if (p.status === "under review") return " (under review)";
    return "";
  }

  function fmtPub(p, highlight, mode) {
    const authors = fmtAuthors(p.authors, highlight, mode);
    const plainVenue = p.type === "preprint" || p.type === "thesis";
    let title, venue, award, note, link = "";
    if (mode === "html") {
      title = p.url ? '<a href="' + esc(p.url) + '" target="_blank" rel="noopener">' + esc(p.title) + "</a>" : esc(p.title);
      venue = plainVenue ? esc(p.venue) : "<em>" + esc(p.venue) + "</em>";
      award = p.award ? ' <span class="award">' + esc(p.award) + "</span>" : "";
      note = p.note ? " " + esc(p.note) : "";
    } else if (mode === "md") {
      title = p.title;
      venue = plainVenue ? p.venue : "*" + p.venue + "*";
      award = p.award ? " **" + p.award + ".**" : "";
      note = p.note ? " " + p.note : "";
    } else {
      title = p.title; venue = p.venue;
      award = p.award ? " " + p.award + "." : "";
      note = p.note ? " " + p.note : "";
    }
    const venuePart = venue ? venue + ", " : "";
    return authors + ', "' + title + '," ' + venuePart + p.year + statusSuffix(p) + "." + award + note + link;
  }

  function sortPubs(pubs, order) {
    const idx = new Map(pubs.map((p, i) => [p, i]));
    return pubs.slice().sort((a, b) => {
      const d = order === "oldest" ? a.year - b.year : b.year - a.year;
      return d !== 0 ? d : idx.get(a) - idx.get(b);
    });
  }

  /* Returns [{title, items}] in the order the categories (or types) are listed. */
  function groupPubs(data, by, order) {
    const pubs = data.publications || [];
    let keys, keyOf, label;
    if (by === "type") {
      keys = data.types || Object.keys(TYPE_LABELS);
      keyOf = (p) => p.type;
      label = (k) => TYPE_LABELS[k] || k;
    } else if (by === "year") {
      keys = Array.from(new Set(pubs.map((p) => p.year))).sort((a, b) => b - a);
      keyOf = (p) => p.year;
      label = (k) => String(k);
    } else if (by === "none") {
      return [{ title: "", items: sortPubs(pubs, order) }];
    } else {
      keys = (data.categories || []).slice();
      pubs.forEach((p) => { if (p.category && !keys.includes(p.category)) keys.push(p.category); });
      keyOf = (p) => p.category || "Uncategorized";
      label = (k) => k;
      if (pubs.some((p) => !p.category)) keys.push("Uncategorized");
    }
    return keys.map((k) => ({ title: label(k), items: sortPubs(pubs.filter((p) => keyOf(p) === k), order) }))
      .filter((g) => g.items.length);
  }

  function allKeywords(pubs) {
    const counts = new Map();
    (pubs || []).forEach((p) => (p.keywords || []).forEach((k) => counts.set(k, (counts.get(k) || 0) + 1)));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }

  /* ---------- BibTeX ---------- */
  const BIB_TYPE = { conference: "inproceedings", workshop: "inproceedings", journal: "article", chapter: "incollection", preprint: "misc", thesis: "phdthesis" };

  function bibEsc(s) { return String(s || "").replace(/([&%$#_])/g, "\\$1"); }

  function toBibtex(p) {
    const t = BIB_TYPE[p.type] || "misc";
    const venueField = t === "article" ? "journal" : t === "phdthesis" ? "school" : t === "misc" ? "howpublished" : "booktitle";
    const authors = (p.authors || []).filter((a) => a !== "et al.").map(bibEsc).join(" and ") + ((p.authors || []).includes("et al.") ? " and others" : "");
    const f = [
      ["title", "{" + bibEsc(p.title) + "}"],
      ["author", authors],
      [venueField, bibEsc(p.venue)],
      ["year", String(p.year)],
      ["url", p.url],
      ["keywords", (p.keywords || []).join(", ")],
      ["category", p.category],
      ["status", p.status],
      ["award", bibEsc(p.award)],
      ["note", bibEsc(p.note)],
    ].filter(([, v]) => v);
    return "@" + t + "{" + p.id + ",\n" + f.map(([k, v]) => "  " + k + " = {" + v + "}").join(",\n") + "\n}\n";
  }

  function parseBibtex(text) {
    const out = [];
    const re = /@(\w+)\s*\{\s*([^,\s]+)\s*,/g;
    let m;
    while ((m = re.exec(text))) {
      let i = re.lastIndex, depth = 1;
      while (i < text.length && depth > 0) { if (text[i] === "{") depth++; else if (text[i] === "}") depth--; i++; }
      const body = text.slice(re.lastIndex, i - 1);
      re.lastIndex = i;
      const fields = {};
      const fre = /(\w+)\s*=\s*/g;
      let fm;
      while ((fm = fre.exec(body))) {
        let j = fre.lastIndex, val = "";
        if (body[j] === "{") {
          let d = 0, k = j;
          for (; k < body.length; k++) { if (body[k] === "{") d++; else if (body[k] === "}") { d--; if (d === 0) break; } }
          val = body.slice(j + 1, k); fre.lastIndex = k + 1;
        } else if (body[j] === '"') {
          const k = body.indexOf('"', j + 1); val = body.slice(j + 1, k); fre.lastIndex = k + 1;
        } else {
          const k = body.slice(j).search(/[,\n]/); val = body.slice(j, k < 0 ? undefined : j + k); fre.lastIndex = j + (k < 0 ? body.length : k);
        }
        fields[fm[1].toLowerCase()] = val.replace(/[{}]/g, "").replace(/\\([&%$#_])/g, "$1").replace(/\s+/g, " ").trim();
      }
      const bt = m[1].toLowerCase();
      const type = bt === "article" ? "journal" : bt === "incollection" || bt === "inbook" ? "chapter" : bt === "phdthesis" ? "thesis" : bt === "misc" || bt === "unpublished" ? "preprint" : "conference";
      const authors = (fields.author || "").split(/\s+and\s+/).map((a) => {
        a = a.trim(); if (!a) return "";
        if (a.toLowerCase() === "others") return "et al.";
        let first = "", last = a;
        if (a.includes(",")) { [last, first] = a.split(",").map((s) => s.trim()); }
        else { const parts = a.split(/\s+/); last = parts.pop(); first = parts.join(" "); }
        const initials = first.split(/[\s-]+/).filter(Boolean).map((n) => n[0].toUpperCase() + ".").join(" ");
        return (initials ? initials + " " : "") + last;
      }).filter(Boolean);
      out.push({
        id: m[2],
        title: fields.title || "",
        authors,
        venue: fields.journal || fields.booktitle || fields.school || fields.howpublished || fields.publisher || "",
        year: parseInt(fields.year, 10) || new Date().getFullYear(),
        type,
        status: fields.status || (type === "preprint" ? "preprint" : "published"),
        category: fields.category || "",
        keywords: (fields.keywords || "").split(/[,;]/).map((s) => s.trim()).filter(Boolean),
        award: fields.award || "",
        url: fields.url || (fields.doi ? "https://doi.org/" + fields.doi : ""),
        note: fields.note || "",
      });
    }
    return out;
  }

  /* ---------- CV ---------- */
  function pubsMarkdown(pubsData, settings, intro) {
    const hl = (pubsData.owner && pubsData.owner.highlight) || [];
    const groups = groupPubs(pubsData, settings.pubGroupBy || "category", settings.pubOrder || "newest");
    let n = 0, md = intro ? intro + "\n\n" : "";
    groups.forEach((g) => {
      if (g.title) md += "### " + g.title + "\n\n";
      g.items.forEach((p, i) => {
        const num = settings.numbering === "continuous" ? ++n : i + 1;
        md += num + ". " + fmtPub(p, hl, "md") + "\n";
      });
      md += "\n";
    });
    return md.trim();
  }

  function profileMarkdown(pr) {
    const bits = [];
    if (pr.homepage) bits.push("Homepage: [" + pr.homepage.replace(/^https?:\/\/(www\.)?/, "") + "](" + pr.homepage + ")");
    if (pr.email) bits.push("Email: [" + pr.email + "](mailto:" + pr.email + ")");
    if (pr.orcid) bits.push("ORCID: [" + pr.orcid + "](https://orcid.org/" + pr.orcid + ")");
    return "# " + pr.name + "\n\n" + [pr.title, pr.affiliation].filter(Boolean).join(", ") + "\n\n" + bits.join(" · ");
  }

  function cvMarkdown(cv, pubsData) {
    const parts = [profileMarkdown(cv.profile || {})];
    (cv.sections || []).forEach((s) => {
      if (s.hidden) return;
      const body = s.kind === "publications" ? pubsMarkdown(pubsData, cv.settings || {}, s.body) : s.body;
      parts.push("## " + s.title + "\n\n" + (body || ""));
    });
    return parts.join("\n\n") + "\n";
  }

  function pubsHTML(pubsData, settings, intro) {
    const hl = (pubsData.owner && pubsData.owner.highlight) || [];
    const groups = groupPubs(pubsData, settings.pubGroupBy || "category", settings.pubOrder || "newest");
    let n = 0, html = intro ? global.marked.parse(intro) : "";
    groups.forEach((g) => {
      if (g.title) html += "<h3>" + esc(g.title) + "</h3>";
      const start = settings.numbering === "continuous" ? n + 1 : 1;
      html += '<ol start="' + start + '">' + g.items.map((p) => "<li>" + fmtPub(p, hl, "html") + "</li>").join("") + "</ol>";
      n += g.items.length;
    });
    return html;
  }

  function cvHTML(cv, pubsData) {
    const pr = cv.profile || {};
    const contact = [];
    if (pr.homepage) contact.push('<a href="' + esc(pr.homepage) + '">' + esc(pr.homepage.replace(/^https?:\/\/(www\.)?/, "")) + "</a>");
    if (pr.email) contact.push('<a href="mailto:' + esc(pr.email) + '">' + esc(pr.email) + "</a>");
    if (pr.orcid) contact.push('ORCID <a href="https://orcid.org/' + esc(pr.orcid) + '">' + esc(pr.orcid) + "</a>");
    let html = '<header class="cv-head"><h1>' + esc(pr.name) + "</h1><p class=\"cv-role\">" +
      esc([pr.title, pr.affiliation].filter(Boolean).join(", ")) + '</p><p class="cv-contact">' + contact.join(" · ") + "</p></header>";
    (cv.sections || []).forEach((s) => {
      if (s.hidden) return;
      const body = s.kind === "publications" ? pubsHTML(pubsData, cv.settings || {}, s.body) : global.marked.parse(s.body || "");
      html += '<section class="cv-sec" id="sec-' + esc(s.id) + '"><h2>' + esc(s.title) + "</h2>" + body + "</section>";
    });
    return html;
  }

  /* ---------- GitHub Contents API ---------- */
  function b64encodeUtf8(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64decodeUtf8(b64) {
    const bin = atob(b64.replace(/\n/g, ""));
    const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function GitHub(cfg) {
    const base = (cfg.api || "https://api.github.com") + "/repos/" + cfg.owner + "/" + cfg.repo + "/contents/";
    const headers = () => ({ Accept: "application/vnd.github+json", Authorization: "Bearer " + cfg.token, "X-GitHub-Api-Version": "2022-11-28" });
    return {
      async get(path) {
        const r = await fetch(base + path + "?ref=" + encodeURIComponent(cfg.branch) + "&t=" + Date.now(), { headers: headers(), cache: "no-store" });
        if (!r.ok) throw new Error("GitHub read failed for " + path + ": " + r.status + " " + (await r.text()).slice(0, 200));
        const j = await r.json();
        return { sha: j.sha, text: b64decodeUtf8(j.content) };
      },
      async put(path, text, sha, message) {
        const r = await fetch(base + path, {
          method: "PUT", headers: Object.assign({ "Content-Type": "application/json" }, headers()),
          body: JSON.stringify({ message, content: b64encodeUtf8(text), sha, branch: cfg.branch }),
        });
        if (!r.ok) throw new Error("GitHub save failed for " + path + ": " + r.status + " " + (await r.text()).slice(0, 300));
        const j = await r.json();
        return { sha: j.content.sha, commit: j.commit && j.commit.html_url };
      },
    };
  }

  global.CVKit = {
    esc, loadJSON, fmtAuthors, fmtPub, groupPubs, sortPubs, allKeywords, toBibtex, parseBibtex,
    pubsMarkdown, cvMarkdown, cvHTML, pubsHTML, GitHub, TYPE_LABELS,
  };
})(window);
