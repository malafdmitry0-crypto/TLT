from sqlalchemy.dialects import postgresql

from app.schemas.project import ProjectObjectsQueryRequest
from app.services.object_query_service import ObjectQueryService


def _compile_clause(data: ProjectObjectsQueryRequest) -> str:
    clause = ObjectQueryService(None)._sql_search_clause(data)  # type: ignore[arg-type]
    assert clause is not None
    return str(
        clause.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    )


def test_default_search_casts_jsonb_params_to_text_for_trgm_index_match():
    sql = _compile_clause(ProjectObjectsQueryRequest(object_type="pipe", search={"text": "95"}))

    assert "CAST(project_objects.params AS TEXT)" in sql
    assert "VARCHAR" not in sql


def test_name_search_casts_jsonb_text_value_to_text_for_trgm_index_match():
    sql = _compile_clause(
        ProjectObjectsQueryRequest(
            object_type="pipe",
            search={"text": "Pipe", "columns": ["name"]},
        )
    )

    assert "CAST(project_objects.params ->> 'name' AS TEXT)" in sql
    assert "VARCHAR" not in sql
