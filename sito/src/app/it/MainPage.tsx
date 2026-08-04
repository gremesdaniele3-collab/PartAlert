"use client";
import { useState, useEffect, useRef } from "react";

type Part = {
  mpn: string; mfr: string; cat: string; pkg: string; life: string; rohs: number;
  moq: number; lead: string; desc: string; sp: Record<string,string>;
  of: [string,number,number,number][];
};
type Cat = { k:string; n:string; s:string };

const eur = (n:number) => "€ "+(n<0.1?n.toFixed(3):n.toFixed(2)).replace(".",",");
const N = (n:number) => n.toLocaleString("it-IT");
const best = (p:Part) => { const a=p.of.filter(o=>o[2]>0); return a.length?a.reduce((x,y)=>y[1]<x[1]?y:x):null; };
const totStock = (p:Part) => p.of.reduce((s,o)=>s+o[2],0);
const AUTHORIZED: Record<string,boolean> = {DigiKey:true,Mouser:true,Farnell:true,RS:true,TME:true,LCSC:false};

const SELLER_URLS: Record<string,(m:string)=>string> = {
  DigiKey: m=>`/api/go?mpn=${encodeURIComponent(m)}&seller=DigiKey&src=part`,
  Mouser:  m=>`/api/go?mpn=${encodeURIComponent(m)}&seller=Mouser&src=part`,
  Farnell: m=>`/api/go?mpn=${encodeURIComponent(m)}&seller=Farnell&src=part`,
  RS:      m=>`/api/go?mpn=${encodeURIComponent(m)}&seller=RS&src=part`,
  TME:     m=>`/api/go?mpn=${encodeURIComponent(m)}&seller=TME&src=part`,
  LCSC:    m=>`/api/go?mpn=${encodeURIComponent(m)}&seller=LCSC&src=part`,
};

export default function MainPage({ catalog }: { catalog: { categories: Cat[]; parts: Part[] } }) {
  const { categories: CATS, parts: PARTS } = catalog;
  const [view, setView] = useState<"home"|"list"|"part">("home");
  const [curCat, setCurCat] = useState<string|null>(null);
  const [curPart, setCurPart] = useState<Part|null>(null);
  const [filters, setFilters] = useState<{mfr:Set<string>;pkg:Set<string>;av:boolean}>({mfr:new Set(),pkg:new Set(),av:false});
  const [sort, setSort] = useState("price");
  const [q, setQ] = useState("");
  const [sugs, setSugs] = useState<any[]>([]);
  const [si, setSi] = useState(-1);
  const [alertMsg, setAlertMsg] = useState("");
  const [alertLoading, setAlertLoading] = useState(false);
  const [targetPrice, setTargetPrice] = useState(0);
  const [watchPrice, setWatchPrice] = useState(true);
  const [watchStock, setWatchStock] = useState(false);
  const [email, setEmail] = useState("");
  const qRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (q.length < 2) { setSugs([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}${curCat?`&cat=${curCat}`:""}`);
      setSugs(await r.json());
    }, 200);
    return () => clearTimeout(t);
  }, [q, curCat]);

  const goHome = () => { setView("home"); setCurCat(null); setCurPart(null); setFilters({mfr:new Set(),pkg:new Set(),av:false}); };
  const goList = (ck:string|null) => { setCurCat(ck); setView("list"); setFilters({mfr:new Set(),pkg:new Set(),av:false}); };
  const goPart = (p:Part) => { setCurPart(p); setView("part"); const b=best(p); setTargetPrice(b?+(b[1]*0.85).toFixed(b[1]<0.1?3:2):0); setWatchPrice(!!b); setWatchStock(p.of.some(o=>o[2]===0)); setAlertMsg(""); };
  const openPart = (mpn:string) => { const p=PARTS.find(x=>x.mpn===mpn); if(p) goPart(p); setSugs([]); setQ(""); };

  const listParts = () => {
    let out = curCat ? PARTS.filter(p=>p.cat===curCat) : PARTS.slice();
    if (filters.mfr.size) out = out.filter(p=>filters.mfr.has(p.mfr));
    if (filters.pkg.size) out = out.filter(p=>filters.pkg.has(p.pkg));
    if (filters.av) out = out.filter(p=>totStock(p)>0);
    out.sort((a,b)=>sort==="mpn"?a.mpn.localeCompare(b.mpn):sort==="stock"?totStock(b)-totStock(a):((best(a)?.[1]??1e9)-(best(b)?.[1]??1e9)));
    return out;
  };

  const submitAlert = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) { setAlertMsg("Inserisci un indirizzo email valido."); return; }
    if (!watchPrice && !watchStock) { setAlertMsg("Seleziona almeno una condizione."); return; }
    setAlertLoading(true);
    try {
      const r = await fetch("/api/alerts", { method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ email, mpn: curPart!.mpn, manufacturer: curPart!.mfr,
          targetPrice: watchPrice ? targetPrice : null, watchStock }) });
      const j = await r.json();
      setAlertMsg(j.message ?? j.error ?? "Fatto.");
    } catch { setAlertMsg("Errore di rete. Riprova."); }
    setAlertLoading(false);
  };

  const base = curCat?PARTS.filter(p=>p.cat===curCat):PARTS;
  const mfrs = [...new Set(base.map(p=>p.mfr))].sort();
  const pkgs = [...new Set(base.map(p=>p.pkg))].sort();
  const cat = CATS.find(c=>c.k===curCat);

  const drops = [
    {mpn:"RP2040",d:"DigiKey",da:1.02,a:0.94},{mpn:"STM32F103C8T6",d:"LCSC",da:1.71,a:1.62},
    {mpn:"IRLZ44N",d:"LCSC",da:0.98,a:0.92},{mpn:"TL072CP",d:"TME",da:0.86,a:0.79},
    {mpn:"CL21A106KOQNNNE",d:"Mouser",da:0.089,a:0.079},{mpn:"G5LE-14-DC5",d:"Mouser",da:2.22,a:2.09},
  ];
  const backs = [
    {mpn:"ESP32-WROOM-32E",d:"Mouser",q:1180},{mpn:"AMS1117-3.3",d:"TME",q:9400},
    {mpn:"NRF52840-QIAA",d:"Mouser",q:3100},{mpn:"DS18B20",d:"Farnell",q:0},
    {mpn:"ATMEGA328P-PU",d:"Farnell",q:410},{mpn:"UVR1H101MED",d:"RS",q:1200},
  ];

  return (
    <>
    <style>{`
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;font-size:14px;color:#202124;background:#fff}
      a{color:#0b4f9e;text-decoration:none} a:hover{text-decoration:underline}
      .wrap{max-width:1240px;margin:0 auto;padding:0 16px}
      .util{background:#f5f6f7;border-bottom:1px solid #dadce0;font-size:12px;color:#5f6368}
      .util .wrap{display:flex;align-items:center;gap:18px;height:32px}
      .hdr{border-bottom:1px solid #dadce0}
      .hdr .wrap{display:flex;align-items:center;gap:20px;padding:14px 16px;flex-wrap:wrap}
      .logo{display:flex;align-items:center;gap:8px;background:none;border:0;cursor:pointer;padding:0;flex:none}
      .logo .mk{width:26px;height:26px;background:#0b4f9e;border-radius:3px;position:relative}
      .logo .mk::before{content:"";position:absolute;background:#fff;left:5px;right:5px;top:12px;height:2px}
      .logo .mk::after{content:"";position:absolute;background:#fff;left:12px;top:5px;bottom:5px;width:2px}
      .logo .t{font-size:20px;font-weight:700;color:#202124} .logo .t span{color:#0b4f9e}
      .sb{flex:1;display:flex;position:relative;max-width:660px}
      .sb select{border:1px solid #dadce0;border-right:0;background:#f5f6f7;font-size:13px;padding:0 8px;color:#5f6368;border-radius:3px 0 0 3px;max-width:160px}
      .sb input{flex:1;border:1px solid #dadce0;padding:10px 12px;font-size:14px;min-width:0;outline:none}
      .sb input:focus{border-color:#0b4f9e}
      .sb .sbtn{background:#0b4f9e;border:0;color:#fff;padding:0 18px;cursor:pointer;border-radius:0 3px 3px 0;font-size:14px}
      .sug{position:absolute;top:calc(100% + 3px);left:0;right:0;background:#fff;border:1px solid #dadce0;box-shadow:0 4px 14px rgba(0,0,0,.14);z-index:80;max-height:330px;overflow:auto}
      .sug button{display:flex;gap:10px;align-items:center;width:100%;text-align:left;padding:9px 12px;border:0;border-bottom:1px solid #edeef0;background:none;cursor:pointer;font-size:13px;color:#202124}
      .sug button:hover,.sug button.on{background:#e8f0f9}
      .sug b{font-weight:600;color:#0b4f9e} .sug i{font-style:normal;color:#5f6368;font-size:12px}
      .hdr-r{margin-left:auto;display:flex;gap:20px;align-items:center;font-size:13px}
      .nav{background:#0b4f9e;color:#fff;overflow-x:auto}
      .nav .wrap{display:flex}
      .nav button{background:none;border:0;color:#fff;padding:11px 14px;cursor:pointer;font-size:13.5px;white-space:nowrap}
      .nav button:hover,.nav button.on{background:#083c79;font-weight:600}
      .crumb{font-size:12.5px;color:#5f6368;padding:12px 0}
      .crumb button{background:none;border:0;padding:0;color:#0b4f9e;cursor:pointer;font-size:12.5px}
      h1{font-size:24px;font-weight:600;margin:0 0 4px} h2{font-size:18px;font-weight:600;margin:0}
      .sec{margin:32px 0} .sec-h{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #dadce0;padding-bottom:8px;margin-bottom:16px}
      .hero{display:grid;grid-template-columns:1.6fr 1fr;gap:16px;margin-top:18px}
      .hero .main{background:#0b4f9e;color:#fff;padding:28px 30px;border-radius:4px}
      .hero .main h1{color:#fff;font-size:26px;line-height:1.3;margin-bottom:10px}
      .hero .main p{font-size:15px;color:#d6e3f3;line-height:1.5;margin-bottom:18px;max-width:44ch}
      .hero .side{border:1px solid #dadce0;border-radius:4px;padding:18px 20px}
      .hero .side h3{font-size:15px;font-weight:600;margin-bottom:10px}
      .hero .side ul{padding-left:18px;font-size:13.5px;color:#5f6368;line-height:1.9}
      .tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}
      .tile{border:1px solid #dadce0;border-radius:4px;padding:14px;text-align:center;background:#fff;cursor:pointer;font:inherit;color:#202124;width:100%}
      .tile:hover{border-color:#0b4f9e;box-shadow:0 1px 6px rgba(0,0,0,.1)}
      .tile .n{font-size:13px;font-weight:600;margin-top:8px} .tile .c{font-size:11.5px;color:#80868b;margin-top:4px}
      .two{display:grid;grid-template-columns:1fr 1fr;gap:20px}
      .card{border:1px solid #dadce0;border-radius:4px;overflow:hidden}
      .card-h{background:#f5f6f7;border-bottom:1px solid #dadce0;padding:10px 14px;font-size:13.5px;font-weight:600;display:flex;justify-content:space-between}
      .card-h em{font-style:normal;font-weight:400;font-size:12px;color:#5f6368}
      .mv{display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid #edeef0;width:100%;background:none;border-left:0;border-right:0;border-top:0;text-align:left;cursor:pointer;font:inherit;color:#202124}
      .mv:last-child{border-bottom:0} .mv:hover{background:#f5f6f7}
      .mv .p{flex:1;min-width:0} .mv .p b{display:block;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .mv .p span{font-size:11.5px;color:#5f6368} .mv .v{font-size:12.5px;text-align:right}
      .mv .v b{display:block;font-weight:600} .dn{color:#137333} .oo{color:#c5221f} .lo{color:#b06000}
      .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px}
      .pc{border:1px solid #dadce0;border-radius:4px;padding:12px;background:#fff;cursor:pointer;text-align:left;font:inherit;color:#202124;display:flex;flex-direction:column;width:100%}
      .pc:hover{border-color:#0b4f9e;box-shadow:0 1px 6px rgba(0,0,0,.09)}
      .pc .mpn{font-size:13.5px;font-weight:600;color:#0b4f9e;word-break:break-all;line-height:1.3}
      .pc .mfr{font-size:12px;color:#5f6368;margin:3px 0 6px}
      .pc .d{font-size:12px;color:#5f6368;line-height:1.4;flex:1;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      .pc .pr{font-size:16px;font-weight:600;margin-top:9px}
      .pc .st{font-size:12px;margin-top:3px}
      .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
      .step{border:1px solid #dadce0;border-radius:4px;padding:18px}
      .step .n{width:26px;height:26px;border-radius:50%;background:#0b4f9e;color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;margin-bottom:10px}
      .step h4{font-size:15px;font-weight:600;margin-bottom:6px} .step p{font-size:13px;color:#5f6368;line-height:1.55}
      .dist{display:flex;gap:10px;flex-wrap:wrap}
      .dist div{border:1px solid #dadce0;border-radius:3px;padding:10px 16px;font-size:13.5px;font-weight:600;color:#5f6368}
      .split{display:grid;grid-template-columns:220px 1fr;gap:22px;align-items:start;margin-top:18px}
      .fl{border:1px solid #dadce0;border-radius:4px}
      .fl-g{border-bottom:1px solid #edeef0;padding:12px 14px}
      .fl-g:last-of-type{border-bottom:0}
      .fl-t{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:#5f6368;margin-bottom:8px}
      .fo{display:flex;align-items:center;gap:8px;padding:3px 0;font-size:13px;cursor:pointer}
      .fo input{accent-color:#0b4f9e;width:14px;height:14px;flex:none}
      .fo span{margin-left:auto;color:#80868b;font-size:12px}
      .fl-c{width:100%;border:0;border-top:1px solid #edeef0;background:none;padding:10px;color:#0b4f9e;cursor:pointer;font-size:13px}
      .lst{border:1px solid #dadce0;border-radius:4px}
      .lst-t{display:flex;justify-content:space-between;align-items:center;background:#f5f6f7;border-bottom:1px solid #dadce0;padding:9px 14px;font-size:13px;color:#5f6368}
      .lst-t select{font-size:13px;padding:4px 6px;border:1px solid #dadce0;background:#fff}
      .li{display:grid;grid-template-columns:76px 1fr 140px 130px;gap:14px;align-items:center;padding:14px;border-bottom:1px solid #edeef0;width:100%;background:none;border-left:0;border-right:0;border-top:0;text-align:left;cursor:pointer;font:inherit;color:#202124}
      .li:last-child{border-bottom:0} .li:hover{background:#f5f6f7}
      .li .mpn{font-size:14.5px;font-weight:600;color:#0b4f9e}
      .li .mfr{font-size:12.5px;color:#5f6368;margin:2px 0 4px}
      .li .d{font-size:12.5px;color:#5f6368} .li .meta{font-size:11.5px;color:#80868b;margin-top:5px}
      .li .pr{text-align:right} .li .pr b{font-size:16px;font-weight:600;display:block}
      .li .pr span{font-size:11.5px;color:#5f6368} .li .stk{font-size:12.5px}
      .pd{display:grid;grid-template-columns:260px 1fr;gap:28px;align-items:start;margin-top:6px}
      .pd .img{border:1px solid #dadce0;border-radius:4px;padding:18px;text-align:center;font-size:11px;color:#80868b}
      .pd .img .ph{width:100%;height:160px;background:#f5f6f7;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:13px;color:#80868b;margin-bottom:10px}
      .ds{display:block;margin-top:8px;font-size:13px;padding:9px;border:1px solid #dadce0;border-radius:3px;text-align:center;color:#0b4f9e}
      .ds:hover{background:#f5f6f7}
      .tags{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}
      .tg{font-size:11.5px;padding:3px 8px;border-radius:2px;background:#f5f6f7;color:#5f6368;border:1px solid #dadce0}
      .tg.ok{background:#e6f4ea;color:#137333;border-color:#b7e0c4}
      .tg.wn{background:#fef7e0;color:#b06000;border-color:#f3d9a0}
      .kpis{display:flex;gap:30px;flex-wrap:wrap;padding:14px 0;border-top:1px solid #edeef0;border-bottom:1px solid #edeef0;margin-bottom:18px}
      .kpi .k{font-size:12px;color:#5f6368} .kpi .v{font-size:20px;font-weight:600;margin-top:2px}
      table{width:100%;border-collapse:collapse;font-size:13.5px}
      th{text-align:left;font-weight:600;font-size:12px;color:#5f6368;padding:9px 14px;background:#f5f6f7;border-bottom:1px solid #dadce0}
      th.n,td.n{text-align:right} td{padding:11px 14px;border-bottom:1px solid #edeef0;vertical-align:middle}
      tbody tr:last-child td{border-bottom:0} tr.best td{background:#f7fbf8}
      .pill{font-size:11px;background:#137333;color:#fff;padding:1px 6px;border-radius:2px;margin-left:7px}
      .sm{font-size:11.5px;color:#80868b;display:block;margin-top:2px}
      .al{border:1px solid #0b4f9e;border-radius:4px;margin-top:22px}
      .al-h{background:#e8f0f9;border-bottom:1px solid #dadce0;padding:12px 16px;font-size:15px;font-weight:600}
      .al-b{padding:16px}
      .opt{display:flex;gap:10px;align-items:flex-start;padding:10px 0}
      .opt+.opt{border-top:1px solid #edeef0}
      .opt input[type=checkbox]{width:16px;height:16px;accent-color:#0b4f9e;margin-top:2px;flex:none}
      .opt .l{font-size:14px;font-weight:600} .opt .h{font-size:12.5px;color:#5f6368;margin-top:2px;line-height:1.45}
      .trim{margin:8px 0 4px;padding:14px;background:#f5f6f7;border:1px solid #dadce0;border-radius:3px}
      .trim-t{display:flex;justify-content:space-between;align-items:baseline}
      .trim-t .k{font-size:12px;color:#5f6368} .trim-t .v{font-size:21px;font-weight:600;color:#0b4f9e}
      input[type=range]{width:100%;accent-color:#0b4f9e;margin:12px 0 0;display:block}
      .scale{display:flex;justify-content:space-between;font-size:11.5px;color:#5f6368;margin-top:4px}
      .arm{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap}
      .arm input[type=email]{flex:1;min-width:200px;padding:11px 12px;border:1px solid #dadce0;border-radius:3px;font-size:14px}
      .btn{background:#0b4f9e;color:#fff;border:0;padding:11px 22px;border-radius:3px;cursor:pointer;font-size:14px;font-weight:600}
      .btn:hover{background:#083c79} .btn:disabled{background:#dadce0;cursor:not-allowed}
      .msg{margin-top:12px;font-size:13px;padding:10px 12px;border-radius:3px;background:#e6f4ea;color:#137333;border:1px solid #b7e0c4}
      .msg.err{background:#fce8e6;color:#c5221f;border-color:#f5c6c2}
      .spec-t td:first-child{width:38%;color:#5f6368}
      footer{background:#f5f6f7;border-top:1px solid #dadce0;margin-top:52px;padding:28px 0 40px}
      .fcols{display:grid;grid-template-columns:repeat(4,1fr);gap:26px}
      .fcols h5{margin:0 0 10px;font-size:13px;font-weight:600}
      .fcols ul{list-style:none;font-size:13px;line-height:2}
      .fcols a{color:#5f6368} .fbot{border-top:1px solid #dadce0;margin-top:24px;padding-top:16px;font-size:12px;color:#80868b;line-height:1.7}
      @media(max-width:900px){.hero,.two,.split,.pd,.steps{grid-template-columns:1fr}.fcols{grid-template-columns:1fr 1fr}}
      @media(max-width:640px){.li{grid-template-columns:1fr auto}.li .stk{display:none}.sb select{display:none}}
    `}</style>

    <div className="util"><div className="wrap"><span>Monitoraggio orario su 6 distributori autorizzati</span></div></div>

    <header className="hdr"><div className="wrap">
      <button className="logo" onClick={goHome}><span className="mk"/><span className="t">Part<span>Alert</span></span></button>
      <div className="sb">
        <select value={curCat??""} onChange={e=>setCurCat(e.target.value||null)}>
          <option value="">Tutte le categorie</option>
          {CATS.map(c=><option key={c.k} value={c.k}>{c.n}</option>)}
        </select>
        <input ref={qRef} type="search" value={q} onChange={e=>setQ(e.target.value)}
          placeholder="Cerca per codice produttore, es. STM32F103C8T6"
          onKeyDown={e=>{
            if(e.key==="ArrowDown") setSi(i=>Math.min(i+1,sugs.length-1));
            else if(e.key==="ArrowUp") setSi(i=>Math.max(i-1,-1));
            else if(e.key==="Enter"&&sugs.length) openPart(sugs[si>=0?si:0].mpn);
            else if(e.key==="Escape") setSugs([]);
          }}/>
        <button className="sbtn" onClick={()=>{if(sugs.length)openPart(sugs[0].mpn)}}>Cerca</button>
        {sugs.length>0&&<div className="sug">
          {sugs.map((s,i)=><button key={s.mpn} className={i===si?"on":""} onClick={()=>openPart(s.mpn)}>
            <b>{s.mpn}</b>&nbsp;<i>— {s.mfr} · {s.pkg}</i>
          </button>)}
        </div>}
      </div>
      <div className="hdr-r"><a href="#">Accedi</a></div>
    </div></header>

    <nav className="nav"><div className="wrap">
      <button className={!curCat&&view==="list"?"on":""} onClick={()=>goList(null)}>Tutti i prodotti</button>
      {CATS.map(c=><button key={c.k} className={curCat===c.k&&view==="list"?"on":""} onClick={()=>goList(c.k)}>{c.n}</button>)}
    </div></nav>

    <div className="wrap">
      <div className="crumb">
        {view!=="home"&&<><button onClick={goHome}>Home</button> › </>}
        {view==="list"&&<span>{cat?cat.n:"Tutti i prodotti"}</span>}
        {view==="part"&&<><button onClick={()=>goList(curPart?.cat??null)}>{cat?.n??""}</button> › <span>{curPart?.mpn}</span></>}
      </div>
    </div>

    <main className="wrap">

    {/* HOME */}
    {view==="home"&&<>
      <div className="hero">
        <div className="main">
          <h1>Il prezzo giusto, nel momento giusto</h1>
          <p>Confronta prezzo e giacenza su 6 distributori autorizzati. Ricevi un avviso quando il prezzo scende o quando il pezzo torna disponibile.</p>
          <button style={{background:"#fff",color:"#0b4f9e",padding:"10px 18px",border:0,borderRadius:3,fontWeight:600,cursor:"pointer"}} onClick={()=>qRef.current?.focus()}>Cerca un componente</button>
        </div>
        <div className="hero side">
          <h3>Perché serve</h3>
          <ul>
            <li>Un componente esaurito può fermare un progetto per mesi</li>
            <li>Lo stesso codice varia anche del 40% tra distributori</li>
            <li>Controllo ogni ora, avviso solo alla transizione</li>
            <li>Gratuito: non vendiamo componenti, ti mandiamo al distributore</li>
          </ul>
        </div>
      </div>

      <section className="sec">
        <div className="sec-h"><h2>Categorie</h2></div>
        <div className="tiles">
          {CATS.map(c=><button key={c.k} className="tile" onClick={()=>goList(c.k)}>
            <div className="n">{c.n}</div>
            <div className="c">{PARTS.filter(p=>p.cat===c.k).length} codici</div>
          </button>)}
        </div>
      </section>

      <section className="sec"><div className="two">
        <div className="card">
          <div className="card-h">Cali di prezzo di oggi <em>aggiornato ora</em></div>
          {drops.map(d=>{const p=PARTS.find(x=>x.mpn===d.mpn);if(!p)return null;return(
            <button key={d.mpn} className="mv" onClick={()=>goPart(p)}>
              <span className="p"><b>{d.mpn}</b><span>{d.d} · {p.mfr}</span></span>
              <span className="v"><b className="dn">{eur(d.a)}</b><span style={{textDecoration:"line-through",color:"#80868b"}}>{eur(d.da)}</span></span>
            </button>);})}
        </div>
        <div className="card">
          <div className="card-h">Tornati disponibili <em>ultime 24 ore</em></div>
          {backs.map(b=>{const p=PARTS.find(x=>x.mpn===b.mpn);if(!p)return null;return(
            <button key={b.mpn} className="mv" onClick={()=>goPart(p)}>
              <span className="p"><b>{b.mpn}</b><span>{b.d} · {p.mfr}</span></span>
              <span className="v"><b className="dn">{N(b.q)} pz</b><span style={{color:"#80868b"}}>era esaurito</span></span>
            </button>);})}
        </div>
      </div></section>

      <section className="sec">
        <div className="sec-h"><h2>Componenti più cercati</h2></div>
        <div className="grid">
          {["STM32F103C8T6","ESP32-WROOM-32E","RP2040","NE555P","IRLZ44N","AMS1117-3.3","ATMEGA328P-PU","LM2596S-ADJ","BC547B","CC0805KRX7R9BB104"]
            .map(m=>PARTS.find(p=>p.mpn===m)).filter(Boolean).map(p=>p!).map(p=>{
              const b=best(p);
              return <button key={p.mpn} className="pc" onClick={()=>goPart(p)}>
                <div className="mpn">{p.mpn}</div>
                <div className="mfr">{p.mfr}</div>
                <div className="d">{p.desc}</div>
                <div className="pr">{b?eur(b[1]):"n.d."}</div>
                <div className="st">{totStock(p)>0?<span className="dn">Disponibile</span>:<span className="oo">Esaurito</span>}</div>
              </button>;
            })}
        </div>
      </section>

      <section className="sec">
        <div className="sec-h"><h2>Come funziona</h2></div>
        <div className="steps">
          <div className="step"><div className="n">1</div><h4>Cerca il codice</h4><p>Inserisci il codice produttore. Mostriamo prezzi, giacenze e scaglioni di tutti i distributori che lo trattano.</p></div>
          <div className="step"><div className="n">2</div><h4>Imposta l'avviso</h4><p>Scegli il prezzo obiettivo o l'avviso di rientro in stock. Serve solo l'email, senza registrazione.</p></div>
          <div className="step"><div className="n">3</div><h4>Ricevi la notifica</h4><p>Controlliamo ogni ora e ti scriviamo solo quando la condizione si verifica. Nessuna email promozionale.</p></div>
        </div>
      </section>

      <section className="sec">
        <div className="sec-h"><h2>Distributori monitorati</h2></div>
        <div className="dist">{["DigiKey","Mouser Electronics","Farnell / element14","RS Components","TME","LCSC"].map(d=><div key={d}>{d}</div>)}</div>
      </section>
    </>}

    {/* LISTING */}
    {view==="list"&&<>
      <h1 style={{marginTop:8}}>{cat?cat.n:"Tutti i prodotti"}</h1>
      <p style={{color:"#5f6368",marginBottom:18}}>{cat?cat.s:`${PARTS.length} codici monitorati`}</p>
      <div className="split">
        <aside className="fl">
          <div className="fl-g"><div className="fl-t">Disponibilità</div>
            <label className="fo"><input type="checkbox" checked={filters.av} onChange={e=>setFilters(f=>({...f,av:e.target.checked}))}/>Solo a magazzino <span>{base.filter(p=>totStock(p)>0).length}</span></label>
          </div>
          <div className="fl-g"><div className="fl-t">Produttore</div>
            {mfrs.map(m=><label key={m} className="fo"><input type="checkbox" checked={filters.mfr.has(m)}
              onChange={e=>{const s=new Set(filters.mfr);e.target.checked?s.add(m):s.delete(m);setFilters(f=>({...f,mfr:s}))}}/>
              {m} <span>{base.filter(p=>p.mfr===m).length}</span></label>)}
          </div>
          <div className="fl-g"><div className="fl-t">Contenitore</div>
            {pkgs.map(k=><label key={k} className="fo"><input type="checkbox" checked={filters.pkg.has(k)}
              onChange={e=>{const s=new Set(filters.pkg);e.target.checked?s.add(k):s.delete(k);setFilters(f=>({...f,pkg:s}))}}/>
              {k} <span>{base.filter(p=>p.pkg===k).length}</span></label>)}
          </div>
          <button className="fl-c" onClick={()=>setFilters({mfr:new Set(),pkg:new Set(),av:false})}>Azzera filtri</button>
        </aside>
        <div className="lst">
          <div className="lst-t">
            <span>{listParts().length} risultati</span>
            <span>Ordina per <select value={sort} onChange={e=>setSort(e.target.value)}>
              <option value="price">Prezzo crescente</option>
              <option value="stock">Giacenza</option>
              <option value="mpn">Codice A-Z</option>
            </select></span>
          </div>
          {listParts().map(p=>{const b=best(p);return(
            <button key={p.mpn} className="li" onClick={()=>goPart(p)}>
              <span/>
              <span><span className="mpn">{p.mpn}</span><span className="mfr">{p.mfr}</span><span className="d">{p.desc}</span><span className="meta">{p.pkg} · {p.life}{p.rohs?" · RoHS":""}</span></span>
              <span className="stk">{totStock(p)>0?<span className="dn">{N(totStock(p))} pz</span>:<span className="oo">Esaurito</span>}</span>
              <span className="pr">{b?<><b>{eur(b[1])}</b><span>presso {b[0]}</span></>:<><b className="oo">n.d.</b><span>nessuna offerta</span></>}</span>
            </button>);})}
          {!listParts().length&&<div style={{padding:44,textAlign:"center",color:"#5f6368"}}>Nessun risultato con i filtri selezionati.</div>}
        </div>
      </div>
    </>}

    {/* SCHEDA PRODOTTO */}
    {view==="part"&&curPart&&(()=>{
      const p=curPart, b=best(p), av=p.of.filter(o=>o[2]>0).length;
      const rows=[...p.of].sort((x,y)=>(y[2]>0?1:0)-(x[2]>0?1:0)||x[1]-y[1]);
      const mn=b?+(b[1]*0.4).toFixed(3):0, mx=b?b[1]:1, sp=b&&b[1]<0.1?0.001:0.01;
      return <>
        <div className="pd">
          <div>
            <div className="pd img">
              <div className="ph">Immagine componente</div>
              <div style={{fontSize:12,color:"#80868b"}}>{p.pkg}</div>
            </div>
            <a className="ds" href={`https://octopart.com/search?q=${encodeURIComponent(p.mpn)}`} target="_blank" rel="noopener">Datasheet su Octopart ↗</a>
            <a className="ds" href={`https://octopart.com/search?q=${encodeURIComponent(p.mpn)}`} target="_blank" rel="noopener" style={{marginTop:6}}>Componenti equivalenti ↗</a>
          </div>
          <div>
            <h1>{p.mpn}</h1>
            <div style={{fontSize:14.5,color:"#5f6368",marginBottom:12}}>{p.mfr} — {p.desc}</div>
            <div className="tags">
              <span className={`tg ${p.life==="Attivo"?"ok":"wn"}`}>Ciclo di vita: {p.life}</span>
              {p.rohs?<span className="tg">Conforme RoHS</span>:null}
              <span className="tg">{p.pkg}</span>
              <span className="tg">MOQ: {p.moq} pz</span>
              <span className="tg">Lead time: {p.lead}</span>
            </div>
            <div className="kpis">
              <div className="kpi"><div className="k">Prezzo più basso</div><div className="v">{b?eur(b[1]):"n.d."}</div></div>
              <div className="kpi"><div className="k">Giacenza totale</div><div className="v">{N(totStock(p))} pz</div></div>
              <div className="kpi"><div className="k">Distributori con stock</div><div className="v">{av} su {p.of.length}</div></div>
            </div>

            <h2 style={{marginBottom:10}}>Offerte dei distributori</h2>
            <div className="card"><table>
              <thead><tr><th>Distributore</th><th className="n">1 pz</th><th className="n">10 pz</th><th className="n">100 pz</th><th>Giacenza</th><th/></tr></thead>
              <tbody>{rows.map(o=><tr key={o[0]} className={o===b?"best":""}>
                <td>{o[0]}{o===b?<span className="pill">Migliore</span>:null}
                  <span className="sm">{AUTHORIZED[o[0]]?"Distributore autorizzato":"Distributore indipendente"}</span></td>
                <td className="n"><b>{eur(o[1])}</b></td>
                <td className="n">{eur(o[1]*0.92)}</td>
                <td className="n">{eur(o[1]*0.81)}</td>
                <td>{o[2]>0?<span className="dn">{N(o[2])} pz</span>:<span className="oo">Esaurito</span>}</td>
                <td className="n"><a href={SELLER_URLS[o[0]]?.(p.mpn)??`#`} target="_blank" rel="noopener" onClick={e=>{e.preventDefault();window.open(SELLER_URLS[o[0]]?.(p.mpn)??"#","_blank")}}>Vai al sito ↗</a></td>
              </tr>)}</tbody>
            </table></div>

            <div className="al">
              <div className="al-h">Ricevi un avviso su {p.mpn}</div>
              <div className="al-b">
                <div className="opt">
                  <input type="checkbox" id="cp" checked={watchPrice} disabled={!b} onChange={e=>setWatchPrice(e.target.checked)}/>
                  <label htmlFor="cp"><div className="l">Avvisami quando il prezzo scende</div>
                    <div className="h">{b?"Confrontiamo ogni ora tutti i distributori.":"Nessuna offerta attiva: serve prima un rientro a magazzino."}</div></label>
                </div>
                {b&&watchPrice&&<div className="trim">
                  <div className="trim-t"><span className="k">Prezzo obiettivo</span><span className="trim-t v">{eur(targetPrice)}</span></div>
                  <input type="range" min={mn} max={mx} step={sp} value={targetPrice} onChange={e=>setTargetPrice(+e.target.value)}/>
                  <div className="scale"><span>{eur(mn)}</span><span>oggi {eur(mx)}</span></div>
                </div>}
                <div className="opt">
                  <input type="checkbox" id="cs" checked={watchStock} onChange={e=>setWatchStock(e.target.checked)}/>
                  <label htmlFor="cs"><div className="l">Avvisami quando torna disponibile</div>
                    <div className="h">{av===p.of.length?"Ora disponibile ovunque. L'avviso scatta se va esaurito e rientra.":`${p.of.length-av} distributori su ${p.of.length} sono esauriti.`}</div></label>
                </div>
                <div className="arm">
                  <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="indirizzo@email.it"/>
                  <button className="btn" disabled={alertLoading} onClick={submitAlert}>{alertLoading?"Invio...":"Attiva avviso"}</button>
                </div>
                {alertMsg&&<div className={`msg${alertMsg.includes("Controlla")||alertMsg.includes("Fatto")?"":' err'}`}>{alertMsg}</div>}
              </div>
            </div>

            <h2 style={{margin:"26px 0 10px"}}>Specifiche tecniche</h2>
            <div className="card"><table className="spec-t"><tbody>
              {Object.entries(p.sp).map(([k,v])=><tr key={k}><td>{k}</td><td>{v}</td></tr>)}
              <tr><td>Codice produttore</td><td>{p.mpn}</td></tr>
              <tr><td>Produttore</td><td>{p.mfr}</td></tr>
              <tr><td>Quantità minima d'ordine</td><td>{p.moq} pz</td></tr>
              <tr><td>Lead time tipico</td><td>{p.lead}</td></tr>
            </tbody></table></div>
          </div>
        </div>

        <section className="sec">
          <div className="sec-h"><h2>Altri codici in {cat?.n}</h2></div>
          <div className="grid">
            {PARTS.filter(x=>x.cat===p.cat&&x.mpn!==p.mpn).slice(0,5).map(x=>{
              const bx=best(x);
              return <button key={x.mpn} className="pc" onClick={()=>goPart(x)}>
                <div className="mpn">{x.mpn}</div><div className="mfr">{x.mfr}</div>
                <div className="d">{x.desc}</div>
                <div className="pr">{bx?eur(bx[1]):"n.d."}</div>
                <div className="st">{totStock(x)>0?<span className="dn">Disponibile</span>:<span className="oo">Esaurito</span>}</div>
              </button>;
            })}
          </div>
        </section>
      </>;
    })()}

    </main>

    <footer><div className="wrap">
      <div className="fcols">
        <div><h5>Catalogo</h5><ul>{CATS.map(c=><li key={c.k}><button style={{background:"none",border:0,cursor:"pointer",fontSize:13,color:"#5f6368",padding:0}} onClick={()=>goList(c.k)}>{c.n}</button></li>)}</ul></div>
        <div><h5>Strumenti</h5><ul><li>Avvisi prezzo e stock</li><li>Storico prezzi</li><li>Analisi distinta base</li><li>Componenti alternativi</li></ul></div>
        <div><h5>Distributori</h5><ul>{["DigiKey","Mouser","Farnell","RS Components","TME","LCSC"].map(d=><li key={d}>{d}</li>)}</ul></div>
        <div><h5>Info</h5><ul><li>Come funziona</li><li>Fonti dei dati</li><li>Contatti</li><li>Privacy</li></ul></div>
      </div>
      <div className="fbot">
        Prototipo — dati di esempio. In produzione i prezzi arrivano dalle API dei distributori.<br/>
        PartAlert non vende componenti: confronta le offerte e rimanda al distributore. I marchi citati appartengono ai rispettivi titolari.
      </div>
    </div></footer>
    </>
  );
}
