# HIP frontend — notes for Claude Code

> **Next:** hero video compression + pause control, then TanStack Query audit.

HIP (Hikers Integrated Platform) is a web app for one hiking group: hikers find events and buy tickets (account optional), staff check hikers in at the trailhead with QR codes (online or offline), and admins manage events, analytics, ads and access.

- **Source of truth for requirements:** the SRS Google Doc "HIP". Requirement IDs (AUTH-001, TKT-010, ATT-005…) are referenced in code comments and in each placeholder page.
- **Source of truth for UI:** the Figma file "HIP – Hikers Integrated Platform". Every screen is a frame named `Section / Screen` (for example `Admin / Analytics`). Each placeholder page names its frame.
- **Backend:** not built yet. All data goes through `src/api/endpoints.ts`, which returns mock data while `VITE_USE_MOCKS=true`.

## Stack

React 18, TypeScript (strict), Vite 5, Tailwind CSS 3, React Router 6 (data router), TanStack Query 5, react-hook-form + zod, lucide-react icons, recharts for charts, qrcode.react for ticket QR codes, html5-qrcode for the camera scanner, idb (IndexedDB) and vite-plugin-pwa for offline check-in.

## Commands

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build (must pass before you finish a task)
npm run lint
npm test           # Vitest unit tests for the business rules in src/lib
npm run test:e2e   # Playwright: flows, roles, keyboard and axe on every route (starts its own dev server on :5180)
npm run dev:phone  # HTTPS on the local network, so a phone can use the camera (dev only; see README)
```

Copy `.env.example` to `.env`. With mocks on and a `pk_test_` key in `VITE_PAYSTACK_PUBLIC_KEY`, checkout opens Paystack's real test popup (use Paystack test cards); without a test key it shows a simulated payment dialog. See `features/checkout/paystack.ts`. In dev mode with mocks on, route guards are bypassed while signed out, so you can open `/admin` and `/checkin` without logging in; once signed in, the real role checks apply. Check-in staff log in at `/staff/login` (`tola@hip.ng`, code `123456`). Mock logins (password `Hiking123!`, every one-time code `123456`): hiker `adaeze@example.com`, super admin `kunle@hip.ng`, admin `ife@hip.ng` (sees Staff & roles read-only), check-in staff `tola@hip.ng` and `sola@hip.ng`, advertiser `ads@outdoorhub.ng` (sees only Ads and its own campaigns). In dev with no session, admin screens act as the sample super admin (`useCan()`). See `api/mock/auth.ts`. Signed out in dev, the hiker pages show Adaeze's sample data (`api/mock/account.ts`): 14 check-ins, a missed and a refunded hike, a pending Gurara order, and a cancelled hike.

## Folder layout

```
src/
  api/            client.ts (fetch wrapper), endpoints.ts (one function per endpoint), mock/data.ts
  components/ui/  Button, Badge, Input, Card, StatCard, Logo, PageHeader, Tabs, Switch, Avatar, Dialog, Menu (row actions), ScaleToFit (previews), … (see index.ts)
  components/ads/ AdCreative (how an ad looks; public slot and editor preview), AdSlot (rotation + viewable impressions)
  components/events/EventCard.tsx
  features/auth/  AuthContext (current user, roles), RequireRole (route guard), useCan / usePermissionCheck, RequirePermission (admin route guard), devBypass
  features/ads/   useViewableImpression (50% visible for 1 s)
  features/branding/  BrandingProvider (loads /api/branding, applies colours), useBranding, brandingCache
  features/checkin/offline/  db.ts (IndexedDB schema), scan.ts (offline validation), sync.ts
  layouts/        PublicLayout (nav + footer), AuthLayout (split screen), HikerLayout (tabs),
                  AdminLayout (sidebar), CheckinLayout (mobile shell + offline banner)
  lib/            brandDefaults.ts (default colours, name, contacts: the only place they're written), brandColors.ts, permissions.ts (role matrix, adminHome), hikers.ts, ads.ts (placement/status wording), audit.ts (action labels, groups, date presets), contrast.ts (WCAG checks), cn.ts, format.ts (Naira, Africa/Lagos dates), metrics.ts (analytics formulas), analytics.ts (periods, derived figures, CSV), csv.ts, weeks.ts, history.ts (hiker stats/CSV), refunds.ts, fees.ts, ticketQr.ts, pin.ts (supervisor PIN hashing)
  pages/          public/ auth/ hiker/ checkin/ admin/  (one file per screen)
  routes/router.tsx
e2e/              Playwright tests (helpers.ts has the mock logins); playwright.config.ts uses the installed Chrome
                  (PW_CHANNEL= for Playwright's own Chromium)
public/fonts/     Inter, self-hosted (variable woff2, latin preloaded; SIL OFL licence alongside)
  types/domain.ts (entities from SRS section 4)
```

## Conventions

- Never run git commands that change history (commit, push, reset, rebase, stash). The owner commits. At the end of each phase, list the files you changed instead.
- Use the Tailwind tokens in `tailwind.config.ts` (`forest`, `pine`, `moss`, `sun`, `sand`, `mint`, `ink`, `slate`, `line`, `canvas`, `danger`, `warn`, `info`). Don't hard-code hex values in components.
- **Branding (SRS 2.3):** every colour token is a CSS variable (`rgb(var(--c-forest) / <alpha-value>)`). Defaults live only in `lib/brandDefaults.ts`; Tailwind, index.html and the PWA manifest read them at build time. At startup `BrandingProvider` loads `GET /api/branding` and `applyBrandColors()` derives each token family from primary, secondary and surface, plus the two text colours `on-primary` / `on-secondary` ("text on primary/secondary"; defaults white and ink, both AA). Text on a brand colour always uses `text-on-primary` / `text-on-secondary`, never `text-white` (a family left at its default keeps the exact Figma values). The last brand is cached in localStorage so there's no flash. Use `useBranding()` for the group name, logo and contact details; never write "HIP" or the contact email into UI text. Cover illustrations (`assets/covers`) keep their own artwork colours.
- **Permissions:** gate admin controls with `useCan(permission)` (`lib/permissions.ts` holds the Figma matrix). It's UI only; the server checks every action again.
- **Admin routes are guarded by permission** (`RequirePermission` in `routes/router.tsx`) and the sidebar shows only what the role can open. Advertisers sign in at `/staff/login`, land on `/admin/ads` and see nothing else.
- **Tests (NFR-029):** unit tests sit next to the code they test (`src/lib/*.test.ts`); business rules in `lib/` get one. End-to-end tests in `e2e/` use roles, labels and visible text, never CSS classes, and start from a clean browser context. Update `e2e/accessibility.spec.ts` when you add a route.
- **Mocks never ship in a release.** `vite.config.ts` treats `src/api/mock/*` as side-effect free, so a `VITE_USE_MOCKS=false` build drops it. Reach mock code only through `USE_MOCKS ? … : …` in `endpoints.ts` (or a dynamic import), never from a component; put dev-only hints behind `import.meta.env.DEV`. Check with `grep -l "Adaeze\|Hiking123" dist/assets/*.js` after a mocks-off build.
- **Keep the first page light.** Vendor code is split into `vendor-react`, `vendor-query`, `vendor-forms`, `vendor-charts`, `vendor-scanner` and `vendor-ui` chunks (`vendorChunk()` in `vite.config.ts`). `components/ui` must not import zod or react-hook-form (that's why `passwordScore` lives in `lib/passwordScore.ts`), or every page pays for the form library.
- Build screens from `components/ui`. Add a new primitive there before you copy markup between pages.
- `pages/public/Landing.tsx` is the reference implementation. Follow its patterns: data through `useQuery` + `endpoints.ts`, loading skeletons, responsive grid.
- Components never call `fetch` directly. Add the call to `endpoints.ts` with a mock branch.
- Money is an integer in **kobo**. Display it with `formatNaira`.
- Store dates as UTC ISO strings. Display them with `formatDate`/`formatTime`, which use `Africa/Lagos`.
- Forms use react-hook-form + zod, with error messages under each field (NFR-024).
- Analytics figures on screen and in the CSV both come from `deriveAnalytics()` in `lib/analytics.ts` (ANA-033). Don't compute a percentage anywhere else.
- Admin pages set their top-bar title with `useAdminTitle()` (features/admin/adminTitle.ts) and use the `Table` primitive for data tables (it scrolls sideways inside its card on phones).
- Other error messages are toasts (react-toastify), never doubled with an on-page message. Toasts are for failed actions (saves, payments, log-in, refunds…) and for background refreshes that fail while older data is still on screen. A page that fails to load shows its own "We couldn't load…" panel with Try again and no toast. Failed mutations and background refetches toast automatically through the global listener in `api/queryClient.ts`; actions written as plain awaits call `notifyError()` from `lib/notify.ts`. Pass `meta: { silentError: true }` when the screen explains the failure itself, or `meta: { errorMessage }` for clearer wording. Success and info messages stay inline.
- Work mobile-first. Public pages, tickets and check-in must be responsive (NFR-021). Check-in is phone-only (max 430px).
- Accessibility: WCAG 2.2 AA. Use labels on inputs, visible focus rings, and status text that doesn't rely on colour alone.
  - Every layout's `<main>` has `id="main" tabIndex={-1}`, the target of the "Skip to main content" link in `AppShell`.
  - Modals use `Dialog` (native `<dialog>`: traps focus, Escape closes, focus returns). Custom sheets trap Tab and give focus back on close (see `ResultSheet`); if a button is disabled while a popup is open, focus it again yourself afterwards.
  - Row actions name their row (`aria-label="Check in Adaeze Okafor"`). `Table` scroll areas are focusable regions.
  - `slate-mute`, `warn`, `danger` and `info` are darker than Figma so small text passes 4.5:1. Orange as text on light backgrounds uses `text-sun-dark`, never `text-sun`.
  - Checked with axe-core (WCAG 2.2 AA + best practice) on every route at 1440 and 390: 0 violations at the end of phase 8.

## Business rules the UI must respect

1. **Attendance comes only from check-ins**, never from ticket sales or sign-ups (SRS 2.4 rules 5 and 11). Hiker history and analytics show checked-in hikes only.
2. **Sign-up is optional.** Guests can buy tickets with name, email and phone. Checkout defaults to "Continue as guest" when logged out and offers an optional "create account" checkbox. Guests get their ticket by email or WhatsApp and can recover it at `/find-ticket`. If a guest later signs up with the same email or phone, the backend merges their tickets and history. Admin lists show a "Guest" tag.
   **Every ticket names its own attendee** (`Ticket.holder`: name required, email/phone optional). When an order has more than one ticket, checkout collects an attendee per ticket ("Same as me" for ticket 1). The buyer (`CheckoutRequest.buyer`) gets the receipt and all tickets; attendance and history follow the holder, and the backend links a holder's ticket to their account by email/phone.
3. **A paid ticket is shown only after the backend verifies payment** (TKT-010). After the Paystack popup closes, poll `checkoutApi.status`. Never trust the client callback.
4. Cancelled or closed events can't be bought (EVT-010, EVT-011). Hide or disable the buy button.
5. Percentages use `lib/metrics.ts`, which returns `null` for a zero denominator. Show "—" in that case (acceptance 7.4).
6. Distinguish **attendance instances** from **unique hikers** wherever both appear (SRS 3.7.7).
7. Attendance corrections require a reason and are written to the audit log (ATT-018).
8. QR codes must not contain personal data (TKT-018). The offline list holds names, ticket types and statuses only, never emails or phones.
9. **The Paystack fee is added on top of the ticket price** and shown as an estimate: `paystackFeeKobo()` in `lib/fees.ts` (1.5% + ₦100, ₦100 waived under ₦2,500, capped at ₦2,000). The backend recalculates the real amount.
10. **Refunds follow the Figma policy** (`lib/refunds.ts`): full refund up to 72 hours before the hike, 50% after, none once check-in opens (assumed 2 hours before start until Admin / Check-in settings exists). The fee isn't refunded; only the buyer can request; the ticket stays valid until the refund is processed.
11. **Profile:** a changed email or phone is used only after its code is entered (AUTH-017). Ticket confirmations can't be turned off; promotions are opt-in (NOT-010).
12. **Admins can't change their own role** (ADM-005). The server refuses it (`adminApi.setStaffRole`); Admin / Staff & roles hides the control for your own row.
13. **Every admin change is audit-logged** (event create/publish/cancel, attendance corrections with reason and old/new state, settings, sync decisions, closing attendance).
14. **Supervisor PINs never leave the server as a PIN.** A super admin sets a 4–6 digit PIN per event; the server keeps a salted PBKDF2 hash and phones download only that hash. Re-entries never add to attendance.
15. **Admin / Transactions money:** gross = amounts charged (ticket + fee) for successful, refund-requested and refunded payments; net = gross − refunds − fees. Pending and failed payments are never counted as sales (ANA-028). Approving or declining a refund needs a reason (at least 10 characters) and is audit-logged.
16. **Suspended hikers and deactivated staff can't log in** (`AuthErrorBody.code 'suspended'`). Suspending or reactivating a hiker needs a reason, written to the audit log. Only super admins manage staff; nobody can change their own role or deactivate themselves, and the last super admin can't be demoted. Staff two-step login uses an authenticator app (TOTP); a super admin can reset someone's.
17. **Ads:** advertisers see and edit only their own campaigns; their new campaigns, and changes to approved ones, go to "Pending approval". Only admins approve, reject (reason required, shown to the advertiser) or end a campaign early (reason required). The public site gets only approved, unpaused campaigns inside their dates; campaigns sharing a placement take turns, one per page view. An impression counts only when the ad is at least 50% visible for 1 continuous second with the tab in front (`useViewableImpression`); CTR = clicks ÷ impressions via `lib/metrics.ts`.
18. **Notifications:** transactional messages always go by email and that switch is locked (NOT-011); promotional messages reach only hikers who opted in (NOT-010). A channel can be switched on only when its provider is connected. Provider API keys are write-only (last four characters shown).
19. **Branding:** contrast is checked against WCAG AA on the pairings the site uses (`lib/contrast.ts`); a failing pair warns but doesn't block publishing. "Reset to defaults" only fills the form. Every published change is audit-logged with the fields that changed.
20. **The audit log is read-only:** no edit or delete controls and no API for either.
21. **Changing a live event notifies its ticket holders (EVT-008).** Saving a published event with a new date, start time, meeting point or location first shows a confirm dialog with the changes and the number of ticket holders; the server sends the messages and logs it. Cancelling says how many will be refunded and told.

## Offline check-in

Trailheads often have no signal, so the check-in app is a PWA that works offline.

1. **Download:** while online, staff open `/checkin/:eventId/offline`. The app downloads a manifest (ticket codes, holder names, ticket types and statuses) plus the event's **public** signing key into IndexedDB (`features/checkin/offline/db.ts`).
2. **Scan offline:** `scanOffline()` in `scan.ts` checks the QR's ECDSA signature with the public key, then checks the event, the ticket status and local duplicates. It saves the check-in as unsynced.
3. **Not in the offline list:** a valid signature for a ticket the phone doesn't know about (probably bought after the download). Staff verify ID, then "Admit & flag".
4. **Sync:** when the phone is back online, `syncPendingCheckIns()` uploads the queue. The server keeps the earliest scan per ticket and returns conflicts, which admins resolve at `/admin/checkin/:eventId/sync`.
5. **Close attendance** is blocked while unsynced scans exist (and while offline). Closing removes the event's ticket list from the phone.
6. **Expiry:** each offline list expires after `offlineListTtlHours` (default 24, Admin / Check-in settings) and is wiped from the phone with its synced scans. Unsynced scans are kept until they reach the server.
7. **Policy and gates:** phones receive the admin's rules with each download (`CheckinManifest.policy`: admit tickets not in the list, supervisor PIN for re-entry). Staff pick their gate on Select event when no gate is assigned (default Gate A, kept per event on the phone); admin assignment comes with Staff & roles. Phones report their state (offline list, unsynced count) for Check-in settings → Staff devices.
8. **Supervisor PIN for re-entry:** when "Require supervisor PIN for re-entry" is on and a super admin has set the event's PIN (Check-in settings), an already-used result offers "Allow re-entry". Online the server checks the PIN; offline the phone checks it against the salted hash in the download (`lib/pin.ts`). The scan is saved as "re-entry, supervisor approved" and shown that way in sync review and the audit log; it never counts as a second check-in. Wrong PIN: the field says how many tries are left; after 5, re-entry is locked on that phone until it's back online (the server also locks a phone for 15 minutes after 5 wrong online tries).

How it's built (phase 5):
- `features/checkin/useCheckin.ts` holds the shared logic. `checkTicket()` asks the server when online and falls back to `scanOffline()` when there's no signal or no answer within 1.5 s, so a result always shows within 2 s (NFR-003). Every QR check goes through `lib/ticketQr.ts`.
- `useAutoSync()` (mounted in `CheckinLayout`) uploads waiting scans on start, when the connection returns, and every 20 s. `CheckinLayout` also preloads every check-in screen and the QR decoder, so moving between screens works with no signal.
- IndexedDB (`offline/db.ts`, v2): `manifests`, `tickets`, `checkins` (`synced` 0/1), `meta` (last sync time). Online results are copied to the phone's ticket list, so a later offline scan of the same ticket shows "already used".
- Check-in queries use `networkMode: 'always'` (TanStack Query otherwise pauses them offline) and `silentError`, because each screen explains offline states itself.
- Camera: `components/checkin/CameraView.tsx` (html5-qrcode). If permission is denied or there's no camera, the scanner says so and offers manual search.
- Mocks: `api/mock/signing.ts` holds a fixed P-256 **test** key, so mock tickets carry real signatures and offline verification really runs. Mock check-in calls fail while `navigator.onLine` is false, so offline mode can be tested by switching the network off. Mock builds show a "Test scan" panel on the scanner with sample payloads (valid, used, refunded, other event, bought after download, forged, not HIP).
- Test offline in a production build (`npm run build && npx vite preview`): the service worker serves the app with no network. Chrome resets `navigator.onLine` on a full reload under DevTools network emulation, so re-apply "Offline" after reloading.

Proposed QR payload: `<ticketCode>.<eventId>.<base64url ECDSA P-256 signature of "ticketCode.eventId">`. Confirm it with the backend before you build the scanner. All encode, parse and verify logic lives in `lib/ticketQr.ts`; change the format there only.

## Proposed API contract (for the backend later)

| Method & path | Used by |
|---|---|
| GET /api/events, GET /api/events/:idOrSlug, GET /api/events/:id/ticket-types | Public site, checkout |
| POST /api/auth/signup → VerificationStart, /login { identifier, password, remember }, /logout, /verify, /verify/resend, /forgot, /reset, /staff/login → { challengeId }, /staff/verify; GET /api/auth/me. Errors return `AuthErrorBody { code, message, attemptsLeft?, lockMinutes? }` (see `endpoints.ts`) | Auth |
| POST /api/checkout/holds → { holdId, expiresAt }; POST /api/checkout/:id/resume → CheckoutResponse (pending orders; 410 after the hold expires); POST /api/checkout { holdId, items, buyer, attendees[one per ticket], … } → { checkoutId, reference, paystackAccessCode, amountKobo }; GET /api/checkout/:id → { status, buyer, tickets (each with its holder), … } | Checkout (guest or user) |
| POST /api/webhooks/paystack | Backend only (verify signature, idempotent) |
| GET /api/me/tickets → { tickets (MyTicket: held by me or bought by me), pending (PendingOrder) }, POST /api/me/tickets/:code/refund { reason, note? } → RefundInfo, GET /api/tickets/:code[?token=guest-link-token], POST /api/tickets/guest-link | Tickets |
| GET /api/me/history → HistoryEntry[] (outcome attended / missed / refunded, from check-ins only) | Hiking history, dashboard |
| GET/PATCH /api/me/profile (a new email or phone returns `pendingContacts` and isn't applied until verified), POST /api/me/contact/verify, /contact/resend, DELETE /api/me/contact/:id, PUT /api/me/notifications, POST/DELETE /api/me/photo (multipart), POST /api/me/delete { password } | Profile |
| GET /api/checkin/events → CheckinEvent[]; GET /api/checkin/:eventId/manifest → CheckinManifest (names, types, statuses, public key; no contact details); POST /api/checkin/scan { eventId, payload, deviceId } → ScanOutcome; POST /api/checkin/manual { eventId, ticketCode, deviceId }; GET /api/checkin/:eventId/roster, /stats, /conflicts; POST /api/checkin/sync { checkins } → { synced: localIds, conflicts } (idempotent, earliest scan wins); POST /api/checkin/conflicts/:id/resolve (admin); POST /api/checkin/:eventId/issues; POST /api/checkin/:eventId/close; POST /api/checkin/reentry { eventId, ticketCode, pin, deviceId, gate } → ScanOutcome (errors: PinErrorBody invalid_pin / pin_locked / pin_not_set). Staff and gate come from the session | Check-in |
| GET /api/ads?placement= → PublicAd[] (approved, unpaused, in schedule; no stats), POST /api/ads/:id/events { type: impression \| click, device } | Public ad slots |
| GET /api/admin/ads?tab&schedule&q → { items, counts, summary }; GET /api/admin/ads/:id, /:id/performance; POST /api/admin/ads, PUT /api/admin/ads/:id (AdInput + submit); POST /api/admin/ads/:id/review { decision, reason? }, /pause, /resume, /terminate { reason }; GET /api/admin/ads/slot?placement&startsAt&endsAt&excludeId; POST /api/admin/ads/check-link { url }; GET /api/admin/ads/advertisers; POST /api/admin/uploads/ad-image. Advertisers get only their own campaigns | Admin / Ads, Create ad, Ad performance |
| GET/PUT /api/admin/notifications { messages }; PUT /api/admin/notifications/providers/:channel { provider, sender, apiKey? }; POST /api/admin/notifications/providers/:channel/test { to } | Admin / Notifications |
| PUT /api/admin/branding (BrandingInput); POST /api/admin/branding/assets/:kind (logo, favicon, banner; multipart) | Admin / Branding |
| GET /api/admin/audit-log?q&action (code or group:x)&actorId&from&to&page[&all] → { items (with recordLabel), total, page, pageSize, actors }. No write endpoints | Admin / Audit log |
| GET /api/admin/overview; GET /api/admin/events?status&range&page; GET/POST/PUT /api/admin/events[/:id] (EventInput + publish); POST /api/admin/events/:id/cancel { reason }; GET /api/admin/events/:id/participants; POST /api/admin/events/:id/attendance (AttendanceCorrection, reason required); GET/PUT /api/admin/checkin/settings; GET /api/admin/checkin/devices; GET /api/admin/checkin/:eventId/sync; POST /api/admin/checkin/conflicts/:id/resolve { decision, reason? }; PUT /api/admin/staff/:id/roles (refuses own role); GET /api/admin/checkin/pins, PUT /api/admin/checkin/pins/:eventId { pin } (super admin; stores a salted hash); GET /api/admin/analytics?from&to&prevFrom&prevTo&eventId&granularity → AnalyticsReport (raw counts only; the client derives every percentage with lib/metrics.ts); POST /api/admin/uploads/cover; GET /api/admin/audit-log | Admin screens |
| POST /api/checkin/devices/heartbeat | Check-in phones (Staff devices) |
| GET /api/admin/tickets/:code → AdminTicketDetail { status, event, holder, payment?, checkIn?, history } (TKT-020) | Admin / Ticket |
| GET /api/admin/ads/:id/performance?from&to → { daily, range, totals, previous, byPlacement } (ADS-016; WAT calendar dates, clipped to the campaign's run) | Admin / Ad performance |
| GET /api/admin/notifications/log?q&type&channel&status&from&to&page → { items: DeliveryRecord[], total, summary } (NOT-009) | Admin / Notifications → Delivery log |
| GET /api/me/export → MyDataExport { profile, tickets, hikingHistory } (NFR-035; no QR payloads or photo bytes) | Hiker / Profile → Download my data |
| PUT /api/admin/events/:id — when a published event's date, time or place changes, the server notifies its ticket holders (EVT-008) | Admin / Create event |
| GET /api/about/stats → { hikesRun, members, guides, seriousIncidents }; POST /api/contact { name, email, message, website (honeypot) } → { reference } (rate-limited) | About & contact |
| GET /api/branding → Branding { name, fullName, tagline, logoUrl?, faviconUrl?, bannerUrl?, contact, colors { primary, secondary, surface } } | Whole app at startup |
| GET /api/admin/transactions?q&from&to&status&page → { items, summary { grossKobo, refundsKobo, feesKobo, netKobo, … } }; POST /api/admin/transactions/:reference/refund { decision, reason } | Admin / Transactions |
| GET /api/admin/hikers?q&kind&status&page[&all]; GET /api/admin/hikers/:id → { hiker, stats (check-ins only), monthly, history }; POST /api/admin/hikers/:id/suspend, /reactivate { reason } | Admin / Hikers, Hiker profile |
| GET /api/admin/search?q → { hikers, tickets }, filtered by the caller's permissions (SRCH-008) | Admin top-bar search |
| GET /api/admin/staff; POST /api/admin/staff/invites, /invites/:id/resend; PUT /api/admin/staff/:id/role (refuses own role and the last super admin); POST /api/admin/staff/:id/activate, /deactivate, /two-factor/reset; POST /api/admin/me/two-factor → { secret, otpauthUri }, /me/two-factor/confirm { code } | Admin / Staff & roles |

## Before launch

- Upgrade react-router-dom to v7. v6 has a moderate open-redirect advisory (GHSA-wrjc-x8rr-h8h6) and no 6.x fix. Breaking upgrade.
- Upgrade tailwindcss to v4 and vite to v8 (with vite-plugin-pwa 2). Their advisories affect only the build and dev server, never the browser bundle. Both are breaking upgrades.
- The backend confirms the QR payload format (`lib/ticketQr.ts`) and uses one signing key per event; phones only ever get the public key.
- The scanner's Test scan panel must not appear in production builds. It's behind `mockTools.enabled` (mocks on and either the dev server or `VITE_TEST_TOOLS=true`), and its import is dynamic, so a normal `npm run build` leaves it out entirely (checked: no panel code in `dist`; a `VITE_USE_MOCKS=false` build contains no mock data or test key since the tree-shaking rule in `vite.config.ts`; before phase 9 it did). Never set `VITE_TEST_TOOLS` for a release.

## Not built (conditional)

- **ADS-018** (campaign payment, budget and spend tracking) applies only "if paid external advertising is enabled". Not built; ads are managed by the group. Add it to Admin / Ads when the group starts selling ad space.

## Screen map and status

✅ = built, ⬜ = placeholder page that names its Figma frame.

| Route | Page file | Figma frame | Status |
|---|---|---|---|
| / | public/Landing | Web / Landing, Mobile / Landing | ✅ |
| /events | public/Events | Web / Events | ✅ |
| /events/:slug | public/EventDetails | Web / Event details, Mobile / Event details | ✅ |
| /about | public/About | Web / About & contact | ✅ |
| /find-ticket | public/FindTicket | Web / Find my ticket | ✅ |
| /terms, /privacy | public/Terms, public/Privacy | none yet (placeholder copy) | ✅ |
| /checkout/:eventId | hiker/Checkout | Hiker / Checkout – guest, details, payment, confirmed, guest confirmed | ✅ |
| /tickets/:code, /account/tickets/:code | hiker/TicketView | Hiker / Ticket (QR), Mobile / Ticket (QR) | ✅ |
| /signup | auth/SignUp | Auth / Sign up | ✅ |
| /verify | auth/VerifyOtp | Auth / Verify OTP | ✅ |
| /login | auth/Login | Auth / Log in, Auth / Log in – error | ✅ |
| /forgot-password | auth/ForgotPassword | Auth / Forgot password | ✅ |
| /reset-password | auth/ResetPassword | Auth / Reset password | ✅ |
| /welcome | auth/AccountVerified | Auth / Account verified | ✅ |
| /staff/login | auth/StaffLogin | Admin / Log in | ✅ |
| /account | hiker/Dashboard | Hiker / Dashboard | ✅ |
| /account/tickets | hiker/MyTickets | Hiker / My tickets | ✅ |
| /account/history | hiker/History | Hiker / Hiking history | ✅ |
| /account/profile | hiker/Profile | Hiker / Profile | ✅ |
| /checkin | checkin/SelectEvent | Check-in / Select event | ✅ |
| /checkin/:eventId/offline | checkin/OfflineDownload | Check-in / Download for offline | ✅ |
| /checkin/:eventId/scan | checkin/Scanner | Check-in / Scanner (online/offline), Check-in / Result – * | ✅ |
| /checkin/:eventId/search | checkin/ManualSearch | Check-in / Manual search | ✅ |
| /checkin/:eventId/sync | checkin/Sync | Check-in / Sync & conflicts | ✅ |
| /checkin/:eventId/close | checkin/CloseAttendance | Check-in / Close attendance | ✅ |
| /admin | admin/Overview | Admin / Overview | ✅ |
| /admin/events | admin/Events | Admin / Events | ✅ |
| /admin/events/new, /:id/edit | admin/EventEditor | Admin / Create event | ✅ |
| /admin/events/:id/participants | admin/Participants | Admin / Event participants, Admin / Attendance correction | ✅ |
| /admin/tickets/:code | admin/TicketDetail | none (TKT-020; linked from participants, transactions, search) | ✅ |
| /admin/checkin | admin/CheckinSettings | Admin / Check-in settings | ✅ |
| /admin/checkin/:id/sync | admin/OfflineSync | Admin / Offline sync review | ✅ |
| /admin/analytics | admin/Analytics | Admin / Analytics | ✅ |
| /admin/transactions | admin/Transactions | Admin / Transactions | ✅ |
| /admin/hikers | admin/Hikers | Admin / Hikers | ✅ |
| /admin/hikers/:id | admin/HikerProfile | Admin / Hiker profile | ✅ |
| /admin/staff | admin/Staff | Admin / Staff & roles | ✅ |
| /admin/ads | admin/Ads | Admin / Ads | ✅ |
| /admin/ads/new, /admin/ads/:id/edit | admin/AdEditor | Admin / Create ad | ✅ |
| /admin/ads/:id | admin/AdPerformance | Admin / Ad performance | ✅ |
| /admin/notifications | admin/Notifications | Admin / Notifications | ✅ |
| /admin/branding | admin/Branding | Admin / Branding | ✅ |
| /admin/audit-log | admin/AuditLog | Admin / Audit log | ✅ |

Update this table when you finish a screen.

## Suggested build order

1. Events listing and event details (reuse `EventCard`).
2. Checkout with guest flow and Paystack (mock first), then the ticket view with QR.
3. Auth pages with zod validation.
4. Hiker dashboard, tickets, history, profile.
5. Check-in: scanner (online), then the offline download, scan, sync and close flow.
6. Admin overview, events, participants, then analytics (recharts plus `lib/metrics.ts`).
7. Remaining admin screens: transactions, hikers, staff, ads, settings, audit log.
