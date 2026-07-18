-- TLT business-data invariants.
-- Запускается после smoke/e2e/user-flow сценариев, чтобы проверить не только
-- HTTP-ответы, но и состояние производных данных в Postgres.

DO $$
DECLARE
  violations integer;
BEGIN
  SELECT COUNT(*) INTO violations
  FROM projects
  WHERE user_id IS NULL AND session_id IS NULL;
  IF violations > 0 THEN
    RAISE EXCEPTION 'DB invariant failed: projects without user_id/session_id: %', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM project_objects
  WHERE sort_order < 0;
  IF violations > 0 THEN
    RAISE EXCEPTION 'DB invariant failed: project_objects with negative sort_order: %', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM project_objects
  WHERE is_valid = true AND (results IS NULL OR results::text = '{}');
  IF violations > 0 THEN
    RAISE EXCEPTION 'DB invariant failed: valid project_objects without results: %', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM electrical_calculations
  WHERE variant_number IS NULL OR variant_number < 1 OR variant_number > 4;
  IF violations > 0 THEN
    RAISE EXCEPTION 'DB invariant failed: electrical_calculations variant out of range: %', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM electrical_calculations
  WHERE cable_type IS NULL OR btrim(cable_type) = '';
  IF violations > 0 THEN
    RAISE EXCEPTION 'DB invariant failed: electrical_calculations without cable_type: %', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM electrical_calculations
  WHERE results IS NULL OR results::text = '{}';
  IF violations > 0 THEN
    RAISE EXCEPTION 'DB invariant failed: electrical_calculations without results: %', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM electrical_calculations ec
  JOIN project_objects po ON po.id = ec.object_id
  WHERE po.project_id <> ec.project_id;
  IF violations > 0 THEN
    RAISE EXCEPTION 'DB invariant failed: electrical_calculations/project_objects project mismatch: %', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM (
    SELECT project_id
    FROM electrical_variants
    GROUP BY project_id
    HAVING COUNT(*) > 5
  ) invalid_projects;
  IF violations > 0 THEN
    RAISE EXCEPTION 'DB invariant failed: projects with more than five electrical variants: %', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM (
    SELECT project_id
    FROM electrical_variants
    GROUP BY project_id
    HAVING COUNT(*) FILTER (WHERE is_active) <> 1
  ) invalid_projects;
  IF violations > 0 THEN
    RAISE EXCEPTION 'DB invariant failed: projects with variants without exactly one active variant: %', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM projects p
  WHERE (
      p.electrical_initialized_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM electrical_variants ev
        WHERE ev.project_id = p.id
      )
    ) OR (
      p.electrical_initialized_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM electrical_variants ev
        WHERE ev.project_id = p.id
      )
    );
  IF violations > 0 THEN
    RAISE EXCEPTION 'DB invariant failed: projects with inconsistent electrical initialization/variant state: %', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM electrical_variants ev
  JOIN project_objects po ON po.project_id = ev.project_id
  LEFT JOIN electrical_variant_objects evo
    ON evo.electrical_variant_id = ev.id
   AND evo.object_id = po.id
   AND evo.project_id = ev.project_id
  WHERE evo.id IS NULL;
  IF violations > 0 THEN
    RAISE EXCEPTION 'DB invariant failed: missing project_object/electrical_variant assignments: %', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM electrical_calculations
  WHERE electrical_variant_id IS NULL;
  IF violations > 0 THEN
    RAISE EXCEPTION 'DB invariant failed: electrical_calculations without electrical_variant_id: %', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM electrical_candidates
  WHERE electrical_variant_id IS NULL;
  IF violations > 0 THEN
    RAISE EXCEPTION 'DB invariant failed: electrical_candidates without electrical_variant_id: %', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM electrical_candidate_folders
  WHERE electrical_variant_id IS NULL;
  IF violations > 0 THEN
    RAISE EXCEPTION 'DB invariant failed: electrical_candidate_folders without electrical_variant_id: %', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM specifications
  WHERE electrical_variant_id IS NULL;
  IF violations > 0 THEN
    RAISE EXCEPTION 'DB invariant failed: specifications without electrical_variant_id: %', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM electrical_calculations ec
  LEFT JOIN electrical_variants ev ON ev.id = ec.electrical_variant_id
  WHERE ec.electrical_variant_id IS NOT NULL
    AND (
      ev.id IS NULL
      OR ev.project_id IS DISTINCT FROM ec.project_id
      OR ev.legacy_variant_number IS DISTINCT FROM ec.variant_number
    );
  IF violations > 0 THEN
    RAISE EXCEPTION 'DB invariant failed: electrical_calculations UUID/project/legacy variant mismatch: %', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM electrical_candidates ec
  LEFT JOIN electrical_variants ev ON ev.id = ec.electrical_variant_id
  WHERE ec.electrical_variant_id IS NOT NULL
    AND (
      ev.id IS NULL
      OR ev.project_id IS DISTINCT FROM ec.project_id
      OR ev.legacy_variant_number IS DISTINCT FROM ec.variant_number
    );
  IF violations > 0 THEN
    RAISE EXCEPTION 'DB invariant failed: electrical_candidates UUID/project/legacy variant mismatch: %', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM electrical_candidate_folders ecf
  LEFT JOIN electrical_variants ev ON ev.id = ecf.electrical_variant_id
  WHERE ecf.electrical_variant_id IS NOT NULL
    AND (
      ev.id IS NULL
      OR ev.project_id IS DISTINCT FROM ecf.project_id
      OR ev.legacy_variant_number IS DISTINCT FROM ecf.variant_number
    );
  IF violations > 0 THEN
    RAISE EXCEPTION 'DB invariant failed: electrical_candidate_folders UUID/project/legacy variant mismatch: %', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM specifications s
  LEFT JOIN electrical_variants ev ON ev.id = s.electrical_variant_id
  WHERE s.electrical_variant_id IS NOT NULL
    AND (
      ev.id IS NULL
      OR ev.project_id IS DISTINCT FROM s.project_id
      OR ev.legacy_variant_number IS DISTINCT FROM s.variant_number
    );
  IF violations > 0 THEN
    RAISE EXCEPTION 'DB invariant failed: specifications UUID/project/legacy variant mismatch: %', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM specifications
  WHERE variant_number IS NULL OR variant_number < 1 OR variant_number > 4;
  IF violations > 0 THEN
    RAISE EXCEPTION 'DB invariant failed: specifications variant out of range: %', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM specifications
  WHERE jsonb_typeof(items) <> 'array';
  IF violations > 0 THEN
    RAISE EXCEPTION 'DB invariant failed: specifications.items is not an array: %', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM background_tasks
  WHERE user_id IS NULL AND session_id IS NULL;
  IF violations > 0 THEN
    RAISE EXCEPTION 'DB invariant failed: background_tasks without user_id/session_id: %', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM background_tasks
  WHERE progress_total IS NOT NULL AND progress_current > progress_total;
  IF violations > 0 THEN
    RAISE EXCEPTION 'DB invariant failed: background_tasks progress_current > progress_total: %', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM background_tasks
  WHERE type IN ('electrical_batch', 'report_export')
    AND electrical_variant_id IS NULL;
  IF violations > 0 THEN
    RAISE EXCEPTION 'DB invariant failed: electrical/report tasks without electrical_variant_id: %', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM background_tasks
  WHERE type IN ('electrical_batch', 'report_export')
    AND project_id IS NULL;
  IF violations > 0 THEN
    RAISE EXCEPTION 'DB invariant failed: electrical/report tasks without project_id: %', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM background_tasks bt
  WHERE bt.type IN ('electrical_batch', 'report_export')
    AND bt.request_payload ->> 'payload_version' = '3'
    AND (
      bt.request_payload ->> 'electrical_variant_id'
        IS DISTINCT FROM bt.electrical_variant_id::text
      OR bt.request_payload ->> 'project_id'
        IS DISTINCT FROM bt.project_id::text
    );
  IF violations > 0 THEN
    RAISE EXCEPTION 'DB invariant failed: v3 electrical/report task payload UUID/project trace mismatch: %', violations;
  END IF;

  -- Background tasks deliberately have no ER foreign key so completed history
  -- survives ER deletion. For an ER that still exists, project scope must match.
  SELECT COUNT(*) INTO violations
  FROM background_tasks bt
  LEFT JOIN electrical_variants ev ON ev.id = bt.electrical_variant_id
  WHERE bt.type IN ('electrical_batch', 'report_export')
    AND bt.status IN ('queued', 'enqueued', 'running')
    AND bt.electrical_variant_id IS NOT NULL
    AND ev.id IS NULL;
  IF violations > 0 THEN
    RAISE EXCEPTION 'DB invariant failed: active electrical/report tasks reference a missing variant: %', violations;
  END IF;

  SELECT COUNT(*) INTO violations
  FROM background_tasks bt
  JOIN electrical_variants ev ON ev.id = bt.electrical_variant_id
  WHERE bt.type IN ('electrical_batch', 'report_export')
    AND ev.project_id IS DISTINCT FROM bt.project_id;
  IF violations > 0 THEN
    RAISE EXCEPTION 'DB invariant failed: electrical/report task/live variant project mismatch: %', violations;
  END IF;
END $$;

SELECT 'projects_without_user_or_session' AS check_name, COUNT(*) AS violations
FROM projects
WHERE user_id IS NULL AND session_id IS NULL
UNION ALL
SELECT 'objects_negative_sort_order', COUNT(*)
FROM project_objects
WHERE sort_order < 0
UNION ALL
SELECT 'valid_objects_without_results', COUNT(*)
FROM project_objects
WHERE is_valid = true AND (results IS NULL OR results::text = '{}')
UNION ALL
SELECT 'electrical_variant_out_of_range', COUNT(*)
FROM electrical_calculations
WHERE variant_number IS NULL OR variant_number < 1 OR variant_number > 4
UNION ALL
SELECT 'electrical_without_cable_type', COUNT(*)
FROM electrical_calculations
WHERE cable_type IS NULL OR btrim(cable_type) = ''
UNION ALL
SELECT 'electrical_without_results', COUNT(*)
FROM electrical_calculations
WHERE results IS NULL OR results::text = '{}'
UNION ALL
SELECT 'electrical_project_mismatch', COUNT(*)
FROM electrical_calculations ec
JOIN project_objects po ON po.id = ec.object_id
WHERE po.project_id <> ec.project_id
UNION ALL
SELECT 'electrical_variants_over_project_limit', COUNT(*)
FROM (
  SELECT project_id
  FROM electrical_variants
  GROUP BY project_id
  HAVING COUNT(*) > 5
) invalid_projects
UNION ALL
SELECT 'electrical_variants_active_count_invalid', COUNT(*)
FROM (
  SELECT project_id
  FROM electrical_variants
  GROUP BY project_id
  HAVING COUNT(*) FILTER (WHERE is_active) <> 1
) invalid_projects
UNION ALL
SELECT 'projects_electrical_initialization_inconsistent', COUNT(*)
FROM projects p
WHERE (
    p.electrical_initialized_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM electrical_variants ev
      WHERE ev.project_id = p.id
    )
  ) OR (
    p.electrical_initialized_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM electrical_variants ev
      WHERE ev.project_id = p.id
    )
  )
UNION ALL
SELECT 'electrical_variant_assignments_missing', COUNT(*)
FROM electrical_variants ev
JOIN project_objects po ON po.project_id = ev.project_id
LEFT JOIN electrical_variant_objects evo
  ON evo.electrical_variant_id = ev.id
 AND evo.object_id = po.id
 AND evo.project_id = ev.project_id
WHERE evo.id IS NULL
UNION ALL
SELECT 'electrical_calculations_uuid_missing', COUNT(*)
FROM electrical_calculations
WHERE electrical_variant_id IS NULL
UNION ALL
SELECT 'electrical_candidates_uuid_missing', COUNT(*)
FROM electrical_candidates
WHERE electrical_variant_id IS NULL
UNION ALL
SELECT 'electrical_candidate_folders_uuid_missing', COUNT(*)
FROM electrical_candidate_folders
WHERE electrical_variant_id IS NULL
UNION ALL
SELECT 'specifications_uuid_missing', COUNT(*)
FROM specifications
WHERE electrical_variant_id IS NULL
UNION ALL
SELECT 'electrical_calculations_variant_scope_mismatch', COUNT(*)
FROM electrical_calculations ec
LEFT JOIN electrical_variants ev ON ev.id = ec.electrical_variant_id
WHERE ec.electrical_variant_id IS NOT NULL
  AND (
    ev.id IS NULL
    OR ev.project_id IS DISTINCT FROM ec.project_id
    OR ev.legacy_variant_number IS DISTINCT FROM ec.variant_number
  )
UNION ALL
SELECT 'electrical_candidates_variant_scope_mismatch', COUNT(*)
FROM electrical_candidates ec
LEFT JOIN electrical_variants ev ON ev.id = ec.electrical_variant_id
WHERE ec.electrical_variant_id IS NOT NULL
  AND (
    ev.id IS NULL
    OR ev.project_id IS DISTINCT FROM ec.project_id
    OR ev.legacy_variant_number IS DISTINCT FROM ec.variant_number
  )
UNION ALL
SELECT 'electrical_candidate_folders_variant_scope_mismatch', COUNT(*)
FROM electrical_candidate_folders ecf
LEFT JOIN electrical_variants ev ON ev.id = ecf.electrical_variant_id
WHERE ecf.electrical_variant_id IS NOT NULL
  AND (
    ev.id IS NULL
    OR ev.project_id IS DISTINCT FROM ecf.project_id
    OR ev.legacy_variant_number IS DISTINCT FROM ecf.variant_number
  )
UNION ALL
SELECT 'specifications_variant_scope_mismatch', COUNT(*)
FROM specifications s
LEFT JOIN electrical_variants ev ON ev.id = s.electrical_variant_id
WHERE s.electrical_variant_id IS NOT NULL
  AND (
    ev.id IS NULL
    OR ev.project_id IS DISTINCT FROM s.project_id
    OR ev.legacy_variant_number IS DISTINCT FROM s.variant_number
  )
UNION ALL
SELECT 'specification_variant_out_of_range', COUNT(*)
FROM specifications
WHERE variant_number IS NULL OR variant_number < 1 OR variant_number > 4
UNION ALL
SELECT 'specification_items_not_array', COUNT(*)
FROM specifications
WHERE jsonb_typeof(items) <> 'array'
UNION ALL
SELECT 'background_tasks_without_owner', COUNT(*)
FROM background_tasks
WHERE user_id IS NULL AND session_id IS NULL
UNION ALL
SELECT 'background_tasks_invalid_progress', COUNT(*)
FROM background_tasks
WHERE progress_total IS NOT NULL AND progress_current > progress_total
UNION ALL
SELECT 'background_electrical_report_tasks_uuid_missing', COUNT(*)
FROM background_tasks
WHERE type IN ('electrical_batch', 'report_export')
  AND electrical_variant_id IS NULL
UNION ALL
SELECT 'background_electrical_report_tasks_project_missing', COUNT(*)
FROM background_tasks
WHERE type IN ('electrical_batch', 'report_export')
  AND project_id IS NULL
UNION ALL
SELECT 'background_electrical_report_v3_trace_mismatch', COUNT(*)
FROM background_tasks bt
WHERE bt.type IN ('electrical_batch', 'report_export')
  AND bt.request_payload ->> 'payload_version' = '3'
  AND (
    bt.request_payload ->> 'electrical_variant_id'
      IS DISTINCT FROM bt.electrical_variant_id::text
    OR bt.request_payload ->> 'project_id'
      IS DISTINCT FROM bt.project_id::text
  )
UNION ALL
SELECT 'background_active_electrical_report_variant_missing', COUNT(*)
FROM background_tasks bt
LEFT JOIN electrical_variants ev ON ev.id = bt.electrical_variant_id
WHERE bt.type IN ('electrical_batch', 'report_export')
  AND bt.status IN ('queued', 'enqueued', 'running')
  AND bt.electrical_variant_id IS NOT NULL
  AND ev.id IS NULL
UNION ALL
SELECT 'background_electrical_report_live_variant_project_mismatch', COUNT(*)
FROM background_tasks bt
JOIN electrical_variants ev ON ev.id = bt.electrical_variant_id
WHERE bt.type IN ('electrical_batch', 'report_export')
  AND ev.project_id IS DISTINCT FROM bt.project_id
ORDER BY check_name;
