#!/usr/bin/env bash
# Stable CI entrypoint for the service-role usage guard.

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
exec python3 "$SCRIPT_DIR/check_service_role_usage.py" "$@"
