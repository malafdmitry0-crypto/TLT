"""Current PostgreSQL schema baseline.

This project had no published migrations when its development history was
compacted. Future schema changes must be added as forward-only revisions.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_UPGRADE_STATEMENTS = (
    r"""--
-- PostgreSQL database dump
--


-- Dumped from database version 16.13
-- Dumped by pg_dump version 16.13

SET statement_timeout = 0;""",
    r"""SET lock_timeout = 0;""",
    r"""SET idle_in_transaction_session_timeout = 0;""",
    r"""SET client_encoding = 'UTF8';""",
    r"""SET standard_conforming_strings = on;""",
    r"""SET check_function_bodies = false;""",
    r"""SET xmloption = content;""",
    r"""SET client_min_messages = warning;""",
    r"""SET row_security = off;""",
    r"""--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;""",
    r"""--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';""",
    r"""--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;""",
    r"""--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';""",
    r"""--
-- Name: cable_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cable_type AS ENUM (
    'self_regulating',
    'single_core',
    'three_core'
);""",
    r"""--
-- Name: object_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.object_type AS ENUM (
    'pipe',
    'tank',
    'pump',
    'platform',
    'other'
);""",
    r"""--
-- Name: project_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.project_status AS ENUM (
    'draft',
    'completed'
);""",
    r"""--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'employee',
    'admin'
);""",
    r"""--
-- Name: tlt_sync_project_object_assignments(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tlt_sync_project_object_assignments() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
        BEGIN
            PERFORM 1 FROM projects WHERE id = NEW.project_id FOR NO KEY UPDATE;
            INSERT INTO electrical_variant_objects (
                id, project_id, electrical_variant_id, object_id, system_type,
                assignment_state, requested_cable_type, object_version_snapshot,
                diagnostics
            )
            SELECT
                md5(item.id::text || ':' || NEW.id::text || '-project-object-sync')::uuid,
                NEW.project_id, item.id, NEW.id, NULL, 'unassigned', NULL, NEW.version,
                jsonb_build_object(
                    'identity_sync', 'project_object_assignment_trigger',
                    'sections_status', 'not_ready',
                    'sections_error_code', 'ELECTRICAL_SECTIONS_NOT_READY'
                )
            FROM electrical_variants AS item
            WHERE item.project_id = NEW.project_id
            ON CONFLICT (electrical_variant_id, object_id) DO NOTHING;
            RETURN NEW;
        END
        $$;""",
    r"""--
-- Name: tlt_guard_electrical_catalog_immutability(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tlt_guard_electrical_catalog_immutability() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
        BEGIN
            IF TG_OP = 'DELETE' AND OLD.status IN ('active', 'retired') THEN
                RAISE EXCEPTION 'active or retired electrical catalog payload is immutable';
            END IF;
            IF TG_OP = 'UPDATE' AND OLD.status IN ('active', 'retired') AND (
                NEW.kind IS DISTINCT FROM OLD.kind OR
                NEW.version IS DISTINCT FROM OLD.version OR
                NEW.source IS DISTINCT FROM OLD.source OR
                NEW.source_checksum IS DISTINCT FROM OLD.source_checksum OR
                NEW.import_checksum IS DISTINCT FROM OLD.import_checksum OR
                NEW.payload_checksum IS DISTINCT FROM OLD.payload_checksum OR
                NEW.schema_version IS DISTINCT FROM OLD.schema_version OR
                NEW.payload IS DISTINCT FROM OLD.payload OR
                NEW.valid_row_count IS DISTINCT FROM OLD.valid_row_count OR
                NEW.rejected_row_count IS DISTINCT FROM OLD.rejected_row_count OR
                NEW.diagnostics IS DISTINCT FROM OLD.diagnostics OR
                NEW.production_approved IS DISTINCT FROM OLD.production_approved OR
                NEW.imported_at IS DISTINCT FROM OLD.imported_at OR
                NEW.imported_by IS DISTINCT FROM OLD.imported_by OR
                NEW.activated_at IS DISTINCT FROM OLD.activated_at OR
                NEW.activated_by IS DISTINCT FROM OLD.activated_by
            ) THEN
                RAISE EXCEPTION 'active or retired electrical catalog payload is immutable';
            END IF;
            IF TG_OP = 'UPDATE' AND OLD.status = 'active'
               AND NEW.status NOT IN ('active', 'retired') THEN
                RAISE EXCEPTION 'active electrical catalog may only be retired';
            END IF;
            IF TG_OP = 'UPDATE' AND OLD.status = 'retired' AND NEW.status <> 'retired' THEN
                RAISE EXCEPTION 'retired electrical catalog cannot be reactivated';
            END IF;
            RETURN COALESCE(NEW, OLD);
        END;
        $$;""",
    r"""--
-- Name: tlt_capture_electrical_calculation_revision(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tlt_capture_electrical_calculation_revision() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
        DECLARE
            previous_revision_id uuid;
            previous_revision_number bigint;
            revision_status varchar(16);
        BEGIN
            SELECT id, revision_number
              INTO previous_revision_id, previous_revision_number
              FROM electrical_calculation_revisions
             WHERE electrical_calculation_id = NEW.id
             ORDER BY revision_number DESC, recorded_at DESC, id DESC
             LIMIT 1
             FOR UPDATE;

            revision_status := CASE
                WHEN NEW.results IS NULL THEN 'pending'
                WHEN NEW.results ->> 'stale' = 'true'
                  OR NEW.results ->> 'category' = 'stale' THEN 'stale'
                WHEN NULLIF(NEW.results ->> 'error_code', '') IS NOT NULL
                  OR NULLIF(BTRIM(COALESCE(NEW.results ->> 'error', '')), '') IS NOT NULL
                  OR NEW.results ->> 'category' IN (
                      'calculation_error', 'external', 'formula', 'unsupported', 'validation'
                  ) THEN 'error'
                ELSE 'success'
            END;

            INSERT INTO electrical_calculation_revisions (
                id,
                electrical_calculation_id,
                revision_number,
                supersedes_result_id,
                project_id,
                object_id,
                electrical_variant_id,
                cable_type,
                cable_type_source,
                cable_mark,
                cable_mark_source,
                cable_snapshot,
                params,
                results,
                status,
                source_created_at,
                source_updated_at,
                recorded_at
            ) VALUES (
                uuid_generate_v4(),
                NEW.id,
                COALESCE(previous_revision_number, 0) + 1,
                previous_revision_id,
                NEW.project_id,
                NEW.object_id,
                NEW.electrical_variant_id,
                NEW.cable_type,
                NEW.cable_type_source,
                NEW.cable_mark,
                NEW.cable_mark_source,
                NEW.cable_snapshot,
                NEW.params,
                NEW.results,
                revision_status,
                NEW.created_at,
                NEW.updated_at,
                clock_timestamp()
            );
            RETURN NEW;
        END;
        $$;""",
    r"""--
-- Name: tlt_guard_electrical_calculation_revisions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tlt_guard_electrical_calculation_revisions() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
        BEGIN
            RAISE EXCEPTION 'electrical calculation revisions are append-only';
        END;
        $$;""",
    r"""--
-- Name: tlt_guard_specification_catalog_item(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tlt_guard_specification_catalog_item() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
        DECLARE parent_status text;
        BEGIN
            SELECT status INTO parent_status
            FROM specification_catalog_versions
            WHERE id = COALESCE(NEW.catalog_version_id, OLD.catalog_version_id);
            IF parent_status IN ('active', 'retired') THEN
                RAISE EXCEPTION 'items of active or retired specification catalog are immutable';
            END IF;
            RETURN COALESCE(NEW, OLD);
        END;
        $$;""",
    r"""--
-- Name: tlt_guard_specification_catalog_version(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tlt_guard_specification_catalog_version() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
        BEGIN
            IF TG_OP = 'DELETE' AND OLD.status IN ('active', 'retired') THEN
                RAISE EXCEPTION 'active or retired specification catalog is immutable';
            END IF;
            IF TG_OP = 'UPDATE' AND OLD.status IN ('active', 'retired') AND (
                NEW.catalog_key IS DISTINCT FROM OLD.catalog_key OR
                NEW.version IS DISTINCT FROM OLD.version OR
                NEW.authority IS DISTINCT FROM OLD.authority OR
                NEW.source IS DISTINCT FROM OLD.source OR
                NEW.source_checksum IS DISTINCT FROM OLD.source_checksum OR
                NEW.payload_checksum IS DISTINCT FROM OLD.payload_checksum OR
                NEW.schema_version IS DISTINCT FROM OLD.schema_version OR
                NEW.item_count IS DISTINCT FROM OLD.item_count OR
                NEW.is_complete IS DISTINCT FROM OLD.is_complete OR
                NEW.validation_issues IS DISTINCT FROM OLD.validation_issues OR
                NEW.imported_at IS DISTINCT FROM OLD.imported_at OR
                NEW.imported_by IS DISTINCT FROM OLD.imported_by OR
                NEW.activated_at IS DISTINCT FROM OLD.activated_at OR
                NEW.activated_by IS DISTINCT FROM OLD.activated_by
            ) THEN
                RAISE EXCEPTION 'active or retired specification catalog is immutable';
            END IF;
            IF TG_OP = 'UPDATE' AND OLD.status = 'active'
               AND NEW.status NOT IN ('active', 'retired') THEN
                RAISE EXCEPTION 'active specification catalog may only be retired';
            END IF;
            IF TG_OP = 'UPDATE' AND OLD.status = 'retired' AND NEW.status <> 'retired' THEN
                RAISE EXCEPTION 'retired specification catalog cannot be reactivated';
            END IF;
            RETURN COALESCE(NEW, OLD);
        END;
        $$;""",
    r"""--
-- Name: tlt_enforce_electrical_variant_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tlt_enforce_electrical_variant_limit() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
        BEGIN
            PERFORM 1 FROM projects WHERE id = NEW.project_id FOR UPDATE;
            IF (
                SELECT count(*) FROM electrical_variants AS item
                WHERE item.project_id = NEW.project_id
                  AND item.id IS DISTINCT FROM NEW.id
            ) >= 4 THEN
                RAISE EXCEPTION 'A project may contain no more than four electrical variants'
                    USING ERRCODE = '23514',
                          CONSTRAINT = 'ck_electrical_variants_project_limit';
            END IF;
            RETURN NEW;
        END
        $$;""",
    r"""SET default_tablespace = '';""",
    r"""SET default_table_access_method = heap;""",
    r"""--
-- Name: accessories_extended; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accessories_extended (
    id uuid NOT NULL,
    category character varying(64) NOT NULL,
    name character varying(255) NOT NULL,
    article character varying(64),
    params jsonb,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);""",
    r"""--
-- Name: audit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_events (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    event_type character varying(128) NOT NULL,
    event_version integer NOT NULL,
    category character varying(32) NOT NULL,
    severity character varying(16) NOT NULL,
    result character varying(16) NOT NULL,
    source character varying(16) NOT NULL,
    actor_type character varying(32),
    actor_id character varying(128),
    user_id uuid,
    session_id character varying(128),
    project_id uuid,
    object_id uuid,
    task_id uuid,
    request_id character varying(128),
    requirement_refs jsonb DEFAULT '[]'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    before_state jsonb,
    after_state jsonb,
    error_code character varying(128),
    message text,
    CONSTRAINT ck_audit_events_category CHECK (((category)::text = ANY ((ARRAY['auth'::character varying, 'project'::character varying, 'object'::character varying, 'calculation'::character varying, 'task'::character varying, 'report'::character varying, 'specification'::character varying, 'frontend'::character varying, 'system'::character varying, 'security'::character varying])::text[]))),
    CONSTRAINT ck_audit_events_result CHECK (((result)::text = ANY ((ARRAY['success'::character varying, 'failure'::character varying, 'queued'::character varying, 'skipped'::character varying, 'cancelled'::character varying])::text[]))),
    CONSTRAINT ck_audit_events_severity CHECK (((severity)::text = ANY ((ARRAY['debug'::character varying, 'info'::character varying, 'warning'::character varying, 'error'::character varying, 'critical'::character varying])::text[]))),
    CONSTRAINT ck_audit_events_source CHECK (((source)::text = ANY ((ARRAY['backend'::character varying, 'frontend'::character varying, 'worker'::character varying, 'database'::character varying, 'redis'::character varying])::text[])))
);""",
    r"""--
-- Name: background_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.background_tasks (
    id uuid NOT NULL,
    type character varying(64) NOT NULL,
    status character varying(24) NOT NULL,
    project_id uuid,
    user_id uuid,
    session_id character varying(64),
    request_payload jsonb NOT NULL,
    result_payload jsonb,
    error_message text,
    progress_current integer NOT NULL,
    progress_total integer,
    progress_phase character varying(64),
    arq_job_id character varying(128),
    idempotency_key character varying(128),
    cancel_requested boolean NOT NULL,
    attempts integer NOT NULL,
    enqueue_attempts integer NOT NULL,
    last_enqueue_error text,
    next_retry_at timestamp with time zone,
    locked_by character varying(128),
    lock_expires_at timestamp with time zone,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    heartbeat_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    electrical_variant_id uuid,
    workflow_stage character varying(64),
    workflow_version integer DEFAULT 1 NOT NULL,
    queue_deadline_at timestamp with time zone,
    execution_deadline_at timestamp with time zone,
    interaction_deadline_at timestamp with time zone,
    CONSTRAINT ck_background_tasks_owner_present CHECK (((user_id IS NOT NULL) OR (session_id IS NOT NULL))),
    CONSTRAINT ck_background_tasks_status CHECK (((status)::text = ANY ((ARRAY['queued'::character varying, 'enqueued'::character varying, 'running'::character varying, 'waiting_input'::character varying, 'succeeded'::character varying, 'failed'::character varying, 'cancelled'::character varying, 'timed_out'::character varying])::text[])))
);""",
    r"""--
-- Name: cables_extended; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cables_extended (
    id uuid NOT NULL,
    cable_type public.cable_type NOT NULL,
    brand character varying(128) NOT NULL,
    model character varying(128) NOT NULL,
    power_per_meter double precision,
    max_temperature double precision,
    min_temperature double precision,
    resistance_per_meter double precision,
    params jsonb,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    price_per_meter double precision,
    stock_quantity_m double precision,
    lead_time_days integer,
    supplier_priority integer,
    is_preferred boolean DEFAULT false NOT NULL,
    order_multiple_m double precision,
    supplier_name character varying(128),
    article character varying(128),
    currency character varying(8),
    stock_status character varying(32),
    min_order_quantity_m double precision,
    is_discontinued boolean DEFAULT false NOT NULL,
    replacement_group character varying(128),
    price_updated_at timestamp with time zone,
    stock_updated_at timestamp with time zone,
    commercial_data_source character varying(32),
    CONSTRAINT ck_cables_extended_supported_type CHECK (((cable_type)::text = ANY (ARRAY['self_regulating'::text, 'single_core'::text, 'three_core'::text])))
);""",
    r"""--
-- Name: correction_coefficients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.correction_coefficients (
    id uuid NOT NULL,
    key character varying(64) NOT NULL,
    value double precision NOT NULL,
    description text,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);""",
    r"""--
-- Name: electrical_calculation_revisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.electrical_calculation_revisions (
    id uuid NOT NULL,
    electrical_calculation_id uuid NOT NULL,
    revision_number bigint NOT NULL,
    supersedes_result_id uuid,
    project_id uuid NOT NULL,
    object_id uuid NOT NULL,
    electrical_variant_id uuid NOT NULL,
    cable_type character varying(64) NOT NULL,
    cable_type_source character varying(32) NOT NULL,
    cable_mark character varying(128),
    cable_mark_source character varying(32) NOT NULL,
    cable_snapshot jsonb,
    params jsonb NOT NULL,
    results jsonb,
    status character varying(16) NOT NULL,
    source_created_at timestamp with time zone NOT NULL,
    source_updated_at timestamp with time zone NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_electrical_calculation_revisions_number CHECK ((revision_number >= 1)),
    CONSTRAINT ck_electrical_calculation_revisions_status CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'success'::character varying, 'error'::character varying, 'stale'::character varying])::text[]))),
    CONSTRAINT ck_electrical_calculation_revisions_supported_cable_type CHECK (((cable_type)::text = ANY ((ARRAY['self_regulating'::character varying, 'self_regulating_tt'::character varying, 'single_core'::character varying, 'three_core'::character varying])::text[])))
);""",
    r"""--
-- Name: electrical_calculations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.electrical_calculations (
    id uuid NOT NULL,
    project_id uuid NOT NULL,
    object_id uuid NOT NULL,
    electrical_variant_id uuid NOT NULL,
    cable_type character varying(64) NOT NULL,
    cable_mark character varying(128),
    params jsonb NOT NULL,
    results jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cable_type_source character varying(32) NOT NULL,
    cable_mark_source character varying(32) NOT NULL,
    cable_snapshot jsonb,
    CONSTRAINT ck_electrical_calculations_supported_cable_type CHECK (((cable_type)::text = ANY ((ARRAY['self_regulating'::character varying, 'self_regulating_tt'::character varying, 'single_core'::character varying, 'three_core'::character varying])::text[])))
)
WITH (autovacuum_vacuum_scale_factor='0.05');""",
    r"""--
-- Name: electrical_candidate_folder_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.electrical_candidate_folder_items (
    folder_id uuid NOT NULL,
    candidate_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);""",
    r"""--
-- Name: electrical_candidate_folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.electrical_candidate_folders (
    id uuid NOT NULL,
    project_id uuid NOT NULL,
    object_id uuid NOT NULL,
    electrical_variant_id uuid NOT NULL,
    name character varying(64) NOT NULL,
    color character varying(32),
    sort_order integer DEFAULT 0 NOT NULL,
    created_by_user_id uuid,
    created_by_session_id character varying(64),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);""",
    r"""--
-- Name: electrical_candidates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.electrical_candidates (
    id uuid NOT NULL,
    project_id uuid NOT NULL,
    object_id uuid NOT NULL,
    electrical_variant_id uuid NOT NULL,
    cable_type character varying(64) NOT NULL,
    cable_source character varying(32) NOT NULL,
    cable_mark character varying(128),
    mode character varying(16) NOT NULL,
    status character varying(32) NOT NULL,
    priority integer NOT NULL,
    is_recommended boolean NOT NULL,
    is_pinned boolean NOT NULL,
    is_applied boolean NOT NULL,
    reason_code character varying(128),
    reason_message text,
    engineer_comment text,
    params jsonb NOT NULL,
    results jsonb,
    cable_snapshot jsonb,
    warnings jsonb NOT NULL,
    risk_flags jsonb NOT NULL,
    candidate_meta jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    dedupe_key character varying(128) NOT NULL,
    CONSTRAINT ck_electrical_candidates_mode CHECK (((mode)::text = ANY ((ARRAY['auto'::character varying, 'manual'::character varying])::text[]))),
    CONSTRAINT ck_electrical_candidates_status CHECK (((status)::text = ANY ((ARRAY['applicable'::character varying, 'error'::character varying, 'not_applicable'::character varying, 'excluded'::character varying, 'stale'::character varying])::text[]))),
    CONSTRAINT ck_electrical_candidates_supported_cable_type CHECK (((cable_type)::text = ANY ((ARRAY['self_regulating'::character varying, 'self_regulating_tt'::character varying, 'single_core'::character varying, 'three_core'::character varying])::text[])))
);""",
    r"""--
-- Name: electrical_catalog_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.electrical_catalog_versions (
    id uuid NOT NULL,
    kind character varying(16) NOT NULL,
    version character varying(128) NOT NULL,
    status character varying(16) DEFAULT 'draft'::character varying NOT NULL,
    source text NOT NULL,
    source_checksum character varying(71) NOT NULL,
    import_checksum character varying(71) NOT NULL,
    payload_checksum character varying(71) NOT NULL,
    schema_version integer NOT NULL,
    payload jsonb NOT NULL,
    valid_row_count integer DEFAULT 0 NOT NULL,
    rejected_row_count integer DEFAULT 0 NOT NULL,
    diagnostics jsonb DEFAULT '[]'::jsonb NOT NULL,
    production_approved boolean DEFAULT false NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    imported_by character varying(255),
    activated_at timestamp with time zone,
    activated_by character varying(255),
    CONSTRAINT ck_electrical_catalog_versions_active_power_approved CHECK ((((kind)::text <> 'power'::text) OR ((status)::text <> 'active'::text) OR (production_approved IS TRUE))),
    CONSTRAINT ck_electrical_catalog_versions_import_checksum CHECK (((import_checksum)::text ~ '^sha256:[0-9a-f]{64}$'::text)),
    CONSTRAINT ck_electrical_catalog_versions_kind CHECK (((kind)::text = ANY ((ARRAY['power'::character varying, 'section'::character varying, 'bom'::character varying])::text[]))),
    CONSTRAINT ck_electrical_catalog_versions_payload_checksum CHECK (((payload_checksum)::text ~ '^sha256:[0-9a-f]{64}$'::text)),
    CONSTRAINT ck_electrical_catalog_versions_row_counts CHECK (((valid_row_count >= 0) AND (rejected_row_count >= 0))),
    CONSTRAINT ck_electrical_catalog_versions_schema_version CHECK ((schema_version >= 1)),
    CONSTRAINT ck_electrical_catalog_versions_source_checksum CHECK (((source_checksum)::text ~ '^sha256:[0-9a-f]{64}$'::text)),
    CONSTRAINT ck_electrical_catalog_versions_status CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'active'::character varying, 'retired'::character varying])::text[])))
);""",
    r"""--
-- Name: electrical_variant_objects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.electrical_variant_objects (
    id uuid NOT NULL,
    project_id uuid NOT NULL,
    electrical_variant_id uuid NOT NULL,
    object_id uuid NOT NULL,
    system_type character varying(32),
    assignment_state character varying(32) DEFAULT 'unassigned'::character varying NOT NULL,
    requested_cable_type character varying(64),
    object_version_snapshot integer DEFAULT 1 NOT NULL,
    diagnostics jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    electrical_overrides jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT ck_electrical_variant_objects_assignment_state CHECK (((assignment_state)::text = ANY ((ARRAY['unassigned'::character varying, 'ready'::character varying, 'unsupported'::character varying, 'stale'::character varying, 'error'::character varying])::text[]))),
    CONSTRAINT ck_electrical_variant_objects_assignment_version_positive CHECK ((version >= 1)),
    CONSTRAINT ck_electrical_variant_objects_ready_supported_system CHECK ((((assignment_state)::text <> 'ready'::text) OR ((system_type)::text = ANY ((ARRAY['self_regulating'::character varying, 'resistive'::character varying])::text[])))),
    CONSTRAINT ck_electrical_variant_objects_requested_cable_type CHECK (((requested_cable_type IS NULL) OR ((requested_cable_type)::text = ANY ((ARRAY['self_regulating'::character varying, 'self_regulating_tt'::character varying, 'single_core'::character varying, 'three_core'::character varying])::text[])))),
    CONSTRAINT ck_electrical_variant_objects_system_type CHECK (((system_type IS NULL) OR ((system_type)::text = ANY ((ARRAY['self_regulating'::character varying, 'resistive'::character varying])::text[])))),
    CONSTRAINT ck_electrical_variant_objects_unassigned_system_null CHECK ((((assignment_state)::text <> 'unassigned'::text) OR (system_type IS NULL))),
    CONSTRAINT ck_electrical_variant_objects_version_positive CHECK ((object_version_snapshot >= 1))
);""",
    r"""--
-- Name: electrical_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.electrical_variants (
    id uuid NOT NULL,
    project_id uuid NOT NULL,
    name character varying(128) NOT NULL,
    name_normalized character varying(512) NOT NULL,
    sort_order integer NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    copied_from_id uuid,
    creation_idempotency_key_hash character varying(64),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_electrical_variants_creation_idempotency_hash CHECK (((creation_idempotency_key_hash IS NULL) OR ((creation_idempotency_key_hash)::text ~ '^[0-9a-f]{64}$'::text))),
    CONSTRAINT ck_electrical_variants_name_trimmed_nonempty CHECK ((((name)::text = btrim((name)::text)) AND (char_length((name)::text) > 0))),
    CONSTRAINT ck_electrical_variants_normalized_name_nonempty CHECK ((((name_normalized)::text = btrim((name_normalized)::text)) AND (char_length((name_normalized)::text) > 0))),
    CONSTRAINT ck_electrical_variants_sort_order_nonnegative CHECK ((sort_order >= 0))
);""",
    r"""--
-- Name: guest_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guest_sessions (
    id uuid NOT NULL,
    session_id character varying(64) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_activity timestamp with time zone DEFAULT now() NOT NULL
)
WITH (autovacuum_vacuum_scale_factor='0.01', autovacuum_vacuum_insert_threshold='1000');""",
    r"""--
-- Name: insulation_materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.insulation_materials (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    material character varying(128) NOT NULL,
    name character varying(512) NOT NULL,
    conductivity double precision,
    density_kg_m3 jsonb,
    temperature_range jsonb,
    conductivity_20_plus jsonb,
    conductivity_19_minus jsonb,
    selectable boolean DEFAULT true NOT NULL,
    deprecated boolean DEFAULT false NOT NULL,
    requires_material_reselection boolean DEFAULT false NOT NULL,
    material_family character varying(128),
    reselection_message text,
    source character varying(512),
    data_source character varying(32) DEFAULT 'builtin_json'::character varying NOT NULL,
    params jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);""",
    r"""--
-- Name: project_electrical_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_electrical_settings (
    project_id uuid NOT NULL,
    nominal_voltage_v integer DEFAULT 230 NOT NULL,
    max_section_start_current_a numeric(12,3),
    version integer DEFAULT 1 NOT NULL,
    updated_by character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_project_electrical_settings_current_positive CHECK (((max_section_start_current_a IS NULL) OR (max_section_start_current_a > (0)::numeric))),
    CONSTRAINT ck_project_electrical_settings_version_positive CHECK ((version >= 1)),
    CONSTRAINT ck_project_electrical_settings_voltage_230 CHECK ((nominal_voltage_v = 230))
);""",
    r"""--
-- Name: project_objects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_objects (
    id uuid NOT NULL,
    project_id uuid NOT NULL,
    object_type public.object_type NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    params jsonb NOT NULL,
    results jsonb,
    is_valid boolean DEFAULT false NOT NULL,
    validation_errors jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    version integer NOT NULL
)
WITH (autovacuum_vacuum_scale_factor='0.05');""",
    r"""--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    user_id uuid,
    session_id character varying(64),
    status public.project_status DEFAULT 'draft'::public.project_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    task_number character varying(64),
    electrical_initialized_at timestamp with time zone,
    specification_settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    specification_settings_version integer DEFAULT 1 NOT NULL,
    display_settings jsonb,
    display_settings_version integer DEFAULT 0 NOT NULL,
    CONSTRAINT ck_project_owner_present CHECK (((user_id IS NOT NULL) OR (session_id IS NOT NULL)))
);""",
    r"""--
-- Name: refresh_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    jti_hash character varying(64) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);""",
    r"""--
-- Name: specification_catalog_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.specification_catalog_items (
    id uuid NOT NULL,
    catalog_version_id uuid NOT NULL,
    item_key character varying(128) NOT NULL,
    category character varying(32) NOT NULL,
    name text NOT NULL,
    mark character varying(255) NOT NULL,
    nomenclature_code character varying(128) NOT NULL,
    supply_unit character varying(32) NOT NULL,
    applicability jsonb DEFAULT '{}'::jsonb NOT NULL,
    package_parameters jsonb DEFAULT '{}'::jsonb NOT NULL,
    formula_parameters jsonb DEFAULT '{}'::jsonb NOT NULL,
    source_ref text NOT NULL,
    row_checksum character varying(71) NOT NULL,
    "position" integer NOT NULL,
    CONSTRAINT ck_specification_catalog_items_category CHECK (((category)::text = ANY ((ARRAY['cable'::character varying, 'connection_kit'::character varying, 'repair_kit'::character varying, 'sealant'::character varying, 'fiberglass_tape'::character varying, 'aluminium_tape'::character varying, 'box'::character varying])::text[]))),
    CONSTRAINT ck_specification_catalog_items_row_checksum CHECK (((row_checksum)::text ~ '^sha256:[0-9a-f]{64}$'::text))
);""",
    r"""--
-- Name: specification_catalog_selections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.specification_catalog_selections (
    id uuid NOT NULL,
    project_id uuid NOT NULL,
    electrical_variant_id uuid NOT NULL,
    candidate_group_key character varying(128) NOT NULL,
    catalog_version_id uuid NOT NULL,
    catalog_item_id uuid NOT NULL,
    candidate_set_fingerprint character varying(71) NOT NULL,
    collection_version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_spec_catalog_selections_collection_version CHECK ((collection_version >= 1)),
    CONSTRAINT ck_spec_catalog_selections_group_key_nonempty CHECK ((char_length(btrim((candidate_group_key)::text)) > 0))
);""",
    r"""--
-- Name: specification_catalog_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.specification_catalog_versions (
    id uuid NOT NULL,
    catalog_key character varying(64) NOT NULL,
    version character varying(128) NOT NULL,
    status character varying(16) DEFAULT 'draft'::character varying NOT NULL,
    authority character varying(16) NOT NULL,
    source text NOT NULL,
    source_checksum character varying(71) NOT NULL,
    payload_checksum character varying(71) NOT NULL,
    schema_version integer NOT NULL,
    item_count integer DEFAULT 0 NOT NULL,
    is_complete boolean DEFAULT false NOT NULL,
    validation_issues jsonb DEFAULT '[]'::jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    imported_by character varying(255),
    activated_at timestamp with time zone,
    activated_by character varying(255),
    CONSTRAINT ck_specification_catalog_versions_active_authoritative CHECK ((((status)::text <> 'active'::text) OR (((authority)::text = ANY ((ARRAY['approved'::character varying, 'demo'::character varying])::text[])) AND (is_complete IS TRUE)))),
    CONSTRAINT ck_specification_catalog_versions_authority CHECK (((authority)::text = ANY ((ARRAY['approved'::character varying, 'provisional'::character varying, 'synthetic'::character varying, 'demo'::character varying, 'guessed'::character varying])::text[]))),
    CONSTRAINT ck_specification_catalog_versions_item_count CHECK ((item_count >= 0)),
    CONSTRAINT ck_specification_catalog_versions_payload_checksum CHECK (((payload_checksum)::text ~ '^sha256:[0-9a-f]{64}$'::text)),
    CONSTRAINT ck_specification_catalog_versions_schema_version CHECK ((schema_version >= 1)),
    CONSTRAINT ck_specification_catalog_versions_source_checksum CHECK (((source_checksum)::text ~ '^sha256:[0-9a-f]{64}$'::text)),
    CONSTRAINT ck_specification_catalog_versions_status CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'active'::character varying, 'retired'::character varying])::text[])))
);""",
    r"""--
-- Name: specifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.specifications (
    id uuid NOT NULL,
    project_id uuid NOT NULL,
    electrical_variant_id uuid NOT NULL,
    items jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_stale boolean DEFAULT false NOT NULL,
    stale_reason character varying(100),
    stale_at timestamp with time zone,
    stale_details jsonb,
    snapshot jsonb,
    generation_status character varying(32),
    generation_diagnostics jsonb DEFAULT '[]'::jsonb NOT NULL,
    generation_candidate_groups jsonb DEFAULT '[]'::jsonb NOT NULL,
    generation_at timestamp with time zone,
    CONSTRAINT ck_specifications_generation_status CHECK (((generation_status IS NULL) OR ((generation_status)::text = ANY ((ARRAY['generated'::character varying, 'blocked'::character varying, 'confirmation_required'::character varying, 'selection_required'::character varying])::text[]))))
);""",
    r"""--
-- Name: user_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_preferences (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    key character varying(128) NOT NULL,
    value jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);""",
    r"""--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid NOT NULL,
    email character varying(255) NOT NULL,
    hashed_password character varying(255) NOT NULL,
    full_name character varying(255),
    role public.user_role NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);""",
    r"""--
-- Name: accessories_extended accessories_extended_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accessories_extended
    ADD CONSTRAINT accessories_extended_pkey PRIMARY KEY (id);""",
    r"""--
-- Name: audit_events audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_pkey PRIMARY KEY (id);""",
    r"""--
-- Name: background_tasks background_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.background_tasks
    ADD CONSTRAINT background_tasks_pkey PRIMARY KEY (id);""",
    r"""--
-- Name: cables_extended cables_extended_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cables_extended
    ADD CONSTRAINT cables_extended_pkey PRIMARY KEY (id);""",
    r"""--
-- Name: background_tasks ck_background_tasks_electrical_variant_trace; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.background_tasks
    ADD CONSTRAINT ck_background_tasks_electrical_variant_trace CHECK ((((type)::text <> ALL ((ARRAY['electrical_batch'::character varying, 'report_export'::character varying])::text[])) OR ((electrical_variant_id IS NOT NULL) AND (project_id IS NOT NULL) AND ((request_payload ->> 'project_id'::text) IS NOT NULL) AND ((request_payload ->> 'project_id'::text) = (project_id)::text) AND ((request_payload ->> 'electrical_variant_id'::text) IS NOT NULL) AND (lower((request_payload ->> 'electrical_variant_id'::text)) = (electrical_variant_id)::text) AND (NOT (request_payload ? 'payload_version'::text))))) NOT VALID;""",
    r"""--
-- Name: correction_coefficients correction_coefficients_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.correction_coefficients
    ADD CONSTRAINT correction_coefficients_key_key UNIQUE (key);""",
    r"""--
-- Name: correction_coefficients correction_coefficients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.correction_coefficients
    ADD CONSTRAINT correction_coefficients_pkey PRIMARY KEY (id);""",
    r"""--
-- Name: electrical_calculation_revisions electrical_calculation_revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_calculation_revisions
    ADD CONSTRAINT electrical_calculation_revisions_pkey PRIMARY KEY (id);""",
    r"""--
-- Name: electrical_calculations electrical_calculations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_calculations
    ADD CONSTRAINT electrical_calculations_pkey PRIMARY KEY (id);""",
    r"""--
-- Name: electrical_candidate_folder_items electrical_candidate_folder_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_candidate_folder_items
    ADD CONSTRAINT electrical_candidate_folder_items_pkey PRIMARY KEY (folder_id, candidate_id);""",
    r"""--
-- Name: electrical_candidate_folders electrical_candidate_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_candidate_folders
    ADD CONSTRAINT electrical_candidate_folders_pkey PRIMARY KEY (id);""",
    r"""--
-- Name: electrical_candidates electrical_candidates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_candidates
    ADD CONSTRAINT electrical_candidates_pkey PRIMARY KEY (id);""",
    r"""--
-- Name: electrical_catalog_versions electrical_catalog_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_catalog_versions
    ADD CONSTRAINT electrical_catalog_versions_pkey PRIMARY KEY (id);""",
    r"""--
-- Name: electrical_variant_objects electrical_variant_objects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_variant_objects
    ADD CONSTRAINT electrical_variant_objects_pkey PRIMARY KEY (id);""",
    r"""--
-- Name: electrical_variants electrical_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_variants
    ADD CONSTRAINT electrical_variants_pkey PRIMARY KEY (id);""",
    r"""--
-- Name: guest_sessions guest_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_sessions
    ADD CONSTRAINT guest_sessions_pkey PRIMARY KEY (id);""",
    r"""--
-- Name: guest_sessions guest_sessions_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guest_sessions
    ADD CONSTRAINT guest_sessions_session_id_key UNIQUE (session_id);""",
    r"""--
-- Name: insulation_materials insulation_materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insulation_materials
    ADD CONSTRAINT insulation_materials_pkey PRIMARY KEY (id);""",
    r"""--
-- Name: project_electrical_settings project_electrical_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_electrical_settings
    ADD CONSTRAINT project_electrical_settings_pkey PRIMARY KEY (project_id);""",
    r"""--
-- Name: project_objects project_objects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_objects
    ADD CONSTRAINT project_objects_pkey PRIMARY KEY (id);""",
    r"""--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);""",
    r"""--
-- Name: refresh_sessions refresh_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_sessions
    ADD CONSTRAINT refresh_sessions_pkey PRIMARY KEY (id);""",
    r"""--
-- Name: specification_catalog_items specification_catalog_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.specification_catalog_items
    ADD CONSTRAINT specification_catalog_items_pkey PRIMARY KEY (id);""",
    r"""--
-- Name: specification_catalog_selections specification_catalog_selections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.specification_catalog_selections
    ADD CONSTRAINT specification_catalog_selections_pkey PRIMARY KEY (id);""",
    r"""--
-- Name: specification_catalog_versions specification_catalog_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.specification_catalog_versions
    ADD CONSTRAINT specification_catalog_versions_pkey PRIMARY KEY (id);""",
    r"""--
-- Name: specifications specifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.specifications
    ADD CONSTRAINT specifications_pkey PRIMARY KEY (id);""",
    r"""--
-- Name: electrical_variant_objects uq_electrical_variant_objects_variant_object; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_variant_objects
    ADD CONSTRAINT uq_electrical_variant_objects_variant_object UNIQUE (electrical_variant_id, object_id);""",
    r"""--
-- Name: electrical_variants uq_electrical_variants_id_project; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_variants
    ADD CONSTRAINT uq_electrical_variants_id_project UNIQUE (id, project_id);""",
    r"""--
-- Name: electrical_variants uq_electrical_variants_project_creation_idempotency_hash; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_variants
    ADD CONSTRAINT uq_electrical_variants_project_creation_idempotency_hash UNIQUE (project_id, creation_idempotency_key_hash);""",
    r"""--
-- Name: electrical_variants uq_electrical_variants_project_sort_order; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_variants
    ADD CONSTRAINT uq_electrical_variants_project_sort_order UNIQUE (project_id, sort_order);""",
    r"""--
-- Name: insulation_materials uq_insulation_materials_material; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insulation_materials
    ADD CONSTRAINT uq_insulation_materials_material UNIQUE (material);""",
    r"""--
-- Name: project_objects uq_project_objects_id_project; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_objects
    ADD CONSTRAINT uq_project_objects_id_project UNIQUE (id, project_id);""",
    r"""--
-- Name: specification_catalog_selections uq_spec_catalog_selections_project_er_group; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.specification_catalog_selections
    ADD CONSTRAINT uq_spec_catalog_selections_project_er_group UNIQUE (project_id, electrical_variant_id, candidate_group_key);""",
    r"""--
-- Name: specification_catalog_items uq_specification_catalog_items_version_code; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.specification_catalog_items
    ADD CONSTRAINT uq_specification_catalog_items_version_code UNIQUE (catalog_version_id, nomenclature_code);""",
    r"""--
-- Name: specification_catalog_items uq_specification_catalog_items_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.specification_catalog_items
    ADD CONSTRAINT uq_specification_catalog_items_version_key UNIQUE (catalog_version_id, item_key);""",
    r"""--
-- Name: specification_catalog_versions uq_specification_catalog_versions_key_version; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.specification_catalog_versions
    ADD CONSTRAINT uq_specification_catalog_versions_key_version UNIQUE (catalog_key, version);""",
    r"""--
-- Name: specifications uq_specifications_project_electrical_variant; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.specifications
    ADD CONSTRAINT uq_specifications_project_electrical_variant UNIQUE (project_id, electrical_variant_id);""",
    r"""--
-- Name: user_preferences uq_user_preferences_user_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT uq_user_preferences_user_key UNIQUE (user_id, key);""",
    r"""--
-- Name: user_preferences user_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (id);""",
    r"""--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);""",
    r"""--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);""",
    r"""--
-- Name: electrical_variants ux_electrical_variants_project_normalized_name; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_variants
    ADD CONSTRAINT ux_electrical_variants_project_normalized_name UNIQUE (project_id, name_normalized);""",
    r"""--
-- Name: ix_accessories_extended_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_accessories_extended_category ON public.accessories_extended USING btree (category);""",
    r"""--
-- Name: ix_audit_events_category_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_events_category_created ON public.audit_events USING btree (category, created_at);""",
    r"""--
-- Name: ix_audit_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_events_created_at ON public.audit_events USING btree (created_at);""",
    r"""--
-- Name: ix_audit_events_event_type_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_events_event_type_created ON public.audit_events USING btree (event_type, created_at);""",
    r"""--
-- Name: ix_audit_events_object_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_events_object_created ON public.audit_events USING btree (object_id, created_at);""",
    r"""--
-- Name: ix_audit_events_project_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_events_project_created ON public.audit_events USING btree (project_id, created_at);""",
    r"""--
-- Name: ix_audit_events_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_events_request_id ON public.audit_events USING btree (request_id);""",
    r"""--
-- Name: ix_audit_events_session_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_events_session_created ON public.audit_events USING btree (session_id, created_at);""",
    r"""--
-- Name: ix_audit_events_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_events_user_created ON public.audit_events USING btree (user_id, created_at);""",
    r"""--
-- Name: ix_background_tasks_electrical_variant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_background_tasks_electrical_variant_id ON public.background_tasks USING btree (electrical_variant_id);""",
    r"""--
-- Name: ix_background_tasks_idempotency_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_background_tasks_idempotency_key ON public.background_tasks USING btree (idempotency_key);""",
    r"""--
-- Name: ix_background_tasks_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_background_tasks_project_id ON public.background_tasks USING btree (project_id);""",
    r"""--
-- Name: ix_background_tasks_project_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_background_tasks_project_status ON public.background_tasks USING btree (project_id, status);""",
    r"""--
-- Name: ix_background_tasks_session_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_background_tasks_session_created ON public.background_tasks USING btree (session_id, created_at);""",
    r"""--
-- Name: ix_background_tasks_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_background_tasks_session_id ON public.background_tasks USING btree (session_id);""",
    r"""--
-- Name: ix_background_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_background_tasks_status ON public.background_tasks USING btree (status);""",
    r"""--
-- Name: ix_background_tasks_status_next_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_background_tasks_status_next_retry ON public.background_tasks USING btree (status, next_retry_at);""",
    r"""--
-- Name: ix_background_tasks_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_background_tasks_type ON public.background_tasks USING btree (type);""",
    r"""--
-- Name: ix_background_tasks_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_background_tasks_user_created ON public.background_tasks USING btree (user_id, created_at);""",
    r"""--
-- Name: ix_background_tasks_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_background_tasks_user_id ON public.background_tasks USING btree (user_id);""",
    r"""--
-- Name: ix_electrical_calculation_revisions_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_electrical_calculation_revisions_scope ON public.electrical_calculation_revisions USING btree (project_id, electrical_variant_id, object_id, revision_number);""",
    r"""--
-- Name: ix_electrical_calculations_cable_type_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_electrical_calculations_cable_type_source ON public.electrical_calculations USING btree (cable_type_source);""",
    r"""--
-- Name: ix_electrical_calculations_project_electrical_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_electrical_calculations_project_electrical_variant ON public.electrical_calculations USING btree (project_id, electrical_variant_id);""",
    r"""--
-- Name: ix_electrical_candidate_folder_items_candidate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_electrical_candidate_folder_items_candidate ON public.electrical_candidate_folder_items USING btree (candidate_id);""",
    r"""--
-- Name: ix_electrical_candidate_folders_electrical_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_electrical_candidate_folders_electrical_scope ON public.electrical_candidate_folders USING btree (project_id, object_id, electrical_variant_id, sort_order);""",
    r"""--
-- Name: ix_electrical_candidates_project_object_electrical_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_electrical_candidates_project_object_electrical_variant ON public.electrical_candidates USING btree (project_id, object_id, electrical_variant_id);""",
    r"""--
-- Name: ix_electrical_variant_objects_project_object; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_electrical_variant_objects_project_object ON public.electrical_variant_objects USING btree (project_id, object_id);""",
    r"""--
-- Name: ix_electrical_variant_objects_variant_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_electrical_variant_objects_variant_state ON public.electrical_variant_objects USING btree (electrical_variant_id, assignment_state);""",
    r"""--
-- Name: ix_electrical_variant_objects_variant_system_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_electrical_variant_objects_variant_system_state ON public.electrical_variant_objects USING btree (electrical_variant_id, system_type, assignment_state);""",
    r"""--
-- Name: ix_guest_sessions_last_activity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_guest_sessions_last_activity ON public.guest_sessions USING btree (last_activity);""",
    r"""--
-- Name: ix_guest_sessions_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_guest_sessions_session_id ON public.guest_sessions USING btree (session_id);""",
    r"""--
-- Name: ix_insulation_materials_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_insulation_materials_active ON public.insulation_materials USING btree (is_active);""",
    r"""--
-- Name: ix_insulation_materials_material; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_insulation_materials_material ON public.insulation_materials USING btree (material);""",
    r"""--
-- Name: ix_project_objects_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_project_objects_name_trgm ON public.project_objects USING gin (lower((params ->> 'name'::text)) public.gin_trgm_ops);""",
    r"""--
-- Name: ix_project_objects_params_text_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_project_objects_params_text_trgm ON public.project_objects USING gin (lower((params)::text) public.gin_trgm_ops);""",
    r"""--
-- Name: ix_project_objects_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_project_objects_project_id ON public.project_objects USING btree (project_id);""",
    r"""--
-- Name: ix_project_objects_project_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_project_objects_project_sort ON public.project_objects USING btree (project_id, sort_order, id);""",
    r"""--
-- Name: ix_project_objects_project_type_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_project_objects_project_type_sort ON public.project_objects USING btree (project_id, object_type, sort_order, id);""",
    r"""--
-- Name: ix_projects_session_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_projects_session_updated ON public.projects USING btree (session_id, updated_at);""",
    r"""--
-- Name: ix_projects_task_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_projects_task_number ON public.projects USING btree (task_number);""",
    r"""--
-- Name: ix_projects_user_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_projects_user_updated ON public.projects USING btree (user_id, updated_at);""",
    r"""--
-- Name: ix_refresh_sessions_jti_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_refresh_sessions_jti_hash ON public.refresh_sessions USING btree (jti_hash);""",
    r"""--
-- Name: ix_refresh_sessions_user_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_refresh_sessions_user_active ON public.refresh_sessions USING btree (user_id, revoked_at);""",
    r"""--
-- Name: ix_spec_catalog_selections_project_er; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_spec_catalog_selections_project_er ON public.specification_catalog_selections USING btree (project_id, electrical_variant_id);""",
    r"""--
-- Name: ix_specification_catalog_items_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_specification_catalog_items_lookup ON public.specification_catalog_items USING btree (catalog_version_id, category);""",
    r"""--
-- Name: ix_specifications_electrical_variant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_specifications_electrical_variant_id ON public.specifications USING btree (electrical_variant_id);""",
    r"""--
-- Name: ix_specifications_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_specifications_project_id ON public.specifications USING btree (project_id);""",
    r"""--
-- Name: ix_user_preferences_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_preferences_user_id ON public.user_preferences USING btree (user_id);""",
    r"""--
-- Name: ix_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_users_email ON public.users USING btree (email);""",
    r"""--
-- Name: uq_background_tasks_active_calculation_project; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_background_tasks_active_calculation_project ON public.background_tasks USING btree (project_id) WHERE ((project_id IS NOT NULL) AND ((type)::text = ANY ((ARRAY['heat_loss_batch'::character varying, 'electrical_batch'::character varying])::text[])) AND ((status)::text = ANY ((ARRAY['queued'::character varying, 'enqueued'::character varying, 'running'::character varying, 'waiting_input'::character varying])::text[])));""",
    r"""--
-- Name: uq_background_tasks_active_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_background_tasks_active_idempotency ON public.background_tasks USING btree (idempotency_key) WHERE ((idempotency_key IS NOT NULL) AND ((status)::text = ANY ((ARRAY['queued'::character varying, 'enqueued'::character varying, 'running'::character varying, 'waiting_input'::character varying])::text[])));""",
    r"""--
-- Name: ux_electrical_calculation_revisions_source_number; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_electrical_calculation_revisions_source_number ON public.electrical_calculation_revisions USING btree (electrical_calculation_id, revision_number);""",
    r"""--
-- Name: ux_electrical_calculation_revisions_supersedes; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_electrical_calculation_revisions_supersedes ON public.electrical_calculation_revisions USING btree (supersedes_result_id);""",
    r"""--
-- Name: ux_electrical_calculations_object_electrical_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_electrical_calculations_object_electrical_variant ON public.electrical_calculations USING btree (object_id, electrical_variant_id) WHERE (electrical_variant_id IS NOT NULL);""",
    r"""--
-- Name: ux_electrical_candidate_folders_electrical_scope_name; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_electrical_candidate_folders_electrical_scope_name ON public.electrical_candidate_folders USING btree (project_id, object_id, electrical_variant_id, name) WHERE (electrical_variant_id IS NOT NULL);""",
    r"""--
-- Name: ux_electrical_candidates_applied_object_electrical_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_electrical_candidates_applied_object_electrical_variant ON public.electrical_candidates USING btree (object_id, electrical_variant_id) WHERE (is_applied AND (electrical_variant_id IS NOT NULL));""",
    r"""--
-- Name: ux_electrical_candidates_object_electrical_variant_dedupe; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_electrical_candidates_object_electrical_variant_dedupe ON public.electrical_candidates USING btree (object_id, electrical_variant_id, dedupe_key) WHERE (electrical_variant_id IS NOT NULL);""",
    r"""--
-- Name: ux_electrical_catalog_versions_active_kind; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_electrical_catalog_versions_active_kind ON public.electrical_catalog_versions USING btree (kind) WHERE ((status)::text = 'active'::text);""",
    r"""--
-- Name: ux_electrical_catalog_versions_kind_version; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_electrical_catalog_versions_kind_version ON public.electrical_catalog_versions USING btree (kind, version);""",
    r"""--
-- Name: ux_electrical_variants_project_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_electrical_variants_project_active ON public.electrical_variants USING btree (project_id) WHERE (is_active IS TRUE);""",
    r"""--
-- Name: ux_specification_catalog_versions_active_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_specification_catalog_versions_active_key ON public.specification_catalog_versions USING btree (catalog_key) WHERE ((status)::text = 'active'::text);""",
    r"""--
-- Name: electrical_calculation_revisions tr_electrical_calculation_revisions_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_electrical_calculation_revisions_immutable BEFORE DELETE OR UPDATE ON public.electrical_calculation_revisions FOR EACH ROW EXECUTE FUNCTION public.tlt_guard_electrical_calculation_revisions();""",
    r"""--
-- Name: electrical_calculations tr_electrical_calculations_capture_revision; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_electrical_calculations_capture_revision AFTER INSERT OR UPDATE ON public.electrical_calculations FOR EACH ROW EXECUTE FUNCTION public.tlt_capture_electrical_calculation_revision();""",
    r"""--
-- Name: electrical_catalog_versions tr_electrical_catalog_versions_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_electrical_catalog_versions_immutable BEFORE DELETE OR UPDATE ON public.electrical_catalog_versions FOR EACH ROW EXECUTE FUNCTION public.tlt_guard_electrical_catalog_immutability();""",
    r"""--
-- Name: specification_catalog_items tr_specification_catalog_items_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_specification_catalog_items_immutable BEFORE INSERT OR DELETE OR UPDATE ON public.specification_catalog_items FOR EACH ROW EXECUTE FUNCTION public.tlt_guard_specification_catalog_item();""",
    r"""--
-- Name: specification_catalog_versions tr_specification_catalog_versions_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_specification_catalog_versions_immutable BEFORE DELETE OR UPDATE ON public.specification_catalog_versions FOR EACH ROW EXECUTE FUNCTION public.tlt_guard_specification_catalog_version();""",
    r"""--
-- Name: project_objects trg_sync_project_object_assignments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_project_object_assignments AFTER INSERT ON public.project_objects FOR EACH ROW EXECUTE FUNCTION public.tlt_sync_project_object_assignments();""",
    r"""--
-- Name: electrical_variants trg_enforce_electrical_variant_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_electrical_variant_limit BEFORE INSERT OR UPDATE OF project_id ON public.electrical_variants FOR EACH ROW EXECUTE FUNCTION public.tlt_enforce_electrical_variant_limit();""",
    r"""--
-- Name: background_tasks background_tasks_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.background_tasks
    ADD CONSTRAINT background_tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;""",
    r"""--
-- Name: background_tasks background_tasks_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.background_tasks
    ADD CONSTRAINT background_tasks_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.guest_sessions(session_id) ON DELETE CASCADE;""",
    r"""--
-- Name: background_tasks background_tasks_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.background_tasks
    ADD CONSTRAINT background_tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;""",
    r"""--
-- Name: correction_coefficients correction_coefficients_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.correction_coefficients
    ADD CONSTRAINT correction_coefficients_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;""",
    r"""--
-- Name: electrical_calculations electrical_calculations_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_calculations
    ADD CONSTRAINT electrical_calculations_object_id_fkey FOREIGN KEY (object_id) REFERENCES public.project_objects(id) ON DELETE CASCADE;""",
    r"""--
-- Name: electrical_calculations electrical_calculations_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_calculations
    ADD CONSTRAINT electrical_calculations_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;""",
    r"""--
-- Name: electrical_candidate_folder_items electrical_candidate_folder_items_candidate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_candidate_folder_items
    ADD CONSTRAINT electrical_candidate_folder_items_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.electrical_candidates(id) ON DELETE CASCADE;""",
    r"""--
-- Name: electrical_candidate_folder_items electrical_candidate_folder_items_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_candidate_folder_items
    ADD CONSTRAINT electrical_candidate_folder_items_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.electrical_candidate_folders(id) ON DELETE CASCADE;""",
    r"""--
-- Name: electrical_candidate_folders electrical_candidate_folders_created_by_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_candidate_folders
    ADD CONSTRAINT electrical_candidate_folders_created_by_session_id_fkey FOREIGN KEY (created_by_session_id) REFERENCES public.guest_sessions(session_id) ON DELETE CASCADE;""",
    r"""--
-- Name: electrical_candidate_folders electrical_candidate_folders_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_candidate_folders
    ADD CONSTRAINT electrical_candidate_folders_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;""",
    r"""--
-- Name: electrical_candidate_folders electrical_candidate_folders_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_candidate_folders
    ADD CONSTRAINT electrical_candidate_folders_object_id_fkey FOREIGN KEY (object_id) REFERENCES public.project_objects(id) ON DELETE CASCADE;""",
    r"""--
-- Name: electrical_candidate_folders electrical_candidate_folders_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_candidate_folders
    ADD CONSTRAINT electrical_candidate_folders_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;""",
    r"""--
-- Name: electrical_candidates electrical_candidates_object_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_candidates
    ADD CONSTRAINT electrical_candidates_object_id_fkey FOREIGN KEY (object_id) REFERENCES public.project_objects(id) ON DELETE CASCADE;""",
    r"""--
-- Name: electrical_candidates electrical_candidates_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_candidates
    ADD CONSTRAINT electrical_candidates_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;""",
    r"""--
-- Name: electrical_calculation_revisions fk_electrical_calculation_revisions_supersedes; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_calculation_revisions
    ADD CONSTRAINT fk_electrical_calculation_revisions_supersedes FOREIGN KEY (supersedes_result_id) REFERENCES public.electrical_calculation_revisions(id) ON DELETE RESTRICT;""",
    r"""--
-- Name: electrical_calculations fk_electrical_calculations_variant_object_assignment; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_calculations
    ADD CONSTRAINT fk_electrical_calculations_variant_object_assignment FOREIGN KEY (electrical_variant_id, object_id) REFERENCES public.electrical_variant_objects(electrical_variant_id, object_id) ON DELETE CASCADE;""",
    r"""--
-- Name: electrical_calculations fk_electrical_calculations_variant_project; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_calculations
    ADD CONSTRAINT fk_electrical_calculations_variant_project FOREIGN KEY (electrical_variant_id, project_id) REFERENCES public.electrical_variants(id, project_id) ON DELETE CASCADE;""",
    r"""--
-- Name: electrical_candidate_folders fk_electrical_candidate_folders_variant_object_assignment; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_candidate_folders
    ADD CONSTRAINT fk_electrical_candidate_folders_variant_object_assignment FOREIGN KEY (electrical_variant_id, object_id) REFERENCES public.electrical_variant_objects(electrical_variant_id, object_id) ON DELETE CASCADE;""",
    r"""--
-- Name: electrical_candidate_folders fk_electrical_candidate_folders_variant_project; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_candidate_folders
    ADD CONSTRAINT fk_electrical_candidate_folders_variant_project FOREIGN KEY (electrical_variant_id, project_id) REFERENCES public.electrical_variants(id, project_id) ON DELETE CASCADE;""",
    r"""--
-- Name: electrical_candidates fk_electrical_candidates_variant_object_assignment; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_candidates
    ADD CONSTRAINT fk_electrical_candidates_variant_object_assignment FOREIGN KEY (electrical_variant_id, object_id) REFERENCES public.electrical_variant_objects(electrical_variant_id, object_id) ON DELETE CASCADE;""",
    r"""--
-- Name: electrical_candidates fk_electrical_candidates_variant_project; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_candidates
    ADD CONSTRAINT fk_electrical_candidates_variant_project FOREIGN KEY (electrical_variant_id, project_id) REFERENCES public.electrical_variants(id, project_id) ON DELETE CASCADE;""",
    r"""--
-- Name: electrical_variant_objects fk_electrical_variant_objects_object_project; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_variant_objects
    ADD CONSTRAINT fk_electrical_variant_objects_object_project FOREIGN KEY (object_id, project_id) REFERENCES public.project_objects(id, project_id) ON DELETE CASCADE;""",
    r"""--
-- Name: electrical_variant_objects fk_electrical_variant_objects_variant_project; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_variant_objects
    ADD CONSTRAINT fk_electrical_variant_objects_variant_project FOREIGN KEY (electrical_variant_id, project_id) REFERENCES public.electrical_variants(id, project_id) ON DELETE CASCADE;""",
    r"""--
-- Name: electrical_variants fk_electrical_variants_copied_from_project; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_variants
    ADD CONSTRAINT fk_electrical_variants_copied_from_project FOREIGN KEY (copied_from_id, project_id) REFERENCES public.electrical_variants(id, project_id) DEFERRABLE INITIALLY DEFERRED;""",
    r"""--
-- Name: electrical_variants fk_electrical_variants_project; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electrical_variants
    ADD CONSTRAINT fk_electrical_variants_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;""",
    r"""--
-- Name: specification_catalog_selections fk_spec_catalog_selections_catalog_version; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.specification_catalog_selections
    ADD CONSTRAINT fk_spec_catalog_selections_catalog_version FOREIGN KEY (catalog_version_id) REFERENCES public.specification_catalog_versions(id) ON DELETE CASCADE;""",
    r"""--
-- Name: specification_catalog_selections fk_spec_catalog_selections_item; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.specification_catalog_selections
    ADD CONSTRAINT fk_spec_catalog_selections_item FOREIGN KEY (catalog_item_id) REFERENCES public.specification_catalog_items(id) ON DELETE CASCADE;""",
    r"""--
-- Name: specification_catalog_selections fk_spec_catalog_selections_project; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.specification_catalog_selections
    ADD CONSTRAINT fk_spec_catalog_selections_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;""",
    r"""--
-- Name: specification_catalog_selections fk_spec_catalog_selections_variant_project; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.specification_catalog_selections
    ADD CONSTRAINT fk_spec_catalog_selections_variant_project FOREIGN KEY (electrical_variant_id, project_id) REFERENCES public.electrical_variants(id, project_id) ON DELETE CASCADE;""",
    r"""--
-- Name: specifications fk_specifications_electrical_variant_project; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.specifications
    ADD CONSTRAINT fk_specifications_electrical_variant_project FOREIGN KEY (electrical_variant_id, project_id) REFERENCES public.electrical_variants(id, project_id) ON DELETE CASCADE;""",
    r"""--
-- Name: project_electrical_settings project_electrical_settings_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_electrical_settings
    ADD CONSTRAINT project_electrical_settings_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;""",
    r"""--
-- Name: project_objects project_objects_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_objects
    ADD CONSTRAINT project_objects_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;""",
    r"""--
-- Name: projects projects_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.guest_sessions(session_id) ON DELETE CASCADE;""",
    r"""--
-- Name: projects projects_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;""",
    r"""--
-- Name: refresh_sessions refresh_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_sessions
    ADD CONSTRAINT refresh_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;""",
    r"""--
-- Name: specification_catalog_items specification_catalog_items_catalog_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.specification_catalog_items
    ADD CONSTRAINT specification_catalog_items_catalog_version_id_fkey FOREIGN KEY (catalog_version_id) REFERENCES public.specification_catalog_versions(id) ON DELETE CASCADE;""",
    r"""--
-- Name: specifications specifications_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.specifications
    ADD CONSTRAINT specifications_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;""",
    r"""--
-- Name: user_preferences user_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;""",
)


def upgrade() -> None:
    for statement in _UPGRADE_STATEMENTS:
        op.execute(sa.text(statement))


def downgrade() -> None:
    for table in ('electrical_candidate_folder_items', 'specification_catalog_selections', 'electrical_calculation_revisions', 'electrical_candidate_folders', 'electrical_candidates', 'electrical_variant_objects', 'specifications', 'electrical_calculations', 'background_tasks', 'project_electrical_settings', 'project_objects', 'electrical_variants', 'specification_catalog_items', 'specification_catalog_versions', 'electrical_catalog_versions', 'refresh_sessions', 'user_preferences', 'projects', 'guest_sessions', 'users', 'audit_events', 'insulation_materials', 'correction_coefficients', 'cables_extended', 'accessories_extended'):
        op.execute(sa.text(f'DROP TABLE IF EXISTS "{table}" CASCADE'))
    for function in ('tlt_sync_project_object_assignments', 'tlt_guard_electrical_catalog_immutability', 'tlt_capture_electrical_calculation_revision', 'tlt_guard_electrical_calculation_revisions', 'tlt_guard_specification_catalog_item', 'tlt_guard_specification_catalog_version', 'tlt_enforce_electrical_variant_limit'):
        op.execute(sa.text(f'DROP FUNCTION IF EXISTS "{function}"()'))
    for enum_name in ('cable_type', 'object_type', 'project_status', 'user_role'):
        op.execute(sa.text(f'DROP TYPE IF EXISTS "{enum_name}"'))
