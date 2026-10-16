"""Immutable, owner-scoped structured chart snapshots for journal review."""

from __future__ import annotations

import json
import logging
import math
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any


logger = logging.getLogger(__name__)

SNAPSHOT_BUCKET = "trade-snapshots"
SNAPSHOT_VERSION = 1
MAX_SNAPSHOT_BYTES = 64 * 1024
MAX_NESTING_DEPTH = 8
MAX_TOTAL_ITEMS = 2_000
MAX_INDICATORS = 32
MAX_DRAWINGS = 250
ATTACH_WINDOW = timedelta(minutes=15)
MAX_CLIENT_CLOCK_SKEW = timedelta(minutes=5)

_REQUIRED_FIELDS = {
    "schema_version",
    "symbol",
    "timeframe",
    "range_label",
    "chart_type",
    "visible_range",
    "indicators",
    "drawings",
    "entry_price",
    "last_bar_time",
    "data_source",
    "data_mode",
    "data_as_of",
    "captured_at",
}
_STORED_ONLY_FIELDS = {"observed_at_client"}


class JournalSnapshotError(Exception):
    """Base error for the journal snapshot boundary."""


class JournalEntryNotFound(JournalSnapshotError):
    """Raised when an entry is absent or not owned by the caller."""


class InvalidJournalSnapshot(JournalSnapshotError):
    """Raised when snapshot state is malformed, mismatched, or too large."""


class JournalSnapshotUnavailable(JournalSnapshotError):
    """Raised when private storage cannot complete the requested operation."""


def _owned_entry(client: Any, user_id: str, entry_id: str) -> dict[str, Any]:
    result = (
        client.table("trade_journal")
        .select(
            "id,user_id,symbol,entry_price,created_at,snapshot_image_path,"
            "snapshot_state_path,snapshot_state_version,snapshot_captured_at"
        )
        .eq("id", entry_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not result.data:
        # Deliberately do not distinguish a missing entry from another user's entry.
        raise JournalEntryNotFound("Journal entry not found")
    return dict(result.data)


def _validate_text(state: dict[str, Any], field: str, max_length: int) -> None:
    value = state.get(field)
    if not isinstance(value, str) or not value.strip() or len(value) > max_length:
        raise InvalidJournalSnapshot(f"{field} must be a non-empty string up to {max_length} characters")


def _parse_timestamp(value: Any, field: str) -> datetime:
    if not isinstance(value, str) or not value.strip() or len(value) > 64:
        raise InvalidJournalSnapshot(f"{field} must be an ISO-8601 timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise InvalidJournalSnapshot(f"{field} must be an ISO-8601 timestamp") from exc
    if parsed.tzinfo is None:
        raise InvalidJournalSnapshot(f"{field} must include a timezone")
    return parsed.astimezone(UTC)


def _measure_structure(value: Any, depth: int = 0) -> int:
    if depth > MAX_NESTING_DEPTH:
        raise InvalidJournalSnapshot("Snapshot state is nested too deeply")
    if isinstance(value, dict):
        return len(value) + sum(_measure_structure(item, depth + 1) for item in value.values())
    if isinstance(value, list):
        return len(value) + sum(_measure_structure(item, depth + 1) for item in value)
    if isinstance(value, float) and not math.isfinite(value):
        raise InvalidJournalSnapshot("Snapshot state contains a non-finite number")
    if value is None or isinstance(value, (str, int, float, bool)):
        return 1
    raise InvalidJournalSnapshot("Snapshot state contains an unsupported value")


def validate_snapshot_state(
    raw_state: Any,
    expected_symbol: str,
    *,
    stored: bool = False,
) -> tuple[dict[str, Any], bytes]:
    """Validate and serialize a bounded V1 payload without retaining caller references."""
    if not isinstance(raw_state, dict):
        raise InvalidJournalSnapshot("state must be a JSON object")

    state = deepcopy(raw_state)
    missing = sorted(_REQUIRED_FIELDS.difference(state))
    if missing:
        raise InvalidJournalSnapshot(f"Snapshot state is missing required fields: {', '.join(missing)}")
    allowed_fields = _REQUIRED_FIELDS | (_STORED_ONLY_FIELDS if stored else set())
    unexpected = sorted(set(state).difference(allowed_fields))
    if unexpected:
        raise InvalidJournalSnapshot(f"Snapshot state contains unsupported fields: {', '.join(unexpected)}")
    if state.get("schema_version") != SNAPSHOT_VERSION:
        raise InvalidJournalSnapshot(f"Snapshot version must be {SNAPSHOT_VERSION}")

    _validate_text(state, "symbol", 32)
    if state["symbol"].strip().upper() != expected_symbol.strip().upper():
        raise InvalidJournalSnapshot("Snapshot symbol does not match the journal entry")
    state["symbol"] = expected_symbol.strip().upper()

    for field, max_length in {
        "timeframe": 24,
        "range_label": 32,
        "chart_type": 32,
        "data_source": 64,
    }.items():
        _validate_text(state, field, max_length)
    _parse_timestamp(state.get("captured_at"), "captured_at")
    if stored:
        _parse_timestamp(state.get("observed_at_client"), "observed_at_client")

    data_as_of = state.get("data_as_of")
    if data_as_of is not None and (
        not isinstance(data_as_of, str) or not data_as_of.strip() or len(data_as_of) > 64
    ):
        raise InvalidJournalSnapshot("data_as_of must be null or a non-empty string up to 64 characters")
    if state.get("data_mode") not in {"demo", "eod", "fallback", "live", "unknown"}:
        raise InvalidJournalSnapshot("data_mode must be demo, eod, fallback, live, or unknown")

    visible_range = state.get("visible_range")
    if visible_range is not None:
        if not isinstance(visible_range, dict) or set(visible_range) != {"from", "to"}:
            raise InvalidJournalSnapshot("visible_range must contain only from and to, or be null")
        for boundary in (visible_range["from"], visible_range["to"]):
            if not isinstance(boundary, (int, float)) or isinstance(boundary, bool) or not math.isfinite(float(boundary)):
                raise InvalidJournalSnapshot("visible_range boundaries must be finite numbers")
    if not isinstance(state.get("indicators"), list) or len(state["indicators"]) > MAX_INDICATORS:
        raise InvalidJournalSnapshot(f"indicators must contain at most {MAX_INDICATORS} items")
    if any(not isinstance(item, str) or not item.strip() or len(item) > 80 for item in state["indicators"]):
        raise InvalidJournalSnapshot("indicators must contain non-empty strings up to 80 characters")
    if not isinstance(state.get("drawings"), list) or len(state["drawings"]) > MAX_DRAWINGS:
        raise InvalidJournalSnapshot(f"drawings must contain at most {MAX_DRAWINGS} items")
    if any(not isinstance(item, dict) for item in state["drawings"]):
        raise InvalidJournalSnapshot("drawings must contain JSON objects")
    if not isinstance(state.get("entry_price"), (int, float)) or isinstance(state["entry_price"], bool):
        raise InvalidJournalSnapshot("entry_price must be a finite number")
    if not math.isfinite(float(state["entry_price"])) or float(state["entry_price"]) <= 0:
        raise InvalidJournalSnapshot("entry_price must be a positive finite number")
    if state.get("last_bar_time") is not None and (
        not isinstance(state["last_bar_time"], str)
        or not state["last_bar_time"].strip()
        or len(state["last_bar_time"]) > 64
    ):
        raise InvalidJournalSnapshot("last_bar_time must be a timestamp or null")

    if _measure_structure(state) > MAX_TOTAL_ITEMS:
        raise InvalidJournalSnapshot("Snapshot state contains too many values")
    try:
        encoded = json.dumps(
            state,
            allow_nan=False,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise InvalidJournalSnapshot("Snapshot state is not valid JSON") from exc
    if len(encoded) > MAX_SNAPSHOT_BYTES:
        raise InvalidJournalSnapshot(f"Snapshot state exceeds {MAX_SNAPSHOT_BYTES} bytes")
    return state, encoded


def _download_state(client: Any, path: str, expected_symbol: str) -> dict[str, Any]:
    try:
        payload = client.storage.from_(SNAPSHOT_BUCKET).download(path)
        if isinstance(payload, str):
            payload = payload.encode("utf-8")
        if not isinstance(payload, (bytes, bytearray)) or len(payload) > MAX_SNAPSHOT_BYTES:
            raise ValueError("invalid stored payload")
        decoded = json.loads(bytes(payload).decode("utf-8"))
        state, _ = validate_snapshot_state(decoded, expected_symbol, stored=True)
        return state
    except InvalidJournalSnapshot:
        raise
    except Exception as exc:
        raise JournalSnapshotUnavailable("Journal snapshot is temporarily unavailable") from exc


def read_snapshot(client: Any, user_id: str, entry_id: str) -> dict[str, Any] | None:
    """Return private structured state only after re-validating entry ownership."""
    entry = _owned_entry(client, user_id, entry_id)
    path = entry.get("snapshot_state_path")
    if not isinstance(path, str) or not path:
        return None
    expected_path = f"{user_id}/{entry_id}.json"
    if path != expected_path:
        logger.error("Unexpected journal snapshot path for entry %s", entry_id)
        raise JournalSnapshotUnavailable("Journal snapshot is temporarily unavailable")
    return _download_state(client, path, str(entry["symbol"]))


def _attest_snapshot_state(
    raw_state: Any,
    entry: dict[str, Any],
    now: datetime,
) -> tuple[dict[str, Any], bytes]:
    state, _ = validate_snapshot_state(raw_state, str(entry["symbol"]))
    try:
        client_price = Decimal(str(state["entry_price"]))
        journal_price = Decimal(str(entry["entry_price"]))
    except (InvalidOperation, KeyError, TypeError) as exc:
        raise InvalidJournalSnapshot("Journal entry price is unavailable") from exc
    if client_price != journal_price:
        raise InvalidJournalSnapshot("Snapshot entry_price does not match the journal entry")

    created_at = _parse_timestamp(entry.get("created_at"), "journal created_at")
    now_utc = now.astimezone(UTC)
    if created_at > now_utc + timedelta(minutes=1):
        raise InvalidJournalSnapshot("Journal creation time is in the future")
    if now_utc - created_at > ATTACH_WINDOW:
        raise InvalidJournalSnapshot("Snapshot attachment window has expired")

    observed_at = _parse_timestamp(state["captured_at"], "captured_at")
    if observed_at > now_utc + MAX_CLIENT_CLOCK_SKEW:
        raise InvalidJournalSnapshot("Client capture time is too far in the future")

    state["entry_price"] = float(journal_price)
    state["observed_at_client"] = state["captured_at"]
    state["captured_at"] = now_utc.isoformat().replace("+00:00", "Z")
    return validate_snapshot_state(state, str(entry["symbol"]), stored=True)


def _remove_unclaimed_object(client: Any, path: str, entry_id: str) -> None:
    try:
        client.storage.from_(SNAPSHOT_BUCKET).remove([path])
    except Exception:
        logger.warning("Could not clean up unclaimed journal snapshot for entry %s", entry_id)


def attach_snapshot(
    client: Any,
    user_id: str,
    entry_id: str,
    raw_state: Any,
    *,
    authorization_client: Any | None = None,
    now: datetime | None = None,
) -> tuple[dict[str, Any], bool]:
    """Attach exactly one JSON state object. A successful first write always wins."""
    scoped_client = authorization_client if authorization_client is not None else client
    entry = _owned_entry(scoped_client, user_id, entry_id)
    existing_path = entry.get("snapshot_state_path")
    if isinstance(existing_path, str) and existing_path:
        if existing_path != f"{user_id}/{entry_id}.json":
            logger.error("Unexpected journal snapshot path for entry %s", entry_id)
            raise JournalSnapshotUnavailable("Journal snapshot is temporarily unavailable")
        return _download_state(scoped_client, existing_path, str(entry["symbol"])), False

    state, encoded = _attest_snapshot_state(raw_state, entry, now or datetime.now(UTC))
    path = f"{user_id}/{entry_id}.json"
    uploaded = False
    try:
        client.storage.from_(SNAPSHOT_BUCKET).upload(
            path,
            encoded,
            {"content-type": "application/json", "upsert": "false"},
        )
        uploaded = True
    except Exception:
        # A concurrent/retried first write may already own the deterministic path.
        try:
            existing_state = _download_state(scoped_client, path, str(entry["symbol"]))
        except JournalSnapshotError as exc:
            raise JournalSnapshotUnavailable("Journal snapshot could not be saved") from exc
        state = existing_state

    update_error: Exception | None = None
    try:
        (
            client.table("trade_journal")
            .update({
                "snapshot_state_path": path,
                "snapshot_state_version": SNAPSHOT_VERSION,
                "snapshot_captured_at": state["captured_at"],
            })
            .eq("id", entry_id)
            .eq("user_id", user_id)
            .is_("snapshot_state_path", "null")
            .execute()
        )
    except Exception as exc:
        # The database may have committed before a transport failure. Re-read
        # before deciding whether the deterministic object is unclaimed.
        update_error = exc

    try:
        attached = _owned_entry(scoped_client, user_id, entry_id)
    except JournalEntryNotFound:
        if uploaded:
            _remove_unclaimed_object(client, path, entry_id)
        raise
    except Exception as exc:
        # Ownership/claim state is ambiguous. Preserve the private object for a
        # retry rather than deleting a snapshot that may already be committed.
        raise JournalSnapshotUnavailable("Journal snapshot attachment could not be confirmed") from exc

    if attached.get("snapshot_state_path") == path:
        return state, uploaded

    # A successful re-read proves this object was not claimed by the row.
    if uploaded:
        _remove_unclaimed_object(client, path, entry_id)
    if update_error is not None:
        raise JournalSnapshotUnavailable("Journal snapshot could not be attached") from update_error
    raise JournalSnapshotUnavailable("Journal snapshot could not be attached")


def owned_snapshot_paths(client: Any, user_id: str, entry_id: str) -> list[str]:
    """Return deterministic cleanup paths only after validating row ownership."""
    entry = _owned_entry(client, user_id, entry_id)
    return [
        path
        for path in (entry.get("snapshot_state_path"), entry.get("snapshot_image_path"))
        if isinstance(path, str) and path.startswith(f"{user_id}/{entry_id}.")
    ]


def remove_snapshot_paths_best_effort(
    client: Any,
    user_id: str,
    entry_id: str,
    paths: list[str],
) -> None:
    """Remove pre-authorized deterministic paths after the journal row is deleted."""
    safe_paths = [
        path
        for path in paths
        if isinstance(path, str) and path.startswith(f"{user_id}/{entry_id}.")
    ]
    if not safe_paths:
        return
    try:
        client.storage.from_(SNAPSHOT_BUCKET).remove(safe_paths)
    except Exception:
        logger.warning("Journal snapshot cleanup failed for entry %s", entry_id, exc_info=True)
