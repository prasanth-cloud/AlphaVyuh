import { describe, expect, it } from "vitest";
import { parseTradeReportCsv, sampleTradeReportCsv } from "@/lib/trade-report-import";

describe("trade report import", () => {
  it("parses a generic completed-trade CSV and computes trader analytics", () => {
    const result = parseTradeReportCsv(sampleTradeReportCsv());

    expect(result.summary.parsedTrades).toBe(4);
    expect(result.summary.rejectedRows).toBe(0);
    expect(result.summary.totalPnl).toBe(1990);
    expect(result.summary.wins).toBe(3);
    expect(result.summary.losses).toBe(1);
    expect(result.summary.winRate).toBe(75);
    expect(result.summary.profitFactor).toBeCloseTo(8.11, 2);
    expect(result.summary.payoffRatio).toBeCloseTo(2.7, 2);
    expect(result.summary.expectancy).toBe(497.5);
    expect(result.summary.totalCharges).toBe(153);
    expect(result.summary.averageChargePerTrade).toBe(38.25);
    expect(result.summary.chargesToGrossProfitPct).toBe(6.7);
    expect(result.summary.averageHoldingDays).toBe(4.8);
    expect(result.summary.largestSymbol).toBe("AUBANK");
    expect(result.summary.largestSymbolPnlSharePct).toBe(45.5);
    expect(result.summary.largestSymbolTradeSharePct).toBe(25);
    expect(result.summary.bestTrade?.symbol).toBe("AUBANK");
    expect(result.summary.worstTrade?.symbol).toBe("TCS");
    expect(result.summary.symbolBreakdown[0]).toMatchObject({ symbol: "AUBANK", pnl: 1160 });
  });

  it("calculates P&L from entry, exit, quantity, and side when no P&L column exists", () => {
    const result = parseTradeReportCsv(`Trading Symbol,Buy Date,Sell Date,Type,Qty,Buy Average,Sell Average
RELIANCE,01/05/2026,06/05/2026,buy,10,100,110
INFY,02/05/2026,03/05/2026,short,5,1500,1480`);

    expect(result.summary.parsedTrades).toBe(2);
    expect(result.summary.totalPnl).toBe(200);
    expect(result.summary.averageHoldingDays).toBe(3);
    expect(result.trades[0]).toMatchObject({ symbol: "RELIANCE", pnl: 100, entryDate: "2026-05-01" });
    expect(result.trades[1]).toMatchObject({ symbol: "INFY", pnl: 100, tradeType: "short" });
  });

  it("reports rejected rows instead of silently accepting unusable data", () => {
    const result = parseTradeReportCsv(`symbol,entry_date,quantity
RELIANCE,2026-05-01,10
,2026-05-02,4`);

    expect(result.summary.parsedTrades).toBe(0);
    expect(result.summary.rejectedRows).toBe(2);
    expect(result.rejected.map((row) => row.reason)).toEqual([
      "Missing P&L or entry/exit price data",
      "Missing symbol column",
    ]);
  });

  it("pairs broker tradebook BUY and SELL executions into closed trades", () => {
    const result = parseTradeReportCsv(`Trading Symbol,Trade Date,Transaction Type,Quantity,Price,Charges
RELIANCE,2026-05-01,BUY,10,100,5
RELIANCE,2026-05-02,BUY,10,110,5
RELIANCE,2026-05-05,SELL,20,120,10
INFY,2026-05-03,SELL,5,1500,4
INFY,2026-05-04,BUY,5,1480,4
TCS,2026-05-06,BUY,3,3800,3`);

    expect(result.summary.broker).toBe("Zerodha / Kite style CSV");
    expect(result.summary.totalRows).toBe(6);
    expect(result.summary.parsedTrades).toBe(2);
    expect(result.summary.rejectedRows).toBe(1);
    expect(result.summary.totalPnl).toBe(372);
    expect(result.summary.totalCharges).toBe(28);
    expect(result.summary.chargesToGrossProfitPct).toBe(7.5);
    expect(result.summary.averageHoldingDays).toBe(2.5);
    expect(result.trades.find((trade) => trade.symbol === "RELIANCE")).toMatchObject({
      symbol: "RELIANCE",
      tradeType: "long",
      quantity: 20,
      entryDate: "2026-05-01",
      exitDate: "2026-05-05",
      entryPrice: 105,
      exitPrice: 120,
      pnl: 280,
      charges: 20,
    });
    expect(result.trades.find((trade) => trade.symbol === "INFY")).toMatchObject({
      symbol: "INFY",
      tradeType: "short",
      quantity: 5,
      entryDate: "2026-05-03",
      exitDate: "2026-05-04",
      entryPrice: 1500,
      exitPrice: 1480,
      pnl: 92,
      charges: 8,
    });
    expect(result.rejected[0]).toMatchObject({ row: 7, reason: "Unmatched open execution row" });
  });

  it("handles partial exits from a broker tradebook", () => {
    const result = parseTradeReportCsv(`symbol,date,side,quantity,price
RELIANCE,2026-05-01,BUY,10,100
RELIANCE,2026-05-03,SELL,4,110
RELIANCE,2026-05-04,SELL,6,105`);

    expect(result.summary.parsedTrades).toBe(2);
    expect(result.summary.rejectedRows).toBe(0);
    expect(result.summary.totalPnl).toBe(70);
    expect(result.trades).toEqual([
      expect.objectContaining({ symbol: "RELIANCE", tradeType: "long", quantity: 4, entryPrice: 100, exitPrice: 110, pnl: 40 }),
      expect.objectContaining({ symbol: "RELIANCE", tradeType: "long", quantity: 6, entryPrice: 100, exitPrice: 105, pnl: 30 }),
    ]);
  });

  it("rejects execution rows that cannot be paired into closed trades", () => {
    const result = parseTradeReportCsv(`symbol,date,side,quantity,price
RELIANCE,2026-05-01,BUY,10,100
INFY,2026-05-02,SELL,5,1500
TCS,,BUY,3,3800`);

    expect(result.summary.parsedTrades).toBe(0);
    expect(result.summary.rejectedRows).toBe(3);
    expect(result.rejected.map((row) => row.reason)).toEqual([
      "Missing execution date",
      "Unmatched open execution row",
      "Unmatched open execution row",
    ]);
  });

  it("surfaces concentration and cost drag for skewed reports", () => {
    const result = parseTradeReportCsv(`symbol,entry_date,exit_date,trade_type,quantity,entry_price,exit_price,pnl,charges
RELIANCE,2026-05-01,2026-05-02,long,10,100,110,100,35
RELIANCE,2026-05-03,2026-05-04,long,10,100,112,120,40
TCS,2026-05-05,2026-05-06,long,10,200,199,-10,5`);

    expect(result.summary.totalCharges).toBe(80);
    expect(result.summary.averageChargePerTrade).toBe(26.67);
    expect(result.summary.chargesToGrossProfitPct).toBe(36.4);
    expect(result.summary.largestSymbol).toBe("RELIANCE");
    expect(result.summary.largestSymbolPnlSharePct).toBe(95.7);
    expect(result.summary.largestSymbolTradeSharePct).toBe(66.7);
  });
});
