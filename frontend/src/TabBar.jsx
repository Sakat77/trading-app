export default function TabBar({ tabs, active, onChange }) {
  return (
    <div className="tabbar">
      {tabs.map((t) => (
        <button
          key={t.id}
          className={`tabbar-tab${active === t.id ? " active" : ""}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
      <style>{`
        .tabbar { display:flex; align-items:stretch; gap:2px; height:40px;
          background:#131722; border-bottom:1px solid #2a2e39; padding:0 8px;
          user-select:none; flex:0 0 auto; }
        .tabbar-tab { appearance:none; background:transparent; border:none;
          color:#b2b5be; font:500 13px/1 system-ui,"Segoe UI",sans-serif;
          letter-spacing:.2px; padding:0 18px; cursor:pointer;
          border-bottom:2px solid transparent;
          transition:color .15s ease, background .15s ease, border-color .15s ease; }
        .tabbar-tab:hover { color:#e6e8ec; background:#1c2030; }
        .tabbar-tab.active { color:#fff; border-bottom-color:#2962ff; }
        .tabbar-tab:focus-visible { outline:2px solid #2962ff; outline-offset:-2px; }
      `}</style>
    </div>
  );
}
