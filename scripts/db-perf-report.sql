CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

\echo ''
\echo 'Current PostgreSQL performance settings'
SELECT
    name,
    setting,
    COALESCE(unit, '') AS unit,
    source
FROM pg_settings
WHERE name IN (
    'shared_buffers',
    'effective_cache_size',
    'work_mem',
    'random_page_cost',
    'log_min_duration_statement'
)
ORDER BY name;

\echo ''
\echo 'Top statements by mean execution time'
SELECT
    queryid,
    calls,
    round(mean_exec_time::numeric, 2) AS mean_ms,
    round(total_exec_time::numeric, 2) AS total_ms,
    left(regexp_replace(query, '\s+', ' ', 'g'), 140) AS query
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat_statements%'
ORDER BY mean_exec_time DESC
LIMIT 10;

\echo ''
\echo 'Tables with sequential scans'
SELECT
    schemaname,
    relname,
    seq_scan,
    seq_tup_read,
    idx_scan,
    CASE WHEN seq_scan = 0 THEN 0 ELSE seq_tup_read / seq_scan END AS avg_seq_tup
FROM pg_stat_user_tables
WHERE seq_scan > 0
ORDER BY seq_tup_read DESC
LIMIT 10;

\echo ''
\echo 'Dead tuples / autovacuum candidates'
SELECT
    relname,
    n_live_tup,
    n_dead_tup,
    round(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_pct,
    last_autovacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 0
ORDER BY n_dead_tup DESC
LIMIT 10;

\echo ''
\echo 'Fillfactor / bloat candidates (stats-based, not a migration recommendation by itself)'
SELECT
    s.schemaname,
    s.relname,
    pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
    s.n_live_tup,
    s.n_dead_tup,
    round(100.0 * s.n_dead_tup / NULLIF(s.n_live_tup + s.n_dead_tup, 0), 2) AS dead_pct,
    s.n_tup_upd,
    s.n_tup_hot_upd,
    round(100.0 * s.n_tup_hot_upd / NULLIF(s.n_tup_upd, 0), 2) AS hot_update_pct,
    COALESCE(array_to_string(c.reloptions, ', '), '') AS reloptions,
    s.last_autovacuum,
    s.autovacuum_count
FROM pg_stat_user_tables s
JOIN pg_class c ON c.oid = (quote_ident(s.schemaname) || '.' || quote_ident(s.relname))::regclass
WHERE s.n_tup_upd > 0 OR s.n_dead_tup > 0
ORDER BY
    s.n_dead_tup DESC,
    s.n_tup_upd DESC,
    pg_total_relation_size(c.oid) DESC
LIMIT 20;

\echo ''
\echo 'Largest user relations'
SELECT
    n.nspname AS schemaname,
    c.relname,
    CASE c.relkind
        WHEN 'r' THEN 'table'
        WHEN 'i' THEN 'index'
        WHEN 't' THEN 'toast'
        ELSE c.relkind::text
    END AS kind,
    pg_size_pretty(pg_relation_size(c.oid)) AS relation_size,
    pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
    COALESCE(array_to_string(c.reloptions, ', '), '') AS reloptions
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'i', 't')
ORDER BY pg_total_relation_size(c.oid) DESC
LIMIT 20;

\echo ''
\echo 'Unused non-primary indexes'
SELECT
    schemaname,
    relname,
    indexrelname,
    idx_scan,
    pg_size_pretty(pg_relation_size(indexrelid::regclass)) AS index_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexrelname NOT LIKE '%pkey'
ORDER BY pg_relation_size(indexrelid::regclass) DESC
LIMIT 20;
