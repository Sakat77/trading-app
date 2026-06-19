import { useEffect, useRef, useState } from 'react'

const TF_LABELS = { '15min': '15m', '30min': '30m', '1hour': '1h', '3hour': '3h' }
const TFS = ['15min', '30min', '1hour', '3hour']

function GaugeBar({ bull, bear, neutral }) {
  const total = bull + bear + neutral || 1
  const bullPct = Math.round(bull / total * 100)
  const bearPct = Math.round(bear / total * 100)
  const neutPct = 100 - bullPct - bearPct
  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', background: '#2a2a2a' }}>
        <div style={{ width: `${bullPct}%`, background: '#26a69a', transition: 'width 0.4s' }} />
        <div style={{ width: `${bearPct}%`, background: '#ef5350', transition: 'width 0.4s' }} />
        <div style={{ width: `${neutPct}%`, background: '#444' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: '#aaa' }}>
        <span style={{ color: '#26a69a' }}>Bull {bullPct}%</span>
        <span style={{ color: '#888' }}>Neutral {neutPct}%</span>
        <span style={{ color: '#ef5350' }}>Bear {bearPct}%</span>
      </div>
    </div>
  )
}

function TagBadge({ tag }) {
  const colors = { bull: '#26a69a', bear: '#ef5350', neutral: '#888' }
  return (
    <span style={{
      display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: 11,
      background: colors[tag] || '#555', color: '#fff', textTransform: 'uppercase', fontWeight: 600,
    }}>{tag}</span>
  )
}

export default function OverviewDashboard({ ws, wsReady, active }) {
  const [data, setData] = useState([])      // [{tf, bull, bear, neutral, bull_pct, bear_pct, symbols}]
  const [loading, setLoading] = useState(false)
  const [activeTf, setActiveTf] = useState('15min')
  const [showList, setShowList] = useState(false)
  const requested = useRef(false)

  useEffect(() => {
    if (!active) return
    const handler = (e) => {
      try {
        const d = JSON.parse(e.data)
        if (d.type === 'overview') {
          if (d.loading) {
            // Cache not ready yet — keep spinner, background task will push when done
            setLoading(true)
          } else {
            setData(d.timeframes || [])
            setLoading(false)
          }
        }
      } catch {}
    }
    if (ws) ws.addEventListener('message', handler)
    return () => { if (ws) ws.removeEventListener('message', handler) }
  }, [ws, active])

  useEffect(() => {
    if (!active || !wsReady || requested.current) return
    requested.current = true
    setLoading(true)
    ws.send(JSON.stringify({ type: 'get_overview' }))
  }, [active, wsReady])

  const activeTfData = data.find(d => d.tf === activeTf)
  const symbols = activeTfData?.symbols || []

  return (
    <div style={{ padding: 20, color: '#e0e0e0', fontFamily: 'monospace' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Options Market Pressure</h2>
        <button
          onClick={() => { requested.current = false; setLoading(true); ws.send(JSON.stringify({ type: 'get_overview' })) }}
          disabled={!wsReady || loading}
          style={{ padding: '4px 12px', background: '#333', color: '#ccc', border: '1px solid #555', borderRadius: 4, cursor: 'pointer' }}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {loading && <div style={{ color: '#888' }}>Computing options signals across all timeframes…</div>}

      {!loading && data.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
            {TFS.map(tf => {
              const d = data.find(x => x.tf === tf)
              if (!d) return null
              const overall = d.bull > d.bear ? 'bull' : d.bear > d.bull ? 'bear' : 'neutral'
              return (
                <div
                  key={tf}
                  onClick={() => { setActiveTf(tf); setShowList(true) }}
                  style={{
                    flex: '1 1 180px', background: '#1e1e1e', border: `1px solid ${activeTf === tf ? '#555' : '#333'}`,
                    borderRadius: 8, padding: 16, cursor: 'pointer',
                    boxShadow: activeTf === tf ? '0 0 0 2px #555' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{TF_LABELS[tf]}</span>
                    <TagBadge tag={overall} />
                  </div>
                  <GaugeBar bull={d.bull} bear={d.bear} neutral={d.neutral} />
                  <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                    {d.bull + d.bear + d.neutral} symbols
                  </div>
                </div>
              )
            })}
          </div>

          {showList && activeTfData && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <span style={{ fontWeight: 600 }}>Symbol breakdown — {TF_LABELS[activeTf]}</span>
                <button onClick={() => setShowList(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 18 }}>×</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {symbols.map(s => (
                  <div key={s.symbol} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, padding: '4px 10px',
                  }}>
                    <span style={{ fontSize: 12 }}>{s.symbol.replace('NSE:', '').replace('-EQ', '')}</span>
                    <TagBadge tag={s.tag} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!loading && data.length === 0 && (
        <div style={{ color: '#666' }}>No overview data available. Check that options/atm_map.json exists.</div>
      )}
    </div>
  )
}
