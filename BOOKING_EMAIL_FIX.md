# Booking email and payment corrections - October 15, 2026

The owner explicitly authorized payment implementation changes for this fix.
These changes are local; production deployment and actual inbox delivery have
not been verified for this version. No real payments or emails were triggered.

## Email behavior

Both complimentary and paid bookings send separate confirmations to the user and
counsellor. Paid bookings also send separate receipts. Messages include the date
and time in IST. Both recipients receive the Zoom participant join URL.
Counsellors also receive their authenticated dashboard link, which retrieves a
fresh Zoom host URL server-side.
Paid appointments now retain their Zoom meeting ID; older join URLs can supply
that ID as a fallback. Host credentials are not stored in appointment records.

Notification records are created atomically with booking confirmation, then SMTP
attempts are awaited. Paid webhook retries attempt failed messages, skipping
accepted messages. SMTP failure returns 503 after the payment has been safely
recorded, allowing Razorpay to retry without charging again.

Per-message state is stored in complimentaryNotifications / bookingNotifications.
Sent means SMTP acceptance, not guaranteed inbox delivery. Concurrent attempts
use two-minute leases and stable Message-IDs. Exactly-once email delivery cannot
be guaranteed if a process stops between SMTP acceptance and the status write.
Failures have exponential backoff; five failures require manual attention.

The dashboard Retry confirmation emails action calls the authenticated owned
retry endpoint. Completed sends are skipped. Staff should monitor failed and
needs_attention records. Existing records created before this release may not
have notification queue entries; an owned retry request can initialize them.

## Scheduled retries - operator action required

After deploying the backend, configure Cloud Scheduler to POST every five minutes
to:

https://mindsoul-backend-772700176760.asia-south1.run.app/internal/cron/retry-booking-emails

Supply x-cron-secret with the deployed CRON_SECRET. Do not use a payment webhook
secret for this endpoint. The endpoint processes small batches with leases and
backoff; adding the endpoint alone does not create a scheduler job.

The admin cleanup route now requires admin authentication. Existing scheduler
calls must use POST /internal/cron/cleanup-expired-appointments and x-cron-secret.
Legacy ambiguous reservations without bookedAppointmentId are not automatically
released: staff must review them rather than risk releasing another booking.

## Payment and reservation checks

- Order creation rejects expired/free/nonpayable bookings, unsupported currency,
  and invalid amounts. Existing orders must match the booking. Provider lookup
  outages return a retryable error rather than create another order.
- Verification requires the booking owner's authentication, validates the
  signature even for already-paid bookings, and binds order/payment, appointment,
  amount and currency. It does not charge or mark bookings paid.
- Captured webhook handling validates the binding, then transactionally updates
  the reservation, master appointment, dashboard mirrors, payment history and
  pending email records. Expiry/TTL fields are cleared on paid appointments.
- Replayed events repair legacy partial writes. Late failure events cannot undo
  success. Conflicting slot ownership prevents confirmation and is logged for
  manual payment/booking review; no automatic refund is implemented.
- Cleanup rereads each pending record transactionally and releases only matching
  appointment ownership. Paid booking reservation writes recheck the latest slot.
- Paid Zoom creation uses explicit IST and selected session duration; a meeting
  created for a losing reservation is deleted on the confirmed conflict path.
- Firestore appointment writes are denied to browser clients. Backend Admin SDK
  APIs perform these mutations. Deploy firestore.rules separately; Cloud Build
  deployment of the container does not deploy rules.

## Validation and release

58 backend tests and 16 frontend tests pass; production frontend build succeeds.
Tests cover accepted/failed SMTP, retry replay, active/expired leases, signed
webhooks, wrong order/amount, atomic failure and repair, late payment failure,
cleanup races, reservation conflicts, and Zoom timezone/duration. Mocked browser
checks verify email retry feedback and counsellor host-link retrieval.

Deploy backend first, then frontend. Retain the live Razorpay/Zoom credentials,
verified Gmail app password and intended FRONTEND_URL. Deploy Firestore rules,
update cron callers and configure the retry scheduler. A fresh production config
check, one approved delivery check per recipient, and a controlled end-to-end
payment/webhook/receipt check remain necessary before declaring production verified.
