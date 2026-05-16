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
ORDER BY check_name;
