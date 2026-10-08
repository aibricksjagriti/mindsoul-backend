# Audit fixes and protected payment review

Changes are local and have not been deployed. Backend payment controllers/routes,
Razorpay service, payment middleware, pricing implementation, appointment creation,
cleanup, Zoom creation, payment email implementation, and app payment wiring are unchanged.

## Findings 1–11

| Finding | Status | Change or remaining dependency |
| --- | --- | --- |
| 1: client role escalation | Implemented | User profile rules allow updates only to personal/medical fields; client creation/deletion is denied. The Admin SDK still creates profiles. Deploy the updated rules to make this effective. |
| 2: counsellor profile/email takeover | Implemented | New route middleware requires owner/admin access and preserves the existing login email. The pricing block is unchanged. |
| 3: cross-counsellor schedule changes | Implemented | Owner/admin checks protect schedule mutations, exception reads, slot refresh, and generation. |
| 4: concurrent double booking | Unresolved, payment-owner dependency | Appointment creation still reads availability outside a transaction. Frontend submission locking reduces repeated clicks but cannot fix server-side concurrency. |
| 5: public/racing refresh | Implemented | Refresh requires owner/admin authorization. Schedule and slots are read together in a transaction; reservation/config changes cause retry. Public booking pages only read slots. |
| 6: inconsistent timezones | Partially implemented | Slot availability, slot expiry, and active frontend booking dates use Indian time. Appointment validation and Zoom timestamps remain unchanged in protected booking implementation. |
| 7: Zoom host links | Unresolved, payment-owner dependency | Appointment creation still stores the participant URL instead of the returned host URL. A complete fix requires protected appointment/Zoom changes. |
| 8: obsolete availability | Implemented | Reconciliation removes obsolete unbooked slots, preserves booked ones, updates unbooked duration, and avoids new slots overlapping reservations. Weekly saves reconcile the existing 45-day horizon. |
| 9: cookie remains after logout | Implemented | Added non-payment logout endpoint to clear the secure cookie. Frontend awaits it and clears both user and counsellor session state. |
| 10: checkout callback errors | Implemented | Verification callback handles errors, releases loaders, and offers status recovery without another charge. Requests and SDK loading have time limits. |
| 11: premature confirmation | Implemented | Confirmation waits for `scheduled` through the existing user-appointments API. Pending processing remains a recoverable state. |

## Findings 12–32

All findings in this group have local fixes, including those completed in the first pass.

| Finding | Fix |
| --- | --- |
| 12 | Exception reads use the imported database and nested profile time configuration. |
| 13 | Exception deletion removes the actual root map entry and regenerates availability. Creation, replacement, and lookup use that same map. |
| 14 | Confirmation counts booked slots only. |
| 15 | Weekly saves reconcile the 45-day horizon (first pass). |
| 16 | New profiles initialize root weekly availability from selected working days/hours and generate slots. Existing weekly choices are preserved. |
| 17 | Multipart single working-day values are normalized to arrays. |
| 18 | Profile reads return saved slot duration. |
| 19 | Slot generation errors propagate (first pass). |
| 20 | Active booking uses consistent Indian dates (first pass); obsolete date-selector routes redirect to counsellor selection. |
| 21 | Superseded slot requests are aborted (first pass); counsellor fetches now also reject stale responses. |
| 22 | Booking/confirmation state resets when the modal reopens (first pass). |
| 23 | Confirmation initials tolerate null names. |
| 24 | Profile login passes the callback actually consumed by LoginPage and resumes booking. |
| 25 | `/booking`, `/appointment`, and `/profile` redirect to the supported counsellor-selection flow. |
| 26 | Counsellor guard/login check an authenticated backend session endpoint; expired sessions permit login and temporary failures provide retry. |
| 27 | Successful counsellor session resolution synchronizes context/local storage; switching login identity clears the old role state (first pass). |
| 28 | Static filter/session routes precede `/:id`; language and expertise filters both apply. Added the corresponding counsellor array-query indexes. |
| 29 | User/counsellor validators check scalar types, array members, durations and hours before string operations. Existing immutable-email middleware safely supplies omitted email. |
| 30 | Counsellor list error handling references the caught error and profile email has a defined fallback. |
| 31 | Quotes validate before persistence. A notification failure leaves a saved request marked pending and still returns accepted, avoiding error-driven resubmission. Pending notifications need operational follow-up; no background delivery worker was introduced. |
| 32 | Quote email values are HTML escaped, without changing payment email templates. |

Deploy the updated counsellor indexes along with backend/frontend changes. Session checks
need the new `/api/counsellor/session` endpoint. Firestore/index deployment and production
services have not been invoked.

## Payment-owner review: findings 33–37

No payment implementation was edited and no payment events were sent.

1. **33 — Webhook partial writes:** inspect failure after master appointment success but before payment history/mirrors. The current idempotency guard prevents retry repair. Review retry-safe finalization in an isolated payment test environment.
2. **34 — Cleanup/capture race:** inspect capture concurrent with expiry and capture after slot release/rebooking. Review coordinated ownership, expiry, and appointment mirrors.
3. **35 — Public cleanup endpoint:** review access control on `/api/admin/cleanup-expired-appointments`, which currently has no authentication.
4. **36 — Price compounding:** review the editor's final-price input versus the backend's base-price interpretation. An unchanged save can add the platform fee again.
5. **37 — Appointment/order association:** verify that signed payment details cannot acknowledge an unrelated appointment. Current verification checks payment-to-order association only.

## Validation

- Backend: `npm test` passes 23 regression tests using mocked SDK dependencies and transactions; no production services are contacted. Tests include exception storage, validation, filtering, onboarding, session verification, and quote failures/escaping.
- Frontend: `npm test` passes 12 regression tests for booking dates, scheduling confirmation, API errors, cancellation, verification recovery, duplicate submission prevention, expired sessions, and null-name rendering.
- Frontend production build succeeds.
- Existing lint failures remain outside this fix scope. Comparison of changed files against Git HEAD found no introduced lint findings.
- Backend source syntax and Git whitespace checks pass.
- Protected backend payment files were verified unchanged against Git HEAD. Only non-payment sections of the counsellor controller changed; its pricing block was separately verified identical.

Firestore rule enforcement, actual transaction contention, cross-site cookie behavior,
and live Zoom/Razorpay flows still need staging verification. Apply backend/frontend
changes and Firestore rules together; the frontend now uses `/api/auth/logout` and
depends on authorized schedule generation rather than public slot refresh.
