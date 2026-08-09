# API guide

The API is JSON over HTTP. Send an `x-api-key` header for user operations. Keys identify actors; the actor still needs a membership in the target organization. The internal planning route uses the separate `x-worker-token` header and is not a public browser endpoint.

## Response conventions

Successful responses wrap their resource in `data`. Expected errors use this shape:

```json
{
  "error": {
    "code": "conflict",
    "message": "Work order changed; refresh before dispatching",
    "requestId": "..."
  }
}
```

| Code | Meaning |
| --- | --- |
| `400` | Validation failure |
| `403` | Missing key, membership, role, or worker credential |
| `404` | Resource not found inside the selected organization |
| `409` | Optimistic concurrency conflict |
| `422` | Invalid lifecycle state |

## Core endpoints

| Method | Path | Minimum role |
| --- | --- | --- |
| `POST` | `/v1/organizations` | authenticated actor becomes owner |
| `POST` | `/v1/organizations/:organizationId/members` | owner |
| `GET` | `/v1/organizations/:organizationId/dashboard` | viewer |
| `GET/POST` | `/v1/organizations/:organizationId/assets` | viewer / dispatcher |
| `GET/POST` | `/v1/organizations/:organizationId/technicians` | viewer / dispatcher |
| `POST` | `/v1/organizations/:organizationId/maintenance-plans` | dispatcher |
| `GET/POST` | `/v1/organizations/:organizationId/work-orders` | viewer / dispatcher |
| `GET` | `/v1/organizations/:organizationId/work-orders/:workOrderId/recommendations` | dispatcher |
| `POST` | `/v1/organizations/:organizationId/work-orders/:workOrderId/dispatch` | dispatcher |
| `POST` | `…/start`, `…/block`, `…/complete` | technician |
| `POST` | `/internal/planner/tick` | worker token |

## Dispatch example

The client first reads the work order, then submits its current `version`. A `409` means the client must refresh and present the new schedule state to the dispatcher.

```bash
curl -X POST "$API/v1/organizations/$ORG/work-orders/$ORDER/dispatch" \
  -H 'content-type: application/json' \
  -H 'x-api-key: dispatcher-key' \
  -d '{"technicianId":"a24ca766-37a3-47fc-af48-e3773b3d30dc","expectedVersion":1}'
```

## Integration guidance

Do not expose the API key in a public client application. In production, exchange an authenticated user session for a server-side tenant-aware credential, apply rate limits at the edge, and route planner traffic privately. The present key model makes local operation and explicit test cases simple; it is not a substitute for an identity provider.
