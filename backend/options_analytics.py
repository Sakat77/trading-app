"""
options_analytics.py — closed per-TF trade analytics.
Reuses build_options_trades() for pairing; never re-implements it.
"""
from collections import defaultdict
from options_trades import build_options_trades
from tz import parse_bar_time


# ─── per-trade helpers ────────────────────────────────────────────────────────

def _holding_min(trade):
    try:
        t_buy  = parse_bar_time(trade["buy_iso"])
        t_sell = parse_bar_time(trade["sell_iso"])
        return round((t_sell - t_buy).total_seconds() / 60, 1)
    except Exception:
        return None


def _trade_ref(trade, hmin):
    return {
        "symbol":      trade.get("symbol", ""),
        "leg":         trade.get("leg", ""),
        "strike":      trade.get("strike"),
        "timeframe":   trade.get("timeframe", ""),
        "buy_time":    trade.get("buy_time", ""),
        "sell_time":   trade.get("sell_time", ""),
        "pl":          trade.get("pl"),
        "pl_pct":      trade.get("pl_pct"),
        "holding_min": hmin,
    }


# ─── bucket-level metric helpers ─────────────────────────────────────────────

def _counts(trades):
    wins   = [t for t in trades if (t.get("pl") or 0) > 0]
    losses = [t for t in trades if (t.get("pl") or 0) < 0]
    be     = [t for t in trades if (t.get("pl") or 0) == 0]
    return wins, losses, be


def _pl_stats(wins, losses, total):
    gross_profit  = round(sum(t["pl"] for t in wins),   2)
    gross_loss    = round(sum(t["pl"] for t in losses), 2)
    net           = round(gross_profit + gross_loss,    2)
    win_rate      = round(len(wins) / total * 100,      1) if total else 0.0
    avg_win       = round(gross_profit / len(wins),     2) if wins   else None
    avg_loss      = round(gross_loss   / len(losses),   2) if losses else None
    profit_factor = round(gross_profit / abs(gross_loss), 2) if gross_loss < 0 else None
    expectancy    = round(net / total, 2) if total else 0.0
    return gross_profit, gross_loss, net, win_rate, avg_win, avg_loss, profit_factor, expectancy


def _holding_stats(trades):
    pairs = [(t, _holding_min(t)) for t in trades if t.get("sell_iso") and t.get("buy_iso")]
    pairs = [(t, m) for t, m in pairs if m is not None]
    if not pairs:
        return None, None, None
    avg_h    = round(sum(m for _, m in pairs) / len(pairs), 1)
    shortest = min(pairs, key=lambda x: x[1])
    longest  = max(pairs, key=lambda x: x[1])
    return avg_h, shortest, longest


def _top10(trades):
    with_h  = [(t, _holding_min(t)) for t in trades]
    hmap    = {id(t): m for t, m in with_h}
    by_pl   = sorted(trades, key=lambda t: t.get("pl") or 0, reverse=True)
    winners = [_trade_ref(t, hmap.get(id(t))) for t in by_pl if (t.get("pl") or 0) > 0][:10]
    losers  = [_trade_ref(t, hmap.get(id(t))) for t in reversed(by_pl) if (t.get("pl") or 0) < 0][:10]
    return winners, losers


def _equity_curve(trades):
    cum = 0.0
    curve = []
    for t in sorted(trades, key=lambda t: t.get("sell_iso") or ""):
        cum = round(cum + (t.get("pl") or 0), 2)
        curve.append({"t": t.get("sell_iso", ""), "cum_pl": cum})
    return curve


def _ce_vs_pe(trades):
    result = {}
    for leg in ("CE", "PE"):
        leg_t = [t for t in trades if t.get("leg") == leg]
        result[leg] = {
            "count": len(leg_t),
            "net":   round(sum(t.get("pl") or 0 for t in leg_t), 2),
        }
    return result


def _by_symbol(trades):
    sym_map = defaultdict(float)
    for t in trades:
        sym_map[t.get("symbol", "")] += t.get("pl") or 0
    sym_map = {s: round(v, 2) for s, v in sym_map.items()}
    ranked  = sorted(sym_map.items(), key=lambda x: x[1], reverse=True)
    best  = [{"symbol": s, "net": v} for s, v in ranked[:5]]
    worst = [{"symbol": s, "net": v} for s, v in ranked[-5:][::-1]] if len(ranked) > 5 else []
    return best, worst


def _pl_histogram(trades):
    pls = [t.get("pl") or 0 for t in trades]
    return [
        {"range": "<-50",     "count": sum(1 for p in pls if p < -50)},
        {"range": "-50..-20", "count": sum(1 for p in pls if -50 <= p < -20)},
        {"range": "-20..0",   "count": sum(1 for p in pls if -20 <= p < 0)},
        {"range": "0..20",    "count": sum(1 for p in pls if 0 <= p < 20)},
        {"range": "20..50",   "count": sum(1 for p in pls if 20 <= p < 50)},
        {"range": ">50",      "count": sum(1 for p in pls if p >= 50)},
    ]


def _by_hour(trades):
    hour_map = defaultdict(lambda: {"count": 0, "net": 0.0})
    for t in trades:
        try:
            h = parse_bar_time(t["buy_iso"]).hour
            hour_map[h]["count"] += 1
            hour_map[h]["net"]   += t.get("pl") or 0
        except Exception:
            pass
    return [{"hour": h, "count": hour_map[h]["count"], "net": round(hour_map[h]["net"], 2)}
            for h in sorted(hour_map)]


def _insights(total, wins, losses, win_rate, net, profit_factor, avg_holding, cevpe, best_syms):
    if total == 0:
        return ["No closed trades to analyse yet."]
    out = []

    if win_rate >= 60:
        out.append(f"Strong win rate of {win_rate:.1f}% across {total} closed trades.")
    elif win_rate >= 50:
        out.append(f"Win rate of {win_rate:.1f}% — slightly more winners than losers over {total} trades.")
    else:
        out.append(f"Win rate of {win_rate:.1f}% is below 50% over {total} closed trades; review entry signals.")

    if net > 0 and profit_factor and profit_factor >= 1.5:
        out.append(f"Net P/L +{net:.2f} with profit factor {profit_factor:.2f} — winners are substantially larger than losers.")
    elif net > 0:
        out.append(f"Strategy is profitable: net P/L +{net:.2f}.")
    elif net < 0:
        out.append(f"Net P/L {net:.2f}; losses currently outweigh gains on this bucket.")

    ce_net = cevpe.get("CE", {}).get("net", 0)
    pe_net = cevpe.get("PE", {}).get("net", 0)
    if abs(ce_net - pe_net) > 1:
        leader = "CE" if ce_net > pe_net else "PE"
        lval   = ce_net if ce_net > pe_net else pe_net
        out.append(f"{leader} trades outperform the other leg (net {lval:+.2f}); consider biasing entries.")

    if avg_holding is not None:
        if avg_holding >= 1440:
            hold_str = f"{avg_holding/1440:.1f} days"
        elif avg_holding >= 60:
            hold_str = f"{avg_holding/60:.1f} hours"
        else:
            hold_str = f"{avg_holding:.0f} minutes"
        out.append(f"Average holding time is {hold_str} per trade.")

    if best_syms:
        top = best_syms[0]
        out.append(f"Top contributing symbol: {top['symbol']} with net P/L {top['net']:+.2f}.")

    return out[:5]


def _empty_bucket():
    return {
        "wins": 0, "losses": 0, "breakeven": 0, "total": 0, "win_rate": 0.0,
        "net": 0.0, "gross_profit": 0.0, "gross_loss": 0.0,
        "avg_win": None, "avg_loss": None, "profit_factor": None, "expectancy": 0.0,
        "avg_holding": None, "shortest": None, "longest": None,
        "top_winners": [], "top_losers": [], "equity_curve": [],
        "ce_vs_pe": {"CE": {"count": 0, "net": 0.0}, "PE": {"count": 0, "net": 0.0}},
        "best_symbols": [], "worst_symbols": [],
        "pl_histogram": [
            {"range": "<-50", "count": 0}, {"range": "-50..-20", "count": 0},
            {"range": "-20..0", "count": 0}, {"range": "0..20", "count": 0},
            {"range": "20..50", "count": 0}, {"range": ">50", "count": 0},
        ],
        "by_hour": [],
        "insights": ["No closed trades to analyse yet."],
    }


def _compute_bucket(trades):
    if not trades:
        return _empty_bucket()

    total = len(trades)
    wins, losses, be = _counts(trades)
    gross_profit, gross_loss, net, win_rate, avg_win, avg_loss, profit_factor, expectancy = \
        _pl_stats(wins, losses, total)
    avg_h, shortest_pair, longest_pair = _holding_stats(trades)
    top_win, top_loss = _top10(trades)
    cevpe = _ce_vs_pe(trades)
    best_syms, worst_syms = _by_symbol(trades)
    insights_list = _insights(total, wins, losses, win_rate, net, profit_factor, avg_h, cevpe, best_syms)

    def _hm_ref(pair):
        if pair is None:
            return None
        t, m = pair
        return {**_trade_ref(t, m), "min": m}

    return {
        "wins":          len(wins),
        "losses":        len(losses),
        "breakeven":     len(be),
        "total":         total,
        "win_rate":      win_rate,
        "net":           net,
        "gross_profit":  gross_profit,
        "gross_loss":    gross_loss,
        "avg_win":       avg_win,
        "avg_loss":      avg_loss,
        "profit_factor": profit_factor,
        "expectancy":    expectancy,
        "avg_holding":   avg_h,
        "shortest":      _hm_ref(shortest_pair),
        "longest":       _hm_ref(longest_pair),
        "top_winners":   top_win,
        "top_losers":    top_loss,
        "equity_curve":  _equity_curve(trades),
        "ce_vs_pe":      cevpe,
        "best_symbols":  best_syms,
        "worst_symbols": worst_syms,
        "pl_histogram":  _pl_histogram(trades),
        "by_hour":       _by_hour(trades),
        "insights":      insights_list,
    }


# ─── public API ───────────────────────────────────────────────────────────────

def build_options_analytics(live_ltp: dict) -> dict:
    all_trades = build_options_trades(live_ltp)
    closed     = [t for t in all_trades if t["status"] == "closed"]
    open_count = sum(1 for t in all_trades if t["status"] == "open")

    tf_buckets = {"15m": [], "30m": [], "1h": [], "3h": []}
    for t in closed:
        tf = t.get("timeframe", "")
        if tf in tf_buckets:
            tf_buckets[tf].append(t)

    buckets = {key: _compute_bucket(trades) for key, trades in tf_buckets.items()}
    buckets["all"] = _compute_bucket(closed)

    return {
        "type":       "options_analytics",
        "buckets":    buckets,
        "open_count": open_count,
    }
