import { useState, useEffect } from 'react'

function fmt(ts) {
  if (!ts) return '—'
  const d = new Date(ts * 1000)
  return d.toLocaleDateString('en-IN',{ day:'2-digit', month:'short' }) + ' ' +
    d.toLocaleTimeString('en-IN',{ hour:'2-digit', minute:'2-digit', hour12:false })
}

function fmtDate(ts) {
  if (!ts) return ''
  return new Date(ts * 1000).toLocaleDateString('en-IN',{ day:'2-digit', month:'short' })
}

const TF = ['15min','30min','1hour','3hour']
const TF_LABELS = ['15 min','30 min','1 hour','3 hour']

function Dot({ type }) {
  if (type === 'buy')  return <span style={{ display:'inline-flex', width:'24px', height:'24px', borderRadius:'4px', background:'#0d2e1a', alignItems:'center', justifyContent:'center', fontSize:'10px', fontWeight:'500', color:'#26a69a', flexShrink:0 }}>B</span>
  if (type === 'sell') return <span style={{ display:'inline-flex', width:'24px', height:'24px', borderRadius:'4px', background:'#2e0d0d', alignItems:'center', justifyContent:'center', fontSize:'10px', fontWeight:'500', color:'#ef5350', flexShrink:0 }}>S</span>
  return <span style={{ display:'inline-flex', width:'24px', height:'24px', borderRadius:'4px', background:'#1a1a1a', alignItems:'center', justifyContent:'center', fontSize:'10px', color:'#333', flexShrink:0 }}>—</span>
}

function Badge({ type }) {
  if (!type) return <span style={{ color:'#444', fontSize:'11px' }}>—</span>
  const m = {
    strong_buy: ['#0a3d1f','#00e676','Strong Buy'],
    sell:       ['#2e0d0d','#ef5350','Sell'],
    close_buy:  ['#1a1a0d','#ffd54f','Close Buy'],
    close_sell: ['#1a0d2e','#ce93d8','Close Sell'],
  }
  const c = m[type] || ['#1a1a1a','#888',type]
  return <span style={{ background:c[0], color:c[1], padding:'2px 8px', borderRadius:'4px', fontSize:'11px', fontWeight:'500', whiteSpace:'nowrap' }}>{c[2]}</span>
}

function r2(n) { return Math.round(n * 100) / 100 }

export default function Screener({ ws, cs1, cs2, onSelectSymbol, activeSymbol }) {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [lastRun, setLastRun] = useState(null)
  const [filter,  setFilter]  = useState('all')
  const [search,  setSearch]  = useState('')
  const [auto,    setAuto]    = useState(false)

  useEffect(function() {
    if (!ws) return
    function h(e) {
      const d = JSON.parse(e.data)
      if (d.type === 'screener_results') {
        setResults(d.data)
        setLoading(false)
        setLastRun(new Date().toLocaleTimeString())
      }
    }
    ws.addEventListener('message', h)
    return function() { ws.removeEventListener('message', h) }
  }, [ws])

  useEffect(function() {
    if (!auto) return
    var iv = setInterval(function() { run() }, 5 * 60 * 1000)
    return function() { clearInterval(iv) }
  }, [auto, ws, cs1, cs2])

  function run() {
    if (!ws || ws.readyState !== 1) return
    setLoading(true)
    ws.send(JSON.stringify({ type:'run_screener', cs1:cs1, cs2:cs2 }))
  }

  const rows = results.filter(function(r) {
    if (search && !r.symbol.toLowerCase().includes(search.toLowerCase())) return false
    if (filter === 'buy')       return r.strategy_signal && r.strategy_signal.type === 'strong_buy'
    if (filter === 'sell')      return r.strategy_signal && r.strategy_signal.type === 'sell'
    if (filter === 'signals')   return r.strategy_signal !== null
    if (filter === 'closebuy')  return r.close_signal && r.close_signal.type === 'close_buy'
    if (filter === 'closesell') return r.close_signal && r.close_signal.type === 'close_sell'
    return true
  })

  const fs = function(a) {
    return {
      background: a ? '#1d3a2a' : '#1e1e1e',
      color:      a ? '#26a69a' : '#888',
      border:     '1px solid ' + (a ? '#26a69a' : '#2a2a2a'),
      padding:    '5px 14px',
      borderRadius: '6px',
      fontSize:   '13px',
      cursor:     'pointer',
      fontWeight: a ? '500' : '400',
    }
  }

  const thBase = {
    padding: '10px 8px',
    color: '#666',
    fontWeight: '400',
    borderBottom: '1px solid #222',
    fontSize: '12px',
    background: '#111',
    position: 'sticky',
    top: 0,
    zIndex: 1,
    whiteSpace: 'nowrap',
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#0d0d0d', overflow:'hidden' }}>

      {/* Header */}
      <div style={{ padding:'12px 14px', borderBottom:'1px solid #1a1a1a', background:'#111', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', marginBottom:'10px' }}>
          <span style={{ color:'#d1d4dc', fontSize:'15px', fontWeight:'500' }}>Screener</span>
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'8px' }}>
            {lastRun && <span style={{ color:'#555', fontSize:'11px' }}>Last run: {lastRun}</span>}
            <span style={{ color:'#555', fontSize:'11px' }}>{rows.length} stocks</span>
          </div>
        </div>

        <input value={search} onChange={function(e){ setSearch(e.target.value) }} placeholder="Search symbol..."
          style={{ width:'100%', background:'#1a1a1a', color:'#d1d4dc', border:'1px solid #2a2a2a', padding:'7px 10px', borderRadius:'6px', fontSize:'13px', marginBottom:'10px', boxSizing:'border-box' }} />

        <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'10px' }}>
          {[['all','All'],['signals','Signals'],['buy','Strong Buy'],['sell','Sell'],['closebuy','Close Buy'],['closesell','Close Sell']].map(function(x){
            return <button key={x[0]} onClick={function(){ setFilter(x[0]) }} style={fs(filter===x[0])}>{x[1]}</button>
          })}
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <label style={{ display:'flex', alignItems:'center', gap:'6px', color:'#888', fontSize:'12px', cursor:'pointer' }}>
            <div onClick={function(){ setAuto(!auto) }} style={{ width:'28px', height:'16px', borderRadius:'8px', background:auto?'#26a69a':'#333', position:'relative', cursor:'pointer' }}>
              <div style={{ position:'absolute', top:'2px', left:auto?'12px':'2px', width:'12px', height:'12px', borderRadius:'50%', background:'#fff', transition:'left 0.15s' }} />
            </div>
            Auto (5min)
          </label>
          <button onClick={run} disabled={loading} style={{ marginLeft:'auto', background:loading?'#1a1a1a':'#26a69a', color:loading?'#555':'#000', border:'none', padding:'7px 18px', borderRadius:'6px', fontSize:'13px', cursor:loading?'not-allowed':'pointer', fontWeight:'500' }}>
            {loading ? 'Scanning...' : 'Run Screener'}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display:'flex', alignItems:'center', gap:'12px', padding:'6px 14px', borderBottom:'1px solid #1a1a1a', background:'#0f0f0f', flexShrink:0, flexWrap:'wrap' }}>
        {[['#0d2e1a','#26a69a','B','Buy'],['#2e0d0d','#ef5350','S','Sell'],['#1a1a1a','#444','—','No signal']].map(function(x,i){
          return (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:'5px', fontSize:'12px', color:'#888' }}>
              <span style={{ display:'inline-flex', width:'18px', height:'18px', borderRadius:'3px', background:x[0], alignItems:'center', justifyContent:'center', fontSize:'9px', color:x[1] }}>{x[2]}</span>
              {x[3]}
            </div>
          )
        })}
        <span style={{ marginLeft:'auto', color:'#444', fontSize:'11px' }}>Click row → load chart</span>
      </div>

      {loading && (
        <div style={{ padding:'24px', textAlign:'center', color:'#555', fontSize:'13px' }}>
          Scanning all F&O stocks across 4 timeframes...<br/>
          <span style={{ color:'#444', fontSize:'11px' }}>This takes 2–3 minutes</span>
        </div>
      )}

      {!loading && results.length === 0 && (
        <div style={{ padding:'24px', textAlign:'center', color:'#444', fontSize:'13px' }}>
          Click "Run Screener" to scan<br/>all F&O stocks
        </div>
      )}

      {!loading && results.length > 0 && (
        <div style={{ flex:1, overflowY:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
            <thead>
              <tr>
                <th style={Object.assign({},thBase,{textAlign:'left', paddingLeft:'14px', width:'14%'})}>Stock</th>
                {TF_LABELS.map(function(label, i){
                  return (
                    <th key={i} style={Object.assign({},thBase,{textAlign:'center', width:'11%'})}>
                      {label}<br/>
                      <span style={{ color:'#444', fontSize:'10px' }}>RSI &nbsp; RVI</span>
                    </th>
                  )
                })}
                <th style={Object.assign({},thBase,{textAlign:'left', width:'12%'})}>Sector</th>
                <th style={Object.assign({},thBase,{textAlign:'left', width:'16%'})}>Strategy</th>
                <th style={Object.assign({},thBase,{textAlign:'right', paddingRight:'14px', width:'10%'})}>P&L</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(function(r) {
                const active = r.raw_symbol === activeSymbol
                const hasSig = r.strategy_signal !== null
                return (
                  <tr key={r.raw_symbol}
                    onClick={function(){ if(onSelectSymbol) onSelectSymbol(r.raw_symbol) }}
                    style={{
                      background: active ? '#0d1e2e' : hasSig ? '#0a140a' : 'transparent',
                      cursor: 'pointer',
                      borderBottom: '1px solid #161616',
                      borderLeft: active ? '3px solid #378add' : '3px solid transparent',
                      transition: 'background 0.1s',
                    }}>

                    <td style={{ padding:'8px 8px 8px 14px', verticalAlign:'middle' }}>
                      <div style={{ color:'#d1d4dc', fontSize:'13px', fontWeight:'500' }}>{r.symbol}</div>
                      <div style={{ color:'#666', fontSize:'11px', marginTop:'1px' }}>₹{r.current_price}</div>
                    </td>

                    {TF.map(function(tf) {
                      const rs = r.tf_signals_rsi[tf] || []
                      const rv = r.tf_signals_rvi[tf] || []
                      const lr = rs.length > 0 ? rs[rs.length-1] : null
                      const lv = rv.length > 0 ? rv[rv.length-1] : null
                      return (
                        <td key={tf} style={{ padding:'6px 4px', verticalAlign:'middle', textAlign:'center' }}>
                          <div style={{ display:'flex', gap:'3px', justifyContent:'center', marginBottom:'3px' }}>
                            <Dot type={lr && lr.type} />
                            <Dot type={lv && lv.type} />
                          </div>
                          <div style={{ color:'#888', fontSize:'10px' }}>
                            {lr ? fmtDate(lr.time) : '—'}
                          </div>
                        </td>
                      )
                    })}

                    <td style={{ padding:'6px 8px', verticalAlign:'middle' }}>
                      {r.sector_name ? (
                        <div>
                          <div style={{ fontSize:'11px', color:'#d1d4dc', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:100 }}>{r.sector_name}</div>
                          <span style={{
                            display:'inline-block', marginTop:2, padding:'1px 5px', borderRadius:3, fontSize:10, fontWeight:600, textTransform:'uppercase',
                            background: r.sector_tag==='bull' ? '#0d2e1a' : r.sector_tag==='bear' ? '#2e0d0d' : '#1a1a1a',
                            color:       r.sector_tag==='bull' ? '#26a69a' : r.sector_tag==='bear' ? '#ef5350' : '#555',
                          }}>{r.sector_tag || 'neutral'}</span>
                        </div>
                      ) : <span style={{ color:'#333', fontSize:'12px' }}>—</span>}
                    </td>

                    <td style={{ padding:'8px', verticalAlign:'middle' }}>
                      {r.strategy_signal ? (
                        <div>
                          <Badge type={r.strategy_signal.type} />
                          <div style={{ color:'#888', fontSize:'10px', marginTop:'3px' }}>{fmt(r.strategy_signal.time)}</div>
                          <div style={{ color:'#777', fontSize:'11px', marginTop:'1px' }}>₹{r.strategy_signal.price}</div>
                          {r.close_signal && (
                            <div style={{ marginTop:'4px' }}>
                              <Badge type={r.close_signal.type} />
                              <div style={{ color:'#888', fontSize:'10px', marginTop:'2px' }}>{fmt(r.close_signal.time)}</div>
                            </div>
                          )}
                        </div>
                      ) : <span style={{ color:'#333', fontSize:'12px' }}>—</span>}
                    </td>

                    <td style={{ padding:'8px 14px 8px 8px', textAlign:'right', verticalAlign:'middle' }}>
                      {r.pnl !== null ? (
                        <div>
                          <div style={{ color:r.pnl>=0?'#26a69a':'#ef5350', fontWeight:'500', fontSize:'13px' }}>
                            {r.pnl>=0?'+':''}{r.pnl}
                          </div>
                          <div style={{ color:r.pnl>=0?'#1d5c3a':'#5c1d1d', fontSize:'10px' }}>{r.pnl>=0?'Profit':'Loss'}</div>
                        </div>
                      ) : r.strategy_signal && !r.close_signal ? (
                        <div>
                          <div style={{ color:(r.current_price-r.strategy_signal.price)>=0?'#26a69a':'#ef5350', fontSize:'13px', fontWeight:'500' }}>
                            {(r.current_price-r.strategy_signal.price)>=0?'+':''}{r2(r.current_price-r.strategy_signal.price)}
                          </div>
                          <div style={{ color:'#ff9800', fontSize:'10px' }}>Live</div>
                        </div>
                      ) : <span style={{ color:'#444', fontSize:'12px' }}>—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}