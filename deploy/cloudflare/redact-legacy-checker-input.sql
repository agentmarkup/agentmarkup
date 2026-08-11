-- Optional one-time privacy backfill for databases that predate normalized-only
-- storage. Export the target database or record a D1 Time Travel bookmark first.
-- This update is idempotent, but the original requested_input values cannot be
-- recovered from the database after it runs.
UPDATE checker_checks
SET requested_input = normalized_url
WHERE requested_input <> normalized_url;
