import { useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

const WIN    = '#26a69a'
const LOSS   = '#ef5350'
const BLUE   = '#2962ff'
const DIM    = '#1a1a1a'
const MID    = '#555'
const BRIGHT = '#d1d4dc'

var monoStyle  = { fontFamily:'monospace' }
var sectionHdr = { color:'#888', fontSize:'10px', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:'6px' }

// ─── tiny helpers ─────────────────────────────────────────────────────────────
function fmt(v, dec) {
  if (v == null) return '—'
  var n = typeof dec === 'number' ? v.toFixed(dec) : v
  return String(n)
}
function plColor(v) { return v == null ? MID : v >= 0 ? WIN : LOSS }
function Card({ label, children, style }) {
  return (
    <div style={Object.assign({ background:'#111', border:'1px solid '+DIM, borderRadius:'6px', padding:'10px 12px', flex:1, minWidth:80 }, style || {})}>
      <div style={{ color:MID, fontSize:'10px', textTransform:'uppercase', letterSpacing:'0.5px' }}>{label}</div>
      {children}
    </div>
  )
}
function Num({ v, color, size }) {
  return <div style={{ ...monoStyle, fontSize:size||18, fontWeight:600, color:color||BRIGHT, marginTop:3 }}>{v}</div>
}
var chartTooltip = { contentStyle:{ background:'#161616', border:'1px solid #333', fontSize:10 }, labelStyle:{ color:'#888' }, itemStyle:{ color:BRIGHT } }

// ─── TF selector ─────────────────────────────────────────────────────────────
function TFBar({ tfTab, setTfTab }) {
  return (
    <div style={{ display:'flex', gap:'4px', flexShrink:0 }}>
      {['all','15m','30m','1h','3h'].map(function(tf) {
        var active = tfTab === tf
        return (
          <button key={tf} onClick={function() { setTfTab(tf) }} style={{
            background: active ? '#2962ff22' : 'transparent',
            color:      active ? '#5b8dee'   : MID,
            border:    '1px solid ' + (active ? '#2962ff44' : '#222'),
            padding:   '3px 12px', borderRadius:'3px', fontSize:'11px', cursor:'pointer',
          }}>{tf === 'all' ? 'All TFs' : tf}</button>
        )
      })}
    </div>
  )
}

// ─── KPI row ─────────────────────────────────────────────────────────────────
function KpiRow({ b, openCount }) {
  return (
    <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
      <Card label="Trades">        <Num v={b.total} /></Card>
      <Card label="Win Rate">      <Num v={fmt(b.win_rate,1)+'%'} color={plColor(b.win_rate - 50)} /></Card>
      <Card label="Net P/L">       <Num v={(b.net>=0?'+':'')+fmt(b.net,2)} color={plColor(b.net)} /></Card>
      <Card label="Profit Factor"> <Num v={fmt(b.profit_factor,2)} color={b.profit_factor>=1?WIN:b.profit_factor!=null?LOSS:MID} /></Card>
      <Card label="Expectancy">    <Num v={(b.expectancy>=0?'+':'')+fmt(b.expectancy,2)} color={plColor(b.expectancy)} /></Card>
      <Card label="Open Pos.">     <Num v={openCount} color={'#ff9800'} /></Card>
      <Card label="Wins / Losses" style={{ minWidth:130 }}>
        <div style={{ display:'flex', gap:'8px', marginTop:3 }}>
          <span style={{ ...monoStyle, fontSize:18, fontWeight:600, color:WIN  }}>{b.wins}</span>
          <span style={{ color:MID, alignSelf:'center' }}>/</span>
          <span style={{ ...monoStyle, fontSize:18, fontWeight:600, color:LOSS }}>{b.losses}</span>
        </div>
      </Card>
    </div>
  )
}

// ─── Win/Loss section ────────────────────────────────────────────────────────
function WinLossSection({ b, allBuckets, tfTab }) {
  var donutData = [
    { name:'Wins',     value: b.wins   },
    { name:'Losses',   value: b.losses },
    { name:'Breakeven',value: b.breakeven },
  ].filter(function(d) { return d.value > 0 })
  var donutColors = [WIN, LOSS, MID]

  var crossData = ['15m','30m','1h','3h'].map(function(tf) {
    var bkt = allBuckets[tf] || {}
    return { tf, Wins: bkt.wins||0, Losses: bkt.losses||0 }
  })

  return (
    <div style={{ background:'#111', border:'1px solid '+DIM, borderRadius:'6px', padding:'10px 12px', flex:'0 0 auto', minWidth:260 }}>
      <div style={sectionHdr}>Win / Loss</div>
      <div style={{ display:'flex', gap:'12px', alignItems:'center' }}>
        <PieChart width={130} height={130}>
          <Pie data={donutData} cx={65} cy={65} innerRadius={38} outerRadius={58} dataKey="value" startAngle={90} endAngle={-270}>
            {donutData.map(function(_, i) { return <Cell key={i} fill={donutColors[i]} /> })}
          </Pie>
          <Tooltip {...chartTooltip} />
        </PieChart>
        <div style={{ fontSize:11 }}>
          <div style={{ color:WIN,  marginBottom:4 }}>▲ {b.wins} Wins ({fmt(b.win_rate,1)}%)</div>
          <div style={{ color:LOSS, marginBottom:4 }}>▼ {b.losses} Losses</div>
          {b.breakeven > 0 && <div style={{ color:MID }}>= {b.breakeven} B/E</div>}
        </div>
      </div>
      {tfTab === 'all' && (
        <div style={{ marginTop:10 }}>
          <div style={{ color:MID, fontSize:'10px', marginBottom:4 }}>By timeframe</div>
          <ResponsiveContainer width="100%" height={90}>
            <BarChart data={crossData} barCategoryGap="30%" barGap={2}>
              <XAxis dataKey="tf" tick={{ fill:MID, fontSize:9 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip {...chartTooltip} />
              <Bar dataKey="Wins"   fill={WIN}  radius={[2,2,0,0]} maxBarSize={20} />
              <Bar dataKey="Losses" fill={LOSS} radius={[2,2,0,0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ─── Equity curve ─────────────────────────────────────────────────────────────
function EquitySection({ b }) {
  var lineColor = (b.net || 0) >= 0 ? WIN : LOSS
  return (
    <div style={{ background:'#111', border:'1px solid '+DIM, borderRadius:'6px', padding:'10px 12px', flex:1, minWidth:0 }}>
      <div style={sectionHdr}>Equity Curve (cumulative P/L)</div>
      {b.equity_curve.length < 2
        ? <div style={{ color:MID, fontSize:'11px', paddingTop:40, textAlign:'center' }}>Not enough data</div>
        : (
          <ResponsiveContainer width="100%" height={170}>
            <LineChart data={b.equity_curve}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
              <XAxis dataKey="t" hide />
              <YAxis tick={{ fill:MID, fontSize:9 }} width={48} tickFormatter={function(v) { return v.toFixed(0) }} />
              <Tooltip {...chartTooltip} formatter={function(v) { return [v.toFixed(2), 'Cum P/L'] }} labelFormatter={function() { return '' }} />
              <Line type="monotone" dataKey="cum_pl" stroke={lineColor} dot={false} strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )
      }
    </div>
  )
}

// ─── Holding time ─────────────────────────────────────────────────────────────
function HoldingRow({ b }) {
  function HoldCard({ label, item }) {
    return (
      <Card label={label}>
        <Num v={item ? fmt(item.min,0)+'m' : '—'} size={16} />
        {item && <div style={{ color:'#666', fontSize:'10px', marginTop:3 }}>{item.symbol} {item.leg} {item.timeframe}</div>}
      </Card>
    )
  }
  return (
    <div style={{ display:'flex', gap:'8px' }}>
      <Card label="Avg Hold"><Num v={b.avg_holding != null ? fmt(b.avg_holding,0)+'m' : '—'} size={16} /></Card>
      <HoldCard label="Shortest Hold" item={b.shortest} />
      <HoldCard label="Longest Hold"  item={b.longest}  />
    </div>
  )
}

// ─── Top 10 tables ────────────────────────────────────────────────────────────
function Top10Row({ b }) {
  function Table({ trades, color, title }) {
    if (!trades || trades.length === 0) {
      return (
        <div style={{ flex:1, background:'#111', border:'1px solid '+DIM, borderRadius:'6px', padding:'10px 12px' }}>
          <div style={sectionHdr}>{title}</div>
          <div style={{ color:MID, fontSize:'11px' }}>None</div>
        </div>
      )
    }
    var thS = { padding:'4px 6px', color:MID, fontWeight:400, fontSize:'10px', textAlign:'left', borderBottom:'1px solid '+DIM, background:'#0d0d0d', position:'sticky', top:0 }
    var tdS = { padding:'4px 6px', fontSize:'11px', fontFamily:'monospace' }
    return (
      <div style={{ flex:1, background:'#111', border:'1px solid '+DIM, borderRadius:'6px', padding:'10px 12px', minWidth:0 }}>
        <div style={sectionHdr}>{title}</div>
        <div style={{ overflowX:'auto', maxHeight:220, overflowY:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                <th style={thS}>Symbol</th>
                <th style={thS}>Leg · Strike</th>
                <th style={thS}>TF</th>
                <th style={{ ...thS, textAlign:'right' }}>P/L</th>
                <th style={{ ...thS, textAlign:'right' }}>%</th>
                <th style={{ ...thS, textAlign:'right' }}>Hold</th>
              </tr>
            </thead>
            <tbody>
              {trades.map(function(t, i) {
                return (
                  <tr key={i} style={{ borderBottom:'1px solid #111' }}>
                    <td style={{ ...tdS, color:BRIGHT, fontWeight:500 }}>{t.symbol}</td>
                    <td style={{ ...tdS, color:'#888' }}>{t.leg} {t.strike}</td>
                    <td style={{ ...tdS, color:'#666' }}>{t.timeframe}</td>
                    <td style={{ ...tdS, textAlign:'right', color:color }}>{t.pl != null ? (t.pl>=0?'+':'')+t.pl.toFixed(2) : '—'}</td>
                    <td style={{ ...tdS, textAlign:'right', color:color, opacity:0.8 }}>{t.pl_pct != null ? (t.pl_pct>=0?'+':'')+t.pl_pct.toFixed(1)+'%' : '—'}</td>
                    <td style={{ ...tdS, textAlign:'right', color:MID }}>{t.holding_min != null ? t.holding_min+'m' : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }
  return (
    <div style={{ display:'flex', gap:'10px' }}>
      <Table trades={b.top_winners} color={WIN}  title="Top 10 Winners" />
      <Table trades={b.top_losers}  color={LOSS} title="Top 10 Losers"  />
    </div>
  )
}

// ─── Extras row ───────────────────────────────────────────────────────────────
function ExtrasRow({ b }) {
  // CE vs PE donut
  var cevpeData = [
    { name:'CE', value: b.ce_vs_pe.CE.count },
    { name:'PE', value: b.ce_vs_pe.PE.count },
  ].filter(function(d) { return d.value > 0 })

  // Symbol bar (best + worst combined, sorted by net)
  var symData = (b.best_symbols || []).concat(b.worst_symbols || [])
  symData.sort(function(a, b) { return b.net - a.net })

  return (
    <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>

      {/* CE vs PE */}
      <div style={{ background:'#111', border:'1px solid '+DIM, borderRadius:'6px', padding:'10px 12px', minWidth:200, flex:1 }}>
        <div style={sectionHdr}>CE vs PE</div>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          <PieChart width={100} height={100}>
            <Pie data={cevpeData} cx={50} cy={50} innerRadius={28} outerRadius={44} dataKey="value" startAngle={90} endAngle={-270}>
              <Cell fill={WIN}  />
              <Cell fill={LOSS} />
            </Pie>
            <Tooltip {...chartTooltip} />
          </PieChart>
          <div style={{ fontSize:11 }}>
            <div style={{ color:WIN,  marginBottom:4 }}>CE {b.ce_vs_pe.CE.count} trades · net {(b.ce_vs_pe.CE.net>=0?'+':'')+fmt(b.ce_vs_pe.CE.net,2)}</div>
            <div style={{ color:LOSS }}>PE {b.ce_vs_pe.PE.count} trades · net {(b.ce_vs_pe.PE.net>=0?'+':'')+fmt(b.ce_vs_pe.PE.net,2)}</div>
          </div>
        </div>
      </div>

      {/* Best/Worst symbols */}
      <div style={{ background:'#111', border:'1px solid '+DIM, borderRadius:'6px', padding:'10px 12px', minWidth:220, flex:1 }}>
        <div style={sectionHdr}>By Symbol (net P/L)</div>
        {symData.length === 0
          ? <div style={{ color:MID, fontSize:11 }}>—</div>
          : (
            <ResponsiveContainer width="100%" height={Math.max(80, symData.length * 22)}>
              <BarChart layout="vertical" data={symData} margin={{ left:0, right:8, top:0, bottom:0 }}>
                <XAxis type="number" tick={{ fill:MID, fontSize:9 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="symbol" tick={{ fill:'#aaa', fontSize:9 }} width={64} />
                <Tooltip {...chartTooltip} formatter={function(v) { return [v.toFixed(2), 'Net P/L'] }} />
                <Bar dataKey="net" radius={[0,2,2,0]} maxBarSize={14}>
                  {symData.map(function(d, i) { return <Cell key={i} fill={d.net >= 0 ? WIN : LOSS} /> })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )
        }
      </div>

      {/* P/L histogram */}
      <div style={{ background:'#111', border:'1px solid '+DIM, borderRadius:'6px', padding:'10px 12px', minWidth:200, flex:1 }}>
        <div style={sectionHdr}>P/L Distribution</div>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={b.pl_histogram} margin={{ left:0, right:0, top:0, bottom:0 }}>
            <XAxis dataKey="range" tick={{ fill:MID, fontSize:8 }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip {...chartTooltip} formatter={function(v) { return [v, 'Trades'] }} />
            <Bar dataKey="count" radius={[2,2,0,0]}>
              {b.pl_histogram.map(function(d, i) {
                var pos = d.range.startsWith('0') || d.range.startsWith('>') || d.range === '20..50'
                return <Cell key={i} fill={pos ? WIN : LOSS} />
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* By entry hour */}
      <div style={{ background:'#111', border:'1px solid '+DIM, borderRadius:'6px', padding:'10px 12px', minWidth:200, flex:1 }}>
        <div style={sectionHdr}>P/L by Entry Hour (IST)</div>
        {b.by_hour.length === 0
          ? <div style={{ color:MID, fontSize:11 }}>—</div>
          : (
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={b.by_hour} margin={{ left:0, right:0, top:0, bottom:0 }}>
                <XAxis dataKey="hour" tick={{ fill:MID, fontSize:9 }} tickFormatter={function(h) { return h+'h' }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip {...chartTooltip} formatter={function(v, name) { return [typeof v === 'number' ? v.toFixed(2) : v, name] }} />
                <Bar dataKey="net" name="Net P/L" radius={[2,2,0,0]}>
                  {b.by_hour.map(function(d, i) { return <Cell key={i} fill={d.net >= 0 ? WIN : LOSS} /> })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )
        }
      </div>

    </div>
  )
}

// ─── Insights ─────────────────────────────────────────────────────────────────
function InsightsCard({ b }) {
  if (!b.insights || b.insights.length === 0) return null
  return (
    <div style={{ background:'#111', border:'1px solid #2962ff33', borderRadius:'6px', padding:'10px 14px' }}>
      <div style={{ color:'#5b8dee', fontSize:'10px', textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:'8px' }}>Insights</div>
      <ul style={{ margin:0, paddingLeft:16, listStyle:'disc' }}>
        {b.insights.map(function(s, i) {
          return <li key={i} style={{ color:'#aaa', fontSize:'12px', marginBottom:'4px' }}>{s}</li>
        })}
      </ul>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function AnalyticsView({ data }) {
  var [tfTab, setTfTab] = useState('all')

  if (!data || data.loading) {
    return (
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#444', fontSize:'12px', fontFamily:'system-ui,sans-serif' }}>
        Computing analytics — please wait...
      </div>
    )
  }

  var bucket = data.buckets && data.buckets[tfTab]
  var noData = !bucket || bucket.total === 0

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden', fontFamily:'system-ui,"Segoe UI",sans-serif', background:'#0d0d0d' }}>

      {/* TF selector */}
      <div style={{ display:'flex', alignItems:'center', gap:'6px', padding:'6px 12px', background:'#111', borderBottom:'1px solid '+DIM, flexShrink:0 }}>
        <TFBar tfTab={tfTab} setTfTab={setTfTab} />
        {data.open_count > 0 && (
          <span style={{ marginLeft:'auto', color:'#ff9800', fontSize:'10px' }}>{data.open_count} open position{data.open_count !== 1 ? 's' : ''}</span>
        )}
      </div>

      {noData ? (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#444', fontSize:'12px', padding:'0 20px', textAlign:'center' }}>
          No closed trades yet for {tfTab === 'all' ? 'any timeframe' : tfTab} — let signals complete a buy→sell cycle.
        </div>
      ) : (
        <div style={{ flex:1, overflowY:'auto', padding:'10px 12px', display:'flex', flexDirection:'column', gap:'10px' }}>
          <KpiRow b={bucket} openCount={data.open_count} />
          <div style={{ display:'flex', gap:'10px', alignItems:'flex-start' }}>
            <WinLossSection b={bucket} allBuckets={data.buckets} tfTab={tfTab} />
            <EquitySection b={bucket} />
          </div>
          <HoldingRow b={bucket} />
          <Top10Row b={bucket} />
          <ExtrasRow b={bucket} />
          <InsightsCard b={bucket} />
        </div>
      )}
    </div>
  )
}
