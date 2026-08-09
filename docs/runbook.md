# Operational runbook

## Startup checklist

1. Set unique, random `ASTERION_WORKER_TOKEN` and `ASTERION_API_KEYS_JSON` secrets.
2. Give the API a persistent state path or move to the PostgreSQL adapter.
3. Create the organization and the required memberships before turning on the worker.
4. Set `ASTERION_ORGANIZATION_ID` for the worker to the intended tenant only.
5. Confirm `/healthz`, then observe the first planner tick.

## Incident: critical work is unassigned

1. Open the dashboard and filter for critical, unassigned work.
2. Verify asset criticality and required skills are accurate; incorrect requirements create false exclusion.
3. Inspect the dispatch recommendation list and daily utilization.
4. Assign, reassign, or explicitly block the order with the physical constraint recorded.
5. If no technician qualifies, escalate according to local on-call policy; do not lower the required skill merely to clear the queue.

## Incident: planner has stopped creating preventive work

1. Check worker logs for `planner.tick` failures.
2. Verify the API URL, worker token, and organization ID.
3. Call the internal route from a trusted environment to isolate worker scheduling from API policy.
4. Check the plan's `active` flag and `lastGeneratedFor`; a repeat tick on the same cadence day intentionally produces zero work.
5. After recovery, run a tick once and inspect audit events for generated work.

## Backup and recovery

For the SQLite adapter, quiesce writes or use SQLite's online backup tooling before copying the state file and associated WAL files. Test restores regularly. For PostgreSQL, use point-in-time recovery and validate that RLS context is set by the adapter. Audit and outbox data are operational records; define retention and export policy with the organization’s compliance owner.

## Release protocol

1. `npm run check`
2. Review migration changes and tenant policy implications.
3. Deploy API before worker changes that depend on new behavior.
4. Watch 5xx rate, worker error rate, overdue-count deltas, and outbox lag.
5. Roll back application code, not state schema, unless the migration has an explicit tested down path.
