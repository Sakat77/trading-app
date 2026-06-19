import { useState, useEffect, Fragment } from 'react'

const TIMEFRAMES = ['15min', '30min', '1hour', '3hour']
const TF_LABELS  = { '15min': '15m', '30min': '30m', '1hour': '1h', '3hour': '3h' }

function round2(n) { return Math.round(n * 100) / 100 }

function chgColor(n) { return n >= 0 ? '#26a69a' : '#ef5350' }

function pcrColor(pcr) {
  if (pcr < 0.9)  return '#26a69a'
  if (pcr > 1.1)  return '#ef5350'
  return '#888'
}
function pcrLabel(pcr) {
  if (pcr < 0.8)  return 'Strong Bull'
  if (pcr < 0.9)  return 'Bullish'
  if (pcr > 1.2)  return 'Strong Bear'
  if (pcr > 1.1)  return 'Bearish'
  return 'Neutral'
}

function Sparkline({ data, color, w, h }) {
  var W = w || 160, H = h || 44, PAD = 2
  if (!data || data.length < 2) return <span style={{ color: '#2a2a2a', fontSize: '11px' }}>no data</span>
  var vals = data.map(function(d) { return d.v })
  var lo = Math.min.apply(null, vals)
  var hi = Math.max.apply(null, vals)
  var range = hi - lo || 1
  var pts = vals.map(function(v, i) {
    var x = (i / (vals.length - 1)) * W
    var y = PAD + (1 - (v - lo) / range) * (H - PAD * 2)
    return x.toFixed(1) + ',' + y.toFixed(1)
  }).join(' ')
  return (
    <svg width={W} height={H} viewBox={'0 0 ' + W + ' ' + H} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export default function OptionsView({ ws, wsReady, active }) {
  var [data,       setData]       = useState([])
  var [timeframe,  setTimeframe]  = useState('15min')
  var [loading,    setLoading]    = useState(false)
  var [lastUpdate, setLastUpdate] = useState(null)
  var [expanded,   setExpanded]   = useState(null)
  var [search,     setSearch]     = useState('')
  var [bias,       setBias]       = useState('all')
  var [sortKey,    setSortKey]    = useState('sym')

  function requestData(tf) {
    if (!ws || ws.readyState !== 1) return
    setLoading(true)
    ws.send(JSON.stringify({ type: 'get_options_overview', timeframe: tf }))
  }

  useEffect(function() {
    if (!ws) return
    function onMsg(e) {
      var d = JSON.parse(e.data)
      if (d.type !== 'options_overview') return
      setData(d.data)
      setLoading(false)
      setLastUpdate(new Date().toLocaleTimeString())
    }
    ws.addEventListener('message', onMsg)
    return function() { ws.removeEventListener('message', onMsg) }
  }, [ws])

  useEffect(function() {
    if (wsReady && active && data.length === 0) requestData(timeframe)
  }, [wsReady, active])

  useEffect(function() {
    if (wsReady) requestData(timeframe)
  }, [timeframe])

  var rows = data.filter(function(r) {
    if (search && !r.underlying.toLowerCase().includes(search.toLowerCase())) return false
    if (bias === 'all') return true
    if (!r.ce || !r.pe || r.ce.current <= 0) return false
    var pcr = r.pe.current / r.ce.current
    if (bias === 'bullish') return pcr < 0.9
    if (bias === 'bearish') return pcr > 1.1
    if (bias === 'neutral') return pcr >= 0.9 && pcr <= 1.1
    return true
  })

  if (sortKey === 'ce_chg') {
    rows = rows.slice().sort(function(a, b) { return (b.ce ? b.ce.change_pct : -999) - (a.ce ? a.ce.change_pct : -999) })
  } else if (sortKey === 'pe_chg') {
    rows = rows.slice().sort(function(a, b) { return (b.pe ? b.pe.change_pct : -999) - (a.pe ? a.pe.change_pct : -999) })
  } else if (sortKey === 'pcr') {
    rows = rows.slice().sort(function(a, b) {
      var pa = (a.ce && a.pe && a.ce.current > 0) ? a.pe.current / a.ce.current : 999
      var pb = (b.ce && b.pe && b.ce.current > 0) ? b.pe.current / b.ce.current : 999
      return pa - pb
    })
  }

  var thBase = {
    padding: '7px 8px', color: '#555', fontWeight: '400',
    borderBottom: '1px solid #1a1a1a', fontSize: '11px',
    background: '#0d0d0d', position: 'sticky', top: 0, zIndex: 1,
    whiteSpace: 'nowrap', userSelect: 'none',
  }

  function th(label, key, align, extra) {
    var isActive = sortKey === key
    return (
      <th onClick={key ? function() { setSortKey(key) } : undefined}
        style={Object.assign({}, thBase, { textAlign: align || 'left', cursor: key ? 'pointer' : 'default', color: isActive ? '#d1d4dc' : '#555' }, extra)}>
        {label}{isActive ? ' ▾' : ''}
      </th>
    )
  }

  function biasBtn(val, label) {
    var isActive = bias === val
    return (
      <button key={val} onClick={function() { setBias(val) }} style={{
        background: isActive ? '#26a69a' : '#1a1a1a', color: isActive ? '#000' : '#888',
        border: '1px solid ' + (isActive ? '#26a69a' : '#2a2a2a'),
        padding: '4px 10px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer',
      }}>{label}</button>
    )
  }

  function tfBtn(tf) {
    var isActive = timeframe === tf
    return (
      <button key={tf} onClick={function() { setTimeframe(tf) }} style={{
        background: isActive ? '#2962ff' : '#1a1a1a', color: isActive ? '#fff' : '#888',
        border: '1px solid ' + (isActive ? '#2962ff' : '#2a2a2a'),
        padding: '4px 10px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer',
      }}>{TF_LABELS[tf]}</button>
    )
  }

  function fmt(n) { return n >= 0 ? '+' + n + '%' : n + '%' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0d0d0d', overflow: 'hidden', fontFamily: 'system-ui,"Segoe UI",sans-serif' }}>

      <div style={{ padding: '8px 14px', background: '#111', borderBottom: '1px solid #1a1a1a', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <span style={{ color: '#d1d4dc', fontSize: '14px', fontWeight: '500' }}>ATM Options</span>
          {data.length > 0 && (
            <span style={{ color: '#555', fontSize: '11px' }}>{rows.length} / {data.length} symbols</span>
          )}
          {lastUpdate && <span style={{ color: '#444', fontSize: '11px' }}>Updated {lastUpdate}</span>}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '3px' }}>
            {TIMEFRAMES.map(tfBtn)}
          </div>
          <button onClick={function() { requestData(timeframe) }} disabled={loading} style={{
            background: loading ? '#1a1a1a' : '#26a69a', color: loading ? '#555' : '#000',
            border: 'none', padding: '5px 14px', borderRadius: '4px',
            fontSize: '12px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: '500',
          }}>{loading ? 'Loading...' : 'Refresh'}</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <input value={search} onChange={function(e) { setSearch(e.target.value) }}
            placeholder="Search symbol..."
            style={{ background: '#1a1a1a', color: '#d1d4dc', border: '1px solid #2a2a2a', padding: '5px 10px', borderRadius: '4px', fontSize: '12px', width: '160px' }} />
          <div style={{ display: 'flex', gap: '4px' }}>
            {biasBtn('all',     'All')}
            {biasBtn('bullish', 'Bullish')}
            {biasBtn('neutral', 'Neutral')}
            {biasBtn('bearish', 'Bearish')}
          </div>
          <span style={{ color: '#333', fontSize: '11px', marginLeft: 'auto' }}>Click row to expand  ·  Click header to sort</span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && data.length === 0 && (
          <div style={{ textAlign: 'center', color: '#555', fontSize: '13px', paddingTop: '60px' }}>
            Loading options data... (reading {'{'}121{'}'} symbols)
          </div>
        )}
        {!loading && data.length === 0 && (
          <div style={{ textAlign: 'center', color: '#444', fontSize: '13px', paddingTop: '60px' }}>
            {wsReady ? 'Click Refresh to load options data' : 'Waiting for WebSocket connection...'}
          </div>
        )}

        {data.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr>
                {th('Symbol',    'sym',    'left',   { paddingLeft: '14px', width: '10%' })}
                {th('Spot ₹',    null,     'right',  { width: '9%' })}
                {th('Exp',       null,     'left',   { width: '5%' })}
                {th('CE Strike', null,     'right',  { width: '7%' })}
                {th('CE ₹',      null,     'right',  { width: '8%' })}
                {th('CE Chg',    'ce_chg', 'right',  { width: '7%' })}
                {th('PE Strike', null,     'right',  { width: '7%' })}
                {th('PE ₹',      null,     'right',  { width: '8%' })}
                {th('PE Chg',    'pe_chg', 'right',  { width: '7%' })}
                {th('PCR',       'pcr',    'center', { width: '9%' })}
              </tr>
            </thead>
            <tbody>
              {rows.map(function(r) {
                var isExp = expanded === r.symbol
                var pcr   = (r.ce && r.pe && r.ce.current > 0) ? round2(r.pe.current / r.ce.current) : null
                var biasColor = pcr !== null ? pcrColor(pcr) : '#333'
                return (
                  <Fragment key={r.symbol}>
                    <tr
                      onClick={function() { setExpanded(isExp ? null : r.symbol) }}
                      style={{
                        background:   isExp ? '#0d1a2a' : 'transparent',
                        cursor:       'pointer',
                        borderBottom: isExp ? 'none' : '1px solid #161616',
                        borderLeft:   '3px solid ' + (isExp ? '#2962ff' : biasColor),
                        transition:   'background 0.1s',
                      }}>
                      <td style={{ padding: '7px 8px 7px 14px', color: '#d1d4dc', fontWeight: '500' }}>{r.underlying}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: '#777' }}>
                        {r.last_price ? r.last_price.toLocaleString('en-IN') : '—'}
                      </td>
                      <td style={{ padding: '7px 8px', color: '#555', fontSize: '11px' }}>{r.expiry_str}</td>

                      <td style={{ padding: '7px 8px', textAlign: 'right', color: '#666' }}>{r.ce_strike}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: '#d1d4dc' }}>
                        {r.ce ? r.ce.current : <span style={{ color: '#333' }}>—</span>}
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: r.ce ? chgColor(r.ce.change_pct) : '#333', fontWeight: r.ce ? '500' : '400' }}>
                        {r.ce ? fmt(r.ce.change_pct) : '—'}
                      </td>

                      <td style={{ padding: '7px 8px', textAlign: 'right', color: '#666' }}>{r.pe_strike}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: '#d1d4dc' }}>
                        {r.pe ? r.pe.current : <span style={{ color: '#333' }}>—</span>}
                      </td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: r.pe ? chgColor(r.pe.change_pct) : '#333', fontWeight: r.pe ? '500' : '400' }}>
                        {r.pe ? fmt(r.pe.change_pct) : '—'}
                      </td>

                      <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                        {pcr !== null ? (
                          <span style={{ color: pcrColor(pcr), fontWeight: '500' }}>
                            {pcr}
                            <span style={{ fontSize: '10px', color: pcrColor(pcr), opacity: 0.7, marginLeft: '4px' }}>{pcrLabel(pcr)}</span>
                          </span>
                        ) : <span style={{ color: '#2a2a2a' }}>—</span>}
                      </td>
                    </tr>

                    {isExp && (
                      <tr>
                        <td colSpan={10} style={{
                          padding: '12px 14px 16px', background: '#0a1525',
                          borderBottom: '1px solid #1a2535', borderLeft: '3px solid #2962ff',
                        }}>
                          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start' }}>

                            <div style={{ flex: 1, minWidth: '200px' }}>
                              <div style={{ color: '#2962ff', fontSize: '11px', fontWeight: '600', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>CALL {r.ce_strike}</span>
                                {r.ce && (
                                  <span style={{ color: chgColor(r.ce.change_pct), fontWeight: '500' }}>
                                    ₹{r.ce.current} &nbsp;{fmt(r.ce.change_pct)}
                                  </span>
                                )}
                              </div>
                              <Sparkline data={r.ce && r.ce.sparkline} color="#2962ff" w={180} h={50} />
                              {r.ce && (
                                <div style={{ color: '#444', fontSize: '10px', marginTop: '4px' }}>
                                  Prev close: ₹{r.ce.prev_close}
                                </div>
                              )}
                            </div>

                            <div style={{ flex: 1, minWidth: '200px' }}>
                              <div style={{ color: '#ef5350', fontSize: '11px', fontWeight: '600', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>PUT {r.pe_strike}</span>
                                {r.pe && (
                                  <span style={{ color: chgColor(r.pe.change_pct), fontWeight: '500' }}>
                                    ₹{r.pe.current} &nbsp;{fmt(r.pe.change_pct)}
                                  </span>
                                )}
                              </div>
                              <Sparkline data={r.pe && r.pe.sparkline} color="#ef5350" w={180} h={50} />
                              {r.pe && (
                                <div style={{ color: '#444', fontSize: '10px', marginTop: '4px' }}>
                                  Prev close: ₹{r.pe.prev_close}
                                </div>
                              )}
                            </div>

                            {pcr !== null && (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: '110px', padding: '8px 16px', background: '#0d1117', borderRadius: '6px', border: '1px solid #1e2535' }}>
                                <div style={{ color: '#555', fontSize: '10px', marginBottom: '4px' }}>PUT / CALL RATIO</div>
                                <div style={{ color: pcrColor(pcr), fontSize: '28px', fontWeight: '700', lineHeight: 1 }}>{pcr}</div>
                                <div style={{ color: pcrColor(pcr), fontSize: '11px', fontWeight: '500', marginTop: '4px' }}>{pcrLabel(pcr)}</div>
                                <div style={{ color: '#333', fontSize: '10px', marginTop: '8px', textAlign: 'center' }}>
                                  Interval: {r.interval}<br />Exp: {r.expiry_str}
                                </div>
                              </div>
                            )}

                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
