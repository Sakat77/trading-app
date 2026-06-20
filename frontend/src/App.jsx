import { useEffect, useRef, useState, useCallback, Fragment } from 'react'
import { createChart, CandlestickSeries, LineSeries, createSeriesMarkers } from 'lightweight-charts'
import Screener from './Screener'
import TabBar from './TabBar'
import SectorDashboard from './SectorDashboard'
import OptionsView from './OptionsView'
import TripleChart from './TripleChart'
import OverviewDashboard from './OverviewDashboard'

const WS_URL          = 'ws://localhost:8765'
const IST_OFFSET      = 19800 // UTC+5:30 in seconds
const RIGHT_PADDING   = 60    // empty bars kept to the right of the last candle (~40% of view)

const TIMEFRAMES = ['15min','30min','1hour','3hour']
const DS  = { cci_period:20, rsi_period:14, rvi_period:10, cci_color:'#e91e63', rsi_color:'#2196f3', rvi_color:'#ff9800', rvi_signal_color:'#9c27b0' }
const DC1 = { cci_per:14, rsi_per:14, ma_period:2, koef:8, buy_arrows:true, sell_arrows:true, buy_color:'#00ff00', sell_color:'#ff0000', buy_size:2, sell_size:2, buy_alert:true, sell_alert:true, alert_sound:true, alert_popup:true, line1_color:'#1e90ff', line2_color:'#8b0000' }
const DC2 = { cci_per:14, rvi_per:10, ma_period:2, koef:8, buy_arrows:true, sell_arrows:true, buy_color:'#00ffff', sell_color:'#ff6600', buy_size:2, sell_size:2, buy_alert:true, sell_alert:true, alert_sound:true, alert_popup:true, line1_color:'#00bcd4', line2_color:'#ff5722' }
const DXMA = {
  priceline_color:'#3CB371', priceline_width:2,
  breakline_color:'#3C6B3C', breakline_width:1,
  cycleline_color:'#1246B4', cycleline_width:2,
  trendline_color:'#8B0000', trendline_width:2,
  res1_color:'#207860', res1_width:1,
  sup1_color:'#207860', sup1_width:1,
  res2_color:'#207860', res2_width:1,
  sup2_color:'#207860', sup2_width:1,
}
const DSD = {
  show_labels:false,
  weak_sup_color:'rgba(47,79,79,0.3)',
  untested_sup_color:'rgba(47,79,79,0.4)',
  verified_sup_color:'rgba(47,79,79,0.5)',
  proven_sup_color:'rgba(47,79,79,0.6)',
  weak_res_color:'rgba(105,105,105,0.3)',
  untested_res_color:'rgba(105,105,105,0.4)',
  verified_res_color:'rgba(105,105,105,0.5)',
  proven_res_color:'rgba(105,105,105,0.6)',
  weak_width:1, untested_width:1, verified_width:1, proven_width:1,
}
const PANES = ['EATA CCI×RSI','EATA CCI×RVI','BAMSBUNG']

function SymbolPicker({ symbols, value, onChange }) {
  var [open,  setOpen]  = useState(false)
  var [query, setQuery] = useState('')
  var [hover, setHover] = useState(-1)
  var listRef = useRef(null)

  var label    = value.replace('NSE_', '').replace('_EQ', '')
  var filtered = query.trim()
    ? symbols.filter(function(s) {
        return s.replace('NSE_', '').replace('_EQ', '').toLowerCase().includes(query.toLowerCase())
      })
    : symbols

  useEffect(function() {
    if (hover < 0 || !listRef.current) return
    var items = listRef.current.querySelectorAll('[data-idx]')
    if (items[hover]) items[hover].scrollIntoView({ block: 'nearest' })
  }, [hover])

  function select(sym) { onChange(sym); setOpen(false); setQuery(''); setHover(-1) }

  function onKeyDown(e) {
    if (!open) { if (e.key !== 'Escape' && e.key !== 'Tab') setOpen(true); return }
    if (e.key === 'Escape')    { setOpen(false); setQuery(''); setHover(-1); e.preventDefault(); return }
    if (e.key === 'ArrowDown') { setHover(function(h) { return Math.min(h + 1, filtered.length - 1) }); e.preventDefault(); return }
    if (e.key === 'ArrowUp')   { setHover(function(h) { return Math.max(h - 1, 0) }); e.preventDefault(); return }
    if (e.key === 'Enter' && hover >= 0 && filtered[hover]) { select(filtered[hover]); e.preventDefault() }
  }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <input
        value={open ? query : label}
        placeholder={symbols.length === 0 ? 'Loading...' : 'Search...'}
        onChange={function(e) { setQuery(e.target.value); setHover(-1) }}
        onFocus={function() { setOpen(true); setQuery('') }}
        onBlur={function() { setTimeout(function() { setOpen(false); setQuery(''); setHover(-1) }, 150) }}
        onKeyDown={onKeyDown}
        style={{ background:'#1a1a1a', color:'#d1d4dc', border:'1px solid #333', padding:'3px 6px', borderRadius:'5px', fontSize:'12px', width:'110px', outline:'none', cursor:'text' }}
      />
      {open && (filtered.length > 0 || query) && (
        <div ref={listRef} style={{ position:'absolute', top:'100%', left:0, zIndex:200, background:'#1a1a1a', border:'1px solid #333', borderRadius:'4px', maxHeight:'240px', overflowY:'auto', minWidth:'160px', boxShadow:'0 4px 16px rgba(0,0,0,0.8)', marginTop:'2px' }}>
          {filtered.length === 0
            ? <div style={{ padding:'8px 10px', fontSize:'11px', color:'#555' }}>No match</div>
            : filtered.map(function(s, i) {
                var lab = s.replace('NSE_', '').replace('_EQ', '')
                return (
                  <div key={s} data-idx={i}
                    onMouseDown={function() { select(s) }}
                    onMouseEnter={function() { setHover(i) }}
                    style={{ padding:'5px 10px', fontSize:'12px', cursor:'pointer', color:s===value?'#26a69a':'#d1d4dc', background:i===hover?'#2a2a2a':s===value?'#1a2a1a':'transparent' }}>
                    {lab}
                  </div>
                )
              })
          }
        </div>
      )}
    </div>
  )
}

function loadLayout() {
  try {
    const s = localStorage.getItem('trading_layout')
    if (s) return JSON.parse(s)
  } catch(e) {}
  return null
}
function saveLayout(data) {
  try { localStorage.setItem('trading_layout', JSON.stringify(data)) } catch(e) {}
}

export default function App() {
  const saved = loadLayout()

  const chartRef     = useRef(null)
  const c1Ref        = useRef(null)
  const c2Ref        = useRef(null)
  const bamsRef      = useRef(null)
  const chartsRef    = useRef({})
  const seriesRef    = useRef({})
  const wsRef        = useRef(null)
  const cs1Ref       = useRef(DC1)
  const cs2Ref       = useRef(DC2)
  const scrollTrackRef  = useRef(null)
  const scrollThumbRef  = useRef(null)
  const goLatestRef     = useRef(null)
  const totalBarsRef    = useRef(0)
  const barIntervalRef  = useRef(0)
  const lastBarTimeRef  = useRef(0)
  const scrollDragRef   = useRef(null)

  const [status,       setStatus]       = useState('Connecting...')
  const [wsReady,      setWsReady]      = useState(false)
  const [symbol,       setSymbol]       = useState(saved?.symbol    || 'NSE_RELIANCE_EQ')
  const [timeframe,    setTimeframe]    = useState(saved?.timeframe || '15min')
  const [candleInfo,   setCandleInfo]   = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [activeSection, setActiveSection] = useState(
    () => localStorage.getItem('activeTab') || 'charts'
  )
  useEffect(() => { localStorage.setItem('activeTab', activeSection) }, [activeSection])

  const [activeTab,    setActiveTab]    = useState('indicators')
  const [settings,     setSettings]     = useState(saved?.settings  || DS)
  const [cs1,          setCs1]          = useState(saved?.cs1       || DC1)
  const [cs2,          setCs2]          = useState(saved?.cs2       || DC2)
  const [tmpS,         setTmpS]         = useState(saved?.settings  || DS)
  const [tmpC1,        setTmpC1]        = useState(saved?.cs1       || DC1)
  const [tmpC2,        setTmpC2]        = useState(saved?.cs2       || DC2)
  const [xmaSettings,  setXmaSettings]  = useState(saved?.xmaSettings || DXMA)
  const [sdSettings,   setSdSettings]   = useState(saved?.sdSettings  || DSD)
  const [tmpXma,       setTmpXma]       = useState(saved?.xmaSettings || DXMA)
  const [tmpSd,        setTmpSd]        = useState(saved?.sdSettings  || DSD)
  const [alerts,       setAlerts]       = useState([])
  const [showAlerts,   setShowAlerts]   = useState(false)
  const [visible,      setVisible]      = useState(saved?.visible || {
    'EATA CCI×RSI':true,'EATA CCI×RVI':true,'BAMSBUNG':true
  })
  const [screenerVisible, setScreenerVisible] = useState(true)
  const [symbols,      setSymbols]      = useState([])
  const [legView,      setLegView]      = useState('EQ')
  const [optTitle,     setOptTitle]     = useState(null)

  useEffect(function() {
    saveLayout({ symbol, timeframe, settings, cs1, cs2, visible, xmaSettings, sdSettings })
  }, [symbol, timeframe, settings, cs1, cs2, visible, xmaSettings, sdSettings])

  const playSound = useCallback(function(type) {
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)()
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = type === 'buy' ? 880 : 440
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
      osc.start(); osc.stop(ctx.currentTime + 0.5)
    } catch(e) {}
  }, [])

  const fireAlert = useCallback(function(sig, sym, cs) {
    const label = sym.replace('NSE_','').replace('_EQ','')
    const msg   = sig.type.toUpperCase() + ' — ' + label + ' @ ' + sig.price
    if (cs.alert_sound) playSound(sig.type)
    if (cs.alert_popup) {
      setAlerts(function(p) {
        return [{ id:Date.now()+Math.random(), type:sig.type, message:msg, time:new Date().toLocaleTimeString() }].concat(p.slice(0,49))
      })
      setShowAlerts(true)
    }
  }, [playSound])

  useEffect(function() {
    const el = chartRef.current
    if (!el) return

    const main = createChart(el, {
      width:  el.clientWidth,
      height: el.clientHeight || 400,
      layout: { background:{ color:'#0f0f0f' }, textColor:'#d1d4dc' },
      grid:   { vertLines:{ color:'#1a1a1a' }, horzLines:{ color:'#1a1a1a' } },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: '#2a2a2a', rightOffset: RIGHT_PADDING },
      rightPriceScale: { borderColor:'#2a2a2a', minimumWidth:70 },
      crosshair: { mode:1 },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: false, price: true } },
    })

    function makeSubChart(container, h, showTime) {
      return createChart(container, {
        width:  container.clientWidth,
        height: h,
        layout: { background:{ color:'#0f0f0f' }, textColor:'#d1d4dc' },
        grid:   { vertLines:{ color:'#1a1a1a' }, horzLines:{ color:'#1a1a1a' } },
        timeScale: { visible:showTime, timeVisible:showTime, secondsVisible:false, borderColor:'#2a2a2a', rightOffset:RIGHT_PADDING },
        rightPriceScale: { borderColor:'#2a2a2a', minimumWidth:70, scaleMargins:{ top:0.1, bottom:0.1 } },
        crosshair: { mode:1 },
        handleScroll: false,
        handleScale:  false,
      })
    }

    const c1C  = makeSubChart(c1Ref.current,  110, false)
    const c2C   = makeSubChart(c2Ref.current,  110, false)
    const bamsC = makeSubChart(bamsRef.current, 130, true)

    var xmaS = loadLayout()?.xmaSettings || DXMA
    const xmaRes1      = main.addSeries(LineSeries, { color:xmaS.res1_color,      lineWidth:xmaS.res1_width,      lineStyle:2, lastValueVisible:false, priceLineVisible:false })
    const xmaSup1      = main.addSeries(LineSeries, { color:xmaS.sup1_color,      lineWidth:xmaS.sup1_width,      lineStyle:2, lastValueVisible:false, priceLineVisible:false })
    const xmaRes2      = main.addSeries(LineSeries, { color:xmaS.res2_color,      lineWidth:xmaS.res2_width,      lineStyle:2, lastValueVisible:false, priceLineVisible:false })
    const xmaSup2      = main.addSeries(LineSeries, { color:xmaS.sup2_color,      lineWidth:xmaS.sup2_width,      lineStyle:2, lastValueVisible:false, priceLineVisible:false })
    const xmaTrendline = main.addSeries(LineSeries, { color:xmaS.trendline_color, lineWidth:xmaS.trendline_width, lastValueVisible:false, priceLineVisible:false })
    const xmaCycleline = main.addSeries(LineSeries, { color:xmaS.cycleline_color, lineWidth:xmaS.cycleline_width, lastValueVisible:false, priceLineVisible:false })
    const xmaBreakline = main.addSeries(LineSeries, { color:xmaS.breakline_color, lineWidth:xmaS.breakline_width, lastValueVisible:false, priceLineVisible:false })
    const xmaPriceline = main.addSeries(LineSeries, { color:xmaS.priceline_color, lineWidth:xmaS.priceline_width, lastValueVisible:false, priceLineVisible:false })

    const candles = main.addSeries(CandlestickSeries, {
      upColor:'#26a69a', downColor:'#ef5350',
      borderVisible:false,
      wickUpColor:'#26a69a', wickDownColor:'#ef5350',
    })

    const c1L1   = c1C.addSeries(LineSeries,  { color:DC1.line1_color,     lineWidth:2 })
    const c1L2   = c1C.addSeries(LineSeries,  { color:DC1.line2_color,     lineWidth:2 })
    const c2L1      = c2C.addSeries(LineSeries,   { color:DC2.line1_color, lineWidth:2 })
    const c2L2      = c2C.addSeries(LineSeries,   { color:DC2.line2_color, lineWidth:2 })
    const bamsFast  = bamsC.addSeries(LineSeries, { color:'#ffffff',       lineWidth:2 })
    const bamsSlow  = bamsC.addSeries(LineSeries, { color:'#ff0000',       lineWidth:2 })
    const bamsTrend = bamsC.addSeries(LineSeries, { color:'#808080',       lineWidth:1 })
    const bamsUpper = bamsC.addSeries(LineSeries, { color:'#2196f3',       lineWidth:1, lineStyle:2 })
    const bamsLower = bamsC.addSeries(LineSeries, { color:'#2196f3',       lineWidth:1, lineStyle:2 })

    main.subscribeCrosshairMove(function(p) {
      if (p.seriesData && p.seriesData.size > 0) {
        const d = p.seriesData.get(candles)
        if (d) setCandleInfo(d)
      }
    })

    chartsRef.current = { main, c1C, c2C, bamsC }
    seriesRef.current = { candles, c1L1, c1L2, c2L1, c2L2,
      xmaPriceline, xmaBreakline, xmaCycleline, xmaTrendline,
      xmaRes1, xmaSup1, xmaRes2, xmaSup2,
      bamsFast, bamsSlow, bamsTrend, bamsUpper, bamsLower }

    const subFirst = [
      { chart:c1C,   series:c1L1    },
      { chart:c2C,   series:c2L1    },
      { chart:bamsC, series:bamsFast },
    ]
    const subCharts = subFirst.map(function(x){ return x.chart })

    var isSyncing = false
    main.timeScale().subscribeVisibleLogicalRangeChange(function(range) {
      if (!range) return
      // Scrollbar + go-latest (DOM only)
      var total = totalBarsRef.current
      if (total > 0) {
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
      }
      // Sub-chart logical-range sync
      if (isSyncing) return
      isSyncing = true
      subCharts.forEach(function(c){ try{ c.timeScale().setVisibleLogicalRange(range) }catch(e){} })
      isSyncing = false
    })

    // ── Task 3: double-click = auto-align to latest + auto-scale price ───────
    el.addEventListener('dblclick', function() {
      var total = totalBarsRef.current
      if (!total) return
      var range = main.timeScale().getVisibleLogicalRange()
      var visibleBars = range ? Math.round(range.to - range.from) : 120
      main.timeScale().setVisibleLogicalRange({
        from: total - visibleBars + RIGHT_PADDING,
        to:   total - 1 + RIGHT_PADDING,
      })
      try { main.priceScale('right').applyOptions({ autoScale: true }) } catch(e){}
    })

    var crossSyncing = false
    main.subscribeCrosshairMove(function(param) {
      if (crossSyncing) return
      crossSyncing = true
      if (param.time) {
        subFirst.forEach(function(item){
          try{ item.chart.setCrosshairPosition(NaN, param.time, item.series) }catch(e){}
        })
      } else {
        subFirst.forEach(function(item){
          try{ item.chart.clearCrosshairPosition() }catch(e){}
        })
      }
      crossSyncing = false
    })
    subFirst.forEach(function(item) {
      item.chart.subscribeCrosshairMove(function(param) {
        if (crossSyncing) return
        crossSyncing = true
        if (param.time) {
          try{ main.setCrosshairPosition(NaN, param.time, candles) }catch(e){}
          subFirst.filter(function(x){ return x.chart !== item.chart }).forEach(function(other){
            try{ other.chart.setCrosshairPosition(NaN, param.time, other.series) }catch(e){}
          })
        } else {
          try{ main.clearCrosshairPosition() }catch(e){}
          subFirst.filter(function(x){ return x.chart !== item.chart }).forEach(function(other){
            try{ other.chart.clearCrosshairPosition() }catch(e){}
          })
        }
        crossSyncing = false
      })
    })

    const ro = new ResizeObserver(function() {
      if (chartsRef.current.main && el.clientWidth > 0) {
        chartsRef.current.main.resize(el.clientWidth, el.clientHeight || 400)
      }
      subFirst.forEach(function(item) {
        const el2 = item.chart === c1C   ? c1Ref.current
          : item.chart === c2C   ? c2Ref.current
          : bamsRef.current
        if (el2 && el2.clientWidth > 0) {
          const h = item.chart === bamsC ? 130 : 110
          item.chart.resize(el2.clientWidth, h)
        }
      })
    })
    ro.observe(el)

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws
    ws.onopen  = function() { setStatus('Connected'); setWsReady(true); ws.send(JSON.stringify({ type: 'get_symbols' })) }
    ws.onclose = function() { setStatus('Disconnected'); setWsReady(false) }
    ws.onerror = function() { setStatus('Error') }

    ws.onmessage = function(event) {
      const d = JSON.parse(event.data)
      if (d.type === 'symbols') { setSymbols(d.symbols || []); return }
      if (d.type !== 'history') return
      setOptTitle(d.opt_title || null)
      const sr  = seriesRef.current
      const sym = d.symbol || ''

      sr.candles.setData(d.candles.map(function(c){
        return { time:c.time+IST_OFFSET, open:c.open, high:c.high, low:c.low, close:c.close }
      }))

      if (d.custom1) {
        sr.c1L1.setData(d.custom1.map(function(c){ return c.line1!==null ? {time:c.time+IST_OFFSET,value:c.line1} : {time:c.time+IST_OFFSET} }))
        sr.c1L2.setData(d.custom1.map(function(c){ return c.line2!==null ? {time:c.time+IST_OFFSET,value:c.line2} : {time:c.time+IST_OFFSET} }))
      }
      if (d.custom2) {
        sr.c2L1.setData(d.custom2.map(function(c){ return c.line1!==null ? {time:c.time+IST_OFFSET,value:c.line1} : {time:c.time+IST_OFFSET} }))
        sr.c2L2.setData(d.custom2.map(function(c){ return c.line2!==null ? {time:c.time+IST_OFFSET,value:c.line2} : {time:c.time+IST_OFFSET} }))
      }
      if (d.xma) {
        var xf = function(key) {
          return d.xma.map(function(x){ return x[key]!==null ? {time:x.time+IST_OFFSET,value:x[key]} : {time:x.time+IST_OFFSET} })
        }
        sr.xmaPriceline.setData(xf('priceline'))
        sr.xmaBreakline.setData(xf('breakline'))
        sr.xmaCycleline.setData(xf('cycleline'))
        sr.xmaTrendline.setData(xf('trendline'))
        sr.xmaRes1.setData(xf('res1'))
        sr.xmaSup1.setData(xf('sup1'))
        sr.xmaRes2.setData(xf('res2'))
        sr.xmaSup2.setData(xf('sup2'))
      }

      function mkMarkers(signals, cs) {
        if (!signals || !cs) return []
        var out = []
        signals.forEach(function(sig) {
          if (sig.type === 'buy'  && cs.buy_arrows)  out.push({ time:sig.time+IST_OFFSET, position:'belowBar', color:cs.buy_color  ||'#00ff00', shape:'arrowUp',   size:cs.buy_size  ||2, text:'B' })
          if (sig.type === 'sell' && cs.sell_arrows) out.push({ time:sig.time+IST_OFFSET, position:'aboveBar', color:cs.sell_color ||'#ff0000', shape:'arrowDown', size:cs.sell_size ||2, text:'S' })
        })
        return out
      }
      var m1  = mkMarkers(d.signals1, cs1Ref.current)
      var m2  = mkMarkers(d.signals2, cs2Ref.current)
      var all = m1.concat(m2).sort(function(a,b){ return a.time - b.time })
      try {
        if (window._markersInstance) window._markersInstance.setMarkers([])
        if (all.length > 0) window._markersInstance = createSeriesMarkers(sr.candles, all)
      } catch(e) { console.log('markers error:', e) }

      var last1 = d.signals1 && d.signals1.length>0 ? d.signals1[d.signals1.length-1] : null
      var last2 = d.signals2 && d.signals2.length>0 ? d.signals2[d.signals2.length-1] : null
      if (last1) fireAlert(last1, sym, cs1Ref.current)
      if (last2) fireAlert(last2, sym, cs2Ref.current)

      if (d.sd_zones) {
        if (window._sdPriceLines) {
          window._sdPriceLines.forEach(function(pl) {
            try { sr.candles.removePriceLine(pl) } catch(e) {}
          })
        }
        window._sdPriceLines = []
        var sds = loadLayout()?.sdSettings || DSD
        d.sd_zones.forEach(function(zone) {
          var isSupport = zone.type === 'support'
          var color, width
          if (isSupport) {
            if      (zone.strength === 4) { color = sds.proven_sup_color;   width = sds.proven_width   }
            else if (zone.strength === 3) { color = sds.verified_sup_color; width = sds.verified_width }
            else if (zone.strength === 2) { color = sds.untested_sup_color; width = sds.untested_width }
            else                          { color = sds.weak_sup_color;     width = sds.weak_width     }
          } else {
            if      (zone.strength === 4) { color = sds.proven_res_color;   width = sds.proven_width   }
            else if (zone.strength === 3) { color = sds.verified_res_color; width = sds.verified_width }
            else if (zone.strength === 2) { color = sds.untested_res_color; width = sds.untested_width }
            else                          { color = sds.weak_res_color;     width = sds.weak_width     }
          }
          try {
            var plHi = sr.candles.createPriceLine({
              price:            zone.hi,
              color:            color,
              lineWidth:        width,
              lineStyle:        2,
              axisLabelVisible: sds.show_labels,
              title:            sds.show_labels ? zone.strength_name + (isSupport ? ' S' : ' R') : '',
            })
            var plLo = sr.candles.createPriceLine({
              price:            zone.lo,
              color:            color,
              lineWidth:        width,
              lineStyle:        2,
              axisLabelVisible: false,
              title:            '',
            })
            window._sdPriceLines.push(plHi)
            window._sdPriceLines.push(plLo)
          } catch(e) {}
        })
      }

      if (d.bamsbung && d.bamsbung.length > 0) {
        var bx = function(key) {
          return d.bamsbung.map(function(b){ return b[key]!==null ? {time:b.time+IST_OFFSET,value:b[key]} : {time:b.time+IST_OFFSET} })
        }
        sr.bamsFast.setData(bx('fast'))
        sr.bamsSlow.setData(bx('slow'))
        sr.bamsTrend.setData(bx('trend_line'))
        sr.bamsUpper.setData(bx('upper'))
        sr.bamsLower.setData(bx('lower'))
        if (d.bamsbung_sigs && d.bamsbung_sigs.length > 0) {
          var bamsMarkers = d.bamsbung_sigs.map(function(sig) {
            return sig.type === 'buy'
              ? { time:sig.time+IST_OFFSET, position:'belowBar', color:'#00ff00', shape:'arrowUp',   size:2, text:'B' }
              : { time:sig.time+IST_OFFSET, position:'aboveBar', color:'#ff0000', shape:'arrowDown', size:2, text:'S' }
          })
          try {
            if (window._bamsMarkers) window._bamsMarkers.setMarkers([])
            window._bamsMarkers = createSeriesMarkers(sr.candles, bamsMarkers)
          } catch(e) { console.log('bams markers error:', e) }
        }
      }

      var mc    = chartsRef.current.main
      var total = d.candles.length
      totalBarsRef.current = total
      if (total >= 2) {
        var iv = d.candles[1].time - d.candles[0].time
        barIntervalRef.current = iv
        lastBarTimeRef.current = d.candles[total - 1].time + IST_OFFSET
        mc.timeScale().setVisibleLogicalRange({ from: total - 121, to: total - 1 + RIGHT_PADDING })
        setTimeout(function() {
          var subs = [chartsRef.current.c1C, chartsRef.current.c2C, chartsRef.current.bamsC]
          subs.forEach(function(c){ try{ c.timeScale().setVisibleLogicalRange({ from: total - 121, to: total - 1 + RIGHT_PADDING }) }catch(e){} })
        }, 50)
      }
    }

    return function() {
      ro.disconnect()
      ws.close()
      Object.values(chartsRef.current).forEach(function(c){ c.remove() })
    }
  }, [fireAlert])

  useEffect(function() { cs1Ref.current = cs1 }, [cs1])
  useEffect(function() { cs2Ref.current = cs2 }, [cs2])

  const send = function(msg) {
    if (wsRef.current && wsRef.current.readyState===1) wsRef.current.send(JSON.stringify(msg))
  }

  const handleSymbol = function(sym) {
    setSymbol(sym)
    setOptTitle(null)
    send({ type:'change_symbol', symbol:sym, timeframe, leg:legView })
  }
  const handleTF = function(tf) {
    setTimeframe(tf)
    send({ type:'change_symbol', symbol, timeframe:tf, leg:legView })
  }
  const handleLeg = function(lg) {
    setLegView(lg)
    setOptTitle(null)
    send({ type:'change_symbol', symbol, timeframe, leg:lg })
  }

  const handleGoLatest = function() {
    var mc = chartsRef.current.main
    if (!mc || totalBarsRef.current <= 0) return
    var total = totalBarsRef.current
    var range = mc.timeScale().getVisibleLogicalRange()
    var visibleBars = range ? Math.round(range.to - range.from) : 120
    mc.timeScale().setVisibleLogicalRange({ from: total - visibleBars + RIGHT_PADDING, to: total - 1 + RIGHT_PADDING })
    try { mc.priceScale('right').applyOptions({ autoScale: true }) } catch(e){}
  }

  const handleScrollbarDown = function(e) {
    if (e.target !== scrollTrackRef.current) return
    var mc = chartsRef.current.main
    if (!mc || totalBarsRef.current <= 0) return
    var track = scrollTrackRef.current.getBoundingClientRect()
    var ratio = (e.clientX - track.left) / track.width
    var total = totalBarsRef.current
    var range = mc.timeScale().getVisibleLogicalRange()
    var visibleBars = range ? Math.round(range.to - range.from) : 120
    var newFrom = Math.round(ratio * total - visibleBars / 2)
    newFrom = Math.max(0, Math.min(total - visibleBars + RIGHT_PADDING, newFrom))
    mc.timeScale().setVisibleLogicalRange({ from: newFrom, to: newFrom + visibleBars - 1 })
  }

  const handleThumbDown = function(e) {
    e.stopPropagation()
    var mc = chartsRef.current.main
    if (!mc) return
    var range = mc.timeScale().getVisibleLogicalRange()
    scrollDragRef.current = { x: e.clientX, from: range ? range.from : 0, visibleBars: range ? range.to - range.from : 120 }

    function onMove(me) {
      if (!scrollDragRef.current || !scrollTrackRef.current) return
      var track = scrollTrackRef.current.getBoundingClientRect()
      var deltaX = me.clientX - scrollDragRef.current.x
      var total = totalBarsRef.current
      var deltaBars = (deltaX / track.width) * total
      var vb = scrollDragRef.current.visibleBars
      var newFrom = scrollDragRef.current.from + deltaBars
      newFrom = Math.max(0, Math.min(total - visibleBars + RIGHT_PADDING, newFrom))
      chartsRef.current.main.timeScale().setVisibleLogicalRange({ from: newFrom, to: newFrom + vb - 1 })
    }
    function onUp() {
      scrollDragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const applySettings = function() {
    setSettings(tmpS); setCs1(tmpC1); setCs2(tmpC2)
    setXmaSettings(tmpXma); setSdSettings(tmpSd)
    cs1Ref.current = tmpC1; cs2Ref.current = tmpC2
    setShowSettings(false)
    saveLayout({ symbol, timeframe, settings:tmpS, cs1:tmpC1, cs2:tmpC2, visible, xmaSettings:tmpXma, sdSettings:tmpSd })
    send({
      type:'change_settings', settings:tmpS,
      cs1:{ cci_per:tmpC1.cci_per, rsi_per:tmpC1.rsi_per, ma_period:tmpC1.ma_period, koef:tmpC1.koef },
      cs2:{ cci_per:tmpC2.cci_per, rvi_per:tmpC2.rvi_per, ma_period:tmpC2.ma_period, koef:tmpC2.koef }
    })
  }

  const togglePane = function(name) {
    setVisible(function(v){ return Object.assign({},v,{[name]:!v[name]}) })
  }

  const n = function(val, fn) {
    return <input type="number" value={val} onChange={function(e){ fn(parseInt(e.target.value)||0) }} style={{ background:'#111', color:'#d1d4dc', border:'1px solid #333', padding:'4px 8px', borderRadius:'5px', fontSize:'13px', width:'68px' }} />
  }
  const cl = function(val, fn) {
    return <input type="color" value={val} onChange={function(e){ fn(e.target.value) }} style={{ width:'34px', height:'26px', border:'none', cursor:'pointer', background:'none' }} />
  }
  const tg = function(val, fn, label) {
    return (
      <label style={{ display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', color:'#aaa', fontSize:'13px', marginBottom:'8px' }}>
        <div onClick={function(){ fn(!val) }} style={{ width:'30px', height:'17px', borderRadius:'9px', background:val?'#26a69a':'#333', position:'relative', cursor:'pointer', transition:'background 0.2s' }}>
          <div style={{ position:'absolute', top:'2px', left:val?'13px':'2px', width:'13px', height:'13px', borderRadius:'50%', background:'#fff', transition:'left 0.2s' }} />
        </div>
        {label}
      </label>
    )
  }
  const row = { display:'flex', alignItems:'center', gap:'10px', marginBottom:'9px', color:'#888', fontSize:'13px' }

  function CustomBlock({ tmp, setTmp, isRvi }) {
    return (
      <div style={{ display:'flex', gap:'28px', flexWrap:'wrap' }}>
        <div>
          <div style={{ color:'#aaa', fontSize:'13px', marginBottom:'8px' }}>Parameters</div>
          <div style={row}>CCI Period {n(tmp.cci_per, function(v){ setTmp(Object.assign({},tmp,{cci_per:v})) })}</div>
          {isRvi
            ? <div style={row}>RVI Period {n(tmp.rvi_per, function(v){ setTmp(Object.assign({},tmp,{rvi_per:v})) })}</div>
            : <div style={row}>RSI Period {n(tmp.rsi_per, function(v){ setTmp(Object.assign({},tmp,{rsi_per:v})) })}</div>
          }
          <div style={row}>MA Period  {n(tmp.ma_period, function(v){ setTmp(Object.assign({},tmp,{ma_period:v})) })}</div>
          <div style={row}>Koef (0-8) {n(tmp.koef, function(v){ setTmp(Object.assign({},tmp,{koef:Math.min(8,Math.max(0,v))})) })}</div>
        </div>
        <div>
          <div style={{ color:'#aaa', fontSize:'13px', marginBottom:'8px' }}>Lines</div>
          <div style={row}>Line 1 {cl(tmp.line1_color, function(v){ setTmp(Object.assign({},tmp,{line1_color:v})) })}</div>
          <div style={row}>Line 2 {cl(tmp.line2_color, function(v){ setTmp(Object.assign({},tmp,{line2_color:v})) })}</div>
        </div>
        <div>
          <div style={{ color:'#26a69a', fontSize:'13px', marginBottom:'8px' }}>Buy Arrow</div>
          {tg(tmp.buy_arrows, function(v){ setTmp(Object.assign({},tmp,{buy_arrows:v})) }, 'Show')}
          <div style={row}>Color {cl(tmp.buy_color, function(v){ setTmp(Object.assign({},tmp,{buy_color:v})) })}</div>
          <div style={row}>Size  {n(tmp.buy_size,   function(v){ setTmp(Object.assign({},tmp,{buy_size:v}))  })}</div>
        </div>
        <div>
          <div style={{ color:'#ef5350', fontSize:'13px', marginBottom:'8px' }}>Sell Arrow</div>
          {tg(tmp.sell_arrows, function(v){ setTmp(Object.assign({},tmp,{sell_arrows:v})) }, 'Show')}
          <div style={row}>Color {cl(tmp.sell_color, function(v){ setTmp(Object.assign({},tmp,{sell_color:v})) })}</div>
          <div style={row}>Size  {n(tmp.sell_size,   function(v){ setTmp(Object.assign({},tmp,{sell_size:v}))  })}</div>
        </div>
        <div>
          <div style={{ color:'#ff9800', fontSize:'13px', marginBottom:'8px' }}>Alerts</div>
          {tg(tmp.buy_alert,   function(v){ setTmp(Object.assign({},tmp,{buy_alert:v}))   }, 'Buy alert')}
          {tg(tmp.sell_alert,  function(v){ setTmp(Object.assign({},tmp,{sell_alert:v}))  }, 'Sell alert')}
          {tg(tmp.alert_sound, function(v){ setTmp(Object.assign({},tmp,{alert_sound:v})) }, 'Sound')}
          {tg(tmp.alert_popup, function(v){ setTmp(Object.assign({},tmp,{alert_popup:v})) }, 'Popup')}
        </div>
      </div>
    )
  }

  function btn(active, onClick, children, extra) {
    return (
      <button onClick={onClick} style={Object.assign({ background:active?'#26a69a':'#1a1a1a', color:active?'#000':'#d1d4dc', border:'1px solid #333', padding:'4px 8px', borderRadius:'5px', fontSize:'11px', cursor:'pointer' }, extra||{})}>
        {children}
      </button>
    )
  }

  const refMap   = { 'EATA CCI×RSI':c1Ref, 'EATA CCI×RVI':c2Ref, 'BAMSBUNG':bamsRef }
  const colorMap = { 'EATA CCI×RSI':'#1e90ff', 'EATA CCI×RVI':'#00bcd4', 'BAMSBUNG':'#ffffff' }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', overflow:'hidden', background:'#0a0a0a', fontFamily:'sans-serif' }}>

      <TabBar
        active={activeSection}
        onChange={setActiveSection}
        tabs={[{id:'charts',label:'Chart'},{id:'overview',label:'Overview'},{id:'sectors',label:'Sectors'},{id:'options',label:'Options'},{id:'analysis',label:'3-Chart'}]}
      />

      <div style={{ flex:1, minHeight:0, display: activeSection==='charts' ? 'flex' : 'none' }}>

      {/* Screener — collapsible */}
      <div style={{
        width: screenerVisible ? '38%' : '0',
        minWidth: screenerVisible ? '270px' : '0',
        borderRight: screenerVisible ? '1px solid #1a1a1a' : 'none',
        overflow:'hidden', display:'flex', flexDirection:'column',
        transition:'width 0.22s ease, min-width 0.22s ease, border 0.22s ease',
        flexShrink: 0,
      }}>
        {wsReady && screenerVisible && (
          <Screener
            ws={wsRef.current}
            cs1={{ cci_per:cs1.cci_per, rsi_per:cs1.rsi_per, ma_period:cs1.ma_period, koef:cs1.koef }}
            cs2={{ cci_per:cs2.cci_per, rvi_per:cs2.rvi_per, ma_period:cs2.ma_period, koef:cs2.koef }}
            onSelectSymbol={function(sym){ handleSymbol(sym) }}
            activeSymbol={symbol}
          />
        )}
      </div>

      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>

        <div style={{ display:'flex', alignItems:'center', gap:'6px', padding:'5px 6px', background:'#0f0f0f', borderBottom:'1px solid #1a1a1a', flexWrap:'wrap' }}>
          <button onClick={function(){ setScreenerVisible(function(v){ return !v }) }}
            title={screenerVisible ? 'Hide screener' : 'Show screener'}
            style={{ background:'#1a1a1a', color:'#888', border:'1px solid #2a2a2a', padding:'3px 7px', borderRadius:'4px', fontSize:'11px', cursor:'pointer', flexShrink:0 }}>
            {screenerVisible ? '◀' : '▶'}
          </button>
          <span style={{ color: optTitle ? '#26a69a' : '#d1d4dc', fontWeight:'500', fontSize:'13px', minWidth:'60px', maxWidth:'200px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {optTitle || symbol.replace('NSE_','').replace('_EQ','')}
          </span>
          <SymbolPicker symbols={symbols} value={symbol} onChange={handleSymbol} />
          <div style={{ display:'flex', gap:'2px' }}>
            {['EQ','CE','PE'].map(function(lg) {
              var isActive = legView === lg
              return (
                <button key={lg} onClick={function() { handleLeg(lg) }} style={{
                  background:   isActive ? '#26a69a22' : 'transparent',
                  color:        isActive ? '#26a69a'   : '#555',
                  border:       '1px solid ' + (isActive ? '#26a69a66' : '#333'),
                  padding:      '2px 7px', borderRadius:'4px', fontSize:'10px', cursor:'pointer', fontWeight: isActive ? '600' : '400',
                }}>{lg}</button>
              )
            })}
          </div>
          <div style={{ display:'flex', gap:'3px' }}>
            {TIMEFRAMES.map(function(tf){ return <Fragment key={tf}>{btn(timeframe===tf, function(){ handleTF(tf) }, tf)}</Fragment> })}
          </div>
          {candleInfo && (
            <div style={{ display:'flex', gap:'8px' }}>
              {['open','high','low','close'].map(function(k){
                return <span key={k} style={{ color:'#888', fontSize:'11px' }}>{k[0].toUpperCase()}: <span style={{ color:k==='high'?'#26a69a':k==='low'?'#ef5350':'#d1d4dc' }}>{candleInfo[k]}</span></span>
              })}
            </div>
          )}
          <div style={{ marginLeft:'auto', display:'flex', gap:'6px', alignItems:'center' }}>
            {btn(showAlerts&&alerts.length>0, function(){ setShowAlerts(!showAlerts) },
              'Alerts'+(alerts.length>0?' ('+alerts.length+')':''),
              { color:alerts.length>0?'#ff9800':'#888', background:alerts.length>0?'#2a1a0a':'#1a1a1a' }
            )}
            {btn(showSettings, function(){ setTmpS(settings); setTmpC1(cs1); setTmpC2(cs2); setTmpXma(xmaSettings); setTmpSd(sdSettings); setShowSettings(!showSettings) }, 'Settings')}
            <span style={{ fontSize:'11px', color:status==='Connected'?'#26a69a':'#ef5350' }}>{status}</span>
          </div>
        </div>

        <div style={{ display:'flex', gap:'4px', padding:'3px 6px', background:'#0f0f0f', borderBottom:'1px solid #1a1a1a', flexWrap:'wrap' }}>
          {PANES.map(function(name){
            return (
              <button key={name} onClick={function(){ togglePane(name) }} style={{
                background: visible[name]?'#1a2a1a':'#1a1a1a',
                color:      visible[name]?'#26a69a':'#555',
                border:'1px solid '+(visible[name]?'#26a69a':'#2a2a2a'),
                padding:'2px 8px', borderRadius:'4px', fontSize:'10px', cursor:'pointer'
              }}>
                {visible[name]?'▼':'+'} {name}
              </button>
            )
          })}
        </div>

        {showAlerts && alerts.length>0 && (
          <div style={{ background:'#111', borderBottom:'1px solid #222', padding:'8px 10px', maxHeight:'120px', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
              <span style={{ color:'#888', fontSize:'11px' }}>Alerts</span>
              <button onClick={function(){ setAlerts([]) }} style={{ background:'none', color:'#666', border:'none', cursor:'pointer', fontSize:'11px' }}>Clear</button>
            </div>
            {alerts.map(function(a){
              return (
                <div key={a.id} style={{ display:'flex', gap:'10px', padding:'2px 0', borderBottom:'1px solid #1a1a1a', fontSize:'11px' }}>
                  <span style={{ color:a.type==='buy'?'#26a69a':'#ef5350', minWidth:'36px' }}>{a.type.toUpperCase()}</span>
                  <span style={{ color:'#d1d4dc' }}>{a.message}</span>
                  <span style={{ color:'#555', marginLeft:'auto' }}>{a.time}</span>
                </div>
              )
            })}
          </div>
        )}

        {showSettings && (
          <div style={{ background:'#111', borderBottom:'1px solid #222', padding:'12px', overflowY:'auto', maxHeight:'60vh' }}>
            <div style={{ display:'flex', gap:'6px', marginBottom:'12px', flexWrap:'wrap' }}>
              {['eata1','eata2','xma','sd'].map(function(tab){
                return (
                  <button key={tab} onClick={function(){ setActiveTab(tab) }} style={{ background:activeTab===tab?'#26a69a':'#1a1a1a', color:activeTab===tab?'#000':'#aaa', border:'1px solid #333', padding:'4px 10px', borderRadius:'5px', fontSize:'11px', cursor:'pointer' }}>
                    {tab==='eata1'?'EATA RSI':tab==='eata2'?'EATA RVI':tab==='xma'?'XMA':'Supply/Demand'}
                  </button>
                )
              })}
            </div>

            {activeTab==='eata1' && <CustomBlock tmp={tmpC1} setTmp={setTmpC1} isRvi={false} />}
            {activeTab==='eata2' && <CustomBlock tmp={tmpC2} setTmp={setTmpC2} isRvi={true}  />}

            {activeTab==='xma' && (
              <div style={{ display:'flex', gap:'20px', flexWrap:'wrap' }}>
                {[
                  ['Priceline','priceline'],['Breakline','breakline'],
                  ['Cycleline','cycleline'],['Trendline','trendline'],
                  ['Res1 (inner)','res1'],['Sup1 (inner)','sup1'],
                  ['Res2 (outer)','res2'],['Sup2 (outer)','sup2'],
                ].map(function(item){
                  var label=item[0], key=item[1]
                  var cKey=key+'_color', wKey=key+'_width'
                  return (
                    <div key={key}>
                      <div style={{ color:'#aaa', fontSize:'12px', marginBottom:'6px' }}>{label}</div>
                      <div style={row}>Color {cl(tmpXma[cKey], function(v){ setTmpXma(Object.assign({},tmpXma,{[cKey]:v})) })}</div>
                      <div style={row}>Width {n(tmpXma[wKey],  function(v){ setTmpXma(Object.assign({},tmpXma,{[wKey]:v})) })}</div>
                    </div>
                  )
                })}
              </div>
            )}

            {activeTab==='sd' && (
              <div style={{ display:'flex', gap:'20px', flexWrap:'wrap' }}>
                <div>
                  <div style={{ color:'#aaa', fontSize:'12px', marginBottom:'6px' }}>General</div>
                  {tg(tmpSd.show_labels, function(v){ setTmpSd(Object.assign({},tmpSd,{show_labels:v})) }, 'Show labels')}
                </div>
                <div>
                  <div style={{ color:'#26a69a', fontSize:'12px', marginBottom:'6px' }}>Support zones</div>
                  <div style={row}>Weak     {cl(tmpSd.weak_sup_color,     function(v){ setTmpSd(Object.assign({},tmpSd,{weak_sup_color:v}))     })}</div>
                  <div style={row}>Untested {cl(tmpSd.untested_sup_color, function(v){ setTmpSd(Object.assign({},tmpSd,{untested_sup_color:v})) })}</div>
                  <div style={row}>Verified {cl(tmpSd.verified_sup_color, function(v){ setTmpSd(Object.assign({},tmpSd,{verified_sup_color:v})) })}</div>
                  <div style={row}>Proven   {cl(tmpSd.proven_sup_color,   function(v){ setTmpSd(Object.assign({},tmpSd,{proven_sup_color:v}))   })}</div>
                </div>
                <div>
                  <div style={{ color:'#ef5350', fontSize:'12px', marginBottom:'6px' }}>Resistance zones</div>
                  <div style={row}>Weak     {cl(tmpSd.weak_res_color,     function(v){ setTmpSd(Object.assign({},tmpSd,{weak_res_color:v}))     })}</div>
                  <div style={row}>Untested {cl(tmpSd.untested_res_color, function(v){ setTmpSd(Object.assign({},tmpSd,{untested_res_color:v})) })}</div>
                  <div style={row}>Verified {cl(tmpSd.verified_res_color, function(v){ setTmpSd(Object.assign({},tmpSd,{verified_res_color:v})) })}</div>
                  <div style={row}>Proven   {cl(tmpSd.proven_res_color,   function(v){ setTmpSd(Object.assign({},tmpSd,{proven_res_color:v}))   })}</div>
                </div>
                <div>
                  <div style={{ color:'#ff9800', fontSize:'12px', marginBottom:'6px' }}>Line width</div>
                  <div style={row}>Weak     {n(tmpSd.weak_width,     function(v){ setTmpSd(Object.assign({},tmpSd,{weak_width:v}))     })}</div>
                  <div style={row}>Untested {n(tmpSd.untested_width, function(v){ setTmpSd(Object.assign({},tmpSd,{untested_width:v})) })}</div>
                  <div style={row}>Verified {n(tmpSd.verified_width, function(v){ setTmpSd(Object.assign({},tmpSd,{verified_width:v})) })}</div>
                  <div style={row}>Proven   {n(tmpSd.proven_width,   function(v){ setTmpSd(Object.assign({},tmpSd,{proven_width:v}))   })}</div>
                </div>
              </div>
            )}

            <button onClick={applySettings} style={{ marginTop:'12px', background:'#26a69a', color:'#000', border:'none', padding:'6px 20px', borderRadius:'5px', fontSize:'12px', cursor:'pointer', fontWeight:'500' }}>Apply</button>
          </div>
        )}

        <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0, overflow:'hidden' }}>
          {/* Main chart with go-to-latest overlay */}
          <div style={{ position:'relative', flexShrink:0 }}>
            <div ref={chartRef} style={{ width:'100%', height:'400px' }} />
            <button ref={goLatestRef} onClick={handleGoLatest} title="Jump to latest candle"
              style={{
                position:'absolute', bottom:'12px', right:'76px',
                background:'rgba(41,98,255,0.9)', color:'#fff', border:'none',
                borderRadius:'50%', width:'28px', height:'28px', cursor:'pointer',
                fontSize:'18px', lineHeight:'28px', textAlign:'center', padding:0,
                opacity:0, pointerEvents:'none', zIndex:10,
                boxShadow:'0 2px 8px rgba(0,0,0,0.7)',
                transition:'opacity 0.2s',
              }}>›</button>
          </div>

          {/* Horizontal scrollbar */}
          <div ref={scrollTrackRef} onMouseDown={handleScrollbarDown}
            style={{ position:'relative', height:'9px', background:'#0b0b0b', flexShrink:0,
              borderTop:'1px solid #1e1e1e', borderBottom:'1px solid #1e1e1e', cursor:'pointer' }}>
            <div ref={scrollThumbRef} onMouseDown={handleThumbDown}
              style={{ position:'absolute', top:'1px', bottom:'1px', left:'70%', width:'30%',
                background:'#2e2e2e', borderRadius:'4px', cursor:'ew-resize' }}
              onMouseEnter={function(e){ e.currentTarget.style.background='#484848' }}
              onMouseLeave={function(e){ e.currentTarget.style.background='#2e2e2e' }}
            />
          </div>

          {/* Indicator panes */}
          <div style={{ flex:1, overflowY:'auto' }}>
            {PANES.map(function(name){
              return (
                <div key={name} style={{ display:visible[name]?'block':'none' }}>
                  <div style={{ color:colorMap[name], fontSize:'10px', padding:'2px 6px', background:'#0d0d0d' }}>{name}</div>
                  <div ref={refMap[name]} style={{ width:'100%' }} />
                </div>
              )
            })}
          </div>
        </div>

      </div>

      </div>{/* end Charts wrapper */}

      <div style={{ flex:1, minHeight:0, display: activeSection==='overview' ? 'block' : 'none' }}>
        <OverviewDashboard ws={wsRef.current} wsReady={wsReady} active={activeSection==='overview'} />
      </div>

      <div style={{ flex:1, minHeight:0, display: activeSection==='sectors' ? 'block' : 'none' }}>
        <SectorDashboard ws={wsRef.current} wsReady={wsReady} active={activeSection==='sectors'} />
      </div>

      <div style={{ flex:1, minHeight:0, display: activeSection==='options' ? 'flex' : 'none', flexDirection:'column' }}>
        <OptionsView ws={wsRef.current} wsReady={wsReady} active={activeSection==='options'} />
      </div>

      <div style={{ flex:1, minHeight:0, display: activeSection==='analysis' ? 'flex' : 'none', flexDirection:'column' }}>
        <TripleChart ws={wsRef.current} wsReady={wsReady} active={activeSection==='analysis'} />
      </div>

    </div>
  )
}