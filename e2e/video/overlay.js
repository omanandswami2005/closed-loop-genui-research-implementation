// Injected into every page of the recording: cursor, click ripples, chapter captions,
// element callouts and a fast-forward badge. Purely visual; pointer-events are off.
(() => {
  if (window.__ov) return;
  const css = `
  #__ov{position:fixed;inset:0;z-index:2147483647;pointer-events:none;font-family:Inter,system-ui,sans-serif}
  #__cur{position:fixed;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;border:2px solid #fff;background:rgba(37,99,235,.55);box-shadow:0 0 0 4px rgba(37,99,235,.25),0 2px 10px rgba(0,0,0,.5);opacity:0;transition:opacity .3s}
  .__rip{position:fixed;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:2px solid #60a5fa;animation:__rip .6s ease-out forwards}
  @keyframes __rip{to{transform:scale(4.5);opacity:0}}
  #__cap{position:fixed;left:28px;bottom:58px;display:flex;align-items:stretch;background:rgba(2,6,23,.92);border:1px solid #2563eb;box-shadow:0 10px 40px rgba(0,0,0,.45);transform:translateX(-120%);transition:transform .55s cubic-bezier(.2,.8,.2,1)}
  #__cap.on{transform:none}
  #__cap .n{background:#2563eb;color:#fff;font:600 15px "JetBrains Mono",monospace;padding:12px 14px;display:flex;align-items:center;letter-spacing:.1em}
  #__cap .t{padding:9px 18px}
  #__cap .t b{display:block;color:#f8fafc;font-size:19px;font-weight:600}
  #__cap .t i{display:block;font-style:normal;color:#94a3b8;font:13px "JetBrains Mono",monospace;margin-top:2px;letter-spacing:.06em}
  .__hl{position:fixed;border:2.5px solid #3b82f6;box-shadow:0 0 0 9999px rgba(2,6,23,.38),0 0 24px rgba(59,130,246,.7);animation:__hlin .45s cubic-bezier(.2,.8,.2,1)}
  @keyframes __hlin{from{transform:scale(1.08);opacity:0}to{transform:none;opacity:1}}
  .__hl span{position:absolute;left:-2.5px;top:-34px;background:#2563eb;color:#fff;font:600 14px "JetBrains Mono",monospace;padding:6px 10px;white-space:nowrap;letter-spacing:.04em}
  .__hl.below span{top:auto;bottom:-34px}
  #__ff{position:fixed;top:64px;right:28px;background:#f59e0b;color:#111827;font:700 16px "JetBrains Mono",monospace;padding:8px 14px;letter-spacing:.06em;opacity:0;transition:opacity .3s}
  #__ff.on{opacity:1}`;
  const mount = () => {
    if (document.getElementById("__ov")) return;
    const st = document.createElement("style");
    st.textContent = css;
    document.head.appendChild(st);
    const ov = document.createElement("div");
    ov.id = "__ov";
    ov.innerHTML = `<div id="__cur"></div><div id="__cap"><div class="n"></div><div class="t"><b></b><i></i></div></div><div id="__ff"></div>`;
    document.body.appendChild(ov);
  };
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
  window.addEventListener("mousemove", (e) => {
    const c = document.getElementById("__cur");
    if (!c) return;
    c.style.left = e.clientX + "px";
    c.style.top = e.clientY + "px";
    c.style.opacity = "1";
  }, true);
  window.addEventListener("mousedown", (e) => {
    const ov = document.getElementById("__ov");
    if (!ov) return;
    const r = document.createElement("div");
    r.className = "__rip";
    r.style.left = e.clientX + "px";
    r.style.top = e.clientY + "px";
    ov.appendChild(r);
    setTimeout(() => r.remove(), 700);
  }, true);
  window.__ov = {
    cap(n, title, sub) {
      const c = document.getElementById("__cap");
      if (!c) return;
      if (!title) return c.classList.remove("on");
      c.classList.remove("on");
      setTimeout(() => {
        c.querySelector(".n").textContent = n;
        c.querySelector("b").textContent = title;
        c.querySelector("i").textContent = sub || "";
        c.classList.add("on");
      }, c.classList.contains("on") ? 350 : 0);
    },
    hl(selector, label, ms = 3000, below = false) {
      const el = typeof selector === "string" ? document.querySelector(selector) : selector;
      const ov = document.getElementById("__ov");
      if (!el || !ov) return false;
      const b = el.getBoundingClientRect();
      const h = document.createElement("div");
      h.className = "__hl" + (below || b.top < 60 ? " below" : "");
      Object.assign(h.style, { left: b.left - 6 + "px", top: b.top - 6 + "px", width: b.width + 12 + "px", height: b.height + 12 + "px" });
      h.innerHTML = `<span></span>`;
      h.querySelector("span").textContent = label;
      ov.appendChild(h);
      setTimeout(() => h.remove(), ms);
      return true;
    },
    ff(text) {
      const f = document.getElementById("__ff");
      if (!f) return;
      if (text) { f.textContent = text; f.classList.add("on"); } else f.classList.remove("on");
    },
  };
})();
