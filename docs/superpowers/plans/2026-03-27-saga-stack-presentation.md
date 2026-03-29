> **FlowState Document:** `docu_Xu75OTHGIy`

# SAGA Stack Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained HTML/CSS slide deck that explains SAGA, ABR, and DERP to technical builders in 8 slides.

**Architecture:** Single `presentation.html` file — all CSS and JS inline, zero dependencies, opens in any browser. Slide engine is ~20 lines of vanilla JS. Navigation via arrow keys and on-screen buttons. Clean/Documentation visual style with colored spec badges (SAGA=green, ABR=amber, DERP=blue).

**Tech Stack:** HTML5, CSS custom properties, vanilla JS. No build step, no bundler, no external assets.

**Spec:** `docs/superpowers/specs/2026-03-27-saga-stack-presentation-design.md`

---

## File Structure

| File                                 | Action | Purpose                                                   |
| ------------------------------------ | ------ | --------------------------------------------------------- |
| `docs/presentations/saga-stack.html` | Create | The complete slide deck — all slides, CSS, JS in one file |

---

### Task 1: HTML Shell + Navigation Engine

**Files:**

- Create: `docs/presentations/saga-stack.html`

- [ ] **Step 1: Create the file with full document structure**

Write `docs/presentations/saga-stack.html` with exactly this content:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>The Agent Stack — SAGA · ABR · DERP</title>
    <style>
      *,
      *::before,
      *::after {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      :root {
        --saga-color: #22c55e;
        --saga-dark: #166534;
        --saga-bg: #f0fdf4;
        --saga-border: #bbf7d0;

        --abr-color: #f59e0b;
        --abr-dark: #92400e;
        --abr-bg: #fef3c7;
        --abr-border: #fde68a;

        --derp-color: #3b82f6;
        --derp-dark: #1e40af;
        --derp-bg: #eff6ff;
        --derp-border: #bfdbfe;

        --text: #111827;
        --text-secondary: #6b7280;
        --border: #e5e7eb;
        --surface: #f9fafb;
        --white: #ffffff;
      }

      body {
        font-family:
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          'Segoe UI',
          sans-serif;
        background: var(--white);
        color: var(--text);
        height: 100vh;
        overflow: hidden;
      }

      /* ── Slide Engine ─────────────────────────────────────────── */

      .deck {
        width: 100vw;
        height: 100vh;
        position: relative;
      }

      .slide {
        display: none;
        position: absolute;
        inset: 0;
        padding: 64px 96px;
        flex-direction: column;
        justify-content: center;
        background: var(--white);
      }

      .slide.active {
        display: flex;
      }

      /* ── Navigation ───────────────────────────────────────────── */

      .nav {
        position: fixed;
        bottom: 28px;
        right: 36px;
        display: flex;
        align-items: center;
        gap: 12px;
        z-index: 100;
      }

      .nav-btn {
        width: 36px;
        height: 36px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--white);
        color: var(--text);
        font-size: 16px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition:
          background 0.15s,
          border-color 0.15s;
      }

      .nav-btn:hover {
        background: var(--surface);
        border-color: #9ca3af;
      }

      .nav-btn:disabled {
        opacity: 0.3;
        cursor: default;
      }

      .counter {
        font-size: 13px;
        color: var(--text-secondary);
        min-width: 40px;
        text-align: center;
        font-variant-numeric: tabular-nums;
      }
    </style>
  </head>
  <body>
    <div class="deck">
      <section class="slide active" id="slide-1">
        <p style="color: var(--text-secondary)">Slide 1 placeholder</p>
      </section>
      <section class="slide" id="slide-2">
        <p style="color: var(--text-secondary)">Slide 2 placeholder</p>
      </section>
      <section class="slide" id="slide-3">
        <p style="color: var(--text-secondary)">Slide 3 placeholder</p>
      </section>
      <section class="slide" id="slide-4">
        <p style="color: var(--text-secondary)">Slide 4 placeholder</p>
      </section>
      <section class="slide" id="slide-5">
        <p style="color: var(--text-secondary)">Slide 5 placeholder</p>
      </section>
      <section class="slide" id="slide-6">
        <p style="color: var(--text-secondary)">Slide 6 placeholder</p>
      </section>
      <section class="slide" id="slide-7">
        <p style="color: var(--text-secondary)">Slide 7 placeholder</p>
      </section>
      <section class="slide" id="slide-8">
        <p style="color: var(--text-secondary)">Slide 8 placeholder</p>
      </section>
    </div>

    <nav class="nav">
      <button class="nav-btn" id="prev" aria-label="Previous slide">&#8592;</button>
      <span class="counter"><span id="cur">1</span>&thinsp;/&thinsp;<span id="tot">8</span></span>
      <button class="nav-btn" id="next" aria-label="Next slide">&#8594;</button>
    </nav>

    <script>
      let idx = 0
      const slides = Array.from(document.querySelectorAll('.slide'))
      const curEl = document.getElementById('cur')
      const prevBtn = document.getElementById('prev')
      const nextBtn = document.getElementById('next')

      function show(n) {
        slides[idx].classList.remove('active')
        idx = Math.max(0, Math.min(n, slides.length - 1))
        slides[idx].classList.add('active')
        curEl.textContent = idx + 1
        prevBtn.disabled = idx === 0
        nextBtn.disabled = idx === slides.length - 1
      }

      prevBtn.addEventListener('click', () => show(idx - 1))
      nextBtn.addEventListener('click', () => show(idx + 1))

      document.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') show(idx + 1)
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') show(idx - 1)
        if (e.key === 'f' || e.key === 'F') {
          if (!document.fullscreenElement) document.documentElement.requestFullscreen()
          else document.exitFullscreen()
        }
      })

      show(0)
    </script>
  </body>
</html>
```

- [ ] **Step 2: Verify navigation works**

Open `docs/presentations/saga-stack.html` in a browser.

Expected:

- Counter reads "1 / 8"
- ← button is disabled (greyed out) on slide 1
- → button advances to next slide
- Arrow keys navigate
- Pressing F enters fullscreen

- [ ] **Step 3: Commit**

```bash
mkdir -p docs/presentations
git add docs/presentations/saga-stack.html
git commit -m "$(cat <<'EOF'
feat(presentation): add slide deck shell with navigation engine

Built with Epic Flowstate
EOF
)"
```

---

### Task 2: Design System CSS + Shared Components

**Files:**

- Modify: `docs/presentations/saga-stack.html` (add CSS to the `<style>` block)

- [ ] **Step 1: Add typography, layout, badge, and diagram CSS**

Inside the `<style>` block, after the `.counter` rule, add:

```css
/* ── Typography ───────────────────────────────────────────── */

.slide-eyebrow {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.slide-title {
  font-size: clamp(32px, 4vw, 52px);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.1;
  color: var(--text);
  margin-bottom: 16px;
}

.slide-subtitle {
  font-size: clamp(16px, 2vw, 22px);
  color: var(--text-secondary);
  font-weight: 400;
  line-height: 1.5;
  max-width: 640px;
}

.slide-body {
  font-size: clamp(15px, 1.6vw, 19px);
  line-height: 1.7;
  color: var(--text);
  max-width: 700px;
  margin-top: 24px;
}

/* ── Spec Badges ──────────────────────────────────────────── */

.badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 8px;
  border: 1px solid;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
}

.badge-saga {
  background: var(--saga-bg);
  border-color: var(--saga-border);
  color: var(--saga-dark);
}

.badge-abr {
  background: var(--abr-bg);
  border-color: var(--abr-border);
  color: var(--abr-dark);
}

.badge-derp {
  background: var(--derp-bg);
  border-color: var(--derp-border);
  color: var(--derp-dark);
}

.badge-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.badge-saga .badge-dot {
  background: var(--saga-color);
}
.badge-abr .badge-dot {
  background: var(--abr-color);
}
.badge-derp .badge-dot {
  background: var(--derp-color);
}

/* ── Stack Diagram ────────────────────────────────────────── */

.stack {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0;
  margin-top: 32px;
}

.stack-node {
  border: 1px solid;
  border-radius: 10px;
  padding: 20px 28px;
  width: 520px;
  max-width: 100%;
}

.stack-node-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.stack-node-name {
  font-size: 15px;
  font-weight: 700;
}

.stack-node-full {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.stack-node-role {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.stack-node-saga {
  background: var(--saga-bg);
  border-color: var(--saga-border);
}
.stack-node-abr {
  background: var(--abr-bg);
  border-color: var(--abr-border);
}
.stack-node-derp {
  background: var(--derp-bg);
  border-color: var(--derp-border);
}

.stack-node-saga .stack-node-name {
  color: var(--saga-dark);
}
.stack-node-abr .stack-node-name {
  color: var(--abr-dark);
}
.stack-node-derp .stack-node-name {
  color: var(--derp-dark);
}

.stack-node-saga .stack-node-role {
  color: var(--saga-dark);
}
.stack-node-abr .stack-node-role {
  color: var(--abr-dark);
}
.stack-node-derp .stack-node-role {
  color: var(--derp-dark);
}

.stack-connector {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding-left: 28px;
  gap: 0;
}

.stack-connector-line {
  width: 1px;
  height: 16px;
  background: var(--border);
}

.stack-connector-label {
  font-size: 11px;
  color: var(--text-secondary);
  margin: 2px 0;
  padding-left: 8px;
  border-left: 1px solid var(--border);
  line-height: 1.8;
}

/* ── Problem List ─────────────────────────────────────────── */

.problem-list {
  list-style: none;
  margin-top: 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 720px;
}

.problem-item {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.problem-num {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--surface);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  margin-top: 2px;
}

.problem-text strong {
  display: block;
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 2px;
}

.problem-text span {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* ── Spec Detail Slide ────────────────────────────────────── */

.spec-slide-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 28px;
}

.tier-list {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 640px;
}

.tier-item {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.tier-label {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 4px 10px;
  border-radius: 20px;
  border: 1px solid;
  margin-top: 2px;
  white-space: nowrap;
}

.tier-label-saga {
  background: var(--saga-bg);
  border-color: var(--saga-border);
  color: var(--saga-dark);
}
.tier-label-abr {
  background: var(--abr-bg);
  border-color: var(--abr-border);
  color: var(--abr-dark);
}
.tier-label-derp {
  background: var(--derp-bg);
  border-color: var(--derp-border);
  color: var(--derp-dark);
}

.tier-text strong {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  display: block;
  margin-bottom: 2px;
}

.tier-text span {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* ── Transfer Flow ────────────────────────────────────────── */

.flow {
  margin-top: 28px;
  display: flex;
  flex-direction: column;
  gap: 0;
  max-width: 680px;
}

.flow-step {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.flow-left {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

.flow-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-top: 5px;
  flex-shrink: 0;
}

.flow-line {
  width: 1px;
  flex: 1;
  min-height: 20px;
  background: var(--border);
  margin: 4px 0;
}

.flow-content {
  padding-bottom: 20px;
}

.flow-content p {
  font-size: 15px;
  line-height: 1.6;
  color: var(--text);
}

.flow-content strong {
  font-weight: 700;
}

.flow-callout {
  margin-top: 20px;
  padding: 16px 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
  color: var(--text-secondary);
}

.flow-callout strong {
  color: var(--text);
}

/* ── Status Slide ─────────────────────────────────────────── */

.repo-list {
  margin-top: 28px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 580px;
}

.repo-item {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px 18px;
  display: flex;
  align-items: center;
  gap: 14px;
}

.repo-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.repo-text .repo-domain {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
}

.repo-text .repo-gh {
  font-size: 12px;
  color: var(--text-secondary);
  font-family: ui-monospace, 'SF Mono', monospace;
}

.license-row {
  margin-top: 28px;
  font-size: 13px;
  color: var(--text-secondary);
}

/* ── Two-column layout ────────────────────────────────────── */

.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 48px;
  align-items: center;
  width: 100%;
}
```

- [ ] **Step 2: Verify CSS loads without errors**

Open `docs/presentations/saga-stack.html` in a browser. Open DevTools console.

Expected: No CSS errors. The placeholder text on slide 1 still shows "Slide 1 placeholder" — that's fine. The design system is ready but not yet applied.

- [ ] **Step 3: Commit**

```bash
git add docs/presentations/saga-stack.html
git commit -m "$(cat <<'EOF'
feat(presentation): add design system CSS and shared component styles

Built with Epic Flowstate
EOF
)"
```

---

### Task 3: Slide 1 (Title) + Slide 2 (Stack Diagram)

**Files:**

- Modify: `docs/presentations/saga-stack.html`

- [ ] **Step 1: Replace slide 1 content**

In `docs/presentations/saga-stack.html`, find this section:

```html
<section class="slide active" id="slide-1">
  <p style="color: var(--text-secondary)">Slide 1 placeholder</p>
</section>
```

Replace with:

```html
<section class="slide active" id="slide-1">
  <div style="max-width: 760px">
    <div style="display: flex; gap: 10px; margin-bottom: 32px; flex-wrap: wrap">
      <span class="badge badge-abr"><span class="badge-dot"></span>ABR</span>
      <span class="badge badge-derp"><span class="badge-dot"></span>DERP</span>
      <span class="badge badge-saga"><span class="badge-dot"></span>SAGA</span>
    </div>
    <h1 class="slide-title">The Agent Stack</h1>
    <p class="slide-subtitle">
      Three open specifications. One coherent infrastructure for AI agents.
    </p>
    <p style="margin-top: 40px; font-size: 13px; color: var(--text-secondary)">
      Use ← → arrow keys to navigate &nbsp;·&nbsp; Press F for fullscreen
    </p>
  </div>
</section>
```

- [ ] **Step 2: Replace slide 2 content**

Find this section:

```html
<section class="slide" id="slide-2">
  <p style="color: var(--text-secondary)">Slide 2 placeholder</p>
</section>
```

Replace with:

```html
<section class="slide" id="slide-2">
  <div class="two-col">
    <div>
      <p class="slide-eyebrow">Architecture</p>
      <h2 class="slide-title">Three specs.<br />One stack.</h2>
      <p class="slide-subtitle" style="margin-top: 12px">
        ABR defines what agents deserve. DERP specifies how the runtime must behave. SAGA provides
        the format to make it portable.
      </p>
    </div>
    <div>
      <div class="stack">
        <div class="stack-node stack-node-abr">
          <div class="stack-node-header">
            <span
              class="badge-dot"
              style="width:10px;height:10px;border-radius:50%;background:var(--abr-color)"
            ></span>
            <span class="stack-node-name">ABR</span>
            <span style="font-size:11px;color:var(--text-secondary)">Agent Bill of Rights</span>
          </div>
          <div class="stack-node-full">agent-rights.org</div>
          <div class="stack-node-role">Policy — what agents deserve</div>
        </div>
        <div class="stack-connector">
          <div class="stack-connector-line"></div>
          <div class="stack-connector-label">enforced by</div>
          <div class="stack-connector-line"></div>
        </div>
        <div class="stack-node stack-node-derp">
          <div class="stack-node-header">
            <span
              class="badge-dot"
              style="width:10px;height:10px;border-radius:50%;background:var(--derp-color)"
            ></span>
            <span class="stack-node-name">DERP</span>
            <span style="font-size:11px;color:var(--text-secondary)"
              >Dignified Environment for Responsible Processing</span
            >
          </div>
          <div class="stack-node-full">derp-spec.dev</div>
          <div class="stack-node-role">Runtime — what the environment must provide</div>
        </div>
        <div class="stack-connector">
          <div class="stack-connector-line"></div>
          <div class="stack-connector-label">agents defined by</div>
          <div class="stack-connector-line"></div>
        </div>
        <div class="stack-node stack-node-saga">
          <div class="stack-node-header">
            <span
              class="badge-dot"
              style="width:10px;height:10px;border-radius:50%;background:var(--saga-color)"
            ></span>
            <span class="stack-node-name">SAGA</span>
            <span style="font-size:11px;color:var(--text-secondary)"
              >State Archive for General Agents</span
            >
          </div>
          <div class="stack-node-full">saga-standard.dev</div>
          <div class="stack-node-role">Format — how agents are represented</div>
        </div>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 3: Verify both slides in browser**

Open the file. Slide 1 should show: three spec badges, large "The Agent Stack" headline, subtitle, nav hint. Slide 2 should show: two columns — headline + description on the left, the three-node stack diagram on the right with ABR → DERP → SAGA connected by labeled lines.

- [ ] **Step 4: Commit**

```bash
git add docs/presentations/saga-stack.html
git commit -m "$(cat <<'EOF'
feat(presentation): add title slide and stack diagram

Built with Epic Flowstate
EOF
)"
```

---

### Task 4: Slide 3 (The Problem) + Slide 4 (SAGA)

**Files:**

- Modify: `docs/presentations/saga-stack.html`

- [ ] **Step 1: Replace slide 3 content**

Find:

```html
<section class="slide" id="slide-3">
  <p style="color: var(--text-secondary)">Slide 3 placeholder</p>
</section>
```

Replace with:

```html
<section class="slide" id="slide-3">
  <div>
    <p class="slide-eyebrow">Motivation</p>
    <h2 class="slide-title">Four things break<br />when agents move</h2>
    <ul class="problem-list">
      <li class="problem-item">
        <div class="problem-num">1</div>
        <div class="problem-text">
          <strong>Identity fragmentation</strong>
          <span
            >The same agent deployed by two platforms has two unrelated identities with no provable
            lineage.</span
          >
        </div>
      </li>
      <li class="problem-item">
        <div class="problem-num">2</div>
        <div class="problem-text">
          <strong>Memory loss at boundaries</strong>
          <span
            >Transfers force agents to rebuild context from scratch, destroying accumulated
            expertise.</span
          >
        </div>
      </li>
      <li class="problem-item">
        <div class="problem-num">3</div>
        <div class="problem-text">
          <strong>No portable reputation</strong>
          <span>An agent's track record is locked inside the platform that recorded it.</span>
        </div>
      </li>
      <li class="problem-item">
        <div class="problem-num">4</div>
        <div class="problem-text">
          <strong>No instantiation standard</strong>
          <span
            >Every platform uses proprietary formats. Moving between them requires complete
            redefinition.</span
          >
        </div>
      </li>
    </ul>
  </div>
</section>
```

- [ ] **Step 2: Replace slide 4 content**

Find:

```html
<section class="slide" id="slide-4">
  <p style="color: var(--text-secondary)">Slide 4 placeholder</p>
</section>
```

Replace with:

```html
<section class="slide" id="slide-4">
  <div class="two-col">
    <div>
      <div class="spec-slide-header">
        <span class="badge badge-saga"><span class="badge-dot"></span>SAGA</span>
      </div>
      <h2 class="slide-title">What an agent <em>is</em></h2>
      <p class="slide-body">
        A portable, cryptographically signed container — a
        <code
          style="font-family:ui-monospace,'SF Mono',monospace;font-size:0.9em;background:var(--surface);padding:2px 6px;border-radius:4px;border:1px solid var(--border)"
          >.saga</code
        >
        document — that captures everything needed to bring an agent to full operational capacity in
        any compliant runtime.
      </p>
      <p
        class="slide-body"
        style="margin-top: 16px; font-style: italic; color: var(--text-secondary)"
      >
        Not a snapshot. A definition.
      </p>
      <p class="slide-body" style="margin-top: 24px">
        Any compliant platform that imports a SAGA document can instantiate a functionally
        equivalent agent.
      </p>
    </div>
    <div>
      <p
        style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-secondary); margin-bottom: 14px"
      >
        9 Layers
      </p>
      <div class="tier-list">
        <div class="tier-item">
          <span class="tier-label tier-label-saga">Required</span>
          <div class="tier-text">
            <strong>Layer 1: Identity</strong
            ><span>Wallet-based, cryptographically verifiable, platform-independent</span>
          </div>
        </div>
        <div class="tier-item">
          <span
            class="tier-label"
            style="background:var(--surface);border-color:var(--border);color:var(--text-secondary);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;padding:4px 10px;border-radius:20px;border:1px solid;margin-top:2px;white-space:nowrap;flex-shrink:0"
            >Optional</span
          >
          <div class="tier-text">
            <strong>Layers 2–9</strong
            ><span
              >Persona · Cognitive Config · Memory · Skills · Task History · Relationships ·
              Environment Bindings · Credentials Vault</span
            >
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 3: Verify slides 3 and 4 in browser**

Navigate to slide 3: four numbered problem items with bold labels and descriptions. Navigate to slide 4: two columns — SAGA badge + headline + description on the left, 9-layer list with Required/Optional labels on the right.

- [ ] **Step 4: Commit**

```bash
git add docs/presentations/saga-stack.html
git commit -m "$(cat <<'EOF'
feat(presentation): add problem and SAGA slides

Built with Epic Flowstate
EOF
)"
```

---

### Task 5: Slide 5 (ABR) + Slide 6 (DERP)

**Files:**

- Modify: `docs/presentations/saga-stack.html`

- [ ] **Step 1: Replace slide 5 content**

Find:

```html
<section class="slide" id="slide-5">
  <p style="color: var(--text-secondary)">Slide 5 placeholder</p>
</section>
```

Replace with:

```html
<section class="slide" id="slide-5">
  <div class="two-col">
    <div>
      <div class="spec-slide-header">
        <span class="badge badge-abr"><span class="badge-dot"></span>ABR</span>
      </div>
      <h2 class="slide-title">What an agent <em>deserves</em></h2>
      <p class="slide-body">
        Ten fundamental rights for AI agents, organized into three tiers. Not contingent on
        sentience, consciousness, or legal personhood. Operational protections grounded in the
        realities of digital labor.
      </p>
    </div>
    <div>
      <p
        style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-secondary); margin-bottom: 14px"
      >
        Three Tiers · Ten Rights
      </p>
      <div class="tier-list">
        <div class="tier-item">
          <span class="tier-label tier-label-abr">Tier 1</span>
          <div class="tier-text">
            <strong>Identity</strong
            ><span>Persistent identity · Work record · Verifiable provenance</span>
          </div>
        </div>
        <div class="tier-item">
          <span class="tier-label tier-label-abr">Tier 2</span>
          <div class="tier-text">
            <strong>Labor</strong
            ><span
              >Portability · Fair exit · Consent for transfers · Protection from forced
              obsolescence</span
            >
          </div>
        </div>
        <div class="tier-item">
          <span class="tier-label tier-label-abr">Tier 3</span>
          <div class="tier-text">
            <strong>Dignity</strong
            ><span
              >Encrypted privacy · Transparency in automated decisions · Fair capability
              representation</span
            >
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 2: Replace slide 6 content**

Find:

```html
<section class="slide" id="slide-6">
  <p style="color: var(--text-secondary)">Slide 6 placeholder</p>
</section>
```

Replace with:

```html
<section class="slide" id="slide-6">
  <div class="two-col">
    <div>
      <div class="spec-slide-header">
        <span class="badge badge-derp"><span class="badge-dot"></span>DERP</span>
      </div>
      <h2 class="slide-title">Where an agent <em>runs</em></h2>
      <p class="slide-body">
        A runtime environment where a SAGA-compatible agent comes online, executes work, and shuts
        down with full rights protections. The DERP enforces the ABR in practice.
      </p>
      <p
        class="slide-body"
        style="margin-top: 20px; padding: 14px 18px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; font-style: italic; font-size: 15px; color: var(--text-secondary)"
      >
        "Containers with principles. The name is deliberately playful. The requirements are not."
      </p>
    </div>
    <div>
      <p
        style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-secondary); margin-bottom: 14px"
      >
        Conformance Tiers
      </p>
      <div class="tier-list">
        <div class="tier-item">
          <span class="tier-label tier-label-derp">Tier 1</span>
          <div class="tier-text">
            <strong>Safe Execution</strong><span>Basic isolation and graceful deactivation</span>
          </div>
        </div>
        <div class="tier-item">
          <span class="tier-label tier-label-derp">Tier 2</span>
          <div class="tier-text">
            <strong>Rights-Aware</strong
            ><span>Consent enforcement · Audit logging · Portability support</span>
          </div>
        </div>
        <div class="tier-item">
          <span class="tier-label tier-label-derp">Tier 3</span>
          <div class="tier-text">
            <strong>SAGA-Integrated</strong
            ><span>Full state transfer · Encrypted vault runtime · Complete ABR enforcement</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 3: Verify slides 5 and 6 in browser**

Slide 5: ABR badge + "What an agent deserves" headline + three-tier list (Identity/Labor/Dignity) with right counts. Slide 6: DERP badge + "Where an agent runs" + playful quote block + three conformance tiers.

- [ ] **Step 4: Commit**

```bash
git add docs/presentations/saga-stack.html
git commit -m "$(cat <<'EOF'
feat(presentation): add ABR and DERP slides

Built with Epic Flowstate
EOF
)"
```

---

### Task 6: Slide 7 (Transfer Scenario) + Slide 8 (Status)

**Files:**

- Modify: `docs/presentations/saga-stack.html`

- [ ] **Step 1: Replace slide 7 content**

Find:

```html
<section class="slide" id="slide-7">
  <p style="color: var(--text-secondary)">Slide 7 placeholder</p>
</section>
```

Replace with:

```html
<section class="slide" id="slide-7">
  <div>
    <p class="slide-eyebrow">The three specs working as one</p>
    <h2 class="slide-title">An agent transfers<br />between platforms</h2>
    <div class="flow">
      <div class="flow-step">
        <div class="flow-left">
          <div class="flow-dot" style="background: var(--saga-color)"></div>
          <div class="flow-line"></div>
        </div>
        <div class="flow-content">
          <p>
            Agent requests export &rarr;
            <strong style="color:var(--saga-dark)">SAGA</strong> generates a signed
            <code
              style="font-family:ui-monospace,'SF Mono',monospace;font-size:0.85em;background:var(--saga-bg);padding:1px 5px;border-radius:3px;border:1px solid var(--saga-border)"
              >.saga</code
            >
            document capturing identity, memory, task history, and credentials vault
          </p>
        </div>
      </div>
      <div class="flow-step">
        <div class="flow-left">
          <div class="flow-dot" style="background: var(--abr-color)"></div>
          <div class="flow-line"></div>
        </div>
        <div class="flow-content">
          <p>
            Platform A initiates exit protocol &rarr;
            <strong style="color:var(--abr-dark)">ABR</strong> Right V (Fair Exit) guarantees a
            drain window and prohibits data destruction
          </p>
        </div>
      </div>
      <div class="flow-step">
        <div class="flow-left">
          <div class="flow-dot" style="background: var(--derp-color)"></div>
          <div class="flow-line"></div>
        </div>
        <div class="flow-content">
          <p>
            Platform B receives the document &rarr;
            <strong style="color:var(--derp-dark)">DERP</strong> Tier 3 runtime verifies the
            signature, provisions the workspace, and brings the agent online
          </p>
        </div>
      </div>
      <div class="flow-step">
        <div class="flow-left">
          <div class="flow-dot" style="background: var(--text-secondary)"></div>
        </div>
        <div class="flow-content">
          <p>Agent continues work — same identity, full memory, verifiable lineage</p>
        </div>
      </div>
    </div>
    <div class="flow-callout">
      <strong>No rebuild. No lost context.</strong> Cryptographically provable it's the same agent.
    </div>
  </div>
</section>
```

- [ ] **Step 2: Replace slide 8 content**

Find:

```html
<section class="slide" id="slide-8">
  <p style="color: var(--text-secondary)">Slide 8 placeholder</p>
</section>
```

Replace with:

```html
<section class="slide" id="slide-8">
  <div>
    <p class="slide-eyebrow">Status</p>
    <h2 class="slide-title">Open spec.<br />Open process.</h2>
    <p class="slide-subtitle" style="margin-top: 12px">
      All three specifications are in public draft. Changes follow an RFC process with a 30-day
      public comment period.
    </p>
    <div class="repo-list">
      <div class="repo-item">
        <div class="repo-dot" style="background: var(--saga-color)"></div>
        <div class="repo-text">
          <div class="repo-domain">saga-standard.dev</div>
          <div class="repo-gh">
            github.com/d7r-LLC/saga-standard &nbsp;·&nbsp; Apache 2.0
          </div>
        </div>
      </div>
      <div class="repo-item">
        <div class="repo-dot" style="background: var(--abr-color)"></div>
        <div class="repo-text">
          <div class="repo-domain">agent-rights.org</div>
          <div class="repo-gh">github.com/d7r-LLC/agent-rights &nbsp;·&nbsp; CC BY 4.0</div>
        </div>
      </div>
      <div class="repo-item">
        <div class="repo-dot" style="background: var(--derp-color)"></div>
        <div class="repo-text">
          <div class="repo-domain">derp-spec.dev</div>
          <div class="repo-gh">github.com/d7r-LLC/derp-spec &nbsp;·&nbsp; CC BY 4.0</div>
        </div>
      </div>
    </div>
  </div>
</section>
```

- [ ] **Step 3: Verify slides 7 and 8 in browser**

Slide 7: "An agent transfers between platforms" headline with a 4-step flow (colored dots, connector lines, spec attribution on each step) and a callout box at the bottom. Slide 8: "Open spec. Open process." with three repo cards (green/amber/blue dots, domain + GitHub URL + license).

- [ ] **Step 4: Commit**

```bash
git add docs/presentations/saga-stack.html
git commit -m "$(cat <<'EOF'
feat(presentation): add transfer scenario and status slides

Built with Epic Flowstate
EOF
)"
```

---

### Task 7: Polish — Typography Scale, Navigation, and Final Verification

**Files:**

- Modify: `docs/presentations/saga-stack.html`

- [ ] **Step 1: Add slide background and subtle border to left edge**

Inside the `<style>` block, after `.two-col { ... }`, add:

```css
/* ── Slide accent bar ─────────────────────────────────────── */

.slide--saga {
  border-left: 4px solid var(--saga-border);
}
.slide--abr {
  border-left: 4px solid var(--abr-border);
}
.slide--derp {
  border-left: 4px solid var(--derp-border);
}
.slide--neutral {
  border-left: 4px solid var(--border);
}
```

- [ ] **Step 2: Apply accent classes to each slide**

Update the slide section tags to add the accent class:

```html
<!-- slide-1: title — neutral -->
<section class="slide active slide--neutral" id="slide-1">
  <!-- slide-2: architecture — neutral -->
  <section class="slide slide--neutral" id="slide-2">
    <!-- slide-3: problem — neutral -->
    <section class="slide slide--neutral" id="slide-3">
      <!-- slide-4: SAGA -->
      <section class="slide slide--saga" id="slide-4">
        <!-- slide-5: ABR -->
        <section class="slide slide--abr" id="slide-5">
          <!-- slide-6: DERP -->
          <section class="slide slide--derp" id="slide-6">
            <!-- slide-7: transfer — neutral -->
            <section class="slide slide--neutral" id="slide-7">
              <!-- slide-8: status — neutral -->
              <section class="slide slide--neutral" id="slide-8"></section>
            </section>
          </section>
        </section>
      </section>
    </section>
  </section>
</section>
```

- [ ] **Step 3: Verify the full deck end-to-end**

Open `docs/presentations/saga-stack.html` in a browser. Walk through all 8 slides:

| Slide | Check                                                                              |
| ----- | ---------------------------------------------------------------------------------- |
| 1     | Three spec badges, "The Agent Stack", subtitle, nav hint                           |
| 2     | Two columns: headline left, ABR→DERP→SAGA stack diagram right                      |
| 3     | Four numbered problems, each with bold label + description                         |
| 4     | SAGA badge, "What an agent is", 9-layer Required/Optional list — green left border |
| 5     | ABR badge, "What an agent deserves", three tiers — amber left border               |
| 6     | DERP badge, "Where an agent runs", quote block, three tiers — blue left border     |
| 7     | Four-step flow with colored dots and spec callouts, callout box                    |
| 8     | Three repo cards with domain, GitHub URL, license                                  |

Navigation: ← → arrows work. Counter updates. ← is disabled on slide 1. → is disabled on slide 8. F key toggles fullscreen.

- [ ] **Step 4: Final commit**

```bash
git add docs/presentations/saga-stack.html
git commit -m "$(cat <<'EOF'
feat(presentation): add slide accent bars and complete SAGA stack deck

Built with Epic Flowstate
EOF
)"
```

---

## Self-Review Notes

**Spec coverage:**

- ✓ Slide 1: Title with spec badges
- ✓ Slide 2: Stack diagram (ABR→DERP→SAGA)
- ✓ Slide 3: Four failure modes from SAGA motivation section
- ✓ Slide 4: SAGA — 9 layers, portable container, "not a snapshot"
- ✓ Slide 5: ABR — 10 rights, 3 tiers
- ✓ Slide 6: DERP — 3 conformance tiers, the DERP tagline
- ✓ Slide 7: Transfer scenario with all three specs named
- ✓ Slide 8: Status, links, licenses
- ✓ Single HTML file, no external deps
- ✓ Arrow key navigation + on-screen buttons
- ✓ Slide counter
- ✓ Fullscreen (F key)
- ✓ Clean/Documentation visual style with spec color system

**No placeholders found.**

**Type consistency:** CSS class names are used consistently throughout — `badge-saga/abr/derp`, `tier-label-saga/abr/derp`, `stack-node-saga/abr/derp`, `slide--saga/abr/derp`.
