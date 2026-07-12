# FF-MKT-1 — design-expert review findings

Reviewer: design-expert · 2026-07-12 · File reviewed: `marketing/landing/index.html`

Scope: visual quality/minimal-clean direction, RTL correctness (highest-risk area), WCAG 2.2 AA
(`a11y-audit` skill — no Bash tool available this session, so contrast ratios below are hand-computed
using the same sRGB relative-luminance formula the skill's `contrast_checker.py` uses, cross-checked
against the skill's `references/wcag-quick-ref.md`).

## Fixes applied directly (safe, no new palette/tokens — repo has no design-tokens package yet per
`ops/PRODUCT.md` "Design tokens package: not present in repo")

1. `marketing/landing/index.html:282` — `.privacy-section { border-left: 4px solid #1a1a1a }` was a
   physical property. In the default Hebrew/RTL render the accent bar sat on the visual **left** =
   the logical **end** edge (a trailing accent, not the intended leading one) — RTL mirroring defect.
   Fix: `border-left` → `border-inline-start`.
2. `:559` — matching dark-mode override `border-left-color: #666` → `border-inline-start-color: #666`.
3. `:218` `.hero-note { color: #999 }` on white background = 2.85:1, fails WCAG 1.4.3 (needs 4.5:1
   for normal text). Fix: `#999` → `#707070` (4.95:1 on white).
4. `:455` `.footer-copy { color: #999 }` on `#fafafa` background = 2.72:1, fails 1.4.3. Fix: `#999` →
   `#707070` (4.72:1 on `#fafafa`).
5. Dark-mode block (`prefers-color-scheme: dark`) had no override for `.hero-note`/`.footer-copy`, so
   the #707070 fix would have dropped dark-mode contrast below 4.5:1 (dark mode was previously passing
   at ~6.9–7:1 with the original `#999`). Added `.hero-note, .footer-copy { color: #999 }` inside the
   dark-mode media query to restore the passing value there.
6. `:498-504` Global `a:focus, button:focus, input:focus { outline: 2px solid #1a1a1a }` was ~1:1
   (invisible) against `.waitlist-section`'s `background: #1a1a1a` — same color. Fails WCAG 1.4.11
   (non-text contrast, 3:1 min) and 2.4.7 (focus visible). Fix: added
   `.waitlist-section a/button/input:focus { outline-color: #fff }` (17.8:1 against `#1a1a1a`).
7. Same defect recurred site-wide once `prefers-color-scheme: dark` flips the page background to
   `#0f0f0f` — outline stayed `#1a1a1a`, ~1.1:1 contrast. Fix: added `outline-color: #f5f5f5` inside
   the dark-mode media query (19.8:1 against `#0f0f0f`).
8. `:699` `#success-message` (waitlist submit confirmation) had no announcement mechanism — a screen
   reader user gets no signal when `.show` is toggled on submit. Fails WCAG 4.1.3 (Status Messages).
   Fix: added `role="status" aria-live="polite"`.
9. `:691` waitlist email `<input>` had no `autocomplete` attribute. Fails WCAG 1.3.5 (Identify Input
   Purpose, AA). Fix: added `autocomplete="email"`.

All 9 edits verified landed via post-edit grep (`border-inline-start`, `#707070`, `outline-color`,
`autocomplete`, `role="status"`).

## Findings handed back (not fixed here)

- **Hebrew content-quality (non-blocking, cross-confirmed by seo-specialist's sign-off on this same
  ticket thread):** `עברתיים` should be `עבריים`; `תנומה אוטומטית` isn't a real phrase (likely meant
  auto-numbering); `העלא` should be `העלה`; `מוזל עבור` reads oddly; `waitlist.desc`'s "וביקשנו לאנשי
  צוות שלנו" looks like a garbled mistranslation of "early-access opportunities." Present in both the
  static markup and the `strings.he` JS object — fix both. Route to marketing + copy-editing skill.
- **Minor RTL note (non-blocking):** `.lang-toggle { left: 1rem }` is a physical property, not
  `inset-inline-start`. It stays visually pinned top-left in both languages — reads as an intentional
  persistent-corner control, not a bug, but flagging for logical-property consistency if the token
  system formalizes later.
- **Polish (non-blocking):** `.lang-btn` border `#d0d0d0` and `.persona-card` border `#e0e0e0` are
  under the 3:1 non-text-contrast threshold (1.4.11) but decorative only — visible text labels on
  both carry sufficient contrast independently, so functional identification isn't impaired.
- Confirms seo-specialist's independent finding on the `.sr-only` hidden SEO block sitting outside any
  landmark and not participating in the `data-i18n` toggle (stays Hebrew even when `lang="en"` is
  active) — semantic/i18n nit, low impact since it's screen-reader-only content.

## Visual quality assessment (positive)

Consistent spacing scale (0.5/0.75/1/1.5/2/3rem), clear type hierarchy (h1 2.5rem → h2 2rem → h3
1.25–1.5rem → h4 1.125rem, consistent with a restrained minimal/clean palette (near-black text, white/
off-white surfaces, single accent color reused for CTAs/badges — no competing hues). `dir` toggle on
language switch is correct (`document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr'`). Heading
levels are sequential (h1→h2→h3→h4, no skips). Landmarks present and correctly used (header/nav/main/
section/footer). Responsive breakpoint at 768px collapses nav, stacks CTAs/form. Dark mode implemented
via `prefers-color-scheme` with (after this review's fixes) passing contrast throughout.
