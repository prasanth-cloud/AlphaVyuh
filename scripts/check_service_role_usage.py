#!/usr/bin/env python3
"""Reject newly introduced unscoped service-role usage in router changes."""

from __future__ import annotations

import ast
from collections import Counter
from dataclasses import dataclass
import os
from pathlib import Path
import subprocess
import sys
from typing import Iterable


ROUTERS_DIR = "backend/app/routers"
FULLY_ADMIN = {"stocks.py", "community.py", "waitlist.py"}
SERVICE_ROLE_KEYS = {"SUPABASE_SERVICE_ROLE_KEY", "supabase_service_role_key"}


class GuardError(RuntimeError):
    """Raised when the requested Git comparison cannot be audited safely."""


@dataclass(frozen=True)
class RouterChange:
    base_path: str | None
    head_path: str | None


@dataclass
class Usage:
    admin_calls: Counter[tuple[str, str]]
    user_call_contexts: set[str]
    direct_keys: Counter[tuple[str, str]]


def git(*args: str, text: bool = True) -> str | bytes:
    result = subprocess.run(
        ["git", *args],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=text,
    )
    if result.returncode != 0:
        stderr = result.stderr if text else result.stderr.decode("utf-8", "replace")
        raise GuardError(f"git {' '.join(args)} failed: {stderr.strip()}")
    return result.stdout


def resolve_commit(ref: str, label: str) -> str:
    try:
        return str(git("rev-parse", "--verify", f"{ref}^{{commit}}")).strip()
    except GuardError as error:
        raise GuardError(f"{label} '{ref}' is not available in this checkout") from error


def comparison_refs() -> tuple[str | None, str, str]:
    base_ref = os.environ.get("SERVICE_ROLE_BASE_REF", "").strip()
    head_ref = os.environ.get("SERVICE_ROLE_HEAD_REF", "HEAD").strip() or "HEAD"
    event_name = os.environ.get("SERVICE_ROLE_EVENT_NAME", "").strip()
    head = resolve_commit(head_ref, "SERVICE_ROLE_HEAD_REF")
    if not base_ref:
        return None, head, event_name

    base = resolve_commit(base_ref, "SERVICE_ROLE_BASE_REF")
    if event_name == "pull_request":
        base = str(git("merge-base", base, head)).strip()
        if not base:
            raise GuardError(f"no merge base exists between {base_ref} and {head_ref}")
    return base, head, event_name


def changed_routers(base: str, head: str) -> list[RouterChange]:
    raw = git(
        "diff",
        "--name-status",
        "-z",
        "--find-renames",
        base,
        head,
        "--",
        f"{ROUTERS_DIR}/*.py",
        text=False,
    )
    fields = raw.decode("utf-8", "surrogateescape").split("\0")
    if fields and fields[-1] == "":
        fields.pop()

    changes: list[RouterChange] = []
    index = 0
    while index < len(fields):
        status = fields[index]
        index += 1
        kind = status[0]
        if kind in {"R", "C"}:
            old_path, new_path = fields[index : index + 2]
            index += 2
            changes.append(RouterChange(old_path, new_path))
        else:
            path = fields[index]
            index += 1
            if kind == "D":
                changes.append(RouterChange(path, None))
            elif kind == "A":
                changes.append(RouterChange(None, path))
            else:
                changes.append(RouterChange(path, path))
    return changes


def read_at(ref: str, path: str | None) -> str:
    if path is None:
        return ""
    result = subprocess.run(
        ["git", "show", f"{ref}:{path}"],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if result.returncode != 0:
        raise GuardError(f"cannot read {ref}:{path}: {result.stderr.strip()}")
    return result.stdout


class UsageVisitor(ast.NodeVisitor):
    def __init__(
        self,
        parents: dict[ast.AST, ast.AST],
        admin_aliases: set[str],
        user_aliases: set[str],
    ) -> None:
        self.parents = parents
        self.admin_aliases = admin_aliases
        self.user_aliases = user_aliases
        self.context: list[str] = []
        self.admin_calls: Counter[tuple[str, str]] = Counter()
        self.user_call_contexts: set[str] = set()
        self.direct_keys: Counter[tuple[str, str]] = Counter()

    @property
    def context_name(self) -> str:
        return ".".join(self.context) if self.context else "<module>"

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        self.generic_visit(node)

    def fingerprint(self, node: ast.AST) -> tuple[str, str]:
        statement: ast.AST = node
        while statement in self.parents and not isinstance(statement, ast.stmt):
            statement = self.parents[statement]
        return self.context_name, ast.dump(statement, include_attributes=False)

    def _visit_scope(self, node: ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef) -> None:
        self.context.append(node.name)
        self.generic_visit(node)
        self.context.pop()

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self._visit_scope(node)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        self._visit_scope(node)

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        self._visit_scope(node)

    def visit_Call(self, node: ast.Call) -> None:
        name = call_name(node.func)
        fingerprint = self.fingerprint(node)
        if name in self.admin_aliases or name == "get_admin_client":
            self.admin_calls[fingerprint] += 1
        if name in self.user_aliases or name == "get_user_client":
            self.user_call_contexts.add(self.context_name)
        self.generic_visit(node)

    def visit_Name(self, node: ast.Name) -> None:
        if node.id in SERVICE_ROLE_KEYS:
            self.direct_keys[self.fingerprint(node)] += 1

    def visit_Attribute(self, node: ast.Attribute) -> None:
        if node.attr in SERVICE_ROLE_KEYS:
            self.direct_keys[self.fingerprint(node)] += 1
        self.generic_visit(node)

    def visit_Constant(self, node: ast.Constant) -> None:
        if isinstance(node.value, str) and node.value in SERVICE_ROLE_KEYS:
            self.direct_keys[self.fingerprint(node)] += 1


def call_name(node: ast.expr) -> str | None:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return node.attr
    return None


def analyze(source: str, label: str) -> Usage:
    if not source:
        return Usage(Counter(), set(), Counter())
    try:
        tree = ast.parse(source, filename=label)
    except SyntaxError as error:
        raise GuardError(f"cannot parse {label}: {error}") from error
    parents = {child: parent for parent in ast.walk(tree) for child in ast.iter_child_nodes(parent)}
    admin_aliases = {"get_admin_client"}
    user_aliases = {"get_user_client"}
    for node in ast.walk(tree):
        if not isinstance(node, ast.ImportFrom):
            continue
        for imported in node.names:
            alias = imported.asname or imported.name
            if imported.name == "get_admin_client":
                admin_aliases.add(alias)
            elif imported.name == "get_user_client":
                user_aliases.add(alias)
    visitor = UsageVisitor(parents, admin_aliases, user_aliases)
    visitor.visit(tree)
    return Usage(visitor.admin_calls, visitor.user_call_contexts, visitor.direct_keys)


def additions(
    head: Counter[tuple[str, str]], base: Counter[tuple[str, str]]
) -> Iterable[tuple[str, str]]:
    return (head - base).elements()


def audit_incremental(base: str, head: str) -> list[str]:
    violations: list[str] = []
    for change in changed_routers(base, head):
        if change.head_path is None:
            continue

        base_usage = analyze(read_at(base, change.base_path), f"{base}:{change.base_path}")
        head_usage = analyze(read_at(head, change.head_path), f"{head}:{change.head_path}")

        if Path(change.head_path).name not in FULLY_ADMIN:
            new_admin = list(additions(head_usage.admin_calls, base_usage.admin_calls))
            unscoped = [
                context
                for context, _ in new_admin
                if context not in head_usage.user_call_contexts
            ]
            if unscoped:
                contexts = ", ".join(sorted(set(unscoped)))
                violations.append(
                    f"{change.head_path} adds get_admin_client() without get_user_client() "
                    f"in the same scope ({contexts})"
                )

        if list(additions(head_usage.direct_keys, base_usage.direct_keys)):
            violations.append(f"{change.head_path} adds a direct service-role-key reference")
    return violations


def audit_full_tree(head: str) -> list[str]:
    violations: list[str] = []
    for path in sorted(Path(ROUTERS_DIR).glob("*.py")):
        usage = analyze(path.read_text(encoding="utf-8"), str(path))
        if path.name not in FULLY_ADMIN:
            unscoped = [
                context
                for context, _ in usage.admin_calls.elements()
                if context not in usage.user_call_contexts
            ]
            if unscoped:
                violations.append(
                    f"{path} uses get_admin_client() without get_user_client() "
                    "in the same scope"
                )
        if usage.direct_keys:
            violations.append(f"{path} references a service-role key directly")
    return violations


def main() -> int:
    try:
        base, head, _event_name = comparison_refs()
        violations = audit_incremental(base, head) if base else audit_full_tree(head)
    except GuardError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1

    for violation in violations:
        print(f"ERROR: {violation}")
    if violations:
        print(f"\nFound {len(violations)} new service-role violation(s).")
        print("User-facing router changes must use an RLS-respecting client in the same scope.")
        return 1

    if base:
        print("OK: Changed routers add no unscoped service-role usage.")
    else:
        print("OK: Full-tree audit found no unscoped service-role usage.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
