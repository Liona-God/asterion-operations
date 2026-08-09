# Decision records

## ADR-001: modular monolith before distributed services

**Context:** Operations policy needs rapid iteration and coherent transactions across assignment, audit, and risk.  
**Decision:** Keep one deployable API with clear package boundaries.  
**Consequences:** Easier local tests and deployment; later extraction must be driven by measured load or ownership needs, not fashion.

## ADR-002: explicit risk bands instead of a hidden urgency score

**Context:** Dispatchers need fast, explainable decisions.  
**Decision:** Derive `on_track`, `at_risk`, and `overdue` from priority-specific windows.  
**Consequences:** UI and escalation are clear; risk policy is centralized and can evolve with real service data.

## ADR-003: immutable audit plus outbox on every material mutation

**Context:** A work-order system becomes unreliable if integrations and history diverge.  
**Decision:** Core emits both records synchronously with the domain mutation.  
**Consequences:** An outbox publisher can be introduced without changing business policy; storage must keep writes atomic.

## ADR-004: SQLite adapter for runnable local state, PostgreSQL schema for production

**Context:** A serious sample should start in minutes without concealing multi-tenant production requirements.  
**Decision:** Ship a durable local adapter and a normalized RLS schema side by side.  
**Consequences:** The adapter interface is intentionally small; a PostgreSQL implementation is the next production hardening step.
