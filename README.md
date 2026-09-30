# PCI Capture Widget — Webex Contact Center Agent Desktop

A custom web component, `<pci-capture-widget>`, that demonstrates the **PCI
pause/resume recording pattern** in the Webex Contact Center (WxCC) Agent
Desktop: while an agent collects a customer's card details, call recording is
paused so the PAN and CVV never enter the recording; when the agent is done,
recording resumes automatically. Every recording action is written to an
on-screen compliance trail.

It runs in two modes, auto-detected at load:

- **Live** — inside the WxCC Agent Desktop it calls the real
  `@wxcc-desktop/sdk` (`pauseRecording` / `resumeRecording`) against the active
  interaction.
- **Simulation** — anywhere else (a laptop, GitHub Pages) it mocks those calls
  so the recording-state story still demos with no live interaction. A pill in
  the top-right of the compliance panel shows which mode is active.

---

## What it does

- **Focus-driven secure zone.** The whole payment form is one zone. Recording
  pauses when focus enters the form and resumes only when focus leaves it
  entirely — moving between fields (name → number → expiry → CVV) keeps
  recording paused, so CVV is never entered while recording is live, and the
  recording API is called once on the way in and once on the way out rather
  than on every field.
- **Wait-for-confirmed-pause guard.** Card fields stay read-only ("Securing…")
  until `pauseRecording` actually resolves, so no keystroke can land while
  recording is still live. If the pause **fails**, the fields never unlock and
  the agent is told not to collect card data — it fails safe.
- **PAN masking.** While typing, the agent sees the grouped digits; the moment
  focus leaves the card-number field it collapses to a masked view showing only
  the last four (`#### #### #### 1234`). The real number is held separately from
  the masked display, so tokenization still uses the correct value.
- **Tokenization stub.** On completion the widget simulates a hosted-fields
  gateway returning a token, to model the real production flow (see
  *Production notes*).
- **Compliance trail.** A timestamped log of every SDK request/response —
  `getTaskMap`, `pauseRecording`, `resumeRecording` — plus the tokenization
  step, for the audit story.

## Configuration

All knobs are near the top of `src/pci-capture-widget.js`:

| Knob | Default | Effect |
|------|---------|--------|
| `REQUIRE_CONFIRMED_PAUSE` | `true` | Read-only guard until pause confirms. Set `false` for instant-focus (no guard). Also overridable per-instance with the `confirmed-pause="off"` attribute in the layout. |
| `MASK_CHAR` | `"#"` | Masking glyph. `"•"` or `"*"` are the more common conventions. |
| `REVEAL_LAST` | `4` | Digits shown unmasked. `4` is the industry norm (PCI DSS 3.3 caps display at BIN + last 4). Set `2` for last-two. |

## Build

```bash
npm install
npm run build        # → dist/pci-capture-widget.js  (SDK bundled in, ~340KB)
```

The single `dist/pci-capture-widget.js` file is the whole widget — that is what
you host and reference from the layout.

## Test standalone

```bash
npm run preview      # or open index.html after building
```

Opens in **simulation mode**. Click into the payment form → amber "Securing…"
while the (simulated) pause resolves → fields unlock, state turns green,
recording paused. Fill the card, click away → it tokenizes and resumes.

## Host it

Commit `dist/pci-capture-widget.js` to the **root** of the repo on `main`, then
reference it by one of:

- **jsDelivr** (serves committed repo files with correct JS MIME + CORS, no
  setup): `https://cdn.jsdelivr.net/gh/ciscoacdave/wxcc-pci-capture@main/pci-capture-widget.js`
- **GitHub Pages** (enable Pages → Deploy from branch → `main` / root):
  `https://ciscoacdave.github.io/wxcc-pci-capture/pci-capture-widget.js`

Note: `raw.githubusercontent.com` and `github.com/.../blob/...` URLs will **not**
work as a `script` source (wrong MIME / HTML wrapper). jsDelivr caches `@main`
for up to 12h — pin a commit SHA (`@<sha>`) or purge via
`https://purge.jsdelivr.net/gh/ciscoacdave/wxcc-pci-capture@main/pci-capture-widget.js`
while iterating.

## Wire into the Desktop Layout

In Control Hub → **Desktop Layouts**, add a tab pair to the `panel` area's
`md-tabs` children, then upload the JSON and assign it to the team:

```jsonc
{
  "comp": "md-tab",
  "attributes": { "slot": "tab", "class": "widget-pane-tab" },
  "children": [ { "comp": "span", "textContent": "Secure Payment" } ]
},
{
  "comp": "md-tab-panel",
  "attributes": { "slot": "panel", "class": "widget-pane" },
  "children": [
    {
      "comp": "pci-capture-widget",
      "script": "https://cdn.jsdelivr.net/gh/ciscoacdave/wxcc-pci-capture@main/pci-capture-widget.js",
      "attributes": {
        "interaction-id": "$STORE.agentContact.taskSelected.interactionId"
      },
      "wrapper": { "title": "Secure Payment", "maximizeAreaName": "app-maximize-area" }
    }
  ]
}
```

Notes:

- `comp` (`pci-capture-widget`) must match the `customElements.define(...)` name
  at the bottom of the source.
- `interaction-id` is **optional** — if omitted or empty, the widget resolves
  the active interaction via `Desktop.actions.getTaskMap()` on its own. Confirm
  the STORE path for the selected task's interaction id against your tenant's
  schema if you bind it explicitly.
- Add `"confirmed-pause": "off"` to `attributes` to demo the instant-focus
  behavior without rebuilding.

## Prerequisites for live pause/resume

- The agent's recording mode must allow pausing — **On Demand** or **Always
  with Pause/Resume** (not fixed full-call).
- Pause/resume is **not valid during consult or conference** legs — script the
  demo as a straight inbound call.

## Demo script

1. **Start on a live call.** Recording banner is red and pulsing.
2. **Click into the payment form.** Fields go read-only, banner and form ring
   turn amber ("Securing…"), the rail logs *fields locked · awaiting confirmed
   pause* then *pauseRecording → 200 OK*. Fields unlock, everything turns green.
3. **Type the card number, tab through expiry/CVV.** Recording stays paused the
   whole time. Tab off the card-number field → it masks to `#### #### #### 1234`.
4. **Click away from the form.** The rail logs the tokenization and
   *resumeRecording → 200 OK*; banner returns to red.
5. **Failure path (optional).** To show fail-safe behavior, point the live SDK
   at an interaction that can't be paused (or temporarily force the `sim`
   controller's `pause` to reject): fields stay locked, banner turns red, rail
   logs *pauseRecording failed — fields stay locked*.

## Production notes

This is a **demo** — no card data leaves the browser and nothing is stored.
For a production build:

- Replace the demo card form with a **PCI-DSS compliant hosted-fields gateway**
  that tokenizes the PAN. Pausing recording keeps the PAN out of the recording;
  tokenization keeps it out of WxCC. The widget only orchestrates.
- **Never store CVV** — PCI prohibits retaining it. (The demo does not persist
  any field; the CVV entry is display-only and discarded.)
- Consider the trade-off between the SDK-driven pause (agent context, instant)
  and a backend/REST-driven resume (`POST /v1/tasks/{interactionId}/record/resume`)
  in a `finally`, so recording is always restored even if the agent's browser
  dies mid-capture.

## Files

```
src/pci-capture-widget.js   the web component (UI + SDK controller + sim + masking)
vite.config.js              single-file IIFE build
index.html                  standalone test harness
dist/pci-capture-widget.js  built bundle (after npm run build) — this is what you host
```
