import { useState, useEffect } from 'react'
import AnalyticsView from './AnalyticsView'

const TF_ORDER = { '15m': 0, '30m': 1, '1h': 2, '3h': 3 }
const TF_BTNS  = ['All', '15m', '30m', '1h', '3h']

// ─── Shared Blotter Table ─────────────────────────────────────────────────────
function TradeBlotterTable({ trades, title, showTFFilter, emptyMessage }) {
  var [sortCol, setSortCol] = useState(null)
  var [sortDir, setSortDir] = useState('desc')
  var [tfFilter, setTfFilter] = useState(function() {
    return showTFFilter ? (localStorage.getItem('optionsTradeTF') || 'All') : 'All'
  })

  useEffect(function() {
    if (showTFFilter) localStorage.setItem('optionsTradeTF', tfFilter)
  }, [tfFilter, showTFFilter])

  function toggleSort(col) {
    if (sortCol === col) {
      setSortDir(function(d) { return d === 'asc' ? 'desc' : 'asc' })
    } else {
      setSortCol(col)
      setSortDir('desc')
    }
  }

  var visible = tfFilter === 'All' ? trades : trades.filter(function(t) { return t.timeframe === tfFilter })

  var display = visible.slice()
  if (sortCol) {
    display.sort(function(a, b) {
      var va = a[sortCol], vb = b[sortCol]
      if (sortCol === 'timeframe') { va = TF_ORDER[va] ?? 99; vb = TF_ORDER[vb] ?? 99 }
      if (sortCol === 'strike_key') {
        va = (a.leg || '') + String(a.strike || 0).padStart(8, '0')
        vb = (b.leg || '') + String(b.strike || 0).padStart(8, '0')
      }
      if (va == null) va = sortDir === 'asc' ?  Infinity : -Infinity
      if (vb == null) vb = sortDir === 'asc' ?  Infinity : -Infinity
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      return sortDir === 'asc' ? va - vb : vb - va
    })
  } else {
    display.sort(function(a, b) {
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1
      return (b.buy_iso || '').localeCompare(a.buy_iso || '')
    })
  }

  var plRows  = visible.filter(function(t) { return t.pl_pct != null })
  var plTotal = plRows.reduce(function(s, t) { return s + t.pl_pct }, 0)
  var plTotalStr = plRows.length > 0
    ? (plTotal >= 0 ? '+' : '') + plTotal.toFixed(1) + '%'
    : null

  var thBase = {
    padding: '7px 8px', color: '#555', fontWeight: '400',
    borderBottom: '1px solid #1a1a1a', fontSize: '11px',
    background: '#0d0d0d', position: 'sticky', top: 0, zIndex: 1,
    whiteSpace: 'nowrap', userSelect: 'none', cursor: 'pointer',
  }

  function TH({ label, col, align, extra }) {
    var isActive = sortCol === col
    var arrow = isActive ? (sortDir === 'asc' ? ' ▴' : ' ▾') : ''
    return (
      <th onClick={function() { toggleSort(col) }}
        style={Object.assign({}, thBase, { textAlign: align || 'left', color: isActive ? '#d1d4dc' : '#555' }, extra || {})}>
        {label}{arrow}
      </th>
    )
  }

  var plHeaderColor = plRows.length === 0 ? '#555' : plTotal >= 0 ? '#26a69a' : '#ef5350'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Title bar */}
      <div style={{ padding: '5px 12px', background: '#111', borderBottom: '1px solid #1a1a1a', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <span style={{ color: '#888', fontSize: '11px', fontWeight: '500', letterSpacing: '0.5px', textTransform: 'uppercase' }}>{title}</span>
      </div>

      {/* TF filter bar */}
      {showTFFilter && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', background: '#111', borderBottom: '1px solid #1a1a1a', flexShrink: 0 }}>
          <span style={{ color: '#555', fontSize: '11px', marginRight: '4px' }}>Filter:</span>
          {TF_BTNS.map(function(tf) {
            var isActive = tfFilter === tf
            return (
              <button key={tf} onClick={function() { setTfFilter(tf) }} style={{
                background: isActive ? '#2962ff22' : 'transparent',
                color:      isActive ? '#5b8dee'   : '#555',
                border:    '1px solid ' + (isActive ? '#2962ff66' : '#222'),
                padding:   '3px 10px', borderRadius: '3px', fontSize: '11px', cursor: 'pointer',
                fontWeight: isActive ? '500' : '400',
              }}>{tf}</button>
            )
          })}
          <span style={{ marginLeft: 'auto', color: '#444', fontSize: '11px' }}>
            {display.length} of {trades.length} trades
          </span>
        </div>
      )}

      {trades.length === 0
        ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', color: '#444', fontSize: '13px', padding: '0 20px' }}>
              {emptyMessage || 'No signals yet.'}
            </div>
          </div>
        )
        : (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  <TH label="Symbol"            col="symbol"     align="left"   />
                  <TH label="Spot Price"         col="spot"       align="right"  />
                  <TH label="Time Frame"         col="timeframe"  align="center" />
                  <TH label="Strike Price"       col="strike_key" align="left"   />
                  <TH label="Buy Price"          col="buy_price"  align="right"  />
                  <TH label="Buy Time & Date"    col="buy_iso"    align="left"   />
                  <TH label="Current Price"      col="cur_price"  align="right"  />
                  <TH label="Sell Price"         col="sell_price" align="right"  />
                  <TH label="Sell Time & Date"   col="sell_iso"   align="left"   />
                  <th onClick={function() { toggleSort('pl') }}
                    style={Object.assign({}, thBase, { textAlign: 'right', color: sortCol === 'pl' ? '#d1d4dc' : '#555' })}>
                    Profit/Loss
                    {plTotalStr
                      ? <span style={{ color: plHeaderColor, fontSize: '10px', marginLeft: '5px' }}>(Total {plTotalStr})</span>
                      : <span style={{ color: '#333', fontSize: '10px', marginLeft: '5px' }}>(Total —)</span>
                    }
                    {sortCol === 'pl' ? (sortDir === 'asc' ? ' ▴' : ' ▾') : ''}
                  </th>
                </tr>
              </thead>
              <tbody>
                {display.map(function(t, i) {
                  var isOpen   = t.status === 'open'
                  var plColor  = t.pl != null ? (t.pl >= 0 ? '#26a69a' : '#ef5350') : '#555'
                  var legColor = t.leg === 'CE' ? '#4caf90' : '#ef5350'
                  var curColor = t.cur_price != null && t.buy_price != null
                    ? (t.cur_price >= t.buy_price ? '#26a69a' : '#ef5350')
                    : '#777'

                  var strikeLabel = t.leg + ' ' + (t.strike != null ? t.strike : '')
                  if (t.expiry) strikeLabel += ' · ' + t.expiry

                  return (
                    <tr key={i} style={{
                      borderBottom: '1px solid #161616',
                      background:   isOpen ? '#0d1520' : 'transparent',
                      borderLeft:   isOpen ? '3px solid #2962ff' : '3px solid transparent',
                    }}>
                      <td style={{ padding: '7px 8px 7px 11px', color: '#d1d4dc', fontWeight: '500', fontFamily: 'monospace' }}>
                        {t.symbol}
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: '#888', fontFamily: 'monospace' }}>
                        {t.spot != null ? t.spot.toFixed(2) : '—'}
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'center', color: '#777' }}>
                        {t.timeframe}
                      </td>
                      <td style={{ padding: '7px 8px', color: legColor, fontFamily: 'monospace', fontWeight: '500' }}>
                        {strikeLabel}
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: '#d1d4dc', fontFamily: 'monospace' }}>
                        {t.buy_price != null ? t.buy_price.toFixed(2) : '—'}
                      </td>
                      <td style={{ padding: '7px 8px', color: '#777', whiteSpace: 'nowrap' }}>
                        {t.buy_time}
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: curColor, fontFamily: 'monospace', fontWeight: '500' }}>
                        {t.cur_price != null ? t.cur_price.toFixed(2) : '—'}
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: '#d1d4dc', fontFamily: 'monospace' }}>
                        {t.sell_price != null ? t.sell_price.toFixed(2) : '—'}
                      </td>
                      <td style={{ padding: '7px 8px', color: '#777', whiteSpace: 'nowrap' }}>
                        {isOpen
                          ? <span style={{ background: '#1a2d4a', color: '#5b8dee', border: '1px solid #2962ff55', padding: '2px 7px', borderRadius: '3px', fontSize: '10px', fontWeight: '600', letterSpacing: '0.5px' }}>RUNNING</span>
                          : t.sell_time
                        }
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                        {t.pl != null
                          ? <span style={{ color: plColor, fontStyle: isOpen ? 'italic' : 'normal' }}>
                              {t.pl >= 0 ? '+' : ''}{t.pl.toFixed(2)}
                              {t.pl_pct != null &&
                                <span style={{ opacity: 0.75, fontSize: '10px', marginLeft: '4px' }}>
                                  ({t.pl_pct >= 0 ? '+' : ''}{t.pl_pct.toFixed(2)}%)
                                </span>
                              }
                            </span>
                          : <span style={{ color: '#333' }}>—</span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      }
    </div>
  )
}

// ─── Main OptionsView ─────────────────────────────────────────────────────────
export default function OptionsView({ ws, wsReady }) {
  var [trades,      setTrades]      = useState([])
  var [confluence,  setConfluence]  = useState([])
  var [analytics,   setAnalytics]   = useState(null)
  var [confLoading, setConfLoading] = useState(true)
  var [subTab,      setSubTab]      = useState('blotter')

  useEffect(function() {
    if (!ws) return
    function onMsg(e) {
      var d = JSON.parse(e.data)
      if (d.type === 'options_trades') setTrades(d.trades || [])
      if (d.type === 'options_confluence') {
        setConfluence(d.trades || [])
        if (!d.loading) setConfLoading(false)
      }
      if (d.type === 'options_analytics') setAnalytics(d)
    }
    ws.addEventListener('message', onMsg)
    return function() { ws.removeEventListener('message', onMsg) }
  }, [ws])

  useEffect(function() {
    if (wsReady && ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'get_options_trades' }))
      ws.send(JSON.stringify({ type: 'get_options_confluence' }))
      ws.send(JSON.stringify({ type: 'get_options_analytics' }))
    }
  }, [wsReady])

  function subBtn(id, label) {
    var isActive = subTab === id
    return (
      <button key={id} onClick={function() { setSubTab(id) }} style={{
        background:   'transparent',
        color:        isActive ? '#d1d4dc' : '#555',
        border:       'none',
        borderBottom: isActive ? '2px solid #2962ff' : '2px solid transparent',
        padding:      '6px 16px',
        fontSize:     '12px',
        cursor:       'pointer',
        fontWeight:   isActive ? '500' : '400',
        transition:   'color 0.15s',
      }}>{label}</button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0d0d0d', overflow: 'hidden', fontFamily: 'system-ui,"Segoe UI",sans-serif' }}>

      {/* Sub-tab bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '0 14px', background: '#111', borderBottom: '1px solid #1a1a1a', flexShrink: 0 }}>
        {subBtn('blotter',    'Per-TF Signals')}
        {subBtn('confluence', '15m+30m Confluence')}
        {subBtn('analytics',  'Analytics')}
      </div>

      {/* Per-TF blotter — always mounted, hidden when not active */}
      <div style={{ display: subTab === 'blotter' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <TradeBlotterTable
          trades={trades}
          title="Per-Timeframe Signals"
          showTFFilter={true}
          emptyMessage="No option signals yet — run backfill_signals.py once if this stays empty."
        />
      </div>

      {/* Confluence blotter — always mounted, hidden when not active */}
      <div style={{ display: subTab === 'confluence' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <TradeBlotterTable
          trades={confluence}
          title="15m + 30m Confluence"
          showTFFilter={false}
          emptyMessage={confLoading
            ? 'Computing confluence signals — please wait...'
            : 'No confluence signals found — requires aligned 15m & 30m buy signals within 60 min.'}
        />
      </div>

      {/* Analytics — always mounted, hidden when not active */}
      <div style={{ display: subTab === 'analytics' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <AnalyticsView data={analytics} />
      </div>

    </div>
  )
}
