import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  CloudRain, Zap, Play, Pause, RotateCcw, Dices,
  Gem, Package, Flame, Sparkles, ScrollText, Skull, Target, Eye,
  ChevronRight, CircleDot, Hexagon, Car, MapPin, Wrench, SkipForward,
  AlertTriangle
} from "lucide-react";

const SQRT3 = Math.sqrt(3);
const HEX = 10;
const ROUNDS = 10;
const ROWS = 15;
const TURN_ORDER = [0, 1, 2, 3];
const STORM_MAX_CONSECUTIVE = 3;

// Car upgrade structures (placeholder names/effects)
const CAR_PARTS = [
  { name: "引擎", desc: "暴雨区移动消耗降低", icon: "⚙" },
  { name: "车身", desc: "突袭判定+20", icon: "△" },
  { name: "轮胎", desc: "行动点+1", icon: "◎" },
  { name: "油箱", desc: "物资上限+3", icon: "▣" },
];

const C = {
  bg: "#100d09", frame: "#1a1610", frameLt: "#201c14",
  border: "#2e2820", gold: "#c4a55a", goldDim: "#7a6838", goldBr: "#e8ca6a",
  txt: "#d8ccb8", txtDim: "#8a7e6a", txtMute: "#5a5040",
  wBase: "#c0b080", wGrass: "#98882a", wGrassS: "#807020", wObs: "#606068",
  sBase: "#387838", sBaseS: "#286828",
  sWarn: "#b89020", sRed: "#801810", sGlow: "#e83020",
  skG: "#1a7828", skB: "#1a4898", skR: "#b82820", skY: "#b8980a",
  tunnel: "#484898", car: "#b83028", reach: "#c4a55a",
};
const REACH_COLORS = ["#ff8830", "#30c8ff", "#60ff40", "#ff50d0"]; // per-player highlight
const PN = ["神秘学家α", "人类α", "神秘学家β", "人类β"];
const PF = [["#d8c8b0","#1a1610"],["#d8c8b0","#1a1610"],["#1a1610","#a09880"],["#1a1610","#a09880"]];
const BISHOP_D = "M0-6.5L-1.8-3.2L-1.2-.5L-2.8 3.5L-2 5L2 5L2.8 3.5L1.2-.5L1.8-3.2Z";
const BISHOP_CROSS = "M-1.2-5.2L1.2-5.2M0-7.2L0-4";
const PAWN_HEAD = { cx: 0, cy: -3.5, r: 2.2 };
const PAWN_BODY = "M-1.3-1.3L-2.5 5L2.5 5L1.3-1.3Z";

// ─── Hex math ────────────────────────────────────────────
function cellPx(col, row) {
  const px = col * SQRT3 * HEX + (row % 2 === 1 ? SQRT3/2 * HEX : 0);
  const py = row * 1.5 * HEX;
  return { x: py, y: -px };
}
function hexPts(cx, cy) {
  let s = "";
  for (let i = 0; i < 6; i++) { const a = Math.PI/3*i - Math.PI/6 - Math.PI/2; s += `${cx+HEX*Math.cos(a)},${cy+HEX*Math.sin(a)} `; }
  return s.trim();
}
function toCube(col, row) { const q = col - Math.floor(row/2); return { q, r: row, s: -q-row }; }
function cubeDist(a, b) { return Math.max(Math.abs(a.q-b.q), Math.abs(a.r-b.r), Math.abs(a.s-b.s)); }
const NB_EVEN = [[1,0],[-1,0],[0,-1],[-1,-1],[0,1],[-1,1]];
const NB_ODD  = [[1,0],[-1,0],[1,-1],[0,-1],[1,1],[0,1]];

// ─── Movement BFS ────────────────────────────────────────
// Strict: must use EXACTLY all AP. Fallback only when completely stuck.
function getReachable(cells, sCol, sRow, ap, round, side, engineLv) {
  const m = {}; cells.forEach(c => { m[`${c.col},${c.row}`] = c; });
  const visited = new Set();
  const queue = [{ col: sCol, row: sRow, rem: ap }];
  visited.add(`${sCol},${sRow},${ap}`);
  const exact = new Set();
  const allReachable = new Map(); // key → min remaining AP

  while (queue.length > 0) {
    const { col, row, rem } = queue.shift();
    const k = `${col},${row}`;
    if (rem === 0) { exact.add(k); }
    if (!allReachable.has(k) || rem < allReachable.get(k)) allReachable.set(k, rem);
    if (rem === 0) continue;
    const dirs = row % 2 === 0 ? NB_EVEN : NB_ODD;
    for (const [dc, dr] of dirs) {
      const nc = col+dc, nr = row+dr, nk = `${nc},${nr}`;
      const nb = m[nk];
      if (!nb || nb.terrain === "obstacle") continue;
      const cur = m[k];
      const curSt = side === "wild" && cur && round >= cur.stormRound;
      const nbSt = side === "wild" && round >= nb.stormRound;
      let cost = (curSt || nbSt) ? 2 : 1;
      // Engine upgrade: reduce storm cost
      if (cost === 2 && engineLv > 0) cost = Math.max(1, 2 - engineLv);
      const newRem = rem - cost;
      if (newRem < 0) continue;
      const state = `${nc},${nr},${newRem}`;
      if (visited.has(state)) continue;
      visited.add(state);
      queue.push({ col: nc, row: nr, rem: newRem });
    }
  }
  if (exact.size > 0) return exact;
  // Fallback: find cells with minimum remaining AP (closest to exact)
  let minRem = Infinity;
  allReachable.forEach((rem, k) => { if (k !== `${sCol},${sRow}` && rem < minRem) minRem = rem; });
  const fallback = new Set();
  if (minRem < Infinity) allReachable.forEach((rem, k) => { if (rem === minRem && k !== `${sCol},${sRow}`) fallback.add(k); });
  return fallback;
}

// ─── Board gen ───────────────────────────────────────────
function genSide(side) {
  const cells = []; let id = 0;
  for (let row = 0; row < ROWS; row++) { const cols = row%2===0?10:9; for (let col = 0; col < cols; col++) cells.push({ id: `${side}-${id++}`, col, row, side, sticker: null, terrain: null }); }
  return cells;
}
function assignStorm(cells, cCol, cRow) {
  const cc = toCube(cCol, cRow);
  cells.forEach(c => { c.dist = cubeDist(toCube(c.col, c.row), cc); });
  const maxDist = Math.max(...cells.map(c => c.dist));
  // Symmetric: all cells at same distance → same round. Farthest first.
  cells.forEach(c => {
    if (maxDist === 0) { c.stormRound = ROUNDS; return; }
    c.stormRound = Math.max(1, Math.min(ROUNDS, Math.round((maxDist - c.dist) / maxDist * (ROUNDS - 1)) + 1));
  });
}
function setup(cells, isW) {
  const R = () => Math.random();
  const cen = cells.find(c => c.col===4 && c.row===7);
  if (cen) cen.terrain = isW ? "tunnel" : "car";
  assignStorm(cells, 4, 7);
  const free = () => cells.filter(c => !c.terrain && !c.sticker && c.stormRound>1 && c.stormRound<ROUNDS);
  const pick = (a,n) => [...a].sort(()=>R()-0.5).slice(0,n);
  pick(free(), 5+Math.floor(R()*3)).forEach(c => { c.terrain="obstacle"; });
  if (isW) {
    pick(free().filter(c=>c.stormRound>=3&&c.stormRound<=8), 4).forEach(seed => {
      seed.terrain="grass";
      (seed.row%2===0?NB_EVEN:NB_ODD).sort(()=>R()-0.5).slice(0,2+Math.floor(R()*3)).forEach(([dc,dr]) => {
        const nb=cells.find(v=>v.col===seed.col+dc&&v.row===seed.row+dr&&!v.terrain);
        if(nb) nb.terrain="grass";
      });
    });
  }
  const pool = isW
    ? [...Array(3).fill("yellow"),...Array(15).fill("red"),...Array(12).fill("blue"),...Array(28).fill("green")]
    : [...Array(1).fill("yellow"),...Array(3).fill("red"),...Array(3).fill("blue"),...Array(8).fill("green")];
  const slots = cells.filter(c=>!c.terrain&&!c.sticker).sort(()=>R()-0.5);
  pool.forEach((col,i)=>{if(slots[i])slots[i].sticker=col;});
  return cells;
}
function initBoard() { return { wild: setup(genSide("wild"),true), safe: setup(genSide("safe"),false) }; }

// Random valid cell on a side (not obstacle/tunnel/car)
function randomCell(cells) {
  const valid = cells.filter(c => !c.terrain);
  return valid[Math.floor(Math.random()*valid.length)];
}

function initPlayers(wildCells, safeCells) {
  // Spawn: throw from opponent's side → random position on own side
  const w1 = randomCell(wildCells), w2 = randomCell(wildCells);
  const s1 = randomCell(safeCells), s2 = randomCell(safeCells);
  return [
    { id:0, name:PN[0], type:"mystic", side:"wild", col:w1.col, row:w1.row, res:0, combatBonus:0, treasures:0, stormConsec:0, skipNext:false },
    { id:1, name:PN[1], type:"human", side:"safe", col:s1.col, row:s1.row, res:0, repeatMap:{}, treasures:0, stormConsec:0, skipNext:false },
    { id:2, name:PN[2], type:"mystic", side:"wild", col:w2.col, row:w2.row, res:0, combatBonus:0, treasures:0, stormConsec:0, skipNext:false },
    { id:3, name:PN[3], type:"human", side:"safe", col:s2.col, row:s2.row, res:0, repeatMap:{}, treasures:0, stormConsec:0, skipNext:false },
  ];
}

// ─── SVG pieces ──────────────────────────────────────────
function Piece({x,y,pid}) {
  const [fill,stroke]=PF[pid]; const isM=pid===0||pid===2;
  return (<g transform={`translate(${x},${y}) scale(0.85)`}>{isM?(<><path d={BISHOP_D} fill={fill} stroke={stroke} strokeWidth={0.7} strokeLinejoin="round"/><path d={BISHOP_CROSS} fill="none" stroke={stroke} strokeWidth={0.9} strokeLinecap="round"/></>):(<><circle {...PAWN_HEAD} fill={fill} stroke={stroke} strokeWidth={0.7}/><path d={PAWN_BODY} fill={fill} stroke={stroke} strokeWidth={0.7} strokeLinejoin="round"/></>)}</g>);
}
function PieceIcon({pid,size=14}) {
  const [fill,stroke]=PF[pid]; const isM=pid===0||pid===2;
  return (<svg width={size} height={size} viewBox="-4 -8.5 8 15" style={{display:"block",flexShrink:0}}>{isM?(<><path d={BISHOP_D} fill={fill} stroke={stroke} strokeWidth={0.7} strokeLinejoin="round"/><path d={BISHOP_CROSS} fill="none" stroke={stroke} strokeWidth={0.9} strokeLinecap="round"/></>):(<><circle {...PAWN_HEAD} fill={fill} stroke={stroke} strokeWidth={0.7}/><path d={PAWN_BODY} fill={fill} stroke={stroke} strokeWidth={0.7} strokeLinejoin="round"/></>)}</svg>);
}

// ─── Cell ────────────────────────────────────────────────
function HCell({c,px,py,round,sel,reachable,reachColor,players,onClick}) {
  const isW=c.side==="wild";
  const stormed=isW&&round>=c.stormRound;
  const warn=isW&&round===c.stormRound-1&&c.stormRound>0;
  const isReach=reachable&&reachable.has(`${c.col},${c.row}`);
  const rc = reachColor || C.reach;
  let fill,stroke;
  if(stormed){fill=C.sRed;stroke="#400805";}
  else if(c.terrain==="obstacle"){fill=isW?C.wObs:"#486848";stroke=isW?"#48484e":"#385838";}
  else if(c.terrain==="grass"){fill=C.wGrass;stroke=C.wGrassS;}
  else if(c.terrain==="tunnel"){fill=C.tunnel;stroke="#6868b8";}
  else if(c.terrain==="car"){fill="#584828";stroke=C.car;}
  else{fill=isW?C.wBase:C.sBase;stroke=isW?"#a89868":C.sBaseS;}
  if(warn&&!stormed)stroke=C.sWarn;
  if(isReach&&!stormed)stroke=rc;
  const sk=c.sticker&&!stormed?({green:C.skG,blue:C.skB,red:C.skR,yellow:C.skY}[c.sticker]):null;
  const pts=hexPts(px,py);
  // Tooltip
  const terrain = c.terrain==="obstacle"?"障碍物":c.terrain==="grass"?"荒草":c.terrain==="tunnel"?"密道":c.terrain==="car"?"汽车":null;
  const sticker = c.sticker?({green:"物资格",blue:"事件格",red:"战斗格",yellow:"宝藏格"}[c.sticker]):null;
  const stormInfo = isW?(stormed?"已被暴雨覆盖":warn?`下回合被暴雨覆盖`:`暴雨第${c.stormRound}回合到达`):"";
  const tipParts = [`[${c.col},${c.row}]`];
  if(terrain) tipParts.push(terrain);
  if(sticker&&!stormed) tipParts.push(sticker);
  if(c.terrain==="grass"&&c.sticker&&!stormed) tipParts.push("(隐藏)");
  if(stormInfo) tipParts.push(stormInfo);
  if(isReach) tipParts.push(c.terrain==="tunnel"?"可到达 (传送至另一侧！)":"可到达");
  const tip = tipParts.join(" · ");
  const isTunnelReach = isReach && c.terrain==="tunnel";
  return (
    <g onClick={()=>onClick(c)} style={{cursor:isReach?"pointer":"default"}} opacity={stormed?0.6:1}>
      <title>{tip}</title>
      {stormed&&<polygon points={pts} fill={C.sGlow} opacity={0.06} filter="url(#gl)"/>}
      <polygon points={pts} fill={fill} stroke={sel?C.goldBr:isTunnelReach?"#a060e0":stroke} strokeWidth={sel?1.2:isReach?1.2:0.5}/>
      {isReach&&!stormed&&!isTunnelReach&&<polygon points={pts} fill={rc} opacity={0.2}/>}
      {isTunnelReach&&<polygon points={pts} fill="#a060e0" opacity={0.25}><animate attributeName="opacity" values="0.1;0.35;0.1" dur="1.2s" repeatCount="indefinite"/></polygon>}
      {isTunnelReach&&<polygon points={pts} fill="none" stroke="#c080ff" strokeWidth={1.5}><animate attributeName="stroke-opacity" values="0.3;1;0.3" dur="1.2s" repeatCount="indefinite"/></polygon>}
      {warn&&!stormed&&!isReach&&<polygon points={pts} fill={C.sWarn} opacity={0.1}/>}
      {sk&&c.terrain!=="grass"&&<circle cx={px} cy={py} r={2.5} fill={sk} opacity={0.88}/>}
      {sk&&c.terrain==="grass"&&<text x={px} y={py+1.8} textAnchor="middle" fontSize="4.5" fill="#686838">?</text>}
      {c.terrain==="tunnel"&&<text x={px} y={py+2} textAnchor="middle" fontSize="5.5" fill="#b0b0e0">◇</text>}
      {c.terrain==="car"&&<text x={px} y={py+2} textAnchor="middle" fontSize="5" fill="#d08878">▣</text>}
      {players?.map((p,i)=>(<Piece key={p.id} x={px+(i-(players.length-1)/2)*6} y={py} pid={p.id}/>))}
    </g>
  );
}

function Slot({label,Icon,big}) {
  const w=big?52:38, h=big?64:50, fs=big?11:8, is=big?18:14;
  return (<div style={{width:w,height:h,border:`1px solid ${C.border}`,borderRadius:2,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:`linear-gradient(180deg,${C.frameLt}e0,${C.frame}e0)`,gap:2}}><Icon size={is} color={C.goldDim} strokeWidth={1.5}/><span style={{fontSize:fs,color:C.txtDim,letterSpacing:0.5}}>{label}</span></div>);
}

function BoardView({cells,round,sel,reachable,players,onClick,label,sub,isWild}) {
  const coords=useMemo(()=>cells.map(c=>({...c,...cellPx(c.col,c.row)})),[cells]);
  const bounds=useMemo(()=>{let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;coords.forEach(({x,y})=>{x0=Math.min(x0,x-HEX);x1=Math.max(x1,x+HEX);y0=Math.min(y0,y-HEX);y1=Math.max(y1,y+HEX);});return{x:x0-3,y:y0-3,w:x1-x0+6,h:y1-y0+6};},[coords]);
  const pMap=useMemo(()=>{const m={};(players||[]).forEach(p=>{const k=`${p.col},${p.row}`;(m[k]=m[k]||[]).push(p);});return m;},[players]);
  return (
    <div style={{background:C.frame,border:`1px solid ${C.border}`,borderRadius:3,padding:"3px 2px",position:"relative"}}>
      <div style={{display:"flex",alignItems:"center",gap:4,position:"absolute",top:2,left:6}}>
        {isWild?<CloudRain size={9} color={C.goldDim} strokeWidth={1.5}/>:<Car size={9} color={C.goldDim} strokeWidth={1.5}/>}
        <span style={{fontSize:8,color:C.goldDim,letterSpacing:1}}>{label}</span>
      </div>
      {sub&&<div style={{position:"absolute",top:2,right:6,fontSize:7,color:C.txtMute}}>{sub}</div>}
      <svg viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`} style={{width:"100%",height:140}}>
        <defs><filter id="gl"><feGaussianBlur stdDeviation="2"/></filter></defs>
        {coords.map(c=>(<HCell key={c.id} c={c} px={c.x} py={c.y} round={round} sel={sel?.id===c.id} reachable={reachable} players={pMap[`${c.col},${c.row}`]} onClick={onClick}/>))}
      </svg>
    </div>
  );
}

// Flexible-height board for desktop layout (fills container)
function BoardSVG({cells,round,sel,reachable,reachColor,players,onClick}) {
  const coords=useMemo(()=>cells.map(c=>({...c,...cellPx(c.col,c.row)})),[cells]);
  const bounds=useMemo(()=>{let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;coords.forEach(({x,y})=>{x0=Math.min(x0,x-HEX);x1=Math.max(x1,x+HEX);y0=Math.min(y0,y-HEX);y1=Math.max(y1,y+HEX);});return{x:x0-3,y:y0-3,w:x1-x0+6,h:y1-y0+6};},[coords]);
  const pMap=useMemo(()=>{const m={};(players||[]).forEach(p=>{const k=`${p.col},${p.row}`;(m[k]=m[k]||[]).push(p);});return m;},[players]);
  return (
    <svg viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`} preserveAspectRatio="xMidYMid meet" style={{width:"100%",height:"100%"}}>
      <defs><filter id="gl"><feGaussianBlur stdDeviation="2"/></filter></defs>
      {coords.map(c=>(<HCell key={c.id} c={c} px={c.x} py={c.y} round={round} sel={sel?.id===c.id} reachable={reachable} reachColor={reachColor} players={pMap[`${c.col},${c.row}`]} onClick={onClick}/>))}
    </svg>
  );
}

function Btn({children,active,onClick,disabled,icon:Icon,small,warn}) {
  return (<button disabled={disabled} onClick={onClick} style={{background:active?C.gold:warn?"#4a2a1a":C.frame,color:active?C.bg:disabled?C.txtMute:warn?"#e88060":C.txt,border:`1px solid ${active?C.gold:warn?"#8a3a1a":C.border}`,borderRadius:2,padding:small?"3px 6px":"4px 10px",fontSize:small?9:10,cursor:disabled?"default":"pointer",fontFamily:"'Noto Serif SC',serif",display:"flex",alignItems:"center",gap:4,opacity:disabled?0.4:1,transition:"all 0.15s"}}>{Icon&&<Icon size={small?9:11} strokeWidth={1.5}/>}{children}</button>);
}

// ─── Sticker resolution ──────────────────────────────────
function resolveSticker(sticker, player) {
  switch(sticker) {
    case "green": { const ok=Math.random()>=0.4; return { msg: ok?"判定成功，+1物资":"判定失败", dr: ok?1:0 }; }
    case "blue": {
      const ok=Math.random()>=0.4;
      return ok ? { msg: "事件：发现补给，+1物资", dr:1 } : { msg: "事件：遭遇陷阱，-1物资", dr:-1 };
    }
    case "red": {
      let wins=0,losses=0;
      const details=[];
      for(let i=0;i<3&&wins<2&&losses<2;i++){
        let pRoll=Math.floor(Math.random()*100); if(pRoll===0)pRoll=100;
        let eRoll=Math.floor(Math.random()*100); if(eRoll===0)eRoll=100;
        const pVal=pRoll+(player.combatBonus||0);
        if(pRoll===100){wins=2;details.push(`[00→大成功]`);break;}
        else if(pRoll===1){losses=2;details.push(`[01→大失败]`);break;}
        else if(pVal>eRoll){wins++;details.push(`${pRoll}v${eRoll}胜`);}
        else{losses++;details.push(`${pRoll}v${eRoll}负`);}
      }
      const won=wins>=2;
      const oddRoll=Math.floor(Math.random()*10)+1;
      const dr=won?(oddRoll%2===1?1:2):(oddRoll%2===1?0:-1);
      return { msg: `${details.join(" ")} → ${won?"胜利":"失败"}${dr>0?`+${dr}`:dr<0?`${dr}`:""}物资`, dr, combatWin: won };
    }
    case "yellow": return { msg: "发现宝藏！", dr: 0, treasure: true };
    default: return { msg: "空地", dr: 0 };
  }
}

// ─── Car upgrade panel ───────────────────────────────────
function CarPanel({ carLevels, onUpgrade, playerRes, disabled }) {
  return (
    <div style={{display:"flex",gap:3,padding:"4px 0"}}>
      {CAR_PARTS.map((part, i) => {
        const lv = carLevels[i] || 0;
        const canUp = playerRes >= 1 && !disabled;
        return (
          <div key={i} style={{flex:1,background:C.frameLt,border:`1px solid ${C.border}`,borderRadius:2,padding:4,textAlign:"center"}}>
            <div style={{fontSize:10}}>{part.icon}</div>
            <div style={{fontSize:8,color:C.gold}}>{part.name}</div>
            <div style={{fontSize:7,color:C.txtMute}}>Lv.{lv}</div>
            <button onClick={()=>canUp&&onUpgrade(i)} disabled={!canUp} style={{
              marginTop:2,fontSize:7,padding:"1px 4px",background:canUp?C.gold:"transparent",
              color:canUp?C.bg:C.txtMute,border:`1px solid ${canUp?C.gold:C.border}`,
              borderRadius:1,cursor:canUp?"pointer":"default",opacity:canUp?1:0.4,
            }}>升级</button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────
export default function App() {
  const [board, setBoard] = useState(initBoard);
  const [players, setPlayers] = useState(()=>initPlayers(initBoard().wild, initBoard().safe));
  const [round, setRound] = useState(0);
  const [turnIdx, setTurnIdx] = useState(0);
  const [phase, setPhase] = useState("roll"); // roll | move | resolve | upgrade | skip
  const [dice, setDice] = useState(null);
  const [reachable, setReachable] = useState(null);
  const [sel, setSel] = useState(null);
  const [log, setLog] = useState(["暴雨即将来临。实验开始——"]);
  const [carLevels, setCarLevels] = useState([0,0,0,0]);
  const [gameOver, setGameOver] = useState(false);
  const [mobTab, setMobTab] = useState("wild"); // mobile board tab
  const [isMob, setIsMob] = useState(typeof window!=="undefined"&&window.innerWidth<768);

  useEffect(()=>{
    const h=()=>setIsMob(window.innerWidth<768);
    window.addEventListener("resize",h); return ()=>window.removeEventListener("resize",h);
  },[]);

  // Stable init
  useEffect(() => {
    const b = initBoard();
    setBoard(b);
    setPlayers(initPlayers(b.wild, b.safe));
  }, []);

  const curPid = TURN_ORDER[turnIdx];
  const curPlayer = players[curPid];
  const curCells = curPlayer ? (curPlayer.side === "wild" ? board.wild : board.safe) : [];

  const addLog = useCallback((m)=>setLog(p=>[m,...p].slice(0,60)),[]);

  // Check if current player is on car cell
  const isOnCar = curPlayer && curPlayer.side === "safe" && curPlayer.col === 4 && curPlayer.row === 7;

  // Check storm consecutive
  const isInStorm = useCallback((p) => {
    if (p.side !== "wild") return false;
    const cell = board.wild.find(c => c.col === p.col && c.row === p.row);
    return cell && round >= cell.stormRound;
  }, [board.wild, round]);

  const stormBlocked = curPlayer && curPlayer.stormConsec >= STORM_MAX_CONSECUTIVE;

  // ─── Roll dice ─────────────────────────────────────────
  const doRoll = useCallback(() => {
    if (phase !== "roll" || gameOver) return;
    let d = Math.floor(Math.random()*10); if(d===0) d=10;
    // Tire upgrade: +1 AP
    const tireBonus = carLevels[2] || 0;
    const totalAP = d + tireBonus;
    setDice(d);
    const engineLv = carLevels[0] || 0;
    const reach = getReachable(curCells, curPlayer.col, curPlayer.row, totalAP, round, curPlayer.side, engineLv);
    setReachable(reach);
    setPhase("move");
    addLog(`${curPlayer.name} 掷骰 → ${d}${tireBonus>0?`+${tireBonus}轮胎=`+totalAP:""}`);
  }, [phase, gameOver, curCells, curPlayer, round, carLevels, addLog]);

  // ─── Start upgrade (skip roll) ─────────────────────────
  const startUpgrade = useCallback(() => {
    if (phase !== "roll" || !isOnCar || curPlayer.res < 1) return;
    setPhase("upgrade");
    addLog(`${curPlayer.name} 放弃行动，尝试升级汽车……`);
  }, [phase, isOnCar, curPlayer, addLog]);

  const doUpgrade = useCallback((partIdx) => {
    const roll = Math.floor(Math.random()*100);
    const ok = roll >= 30; // 70% success (placeholder)
    if (ok) {
      setCarLevels(prev => { const n=[...prev]; n[partIdx]++; return n; });
      setPlayers(prev => { const n=[...prev]; n[curPid]={...n[curPid],res:n[curPid].res-1}; return n; });
      addLog(`升级成功！${CAR_PARTS[partIdx].name} → Lv.${(carLevels[partIdx]||0)+1}`);
    } else {
      addLog(`升级失败。物资未消耗。`);
    }
    setPhase("resolve");
  }, [curPid, carLevels, addLog]);

  // ─── Click cell ────────────────────────────────────────
  const handleCellClick = useCallback((cell) => {
    if (phase === "move" && reachable && reachable.has(`${cell.col},${cell.row}`) && cell.side === curPlayer.side) {
      setPlayers(prev => { const n=[...prev]; n[curPid]={...n[curPid],col:cell.col,row:cell.row}; return n; });
      setReachable(null);
      addLog(`${curPlayer.name} 移动至 [${cell.col},${cell.row}]`);

      // Tunnel
      if (cell.terrain === "tunnel") {
        const other = curPlayer.side === "wild" ? "safe" : "wild";
        setPlayers(prev => { const n=[...prev]; n[curPid]={...n[curPid],side:other,col:4,row:7}; return n; });
        addLog(`${curPlayer.name} 通过密道传送至${other==="wild"?"荒野":"抛锚地"}！`);
        setPhase("resolve"); return;
      }

      // Sticker
      const hasSk = cell.sticker && (cell.terrain !== "grass");
      const hiddenSk = cell.sticker && cell.terrain === "grass";
      if (hasSk || hiddenSk) {
        if (hiddenSk) addLog(`${curPlayer.name} 踩入荒草——发现隐藏格！`);
        const result = resolveSticker(cell.sticker, curPlayer);
        const skName = ({green:"物资格",blue:"事件格",red:"战斗格",yellow:"宝藏格"})[cell.sticker];
        addLog(`${curPlayer.name} → ${skName} → ${result.msg}`);
        setPlayers(prev => {
          const n=[...prev]; const p={...n[curPid]};
          p.res = Math.max(0, p.res + result.dr);
          if (result.combatWin && p.type === "mystic") p.combatBonus = (p.combatBonus||0) + 10;
          if (result.treasure) p.treasures = (p.treasures||0) + 1;
          n[curPid]=p; return n;
        });
        setBoard(prev => {
          const cells=[...prev[cell.side]];
          const idx=cells.findIndex(c=>c.col===cell.col&&c.row===cell.row);
          if(idx>=0) cells[idx]={...cells[idx],sticker:null,...(hiddenSk?{terrain:null}:{})};
          return{...prev,[cell.side]:cells};
        });
      }
      setPhase("resolve");
    } else {
      setSel(cell);
    }
  }, [phase, reachable, curPlayer, curPid, addLog]);

  // ─── Next turn ─────────────────────────────────────────
  const nextTurn = useCallback(() => {
    if (phase !== "resolve" && phase !== "skip") return;

    // Update storm consecutive for current player
    setPlayers(prev => {
      const n = [...prev];
      const p = {...n[curPid]};
      if (isInStorm(p)) { p.stormConsec = (p.stormConsec||0) + 1; }
      else { p.stormConsec = 0; }
      n[curPid] = p;
      return n;
    });

    setDice(null); setReachable(null); setSel(null);
    const nextIdx = turnIdx + 1;

    if (nextIdx >= TURN_ORDER.length) {
      // End of round → advance
      const nr = round + 1;
      if (nr > ROUNDS) { setGameOver(true); addLog("游戏结束——"); return; }
      setRound(nr); setTurnIdx(0);
      const eaten = board.wild.filter(c => c.stormRound === nr).length;
      const left = board.wild.filter(c => c.stormRound > nr && c.terrain !== "obstacle").length;
      addLog(`── 第${nr}回合 ── ${eaten}格暴雨吞没，剩余${left}格`);

      // Raids
      if ([3,6,9].includes(nr)) {
        const diff = nr===3?0:nr===6?10:20;
        const bodyBonus = (carLevels[1]||0) * 20; // Body upgrade: +20 per level
        addLog(`突袭！难度${diff}${bodyBonus>0?` (车身+${bodyBonus})`:""}`);
        setPlayers(prev => {
          const n = prev.map(p => {
            if (p.side !== "safe") return p;
            const roll = Math.floor(Math.random()*100);
            const ok = roll >= (diff - bodyBonus);
            if (ok) { addLog(`${p.name} 抵御成功 +1物资`); return {...p,res:p.res+1}; }
            else {
              if (p.res <= 0) {
                addLog(`${p.name} 抵御失败，无物资 → 下回合跳过行动`);
                return {...p,skipNext:true};
              }
              addLog(`${p.name} 抵御失败 -1物资`);
              return {...p,res:Math.max(0,p.res-1)};
            }
          });
          return n;
        });
      }
      if (nr >= ROUNDS) addLog("暴雨覆盖全域。BOSS战——");

      // Check if next player should skip
      setTimeout(() => {
        setPlayers(prev => {
          const nextP = prev[TURN_ORDER[0]];
          if (nextP?.skipNext) { /* handled in phase check */ }
          return prev;
        });
      }, 0);
      setPhase("roll");
    } else {
      setTurnIdx(nextIdx);
      // Check if next player should skip
      const nextPid = TURN_ORDER[nextIdx];
      if (players[nextPid]?.skipNext) {
        setPhase("skip");
      } else {
        setPhase("roll");
      }
    }
  }, [phase, turnIdx, round, board.wild, curPid, isInStorm, carLevels, players, addLog]);

  // Handle skip
  const doSkip = useCallback(() => {
    addLog(`${curPlayer.name} 因突袭负伤，本回合跳过行动`);
    setPlayers(prev => { const n=[...prev]; n[curPid]={...n[curPid],skipNext:false}; return n; });
    setPhase("resolve");
  }, [curPlayer, curPid, addLog]);

  // If entering a turn where player should skip, auto-trigger
  useEffect(() => {
    if (phase === "roll" && curPlayer?.skipNext) setPhase("skip");
  }, [phase, curPlayer]);

  // Storm block: if player has been in storm 3+ turns, force them to move out
  useEffect(() => {
    if (phase === "roll" && stormBlocked) {
      addLog(`${curPlayer.name} 已在暴雨中连续${STORM_MAX_CONSECUTIVE}回合，必须撤离！`);
    }
  }, [phase, stormBlocked, curPlayer, addLog]);

  const reset = useCallback(() => {
    const b = initBoard();
    setBoard(b); setPlayers(initPlayers(b.wild, b.safe));
    setRound(0); setTurnIdx(0); setDice(null); setReachable(null); setSel(null);
    setPhase("roll"); setCarLevels([0,0,0,0]); setGameOver(false);
    setLog(["棋盘重置。新的实验——"]);
  }, []);

  if (!curPlayer) return null;
  const pct = round/ROUNDS*100;
  const totalTr = players.reduce((s,p)=>s+(p.treasures||0),0);
  const info = sel ? (()=>{ const t=sel.terrain==="obstacle"?"障碍物":sel.terrain==="grass"?"荒草":sel.terrain==="tunnel"?"密道":sel.terrain==="car"?"汽车":sel.sticker==="green"?"物资格":sel.sticker==="blue"?"事件格":sel.sticker==="red"?"战斗格":sel.sticker==="yellow"?"宝藏格":"空地"; const st=sel.side==="wild"?(round>=sel.stormRound?"已覆盖":`第${sel.stormRound}回合`):"—"; return{t,st,dist:sel.dist}; })() : null;

  const phaseLabel = phase==="roll"?"掷骰":phase==="move"?"移动":phase==="upgrade"?"升级":phase==="skip"?"跳过":"结算";

  // ─── Shared UI blocks ─────────────────────────────────
  const statusBar = (
    <div style={{padding:"5px 8px",background:C.frame,border:`1px solid ${C.border}`,borderRadius:2}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:10,marginBottom:3}}>
        <div style={{display:"flex",alignItems:"center",gap:3}}>
          <CloudRain size={11} color={C.gold} strokeWidth={1.5}/>
          <span style={{color:C.gold,fontSize:15,fontWeight:700}}>{round}</span><span style={{color:C.txtDim,fontSize:9}}>/{ROUNDS}</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <PieceIcon pid={curPid} size={12}/><span style={{color:C.gold,fontSize:10}}>{curPlayer.name}</span>
          {curPlayer.skipNext&&<AlertTriangle size={9} color="#e88060" strokeWidth={2}/>}
          {stormBlocked&&<CloudRain size={9} color="#e88060" strokeWidth={2}/>}
          <span style={{fontSize:9,color:C.txtDim,padding:"1px 5px",border:`1px solid ${C.border}`,borderRadius:2}}>{phaseLabel}</span>
        </div>
      </div>
      <div style={{width:"100%",height:3,background:"#1a1508",borderRadius:2,overflow:"hidden"}}>
        <div style={{width:`${pct}%`,height:"100%",background:`linear-gradient(90deg,${C.sWarn},${C.sRed})`,borderRadius:2,transition:"width 0.5s"}}/>
      </div>
    </div>
  );

  const actionBtns = (
    <div style={{display:"flex",gap:3,flexWrap:"wrap",alignItems:"center"}}>
      {phase==="skip"&&<Btn onClick={doSkip} icon={SkipForward} warn>跳过</Btn>}
      {phase==="roll"&&!curPlayer.skipNext&&(
        <><Btn onClick={doRoll} icon={Dices} active disabled={gameOver}>掷骰</Btn>
        {isOnCar&&curPlayer.res>=1&&<Btn onClick={startUpgrade} icon={Wrench} small>升级</Btn>}</>
      )}
      {phase==="move"&&dice&&<Btn disabled icon={MapPin}>AP:{dice+(carLevels[2]||0)}</Btn>}
      {phase==="resolve"&&<Btn onClick={nextTurn} icon={ChevronRight} active>{turnIdx>=TURN_ORDER.length-1?"缩圈":"下一位"}</Btn>}
      {dice!=null&&<span style={{fontSize:12,color:C.gold,fontWeight:700}}>d10:{dice}</span>}
      <div style={{flex:1}}/>
      <Btn onClick={reset} icon={RotateCcw} small>重置</Btn>
    </div>
  );

  const upgradePanel = phase==="upgrade" ? (
    <div style={{padding:"5px 8px",background:C.frameLt,border:`1px solid ${C.gold}40`,borderRadius:2}}>
      <div style={{fontSize:9,color:C.gold,marginBottom:2,display:"flex",alignItems:"center",gap:4}}><Wrench size={10} strokeWidth={1.5}/>升级 · 消耗1物资</div>
      <CarPanel carLevels={carLevels} onUpgrade={doUpgrade} playerRes={curPlayer.res} disabled={false}/>
    </div>
  ) : null;

  const playersPanel = (
    <div style={{background:C.frame,border:`1px solid ${C.border}`,borderRadius:2,padding:5}}>
      <div style={{fontSize:8,color:C.txtMute,marginBottom:3}}>PLAYERS · 宝藏 {totalTr}/4</div>
      {players.map((p,i)=>(
        <div key={p.id} style={{display:"flex",alignItems:"center",gap:3,fontSize:9,padding:"2px 0",borderLeft:curPid===i?`2px solid ${C.gold}`:"2px solid transparent",paddingLeft:3,opacity:curPid===i?1:0.5}}>
          <PieceIcon pid={i} size={13}/><span style={{flex:1}}>{p.name}</span>
          {p.skipNext&&<AlertTriangle size={8} color="#e88060"/>}
          {p.stormConsec>=2&&<CloudRain size={8} color="#e88060"/>}
          <span style={{color:C.txtDim,fontSize:7}}>{p.side==="wild"?"雨前荒野":"抛锚地"} · {p.res}物资{p.treasures?` · ${p.treasures}宝藏`:""}{p.combatBonus?` · 战斗+${p.combatBonus}`:""}</span>
        </div>
      ))}
    </div>
  );

  const carBar = (
    <div style={{padding:"4px 8px",background:C.frame,border:`1px solid ${C.border}`,borderRadius:2,fontSize:8,display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
      <Car size={9} color={C.goldDim} strokeWidth={1.5}/><span style={{color:C.txtDim}}>汽车</span>
      {CAR_PARTS.map((p,i)=>(<span key={i} style={{color:carLevels[i]>0?C.gold:C.txtMute}}>{p.icon}{p.name}{carLevels[i]}</span>))}
    </div>
  );

  const cellInfoBar = info ? (
    <div style={{padding:"4px 8px",background:C.frame,border:`1px solid ${C.border}`,borderRadius:2,fontSize:9,color:C.txtDim,display:"flex",alignItems:"center",gap:4}}>
      <CircleDot size={9} color={C.goldDim} strokeWidth={1.5}/>[{sel.col},{sel.row}] <span style={{color:C.gold}}>{info.t}</span> <span>暴雨:{info.st}</span>
    </div>
  ) : null;

  const logPanel = (
    <div style={{background:C.frame,border:`1px solid ${C.border}`,borderRadius:2,padding:5,maxHeight:isMob?100:undefined,flex:isMob?undefined:"1 1 80px",minHeight:isMob?undefined:60,overflow:"auto"}}>
      <div style={{fontSize:8,color:C.txtMute,marginBottom:2}}>LOG</div>
      {log.map((e,i)=><div key={i} style={{fontSize:8,color:i===0?C.txt:C.txtMute,padding:"1px 0"}}>{e}</div>)}
    </div>
  );

  const legendBar = (
    <div style={{background:C.frame,border:`1px solid ${C.border}`,borderRadius:2,padding:5,display:"flex",gap:6,flexWrap:"wrap"}}>
      {[[C.skG,"物资"],[C.skB,"事件"],[C.skR,"战斗"],[C.skY,"宝藏"],[C.wObs,"障碍"],[C.wGrass,"荒草"],[C.tunnel,"密道"]].map(([c,l])=>(
        <div key={l} style={{display:"flex",alignItems:"center",gap:2,fontSize:8}}><div style={{width:5,height:5,borderRadius:1,background:c}}/><span style={{color:C.txtDim}}>{l}</span></div>
      ))}
    </div>
  );

  const boardBlock = (side, label, icon, cards) => {
    const isW = side === "wild";
    const cells = isW ? board.wild : board.safe;
    return (
      <div style={{background:C.frame,border:`1px solid ${C.border}`,borderRadius:3,padding:isMob?"3px 4px":"10px 14px",display:"flex",flexDirection:"column",position:"relative",...(isMob?{height:220}:{flex:1,minHeight:0})}}>
        <div style={{display:"flex",alignItems:"center",gap:4,padding:"2px 4px",marginBottom:isMob?0:4}}>
          {icon}<span style={{fontSize:isMob?9:16,color:C.goldDim,letterSpacing:1}}>{label}</span>
        </div>
        <div style={{flex:1,minHeight:0,margin:isMob?"0":"0 62px"}}>
          <BoardSVG cells={cells} round={round} sel={sel} reachable={curPlayer.side===side?reachable:null} reachColor={REACH_COLORS[curPid]} players={players.filter(p=>p.side===side)} onClick={handleCellClick}/>
        </div>
        {!isMob && cards && <>
          <div style={{position:"absolute",top:45,left:8}}>{cards[0]}</div>
          <div style={{position:"absolute",bottom:8,left:8}}>{cards[1]}</div>
          <div style={{position:"absolute",top:45,right:8}}>{cards[2]}</div>
          <div style={{position:"absolute",bottom:8,right:8}}>{cards[3]}</div>
        </>}
      </div>
    );
  };

  // ─── MOBILE LAYOUT ─────────────────────────────────────
  if (isMob) return (
    <div style={{background:C.bg,color:C.txt,minHeight:"100vh",fontFamily:"'Noto Serif SC',STSong,SimSun,serif",padding:6,boxSizing:"border-box"}}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@300;400;700&display=swap" rel="stylesheet"/>
      <div style={{textAlign:"center",marginBottom:3}}>
        <div style={{fontSize:7,color:C.txtMute,letterSpacing:3}}>REVERSE : 1999</div>
        <div style={{fontSize:14,color:C.gold,fontWeight:300,letterSpacing:2}}>雨前荒野一隅</div>
      </div>
      {statusBar}
      <div style={{margin:"4px 0"}}>{actionBtns}</div>
      {upgradePanel && <div style={{marginBottom:4}}>{upgradePanel}</div>}
      {boardBlock("wild","雨前荒野",<CloudRain size={10} color={C.goldDim} strokeWidth={1.5}/>)}
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:4,padding:"3px 0",color:C.txtMute,fontSize:8}}>
        <div style={{flex:1,height:1,background:C.border}}/><Hexagon size={8} color={C.goldDim} strokeWidth={1.5}/><span>密道</span><Hexagon size={8} color={C.goldDim} strokeWidth={1.5}/><div style={{flex:1,height:1,background:C.border}}/>
      </div>
      {boardBlock("safe","抛锚地",<Car size={10} color={C.goldDim} strokeWidth={1.5}/>)}
      <div style={{display:"flex",flexDirection:"column",gap:3,marginTop:4}}>
        {cellInfoBar}
        {carBar}
        {playersPanel}
        {legendBar}
        {logPanel}
      </div>
    </div>
  );

  // ─── DESKTOP LAYOUT (3 columns: boards | controls | log) ──
  const wildCards = [
    <Slot label="宝物" Icon={Gem} big/>, <Slot label="物资" Icon={Package} big/>,
    <Slot label="勇气" Icon={Flame} big/>, <Slot label="创造" Icon={Sparkles} big/>,
  ];
  const safeCards = [
    <Slot label="事件" Icon={ScrollText} big/>, <Slot label="敌人" Icon={Skull} big/>,
    <Slot label="逻辑" Icon={Target} big/>, <Slot label="专注" Icon={Eye} big/>,
  ];
  return (
    <div style={{background:C.bg,color:C.txt,height:"100vh",fontFamily:"'Noto Serif SC',STSong,SimSun,serif",padding:10,boxSizing:"border-box",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@300;400;700&display=swap" rel="stylesheet"/>
      <div style={{display:"flex",gap:10,flex:1,minHeight:0}}>

        {/* LEFT: Boards with corner cards */}
        <div style={{flex:"1 1 55%",display:"flex",flexDirection:"column",gap:4,minWidth:0}}>
          {boardBlock("wild","雨前荒野",<CloudRain size={16} color={C.goldDim} strokeWidth={1.5}/>,wildCards)}
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"2px 0",color:C.txtMute,fontSize:14}}>
            <div style={{flex:1,height:1,background:C.border}}/><Hexagon size={12} color={C.goldDim} strokeWidth={1.5}/><span>密道</span><Hexagon size={12} color={C.goldDim} strokeWidth={1.5}/><div style={{flex:1,height:1,background:C.border}}/>
          </div>
          {boardBlock("safe","抛锚地",<Car size={16} color={C.goldDim} strokeWidth={1.5}/>,safeCards)}
        </div>

        {/* MIDDLE: Controls & Info */}
        <div style={{flex:"1 1 300px",display:"flex",flexDirection:"column",gap:6,minHeight:0,overflow:"auto"}}>
          <div style={{textAlign:"center",borderBottom:`1px solid ${C.border}`,paddingBottom:4}}>
            <div style={{fontSize:10,color:C.txtMute,letterSpacing:4}}>REVERSE : 1999</div>
            <div style={{fontSize:20,color:C.gold,fontWeight:300,letterSpacing:3}}>雨前荒野一隅</div>
          </div>

          {/* Status */}
          <div style={{padding:"8px 12px",background:C.frame,border:`1px solid ${C.border}`,borderRadius:3}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <CloudRain size={16} color={C.gold} strokeWidth={1.5}/>
                <span style={{color:C.gold,fontSize:24,fontWeight:700}}>{round}</span><span style={{color:C.txtDim,fontSize:13}}>/ {ROUNDS}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <PieceIcon pid={curPid} size={18}/>
                <span style={{color:C.gold,fontSize:14}}>{curPlayer.name}</span>
                {curPlayer.skipNext&&<AlertTriangle size={13} color="#e88060" strokeWidth={2}/>}
                {stormBlocked&&<CloudRain size={13} color="#e88060" strokeWidth={2}/>}
              </div>
            </div>
            <div style={{width:"100%",height:5,background:"#1a1508",borderRadius:3,overflow:"hidden",marginBottom:5}}>
              <div style={{width:`${pct}%`,height:"100%",background:`linear-gradient(90deg,${C.sWarn},${C.sRed})`,borderRadius:3,transition:"width 0.5s"}}/>
            </div>
            <div style={{fontSize:13,color:C.txtDim,textAlign:"center",padding:"3px 0",border:`1px solid ${C.border}`,borderRadius:3,letterSpacing:2}}>{phaseLabel}</div>
          </div>

          {/* Actions */}
          <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
            {phase==="skip"&&<button onClick={doSkip} style={{background:"#4a2a1a",color:"#e88060",border:"1px solid #8a3a1a",borderRadius:3,padding:"6px 14px",fontSize:13,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:5}}><SkipForward size={14} strokeWidth={1.5}/>跳过行动</button>}
            {phase==="roll"&&!curPlayer.skipNext&&(
              <><button onClick={doRoll} disabled={gameOver} style={{background:C.gold,color:C.bg,border:`1px solid ${C.gold}`,borderRadius:3,padding:"6px 16px",fontSize:13,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:5,fontWeight:700}}><Dices size={15} strokeWidth={1.5}/>掷骰</button>
              {isOnCar&&curPlayer.res>=1&&<button onClick={startUpgrade} style={{background:C.frame,color:C.txt,border:`1px solid ${C.border}`,borderRadius:3,padding:"6px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:5}}><Wrench size={14} strokeWidth={1.5}/>升级汽车</button>}</>
            )}
            {phase==="move"&&dice&&<span style={{fontSize:13,color:C.txtDim,padding:"6px 12px",border:`1px solid ${C.border}`,borderRadius:3,display:"flex",alignItems:"center",gap:5}}><MapPin size={14} strokeWidth={1.5}/>AP: {dice+(carLevels[2]||0)}</span>}
            {phase==="resolve"&&<button onClick={nextTurn} style={{background:C.gold,color:C.bg,border:`1px solid ${C.gold}`,borderRadius:3,padding:"6px 16px",fontSize:13,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:5,fontWeight:700}}><ChevronRight size={15} strokeWidth={1.5}/>{turnIdx>=TURN_ORDER.length-1?"结束回合 → 缩圈":"下一位玩家"}</button>}
            {dice!=null&&<span style={{fontSize:18,color:C.gold,fontWeight:700}}>d10: {dice}</span>}
            <div style={{flex:1}}/>
            <button onClick={reset} style={{background:C.frame,color:C.txt,border:`1px solid ${C.border}`,borderRadius:3,padding:"5px 10px",fontSize:12,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:4}}><RotateCcw size={12} strokeWidth={1.5}/>重置</button>
          </div>

          {upgradePanel}

          {/* Car */}
          <div style={{padding:"6px 10px",background:C.frame,border:`1px solid ${C.border}`,borderRadius:3,fontSize:13,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
            <Car size={13} color={C.goldDim} strokeWidth={1.5}/><span style={{color:C.txtDim}}>汽车</span>
            {CAR_PARTS.map((p,i)=>(<span key={i} style={{color:carLevels[i]>0?C.gold:C.txtMute}}>{p.icon} {p.name} Lv.{carLevels[i]}</span>))}
          </div>

          {/* Cell info */}
          {info&&(<div style={{padding:"6px 10px",background:C.frame,border:`1px solid ${C.border}`,borderRadius:3,fontSize:13,color:C.txtDim,display:"flex",alignItems:"center",gap:6}}>
            <CircleDot size={12} color={C.goldDim} strokeWidth={1.5}/>[{sel.col},{sel.row}] <span style={{color:C.gold}}>{info.t}</span> <span>暴雨: {info.st}</span></div>)}

          {/* Players */}
          <div style={{background:C.frame,border:`1px solid ${C.border}`,borderRadius:3,padding:8}}>
            <div style={{fontSize:11,color:C.txtMute,marginBottom:5}}>PLAYERS · 宝藏 {totalTr}/4</div>
            {players.map((p,i)=>(
              <div key={p.id} style={{display:"flex",alignItems:"center",gap:6,fontSize:13,padding:"4px 0",borderLeft:curPid===i?`3px solid ${C.gold}`:"3px solid transparent",paddingLeft:6,opacity:curPid===i?1:0.5}}>
                <PieceIcon pid={i} size={16}/>
                <span style={{flex:1}}>{p.name}</span>
                {p.skipNext&&<AlertTriangle size={11} color="#e88060"/>}
                {p.stormConsec>=2&&<CloudRain size={11} color="#e88060"/>}
                <span style={{color:C.txtDim,fontSize:11}}>{p.side==="wild"?"雨前荒野":"抛锚地"} · {p.res}物资{p.treasures?` · ${p.treasures}宝藏`:""}{p.combatBonus?` · 战斗+${p.combatBonus}`:""}</span>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div style={{background:C.frame,border:`1px solid ${C.border}`,borderRadius:3,padding:6,display:"flex",gap:8,flexWrap:"wrap"}}>
            {[[C.skG,"物资"],[C.skB,"事件"],[C.skR,"战斗"],[C.skY,"宝藏"],[C.wObs,"障碍"],[C.wGrass,"荒草"],[C.tunnel,"密道"]].map(([c,l])=>(
              <div key={l} style={{display:"flex",alignItems:"center",gap:3,fontSize:11}}><div style={{width:8,height:8,borderRadius:2,background:c}}/><span style={{color:C.txtDim}}>{l}</span></div>
            ))}
          </div>
        </div>

        {/* RIGHT: Log (2x fonts) */}
        <div style={{flex:"0 0 240px",display:"flex",flexDirection:"column",minHeight:0}}>
          <div style={{background:C.frame,border:`1px solid ${C.border}`,borderRadius:4,padding:12,flex:1,overflow:"auto",minHeight:0}}>
            <div style={{fontSize:14,color:C.txtMute,marginBottom:6,letterSpacing:2,borderBottom:`1px solid ${C.border}`,paddingBottom:4}}>EVENT LOG</div>
            {log.map((e,i)=><div key={i} style={{fontSize:14,color:i===0?C.txt:C.txtDim,padding:"3px 0",lineHeight:1.5}}>{e}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
