# TrueNorth · Design brief for Claude Design

Paste everything below the line into Claude Design as the first message. Attach the three SVG files from `docs/brand/` if the tool accepts files; otherwise let it recreate the mark from the description.

---

## What you are designing

TrueNorth is an internal strategic-execution app for ADITUM, a condominium-management software company in Costa Rica. Every morning an AI "Chief of Staff" reads the company's north-star goal, its objectives, projects and tasks (synced from Notion), works out what is late, blocked or at risk, and gives each person a short plan for the day with the reason behind every item. People can dictate status updates by voice: the app transcribes, interprets the changes, asks for confirmation and writes them back to Notion.

It is multi-company by design (a user can belong to several companies with a different role in each) but it is used only inside ADITUM. The primary user is the CTO, on his phone, early in the morning and between meetings. Second: team members checking their plan and updating tasks. Third: desktop use for reviewing objectives, projects and the executive briefing.

Design the complete product UI. Mobile first (installed PWA on iPhone and Android), then desktop web. Both must be excellent; when in doubt, the phone wins.

## Visual direction

"As if Apple designed it, with a touch of glass, and readable above all."

- **Apple restraint.** System-native feel: large titles that collapse into a compact bar on scroll, grouped inset lists, hierarchy built with type size and weight rather than boxes, generous whitespace, continuous rounded corners, shadows only where depth carries meaning. It should feel like a first-party iOS app rendered as a PWA, and like a well-made macOS-style web app on desktop.
- **Glass on chrome only.** Navigation bars, the tab bar, the floating action button, bottom sheets, toasts and overlays use a translucent material: blur, a light tint, a hairline border and a faint inner highlight. Content surfaces (cards, list rows, text) sit on solid backgrounds. Never put body text over a blurred, unpredictable background. Never stack glass on glass.
- **Readability is non-negotiable.** Body text 17px on mobile. Minimum 4.5:1 contrast for all text, 7:1 for anything near glass. 44×44pt touch targets. Layouts must survive +30% text size (Dynamic Type). Provide a reduced-transparency variant with solid bars and a reduced-motion variant.
- **Light and dark, both first-class.** Dark is not inverted light: a deep blue-black ground, glass with a lighter tint, a brighter accent.

### Brand and color

- Name: TrueNorth. Mark: a compass. Thin neutral ring, a small ink dot at the center, and a north needle in the accent blue, the only colored element. Use the mark on the sign-in screen and the app icon, and as a small monochrome glyph in the nav bar. The name is set in clean type, no wordmark styling.
- Ink (text on light): `#171D2E`. Light ground: cool off-white `#F3F4F8` with white surfaces. Dark ground: `#0F1420` with `#161C2C` surfaces. Neutrals carry a slight blue bias; no pure grey.
- Accent: `#2E47C9` on light, `#8C9BF5` on dark. Use it for the primary action, the selected tab, links and the north needle. Sparingly.
- Status colors, separate from the accent and never used as decoration: on track (neutral slate), at risk (amber), late (red), done (green). Encode status with a pill and an icon, never color alone.
- Do not use teal or cyan anywhere. No purple-to-blue gradients, no neon.

### Type

System stack: SF Pro on Apple devices, Inter or the system font elsewhere. Tabular numerals for every metric. iOS-like scale: Large Title 34, Title 1 28, Title 2 22, Headline 17 semibold, Body 17, Callout 16, Subhead 15, Footnote 13, Caption 12. Spanish runs 20–30% longer than English: design with Spanish copy first, then check the English version.

### Icons and motion

- Line icons in the spirit of SF Symbols: consistent 1.5–2px stroke, rounded caps. No emoji as icons, no decorative illustration.
- Motion is short, physical and purposeful: sheet presentation with a spring, large-title collapse, list-row press feedback, a gentle progress fill. Nothing ambient. Respect reduced motion.

## Language

The app ships in Spanish (default, Costa Rica conventions: dates like "jue 3 sep", 24-hour times) and English. Design every screen in Spanish first and provide the English version of the key screens. All text lives in tokens; nothing is baked into images. A language selector appears in Settings and on the sign-in screen. Key strings, es / en:

| es | en |
|---|---|
| Hoy | Today |
| Briefing ejecutivo | Executive briefing |
| Empresa | Company |
| Objetivos | Objectives |
| Proyectos | Projects |
| Equipo | Team |
| Riesgos | Risks |
| Integraciones | Integrations |
| Ajustes | Settings |
| Tu prioridad de hoy | Your priority today |
| Por qué | Why |
| Si no se hace hoy | If this doesn't happen today |
| Hecho · Omitido · No aplica | Done · Skipped · Not applicable |
| Recalcular mi plan | Recalculate my plan |
| Dictar actualización | Dictate an update |
| Grabando… | Recording… |
| Esto es lo que entendí | Here's what I understood |
| Confirmar todo | Confirm all |
| Corregir · Descartar | Edit · Discard |
| Aplicado en Notion | Applied in Notion |
| Conflicto: la página cambió en Notion | Conflict: the page changed in Notion |
| En curso · En riesgo · Atrasado · Completado | On track · At risk · Late · Done |
| Avance esperado · Avance real | Expected progress · Actual progress |
| Proyecto sin objetivo | Project without an objective |
| Meta global | North star |
| Sin conexión: mostrando el plan de hoy guardado | Offline: showing today's saved plan |
| Continuar con Google · Enviar enlace por correo | Continue with Google · Email me a sign-in link |

## Screens to design

Design at iPhone 15 Pro size (393×852, with safe areas and the home indicator) for every screen, and at 1440px desktop for the ones marked (D). Provide light and dark for Today, the voice update flow and Briefing; light only is acceptable for the rest as long as the dark tokens are defined.

1. **Sign in.** Compass mark, a one-line promise, "Continuar con Google", "Enviar enlace por correo", language selector. Then **Choose company**: the user's companies with their role in each. The switcher is reachable later from the nav bar.
2. **Today / Hoy (D).** The hero screen. Large title with the date and the user's role. A headline card: today's priority in one sentence and the "why", linking to an objective with its status pill and gap ("18 pts de brecha"). Then 3–5 items as a grouped list: title, reason, the signal that produced it ("señal: 3 tareas vencidas en Módulo financiero"), estimated minutes, optional deadline time, and a link to the task (TAR-966) or project. Each item has Done / Skipped / N/A feedback. An amber consequence banner at the bottom: "Si no se hace hoy, el lanzamiento se atrasa 4 días." A glass floating mic button for voice updates and a secondary "Recalcular mi plan". States: plan ready; recalculating (skeleton with a short reassuring line); no plan yet (onboarding nudge); offline (saved plan with a banner).
3. **Voice update flow.** (a) Recording bottom sheet with waveform, timer, cancel and stop, in glass over the dimmed Today screen. (b) Processing state. (c) "Esto es lo que entendí": the editable transcript on top, then the interpreted changes as cards, each with task code and title, the change ("Estado: En curso → Pruebas QA", "Fecha límite: 5 sep → 12 sep", a note), and the exact spoken phrase in quotes. Actions: Confirmar todo; per card, Corregir (inline picker of valid Notion statuses) or Descartar. (d) Applied toast with links to the Notion pages. (e) Conflict state on one card when the Notion page changed meanwhile.
4. **Briefing (D).** Executive summary, top three risks, pending decisions, and the five perspectives (CEO, COO, CTO, CFO, PM) as a segmented control on mobile and side-by-side cards on desktop. A footnote: "generado hoy 05:12".
5. **Company (D).** North star with deadline and countdown, 3/6/12-month plans, overall status (objectives by status), quick links.
6. **Objectives (D).** List: title, owner, target date, progress bar with an expected-progress marker against the actual fill, status pill. Detail: expected result, indicators (baseline → current → target), linked projects, history.
7. **Projects (D).** List with a source badge ("Notion"), owner, dates, rollup progress, status. An orphan warning row at the top whenever a project has no objective. Detail: linked objectives (editable), tasks grouped by status, dependencies, risks.
8. **Team (D).** Members with avatar, role title, editable responsibility description, open and overdue load, and today's headline for each. Role-editing sheet.
9. **Risks (D).** Sections: overdue tasks, blocked tasks, orphan projects, objectives without active work, pending decisions. Each row links to its source and names the signal that produced it.
10. **Integrations.** Notion card: connected workspace, selected sources (Proyectos, Tareas Software), last sync. Property-mapping screen (Estado, responsable, Fecha límite, Proyecto) with defaults prefilled.
11. **Settings.** Language, plan delivery time, notifications, theme (system / light / dark), reduce transparency, sign out.
12. **Push notification.** Lock-screen preview of the morning plan, in both languages.
13. **Desktop shell (D).** Left sidebar with the nine sections, company switcher and user at the bottom, content column up to 1100px. Today becomes a two-column dashboard: the plan on the left, risks and the briefing summary on the right.

## Components and tokens to deliver

- **Token sheet:** color (light and dark), type scale, 4pt spacing grid, radii (continuous 12 / 16 / 24), the glass material recipe (blur radius, tint, border, highlight) with its solid fallback, elevation, motion durations and springs.
- **Components:** nav bar (large and compact), glass tab bar, sidebar, grouped inset list row (leading icon, trailing value, chevron), card, status pill, progress bar with expected marker, segmented control, primary / secondary / tertiary buttons, floating mic button, bottom sheet, toast, banner (info / warning / error / offline), empty state, skeleton, search field, avatar, source badge, language selector.
- Name layers and components in English (`StatusPill/AtRisk`, `ListRow/Task`). UI copy stays in Spanish with English variants.

## Use real content

No lorem ipsum, no placeholder names. Company: ADITUM. North star: "Convertir ADITUM en la plataforma líder de administración de condominios en Costa Rica para diciembre de 2027". Objectives: "Reducir 30 % los tickets de soporte", "Estabilizar el módulo financiero", "Lanzar el portal de proveedores". Projects: "Módulo financiero", "Portal de proveedores", "Monitoreo en Sentry". Tasks: TAR-966 "Portal de proveedores con link seguro", TAR-842 "Sentry: crear cuenta, proyectos y alertas". Notion statuses: "Sin empezar", "En curso", "Depende de otra TAR", "Pruebas QA", "Lista para deploy", "Finalizada". Roles: CTO, COO, Soporte, Desarrollo.

## What to avoid

- Text on blurred backgrounds, glass stacked on glass, grey-on-grey.
- Teal, cyan, purple gradients, neon accents, emoji icons, decorative illustration.
- A KPI wall of big-number tiles. The plan is a reading experience.
- Desktop-first layouts squeezed into a phone. Start from the phone.

Deliver every mobile screen above, the desktop screens marked (D), the token sheet and the component sheet, plus a one-paragraph rationale for the type and glass decisions.
