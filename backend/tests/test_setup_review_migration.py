from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
MIGRATION = REPO_ROOT / "supabase/migrations/20260820000002_rulebook_setup_review.sql"


def test_rulebook_and_setup_review_migration_is_owner_scoped() -> None:
    sql = " ".join(MIGRATION.read_text().lower().split())

    assert "create table if not exists public.rulebooks" in sql
    assert "create table if not exists public.rulebook_rules" in sql
    assert "create table if not exists public.setup_rule_evaluations" in sql
    assert "alter table public.rulebooks enable row level security" in sql
    assert "alter table public.rulebook_rules enable row level security" in sql
    assert "alter table public.setup_rule_evaluations enable row level security" in sql
    assert "create policy rulebooks_owner" in sql
    assert "create policy rulebook_rules_owner" in sql
    assert "create policy setup_rule_evaluations_owner" in sql
    assert "using ((select auth.uid()) = user_id)" in sql
    assert "with check ((select auth.uid()) = user_id)" in sql


def test_setup_review_migration_keeps_setup_and_evaluation_ownership_aligned() -> None:
    sql = " ".join(MIGRATION.read_text().lower().split())

    assert "foreign key (user_id, rulebook_id) references public.rulebooks (user_id, id)" in sql
    assert "foreign key (user_id, setup_id) references public.setups (user_id, id)" in sql
    assert "constraint setup_rule_evaluations_unique_run unique (user_id, setup_id, rulebook_id)" in sql
    assert "add column if not exists rulebook_id uuid" in sql
    assert "add column if not exists review_status text not null default 'not_evaluated'" in sql
    assert "review_status in ('not_evaluated', 'passed', 'warned', 'blocked')" in sql
