import { useState, useRef, useEffect } from "react";

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const first = lines[0];
  const delim = (first.includes("\t") && !first.includes(",")) ? "\t" : ",";
  const headers = first.split(delim).map(h => h.trim().replace(/^"|"$/g, "").replace(/^\uFEFF/, ""));
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = [];
    if (delim === "\t") {
      line.split("\t").forEach(v => vals.push(v.trim()));
    } else {
      let cur = "", inQ = false;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') { inQ = !inQ; }
        else if (line[i] === ',' && !inQ) { vals.push(cur.trim()); cur = ""; }
        else { cur += line[i]; }
      }
      vals.push(cur.trim());
    }
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || "").replace(/^"|"$/g, "").trim(); });
    return obj;
  });
}

function readFile(file) {
  return new Promise(resolve => {
    const r = new FileReader();
    r.onload = e => {
      const bytes = new Uint8Array(e.target.result);
      const enc = (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) ? "utf-8" : "shift-jis";
      resolve(new TextDecoder(enc).decode(e.target.result));
    };
    r.readAsArrayBuffer(file);
  });
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => { fallbackCopy(text); });
  } else { fallbackCopy(text); }
}

function fallbackCopy(text) {
  const el = document.createElement("textarea");
  el.value = text;
  el.style.cssText = "position:fixed;opacity:0;top:0;left:0;";
  document.body.appendChild(el);
  el.focus(); el.select();
  try { document.execCommand("copy"); } catch(e) {}
  document.body.removeChild(el);
}

const bool2str = v => {
  if (v === true  || v === "true"  || v === "TRUE"  || v === "True"  || v === "1") return "YES";
  if (v === false || v === "false" || v === "FALSE" || v === "False" || v === "0") return "NO";
  return "";
};

const isChinese = o => /^(CN|中国|CHINA)$/i.test(o);

const COLS = [
  { label: "ASIN",           key: "asin" },
  { label: "Description",    key: "desc" },
  { label: "Nihongo",        key: "desc_jp" },
  { label: "HS Code",        key: "hs" },
  { label: "Tariff",         key: "tariff" },
  { label: "TNK",            key: "tnk" },
  { label: "UPS",            key: "ups" },
  { label: "FedEx",          key: "fedex" },
  { label: "DHL",            key: "dhl" },
  { label: "TSCA",           key: "tsca" },
  { label: "SDS",            key: "sds" },
  { label: "Not Restricted", key: "not_restricted" },
  { label: "FDA",            key: "fda" },
  { label: "Cosmetics",      key: "cosmetics" },
  { label: "Food",           key: "food" },
  { label: "Lithium",        key: "lithium" },
  { label: "Magnet",         key: "magnet" },
  { label: "Watch",          key: "watch" },
  { label: "Wood",           key: "wood" },
  { label: "Origin",         key: "origin" },
  { label: "Qty",            key: "qty" },
  { label: "Unit",           key: "unit" },
  { label: "Total",          key: "total" },
  { label: "Est. Duty",      key: "duty" },
  { label: "Memo",           key: "memo" },
];

const BOOL_STANDARD = ["tsca", "sds", "not_restricted", "food", "cosmetics", "fda"];
const BOOL_DANGER   = ["lithium", "magnet"];
const BOOL_SHIPPING = ["tnk", "ups", "dhl", "fedex"];
const WARN_TYPES    = ["watch", "wood"];
const BOOL_KEYS     = [...BOOL_STANDARD, ...BOOL_DANGER, ...BOOL_SHIPPING];

function CopyBtn({ text }) {
  const [ok, setOk] = useState(false);
  return (
    <button onClick={e => { e.stopPropagation(); copyText(text); setOk(true); setTimeout(() => setOk(false), 1500); }}
      style={{ padding: "2px 7px", background: ok ? "#34c759" : "rgba(120,120,128,0.18)", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 9, color: ok ? "#fff" : "#aeaeb2", fontFamily: "inherit", marginLeft: 4 }}>
      {ok ? "✓" : "copy"}
    </button>
  );
}

function Tooltip({ text, children }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && text && (
        <div style={{ position: "absolute", bottom: "120%", left: "50%", transform: "translateX(-50%)", background: "#2c2c2e", color: "#fff", fontSize: 11, padding: "6px 10px", borderRadius: 8, whiteSpace: "pre-wrap", maxWidth: 280, zIndex: 9999, boxShadow: "0 4px 12px rgba(0,0,0,0.5)", pointerEvents: "none" }}>
          {text}
        </div>
      )}
    </div>
  );
}

function BoolCell({ val, type }) {
  if (type === "shipping") return val === "NO" ? <span style={{ fontSize: 12 }}>❌</span> : <span style={{ color: "#3a3a3c", fontSize: 11 }}>—</span>;
  if (type === "danger")   return val === "YES" ? <span style={{ fontSize: 11, fontWeight: 700, color: "#ff453a" }}>!</span> : <span style={{ color: "#3a3a3c", fontSize: 11 }}>—</span>;
  if (type === "warn")     return val === "YES" ? <span style={{ fontSize: 11, fontWeight: 700, color: "#ff9f0a" }}>!</span> : <span style={{ color: "#3a3a3c", fontSize: 11 }}>—</span>;
  return val === "YES" ? <span style={{ fontSize: 11, color: "#30d158" }}>✔</span> : <span style={{ color: "#3a3a3c", fontSize: 11 }}>—</span>;
}

export default function App() {
  const [db,         setDb]         = useState(null);
  const [dbCount,    setDbCount]    = useState(0);
  const [ngList,     setNgList]     = useState({ blacklist: new Set(), blacklistRanges: [], warning: [], safeException: new Set(), safeRanges: [], memoMap: {} });
  const [invRows,    setInvRows]    = useState([]);
  const [rows,       setRows]       = useState([]);
  const [base,       setBase]       = useState([]);
  const [isMerged,   setIsMerged]   = useState(false);
  const [isAdjusted, setIsAdjusted] = useState(false);
  const [status,     setStatus]     = useState("");
  const [dragOver,   setDragOver]   = useState("");
  const [ready,      setReady]      = useState(false);
  const dbRef = useRef(null), ngRef = useRef(null), invRef = useRef(null);

  useEffect(() => { setReady(true); }, []);

  const loadDB = async e => {
    const file = e.target.files[0]; if (!file) return;
    setStatus("Loading...");
    try {
      const parsed = parseCSV(await readFile(file));
      const map = {};
      parsed.forEach(r => {
        if (!r["asin"]) return;
        const norm = {};
        Object.keys(r).forEach(k => { norm[k.trim()] = r[k]; });
        map[r["asin"].trim()] = norm;
      });
      setDb(map); setDbCount(parsed.length);
      setStatus("Master: " + parsed.length.toLocaleString() + " items");
    } catch(err) { setStatus("Error: " + err.message); }
  };

  const loadNG = async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const parsed = parseCSV(await readFile(file));
      const blacklist = new Set(), blacklistRanges = [], warning = [];
      const safeException = new Set(), safeRanges = [], memoMap = {};
      parsed.forEach(r => {
        const hs   = (r["hs_code"] || "").trim().replace(/\./g, "");
        const type = (r["type"]    || "").trim();
        const memo = (r["memo"]    || "").trim();
        if (memo) memoMap[hs] = memo;
        if (type === "safe_exception") {
          if (hs.includes("-")) { const [s,e2] = hs.split("-").map(x=>x.trim()); safeRanges.push({start:s,end:e2,memo}); }
          else safeException.add(hs);
        } else if (type === "blacklist") {
          if (hs.includes("-")) { const [s,e2] = hs.split("-").map(x=>x.trim()); blacklistRanges.push({start:s,end:e2,memo}); }
          else blacklist.add(hs);
        } else if (["warning","watch_list","wood"].includes(type)) {
          if (hs.includes("-")) { const [s,e2] = hs.split("-").map(x=>x.trim()); warning.push({start:s,end:e2,memo,type}); }
          else warning.push({prefix:hs,memo,type});
        }
      });
      setNgList({ blacklist, blacklistRanges, warning, safeException, safeRanges, memoMap });
      setStatus("NG: " + (blacklist.size + blacklistRanges.length) + " BL / " + warning.length + " WARN");
    } catch(err) { setStatus("Error: " + err.message); }
  };

  const loadInv = async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const parsed = parseCSV(await readFile(file));
      setInvRows(parsed); setRows([]); setBase([]);
      setIsMerged(false); setIsAdjusted(false);
      setStatus("Shipment: " + parsed.length + " items");
    } catch(err) { setStatus("Error: " + err.message); }
  };

  const onDrop = fn => e => {
    e.preventDefault(); setDragOver("");
    const file = e.dataTransfer.files[0];
    if (file) fn({ target: { files: [file] } });
  };

  const matchesRange = (clean, start, end) => {
    const code = parseInt(clean.slice(0, start.length));
    return !isNaN(code) && code >= parseInt(start) && code <= parseInt(end);
  };

  const checkNG = hs => {
    if (!hs) return { ng: false, warning: false, label: "", memo: "" };
    const clean = hs.replace(/\./g, "");
    if (ngList.safeException.has(clean.slice(0,6)) || ngList.safeException.has(clean.slice(0,4)))
      return { ng: false, warning: false, label: "SAFE", memo: ngList.memoMap[clean.slice(0,6)] || ngList.memoMap[clean.slice(0,4)] || "" };
    const safeRange = ngList.safeRanges && ngList.safeRanges.find(r => matchesRange(clean, r.start, r.end));
    if (safeRange) return { ng: false, warning: false, label: "SAFE", memo: safeRange.memo || "" };
    const blKey = [clean, clean.slice(0,6), clean.slice(0,4)].find(k => ngList.blacklist.has(k));
    if (blKey) return { ng: true, warning: false, label: "BLACKLIST", memo: ngList.memoMap[blKey] || "" };
    const blRange = ngList.blacklistRanges && ngList.blacklistRanges.find(r => matchesRange(clean, r.start, r.end));
    if (blRange) return { ng: true, warning: false, label: "BLACKLIST", memo: blRange.memo || "" };
    const w = ngList.warning.find(w => {
      if (w.prefix) return clean.startsWith(w.prefix);
      if (w.start && w.end) return matchesRange(clean, w.start, w.end);
      return false;
    });
    if (w) return { ng: false, warning: true, label: (w.type||"warning").toUpperCase().replace("_"," "), memo: w.memo||"" };
    return { ng: false, warning: false, label: "", memo: "" };
  };

  const generate = () => {
    if (!db)             { setStatus("Upload master data first");   return; }
    if (!invRows.length) { setStatus("Upload shipment list first"); return; }
    const res = invRows.map(row => {
      const asin   = (row["ASIN"]   || "").trim();
      const qty    = Number(row["数量"]) || 0;
      const unit   = Number(row["単価"]) || 0;
      const total  = qty * unit;
      const origin = (row["原産国"] || "").trim();
      const empty = { asin, desc:"", desc_jp:"", manufacturer:"", manufacturerName:"", manufacturerAddress:"", hs:"", tariff:"", tariffRate:0, tnk:"", ups:"", dhl:"", fedex:"", tsca:"", sds:"", not_restricted:"", fda:"", cosmetics:"", food:"", lithium:"", magnet:"", watch:"", wood:"", origin, qty, unit, total, duty:0, memo:"", found:false, isCN:isChinese(origin), isNG:false, isWarning:false, ngLabel:"", ngMemo:"" };
      const m = db[asin];
      if (!m) return empty;
      const hs = m["hs_code"] || "";
      const ngCheck = checkNG(hs);
      const tariffRate = parseFloat(m["tariff_rate"]) || 0;
      const duty = Math.round(total * tariffRate / 100);
      const mOrigin = m["origin"] || origin;
      const mName = m["manufacturer_name"] || "";
      const mAddr = m["manufacturer_address"] || "";
      return { asin, desc:m["description"]||"", desc_jp:m["description_jp"]||"", manufacturerName:mName, manufacturerAddress:mAddr, manufacturer:mName?(mName+(mAddr?", "+mAddr:"")):"", hs, tariff:tariffRate+"%", tariffRate, tnk:bool2str(m["tnk"]), ups:bool2str(m["ups"]), dhl:bool2str(m["dhl"]), fedex:bool2str(m["fedex"]), tsca:bool2str(m["tsca"]), sds:bool2str(m["sds"]), not_restricted:bool2str(m["not_restricted"]), fda:bool2str(m["fda"]), cosmetics:bool2str(m["cosmetics"]), food:bool2str(m["food"]), lithium:bool2str(m["lithium_battery"]), magnet:bool2str(m["magnet"]), watch:bool2str(m["watch_list"]), wood:bool2str(m["wood"]), origin:mOrigin, qty, unit, total, duty, memo:m["memo"]||"", found:true, isCN:isChinese(mOrigin), isNG:ngCheck.ng, isWarning:ngCheck.warning, ngLabel:ngCheck.label, ngMemo:ngCheck.memo };
    });
    setBase([...res]); setRows([...res]);
    setIsMerged(false); setIsAdjusted(false);
    setStatus("Done | Matched: "+res.filter(r=>r.found).length+"  No data: "+res.filter(r=>!r.found).length+(res.filter(r=>r.isNG).length>0?"  NG: "+res.filter(r=>r.isNG).length:"")+(res.filter(r=>r.isWarning).length>0?"  Warn: "+res.filter(r=>r.isWarning).length:""));
  };

  const handleMerge = () => {
    const map = {};
    base.forEach(r => {
      const key = [(r.hs||"__nohs__").trim(),(r.desc||"").trim(),(r.manufacturer||"").trim()].join("||");
      if (!map[key]) { map[key] = Object.assign({},r,{_asinList:[r.asin],qty:Number(r.qty)||0,total:Number(r.total)||0,duty:Number(r.duty)||0}); }
      else { map[key].qty+=Number(r.qty)||0; map[key].total+=Number(r.total)||0; map[key].duty+=Number(r.duty)||0; map[key]._asinList.push(r.asin); map[key].asin=map[key]._asinList.join(", "); }
    });
    setRows(Object.values(map)); setIsMerged(true); setIsAdjusted(false);
  };

  const handleAdjust = () => {
    const tot = rows.reduce((s,r)=>s+(Number(r.total)||0),0);
    if (tot<=200000) { setStatus("Already under 200,000"); return; }
    const ratio = 200000/tot;
    setRows(rows.map(r=>Object.assign({},r,{unit:Math.floor((Number(r.unit)||0)*ratio),total:Math.floor((Number(r.total)||0)*ratio),duty:Math.floor((Number(r.duty)||0)*ratio)})));
    setIsAdjusted(true);
  };

  const grandTotal = rows.reduce((s,r)=>s+(Number(r.total)||0),0);
  const grandQty   = rows.reduce((s,r)=>s+(Number(r.qty)||0),0);
  const grandDuty  = rows.reduce((s,r)=>s+(Number(r.duty)||0),0);

  const uploads = [
    { key:"db",  label:"Master Data",   sub:"61,000+ ASIN records", icon:"📦", ref:dbRef,  fn:loadDB,  ok:!!db, info:dbCount.toLocaleString()+" items" },
    { key:"ng",  label:"NG HS Codes",   sub:"Blacklist & warnings",  icon:"🚫", ref:ngRef,  fn:loadNG,  ok:ngList.blacklist.size>0||ngList.warning.length>0, info:ngList.blacklist.size+" BL / "+ngList.warning.length+" WARN" },
    { key:"inv", label:"Shipment List", sub:"items_XXXX.csv",        icon:"📄", ref:invRef, fn:loadInv, ok:invRows.length>0, info:invRows.length+" items" },
  ];

  const buildCopyText = r => { const p=[]; if(r.desc)p.push(r.desc); if(r.hs)p.push(r.hs); if(r.manufacturerName)p.push(r.manufacturerName); if(r.manufacturerAddress)p.push(r.manufacturerAddress); return p.join("\n"); };

  if (!ready) return <div style={{ background:"#000", minHeight:"100vh" }} />;

  return (
    <div style={{ fontFamily:"-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif", background:"#000", minHeight:"100vh", color:"#fff" }}>
      <div style={{ background:"#000", paddingTop:20, paddingLeft:24, paddingRight:24 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:500, color:"#636366", letterSpacing:0.5, marginBottom:4 }}>EXPORT TOOL</div>
            <div style={{ fontSize:30, fontWeight:700, letterSpacing:-0.5 }}>Invoice Maker0331</div>
          </div>
          {rows.length>0 && (
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:11, color:"#636366" }}>Total</div>
              <div style={{ fontSize:22, fontWeight:700, color:grandTotal>200000?"#ff453a":"#fff" }}>¥{grandTotal.toLocaleString()}</div>
              {grandDuty>0 && <div style={{ fontSize:10, color:"#ff9f0a" }}>Duty ¥{grandDuty.toLocaleString()}</div>}
            </div>
          )}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:16 }}>
          {uploads.map(item => (
            <div key={item.key} onClick={()=>item.ref.current&&item.ref.current.click()} onDrop={onDrop(item.fn)} onDragOver={e=>{e.preventDefault();setDragOver(item.key);}} onDragLeave={()=>setDragOver("")}
              style={{ background:item.ok?"#1c1c1e":"#0a0a0a", border:"1px solid "+(dragOver===item.key?"#0a84ff":item.ok?"#2c2c2e":"#1c1c1e"), borderRadius:16, padding:"14px 12px", cursor:"pointer", transition:"all 0.15s" }}>
              <div style={{ fontSize:20, marginBottom:6 }}>{item.ok?"✅":item.icon}</div>
              <div style={{ fontSize:12, fontWeight:600, color:item.ok?"#fff":"#636366" }}>{item.label}</div>
              <div style={{ fontSize:10, color:item.ok?"#30d158":"#3a3a3c", marginTop:3 }}>{item.ok?item.info:item.sub}</div>
              <input type="file" accept=".csv,.tsv,.txt" ref={item.ref} onChange={item.fn} style={{ display:"none" }} />
            </div>
          ))}
        </div>

        <div style={{ display:"flex", gap:8, marginBottom:16 }}>
          <button onClick={generate} disabled={!db||!invRows.length}
            style={{ flex:1, padding:"12px 0", background:db&&invRows.length?"#0a84ff":"#1c1c1e", color:db&&invRows.length?"#fff":"#3a3a3c", border:"none", borderRadius:12, cursor:db&&invRows.length?"pointer":"default", fontWeight:600, fontSize:14, fontFamily:"inherit" }}>
            Invoice生成
          </button>
          {rows.length>0 && (<>
            <button onClick={handleMerge} style={{ flex:1, padding:"12px 0", background:isMerged?"#30d158":"#5e5ce6", color:"#fff", border:"none", borderRadius:12, cursor:"pointer", fontWeight:600, fontSize:14, fontFamily:"inherit" }}>
              {isMerged?"✓ 統合済":"HSで統合"}
            </button>
            <button onClick={handleAdjust} style={{ flex:1, padding:"12px 0", background:isAdjusted?"#30d158":grandTotal>200000?"#ff453a":"#1c1c1e", color:"#fff", border:"none", borderRadius:12, cursor:"pointer", fontWeight:600, fontSize:13, fontFamily:"inherit" }}>
              {isAdjusted?"✓ 調整済":"20万調整"}
            </button>
          </>)}
        </div>

        {status && <div style={{ background:"#1c1c1e", borderRadius:10, padding:"8px 12px", marginBottom:12, fontSize:11, color:"#8e8e93" }}>{status}</div>}

        {rows.length>0 && (
          <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
            <span style={{ fontSize:10, color:"#636366", padding:"3px 8px", background:"#1c1c1e", borderRadius:20 }}>{rows.length} rows · {grandQty} qty</span>
            {rows.filter(r=>r.isNG).length>0 && <span style={{ fontSize:10, fontWeight:600, padding:"3px 8px", background:"rgba(255,69,58,0.2)", color:"#ff453a", borderRadius:20 }}>🚫 NG {rows.filter(r=>r.isNG).length}</span>}
            {rows.filter(r=>r.isWarning).length>0 && <span style={{ fontSize:10, fontWeight:600, padding:"3px 8px", background:"rgba(255,159,10,0.2)", color:"#ff9f0a", borderRadius:20 }}>⚠️ {rows.filter(r=>r.isWarning).length} ({[...new Set(rows.filter(r=>r.isWarning).map(r=>r.ngLabel))].join(" / ")})</span>}
            {rows.filter(r=>r.isCN).length>0 && <span style={{ fontSize:10, fontWeight:600, padding:"3px 8px", background:"rgba(255,69,58,0.15)", color:"#ff6b6b", borderRadius:20 }}>+301 {rows.filter(r=>r.isCN).length}</span>}
          </div>
        )}
      </div>

      {rows.length>0 && (
        <div style={{ background:"#0a0a0a", borderTop:"1px solid #1c1c1e", overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
            <thead>
              <tr style={{ background:"#111", borderBottom:"1px solid #1c1c1e" }}>
                {COLS.map((c,ci) => (
                  <th key={c.key} style={{ padding:ci===0?"8px 8px 8px 24px":ci===COLS.length-1?"8px 24px 8px 8px":"8px", textAlign:["qty","unit","total","duty"].includes(c.key)?"right":"left", fontWeight:500, fontSize:10, color:"#636366", whiteSpace:"nowrap", letterSpacing:0.4 }}>
                    {c.label.toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r,i) => (
                <tr key={i} style={{ borderBottom:"1px solid #1a1a1a", background:r.isNG?"rgba(255,69,58,0.06)":r.isWarning?(i%2===0?"rgba(255,159,10,0.04)":"rgba(255,159,10,0.09)"):i%2===0?"transparent":"rgba(255,255,255,0.04)" }}>
                  {COLS.map((c,ci) => {
                    const val = r[c.key]!=null?String(r[c.key]):"";
                    const p = { padding:ci===0?"8px 8px 8px 24px":ci===COLS.length-1?"8px 24px 8px 8px":"8px" };
                    if (c.key==="asin") return <td key={c.key} style={{...p,whiteSpace:"nowrap"}}><span title={val} style={{fontFamily:"monospace",fontSize:10,color:"#0a84ff",fontWeight:600}}>{val.length>12?val.slice(0,12)+"...":val}</span></td>;
                    if (c.key==="desc") return (
                      <td key={c.key} style={{...p,minWidth:130,maxWidth:200}}>
                        {!r.found&&<span style={{fontSize:9,padding:"1px 4px",borderRadius:4,background:"rgba(255,69,58,0.2)",color:"#ff453a",marginRight:3}}>No data</span>}
                        <div style={{display:"flex",alignItems:"center"}}>
                          <span style={{color:!r.found?"#ff9f0a":"#e5e5ea",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:150}}>{val||"—"}</span>
                          {(r.desc||r.hs||r.manufacturerName||r.manufacturerAddress)&&<CopyBtn text={buildCopyText(r)}/>}
                        </div>
                        {r.manufacturerName&&<div style={{fontSize:9,marginTop:1}}><span style={{color:"#fa8072",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"block",maxWidth:150}}>{r.manufacturerName}</span></div>}
                        {r.manufacturerAddress&&<div style={{fontSize:9,marginTop:1}}><span style={{color:"#fa8072",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"block",maxWidth:150,opacity:0.7}}>{r.manufacturerAddress}</span></div>}
                      </td>
                    );
                    if (c.key==="desc_jp") return <td key={c.key} style={{...p,minWidth:100,maxWidth:160}}><span style={{color:"#8e8e93",fontSize:10,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"block"}}>{r.desc_jp||"—"}</span></td>;
                    if (c.key==="hs") return (
                      <td key={c.key} style={{...p,whiteSpace:"nowrap"}}>
                        <div style={{display:"flex",alignItems:"center"}}>
                          <span style={{fontFamily:"monospace",fontWeight:700,fontSize:10,color:r.isNG?"#ff453a":r.isWarning?"#ff9f0a":val?"#fff":"#3a3a3c"}}>{val||"—"}</span>
                          {r.ngLabel&&(()=>{const isSafe=r.ngLabel==="SAFE";const bg=isSafe?"rgba(48,209,88,0.2)":r.isNG?"rgba(255,69,58,0.2)":"rgba(255,159,10,0.2)";const color=isSafe?"#30d158":r.isNG?"#ff453a":"#ff9f0a";return(<Tooltip text={r.ngMemo||""}><span style={{fontSize:9,marginLeft:4,fontWeight:600,padding:"1px 5px",borderRadius:4,cursor:r.ngMemo?"help":"default",background:bg,color}}>{r.ngLabel}{r.ngMemo?" ?":""}</span></Tooltip>);})()}
                        </div>
                      </td>
                    );
                    if (c.key==="tariff") { const rate=parseFloat(val); return <td key={c.key} style={{...p,whiteSpace:"nowrap",fontWeight:rate>=5?700:400,color:rate>=5?"#ff453a":"#636366"}}>{val||"—"}</td>; }
                    if (c.key==="origin") return <td key={c.key} style={{...p,whiteSpace:"nowrap"}}><span style={{fontSize:10,fontWeight:600,padding:"1px 6px",borderRadius:20,background:r.isCN?"rgba(255,69,58,0.15)":"rgba(255,255,255,0.1)",color:r.isCN?"#ff453a":"#fff"}}>{val||"—"}{r.isCN?" +301":""}</span></td>;
                    if (c.key==="qty") return <td key={c.key} style={{...p,textAlign:"right",color:"#e5e5ea"}}>{val}</td>;
                    if (["unit","total","duty"].includes(c.key)) return <td key={c.key} style={{...p,textAlign:"right",fontWeight:c.key==="total"?700:400,color:c.key==="total"?"#fff":c.key==="duty"&&Number(val)>0?"#ff9f0a":"#636366",whiteSpace:"nowrap"}}>{Number(val)>0?"¥"+Number(val).toLocaleString():"—"}</td>;
                    if (c.key==="memo") return <td key={c.key} style={{...p,textAlign:"center"}}>{val&&val!=="-"?<Tooltip text={val}><span style={{cursor:"help",fontSize:12}}>📝</span></Tooltip>:<span style={{color:"#3a3a3c",fontSize:11}}>—</span>}</td>;
                    if (WARN_TYPES.includes(c.key)) return <td key={c.key} style={{...p,textAlign:"center"}}><BoolCell val={val} type="warn"/></td>;
                    if (BOOL_KEYS.includes(c.key)) return <td key={c.key} style={{...p,textAlign:"center"}}><BoolCell val={val} type={BOOL_SHIPPING.includes(c.key)?"shipping":BOOL_DANGER.includes(c.key)?"danger":"standard"}/></td>;
                    return <td key={c.key} style={{...p,whiteSpace:"nowrap",color:val?"#e5e5ea":"#3a3a3c"}}>{val||"—"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop:"1px solid #2c2c2e", background:"#111" }}>
                {COLS.map((c,ci) => (
                  <td key={c.key} style={{ padding:ci===0?"9px 8px 9px 24px":ci===COLS.length-1?"9px 24px 9px 8px":"9px 8px", textAlign:["qty","unit","total","duty"].includes(c.key)?"right":"left", fontWeight:700, color:"#fff", fontSize:12 }}>
                    {c.key==="total"?"¥"+grandTotal.toLocaleString():c.key==="qty"?grandQty:c.key==="duty"?(grandDuty>0?"¥"+grandDuty.toLocaleString():"—"):ci===0?"Total":""}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
