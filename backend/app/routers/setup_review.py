from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.middleware.auth import get_current_user_id, get_current_user_token
from app.services.setup_review import (
    DEFAULT_MIN_PLANNED_RR,
    default_rule_definitions,
    evaluate_setup,
)
from app.services.supabase import get_user_client

router = APIRouter(prefix="/api/v1", tags=["setup-review"])

RuleCode = Literal[
    "plan_geometry",
    "positive_risk",
    "quantity_set",
    "minimum_rr",
    "written_thesis",
    "invalidation_defined",
    "max_risk_amount",
    "max_account_risk_pct",
]
RuleSeverity = Literal["block", "warn", "check", "info"]


class RulebookRuleInput(BaseModel):
    code: RuleCode
    label: str = Field(..., min_length=1, max_length=160)
    severity: RuleSeverity = "check"
    config: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True
    sort_order: int = Field(default=0, ge=0, le=10000)


class RulebookCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=800)
    min_planned_rr: float | None = Field(default=DEFAULT_MIN_PLANNED_RR, gt=0)
    max_risk_amount: float | None = Field(default=None, ge=0)
    max_account_risk_pct: float | None = Field(default=None, ge=0, le=100)
    is_default: bool = False
    rules: list[RulebookRuleInput] | None = Field(default=None, max_length=32)


class SetupReviewRequest(BaseModel):
    rulebook_id: UUID | None = None
    account_equity: float | None = Field(default=None, gt=0)
    override_reason: str | None = Field(default=None, max_length=800)


async def _owned_rulebook(sb: Any, rulebook_id: UUID, user_id: str) -> dict[str, Any]:
    try:
        result = (
            sb.table("rulebooks")
            .select("*")
            .eq("id", str(rulebook_id))
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Rulebooks are temporarily unavailable") from exc
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rulebook not found")
    return result.data


def _rule_payloads(
    rulebook: dict[str, Any],
    user_id: str,
    rules: list[RulebookRuleInput] | None,
) -> list[dict[str, Any]]:
    source = rules or [
        RulebookRuleInput(
            code=rule["code"],
            label=rule["label"],
            severity=rule["severity"],
            config=rule.get("config") or {},
            enabled=rule.get("enabled", True),
            sort_order=rule.get("sort_order", 0),
        )
        for rule in default_rule_definitions(
            min_planned_rr=float(rulebook.get("min_planned_rr") or DEFAULT_MIN_PLANNED_RR),
            max_risk_amount=rulebook.get("max_risk_amount"),
            max_account_risk_pct=rulebook.get("max_account_risk_pct"),
        )
    ]
    return [
        {
            "user_id": user_id,
            "rulebook_id": str(rulebook["id"]),
            **rule.model_dump(),
        }
        for rule in source
    ]


def _load_rules(sb: Any, rulebook_id: str, user_id: str) -> list[dict[str, Any]]:
    try:
        result = (
            sb.table("rulebook_rules")
            .select("*")
            .eq("rulebook_id", rulebook_id)
            .eq("user_id", user_id)
            .order("sort_order")
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Rulebook rules are temporarily unavailable") from exc
    return result.data or []


def _create_rulebook(
    sb: Any,
    body: RulebookCreate,
    user_id: str,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    if body.is_default:
        try:
            (
                sb.table("rulebooks")
                .update({"is_default": False})
                .eq("user_id", user_id)
                .eq("is_default", True)
                .execute()
            )
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Existing default rulebook could not be updated") from exc
    payload = body.model_dump(exclude={"rules"}, exclude_none=True)
    payload["user_id"] = user_id
    try:
        result = sb.table("rulebooks").insert(payload).execute()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Rulebook could not be saved") from exc
    if not result.data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Rulebook save returned no data")
    rulebook = result.data[0]
    rule_payloads = _rule_payloads(rulebook, user_id, body.rules)
    try:
        rules_result = sb.table("rulebook_rules").insert(rule_payloads).execute()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Rulebook rules could not be saved") from exc
    return rulebook, rules_result.data or rule_payloads


@router.get("/rulebooks")
async def list_rulebooks(
    user_id: str = Depends(get_current_user_id),
    user_jwt: str = Depends(get_current_user_token),
):
    sb = get_user_client(user_jwt)
    try:
        result = sb.table("rulebooks").select("*").eq("user_id", user_id).order("updated_at", desc=True).execute()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Rulebooks are temporarily unavailable") from exc
    rulebooks = result.data or []
    return {
        "rulebooks": [
            {**rulebook, "rules": _load_rules(sb, str(rulebook["id"]), user_id)}
            for rulebook in rulebooks
        ]
    }


@router.post("/rulebooks")
async def create_rulebook(
    body: RulebookCreate,
    user_id: str = Depends(get_current_user_id),
    user_jwt: str = Depends(get_current_user_token),
):
    rulebook, rules = _create_rulebook(get_user_client(user_jwt), body, user_id)
    return {**rulebook, "rules": rules}


async def _get_setup(sb: Any, setup_id: UUID, user_id: str) -> dict[str, Any]:
    try:
        result = (
            sb.table("setups")
            .select("*")
            .eq("id", str(setup_id))
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Setup review is temporarily unavailable") from exc
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Setup not found")
    return result.data


def _default_rulebook_body() -> RulebookCreate:
    return RulebookCreate(
        name="Starter discipline",
        description="Defined stop, written plan, minimum 1:2 R:R, and controlled risk.",
        min_planned_rr=DEFAULT_MIN_PLANNED_RR,
        is_default=True,
    )


def _get_or_create_default_rulebook(sb: Any, user_id: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    try:
        result = (
            sb.table("rulebooks")
            .select("*")
            .eq("user_id", user_id)
            .eq("is_default", True)
            .eq("active", True)
            .limit(1)
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Default rulebook is temporarily unavailable") from exc
    if result.data:
        rulebook = result.data
        rules = _load_rules(sb, str(rulebook["id"]), user_id)
        if rules:
            return rulebook, rules
        try:
            inserted = sb.table("rulebook_rules").insert(_rule_payloads(rulebook, user_id, None)).execute()
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Default rulebook rules are temporarily unavailable") from exc
        return rulebook, inserted.data or []
    return _create_rulebook(sb, _default_rulebook_body(), user_id)


def _review_response(
    *,
    evaluation: dict[str, Any],
    review: dict[str, Any],
    setup_id: UUID,
    rulebook_id: str,
    override_reason: str | None,
) -> dict[str, Any]:
    return {
        "id": evaluation.get("id"),
        "setup_id": str(setup_id),
        "rulebook_id": rulebook_id,
        "overall_status": review["overall_status"],
        "can_proceed": review["can_proceed"],
        "summary": review["summary"],
        "override_reason": override_reason,
        "results": review["results"],
        "input_snapshot": review["input_snapshot"],
        "evaluated_at": evaluation.get("evaluated_at"),
    }


@router.post("/setups/{setup_id}/review")
async def review_setup(
    setup_id: UUID,
    body: SetupReviewRequest | None = None,
    user_id: str = Depends(get_current_user_id),
    user_jwt: str = Depends(get_current_user_token),
):
    request = body or SetupReviewRequest()
    sb = get_user_client(user_jwt)
    setup = await _get_setup(sb, setup_id, user_id)
    if request.rulebook_id:
        rulebook = await _owned_rulebook(sb, request.rulebook_id, user_id)
        rules = _load_rules(sb, str(rulebook["id"]), user_id)
    else:
        rulebook, rules = _get_or_create_default_rulebook(sb, user_id)

    review = evaluate_setup(setup, rules, account_equity=request.account_equity)
    override_reason = request.override_reason.strip() if request.override_reason else None
    if review["overall_status"] == "warned" and override_reason:
        review["can_proceed"] = True
        review["summary"] = "Warnings acknowledged with an override reason."
    elif review["overall_status"] == "blocked":
        review["can_proceed"] = False

    evaluated_at = datetime.now(timezone.utc).isoformat()
    evaluation_payload = {
        "user_id": user_id,
        "setup_id": str(setup_id),
        "rulebook_id": str(rulebook["id"]),
        "overall_status": review["overall_status"],
        "can_proceed": review["can_proceed"],
        "override_reason": override_reason,
        "input_snapshot": review["input_snapshot"],
        "results": review["results"],
        "evaluated_at": evaluated_at,
    }
    try:
        evaluation_result = (
            sb.table("setup_rule_evaluations")
            .upsert(evaluation_payload, on_conflict="user_id,setup_id,rulebook_id")
            .execute()
        )
        sb.table("setups").update(
            {
                "rulebook_id": str(rulebook["id"]),
                "review_status": review["overall_status"],
                "last_reviewed_at": evaluated_at,
            }
        ).eq("id", str(setup_id)).eq("user_id", user_id).execute()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Setup review could not be recorded") from exc
    evaluation = (evaluation_result.data or [{}])[0]
    evaluation.setdefault("evaluated_at", evaluated_at)
    return _review_response(
        evaluation=evaluation,
        review=review,
        setup_id=setup_id,
        rulebook_id=str(rulebook["id"]),
        override_reason=override_reason,
    )


@router.get("/setups/{setup_id}/review")
async def get_setup_review(
    setup_id: UUID,
    user_id: str = Depends(get_current_user_id),
    user_jwt: str = Depends(get_current_user_token),
):
    sb = get_user_client(user_jwt)
    await _get_setup(sb, setup_id, user_id)
    try:
        result = (
            sb.table("setup_rule_evaluations")
            .select("*")
            .eq("setup_id", str(setup_id))
            .eq("user_id", user_id)
            .order("evaluated_at", desc=True)
            .limit(1)
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Setup review is temporarily unavailable") from exc
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Setup has not been evaluated")
    return result.data
