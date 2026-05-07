"""Broker adapter factory. Returns the correct adapter for a given broker ID."""
from __future__ import annotations

import os

from app.brokers.adapter import BrokerAdapter, BrokerId


def get_adapter(broker_id: BrokerId) -> BrokerAdapter:
    if os.environ.get("MOCK_BROKER") == "1":
        from app.brokers.mock.adapter import MockAdapter
        return MockAdapter()

    if broker_id == "zerodha":
        from app.brokers.kite.adapter import KiteAdapter
        return KiteAdapter()

    if broker_id == "upstox":
        from app.brokers.upstox.adapter import UpstoxAdapter
        return UpstoxAdapter()

    raise NotImplementedError(f"No adapter implemented for broker: {broker_id!r}")
