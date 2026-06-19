import { useState, useEffect } from 'react'

const TIMEFRAMES = ['15min', '30min', '1hour', '3hour']
const TF_LABELS  = { '15min': '15m', '30min': '30m', '1hour': '1h', '3hour': '3h' }

function Sparkline({ data, positive }) {
  if (!data || data.length < 2) return null
  const W = 80, H = 32, PAD = 2
  const vals = data.map(function(d) { return d.v })
  const lo = Math.min.apply(null, vals)
  const hi = Math.max.apply(null, vals)
  const range = hi - lo || 1
  const pts = vals.map(function(v, i) {
    const x = (i / (vals.length - 1)) * W
    const y = PAD + (1 - (v - lo) / range) * (H - PAD * 2)
    return x.toFixed(1) + ',' + y.toFixed(1)
  }).join(' ')
  return (
    <svg width={W} height={H} viewBox={'0 0 ' + W + ' ' + H} style={{ display: 'block', flexShrink: 0 }}>
      <polyline points={pts} fill="none"
        stroke={positive ? '#26a69a' : '#ef5350'}
        strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export default function SectorDashboard({ ws, wsReady, active }) {
  const [sectors,    setSectors]    = useState([])
  const [timeframe,  setTimeframe]  = useState('15min')
  const [loading,    setLoading]    = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [expanded,   setExpanded]   = useState(null)

  function requestData(tf) {
    if (!ws || ws.readyState !== 1) return
    setLoading(true)
    ws.send(JSON.stringify({ type: 'get_sector_data', timeframe: tf }))
  }

  useEffect(function() {
    if (!ws) return
    function onMsg(e) {
      const d = JSON.parse(e.data)
      if (d.type !== 'sector_data') return
      const sorted = d.sectors.slice().sort(function(a, b) { return b.change_pct - a.change_pct })
      setSectors(sorted)
      setLoading(false)
      setLastUpdate(new Date().toLocaleTimeString())
    }
    ws.addEventListener('message', onMsg)
    return function() { ws.removeEventListener('message', onMsg) }
  }, [ws])

  useEffect(function() {
    if (wsReady && active) requestData(timeframe)
  }, [wsReady, active])

  useEffect(function() {
    if (wsReady) requestData(timeframe)
  }, [timeframe])

  const btn = { background: '#1a1a1a', color: '#888', border: '1px solid #2a2a2a', padding: '4px 10px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }
  const btnActive = { background: '#2962ff', color: '#fff', border: '1px solid #2962ff', padding: '4px 10px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0d0d0d', overflow: 'hidden', fontFamily: 'system-ui,"Segoe UI",sans-serif' }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', background: '#111', borderBottom: '1px solid #1a1a1a', flexShrink: 0 }}>
        <span style={{ color: '#d1d4dc', fontSize: '14px', fontWeight: '500' }}>Sector Overview</span>
        {sectors.length > 0 && <span style={{ color: '#555', fontSize: '11px' }}>{sectors.length} sectors</span>}
        {lastUpdate && <span style={{ color: '#444', fontSize: '11px' }}>Updated {lastUpdate}</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '3px' }}>
          {TIMEFRAMES.map(function(tf) {
            return (
              <button key={tf} onClick={function() { setTimeframe(tf) }}
                style={timeframe === tf ? btnActive : btn}>
                {TF_LABELS[tf]}
              </button>
            )
          })}
        </div>
        <button onClick={function() { requestData(timeframe) }} disabled={loading} style={{
          background: loading ? '#1a1a1a' : '#26a69a', color: loading ? '#555' : '#000',
          border: 'none', padding: '5px 14px', borderRadius: '4px',
          fontSize: '12px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: '500',
        }}>{loading ? 'Loading...' : 'Refresh'}</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>

        {loading && sectors.length === 0 && (
          <div style={{ textAlign: 'center', color: '#555', fontSize: '13px', paddingTop: '60px' }}>
            Loading sector data...
          </div>
        )}

        {!loading && sectors.length === 0 && (
          <div style={{ textAlign: 'center', color: '#444', fontSize: '13px', paddingTop: '60px' }}>
            {wsReady ? 'Click Refresh to load sector data' : 'Waiting for WebSocket connection...'}
          </div>
        )}

        {sectors.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '8px' }}>
            {sectors.map(function(s) {
              const isPos = s.change_pct >= 0
              const isExp = expanded === s.name
              const accentColor = isPos ? '#26a69a' : '#ef5350'

              return (
                <div key={s.name} style={{
                  background: '#131722',
                  border: '1px solid #1e2535',
                  borderLeft: '3px solid ' + accentColor,
                  borderRadius: '6px',
                  overflow: 'hidden',
                }}>
                  <div onClick={function() { setExpanded(isExp ? null : s.name) }}
                    style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: '#d1d4dc', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {s.name}
                      </div>
                      <div style={{ color: '#555', fontSize: '11px', marginTop: '3px' }}>
                        {s.stock_count} stocks&nbsp;
                        <span style={{ color: '#333', fontSize: '10px' }}>{isExp ? '▲' : '▼'}</span>
                      </div>
                    </div>

                    <Sparkline data={s.sparkline} positive={isPos} />

                    <div style={{ textAlign: 'right', flexShrink: 0, minWidth: '96px' }}>
                      <div style={{ color: '#e6e8ec', fontSize: '14px', fontWeight: '600' }}>
                        {s.current.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div style={{ color: accentColor, fontSize: '11px', fontWeight: '500', marginTop: '2px' }}>
                        {isPos ? '+' : ''}{s.change} ({isPos ? '+' : ''}{s.change_pct}%)
                      </div>
                    </div>
                  </div>

                  {isExp && s.stocks && s.stocks.length > 0 && (
                    <div style={{ borderTop: '1px solid #1e2535', padding: '8px 12px', background: '#0d1117' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {s.stocks.map(function(stock) {
                          return (
                            <span key={stock} style={{
                              background: '#131722', color: '#b2b5be',
                              border: '1px solid #2a2e39', borderRadius: '3px',
                              fontSize: '11px', padding: '2px 7px',
                            }}>{stock}</span>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
