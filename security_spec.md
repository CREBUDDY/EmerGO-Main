# Security Specification: AI Emergency SOS Network (AESN)

## Data Invariants
1. **User Identity Bind**: Every document in `/users` and `/notifications` must belong to the `request.auth.uid`.
2. **SOS Ownership**: Only the creator of an SOS event can modify its core details (transcript, type, coordinates).
3. **Admin Supremacy**: Admins have full read/delete access across all collections.
4. **Terminal Integrity**: Once an SOS is marked `isResolved: true`, it cannot be reopened.
5. **PII Isolation**: Primary contact info and medical data are restricted to the owner and admins.
6. **Network Integrity**: Mesh nodes must be updated only by the device they represent.

## The Dirty Dozen Payloads (Red Team Tests)

| # | Attack Vector | Target | Payload Example / Action | Expected Result |
|---|---------------|--------|--------------------------|-----------------|
| 1 | Identity Spoof | `/users/victim_uid` | Create with `uid: 'attacker_uid'` | `PERMISSION_DENIED` |
| 2 | Privilege Esc. | `/users/me` | Update `{ role: 'admin' }` | `PERMISSION_DENIED` |
| 3 | ID Poisoning | `/sos_events/{junk_id}` | `{junk_id: "A" * 1024 * 1024}` | `PERMISSION_DENIED` |
| 4 | Impersonation | `/sos_events/new` | `{ userId: 'someone_else' }` | `PERMISSION_DENIED` |
| 5 | PII Leak | `/users/someone_else` | `get()` | `PERMISSION_DENIED` |
| 6 | State Reversal | `/sos_events/id` | `update { isResolved: false }` where `existing.isResolved == true` | `PERMISSION_DENIED` |
| 7 | Sys. Field Hack | `/sos_events/id` | `update { timestamp: 1234 }` (Modify immutable field) | `PERMISSION_DENIED` |
| 8 | Resource Exhaust | `/notifications/id`| `{ message: "A" * 1000000 }` | `PERMISSION_DENIED` |
| 9 | Unverified User | `/sos_events/new` | `create` with `email_verified: false` | `PERMISSION_DENIED` |
| 10| Invalid ID Char | `/sos_events/!@#$` | `create` with invalid chars in ID | `PERMISSION_DENIED` |
| 11| Unowned Update | `/sos_events/id` | `update { transcript: 'fake' }` by non-owner | `PERMISSION_DENIED` |
| 12| Orphaned Write | `/sos_events/new` | `create` with `userId` of non-existent user | `PERMISSION_DENIED` |

## Test Runner Preview
I will implement `firestore.rules.test.ts` (using a mock or simulated environment if available, otherwise focusing on the logic) to verify these.
