# Lumigift API Reference

The current versioned API lives under `/api/v1/`. Legacy unversioned routes listed below are **deprecated** and will be removed after the sunset date.

---

## Legacy Admin Routes — `DEPRECATED`

> **⚠️ DEPRECATED**  These routes are **not** in the OpenAPI spec and exist only for backward-compatibility with internal tooling.
>
> | Header | Value |
> |--------|-------|
> | `Deprecation` | `true` |
> | `Sunset` | `Sat, 27 Sep 2026 00:00:00 GMT` |
>
> **Timeline:** All legacy routes below are deprecated as of 2026-06-27 and will be removed **90 days later on 2026-09-27**.  
> Migrate to the `/api/v1/` equivalents listed in each section.

---

### `GET /api/admin/gifts`

Lists all gifts across all users. Supports optional query filters.

**`DEPRECATED`** — use [`GET /api/v1/admin/gifts`](#get-apiv1admingifts) instead.

#### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | `string` | Filter by gift status (`pending_payment`, `funded`, `claimed`, `expired`, `cancelled`) |
| `userId` | `string` | Filter by sender user ID |
| `from` | `ISO 8601 date` | Start of date range (inclusive) |
| `to` | `ISO 8601 date` | End of date range (inclusive) |

#### Response

```json
{ "success": true, "data": [ /* Gift[] */ ] }
```

#### Deprecation Headers Returned

```
Deprecation: true
Sunset: Sat, 27 Sep 2026 00:00:00 GMT
Link: </api/v1/admin/gifts>; rel="successor-version"
```

---

### `POST /api/admin/gifts/[id]/expire`

Forces a gift into the `expired` state.

**`DEPRECATED`** — use [`POST /api/v1/admin/gifts/[id]/expire`](#post-apiv1admingiftsidexpire) instead.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string (UUID)` | Gift ID |

#### Response

```json
{ "success": true, "data": { /* Gift */ } }
```

---

### `POST /api/admin/gifts/[id]/refund`

Initiates a refund for a gift.

**`DEPRECATED`** — use [`POST /api/v1/admin/gifts/[id]/refund`](#post-apiv1admingiftsidrefund) instead.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string (UUID)` | Gift ID |

#### Response

```json
{ "success": true, "data": { /* Gift */ } }
```

---

### `POST /api/admin/users/[id]/ban`

Bans a user account.

**`DEPRECATED`** — use [`POST /api/v1/admin/users/[id]/ban`](#post-apiv1adminusersidban) instead.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string (UUID)` | User ID |

#### Response

```json
{ "success": true, "data": { "id": "...", "banned": true } }
```

---

## Migration Guide

All legacy `/api/admin/*` routes map 1-to-1 to `/api/v1/admin/*`. Replace the path prefix — request/response shapes are identical.

| Legacy route | v1 equivalent |
|---|---|
| `GET /api/admin/gifts` | `GET /api/v1/admin/gifts` |
| `POST /api/admin/gifts/[id]/expire` | `POST /api/v1/admin/gifts/[id]/expire` |
| `POST /api/admin/gifts/[id]/refund` | `POST /api/v1/admin/gifts/[id]/refund` |
| `POST /api/admin/users/[id]/ban` | `POST /api/v1/admin/users/[id]/ban` |

All routes require an admin session (cookie-based via NextAuth) or an `Authorization: Bearer <ADMIN_TOKEN>` header.

---

## Current v1 Admin Routes

See the [OpenAPI spec](/api/docs) for the full, authoritative v1 API reference.

### `GET /api/v1/admin/gifts`

Same behaviour as the legacy route. Full spec in `openapi.yaml`.

### `POST /api/v1/admin/gifts/[id]/expire`

### `POST /api/v1/admin/gifts/[id]/refund`

### `POST /api/v1/admin/users/[id]/ban`
