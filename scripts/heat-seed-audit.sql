\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE expected_heat_seed_cases (
    seed_case text PRIMARY KEY,
    object_type text NOT NULL
) ON COMMIT DROP;

INSERT INTO expected_heat_seed_cases (seed_case, object_type) VALUES
    ('pipe_indoor_manual_lambda_1_layer', 'pipe'),
    ('pipe_outdoor_reference_2_layers', 'pipe'),
    ('pipe_underground_reference_3_layers', 'pipe'),
    ('tank_cylindrical_indoor', 'tank'),
    ('tank_cylindrical_outdoor', 'tank'),
    ('tank_rectangular_indoor', 'tank'),
    ('tank_rectangular_outdoor', 'tank'),
    ('tank_spherical_indoor', 'tank'),
    ('tank_spherical_outdoor', 'tank'),
    ('tank_spherical_outdoor_multilayer', 'tank'),
    ('tank_cylindrical_underground_split_temperatures', 'tank'),
    ('tank_rectangular_underground_split_temperatures', 'tank'),
    ('tank_q_additional_after_safety_factor', 'tank');

DO $$
DECLARE
    violations integer;
BEGIN
    SELECT count(*)
    INTO violations
    FROM project_objects
    WHERE object_type::text IN ('pipe', 'tank');
    IF violations <> 13 THEN
        RAISE EXCEPTION 'expected exactly 13 heat objects, got %', violations;
    END IF;

    SELECT count(*)
    INTO violations
    FROM expected_heat_seed_cases expected
    LEFT JOIN project_objects object
        ON object.params->>'seed_case' = expected.seed_case
       AND object.object_type::text = expected.object_type
    WHERE object.id IS NULL;
    IF violations <> 0 THEN
        RAISE EXCEPTION 'missing canonical heat seed cases: %', violations;
    END IF;

    SELECT count(*)
    INTO violations
    FROM project_objects object
    LEFT JOIN expected_heat_seed_cases expected
        ON expected.seed_case = object.params->>'seed_case'
       AND expected.object_type = object.object_type::text
    WHERE object.object_type::text IN ('pipe', 'tank')
      AND expected.seed_case IS NULL;
    IF violations <> 0 THEN
        RAISE EXCEPTION 'unexpected or mistyped heat seed cases: %', violations;
    END IF;

    SELECT count(*)
    INTO violations
    FROM project_objects
    WHERE object_type::text IN ('pipe', 'tank')
      AND (NOT is_valid OR results IS NULL OR validation_errors IS NOT NULL);
    IF violations <> 0 THEN
        RAISE EXCEPTION 'invalid heat objects or objects without results: %', violations;
    END IF;

    SELECT count(*)
    INTO violations
    FROM project_objects
    WHERE object_type::text IN ('pipe', 'tank')
      AND (
          jsonb_typeof(params->'insulation_layers') IS DISTINCT FROM 'array'
          OR jsonb_array_length(COALESCE(params->'insulation_layers', '[]'::jsonb)) NOT BETWEEN 1 AND 3
      );
    IF violations <> 0 THEN
        RAISE EXCEPTION 'non-canonical insulation layer arrays: %', violations;
    END IF;

    SELECT count(*)
    INTO violations
    FROM project_objects
    WHERE object_type::text IN ('pipe', 'tank')
      AND params ?| ARRAY[
          'location', 'burial_depth', 'insulation_thickness', 'insulation_material',
          'insulation_layer_count', 'first_insulation_lambda',
          'second_insulation_thickness', 'second_insulation_material',
          'second_insulation_lambda', 'third_insulation_thickness',
          'third_insulation_material', 'third_insulation_lambda', 'insulation_type',
          'valve_count', 'flange_count', 'support_count'
      ];
    IF violations <> 0 THEN
        RAISE EXCEPTION 'deprecated heat params remain: %', violations;
    END IF;

    SELECT count(*)
    INTO violations
    FROM project_objects object
    WHERE object.object_type::text IN ('pipe', 'tank')
      AND (
          EXISTS (
              SELECT 1 FROM jsonb_object_keys(object.params) AS key
              WHERE key LIKE '%\_mm' ESCAPE '\'
          )
          OR EXISTS (
              SELECT 1 FROM jsonb_object_keys(COALESCE(object.results, '{}'::jsonb)) AS key
              WHERE key LIKE '%\_mm' ESCAPE '\'
          )
      );
    IF violations <> 0 THEN
        RAISE EXCEPTION 'millimetre alias keys remain in params/results: %', violations;
    END IF;

    SELECT count(*)
    INTO violations
    FROM project_objects
    WHERE object_type::text = 'pipe'
      AND ((params ? 'pipe_material') = (params ? 'pipe_lambda'));
    IF violations <> 0 THEN
        RAISE EXCEPTION 'pipe lambda source must be exactly one of material/manual: %', violations;
    END IF;

    SELECT count(*)
    INTO violations
    FROM project_objects
    WHERE object_type::text IN ('pipe', 'tank')
      AND (
          params->>'placement' IS NULL
          OR params->>'placement' NOT IN ('indoor', 'outdoor', 'underground')
          OR ((params->>'placement') <> 'underground' AND params ?| ARRAY[
              'ground_temperature', 'ground_conductivity', 'ground_type',
              'ground_temperature_source', 'ground_conductivity_source',
              'pipe_centerline_depth', 'tank_buried_height'
          ])
          OR (object_type::text = 'pipe' AND params ? 'tank_buried_height')
          OR (object_type::text = 'tank' AND params ? 'pipe_centerline_depth')
          OR (object_type::text = 'pipe' AND params->>'placement' = 'underground'
              AND (NOT params ? 'ground_temperature'
                   OR NOT params ? 'ground_conductivity'
                   OR NOT params ? 'pipe_centerline_depth'
                   OR params ? 'ambient_temperature'))
          OR (object_type::text = 'tank' AND params->>'placement' = 'underground'
              AND (NOT params ? 'ambient_temperature'
                   OR NOT params ? 'ground_temperature'
                   OR NOT params ? 'ground_conductivity'
                   OR NOT params ? 'tank_buried_height'))
      );
    IF violations <> 0 THEN
        RAISE EXCEPTION 'placement/depth/ground contract violations: %', violations;
    END IF;

    SELECT count(*)
    INTO violations
    FROM project_objects
    WHERE object_type::text = 'tank'
      AND (
          params->>'shape' IS NULL
          OR (params->>'shape' = 'cylindrical'
              AND (NOT params ? 'diameter' OR NOT params ? 'height'
                   OR params ? 'length' OR params ? 'width'))
          OR (params->>'shape' = 'rectangular'
              AND (NOT params ? 'length' OR NOT params ? 'width' OR NOT params ? 'height'
                   OR params ? 'diameter'))
          OR (params->>'shape' = 'spherical'
              AND (NOT params ? 'diameter' OR params ?| ARRAY['height', 'length', 'width']
                   OR params->>'placement' = 'underground'))
          OR params->>'shape' NOT IN ('cylindrical', 'rectangular', 'spherical')
      );
    IF violations <> 0 THEN
        RAISE EXCEPTION 'tank shape/geometry contract violations: %', violations;
    END IF;

    SELECT count(*)
    INTO violations
    FROM project_objects
    WHERE object_type::text IN ('pipe', 'tank')
      AND (
          NULLIF(results->>'formula_model', '') IS NULL
          OR NULLIF(results->>'formula_model_version', '') IS NULL
          OR results ?| ARRAY[
              'heat_loss_per_meter', 'heat_loss_per_m2', 'total_heat_loss',
              'surface_area', 'alpha_vnesh', 'wind_speed', 'ground_conductivity',
              'safety_factor', 'local_elements_count', 'local_element_equiv_length',
              'q_additional', 'ground_resistance', 'heat_loss_air_per_m2',
              'heat_loss_ground_per_m2', 'calculation_trace'
          ]
          OR (object_type::text = 'tank' AND results ?| ARRAY[
              'wall_resistance', 'insulation_resistance', 'external_resistance'
          ])
      );
    IF violations <> 0 THEN
        RAISE EXCEPTION 'non-canonical heat results: %', violations;
    END IF;

    SELECT count(*)
    INTO violations
    FROM project_objects
    WHERE params->>'seed_case' = 'tank_cylindrical_indoor'
      AND (
          (params->>'volume')::numeric IS DISTINCT FROM 24.5
          OR results ? 'volume'
          OR COALESCE(results->'input_units', '{}'::jsonb) ? 'volume'
          OR COALESCE(results->'applied_units', '{}'::jsonb) ? 'volume'
      );
    IF violations <> 0 THEN
        RAISE EXCEPTION 'volume leaked into the heat formula/result contract: %', violations;
    END IF;

    SELECT count(*)
    INTO violations
    FROM project_objects
    WHERE params->>'seed_case' = 'tank_q_additional_after_safety_factor'
      AND (
          (results->>'q_additional_applied')::numeric IS DISTINCT FROM 250
          OR (results->>'total_heat_loss_design') IS NULL
          OR (results->>'total_heat_loss_base') IS NULL
          OR (results->>'safety_factor_applied') IS NULL
          OR abs(
              (results->>'total_heat_loss_design')::numeric
              - (
                  (results->>'total_heat_loss_base')::numeric
                  * (results->>'safety_factor_applied')::numeric
                  + 250
              )
          ) > 0.01
      );
    IF violations <> 0 THEN
        RAISE EXCEPTION 'q_additional is not applied after the safety factor: %', violations;
    END IF;

    SELECT count(*)
    INTO violations
    FROM project_objects
    WHERE params->>'seed_case' IN (
        'tank_cylindrical_underground_split_temperatures',
        'tank_rectangular_underground_split_temperatures'
    )
      AND (
          params->>'ambient_temperature' IS NULL
          OR params->>'ground_temperature' IS NULL
          OR params->>'ambient_temperature' = params->>'ground_temperature'
          OR results->>'ambient_temperature_applied' IS NULL
          OR results->>'ground_temperature_applied' IS NULL
          OR results->>'ambient_temperature_applied' = results->>'ground_temperature_applied'
      );
    IF violations <> 0 THEN
        RAISE EXCEPTION 'underground tank air/ground temperatures were collapsed: %', violations;
    END IF;
END
$$;

SELECT
    object_type::text AS object_type,
    params->>'placement' AS placement,
    COALESCE(params->>'shape', '-') AS shape,
    count(*) AS objects
FROM project_objects
WHERE object_type::text IN ('pipe', 'tank')
GROUP BY object_type::text, params->>'placement', COALESCE(params->>'shape', '-')
ORDER BY object_type, placement, shape;

SELECT
    params->>'seed_case' AS seed_case,
    object_type::text AS object_type,
    jsonb_array_length(params->'insulation_layers') AS layers,
    params->>'placement' AS placement,
    results->>'formula_model_version' AS formula_model_version,
    is_valid
FROM project_objects
WHERE object_type::text IN ('pipe', 'tank')
ORDER BY seed_case;

SELECT
    params->>'seed_case' AS seed_case,
    params->>'volume' AS stored_volume,
    results ? 'volume' AS result_has_volume,
    COALESCE(results->'input_units', '{}'::jsonb) ? 'volume' AS input_units_has_volume
FROM project_objects
WHERE params->>'seed_case' = 'tank_cylindrical_indoor';

COMMIT;
