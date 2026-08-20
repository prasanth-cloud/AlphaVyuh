from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.middleware.auth import get_current_user_id, get_current_user_token
from app.services.supabase import get_user_client

router = APIRouter(prefix="/api/v1/scanner", tags=["scanner-lineage"])

ScannerUniverse = Literal["all_nse", "nifty500", "nifty_midsmallcap_400", "custom"]
FilterOperator = Literal["and", "or"]


class ScannerFilterInput(BaseModel):
    kind: str = Field(..., min_length=1, max_length=80)
    value: Any = Field(default_factory=dict)
    sort_order: int = Field(default=0, ge=0)


class ScannerFilterGroupInput(BaseModel):
    operator: FilterOperator = "and"
    sort_order: int = Field(default=0, ge=0)
    filters: list[ScannerFilterInput] = Field(default_factory=list)


class ScannerDefinitionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    universe: ScannerUniverse = "all_nse"
    definition: dict[str, Any] = Field(default_factory=dict)
    groups: list[ScannerFilterGroupInput] = Field(default_factory=list)


class ScannerDefinitionPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    universe: ScannerUniverse | None = None
    definition: dict[str, Any] | None = None
    is_active: bool | None = None
    groups: list[ScannerFilterGroupInput] | None = None


def _lineage_unavailable() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Scanner lineage is temporarily unavailable.",
    )


def _owned_row(client: Any, table: str, row_id: UUID, user_id: str) -> dict[str, Any]:
    try:
        result = (
            client.table(table)
            .select("*")
            .eq("id", str(row_id))
            .eq("user_id", user_id)
            .execute()
        )
    except Exception as exc:
        raise _lineage_unavailable() from exc
    rows = result.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scanner record not found")
    return rows[0]


def _write_groups(
    client: Any,
    *,
    user_id: str,
    definition_id: str,
    group_inputs: list[ScannerFilterGroupInput],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    groups: list[dict[str, Any]] = []
    filters: list[dict[str, Any]] = []
    for group_input in group_inputs:
        group_result = client.table("scanner_filter_groups").insert({
            "user_id": user_id,
            "scanner_definition_id": definition_id,
            "operator": group_input.operator,
            "sort_order": group_input.sort_order,
        }).execute()
        if not group_result.data:
            raise _lineage_unavailable()
        group = group_result.data[0]
        groups.append(group)
        for filter_input in group_input.filters:
            kind = filter_input.kind.strip()
            if not kind:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Scanner filter kind is required",
                )
            filter_result = client.table("scanner_filters").insert({
                "user_id": user_id,
                "group_id": group["id"],
                "kind": kind,
                "value": filter_input.value,
                "sort_order": filter_input.sort_order,
            }).execute()
            if not filter_result.data:
                raise _lineage_unavailable()
            filters.extend(filter_result.data)
    return groups, filters


def _with_nested_filters(
    client: Any,
    *,
    user_id: str,
    definition: dict[str, Any],
) -> dict[str, Any]:
    group_result = (
        client.table("scanner_filter_groups")
        .select("*")
        .eq("user_id", user_id)
        .eq("scanner_definition_id", definition["id"])
        .order("sort_order")
        .execute()
    )
    groups: list[dict[str, Any]] = []
    filters: list[dict[str, Any]] = []
    for group in group_result.data or []:
        filter_result = (
            client.table("scanner_filters")
            .select("*")
            .eq("user_id", user_id)
            .eq("group_id", group["id"])
            .order("sort_order")
            .execute()
        )
        group_filters = filter_result.data or []
        filters.extend(group_filters)
        groups.append({**group, "filters": group_filters})
    return {**definition, "groups": groups, "filters": filters}


@router.get("/definitions")
async def list_scanner_definitions(
    user_id: str = Depends(get_current_user_id),
    user_jwt: str = Depends(get_current_user_token),
):
    try:
        client = get_user_client(user_jwt)
        result = (
            client
            .table("scanner_definitions")
            .select("*")
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
            .execute()
        )
        definitions = [
            _with_nested_filters(client, user_id=user_id, definition=definition)
            for definition in (result.data or [])
        ]
    except Exception as exc:
        raise _lineage_unavailable() from exc
    return {"definitions": definitions}


@router.post("/definitions", status_code=status.HTTP_201_CREATED)
async def create_scanner_definition(
    body: ScannerDefinitionCreate,
    user_id: str = Depends(get_current_user_id),
    user_jwt: str = Depends(get_current_user_token),
):
    client = get_user_client(user_jwt)
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Scanner definition name is required")
    if any(not filter_input.kind.strip() for group in body.groups for filter_input in group.filters):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Scanner filter kind is required")
    definition_row = {
        "user_id": user_id,
        "name": name,
        "universe": body.universe,
        "definition": body.definition,
    }
    try:
        definition_result = client.table("scanner_definitions").insert(definition_row).execute()
        if not definition_result.data:
            raise _lineage_unavailable()
        definition = definition_result.data[0]
        definition_id = definition["id"]
        groups, filters = _write_groups(
            client,
            user_id=user_id,
            definition_id=definition_id,
            group_inputs=body.groups,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise _lineage_unavailable() from exc
    nested_groups = [
        {
            **group,
            "filters": [filter_row for filter_row in filters if filter_row.get("group_id") == group.get("id")],
        }
        for group in groups
    ]
    return {"definition": definition, "groups": nested_groups, "filters": filters}


@router.patch("/definitions/{definition_id}")
async def update_scanner_definition(
    definition_id: UUID,
    body: ScannerDefinitionPatch,
    user_id: str = Depends(get_current_user_id),
    user_jwt: str = Depends(get_current_user_token),
):
    client = get_user_client(user_jwt)
    _owned_row(client, "scanner_definitions", definition_id, user_id)
    changes = body.model_dump(exclude_unset=True)
    group_inputs = changes.pop("groups", None)
    if "name" in changes and changes["name"] is not None:
        changes["name"] = changes["name"].strip()
        if not changes["name"]:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Scanner definition name is required")
    changes["updated_at"] = datetime.now(timezone.utc).isoformat()
    try:
        result = (
            client.table("scanner_definitions")
            .update(changes)
            .eq("id", str(definition_id))
            .eq("user_id", user_id)
            .execute()
        )
        if group_inputs is not None:
            client.table("scanner_filter_groups").delete().eq(
                "user_id", user_id
            ).eq("scanner_definition_id", str(definition_id)).execute()
            _write_groups(
                client,
                user_id=user_id,
                definition_id=str(definition_id),
                group_inputs=[ScannerFilterGroupInput.model_validate(group) for group in group_inputs],
            )
    except Exception as exc:
        raise _lineage_unavailable() from exc
    if not result.data:
        updated = _owned_row(client, "scanner_definitions", definition_id, user_id)
    else:
        updated = result.data[0]
    try:
        return _with_nested_filters(client, user_id=user_id, definition=updated)
    except Exception as exc:
        raise _lineage_unavailable() from exc


@router.delete("/definitions/{definition_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scanner_definition(
    definition_id: UUID,
    user_id: str = Depends(get_current_user_id),
    user_jwt: str = Depends(get_current_user_token),
):
    client = get_user_client(user_jwt)
    _owned_row(client, "scanner_definitions", definition_id, user_id)
    try:
        client.table("scanner_definitions").delete().eq("id", str(definition_id)).eq("user_id", user_id).execute()
    except Exception as exc:
        raise _lineage_unavailable() from exc


@router.get("/runs")
async def list_scanner_runs(
    limit: int = Query(default=25, ge=1, le=100),
    user_id: str = Depends(get_current_user_id),
    user_jwt: str = Depends(get_current_user_token),
):
    try:
        result = (
            get_user_client(user_jwt)
            .table("scanner_runs")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
    except Exception as exc:
        raise _lineage_unavailable() from exc
    return {"runs": result.data or []}


@router.get("/runs/{run_id}/candidates")
async def list_scanner_candidates(
    run_id: UUID,
    limit: int = Query(default=200, ge=1, le=1000),
    user_id: str = Depends(get_current_user_id),
    user_jwt: str = Depends(get_current_user_token),
):
    client = get_user_client(user_jwt)
    _owned_row(client, "scanner_runs", run_id, user_id)
    try:
        result = (
            client.table("scanner_candidates")
            .select("*")
            .eq("scanner_run_id", str(run_id))
            .eq("user_id", user_id)
            .order("rank")
            .limit(limit)
            .execute()
        )
    except Exception as exc:
        raise _lineage_unavailable() from exc
    return {"candidates": result.data or []}


@router.get("/candidates/{candidate_id}")
async def get_scanner_candidate(
    candidate_id: UUID,
    user_id: str = Depends(get_current_user_id),
    user_jwt: str = Depends(get_current_user_token),
):
    return _owned_row(get_user_client(user_jwt), "scanner_candidates", candidate_id, user_id)
