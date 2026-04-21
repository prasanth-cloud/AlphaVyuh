"""Kite Connect v3 raw response models. Not imported outside this package."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel


class KiteProfile(BaseModel):
    user_id: str
    user_name: str
    email: str
    user_type: str
    broker: str


class KiteHolding(BaseModel):
    tradingsymbol: str
    exchange: Literal["NSE", "BSE"]
    quantity: int
    average_price: float
    last_price: float
    pnl: float
    day_change: float
    day_change_percentage: float
    t1_quantity: int
    collateral_quantity: int


class KitePosition(BaseModel):
    tradingsymbol: str
    exchange: Literal["NSE", "BSE"]
    quantity: int
    average_price: float
    pnl: float
    day_pnl: float
    product: str


class KiteOrderStatus(BaseModel):
    order_id: str
    status: str
    status_message: Optional[str] = None
    tradingsymbol: str
    exchange: str
    transaction_type: str
    order_type: str
    quantity: int
    price: float
    trigger_price: float
    average_price: float
    pending_quantity: int
    filled_quantity: int
    variety: str
    product: str
    validity: str
    tag: Optional[str] = None
    parent_order_id: Optional[str] = None


class KiteTrade(BaseModel):
    trade_id: str
    order_id: str
    exchange_order_id: Optional[str] = None
    tradingsymbol: str
    exchange: str
    transaction_type: str
    quantity: int
    price: float
    fill_timestamp: str


class KiteOrderResult(BaseModel):
    order_id: str


class KiteSessionResponse(BaseModel):
    access_token: str
    public_token: str
    login_time: str
