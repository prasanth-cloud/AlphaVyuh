import pytest

from app.services.market_data import (
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


@pytest.mark.parametrize("name", ["kite", "truedata", "globaldatafeeds"])
def test_market_data_provider_selects_placeholder_for_licensed_sources(monkeypatch, name):
    monkeypatch.setenv("MARKET_DATA_PROVIDER", name)

    provider = get_market_data_provider()

    assert isinstance(provider, PlaceholderLicensedProvider)
    assert provider.name == name


def test_market_data_provider_rejects_unknown_provider(monkeypatch):
    monkeypatch.setenv("MARKET_DATA_PROVIDER", "unknown_vendor")

    with pytest.raises(ProviderNotConfiguredError):
        get_market_data_provider()
