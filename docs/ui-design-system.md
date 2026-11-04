# Mentora — UI Design System

**Status: binding.** Every frontend change follows this document. If a screen
needs something this document does not allow, change this document first.

Mentora is an institutional productivity tool for professors and students,
not a consumer app. Its most important visual element is the flag system.
The whole interface is kept near-monochrome so that a single red dot on a
roster is impossible to miss.

---

## 1. Principles

1. **Colour carries meaning, nothing else.** Neutrals do about 90% of the
   work. One accent marks what you can act on. Red, amber and green mean
   risk or outcome, and are never used for decoration.
2. **Data lives in tables.** Cards are only for dashboard summaries.
3. **Labels quiet, data loud.** Labels are small and grey; values are
   larger and darker. Numbers are never bold.
4. **Borders instead of shadows.** Surfaces are separated by 1px lines.
5. **Nothing moves unless it changes state.**

---

## 2. Tokens

Define these tokens once, as CSS custom properties or in the Tailwind theme.
Components use tokens, never raw hex values.

### 2.1 Neutral (warm stone) — about 90% of the UI

| Token | Hex | Use |
|---|---|---|
| `neutral-0` | `#FFFFFF` | Surfaces: content area, tables, inputs, sidebar |
| `neutral-50` | `#FAFAF9` | App background, table row hover, table header |
| `neutral-100` | `#F5F5F4` | Read-only cells, skeleton blocks, subtle fills |
| `neutral-200` | `#E7E5E4` | All borders and dividers, table row lines |
| `neutral-300` | `#D6D3D1` | Input borders, disabled borders |
| `neutral-400` | `#A8A29E` | Placeholder text, disabled text, pending dot |
| `neutral-500` | `#78716C` | Labels, meta text, table headers, icons |
| `neutral-600` | `#57534E` | Secondary body text |
| `neutral-700` | `#44403C` | Body text in tables |
| `neutral-800` | `#292524` | Primary text |
| `neutral-900` | `#1C1917` | Page titles, key figures |

### 2.2 Accent (institutional blue) — interactive elements only

| Token | Hex | Use |
|---|---|---|
| `accent-50` | `#EEF3F8` | Active nav item background |
| `accent-100` | `#D6E1EC` | Selected table row background |
| `accent-200` | `#ADC3D9` | Disabled primary button background |
| `accent-600` | `#264A73` | Link hover |
| `accent-700` | `#1E3A5F` | **Base.** Primary buttons, links, active nav text, focus ring, chart markers |
| `accent-800` | `#182F4D` | Primary button hover |
| `accent-900` | `#12243B` | Primary button pressed |

The accent appears on primary buttons, links, the active nav item, the focus
ring, selected rows and chart markers. Nowhere else: no accent headings,
icons, borders or backgrounds.

### 2.3 Semantic — flag status and outcomes only

| Token | Hex | Use |
|---|---|---|
| `red-600` | `#B42318` | Error text, destructive button text and border, red text |
| `red-500` | `#D92D20` | Red status dot |
| `red-300` | `#FDA29B` | Invalid input border |
| `red-50` | `#FEF3F2` | Error alert background |
| `amber-700` | `#B54708` | Warning text |
| `amber-500` | `#F79009` | Amber status dot |
| `amber-50` | `#FFFAEB` | Warning alert background |
| `green-700` | `#067647` | Success text |
| `green-500` | `#17B26A` | Green status dot |
| `green-50` | `#ECFDF3` | Success alert background |

All text colours above reach at least 4.5:1 contrast on `neutral-0`. Dots
always sit next to text, so meaning never depends on colour alone.

### 2.4 Typography

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| `text-xs` | 12px / 16px | 400 / 500 | Meta, captions, helper text, column headers (500, uppercase optional, tracking 0.02em) |
| `text-sm` | 13px / 20px | 400 | **Tables**, status labels, dense lists |
| `text-base` | 14px / 21px | 400 / 500 | Body, inputs, buttons (500), nav |
| `text-md` | 16px / 24px | 600 | Card and section titles, modal titles |
| `text-lg` | 20px / 28px | 600 | Page titles |
| `text-xl` | 24px / 32px | 400 | Dashboard summary figures (not bold), auth heading (600) |

- **Family:** IBM Plex Sans, self-hosted through `@fontsource/ibm-plex-sans`
  (weights 400, 500, 600 only). Fallback stack: `system-ui, -apple-system,
  "Segoe UI", Roboto, sans-serif`. IBM Plex Mono (`@fontsource/ibm-plex-mono`
  400) is used only for rule IDs (F1–F5) and roll numbers when shown in a column.
- **Numbers:** `font-variant-numeric: tabular-nums` on every numeric value:
  marks, SGPA, counts, percentages, dates and times in tables. Numbers use
  weight 400 (500 at most); never 600 or 700.
- Body line height is 1.5. Headings never use a colour other than `neutral-900`.

### 2.5 Spacing, radius, borders, elevation

| Token | Value |
|---|---|
| Spacing unit | 4px (use 4, 8, 12, 16, 20, 24, 32, 48) |
| `radius-sm` | 4px — badges, checkboxes, small controls |
| `radius-md` | 6px — buttons, inputs, cards, modals (**maximum anywhere**) |
| Border | 1px solid `neutral-200` (inputs: `neutral-300`) |
| `shadow-overlay` | `0 4px 12px rgba(28, 25, 23, 0.08)` — **only** modals, dropdowns, toasts |
| Focus ring | 2px `accent-700`, 2px offset, on `:focus-visible` only |

No other shadows exist. Cards, tables and the sidebar use borders.

### 2.6 Layout

| Token | Value |
|---|---|
| Sidebar width | 232px expanded, 64px collapsed |
| Top bar height | 56px |
| Content max width | 1280px, left-aligned (not centred), 24px padding (16px below 640px) |
| Breakpoints | `sm` 640, `md` 768, `lg` 1024, `xl` 1280 |
| Minimum supported width | 360px |
| Touch target | 44px minimum height below `md`; 36px allowed at `md` and up |

### 2.7 Motion

| Token | Value |
|---|---|
| `duration` | 150ms |
| `easing` | `cubic-bezier(0, 0, 0.2, 1)` (ease-out) |

Allowed animations, and nothing else:

- route change: content fades in, opacity 0→1 and translateY 4px→0
- dropdown and modal open: opacity plus a translateY of 4px
- toast enter and exit: opacity plus a translateY of 8px

Respect `prefers-reduced-motion: reduce` by turning all of these off.

---

## 3. App shell

- **Sidebar** (fixed, left, `neutral-0`, right border `neutral-200`).
  - Top: wordmark "Mentora" (16px/600 `neutral-900`) and "Goa College of
    Engineering" (12px `neutral-500`). No logo artwork beyond a simple
    monogram square in `accent-700`.
  - Nav items: 36px tall (44px on mobile), 14px/500, icon 16px `neutral-500`
    plus label. Active item: `accent-50` background, `accent-700` text and icon.
    Hover: `neutral-50`.
  - Bottom: a "Collapse" text button with a chevron. Collapsed mode shows
    icons only, with the label as a tooltip and `aria-label`.
  - Below `md` the sidebar becomes an off-canvas drawer, opened by a "Menu"
    button in the top bar.
- **Top bar** (56px, `neutral-0`, bottom border `neutral-200`, sticky).
  - Left: breadcrumb, 13px `neutral-500` with the last segment in
    `neutral-800`, e.g. `Mentees / Rohan Naik`.
  - Right: notifications button (bell icon, the text "Notifications" from
    `lg` up, and the unread count as a number), then the user menu (name,
    role, chevron).
- **Content:** page title (20px/600) with an optional one-line description
  (14px `neutral-500`) and actions right-aligned on the same row.

---

## 4. Components

### 4.1 Status indicator

A status is always **an 8px dot plus text**, e.g. `● Verified`. The text is
13px `neutral-700`. There are no filled pills or tinted badges for status.

| Domain | Value | Dot | Text |
|---|---|---|---|
| Flag | `open` | `red-500` solid | Open |
| Flag | `in_discussion` | `red-500` ring (hollow) | In discussion |
| Flag | `escalated` | `amber-500` solid | Escalated |
| Flag | `resolved` | `green-500` solid | Resolved |
| Roster indicator | `red` / `amber` / `green` | solid, as named | Unresolved flag / Escalated flag / No open flags |
| Submission | `pending` | `neutral-400` solid | Pending |
| Submission | `verified` | `green-500` solid | Verified |
| Submission | `rejected` | `red-500` solid | Rejected |
| Meeting / session | `scheduled` | `neutral-800` ring | Scheduled |
| Meeting / session | `completed` | `neutral-800` solid | Held |
| Meeting / session / slot | `cancelled` | `neutral-400` ring | Cancelled |
| Slot | `open` / `booked` / `completed` | `neutral-400` ring / `neutral-800` ring / `neutral-800` solid | Open / Booked / Held |
| User | `active` / `pending` / `deactivated` | `green-500` / `neutral-400` / `neutral-400` ring | Active / Awaiting approval / Deactivated |
| Semester | `open` / `closed` | `neutral-800` solid / `neutral-400` ring | Open / Closed |

Roster indicator rule (contract, Module 11): amber if any flag is escalated,
otherwise red if any flag is unresolved, otherwise green.

### 4.2 Flag line

A flag is shown as **dot + rule ID + reason**:

`● F1  SGPA fell from 8.2 to 6.4`

- The dot follows the flag status from 4.1.
- The rule ID is IBM Plex Mono 12px/500 `neutral-800`, fixed width 24px.
- The reason is 13px `neutral-700`, verbatim from the API. Never rephrase it.
- Meta text (semester, raised date) is 12px `neutral-500`, after the reason
  or on a second line.

### 4.3 Buttons

| Variant | Style | Use |
|---|---|---|
| Primary | `accent-700` background, white text, hover `accent-800`, disabled `accent-200` | One per view: the main action |
| Secondary | `neutral-0` background, 1px `neutral-300` border, `neutral-800` text, hover `neutral-50` | Other actions |
| Destructive | `neutral-0` background, 1px `red-600` border, `red-600` text, hover `red-50` | Reject, cancel a meeting, deactivate |
| Text | No border, `accent-700` text, underline on hover | Inline actions inside tables ("Review", "Remove") |

- Height 36px (44px below `md`), 14px/500, horizontal padding 14px, radius 6px.
- **Every button has a visible text label.** An icon may lead the label;
  icon-only buttons are not allowed.
- While loading, keep the label and disable the button; an inline 14px
  progress indicator may replace the leading icon.
- A destructive action always asks for confirmation in a modal. Never use
  the browser's `confirm()`.

### 4.4 Forms

- Labels sit above fields: 13px/500 `neutral-700`. Mark required fields with
  a `*` in `red-600`.
- Inputs: 36px tall (44px below `md`), 1px `neutral-300` border, radius 6px,
  14px text. On focus: `accent-700` border plus the focus ring.
- **Errors:** a `red-300` border on the field plus 12px `red-600` helper text
  directly below it. Validate on submit, then re-validate on change. A
  form-level error (from the API's `detail`) appears in an error alert above
  the submit button.
- Helper text when there is no error: 12px `neutral-500`.
- Read-only values use a `neutral-100` background with `neutral-600` text
  and no border change.
- Datetime inputs show local time (IST) and send aware UTC ISO strings.

### 4.5 Tables

- 13px text, 40px rows (48px below `md`), 1px `neutral-200` bottom border on
  every row, **no zebra striping**.
- The header is sticky, with a `neutral-50` background, 12px/500
  `neutral-500` text and a bottom border.
- **Numbers are right-aligned** and tabular: marks, SGPA, counts, percentages.
  Text is left-aligned. Dates are left-aligned and tabular.
- Hover: `neutral-50`. Selected: `accent-100`. A clickable row also has a
  text-button action in its last column, so it never relies on row clicks alone.
- An empty cell shows `—` in `neutral-400`.
- Pagination sits below the table as "1–20 of 134" plus Previous / Next
  secondary buttons.
- **Below `md`** a table becomes a stacked list. Each row is a block with a
  1px bottom border, and the primary column is the title line with the rest
  as label/value pairs. It is still a list, not floating cards.

### 4.6 Cards (dashboard summaries only)

- `neutral-0`, 1px `neutral-200` border, radius 6px, **no shadow**, 16–20px padding.
- Title 12px/500 `neutral-500`; value 24px/400 tabular `neutral-900`;
  optional meta 12px `neutral-500`.
- A value may be coloured only when it states a risk: red for unresolved or
  escalated flags greater than zero, amber for pending approvals or
  verifications greater than zero.

### 4.7 Alerts

A 1px border with the semantic `-50` background, a 16px icon and 13px text
in the semantic text colour. There are four tones, error, warning, success
and info; info uses `neutral-50` and `neutral-700`, not blue.

### 4.8 Modals and dropdowns

- `neutral-0`, 1px `neutral-200` border, radius 6px, `shadow-overlay`.
  The backdrop is `rgba(28, 25, 23, 0.4)`; it is never blurred.
- Modal header: title 16px/600. Footer: actions right-aligned, primary last,
  secondary "Cancel". The header close control is a text button reading "Close".
- Below `sm` a modal becomes a bottom sheet (full width, top corners 6px).
- Esc closes it, focus is trapped inside, and focus returns to the trigger
  afterwards.

### 4.9 Toasts

- Bottom-right (bottom-centre below `sm`), at most three stacked.
- `neutral-900` background, white 13px text, radius 6px, `shadow-overlay`.
  They are monochrome: an error toast adds a 3px `red-500` left border and
  nothing else.
- Auto-dismiss after 4s, with a "Dismiss" text button.

### 4.10 Loading and empty states

- Before the session is restored, the app may show a single small progress
  indicator.
- After that there are **no spinners**. Tables load as skeleton rows:
  `neutral-100` blocks at row height, 3–5 rows, in the real column widths.
  Cards load as `neutral-100` blocks the size of their value.
- **Empty state:** one explanatory sentence (13px `neutral-600`) plus one
  button (secondary, or primary if it is the page's main action), centred in
  the table area. No illustrations and no icons in circles.

### 4.11 Charts

- Line: `neutral-400`, 1.5px. Markers: `accent-700`, 3.5px radius, white 1.5px
  stroke. Gridlines: `neutral-200`. Axis labels: 12px `neutral-500`, tabular.
- Bars: `neutral-300`, with the bar being discussed or hovered in `accent-700`.
- Red is used in a chart only for flag semantics: a marker below the F3
  threshold is `red-500`, and the threshold line is dashed `neutral-400`
  labelled "F3 threshold 6.0".
- No gradients, area fills, 3D, or animated drawing.

---

## 5. Blacklist (hard rules)

A screen that does any of these fails review:

- Purple, violet or indigo anywhere; any gradient
- Glassmorphism, backdrop blur, glows, coloured shadows
- Emoji in any UI text: headings, buttons, empty states, toasts, notifications
- Rounded-2xl (or larger) soft-shadow cards floating on a grey background
- Marketing hero sections, taglines or feature grids inside the signed-in app
- Stock illustration sets, decorative blobs, background patterns, photos
- Red, amber or green used decoratively (icons, headings, chart series)
- Filled status pills, icon-only buttons, spinners after initial load
- Bold numbers, a radius above 6px, shadows on non-overlay surfaces
- Neon or saturated dark themes (dark mode is out of scope)
- Bounce, spring, parallax or attention-seeking animation

---

## 6. Page patterns

Columns are limited to fields the API actually returns (`docs/api-contract.md`).

### 6.1 Mentor roster (`/mentor`, from `GET /mentor/dashboard`)

- Summary row of four cards: Mentees, Need attention (count of red or amber,
  red when > 0), Awaiting verification (internal + result, amber when > 0,
  links to the queue), Upcoming (meetings + group sessions).
- **Roster table:**

  | Column | Content | Align |
  |---|---|---|
  | Status | roster indicator dot only, with an `aria-label` | centre, 32px |
  | Student | name (13px/500 `neutral-800`), roll number below in 12px mono `neutral-500` | left |
  | Year / Div | `2 · A` | left |
  | Latest SGPA | 2 decimals, `—` if null; `red-600` text when < 6.00 | right |
  | Unresolved flags | count, `neutral-400` when 0 | right |
  | Action | text button "Open" | right |

- Default sort: amber, then red, then green, then name. The headers Student,
  Latest SGPA and Unresolved flags are sortable.
- Row action opens `/mentor/mentees/{id}`.
- Empty: "No students are allocated to you yet." with the button "View
  notifications".
- No pagination (the roster is about 15 rows).

### 6.2 Verification queue (`/mentor/verification`)

- **Tabs:** `Internals (n)` / `Results (n)`, counting pending items. A status
  filter (Pending · Verified · Rejected, default Pending) sits right-aligned
  on the tab row.
- **Internals table:** Student (name + roll), Semester, Subjects (count,
  right), Submitted (date-time), Status (dot + text), Action ("Review").
- **Results table:** Student, Semester, SGPA (right), Submitted, Proof (text
  link "View proof", which fetches the file as an authorised blob and opens
  it in a new tab), Status, Action ("Review").
- **Review panel** (a modal at `lg` width, a full-screen sheet on mobile):
  - Internals: the marks grid from 6.3, read-only.
  - Results: SGPA, a subject table (Subject, Final, Max; finals below 40 in
    `red-600`), and an inline proof preview (PDF frame or image) with the
    "View proof" link.
  - Footer: Reject (destructive), Verify (primary). Reject switches the panel
    to a required note field (error "Explain what the student needs to
    correct.") and the button "Return to student".
  - **After Verify**, the panel shows the outcome before anything else:
    - flags raised: an error alert titled "2 flags raised" listing each as a
      flag line (4.2), then "The student has been notified."
    - no flags: a success alert, "Verified. No flags raised."
    - the only action is "Done".
- Oldest first (contract). Empty: "Nothing is waiting for verification."

### 6.3 Marks-entry grid (student internals form)

A spreadsheet-like table inside the submission form.

| Column | Input | Width | Notes |
|---|---|---|---|
| Subject | text, max 120 | flexible | required, unique in the grid |
| I1 | integer | 64px, right-aligned | blank allowed |
| I2 | integer | 64px, right-aligned | blank allowed |
| I3 | integer | 64px, right-aligned | blank allowed |
| Max / test | integer, default 20 | 72px, right-aligned | > 0 |
| Effective | **read-only**, `neutral-100` cell, `neutral-600` text | 96px, right-aligned | shows `—` with the tooltip "Calculated on verification"; after verification, the server value as `15.0 (75%)` |
| (action) | text button "Remove" | 72px | disabled when only one row is left |

- The client never computes or sends the effective score (contract, Module 4).
- Below the grid: a text button "Add subject".
- Keyboard: Tab moves along the row; Enter moves to the same column in the
  next row, adding a row from the last one.
- Validation is per cell (red border) with one message per row under the
  grid, e.g. "Data Structures: marks must be whole numbers from 0 to 20.",
  and "Enter at least one test mark." for an empty row.
- Below `md` each row becomes a block: Subject on the first line, then
  I1 / I2 / I3 / Max in a four-column row of 44px inputs, then Effective.
- The results form uses the same grid with the columns Subject, Final marks,
  Max marks (default 100), Remove; plus the SGPA field (0.00–10.00) and the
  proof file field (PDF/JPG/PNG, 5 MB, with the file name and size shown).

### 6.4 Admin allocation (`/admin/allocations`)

Two panels side by side at `lg` and above, stacked below that.

- **Left, Mentors** (about 40%): a table of active mentors with Name,
  Department, and Active mentees (right-aligned; `amber-700` text plus "over
  15" when above 15). Clicking a row selects it (`accent-100`) and the panel
  stays visible.
- **Right, Students** (about 60%): the active students without an active
  allocation, **limited to the selected mentor's department** (stated in the
  panel header, e.g. "Unallocated students · Computer"). It has a search
  field (name or roll) and a year filter.

  | Column | Content |
  |---|---|
  | (select) | checkbox; header checkbox selects all visible |
  | Student | name + roll |
  | Year / Div | `3 · B` |

- **Sticky footer** on the right panel: "3 selected · Sunil Gaonkar will have
  8 mentees" (the projected count turns `amber-700` above 15) and the
  primary button "Allocate 3".
- **Result:** a table of the per-student results (Student, Result
  "● Assigned" / "● Failed", Reason), plus one warning alert per
  `warnings[]` entry. Allocation never blocks on the capacity warning.
- Below both panels sits the allocations table: Student, Mentor, Since,
  Status, Action ("Reassign"), with Active / History tabs and a mentor filter.
  Reassign opens a modal listing same-department active mentors other than
  the current one, with the note "The current allocation is ended, not
  deleted."

### 6.5 Student dashboard (`/student`, from `GET /students/me/dashboard`)

- **Quiet summary cards** (three across, stacked on mobile):
  - Mentor: name, designation, department, and email as a link. With no
    mentor: "A mentor has not been assigned yet."
  - Next deadline: kind ("Internal marks" / "Semester result"), semester,
    the date-time in IST with a relative time, and either "● Submitted" or
    the text button "Submit now".
  - Flags: four label/value pairs (Open, In discussion, Escalated,
    Resolved). Values are `neutral-400` when 0; Open is `red-600` and
    Escalated `amber-700` when > 0.
- **SGPA trend**: the chart from 4.11, one point per verified result in
  semester order, y-axis 0–10, x-axis semester labels. With fewer than one
  point: "Your trend appears after your first result is verified."
- **Active flags**: a list of flag lines (4.2) with the semester and raised
  date, linking to the flag detail.
- **Coming up**: a table of the upcoming meetings and group sessions merged
  (When, Type, With, Agenda), with the action "Book a meeting".

### 6.6 Flag detail with lifecycle timeline (`/…/flags/{id}`, from `GET /flags/{id}`)

- **Header:** the flag line (4.2) at 16px, then the student (name, roll,
  linked for mentors and admins), the semester and the current status.
- **Timeline:** vertical, with a 1px `neutral-200` rail and an 8px dot per
  event. Each event has a 13px/500 title, a 12px tabular `neutral-500`
  timestamp, and an optional 13px body.

  | Event | When shown | Dot | Source |
  |---|---|---|---|
  | Raised | always | `red-500` | `raised_at`, `reason` |
  | Escalated to coordinator | `escalated_at` set | `amber-500` | `escalated_at` |
  | Discussed in meeting | a linked meeting exists | `neutral-800` | the meeting's `completed_at` and minutes excerpt, from the meeting lists' `linked_flags` |
  | Resolved | `resolved_at` set | `green-500` | `resolved_at`, `resolution_note`, `resolved_by` |
  | Open for N days | unresolved | `neutral-400` ring | computed from `raised_at` |

- **Actions:** mentors (own mentees) and admins get "Resolve flag" (primary;
  modal with a required note, "A resolution note is required."). A mentor
  also gets "Invite to a meeting" (secondary). Students see no actions.
- A flag that is not visible gives the generic not-found page, never a
  permission message (contract: 404, not 403).

### 6.7 Login and register (`/login`, `/register`)

- **Split screen at `lg` and above:** the form column on the **left** (white,
  form max width 400px, vertically centred); a solid `accent-700` panel on
  the **right** (about 45% width). Below `lg` only the form shows, with the
  wordmark above it.
- The right panel holds the wordmark "Mentora" (white, 20px/600) and
  "Goa College of Engineering · Mentor–mentee scheme" (14px, white at 80%),
  and nothing else. No photos, illustrations, patterns, gradients or
  feature lists.
- **Login:** heading "Sign in" (24px/600), the Email and Password fields, a
  full-width primary button "Sign in", and a link "Create an account".
  Errors: 401 gives "Incorrect email or password." as an inline alert; 403
  for a pending account gives the warning alert "Your mentor account is
  waiting for approval by the scheme coordinator."; an expired session gives
  the info alert "Your session has ended. Please sign in again."
- **Register:** a segmented control "Student / Mentor". Shared fields: full
  name, email, password (8–72), department (select), phone (optional).
  Student adds roll number, year (1–4) and division; Mentor adds designation.
  Mentor success shows "Registration received" with the approval
  explanation and a link back to sign in.
- The email goes in the OAuth2 `username` field (contract, Module 1).

---

## 7. Copy and formatting

- Sentence case everywhere ("Upload result", not "Upload Result").
- Dates are `4 Nov 2026`; date-times `4 Nov 2026, 3:00 pm` (IST, `en-IN`);
  time ranges `Thu, 5 Nov, 3:00–3:30 pm`.
- SGPA always has two decimals (`6.40`); percentages one decimal in reasons
  (as returned) and none in tables (`75%`).
- Error text comes from the API `detail` when it is a string; validation
  lists are joined into one sentence per field.
- No exclamation marks, and no "Oops", "Awesome" or similar.

---

## 8. Accessibility

- WCAG 2.1 AA contrast for all text (the tokens above satisfy it on
  `neutral-0` and `neutral-50`).
- Every status dot is paired with text or an `aria-label`.
- Every interactive element is keyboard-reachable, with a visible focus ring.
- Modals trap focus; toasts use `aria-live="polite"`.
- Hit targets are at least 44px below `md`.
