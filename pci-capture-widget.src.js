/* ============================================================================
 * <pci-capture-widget>  — Webex Contact Center Desktop web component
 *
 * PCI pause/resume pattern: pauses call recording during card capture, resumes
 * when complete, and logs every SDK call as a compliance trail.
 *
 * Runs in two modes, auto-detected at connect:
 *   • LIVE  — inside the WxCC Agent Desktop: calls the real @wxcc-desktop/sdk
 *   • SIM   — anywhere else (laptop / GitHub Pages): mocks the SDK calls so the
 *             recording-state story still demos, no live interaction required.
 *
 * Layout usage (see README): register the built bundle in layout.json and drop
 *   <pci-capture-widget interaction-id="$STORE.agentContact.taskSelected.interactionId">
 * into an aux-panel / custom-page area. The attribute is optional — if absent,
 * the component resolves the active interaction via Desktop.actions.getTaskMap().
 * ========================================================================== */
import { Desktop } from "@wxcc-desktop/sdk";

const TEMPLATE = `
<style>
  :host{
    --surface:#eef2f7; --panel:#fff; --ink:#101828; --muted:#667085; --faint:#98a2b3;
    --line:#e2e8f2; --brand:#1d4ed8; --brand-soft:#eaf0ff;
    --live:#e11d48; --live-soft:#fff1f4; --secure:#047857; --secure-soft:#e7f6f0;
    --shadow:0 1px 2px rgba(16,24,40,.06),0 8px 24px -12px rgba(16,24,40,.18);
    --mono:ui-monospace,"SF Mono",SFMono-Regular,"Cascadia Code","Roboto Mono",Menlo,Consolas,monospace;
    --sans:ui-sans-serif,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    display:block; font-family:var(--sans); color:var(--ink); font-size:14px; line-height:1.5;
    -webkit-font-smoothing:antialiased;
  }
  *{box-sizing:border-box}
  .app{display:grid;grid-template-columns:1.35fr 1fr;gap:16px}
  @media (max-width:820px){.app{grid-template-columns:1fr}}
  .panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow)}
  .caller{display:flex;align-items:center;gap:14px;padding:16px 18px;border-bottom:1px solid var(--line)}
  .avatar{width:42px;height:42px;border-radius:50%;background:var(--brand-soft);color:var(--brand);
    display:grid;place-items:center;font-weight:600;flex:none}
  .caller h1{font-size:15px;margin:0;font-weight:600;letter-spacing:-.01em}
  .caller .sub{color:var(--muted);font-size:12.5px}
  .caller .meta{margin-left:auto;text-align:right;font-family:var(--mono);font-size:11px;color:var(--faint);line-height:1.7}
  .caller .meta b{color:var(--muted);font-weight:500}
  .rec{padding:20px 18px;display:flex;align-items:center;gap:14px;border-bottom:1px solid var(--line);transition:background .4s}
  .rec.live{background:var(--live-soft)} .rec.paused{background:var(--secure-soft)}
  .rec .dot{width:15px;height:15px;border-radius:50%;flex:none;position:relative}
  .rec.live .dot{background:var(--live)}
  .rec.live .dot::after{content:"";position:absolute;inset:-6px;border-radius:50%;background:var(--live);opacity:.35;animation:pulse 1.6s ease-out infinite}
  .rec.paused .dot{background:var(--secure)}
  @keyframes pulse{0%{transform:scale(.6);opacity:.5}100%{transform:scale(1.7);opacity:0}}
  @media (prefers-reduced-motion:reduce){.rec.live .dot::after{animation:none}}
  .rec .label{font-weight:600;font-size:15.5px;letter-spacing:-.01em}
  .rec.live .label{color:var(--live)} .rec.paused .label{color:var(--secure)}
  .rec .note{font-size:12.5px;color:var(--muted);margin-top:1px}
  .rec .lock{margin-left:auto;font-size:20px}
  .steps{display:flex;padding:14px 18px 2px;font-size:12px;color:var(--faint)}
  .steps .s{display:flex;align-items:center;gap:8px;flex:1}
  .steps .s .n{width:22px;height:22px;border-radius:50%;border:1.5px solid var(--line);display:grid;place-items:center;font-weight:600;font-size:11px;background:var(--panel);color:var(--faint)}
  .steps .s.active .n{border-color:var(--brand);color:var(--brand);background:var(--brand-soft)}
  .steps .s.done .n{border-color:var(--secure);color:#fff;background:var(--secure)}
  .steps .s.active span,.steps .s.done span{color:var(--ink)}
  .steps .s .bar{flex:1;height:1.5px;background:var(--line);margin:0 8px}
  .steps .s:last-child .bar{display:none}
  .form{padding:6px 18px 16px} .form.locked{opacity:.45;pointer-events:none;filter:grayscale(.3)}
  .field{margin-top:13px} .field label{display:block;font-size:12px;color:var(--muted);margin-bottom:6px;font-weight:500}
  .field input{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:9px;font-family:var(--mono);font-size:14px;letter-spacing:.04em;background:#fbfcfe;color:var(--ink)}
  .field input:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-soft);background:#fff}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .actions{padding:14px 18px 16px;display:flex;gap:10px;border-top:1px solid var(--line)}
  button{font-family:var(--sans);font-size:13.5px;font-weight:600;border-radius:9px;padding:11px 15px;border:1px solid transparent;cursor:pointer;transition:.15s}
  button:disabled{opacity:.4;cursor:not-allowed}
  .btn-secure{background:var(--secure);color:#fff} .btn-secure:not(:disabled):hover{background:#036a4d}
  .btn-live{background:var(--live);color:#fff} .btn-live:not(:disabled):hover{background:#c11540}
  .btn-ghost{background:var(--panel);color:var(--muted);border-color:var(--line)} .btn-ghost:not(:disabled):hover{background:var(--surface);color:var(--ink)}
  .grow{flex:1}
  .token{margin:0 18px 4px;padding:11px 13px;border-radius:10px;background:var(--secure-soft);border:1px solid #b9e6d4;font-size:12.5px;color:#065f46;display:none}
  .token.show{display:block} .token code{font-family:var(--mono);background:#fff;padding:2px 6px;border-radius:5px;border:1px solid #b9e6d4}
  .rail{display:flex;flex-direction:column}
  .rail-head{padding:15px 18px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px}
  .rail-head h2{font-size:13px;margin:0;font-weight:600;letter-spacing:-.01em}
  .tag{margin-left:auto;font-size:10.5px;font-weight:600;padding:3px 8px;border-radius:20px;font-family:var(--mono);letter-spacing:.02em}
  .tag.sim{background:#fef3e2;color:#b45309;border:1px solid #f7d9a8}
  .tag.live-env{background:var(--secure-soft);color:var(--secure);border:1px solid #b9e6d4}
  .log{padding:10px 14px;overflow:auto;flex:1;max-height:520px}
  .entry{display:flex;gap:10px;padding:9px 4px;border-bottom:1px dashed var(--line);font-size:12px}
  .entry:last-child{border-bottom:none}
  .entry .t{font-family:var(--mono);font-size:10.5px;color:var(--faint);flex:none;padding-top:1px;width:64px}
  .entry .op{font-family:var(--mono);font-size:11.5px;word-break:break-word}
  .entry .desc{color:var(--muted);margin-top:2px}
  .entry.pause{background:linear-gradient(90deg,var(--secure-soft),transparent);border-radius:6px}
  .entry.resume{background:linear-gradient(90deg,var(--live-soft),transparent);border-radius:6px}
  .dirn{font-weight:600;font-size:10px;padding:1px 5px;border-radius:4px;margin-right:6px;font-family:var(--mono)}
  .dirn.req{background:var(--brand-soft);color:var(--brand)} .dirn.res{background:#f1f3f7;color:var(--muted)}
  .empty{color:var(--faint);font-size:12px;text-align:center;padding:22px 0}
  .disclaimer{grid-column:1/-1;text-align:center;color:var(--faint);font-size:11.5px;padding:2px 8px 6px;line-height:1.6}
  .disclaimer b{color:var(--muted);font-weight:600}
</style>
<div class="app">
  <section class="panel">
    <div class="caller">
      <div class="avatar">MR</div>
      <div><h1>Maria Reyes</h1><div class="sub">Inbound · Billing &amp; Payments</div></div>
      <div class="meta"><div><b>interaction</b> <span data-iid>—</span></div><div><b>duration</b> <span data-dur>00:00</span></div></div>
    </div>
    <div class="rec live" data-rec>
      <div class="dot"></div>
      <div><div class="label" data-rec-label>Recording</div><div class="note" data-rec-note>Call is being recorded — do not collect card details yet.</div></div>
      <div class="lock" data-rec-lock>●</div>
    </div>
    <div class="steps" data-steps>
      <div class="s active" data-step="1"><div class="n">1</div><span>Verify caller</span><div class="bar"></div></div>
      <div class="s" data-step="2"><div class="n">2</div><span>Secure capture</span><div class="bar"></div></div>
      <div class="s" data-step="3"><div class="n">3</div><span>Resume &amp; wrap</span><div class="bar"></div></div>
    </div>
    <div class="form locked" data-form>
      <div class="field"><label>Name on card</label><input data-name autocomplete="off" placeholder="Maria Reyes"></div>
      <div class="field"><label>Card number <span data-pan-hint style="color:var(--secure)"></span></label><input data-pan inputmode="numeric" autocomplete="off" placeholder="•••• •••• •••• ••••" maxlength="23"></div>
      <div class="row">
        <div class="field"><label>Expiry</label><input data-exp autocomplete="off" placeholder="MM / YY" maxlength="7"></div>
        <div class="field"><label>CVV</label><input data-cvv inputmode="numeric" autocomplete="off" placeholder="•••" maxlength="4"></div>
      </div>
    </div>
    <div class="token" data-token></div>
    <div class="actions">
      <button class="btn-secure grow" data-begin>Begin secure capture</button>
      <button class="btn-live grow" data-complete disabled>Complete &amp; resume recording</button>
      <button class="btn-ghost" data-reset title="Reset">Reset</button>
    </div>
  </section>
  <aside class="panel rail">
    <div class="rail-head"><h2>Recording &amp; compliance trail</h2><span class="tag" data-env>…</span></div>
    <div class="log" data-log><div class="empty" data-log-empty>SDK events will appear here as the call progresses.</div></div>
  </aside>
  <p class="disclaimer"><b>Demo.</b> No card data leaves the browser. In production, card entry uses a PCI-DSS compliant hosted-fields gateway that tokenizes the PAN — the widget orchestrates pause/resume and never sees raw card data.</p>
</div>`;

const guid = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0, v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

class PciCaptureWidget extends HTMLElement {
  static get observedAttributes() { return ["interaction-id"]; }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.recording = true;
    this.t = 0;
    this.interactionId = null;
  }

  attributeChangedCallback(name, _old, val) {
    if (name === "interaction-id" && val) this.interactionId = val;
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = TEMPLATE;
    this.$ = (sel) => this.shadowRoot.querySelector(sel);
    this.bind();
    this.durTimer = setInterval(() => {
      this.t++;
      const m = String(Math.floor(this.t / 60)).padStart(2, "0");
      const s = String(this.t % 60).padStart(2, "0");
      this.$("[data-dur]").textContent = `${m}:${s}`;
    }, 1000);
    this.boot();
  }

  disconnectedCallback() { clearInterval(this.durTimer); }

  /* ---- controller selection: live SDK vs simulation ---------------------- */
  async makeController() {
    // In the bundled widget, Desktop is always imported — the real test is
    // whether we're actually running inside the Desktop host. init() + a
    // getTaskMap() that resolves within a timeout is the reliable signal.
    try {
      Desktop.config.init();
      const map = await Promise.race([
        Desktop.actions.getTaskMap(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 1500)),
      ]);
      const self = this;
      return {
        mode: "live",
        async getInteractionId() {
          if (self.interactionId) return self.interactionId;
          for (const [, task] of map) return task.interactionId;
          const fresh = await Desktop.actions.getTaskMap();
          for (const [, task] of fresh) return task.interactionId;
          return null;
        },
        pause: (id) => Desktop.agentContact.pauseRecording({ interactionId: id }),
        resume: (id) => Desktop.agentContact.resumeRecording({ interactionId: id, data: { autoResumed: false } }),
      };
    } catch (_e) {
      return {
        mode: "sim",
        async getInteractionId() { return guid(); },
        pause: (id) => delay(420).then(() => ({ interactionId: id, isRecording: false })),
        resume: (id) => delay(420).then(() => ({ interactionId: id, isRecording: true })),
      };
    }
  }

  async boot() {
    this.controller = await this.makeController();
    const env = this.$("[data-env]");
    if (this.controller.mode === "live") { env.textContent = "LIVE SDK"; env.className = "tag live-env"; }
    else { env.textContent = "SIMULATION"; env.className = "tag sim"; }
    await this.resolveInteraction();
  }

  async resolveInteraction() {
    this.interactionId = await this.controller.getInteractionId();
    this.$("[data-iid]").textContent = this.interactionId ? this.interactionId.slice(0, 8) + "…" : "n/a";
    this.log({ op: "Desktop.actions.getTaskMap()", dir: "req", desc: "Resolving active interaction" });
    this.log({ op: `interactionId = "${this.interactionId}"`, dir: "res", desc: `env: ${this.controller.mode}` });
  }

  /* ---- audit log --------------------------------------------------------- */
  log({ op, desc, dir, kind }) {
    this.$("[data-log-empty]") && (this.$("[data-log-empty]").style.display = "none");
    const now = new Date();
    const ts = now.toLocaleTimeString("en-US", { hour12: false }) + "." +
      String(now.getMilliseconds()).padStart(3, "0").slice(0, 2);
    const e = document.createElement("div");
    e.className = "entry" + (kind ? " " + kind : "");
    e.innerHTML =
      `<div class="t">${ts}</div><div><div class="op">${dir ? `<span class="dirn ${dir}">${dir.toUpperCase()}</span>` : ""}${op}</div>` +
      `${desc ? `<div class="desc">${desc}</div>` : ""}</div>`;
    const log = this.$("[data-log]");
    log.appendChild(e);
    log.scrollTop = log.scrollHeight;
  }

  paintRecording(on) {
    this.recording = on;
    this.$("[data-rec]").className = "rec " + (on ? "live" : "paused");
    this.$("[data-rec-label]").textContent = on ? "Recording" : "Recording paused — secure capture";
    this.$("[data-rec-note]").textContent = on
      ? "Call is being recorded — do not collect card details."
      : "Safe to collect card details. This segment is NOT in the recording.";
    this.$("[data-rec-lock]").textContent = on ? "●" : "🔒";
  }

  setStep(n) {
    this.shadowRoot.querySelectorAll(".steps .s").forEach((s) => {
      const step = +s.dataset.step;
      s.classList.toggle("done", step < n);
      s.classList.toggle("active", step === n);
    });
  }

  /* ---- wiring ------------------------------------------------------------ */
  bind() {
    this.$("[data-begin]").addEventListener("click", () => this.beginCapture());
    this.$("[data-complete]").addEventListener("click", () => this.completeCapture());
    this.$("[data-reset]").addEventListener("click", () => this.reset());

    const pan = this.$("[data-pan]");
    pan.addEventListener("input", (e) => {
      let v = e.target.value.replace(/\D/g, "").slice(0, 16);
      e.target.value = v.replace(/(.{4})/g, "$1 ").trim();
      this.$("[data-pan-hint]").textContent = v.length >= 12 ? "· entered securely" : "";
    });
    this.$("[data-exp]").addEventListener("input", (e) => {
      let v = e.target.value.replace(/\D/g, "").slice(0, 4);
      e.target.value = v.length > 2 ? v.slice(0, 2) + " / " + v.slice(2) : v;
    });
    this.$("[data-cvv]").addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4);
    });
  }

  async beginCapture() {
    this.$("[data-begin]").disabled = true;
    this.log({ op: "agentContact.pauseRecording({ interactionId })", dir: "req", desc: "Agent initiated PCI capture", kind: "pause" });
    try {
      await this.controller.pause(this.interactionId);
      this.paintRecording(false);
      this.setStep(2);
      this.$("[data-form]").classList.remove("locked");
      this.$("[data-name]").focus();
      this.$("[data-complete]").disabled = false;
      this.log({ op: "→ 200 OK · isRecording=false", dir: "res", desc: "PAN entry window open — recording suppressed", kind: "pause" });
    } catch (err) {
      this.$("[data-begin]").disabled = false;
      this.log({ op: "✕ pauseRecording failed", dir: "res", desc: String(err) });
    }
  }

  async completeCapture() {
    this.$("[data-complete]").disabled = true;
    const last4 = this.$("[data-pan]").value.replace(/\D/g, "").slice(-4) || "0000";
    this.log({ op: "payment gateway → tokenize(PAN)", dir: "req", desc: "Hosted fields → token (PAN never touches WxCC)" });
    await delay(360);
    const tok = "tok_" + guid().replace(/-/g, "").slice(0, 16);
    this.log({ op: `token = "${tok}"`, dir: "res", desc: `Card ···· ${last4} · authorized` });

    this.log({ op: "agentContact.resumeRecording({ interactionId, data:{ autoResumed:false } })", dir: "req", desc: "Capture complete — restoring recording", kind: "resume" });
    try {
      await this.controller.resume(this.interactionId);
      this.paintRecording(true);
      this.setStep(3);
      this.$("[data-form]").classList.add("locked");
      const token = this.$("[data-token]");
      token.classList.add("show");
      token.innerHTML = `Payment tokenized &amp; recording resumed. Token <code>${tok}</code> · card ···· ${last4}. No PAN in recording or in WxCC.`;
      this.log({ op: "→ 200 OK · isRecording=true", dir: "res", desc: "Recording restored for wrap-up", kind: "resume" });
    } catch (err) {
      this.log({ op: "✕ resumeRecording failed", dir: "res", desc: String(err) });
    }
  }

  reset() {
    ["[data-name]", "[data-pan]", "[data-exp]", "[data-cvv]"].forEach((s) => (this.$(s).value = ""));
    this.$("[data-form]").classList.add("locked");
    this.$("[data-token]").classList.remove("show");
    this.paintRecording(true);
    this.setStep(1);
    this.$("[data-begin]").disabled = false;
    this.$("[data-complete]").disabled = true;
    this.$("[data-log]").innerHTML = '<div class="empty" data-log-empty>SDK events will appear here as the call progresses.</div>';
    this.resolveInteraction();
  }
}

customElements.define("pci-capture-widget", PciCaptureWidget);
export default PciCaptureWidget;
