from __future__ import annotations

import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest


REPO_ROOT = Path(__file__).resolve().parents[2]
CHECKER = REPO_ROOT / "scripts" / "check-service-role-usage.sh"


class ServiceRoleGuardTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.repo = Path(self.temp_dir.name)
        subprocess.run(["git", "init", "-q", "-b", "main"], cwd=self.repo, check=True)
        subprocess.run(
            ["git", "config", "user.email", "guard@example.com"],
            cwd=self.repo,
            check=True,
        )
        subprocess.run(
            ["git", "config", "user.name", "Guard Test"],
            cwd=self.repo,
            check=True,
        )
        (self.repo / "backend/app/routers").mkdir(parents=True)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def write_router(self, name: str, source: str) -> None:
        (self.repo / "backend/app/routers" / name).write_text(
            textwrap.dedent(source), encoding="utf-8"
        )

    def commit(self, message: str) -> str:
        subprocess.run(["git", "add", "-A"], cwd=self.repo, check=True)
        subprocess.run(["git", "commit", "-q", "-m", message], cwd=self.repo, check=True)
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=self.repo, text=True
        ).strip()

    def run_guard(self, base: str, event: str = "push") -> subprocess.CompletedProcess[str]:
        env = os.environ.copy()
        env.update(
            SERVICE_ROLE_BASE_REF=base,
            SERVICE_ROLE_HEAD_REF="HEAD",
            SERVICE_ROLE_EVENT_NAME=event,
        )
        return subprocess.run(
            ["bash", str(CHECKER)],
            cwd=self.repo,
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            check=False,
        )

    def make_legacy_base(self) -> str:
        self.write_router(
            "legacy.py",
            """
            from app.db import get_admin_client

            def old_system_task():
                return get_admin_client()
            """,
        )
        return self.commit("base")

    def test_unchanged_legacy_router_passes(self) -> None:
        base = self.make_legacy_base()
        self.write_router("other.py", "def route():\n    return 1\n")
        self.commit("unrelated router")
        self.assertEqual(self.run_guard(base).returncode, 0)

    def test_new_admin_call_fails_even_with_user_name_in_comment(self) -> None:
        base = self.make_legacy_base()
        path = self.repo / "backend/app/routers/legacy.py"
        path.write_text(
            path.read_text()
            + "\n# get_user_client\ndef unsafe_route():\n    return get_admin_client()\n"
        )
        self.commit("unsafe")
        result = self.run_guard(base)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("unsafe_route", result.stdout)

    def test_equal_total_call_count_moved_to_new_scope_fails(self) -> None:
        base = self.make_legacy_base()
        self.write_router(
            "legacy.py",
            """
            from app.db import get_admin_client

            def unsafe_user_route():
                return get_admin_client()
            """,
        )
        self.commit("move privileged call")
        self.assertNotEqual(self.run_guard(base).returncode, 0)

    def test_equal_total_call_count_repurposed_in_same_scope_fails(self) -> None:
        self.write_router(
            "legacy.py",
            """
            from app.db import get_admin_client

            def route():
                maintenance_db = get_admin_client()
                return maintenance_db
            """,
        )
        base = self.commit("base")
        self.write_router(
            "legacy.py",
            """
            from app.db import get_admin_client

            def route():
                user_records = get_admin_client().table("users").select("*").execute()
                return user_records
            """,
        )
        self.commit("repurpose privileged call")
        self.assertNotEqual(self.run_guard(base).returncode, 0)

    def test_two_calls_on_one_line_are_counted_as_two(self) -> None:
        base = self.make_legacy_base()
        self.write_router(
            "legacy.py",
            """
            from app.db import get_admin_client

            def old_system_task():
                return get_admin_client()

            def unsafe_route():
                return get_admin_client(), get_admin_client()
            """,
        )
        self.commit("two calls")
        self.assertNotEqual(self.run_guard(base).returncode, 0)

    def test_admin_and_user_calls_in_same_scope_pass(self) -> None:
        base = self.make_legacy_base()
        self.write_router(
            "legacy.py",
            """
            from app.db import get_admin_client, get_user_client

            def old_system_task():
                return get_admin_client()

            def migrated_route(jwt):
                user_db = get_user_client(jwt)
                plan_db = get_admin_client()
                return user_db, plan_db
            """,
        )
        self.commit("mixed scoped route")
        self.assertEqual(self.run_guard(base).returncode, 0)

    def test_direct_key_relocated_to_new_scope_fails(self) -> None:
        self.write_router("legacy.py", "def old():\n    return SUPABASE_SERVICE_ROLE_KEY\n")
        base = self.commit("base")
        self.write_router("legacy.py", "def unsafe():\n    return SUPABASE_SERVICE_ROLE_KEY\n")
        self.commit("move key")
        self.assertNotEqual(self.run_guard(base).returncode, 0)

    def test_direct_key_in_fully_admin_router_still_fails(self) -> None:
        self.write_router("stocks.py", "def public_route():\n    return 1\n")
        base = self.commit("base")
        self.write_router(
            "stocks.py", "def public_route():\n    return SUPABASE_SERVICE_ROLE_KEY\n"
        )
        self.commit("direct key")
        self.assertNotEqual(self.run_guard(base).returncode, 0)

    def test_pure_rename_passes_but_rename_with_new_call_fails(self) -> None:
        base = self.make_legacy_base()
        old = self.repo / "backend/app/routers/legacy.py"
        new = self.repo / "backend/app/routers/renamed.py"
        old.rename(new)
        self.commit("rename")
        self.assertEqual(self.run_guard(base).returncode, 0)

        new.write_text(new.read_text() + "\ndef unsafe():\n    return get_admin_client()\n")
        self.commit("unsafe after rename")
        self.assertNotEqual(self.run_guard(base).returncode, 0)

    def test_deleted_router_passes(self) -> None:
        base = self.make_legacy_base()
        (self.repo / "backend/app/routers/legacy.py").unlink()
        self.commit("delete")
        self.assertEqual(self.run_guard(base).returncode, 0)

    def test_pull_request_uses_merge_base_when_base_advanced(self) -> None:
        base = self.make_legacy_base()
        subprocess.run(["git", "checkout", "-q", "-b", "feature"], cwd=self.repo, check=True)
        self.write_router("feature.py", "def route():\n    return 1\n")
        self.commit("feature")
        subprocess.run(["git", "checkout", "-q", "main"], cwd=self.repo, check=True)
        self.write_router("base_only.py", "def route():\n    return 2\n")
        advanced_base = self.commit("advance base")
        subprocess.run(["git", "checkout", "-q", "feature"], cwd=self.repo, check=True)
        self.assertEqual(self.run_guard(advanced_base, event="pull_request").returncode, 0)
        self.assertNotEqual(base, advanced_base)

    def test_missing_base_fails_closed(self) -> None:
        self.make_legacy_base()
        result = self.run_guard("0" * 40)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("not available", result.stdout)


if __name__ == "__main__":
    unittest.main()
