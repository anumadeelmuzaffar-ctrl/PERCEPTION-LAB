# PERCEPTION LAB

An interactive single-page experiment in advertising perception and visual persuasion.
Same product, different story — explore how typography, colour, composition and
messaging rewrite what a product appears to be worth.

## Run locally

No build step, no dependencies, no paid APIs.

Option A — open directly:
  Double-click `index.html` (all features work from the file system in modern browsers).

Option B — local server (recommended, ensures content.json loads cleanly):
  python3 -m http.server 8000
  then visit http://localhost:8000

## Files

  index.html    — the experience (8 sections + footer)
  styles.css    — all styling, responsive rules, reduced-motion support
  script.js     — all interaction + the documented scoring model
  content.json  — central configuration: text, presets, weights, animation
  admin.html    — local admin panel (content / presets / animation / evaluation)
  admin.js      — admin logic, localStorage persistence, JSON import/export
  fonts/        — Figtree variable font

## What's inside

  1. Hero — blackout entry, staggered collage, floating + parallax
  2. Marquee — scroll-driven, reversible
  3. The Perception Lab — 5 hover/touch tiles + adjustable indicators
  4. You Decide — 5 full visual presets (luxury/affordable/youthful/clinical/exclusive)
  5. The Branding Mirror — live controls + scroll-linked interpolation
  6. Scrolling advertising gallery — sticky parallax depth
  7. Test Your Brand — upload/demo campaign, 5-step wizard, rule-based evaluation
  8. Before You Publish — checklist that changes the assessment + copyable summary

## Admin panel

Open `admin.html`. Changes persist to this browser's localStorage and apply on
reload of the site. They do NOT publish live or sync across devices — a production
deployment would need a backend with authentication and a database.

## Notes

- All campaigns and products are hypothetical demonstrations. No real brands.
- Evaluation results are illustrative self-assessments, not legal determinations
  or verified consumer studies.
- Uploaded images stay in your browser (max 5 MB, PNG/JPEG/WebP).
- `prefers-reduced-motion` is respected throughout.
