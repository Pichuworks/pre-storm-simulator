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
  { name: "车身", desc: "突袭判定+20", icon: "🛡" },
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
    if (rem === 0 && !(col === sCol && row === sRow)) { exact.add(k); }
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
  const ids = [...cells].sort((a,b) => b.dist-a.dist || Math.random()-0.5).map(c=>c.id);
  const gs = Math.ceil(ids.length/ROUNDS);
  ids.forEach((id,i) => { cells.find(c=>c.id===id).stormRound = Math.min(ROUNDS, Math.floor(i/gs)+1); });
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
function HCell({c,px,py,round,sel,reachable,players,onClick}) {
  const isW=c.side==="wild";
  const stormed=isW&&round>=c.stormRound;
  const warn=isW&&round===c.stormRound-1&&c.stormRound>0;
  const isReach=reachable&&reachable.has(`${c.col},${c.row}`);
  let fill,stroke;
  if(stormed){fill=C.sRed;stroke="#400805";}
  else if(c.terrain==="obstacle"){fill=isW?C.wObs:"#486848";stroke=isW?"#48484e":"#385838";}
  else if(c.terrain==="grass"){fill=C.wGrass;stroke=C.wGrassS;}
  else if(c.terrain==="tunnel"){fill=C.tunnel;stroke="#6868b8";}
  else if(c.terrain==="car"){fill="#584828";stroke=C.car;}
  else{fill=isW?C.wBase:C.sBase;stroke=isW?"#a89868":C.sBaseS;}
  if(warn&&!stormed)stroke=C.sWarn;
  if(isReach&&!stormed)stroke=C.reach;
  const sk=c.sticker&&!stormed?({green:C.skG,blue:C.skB,red:C.skR,yellow:C.skY}[c.sticker]):null;
  const pts=hexPts(px,py);
  return (
    <g onClick={()=>onClick(c)} style={{cursor:isReach?"pointer":"default"}} opacity={stormed?0.6:1}>
      {stormed&&<polygon points={pts} fill={C.sGlow} opacity={0.06} filter="url(#gl)"/>}
      <polygon points={pts} fill={fill} stroke={sel?C.goldBr:stroke} strokeWidth={sel?1.2:isReach?1.0:0.5}/>
      {isReach&&!stormed&&<polygon points={pts} fill={C.reach} opacity={0.15}/>}
      {warn&&!stormed&&!isReach&&<polygon points={pts} fill={C.sWarn} opacity={0.1}/>}
      {sk&&c.terrain!=="grass"&&<circle cx={px} cy={py} r={2.5} fill={sk} opacity={0.88}/>}
      {sk&&c.terrain==="grass"&&<text x={px} y={py+1.8} textAnchor="middle" fontSize="4.5" fill="#686838">?</text>}
      {c.terrain==="tunnel"&&<text x={px} y={py+2} textAnchor="middle" fontSize="5.5" fill="#b0b0e0">◇</text>}
      {c.terrain==="car"&&<text x={px} y={py+2} textAnchor="middle" fontSize="5" fill="#d08878">▣</text>}
      {players?.map((p,i)=>(<Piece key={p.id} x={px+(i-(players.length-1)/2)*6} y={py} pid={p.id}/>))}
    </g>
  );
}

function Slot({label,Icon}) {
  return (<div style={{width:38,height:50,border:`1px solid ${C.border}`,borderRadius:2,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:`linear-gradient(180deg,${C.frameLt},${C.frame})`,gap:2}}><Icon size={14} color={C.goldDim} strokeWidth={1.5}/><span style={{fontSize:8,color:C.txtDim,letterSpacing:0.5}}>{label}</span></div>);
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
  const [carLevels, setCarLevels] = useState([0,0,0,0]); // 4 structures
  const [gameOver, setGameOver] = useState(false);

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

  return (
    <div style={{background:C.bg,color:C.txt,minHeight:"100vh",fontFamily:"'Noto Serif SC',STSong,SimSun,serif",padding:8,boxSizing:"border-box"}}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@300;400;700&display=swap" rel="stylesheet"/>
      <div style={{textAlign:"center",marginBottom:4,borderBottom:`1px solid ${C.border}`,paddingBottom:4}}>
        <div style={{fontSize:8,color:C.txtMute,letterSpacing:4,fontWeight:300}}>REVERSE : 1999</div>
        <h1 style={{fontSize:18,color:C.gold,margin:"2px 0",fontWeight:300,letterSpacing:3}}>雨前荒野一隅</h1>
      </div>

      {/* Status bar */}
      <div style={{margin:"4px 0",padding:"5px 8px",background:C.frame,border:`1px solid ${C.border}`,borderRadius:2}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:10,marginBottom:3}}>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <CloudRain size={12} color={C.gold} strokeWidth={1.5}/>
            <span>回合 </span><span style={{color:C.gold,fontSize:15,fontWeight:700}}>{round}</span><span style={{color:C.txtDim}}>/{ROUNDS}</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <PieceIcon pid={curPid} size={12}/>
            <span style={{color:C.gold,fontSize:10}}>{curPlayer.name}</span>
            {curPlayer.skipNext && <AlertTriangle size={10} color="#e88060" strokeWidth={2}/>}
            {stormBlocked && <CloudRain size={10} color="#e88060" strokeWidth={2}/>}
            <span style={{fontSize:9,color:C.txtDim,padding:"1px 5px",border:`1px solid ${C.border}`,borderRadius:2}}>{phaseLabel}</span>
          </div>
        </div>
        <div style={{width:"100%",height:3,background:"#1a1508",borderRadius:2,overflow:"hidden"}}>
          <div style={{width:`${pct}%`,height:"100%",background:`linear-gradient(90deg,${C.sWarn},${C.sRed})`,borderRadius:2,transition:"width 0.5s"}}/>
        </div>
      </div>

      {/* Controls */}
      <div style={{display:"flex",gap:3,margin:"4px 0",flexWrap:"wrap",alignItems:"center"}}>
        {phase==="skip"&&<Btn onClick={doSkip} icon={SkipForward} warn>跳过行动</Btn>}
        {phase==="roll"&&!curPlayer.skipNext&&(
          <>
            <Btn onClick={doRoll} icon={Dices} active disabled={gameOver}>掷骰</Btn>
            {isOnCar&&curPlayer.res>=1&&<Btn onClick={startUpgrade} icon={Wrench} small>升级汽车</Btn>}
          </>
        )}
        {phase==="move"&&dice&&<Btn disabled icon={MapPin}>AP:{dice + (carLevels[2]||0)} — 选择目标格</Btn>}
        {phase==="resolve"&&<Btn onClick={nextTurn} icon={ChevronRight} active>{turnIdx>=TURN_ORDER.length-1?"结束回合→缩圈":"下一位"}</Btn>}
        {dice!=null&&<span style={{fontSize:11,color:C.gold,fontWeight:700}}>d10:{dice}</span>}
        <div style={{flex:1}}/>
        <Btn onClick={reset} icon={RotateCcw} small>重置</Btn>
      </div>

      {/* Upgrade panel */}
      {phase==="upgrade"&&(
        <div style={{margin:"4px 0",padding:"5px 8px",background:C.frameLt,border:`1px solid ${C.gold}40`,borderRadius:2}}>
          <div style={{fontSize:9,color:C.gold,marginBottom:2,display:"flex",alignItems:"center",gap:4}}><Wrench size={10} strokeWidth={1.5}/>汽车升级 · 消耗1物资 · 判定</div>
          <CarPanel carLevels={carLevels} onUpgrade={doUpgrade} playerRes={curPlayer.res} disabled={false}/>
        </div>
      )}

      {/* Boards */}
      <div style={{display:"flex",gap:3,alignItems:"center",marginBottom:2}}>
        <div style={{display:"flex",flexDirection:"column",gap:2}}><Slot label="宝物" Icon={Gem}/><Slot label="物资" Icon={Package}/></div>
        <div style={{flex:1}}>
          <BoardView cells={board.wild} round={round} sel={sel} reachable={curPlayer.side==="wild"?reachable:null} players={players.filter(p=>p.side==="wild")} onClick={handleCellClick} label="雨前荒野" sub="布灯侧" isWild/>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:2}}><Slot label="勇气" Icon={Flame}/><Slot label="创造" Icon={Sparkles}/></div>
      </div>

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 46px",marginBottom:2}}>
        <div style={{width:58,height:28,borderRadius:"50%",border:`1px solid ${C.border}`,background:C.frame,display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
          <Dices size={12} color={C.goldDim} strokeWidth={1.5}/><span style={{fontSize:7,color:C.txtMute}}>骰子</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:4,color:C.txtMute,fontSize:8}}>
          <div style={{width:20,height:1,background:C.border}}/><Hexagon size={9} color={C.goldDim} strokeWidth={1.5}/>
          <span>密道</span><Hexagon size={9} color={C.goldDim} strokeWidth={1.5}/><div style={{width:20,height:1,background:C.border}}/>
        </div>
        <div style={{width:64,height:32,borderRadius:"50%",border:`1px solid ${C.border}`,background:C.frame,display:"flex",alignItems:"center",justifyContent:"center",gap:3,overflow:"hidden"}}>
          {[0,1,2,3].map(i=><PieceIcon key={i} pid={i} size={9}/>)}
        </div>
      </div>

      <div style={{display:"flex",gap:3,alignItems:"center",marginBottom:3}}>
        <div style={{display:"flex",flexDirection:"column",gap:2}}><Slot label="事件" Icon={ScrollText}/><Slot label="敌人" Icon={Skull}/></div>
        <div style={{flex:1}}>
          <BoardView cells={board.safe} round={round} sel={sel} reachable={curPlayer.side==="safe"?reachable:null} players={players.filter(p=>p.side==="safe")} onClick={handleCellClick} label="抛锚地" sub="安全侧" isWild={false}/>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:2}}><Slot label="逻辑" Icon={Target}/><Slot label="专注" Icon={Eye}/></div>
      </div>

      {info&&(<div style={{padding:"4px 8px",background:C.frame,border:`1px solid ${C.border}`,borderRadius:2,fontSize:9,color:C.txtDim,marginBottom:3,display:"flex",alignItems:"center",gap:6}}>
        <CircleDot size={9} color={C.goldDim} strokeWidth={1.5}/><span>[{sel.col},{sel.row}]</span><span style={{color:C.txt}}>距{info.dist}</span><span style={{color:C.gold}}>{info.t}</span><span>暴雨:{info.st}</span></div>)}

      {/* Car status */}
      <div style={{margin:"0 0 3px",padding:"4px 8px",background:C.frame,border:`1px solid ${C.border}`,borderRadius:2,display:"flex",alignItems:"center",gap:8,fontSize:9}}>
        <Car size={10} color={C.goldDim} strokeWidth={1.5}/>
        <span style={{color:C.txtDim}}>汽车</span>
        {CAR_PARTS.map((p,i)=>(
          <span key={i} style={{color:carLevels[i]>0?C.gold:C.txtMute}}>{p.icon}{p.name} Lv.{carLevels[i]}</span>
        ))}
      </div>

      {/* Players */}
      <div style={{display:"flex",gap:4,marginBottom:3}}>
        <div style={{flex:1,background:C.frame,border:`1px solid ${C.border}`,borderRadius:2,padding:5}}>
          <div style={{fontSize:8,color:C.txtMute,marginBottom:3,letterSpacing:1}}>PLAYERS · 宝{totalTr}/4</div>
          {players.map((p,i)=>(
            <div key={p.id} style={{display:"flex",alignItems:"center",gap:3,fontSize:9,padding:"1.5px 0",borderLeft:curPid===i?`2px solid ${C.gold}`:"2px solid transparent",paddingLeft:3,opacity:curPid===i?1:0.6}}>
              <PieceIcon pid={i} size={14}/>
              <span>{p.name}</span>
              {p.skipNext&&<AlertTriangle size={8} color="#e88060" strokeWidth={2}/>}
              {p.stormConsec>=2&&<CloudRain size={8} color="#e88060" strokeWidth={2}/>}
              <span style={{color:C.txtDim,marginLeft:"auto",fontSize:8}}>
                {p.side==="wild"?"荒":"安"} {p.res}资 {p.treasures?`${p.treasures}宝`:""} {p.combatBonus?`+${p.combatBonus}战`:""}
              </span>
            </div>
          ))}
        </div>
        <div style={{width:88,background:C.frame,border:`1px solid ${C.border}`,borderRadius:2,padding:5}}>
          <div style={{fontSize:8,color:C.txtMute,marginBottom:3,letterSpacing:1}}>LEGEND</div>
          {[[C.skG,"物资"],[C.skB,"事件"],[C.skR,"战斗"],[C.skY,"宝藏"],[C.wObs,"障碍"],[C.wGrass,"荒草"],[C.tunnel,"密道"]].map(([c,l])=>(
            <div key={l} style={{display:"flex",alignItems:"center",gap:3,fontSize:8,padding:"1px 0"}}><div style={{width:5,height:5,borderRadius:1,background:c}}/><span style={{color:C.txtDim}}>{l}</span></div>
          ))}
        </div>
      </div>

      <div style={{background:C.frame,border:`1px solid ${C.border}`,borderRadius:2,padding:5,maxHeight:80,overflow:"auto"}}>
        <div style={{fontSize:8,color:C.txtMute,marginBottom:2,letterSpacing:1}}>LOG</div>
        {log.map((e,i)=><div key={i} style={{fontSize:8,color:i===0?C.txt:C.txtMute,padding:"1px 0"}}>{e}</div>)}
      </div>

      <div style={{textAlign:"center",marginTop:5,fontSize:7,color:C.txtMute,letterSpacing:1,borderTop:`1px solid ${C.border}`,paddingTop:4}}>
        雨前漫游指南 · Phase 2 · 143×2
      </div>
    </div>
  );
}
