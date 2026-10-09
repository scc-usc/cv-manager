/* Sign-in gate and private storage through the Backprompter browser SDK.
   Private documents are stored as { json: "<string>" } so that every save replaces the whole document. */
(function (global) {
  "use strict";
  const cfg = global.CV_CONFIG || {};
  let readyFired = false;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Could not load " + src));
      document.head.appendChild(s);
    });
  }

  function gateHTML() {
    return '<div class="gate-card" role="dialog" aria-labelledby="gate-h">' +
      '<h1 id="gate-h">Sign in</h1>' +
      '<p class="gate-sub" id="gate-msg">Checking your session…</p>' +
      '<form id="gate-form" hidden>' +
      '<label class="f">Email<input id="gate-email" type="email" autocomplete="username" required></label>' +
      '<label class="f">Password<input id="gate-pass" type="password" autocomplete="current-password" required></label>' +
      '<button class="btn primary" id="gate-go" type="submit">Sign in</button>' +
      '<button class="linkbtn" id="gate-reset" type="button">Forgot password</button>' +
      "</form></div>";
  }

  function showGate(message, withForm) {
    let g = document.getElementById("gate");
    if (!g) {
      g = document.createElement("div"); g.id = "gate"; g.className = "gate"; g.innerHTML = gateHTML();
      document.body.appendChild(g);
      const form = g.querySelector("#gate-form");
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = g.querySelector("#gate-go");
        btn.disabled = true; setMsg("Signing in…");
        try {
          await global.Backprompter.signIn(g.querySelector("#gate-email").value.trim(), g.querySelector("#gate-pass").value);
        } catch (err) {
          setMsg(/password|credential|user-not-found|invalid/i.test(err.message) ? "The email or password is not correct." : "Sign-in failed: " + err.message, true);
        } finally { btn.disabled = false; }
      });
      g.querySelector("#gate-reset").addEventListener("click", async () => {
        const email = g.querySelector("#gate-email").value.trim();
        if (!email) { setMsg("Enter your email first.", true); return; }
        try { await global.Backprompter.requestPasswordReset(email); setMsg("If this email has an account, a reset link is on its way."); }
        catch (err) { setMsg("Could not send the reset email: " + err.message, true); }
      });
    }
    g.hidden = false;
    document.body.classList.add("gated");
    g.querySelector("#gate-form").hidden = !withForm;
    setMsg(message, false);
    if (withForm) setTimeout(() => { const e = g.querySelector("#gate-email"); if (e && !e.value) e.focus(); }, 0);
  }

  function setMsg(text, isErr) {
    const m = document.getElementById("gate-msg");
    if (m) { m.textContent = text; m.className = "gate-sub" + (isErr ? " err" : ""); }
  }

  function hideGate() {
    const g = document.getElementById("gate");
    if (g) g.hidden = true;
    document.body.classList.remove("gated");
  }

  function validUser(user) {
    if (!user || user.isAnonymous) return false;
    return !user.tenantId || user.tenantId === cfg.appKey;
  }

  /* Calls onReady(user) once, after a valid sign-in. A later sign-out reloads the page. */
  async function start(onReady) {
    showGate("Checking your session…", false);
    if (!cfg.appKey || /YOUR_/.test(cfg.appKey)) {
      showGate("Set your Backprompter App Key in editor/config.js.", false); return;
    }
    try {
      if (!global.Backprompter) await loadScript(cfg.sdkUrl);
      global.Backprompter.setAppKey(cfg.appKey);
      await global.Backprompter.onAuthChange((user) => {
        if (validUser(user)) {
          hideGate();
          if (!readyFired) { readyFired = true; Promise.resolve(onReady(user)).catch((e) => console.error(e)); }
        } else if (readyFired) {
          location.reload();
        } else {
          if (user) global.Backprompter.signOut();
          showGate("Sign in to continue.", true);
        }
      });
    } catch (e) {
      showGate("Could not start sign-in: " + e.message, false);
    }
  }

  async function signOut() {
    try { localStorage.removeItem("cvkit.draft"); } catch (e) { /* storage blocked */ }
    await global.Backprompter.signOut();
    location.reload();
  }

  const notFound = (e) => /not found|404/i.test(String(e && e.message));

  async function loadDoc(key) {
    try {
      const r = await global.Backprompter.getData(key);
      const json = r && r.data && r.data.json;
      return typeof json === "string" ? JSON.parse(json) : null;
    } catch (e) {
      if (notFound(e)) return null;
      throw e;
    }
  }

  async function saveDoc(key, obj) {
    await global.Backprompter.saveData(key, { json: JSON.stringify(obj) });
  }

  async function deleteDoc(key) {
    try { await global.Backprompter.deleteData(key); }
    catch (e) { if (!notFound(e)) throw e; }
  }

  global.CVAuth = { start, signOut, loadDoc, saveDoc, deleteDoc };
})(window);
