# Threat model

## Assets to protect

- Tenant work-order, asset, capacity, and audit data.
- Actor and worker credentials.
- The integrity of lifecycle transitions and preventive-generation cadence.
- Availability of the dispatch and planning loop.

## Threats and controls

| Threat | Control in this repository | Production responsibility |
| --- | --- | --- |
| Cross-organization access | Organization ID + membership checks in core; PostgreSQL RLS target schema | Test RLS context in every database transaction |
| Stolen user key | Keys are required at API boundary and are never sent by the demo UI automatically | Replace with OIDC/session exchange, rotate and revoke keys |
| Planner impersonation | Separate worker token from user keys | Private network path, secret manager, token rotation |
| Lost concurrent dispatch | Work-order `version` check | Render conflict resolution UX and measure conflicts |
| Injection | Zod input constraints and parameterized SQLite statement | Edge WAF, dependency patch cadence, CSP/TLS headers |
| Audit tampering | Core appends audit with each mutation | Immutable export / SIEM retention controls |
| Worker replay | Cadence check on `lastGeneratedFor` | Add distributed locking/lease with multi-node workers |

## Deliberate limitations

This starter does not claim to include SSO, rate limiting, encryption-key management, immutable audit storage, database replication, or a complete privacy program. Those belong to the environment and are documented so they cannot be silently mistaken for solved requirements.
