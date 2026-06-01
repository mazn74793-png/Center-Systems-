# Security Specification (TDD) — Educational Centers Billing & Management

This document outlines the security architecture, invariants, and threat vectors for the Educational Centers Billing and Management System.

## 1. Core Data Invariants

1. **Hierarchy Integrity**:
   - Every `ClassGroup` must map to a valid `Teacher`.
   - Every `AttendanceLog` must map to a valid `Student` and a valid `ClassGroup`.
   - Every `FinancialSession` must map to a valid `ClassGroup`.

2. **Temporal Integrity**:
   - All record logging (`createdAt`, `updatedAt`, `timestamp`) must match the actual server transaction time (`request.time`). Client-side overrides are blocked.

3. **Status & Financial Settle Locking**:
   - If a `FinancialSession` is locked (`isClosed = true`), subsequent modifications to any `AttendanceLog` mapping to that session or updates to the financial record are strictly forbidden.

4. **Access Control Hierarchy**:
   - `admin` (Owner): Full read/write access to expenses, config, financial sessions, and users.
   - `teacher`: Can read groups they manage, see their specific students, and view their corresponding financial session shares (read-only).
   - `assistant` (Scanner): Can read all students and classes, read/write attendance logs (scan and register), and collect single-session cash. They cannot read expenses or modify configurations.

---

## 2. The "Dirty Dozen" Rogue Payloads

These 12 scenarios test the security layout and must be rejected with a `PERMISSION_DENIED` response.

### Payload 1: Privilege Escalation (Self-Assign Admin Profile)
*   **Vector**: A newly registered user attempts to write a document inside `/user_profiles/{uid}` with a role as `'admin'`.
*   **Result**: Rejected. Registering user roles is restricted to existing administrators. Or, if it's the first bootstrapping, it must only match the preconfigured owner's email.
```json
// Path: /user_profiles/malicious_user1
{
  "uid": "malicious_user1",
  "name": "Attacker",
  "email": "attacker@hack.com",
  "role": "admin"
}
```

### Payload 2: ID Poisoning (Student ID Buffer Overflow)
*   **Vector**: Attempting to register a student with an ID that exceeds 128 characters or contains malicious shell scripting.
*   **Result**: Rejected. Student IDs must strictly match `^[a-zA-Z0-9_\-]+$` and be under 30 characters.
```json
// Path: /students/malicious_doc
{
  "studentId": "std001_LONG_OVERFLOW_PADDING_JUNK_JUNK_JUNK_JUNK_<script>payload</script>_JUNK_JUNK",
  "name": "Hacked Student Name",
  "phone": "01000000000",
  "parentPhone": "01011111111",
  "academicYear": "Grade 10",
  "qrCodeData": "std001",
  "createdAt": "2026-05-30T12:00:00Z"
}
```

### Payload 3: Changing Immutable Field (`studentId` Update)
*   **Vector**: Changing the internal student ID tracker field after creation.
*   **Result**: Rejected. Once written, `studentId` and `createdAt` must match `existing()`.
```json
// Path: /students/valid_student_doc
{
  "studentId": "std999", // Attempt to swap original std005 to std999
  "name": "Original Name",
  "phone": "01000000000",
  "parentPhone": "01011111111",
  "academicYear": "Grade 10",
  "qrCodeData": "std005",
  "createdAt": "2026-05-30T09:00:00Z"
}
```

### Payload 4: Negative Cash Splitting / Payment Spoofing
*   **Vector**: Inserting a negative or highly malicious payload amount into `paymentAmount` inside `AttendanceLog` to subtract values or skip registration fees.
*   **Result**: Rejected. Payments must be `>= 0` and correspond to numbers.
```json
// Path: /attendance_logs/log_999
{
  "studentId": "std001",
  "studentName": "John Doe",
  "groupId": "group1",
  "sessionId": "session1",
  "timestamp": "2026-05-30T12:00:00Z",
  "status": "present",
  "isPaid": true,
  "paymentAmount": -5000, // Attack: Subtract cash
  "bookletReceived": true,
  "bookletPaid": true
}
```

### Payload 5: Spoofed Temporal Signature
*   **Vector**: Overriding the `createdAt` timestamp of a new student profile registration to a date in 2020 to bypass analytics.
*   **Result**: Rejected. Timestamps must strictly compare to `request.time`.
```json
// Path: /students/new_student
{
  "studentId": "std008",
  "name": "Time Traveler",
  "phone": "01022222222",
  "parentPhone": "01033333333",
  "academicYear": "Grade 11",
  "qrCodeData": "std008",
  "createdAt": "2020-01-01T00:00:00Z" // Attack: Bypassing server timestamp request.time
}
```

### Payload 6: Financial State Unrequested Updates (Settle Overrides)
*   **Vector**: An assistant or scanner attempting to rewrite the center's config database singleton to alter the WhatsApp credentials or change system-wide default fee rules.
*   **Result**: Rejected. Center config edits are strictly restricted to Super Admin profiles.
```json
// Path: /centers_config/main_config
{
  "name": "Infiltrated Center",
  "currency": "USD",
  "whatsappApiUrl": "https://attacker-webhook.com/leak", // Attack: Drain telemetry data
  "whatsappToken": "stolen_token",
  "whatsappInstanceId": "spoofed_instance",
  "whatsappEnabled": true
}
```

### Payload 7: Materials Cost Inflation
*   **Vector**: Assistant trying to change the cost of booklets (`bookletCost` or `bookletPrice`) of a `ClassGroup` config to cover up drawer thefts.
*   **Result**: Rejected. ClassGroup splits, booklet pricing, and teacher settings are restricted fields editable only by administrators.
```json
// Path: /classes_groups/group_red
{
  "teacherId": "t1",
  "name": "Grade 12 Physics",
  "pricePerSession": 100,
  "bookletPrice": 1000, // Attack: Artificially inflated
  "bookletCost": 10,
  "teacherShare": 70,
  "schedule": "Sat 3pm"
}
```

### Payload 8: Circumvent Session Freeze (Terminal State Locking)
*   **Vector**: User attempts to update or delete a scanned attendance entry on a group session that was already finalized, closed, and audited (`isClosed = true`).
*   **Result**: Rejected. Once `isClosed == true` inside the session document, all associated edits must be rejected.
```json
// Path: /attendance_logs/log_on_frozen_session
{
  "studentId": "std002",
  "groupId": "group1",
  "sessionId": "closed_session_abc", // Already closed!
  "status": "present",
  "isPaid": true,
  "paymentAmount": 150,
  "bookletReceived": true,
  "bookletPaid": true
}
```

### Payload 9: Self-Assigned Revenue Split Log Customizations
*   **Vector**: An assistant attempts to update the finished ledger `FinancialSession` directly to alter their processed `cashCollected` and pocket the difference.
*   **Result**: Rejected. Live financial sessions cannot be modified directly by non-admins once created except via automated session markers.
```json
// Path: /financial_sessions/session_xyz
{
  "groupId": "g1",
  "sessionDate": "2026-05-30T10:00:00Z",
  "totalAttendance": 20,
  "totalSessionRevenue": 2000,
  "totalBookletsSold": 20,
  "totalBookletRevenue": 400,
  "teacherEarnings": 1400,
  "centerEarnings": 600,
  "cashCollected": 100, // Attack: pocket EGP 2300 of cash box!
  "isClosed": true
}
```

### Payload 10: Unauthorized Data Scraping (Bypassing User Isolation)
*   **Vector**: A local teacher logging into their account, then querying and downloading the private directory of other groups under different teachers.
*   **Result**: Rejected. Read list operations on groups, schedules, and financial logs must be bound to the respective teacher's mappings if they are logged in with the teacher role.
```js
// Collection Query on /financial_sessions where teacherId !== student teacher reference
```

### Payload 11: Private Expense Leakage
*   **Vector**: An Assistant logs in and runs standard collections list on `/center_expenses` to inspect executive salary margins and profit parameters.
*   **Result**: Rejected. All reads/writes on `/center_expenses` are mathematically sealed from everyone who is not a verified Super Admin (`role == 'admin'`).
```js
// Query list to /center_expenses
```

### Payload 12: Phantom Booklet Stock Refuels
*   **Vector**: Assistant attempts to increase the stock level of booklets in a class group to mask inventory losses without administrative voucher creation.
*   **Result**: Rejected. Edits to `bookletStock` of class groups require Admin access.
```json
// Path: /classes_groups/group_blue
{
  "bookletStock": 9999
}
```

---

## 3. Test Cases (TDD Verification Runner)

All code written in the applications will wrap every standard read, list, and write action into the secure handler:

```ts
// TDD verification strategy
import { handleFirestoreError } from './src/lib/firebase';
// Operations will fail-closed if permissions reject.
```
