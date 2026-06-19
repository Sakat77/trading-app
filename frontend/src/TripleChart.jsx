import { useEffect, useRef, useState } from 'react'
import { createChart, CandlestickSeries, LineSeries, createSeriesMarkers } from 'lightweight-charts'

const TIMEFRAMES    = ['15min', '30min', '1hour', '3hour']
const IST_OFFSET    = 19800 // UTC+5:30 in seconds
const RIGHT_PADDING = 60    // empty bars kept to the right of the last candle (~40% of view)
const TF_LABELS  = { '15min': '15m', '30min': '30m', '1hour': '1h', '3hour': '3h' }

const INDEX_MAP = {
  'NIFTY50':    'NSE:NIFTY50-INDEX',
  'NIFTY':      'NSE:NIFTY50-INDEX',
  'BANKNIFTY':  'NSE:BANKNIFTY-INDEX',
  'FINNIFTY':   'NSE:FINNIFTY-INDEX',
  'MIDCPNIFTY': 'NSE:MIDCPNIFTY-INDEX',
}

function toFyers(name) {
  var u = name.trim().toUpperCase()
  return INDEX_MAP[u] || ('NSE:' + u + '-EQ')
}

const QUICK = [
  'RELIANCE','TCS','HDFCBANK','ICICIBANK','SBIN','INFY',
  'AXISBANK','BAJFINANCE','TATAMOTORS','WIPRO',
  'NIFTY50','BANKNIFTY',
]

const CHART_BASE = {
  layout:          { background:{ color:'#0f0f0f' }, textColor:'#d1d4dc' },
  grid:            { vertLines:{ color:'#1a1a1a' }, horzLines:{ color:'#1a1a1a' } },
  rightPriceScale: { borderColor:'#2a2a2a', minimumWidth:60 },
  crosshair:       { mode: 1 },
}

// Apply data from a triple_chart response block to a column's series
function applyColData(sr, data, sdRef) {
  if (!sr || !data || !data.candles) return

  sr.candles.setData(data.candles.map(function(c) {
    return { time:c.time+IST_OFFSET, open:c.open, high:c.high, low:c.low, close:c.close }
  }))

  // Buy/sell arrow markers
  var markers = []
  function mkM(signals, buyC, sellC) {
    if (!signals) return
    signals.forEach(function(sig) {
      if (sig.type === 'buy')  markers.push({ time:sig.time+IST_OFFSET, position:'belowBar', color:buyC,  shape:'arrowUp',   text:'B' })
      if (sig.type === 'sell') markers.push({ time:sig.time+IST_OFFSET, position:'aboveBar', color:sellC, shape:'arrowDown', text:'S' })
    })
  }
  mkM(data.signals1, '#00ff00', '#ff0000')
  mkM(data.signals2, '#00ffff', '#ff6600')
  markers.sort(function(a,b){ return a.time - b.time })
  if (markers.length > 0) {
    if (sr._markers) sr._markers.setMarkers(markers)
    else sr._markers = createSeriesMarkers(sr.candles, markers)
  } else if (sr._markers) {
    sr._markers.setMarkers([])
  }

  if (data.custom1) {
    sr.c1L1.setData(data.custom1.map(function(c){ return c.line1 !== null ? {time:c.time+IST_OFFSET,value:c.line1} : {time:c.time+IST_OFFSET} }))
    sr.c1L2.setData(data.custom1.map(function(c){ return c.line2 !== null ? {time:c.time+IST_OFFSET,value:c.line2} : {time:c.time+IST_OFFSET} }))
  }
  if (data.custom2) {
    sr.c2L1.setData(data.custom2.map(function(c){ return c.line1 !== null ? {time:c.time+IST_OFFSET,value:c.line1} : {time:c.time+IST_OFFSET} }))
    sr.c2L2.setData(data.custom2.map(function(c){ return c.line2 !== null ? {time:c.time+IST_OFFSET,value:c.line2} : {time:c.time+IST_OFFSET} }))
  }
  if (data.xma) {
    function xf(k) {
      return data.xma.map(function(x){ return x[k] !== null ? {time:x.time+IST_OFFSET,value:x[k]} : {time:x.time+IST_OFFSET} })
    }
    sr.xmaPl.setData(xf('priceline'))
    sr.xmaBl.setData(xf('breakline'))
    sr.xmaCl.setData(xf('cycleline'))
    sr.xmaTl.setData(xf('trendline'))
    sr.xmaR1.setData(xf('res1'))
    sr.xmaS1.setData(xf('sup1'))
    sr.xmaR2.setData(xf('res2'))
    sr.xmaS2.setData(xf('sup2'))
  }

  // SD zones
  sdRef.forEach(function(pl){ try { sr.candles.removePriceLine(pl) } catch(e){} })
  sdRef.length = 0
  if (data.sd_zones) {
    data.sd_zones.forEach(function(zone) {
      var color = zone.type === 'support' ? 'rgba(47,79,79,0.5)' : 'rgba(105,105,105,0.5)'
      try {
        sdRef.push(sr.candles.createPriceLine({price:zone.hi,color,lineWidth:1,lineStyle:2,axisLabelVisible:false,title:''}))
        sdRef.push(sr.candles.createPriceLine({price:zone.lo,color,lineWidth:1,lineStyle:2,axisLabelVisible:false,title:''}))
      } catch(e){}
    })
  }
}

export default function TripleChart({ ws, wsReady, active }) {
  // DOM refs — 3 columns × (main + c1 pane + c2 pane)
  var stockMainRef = useRef(null), stockC1Ref = useRef(null), stockC2Ref = useRef(null)
  var ceMainRef    = useRef(null), ceC1Ref    = useRef(null), ceC2Ref    = useRef(null)
  var peMainRef    = useRef(null), peC1Ref    = useRef(null), peC2Ref    = useRef(null)

  // Internal chart/series state (not React state — lives in refs)
  var allChartsRef    = useRef([])
  var seriesRef       = useRef({ stock: null, ce: null, pe: null })
  var sdRef           = useRef({ stock: [], ce: [], pe: [] })
  var scrollTrackRef  = useRef(null)
  var scrollThumbRef  = useRef(null)
  var goLatestRef     = useRef(null)
  var totalBarsRef    = useRef(0)
  var scrollDragRef   = useRef(null)

  // React UI state
  var [symbol,    setSymbol]    = useState('NSE:RELIANCE-EQ')
  var [input,     setInput]     = useState('RELIANCE')
  var [timeframe, setTimeframe] = useState('15min')
  var [loading,   setLoading]   = useState(false)
  var [info,      setInfo]      = useState(null)

  // ── Initialize all 9 chart instances once on mount ──────────────────────
  useEffect(function() {
    var els = [stockMainRef,stockC1Ref,stockC2Ref,ceMainRef,ceC1Ref,ceC2Ref,peMainRef,peC1Ref,peC2Ref]
    if (els.some(function(r){ return !r.current })) return

    function makeCol(mainEl, c1El, c2El, showTime) {
      var main = createChart(mainEl, Object.assign({}, CHART_BASE, {
        width:     mainEl.clientWidth  || 400,
        height:    mainEl.clientHeight || 300,
        timeScale: { timeVisible: true, secondsVisible: false, borderColor: '#2a2a2a', rightOffset: RIGHT_PADDING },
        handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: false, price: true } },
      }))
      var c1C = createChart(c1El, Object.assign({}, CHART_BASE, {
        width: c1El.clientWidth || 400, height: 90,
        timeScale: { visible: false, rightOffset: RIGHT_PADDING },
        handleScroll: false, handleScale: false,
        rightPriceScale: { borderColor:'#2a2a2a', minimumWidth:60, scaleMargins:{ top:0.1, bottom:0.1 } },
      }))
      var c2C = createChart(c2El, Object.assign({}, CHART_BASE, {
        width: c2El.clientWidth || 400, height: 90,
        timeScale: { visible: showTime, timeVisible: showTime, secondsVisible: false, borderColor:'#2a2a2a', rightOffset: RIGHT_PADDING },
        handleScroll: false, handleScale: false,
        rightPriceScale: { borderColor:'#2a2a2a', minimumWidth:60, scaleMargins:{ top:0.1, bottom:0.1 } },
      }))

      var candles = main.addSeries(CandlestickSeries, {
        upColor:'#26a69a', downColor:'#ef5350', borderVisible:false,
        wickUpColor:'#26a69a', wickDownColor:'#ef5350',
      })
      var xmaPl = main.addSeries(LineSeries, { color:'#3CB371', lineWidth:2, lastValueVisible:false, priceLineVisible:false })
      var xmaBl = main.addSeries(LineSeries, { color:'#3C6B3C', lineWidth:1, lastValueVisible:false, priceLineVisible:false })
      var xmaCl = main.addSeries(LineSeries, { color:'#1246B4', lineWidth:2, lastValueVisible:false, priceLineVisible:false })
      var xmaTl = main.addSeries(LineSeries, { color:'#8B0000', lineWidth:2, lastValueVisible:false, priceLineVisible:false })
      var xmaR1 = main.addSeries(LineSeries, { color:'#207860', lineWidth:1, lineStyle:2, lastValueVisible:false, priceLineVisible:false })
      var xmaS1 = main.addSeries(LineSeries, { color:'#207860', lineWidth:1, lineStyle:2, lastValueVisible:false, priceLineVisible:false })
      var xmaR2 = main.addSeries(LineSeries, { color:'#207860', lineWidth:1, lineStyle:2, lastValueVisible:false, priceLineVisible:false })
      var xmaS2 = main.addSeries(LineSeries, { color:'#207860', lineWidth:1, lineStyle:2, lastValueVisible:false, priceLineVisible:false })

      var c1L1 = c1C.addSeries(LineSeries, { color:'#1e90ff', lineWidth:2 })
      var c1L2 = c1C.addSeries(LineSeries, { color:'#8b0000', lineWidth:2 })
      var c2L1 = c2C.addSeries(LineSeries, { color:'#00bcd4', lineWidth:2 })
      var c2L2 = c2C.addSeries(LineSeries, { color:'#ff5722', lineWidth:2 })

      return {
        charts: [main, c1C, c2C],
        series: { candles, c1L1, c1L2, c2L1, c2L2, xmaPl, xmaBl, xmaCl, xmaTl, xmaR1, xmaS1, xmaR2, xmaS2 },
      }
    }

    var stock = makeCol(stockMainRef.current, stockC1Ref.current, stockC2Ref.current, false)
    var ce    = makeCol(ceMainRef.current,    ceC1Ref.current,    ceC2Ref.current,    false)
    var pe    = makeCol(peMainRef.current,    peC1Ref.current,    peC2Ref.current,    true)

    seriesRef.current.stock = stock.series
    seriesRef.current.ce    = ce.series
    seriesRef.current.pe    = pe.series

    var all = stock.charts.concat(ce.charts).concat(pe.charts)
    allChartsRef.current = all

    // ── Sync timescales: time-range across columns, logical-range within each column ──
    var syncing = false
    var columns = [
      { main: all[0], panes: [all[1], all[2]] },
      { main: all[3], panes: [all[4], all[5]] },
      { main: all[6], panes: [all[7], all[8]] },
    ]
    function syncFrom(srcMain, tr) {
      columns.forEach(function(col){
        if (col.main !== srcMain) {
          try { col.main.timeScale().setVisibleRange(tr) } catch(e){}
        }
        var lr = col.main.timeScale().getVisibleLogicalRange()
        if (lr) col.panes.forEach(function(p){ try { p.timeScale().setVisibleLogicalRange(lr) } catch(e){} })
      })
    }
    columns.forEach(function(col){
      col.main.timeScale().subscribeVisibleTimeRangeChange(function(tr){
        if (syncing || !tr) return
        syncing = true
        syncFrom(col.main, tr)
        syncing = false
      })
    })

    // ── Scrollbar + go-to-latest tracking (DOM-direct, no setState) ─────────
    var stockMain = stock.charts[0]
    stockMain.timeScale().subscribeVisibleLogicalRangeChange(function(range) {
      if (!range) return
      var total = totalBarsRef.current
      if (total <= 0) return
      var visible = range.to - range.from
      var thumbW = Math.max(3, Math.min(100, (visible / total) * 100))
      var thumbL = Math.max(0, Math.min(100 - thumbW, (Math.max(0, range.from) / total) * 100))
      if (scrollThumbRef.current) {
        scrollThumbRef.current.style.left  = thumbL + '%'
        scrollThumbRef.current.style.width = thumbW + '%'
      }
      var atLatest = range.to >= total - 1 + RIGHT_PADDING - 2
      if (goLatestRef.current) {
        goLatestRef.current.style.opacity      = atLatest ? '0' : '1'
        goLatestRef.current.style.pointerEvents = atLatest ? 'none' : 'auto'
      }
    })

    // ── Task 3: double-click on any column = auto-align + auto-scale ─────────
    function dblClickHandler() {
      var total = totalBarsRef.current
      if (!total) return
      var range = stockMain.timeScale().getVisibleLogicalRange()
      var visibleBars = range ? Math.round(range.to - range.from) : 120
      stockMain.timeScale().setVisibleLogicalRange({
        from: total - visibleBars + RIGHT_PADDING,
        to:   total - 1 + RIGHT_PADDING,
      })
      try { stockMain.priceScale('right').applyOptions({ autoScale: true }) } catch(e){}
      try { ce.charts[0].priceScale('right').applyOptions({ autoScale: true }) } catch(e){}
      try { pe.charts[0].priceScale('right').applyOptions({ autoScale: true }) } catch(e){}
    }
    stockMainRef.current.addEventListener('dblclick', dblClickHandler)
    ceMainRef.current.addEventListener('dblclick', dblClickHandler)
    peMainRef.current.addEventListener('dblclick', dblClickHandler)

    // ── Crosshair sync across the 3 main charts ─────────────────────────────
    var mains = [stock.charts[0], ce.charts[0], pe.charts[0]]
    var mSeries = [stock.series.candles, ce.series.candles, pe.series.candles]
    var csync = false
    mains.forEach(function(chart, i) {
      chart.subscribeCrosshairMove(function(param) {
        if (csync) return
        csync = true
        mains.forEach(function(other, j) {
          if (j === i) return
          if (param.time) {
            try { other.setCrosshairPosition(NaN, param.time, mSeries[j]) } catch(e){}
          } else {
            try { other.clearCrosshairPosition() } catch(e){}
          }
        })
        csync = false
      })
    })

    // ── ResizeObserver ──────────────────────────────────────────────────────
    var ro = new ResizeObserver(function() {
      var cols = [
        { mainEl: stockMainRef.current, charts: stock.charts },
        { mainEl: ceMainRef.current,    charts: ce.charts    },
        { mainEl: peMainRef.current,    charts: pe.charts    },
      ]
      cols.forEach(function(col) {
        var el = col.mainEl
        if (!el || el.clientWidth <= 0) return
        var w = el.clientWidth
        var h = el.clientHeight || 300
        try { col.charts[0].resize(w, h) } catch(e){}
        try { col.charts[1].resize(w, 90) } catch(e){}
        try { col.charts[2].resize(w, 90) } catch(e){}
      })
    })
    ro.observe(stockMainRef.current)
    ro.observe(ceMainRef.current)
    ro.observe(peMainRef.current)

    return function() {
      ro.disconnect()
      all.forEach(function(c){ try { c.remove() } catch(e){} })
    }
  }, [])

  // ── WebSocket message listener ───────────────────────────────────────────
  useEffect(function() {
    if (!ws) return
    function onMsg(e) {
      var d = JSON.parse(e.data)
      if (d.type !== 'triple_chart') return
      setLoading(false)
      setInfo({ symbol:d.symbol, underlying:d.underlying, ce_strike:d.ce_strike, pe_strike:d.pe_strike, expiry:d.expiry })
      applyColData(seriesRef.current.stock, d.stock, sdRef.current.stock)
      applyColData(seriesRef.current.ce,    d.ce,    sdRef.current.ce)
      applyColData(seriesRef.current.pe,    d.pe,    sdRef.current.pe)
      // Show latest 120 candles; time-range sync propagates to all 8 other charts
      var total = d.stock && d.stock.candles ? d.stock.candles.length : 0
      totalBarsRef.current = total
      if (total > 0) {
        setTimeout(function() {
          var first = allChartsRef.current[0]
          if (first) { try { first.timeScale().setVisibleLogicalRange({ from: total - 121, to: total - 1 + RIGHT_PADDING }) } catch(e){} }
        }, 50)
      }
    }
    ws.addEventListener('message', onMsg)
    return function() { ws.removeEventListener('message', onMsg) }
  }, [ws])

  function sendLoad(sym, tf) {
    if (!ws || ws.readyState !== 1) return
    setLoading(true)
    ws.send(JSON.stringify({ type:'get_triple_chart', symbol:sym, timeframe:tf }))
  }

  function handleLoad() {
    var sym = toFyers(input)
    setSymbol(sym)
    sendLoad(sym, timeframe)
  }

  function handleQuick(name) {
    var sym = toFyers(name)
    setInput(name)
    setSymbol(sym)
    sendLoad(sym, timeframe)
  }

  function handleTF(tf) {
    setTimeframe(tf)
    sendLoad(symbol, tf)
  }

  function handleGoLatest() {
    var first = allChartsRef.current[0]
    if (!first || totalBarsRef.current <= 0) return
    var total = totalBarsRef.current
    var range = first.timeScale().getVisibleLogicalRange()
    var visibleBars = range ? Math.round(range.to - range.from) : 120
    first.timeScale().setVisibleLogicalRange({ from: total - visibleBars + RIGHT_PADDING, to: total - 1 + RIGHT_PADDING })
    try { first.priceScale('right').applyOptions({ autoScale: true }) } catch(e){}
  }

  function handleScrollbarDown(e) {
    if (e.target !== scrollTrackRef.current) return
    var first = allChartsRef.current[0]
    if (!first || totalBarsRef.current <= 0) return
    var track = scrollTrackRef.current.getBoundingClientRect()
    var ratio = (e.clientX - track.left) / track.width
    var total = totalBarsRef.current
    var range = first.timeScale().getVisibleLogicalRange()
    var visibleBars = range ? Math.round(range.to - range.from) : 120
    var newFrom = Math.round(ratio * total - visibleBars / 2)
    newFrom = Math.max(0, Math.min(total - visibleBars + RIGHT_PADDING, newFrom))
    first.timeScale().setVisibleLogicalRange({ from: newFrom, to: newFrom + visibleBars - 1 })
  }

  function handleThumbDown(e) {
    e.stopPropagation()
    var first = allChartsRef.current[0]
    if (!first) return
    var range = first.timeScale().getVisibleLogicalRange()
    scrollDragRef.current = { x: e.clientX, from: range ? range.from : 0, visibleBars: range ? range.to - range.from : 120 }

    function onMove(me) {
      if (!scrollDragRef.current || !scrollTrackRef.current) return
      var track = scrollTrackRef.current.getBoundingClientRect()
      var deltaX = me.clientX - scrollDragRef.current.x
      var total = totalBarsRef.current
      var deltaBars = (deltaX / track.width) * total
      var vb = scrollDragRef.current.visibleBars
      var newFrom = scrollDragRef.current.from + deltaBars
      newFrom = Math.max(0, Math.min(total - vb + RIGHT_PADDING, newFrom))
      allChartsRef.current[0].timeScale().setVisibleLogicalRange({ from: newFrom, to: newFrom + vb - 1 })
    }
    function onUp() {
      scrollDragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function ColHeader({ label, color, sub }) {
    return (
      <div style={{ padding:'5px 10px', background:'#111', borderBottom:'1px solid #1a1a1a', flexShrink:0 }}>
        <div style={{ color:color, fontSize:'12px', fontWeight:'600', letterSpacing:'.3px' }}>{label}</div>
        {sub && <div style={{ color:'#555', fontSize:'10px', marginTop:'1px' }}>{sub}</div>}
      </div>
    )
  }

  function PaneLabel({ label, color }) {
    return <div style={{ color:color, fontSize:'9px', fontWeight:'500', padding:'1px 8px', background:'#0d0d0d', flexShrink:0 }}>{label}</div>
  }

  var stockLabel = info ? (info.underlying || 'Stock') + ' — Equity' : 'Stock'
  var stockSub   = info ? info.symbol : 'Select symbol above'
  var ceLabel    = info ? 'CALL ' + (info.ce_strike || '—') : 'CE'
  var ceSub      = info ? 'ATM Call · Exp ' + (info.expiry || '—') : 'ATM Call option'
  var peLabel    = info ? 'PUT ' + (info.pe_strike || '—') : 'PE'
  var peSub      = info ? 'ATM Put · Exp ' + (info.expiry || '—') : 'ATM Put option'

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#0a0a0a', overflow:'hidden', fontFamily:'system-ui,"Segoe UI",sans-serif' }}>

      {/* Control bar */}
      <div style={{ padding:'7px 12px', background:'#111', borderBottom:'1px solid #1a1a1a', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' }}>
          <span style={{ color:'#d1d4dc', fontSize:'13px', fontWeight:'500', flexShrink:0 }}>3-Chart</span>

          {/* Quick-select symbols */}
          <div style={{ display:'flex', gap:'3px', flexWrap:'wrap' }}>
            {QUICK.map(function(name) {
              var active = toFyers(name) === symbol
              return (
                <button key={name} onClick={function(){ handleQuick(name) }} style={{
                  background: active ? '#26a69a' : '#1a1a1a',
                  color:      active ? '#000' : '#888',
                  border:     '1px solid ' + (active ? '#26a69a' : '#2a2a2a'),
                  padding:'2px 8px', borderRadius:'3px', fontSize:'11px', cursor:'pointer',
                }}>{name}</button>
              )
            })}
          </div>

          {/* Manual input */}
          <div style={{ display:'flex', gap:'4px', alignItems:'center' }}>
            <input value={input} onChange={function(e){ setInput(e.target.value) }}
              onKeyDown={function(e){ if(e.key==='Enter') handleLoad() }}
              placeholder="Symbol..."
              style={{ background:'#1a1a1a', color:'#d1d4dc', border:'1px solid #2a2a2a', padding:'3px 8px', borderRadius:'4px', fontSize:'12px', width:'110px' }} />
            <button onClick={handleLoad} style={{ background:'#26a69a', color:'#000', border:'none', padding:'4px 12px', borderRadius:'4px', fontSize:'12px', cursor:'pointer', fontWeight:'500' }}>Load</button>
          </div>

          {/* Timeframe */}
          <div style={{ display:'flex', gap:'3px' }}>
            {TIMEFRAMES.map(function(tf) {
              return (
                <button key={tf} onClick={function(){ handleTF(tf) }} style={{
                  background: timeframe===tf ? '#2962ff' : '#1a1a1a',
                  color:      timeframe===tf ? '#fff' : '#888',
                  border:     '1px solid ' + (timeframe===tf ? '#2962ff' : '#2a2a2a'),
                  padding:'3px 9px', borderRadius:'4px', fontSize:'11px', cursor:'pointer',
                }}>{TF_LABELS[tf]}</button>
              )
            })}
          </div>

          {loading && <span style={{ color:'#555', fontSize:'11px' }}>Loading...</span>}
          {!info && !loading && wsReady && <span style={{ color:'#444', fontSize:'11px' }}>Select a symbol to load all 3 charts</span>}
          {!wsReady && <span style={{ color:'#ef5350', fontSize:'11px' }}>Disconnected</span>}

          {/* Go-to-latest button — right side of control bar */}
          <div style={{ marginLeft:'auto' }}>
            <button ref={goLatestRef} onClick={handleGoLatest} title="Jump to latest candle"
              style={{
                background:'rgba(41,98,255,0.85)', color:'#fff', border:'none',
                borderRadius:'50%', width:'26px', height:'26px', cursor:'pointer',
                fontSize:'17px', lineHeight:'26px', textAlign:'center', padding:0,
                opacity:0, pointerEvents:'none',
                boxShadow:'0 2px 8px rgba(0,0,0,0.6)',
                transition:'opacity 0.2s',
              }}>›</button>
          </div>
        </div>
      </div>

      {/* 3-column chart area */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0 }}>
        <div style={{ flex:1, display:'flex', minHeight:0 }}>

          {/* ── Stock column ── */}
          <div style={{ flex:1, display:'flex', flexDirection:'column', borderRight:'1px solid #222', minWidth:0 }}>
            <ColHeader label={stockLabel} color="#26a69a" sub={stockSub} />
            <div ref={stockMainRef} style={{ flex:1, minHeight:0 }} />
            <PaneLabel label="EATA CCI×RSI" color="#1e90ff" />
            <div ref={stockC1Ref} style={{ height:'90px', flexShrink:0 }} />
            <PaneLabel label="EATA CCI×RVI" color="#00bcd4" />
            <div ref={stockC2Ref} style={{ height:'90px', flexShrink:0 }} />
          </div>

          {/* ── CE column ── */}
          <div style={{ flex:1, display:'flex', flexDirection:'column', borderRight:'1px solid #222', minWidth:0 }}>
            <ColHeader label={ceLabel} color="#2962ff" sub={ceSub} />
            <div ref={ceMainRef} style={{ flex:1, minHeight:0 }} />
            <PaneLabel label="EATA CCI×RSI" color="#1e90ff" />
            <div ref={ceC1Ref} style={{ height:'90px', flexShrink:0 }} />
            <PaneLabel label="EATA CCI×RVI" color="#00bcd4" />
            <div ref={ceC2Ref} style={{ height:'90px', flexShrink:0 }} />
          </div>

          {/* ── PE column ── */}
          <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
            <ColHeader label={peLabel} color="#ef5350" sub={peSub} />
            <div ref={peMainRef} style={{ flex:1, minHeight:0 }} />
            <PaneLabel label="EATA CCI×RSI" color="#1e90ff" />
            <div ref={peC1Ref} style={{ height:'90px', flexShrink:0 }} />
            <PaneLabel label="EATA CCI×RVI" color="#00bcd4" />
            <div ref={peC2Ref} style={{ height:'90px', flexShrink:0 }} />
          </div>

        </div>

        {/* Horizontal scrollbar — spans all 3 columns */}
        <div ref={scrollTrackRef} onMouseDown={handleScrollbarDown}
          style={{ position:'relative', height:'9px', background:'#0b0b0b', flexShrink:0,
            borderTop:'1px solid #1e1e1e', cursor:'pointer' }}>
          <div ref={scrollThumbRef} onMouseDown={handleThumbDown}
            style={{ position:'absolute', top:'1px', bottom:'1px', left:'70%', width:'30%',
              background:'#2e2e2e', borderRadius:'4px', cursor:'ew-resize' }}
            onMouseEnter={function(e){ e.currentTarget.style.background='#484848' }}
            onMouseLeave={function(e){ e.currentTarget.style.background='#2e2e2e' }}
          />
        </div>
      </div>
    </div>
  )
}
