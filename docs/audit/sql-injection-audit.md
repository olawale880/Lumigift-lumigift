# SQL Injection Audit

**Date:** 2026-06-26  
**Scope:** `src/server/services/`, `src/lib/db.ts` (if present)  
**Auditor:** unixfundz

---

## Summary

All files in scope were audited for string interpolation in SQL queries. No raw SQL queries exist in the current codebase — the data layer uses an in-memory `Map` store pending PostgreSQL migration.

**Result: No SQL injection vulnerabilities found.**

---

## Files Audited

| File | SQL Queries | String Interpolation | Status |
|------|-------------|----------------------|--------|
| `src/server/services/gift.service.ts` | None (in-memory Map) | N/A | ✅ Clean |
| `src/server/services/claim.service.ts` | None | N/A | ✅ Clean |
| `src/server/services/scheduler.service.ts` | Comment only (TODO) | None | ✅ Clean |
| `src/server/middleware/index.ts` | None | N/A | ✅ Clean |
| `src/lib/db.ts` | File does not exist yet | N/A | ⏳ Pending migration |

The only SQL text in the codebase is a comment in `scheduler.service.ts`:
```ts
// TODO: replace with DB query: SELECT * FROM gifts WHERE status='locked' AND unlock_at <= now
```
This is not executed code and poses no risk.

---

## ESLint Rule Added

`.eslintrc.json` now includes `no-restricted-syntax` rules that flag:

1. **Template literals inside `sql`-tagged strings** — catches the pattern `sql\`SELECT ... ${userInput}\``
2. **Template literals inside `db.query(...)` template strings** — catches `db.query\`... ${value}\``

Any future violation produces an ESLint error:
> SQL injection risk: do not use template literal expressions in sql-tagged strings. Use parameterized query placeholders ($1, $2, ...) and pass values as a separate array instead.

---

## Parameterized Query Standard

Once `gift.service.ts` is migrated to PostgreSQL, all queries **must** follow this pattern:

```ts
// ✅ Correct — parameterized
const result = await db.query(
  'SELECT * FROM gifts WHERE id = $1 AND sender_id = $2',
  [giftId, senderId]
);

// ❌ Forbidden — string interpolation
const result = await db.query(
  `SELECT * FROM gifts WHERE id = '${giftId}'`  // ESLint error
);
```

---

## Next Steps

- [ ] When `gift.service.ts` PostgreSQL migration lands, re-run this audit
- [ ] Add `pg` or `postgres` client with strict typing (`@types/pg`)
- [ ] Consider adding `eslint-plugin-security` for broader injection detection
