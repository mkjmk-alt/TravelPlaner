# Efficient account synchronization implementation

Goal: preserve local edits, deletions, account isolation and eventual reconciliation while reducing unchanged foreground polling and keeping prompt cross-device updates.

- Add an idempotent migration publishing only account records to Supabase Realtime; retain existing RLS and tombstones. Do not execute a migration or touch production data during development.
- Treat account-filtered Realtime events as invalidations only, debounce bursts, and use authenticated existing synchronization instead of trusting notification payloads. On reconnect, foreground, login and manual request perform reconciliation; a 60-second foreground fallback handles dropped notifications, disabled publications and network outages. Keep local changes immediate and conflict/queue guards intact.
- Stop subscriptions when hidden/backgrounded or the account changes; maintain account scope and avoid stale callbacks. Do not alter shared-trip authorization or its distinct protocol.
- Add focused mocked event/lifecycle tests and NativeCore policy tests. Build web/iOS and run existing sync and conflict suites. Real account round trip, publication and battery measurement require separate verification.

Implementation notes: account-scoped SHA-256 metadata fingerprints skip unchanged transfers; account-scoped delta RPC compares identity, revision, and deletion state in one database snapshot. Unknown records, invalid response, oversized input, unsupported RPC or user-requested full sync fall back to full reconciliation. Full paginated reads are not applied if available fingerprints change during the read. Web preserves dirty/pending guards and retries when local work becomes idle; native retains the operation queue and optimistic conflict handling. Servers without the migration keep the previous ten-second fallback. Realtime subscriptions are hints, not authoritative writes. A dedicated shared-trip poll remains separate and skips hidden web pages.
