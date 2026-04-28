import pytest
import pandas as pd

from app.services.market_data import (
    KiteMarketDataProvider,
    MarketIdentity,
    MockMarketDataProvider,
    PlaceholderLicensedProvider,
    ProviderNotConfiguredError,
    YahooMarketDataProvider,
    get_market_data_provider,
)


def test_market_data_provider_defaults_to_yahoo(monkeypatch):
    monkeypatch.delenv("MARKET_DATA_PROVIDER", raising=False)

    provider = get_market_data_provider()

    assert isinstance(provider, YahooMarketDataProvider)
    assert provider.name == "yahoo_finance"


def test_market_data_provider_selects_mock(monkeypatch):
    monkeypatch.setenv("MARKET_DATA_PROVIDER", "mock")

    provider = get_market_data_provider()

    assert isinstance(provider, MockMarketDataProvider)
    assert provider.name == "mock"


@pytest.mark.parametrize("name", ["kite", "zerodha"])
def test_market_data_provider_selects_kite(monkeypatch, name):
    monkeypatch.setenv("MARKET_DATA_PROVIDER", name)

    provider = get_market_data_provider()

    assert isinstance(provider, KiteMarketDataProvider)
    assert provider.name == "kite"


@pytest.mark.parametrize("name", ["truedata", "globaldatafeeds"])
def test_market_data_provider_selects_placeholder_for_licensed_sources(monkeypatch, name):
    monkeypatch.setenv("MARKET_DATA_PROVIDER", name)

    provider = get_market_data_provider()

    assert isinstance(provider, PlaceholderLicensedProvider)
    assert provider.name == name


def test_market_data_provider_rejects_unknown_provider(monkeypatch):
    monkeypatch.setenv("MARKET_DATA_PROVIDER", "unknown_vendor")

    with pytest.raises(ProviderNotConfiguredError):
        get_market_data_provider()


def test_kite_provider_maps_common_index_aliases(monkeypatch):
    instruments = pd.DataFrame([
        {
            "instrument_token": 256265,
            "exchange": "NSE",
            "tradingsymbol": "NIFTY 50",
            "name": "NIFTY 50",
        }
    ])
    monkeypatch.setattr("app.services.market_data._kite_instruments", lambda exchange: instruments)

    instrument = KiteMarketDataProvider()._instrument("NIFTY", MarketIdentity())

    assert instrument["instrument_token"] == 256265
    assert instrument["tradingsymbol"] == "NIFTY 50"
