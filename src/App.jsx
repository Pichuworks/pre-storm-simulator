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
const CAR_MAX_LV = 6;
const CAR_PARTS = [
  { name: "引擎", icon: "⊙",
    desc: ["+1移动","+2移动","+3移动","+4移动","+5移动","+6移动 解除暴雨限制"],
    effectShort: (lv) => lv > 0 ? `+${lv}AP` : "" },
  { name: "照明", icon: "✧",
    desc: ["神秘+5战斗","人类+5战斗","神秘+10战斗","人类+10战斗","神秘+20战斗","人类+15 可连续升级"],
    effectShort: (lv) => lv > 0 ? `战斗+` : "" },
  { name: "锚点", icon: "⊕",
    desc: ["10%免费升级","突袭全员+10","50%阻止损失","传送1次","重抽/双战/+2物资","鸡光武器"],
    effectShort: (lv) => lv > 0 ? `Lv${lv}` : "" },
  { name: "通讯", icon: "◇",
    desc: ["+1援助","+1援助","+1援助","+1援助","+1援助 可重抽事件","+2援助 可直接判定成功"],
    effectShort: (lv) => lv > 0 ? `${lv}援` : "" },
];

// ─── Event Cards (13吉 + 9凶) ────────────────────────────
const EVENTS_GOOD = [
  { name:"空投箱", desc:"见者有份，先到先得。", effect:"allRes", dr:2 },
  { name:"神秘草药", desc:"吧唧……不要吃不认识的草，吧唧。", effect:"heal" },
  { name:"短波收音机", desc:"这收音机怎么是绿色的。", effect:"help", helpDr:1 },
  { name:"小把戏", desc:"什么叫你那边有好东西？", effect:"swap" },
  { name:"疾速", desc:"踩踩油门，伙计。", effect:"speed", dr:1, apBonus:4 },
  { name:"技术爆炸", desc:"你刚说的核聚变技术是什么意思？", effect:"freeUpgrade" },
  { name:"双倍干劲", desc:"我有时候运气就是很好。", effect:"doubleRes" },
  { name:"特殊咒文", desc:"我用理线学找到的。", effect:"reroll" },
  { name:"回声小径", desc:"你把海螺放到耳边听了听。", effect:"pick3" },
  { name:"玻璃雨滴", desc:"敲一敲，看看它是不是纯的……它碎了。", effect:"duel", dr:2, helpDr:1 },
  { name:"组合技", desc:"早跟你说了我们是最佳拍档。", effect:"autoWin" },
  { name:"发财！", desc:"永葆年轻的秘诀？这个不卖，亲爱的。", effect:"allPlus1" },
  { name:"团队领袖", desc:"听我说！朋友们！家人们！", effect:"leaderPick" },
];
const EVENTS_BAD = [
  { name:"误触陷阱", desc:"千钧一发，电光火石。", effect:"trapChoice" },
  { name:"雷暴", desc:"不，我不会把避雷针带到脑袋上的。", effect:"thunderAll", apPenalty:2 },
  { name:"苦目糖", desc:"这不是我喜欢的糖块……", effect:"bitterCandy" },
  { name:"智慧果实", desc:"一天一个苹果，大副远离我。", effect:"wisdomFruit" },
  { name:"沉痛诅咒", desc:"我还不想……在这里停下……", effect:"curse" },
  { name:"遭贼", desc:"有个长得像蜜袋鼯的女人飞过去了。", effect:"thief" },
  { name:"空袭区", desc:"我很确定现在不是1919年。", effect:"airStrike" },
  { name:"集体癔症", desc:"我发誓那房子里有婴儿的哭声……", effect:"invert" },
  { name:"敢作敢为", desc:"我来，我见，我背不动了。", effect:"braveChoice" },
];

// ─── Monster Cards ───────────────────────────────────────
const MONSTERS = [
  { name:"虚弱的魔精", desc:"它的眼神似乎在哀求……", mod:-50, special:"mercyItem" },
  { name:"叽喳的魔精", desc:"窝似摸金……窝要赞领拉普拉屎……", mod:-20 },
  { name:"凶暴的魔精", desc:"很凶，但也只是魔精。", mod:0 },
  { name:"巨大的魔精", desc:"它吃了什么长这么大的？", mod:10 },
  { name:"敌对精英术士", desc:"他们一直在念叨自愿加入什么之手。", mod:20 },
  { name:"游魂", desc:"人类无法触碰之物。", mod:-50, special:"zeroRoll" },
  { name:"宝箱怪", desc:"我抓到它了！……哦它又跑了。", mod:0, special:"chestRepeat" },
  { name:"宝藏守护者", desc:"坏了，他看见我了。", mod:30, special:"guardTreasure" },
  { name:"毒性蝾螈", desc:"闻起来像有人吐在这了……哦是我自己吐的。", mod:0, special:"poisonSlow" },
  { name:"石像鬼", desc:"真硬。——某位新手术士的遗言。", mod:0, special:"harden" },
  { name:"飞蛾人", desc:"我死死地盯着我的敌人，然后意识到我不该盯着它。", mod:20, special:"mothDrain" },
  { name:"奥利图欧", desc:"它抓着我飞起来了。", mod:0, special:"fly" },
];

// ─── Treasure Cards ──────────────────────────────────────
const TREASURES = [
  { name:"苏芙比的魔药", desc:"虽然颜色有点像直接从沼泽里取的，但苏芙比保证它有效！", effect:"healAll" },
  { name:"星锑的唱片", desc:"我的音乐那天把暴雨都震撼到了！", effect:"stormPause" },
  { name:"玛蒂尔达的水晶球", desc:"天才的玛蒂尔达刚刚决定，让你往这儿走。", effect:"undoEvent", holdable:true },
  { name:"马库斯的提灯", desc:"有时一点微光，就能避免我们步入幽微。", effect:"revealGrass", holdable:true },
  { name:"遗失的橘子", desc:"临别礼物，老爷。", effect:"bossBonus", hidden:true },
];

// ─── Judgment Cards (physical mini-games, display only) ──
const JUDGMENTS = {
  courage: [
    "限时1分钟，让场地内一位不在游戏中的游客承诺「一定会来玩桌游」",
    "限时1分钟，与场地内敌对势力的玩家拍一张比心合影",
    "喊出自己所cos的角色的经典台词",
    "为场上一名其他玩家唱一首歌，4~8句",
    "限时1分钟，收集三种无料",
  ],
  creation: [
    "限时1分钟，只用肢体动作让对面玩家猜出主持人给的动物",
    "手段不限，说服主持人让你通过判定",
    "限时1分钟，连说四句押韵的话，包含视野范围内三种物品",
    "用四种动物形容四名玩家，下回合只能用动物称呼代替",
    "写下一种职业，只用走路姿势让对面玩家猜出",
    "连续模仿6种动物的叫声，除了换气不能中断",
  ],
  logic: [
    "口述证明：不使用等腰三角形定理，证明AB=AC时角B=角C",
    "限时15秒，心算两个2位数相乘结果",
    "五人写下真实身高，反问三个问题，正确排序高矮",
    "连续说出8种同类型的事物，停顿不大于三秒",
    "限时15秒，掷骰得到两位数，说出这个天数后是星期几",
  ],
  focus: [
    "限时1分钟，完成倒转水瓶挑战",
    "限时7秒，将五个骰子立起来并松手两秒不倒",
    "限时30秒，拼出一幅小拼图",
    "限时10秒，将五个骰子翻到同一面",
    "限时20秒，默写12位随机数字",
  ],
};

// ─── Boss Data ───────────────────────────────────────────
const BOSS_ATTACKS_NORMAL = [
  { name:"虚弱", desc:"随机两名玩家攻击减半", effect:"weaken" },
  { name:"沉默", desc:"一名玩家攻击失效", effect:"silence" },
  { name:"混乱", desc:"所有玩家十位数和个位数颠倒", effect:"confuse" },
  { name:"愈合", desc:"恢复两位数血量", effect:"heal" },
];
const BOSS_ATTACKS_HIDDEN = [
  ...BOSS_ATTACKS_NORMAL,
  { name:"震颤", desc:"神秘学家技能加成本回合失效", effect:"tremor" },
  { name:"尖啸", desc:"人类战斗判定永久-10", effect:"screech" },
];
const WOUNDS = ["左眼","右眼","双眼","舌（禁止出声）","左手","右手","脊椎（不能弯腰）","左腿","右腿","双腿（不能直立）"];

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
function getReachable(cells, sCol, sRow, ap, round, side, stormImmune) {
  const m = {}; cells.forEach(c => { m[`${c.col},${c.row}`] = c; });
  const visited = new Set();
  const queue = [{ col: sCol, row: sRow, rem: ap }];
  visited.add(`${sCol},${sRow},${ap}`);
  const exact = new Set();
  const allReachable = new Map();

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
      // Engine Lv6 + mystic: ignore storm penalty
      const cost = (!stormImmune && (curSt || nbSt)) ? 2 : 1;
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
  // Grass cells MUST all have stickers (denser enemies per design v2)
  if (isW) {
    cells.filter(c=>c.terrain==="grass"&&!c.sticker).forEach(c=>{
      const grassPool = ["red","red","red","green","green","blue"];
      c.sticker = grassPool[Math.floor(R()*grassPool.length)];
    });
  }
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
    { id:0, name:PN[0], type:"mystic", side:"wild", col:w1.col, row:w1.row, res:0, combatBonus:0, treasures:0, stormConsec:0, skipNext:false, items:[], anchorTP:false },
    { id:1, name:PN[1], type:"human", side:"safe", col:s1.col, row:s1.row, res:0, repeatMap:{}, treasures:0, stormConsec:0, skipNext:false, items:[], anchorTP:false },
    { id:2, name:PN[2], type:"mystic", side:"wild", col:w2.col, row:w2.row, res:0, combatBonus:0, treasures:0, stormConsec:0, skipNext:false, items:[], anchorTP:false },
    { id:3, name:PN[3], type:"human", side:"safe", col:s2.col, row:s2.row, res:0, repeatMap:{}, treasures:0, stormConsec:0, skipNext:false, items:[], anchorTP:false },
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

// ─── Card Display ────────────────────────────────────────
function CardDisplay({ card, onClose }) {
  if (!card) return null;
  const colors = { event: card.isGood ? "#3a6a3a" : "#6a2a2a", monster: "#6a3a2a", treasure: "#5a5a2a", judgment: "#2a4a6a" };
  const titles = { event: card.isGood ? "事件格 · 吉" : "事件格 · 凶", monster: "战斗格", treasure: "宝藏格", judgment: "物资格 · 判定" };
  const bg = colors[card.type] || C.frame;
  return (
    <div style={{padding:"8px 10px",background:bg,border:`1px solid ${C.gold}60`,borderRadius:4,position:"relative"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <span style={{fontSize:13,color:C.goldBr,fontWeight:700,letterSpacing:1}}>{titles[card.type]||"卡牌"}</span>
        <button onClick={onClose} style={{background:"transparent",border:"none",color:C.txtDim,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>×</button>
      </div>
      {card.type==="event"&&card.data&&(
        <div><div style={{fontSize:10,color:C.txt,fontWeight:700}}>「{card.data.name}」</div><div style={{fontSize:9,color:C.txtDim,fontStyle:"italic",marginTop:2}}>{card.data.desc}</div></div>
      )}
      {card.type==="monster"&&card.data&&(
        <div><div style={{fontSize:10,color:C.txt,fontWeight:700}}>{card.data.name} <span style={{color:C.goldDim}}>({card.data.mod>=0?"+":""}{card.data.mod})</span></div><div style={{fontSize:9,color:C.txtDim,fontStyle:"italic",marginTop:2}}>{card.data.desc}</div>{card.data.special&&<div style={{fontSize:8,color:C.gold,marginTop:2}}>特殊: {card.data.special}</div>}</div>
      )}
      {card.type==="treasure"&&card.data&&(
        <div><div style={{fontSize:10,color:C.goldBr,fontWeight:700}}>「{card.data.name}」</div><div style={{fontSize:9,color:C.txtDim,fontStyle:"italic",marginTop:2}}>{card.data.desc}</div>{card.data.holdable&&<div style={{fontSize:8,color:C.gold,marginTop:2}}>可持有 · 可转交1格内队友</div>}</div>
      )}
      {card.type==="judgment"&&(
        <div>
          <div style={{fontSize:10,color:"#80b8e0"}}>{card.category==="courage"?"勇气":card.category==="creation"?"创造":card.category==="logic"?"逻辑":"专注"}</div>
          <div style={{fontSize:10,color:C.txt,marginTop:3,lineHeight:1.5}}>{card.text}</div>
          <div style={{fontSize:10,color:card.passed?"#80c040":"#e06040",marginTop:4,fontWeight:700}}>{card.passed?"判定成功 · +1物资":"判定失败 · 无物资"}</div>
        </div>
      )}
    </div>
  );
}

// ─── Sticker resolution ──────────────────────────────────
// 照明 combat bonus by level and player type
function getLightingBonus(lightLv, type) {
  const mysticB = [0, 5, 5, 10, 10, 20, 20];
  const humanB  = [0, 0, 5, 5,  10, 10, 15];
  return type === "mystic" ? mysticB[lightLv] : humanB[lightLv];
}

function resolveSticker(sticker, player, carLevels, treasureIdx, jHistory) {
  const lightBonus = getLightingBonus(carLevels?.[1]||0, player.type);
  const pick = (arr) => arr[Math.floor(Math.random()*arr.length)];

  switch(sticker) {
    case "green": {
      const jType = player.type === "mystic" ? pick(["courage","creation"]) : pick(["logic","focus"]);
      const jCards = JUDGMENTS[jType];
      const card = pick(jCards);
      // 人类「理性」: check if this card was drawn before
      const drawCount = (jHistory||[]).filter(t => t === card).length;
      let passRate = 0.6;
      let bonusMsg = "";
      if (player.type === "human") {
        if (drawCount >= 2) { passRate = 1.0; bonusMsg = " (理性：自动成功)"; }
        else if (drawCount >= 1) { passRate = 0.8; bonusMsg = " (理性：+50%加时)"; }
      }
      const ok = Math.random() < passRate;
      return { msg: ok ? `判定成功，+1物资${bonusMsg}` : `判定失败${bonusMsg}`, dr: ok?1:0, card: { type:"judgment", category:jType, text:card, passed:ok }, drawnJudgment:card };
    }
    case "blue": {
      // 事件格：60%吉 40%凶
      const isGood = Math.random() < 0.6;
      const evt = isGood ? pick(EVENTS_GOOD) : pick(EVENTS_BAD);
      let dr = 0, extra = "";
      // 简易效果结算
      if (evt.effect === "allRes") { dr = evt.dr||2; }
      else if (evt.effect === "help") { dr = 0; extra = " 场外援助+1"; }
      else if (evt.effect === "speed") { dr = 1; extra = " 下回合+4AP"; }
      else if (evt.effect === "allPlus1") { dr = 1; extra = " 全员+1物资"; }
      else if (evt.effect === "freeUpgrade") { dr = 0; extra = " 免费升级一次"; }
      else if (evt.effect === "thunderAll") { dr = 0; extra = " 下回合全员-2AP"; }
      else if (evt.effect === "thief") { dr = -1; extra = " 物资最多者-1"; }
      else if (evt.effect === "bitterCandy") {
        if (player.type === "mystic") { extra = " 激情+1"; }
        else { extra = " 跳过一回合"; }
      }
      else if (evt.effect === "wisdomFruit") {
        if (player.type === "mystic") { extra = " 激情-1"; }
        else { extra = " 下次逻辑/专注必定成功"; }
      }
      else if (evt.effect === "invert") { extra = " 下回合骰子取反"; }
      else if (evt.effect === "trapChoice") { dr = 0; extra = " 抉择：自伤或队友昏迷"; }
      else if (evt.effect === "curse") { dr = 0; extra = " 持续AP递减"; }
      else if (!isGood) { dr = -1; }
      return { msg: `${isGood?"吉":"凶"}「${evt.name}」${evt.desc} ${extra}`, dr, card: { type:"event", data:evt, isGood } };
    }
    case "red": {
      // 战斗格：抽怪物卡 → 拼点
      const anchorLv6 = (carLevels?.[2]||0) >= 6;
      const monster = anchorLv6 ? MONSTERS[0] : pick(MONSTERS); // Lv6鸡光武器: 全部变虚弱的魔精
      let wins=0, losses=0;
      const details = [];
      const totalBonus = (player.combatBonus||0) + lightBonus;
      const enemyBase = monster.mod;
      // 游魂特殊：玩家点数变0
      const isGhost = monster.special === "zeroRoll";

      for(let i=0;i<3&&wins<2&&losses<2;i++){
        let pRoll = Math.floor(Math.random()*100); if(pRoll===0) pRoll=100;
        let eRoll = Math.floor(Math.random()*100); if(eRoll===0) eRoll=100;
        const pVal = isGhost ? 0 : (pRoll + totalBonus);
        const eVal = eRoll + enemyBase;
        if(pRoll===100&&!isGhost){wins=2;details.push(`[00→大成功]`);break;}
        else if(pRoll===1){losses=2;details.push(`[01→大失败]`);break;}
        else if(pVal>eVal){wins++;details.push(`${pRoll}${totalBonus?`+${totalBonus}`:""}v${eRoll}${enemyBase?`+${enemyBase}`:""}胜`);}
        else{losses++;details.push(`${pRoll}${totalBonus?`+${totalBonus}`:""}v${eRoll}${enemyBase?`+${enemyBase}`:""}负`);}
      }
      const won = wins >= 2;
      const oddRoll = Math.floor(Math.random()*10)+1;
      const dr = won ? (oddRoll%2===1?1:2) : (oddRoll%2===1?0:-1);
      let specialMsg = "";
      const fx = {}; // mechanical effects to apply
      if (monster.special === "mothDrain" && player.type === "mystic") {
        if (!won) { fx.passionDr = -1; specialMsg = " 激情-1"; }
        else { specialMsg = " 激情归还"; }
      }
      if (monster.special === "poisonSlow" && won) { fx.poisonSlow = true; specialMsg = " 中毒：下回合移动≤3格"; }
      if (monster.special === "fly" && won) { specialMsg = " 可飞行至地图任意空格"; }
      if (monster.special === "mercyItem" && !won) { fx.addItem = "开心的魔精"; specialMsg = " 获得「开心的魔精」"; }
      if (monster.special === "guardTreasure") { specialMsg = won ? "" : " 宝藏守护者阻止了你获取宝藏"; }
      return {
        msg: `战斗「${monster.name}」(${enemyBase>=0?"+":""}${enemyBase}) ${details.join(" ")} → ${won?"胜利":"失败"}${dr>0?` +${dr}`:dr<0?` ${dr}`:""}物资${specialMsg}`,
        dr, combatWin: won, card: { type:"monster", data:monster }, fx
      };
    }
    case "yellow": {
      // 宝藏格：按顺序发放
      const tIdx = (treasureIdx||0) % TREASURES.length;
      const treasure = TREASURES[tIdx];
      return {
        msg: `宝藏「${treasure.name}」${treasure.desc}`,
        dr: 0, treasure: true, treasureCard: treasure,
        card: { type:"treasure", data:treasure, index:tIdx }
      };
    }
    default: return { msg: "空地", dr: 0 };
  }
}

// ─── Boss Fight Panel ────────────────────────────────────
function BossFightPanel({ boss, setBoss, players, addLog }) {
  if (!boss) return null;
  const pick = (arr) => arr[Math.floor(Math.random()*arr.length)];
  const d100 = () => { let v = Math.floor(Math.random()*100); return v===0?100:v; };

  const doRound = () => {
    if (boss.phase !== 1) return;
    const b = { ...boss, round: boss.round + 1, log: [...boss.log] };
    const attacks = boss.type === "hidden" ? BOSS_ATTACKS_HIDDEN : BOSS_ATTACKS_NORMAL;
    const atk = pick(attacks);
    b.log.push(`── BOSS回合${b.round} ── ${atk.name}：${atk.desc}`);

    // Player rolls
    let rolls = players.map(() => d100());
    let mods = rolls.map(() => 1); // multiplier

    // Apply boss attack
    if (atk.effect === "weaken") {
      const targets = [0,1,2,3].sort(()=>Math.random()-0.5).slice(0,2);
      targets.forEach(t => { mods[t] = 0.5; });
      b.log.push(`虚弱: ${targets.map(t=>players[t].name).join("、")} 攻击减半`);
    } else if (atk.effect === "silence") {
      const t = Math.floor(Math.random()*4);
      mods[t] = 0;
      b.log.push(`沉默: ${players[t].name} 攻击失效`);
    } else if (atk.effect === "confuse") {
      rolls = rolls.map(r => {
        if (r === 100) return 1;
        const tens = Math.floor(r/10), ones = r%10;
        return ones*10+tens || 100;
      });
      b.log.push("混乱: 全员点数十位个位颠倒");
    } else if (atk.effect === "heal") {
      const heal = d100();
      b.hp = Math.min(b.maxHp, b.hp + heal);
      b.log.push(`愈合: BOSS恢复${heal}HP → ${b.hp}/${b.maxHp}`);
    } else if (atk.effect === "tremor") {
      rolls = rolls.map((r,i) => players[i].type==="mystic" ? Math.max(1,r-(players[i].combatBonus||0)) : r);
      b.log.push("震颤: 神秘学家技能加成本回合失效");
    } else if (atk.effect === "screech") {
      b.log.push("尖啸: 人类战斗判定永久-10");
    }

    // Calculate damage
    let totalDmg = 0;
    const details = [];
    players.forEach((p,i) => {
      const raw = rolls[i];
      const bonus = (p.combatBonus||0);
      const effective = Math.floor((raw + bonus) * mods[i]);
      totalDmg += effective;
      details.push(`${p.name}:${raw}${bonus?`+${bonus}`:""}${mods[i]<1?`×${mods[i]}`:""}=${effective}`);
    });
    b.hp = Math.max(0, b.hp - totalDmg);
    b.log.push(`攻击: ${details.join(" ")} → 总伤害${totalDmg} 剩余HP:${b.hp}`);

    const hasOrange = players.some(p => p.items?.includes("遗失的橘子"));
    if (b.hp <= 0) {
      b.log.push("一阶段胜利！进入判定阶段——");
      b.phase = 2;
      b.timeLeft = (10 - b.round) * 60;
      if (hasOrange) { b.timeLeft += 60; b.log.push("遗失的橘子发动——时间+60秒！"); }
      b.log.push(`剩余时间: ${b.timeLeft}秒`);
    } else if (b.round >= 10) {
      b.log.push("十回合内未能击败BOSS——进入判定阶段");
      b.phase = 2;
      b.timeLeft = 60;
      if (hasOrange) { b.timeLeft += 60; b.log.push("遗失的橘子发动——时间+60秒！"); }
    }
    setBoss(b);
  };

  const doPhase2 = (success) => {
    const b = { ...boss, log: [...boss.log] };
    if (success) {
      if (boss.type === "hidden") {
        b.phase = 3;
        b.log.push("判定阶段成功！进入最终阶段——");
      } else {
        b.phase = "victory";
        b.log.push("判定阶段成功！BOSS被击败！胜利！");
      }
    } else {
      b.phase = "struggle";
      b.wounds = players.map(() => pick(WOUNDS));
      b.log.push("判定失败……进入挣扎阶段");
      b.log.push(`重伤: ${players.map((p,i)=>p.name+"-"+b.wounds[i]).join("、")}`);
    }
    setBoss(b);
  };

  const doStruggle = (success) => {
    const b = { ...boss, log: [...boss.log] };
    if (success) {
      if (boss.type === "hidden" && boss.phase === "struggle") {
        b.phase = 3;
        b.log.push("挣扎成功！进入最终阶段——");
      } else {
        b.phase = "victory";
        b.log.push("挣扎成功！BOSS被击败！");
      }
    } else {
      b.phase = "defeat";
      b.log.push("挣扎失败……暴雨吞没了一切……");
    }
    setBoss(b);
  };

  const doPhase3 = (success) => {
    const b = { ...boss, log: [...boss.log] };
    b.phase = success ? "victory" : "defeat";
    b.log.push(success ? "咒文成功！隐藏BOSS被击败！真结局！" : "咒文失败……");
    setBoss(b);
  };

  const hpPct = boss.hp / boss.maxHp * 100;
  const bossName = boss.type === "hidden" ? "神秘戈尔贡型机械体" : "陆行戈尔贡";
  const ended = boss.phase === "victory" || boss.phase === "defeat";

  return (
    <div style={{background:"#1a1210",border:`2px solid ${boss.type==="hidden"?"#a060e0":C.sRed}`,borderRadius:6,padding:12}}>
      <div style={{textAlign:"center",marginBottom:8}}>
        <div style={{fontSize:10,color:C.txtMute,letterSpacing:2}}>BOSS FIGHT</div>
        <div style={{fontSize:16,color:boss.type==="hidden"?"#c080ff":C.sGlow,fontWeight:700}}>{bossName}</div>
        {boss.type==="hidden"&&<div style={{fontSize:8,color:C.txtDim,fontStyle:"italic"}}>我不知道是谁设计的这家伙，但他一定有很多恶趣味。</div>}
      </div>

      {/* HP Bar */}
      {boss.phase===1&&(
        <div style={{marginBottom:8}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:2}}>
            <span>HP</span><span style={{color:C.sGlow}}>{boss.hp} / {boss.maxHp}</span>
            <span>回合 {boss.round}/10</span>
          </div>
          <div style={{width:"100%",height:8,background:"#2a1510",borderRadius:4,overflow:"hidden"}}>
            <div style={{width:`${hpPct}%`,height:"100%",background:`linear-gradient(90deg,#e03020,#c06020)`,borderRadius:4,transition:"width 0.3s"}}/>
          </div>
        </div>
      )}

      {/* Phase 1: Attack button */}
      {boss.phase===1&&(
        <button onClick={doRound} style={{width:"100%",padding:"8px",fontSize:13,background:C.sRed,color:"#fff",border:"none",borderRadius:4,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>
          全员攻击！（回合{boss.round+1}）
        </button>
      )}

      {/* Phase 2: Judgment */}
      {boss.phase===2&&(
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:11,color:C.gold,marginBottom:4}}>二阶段：判定挑战 · 限时{boss.timeLeft}秒</div>
          <div style={{fontSize:9,color:C.txtDim,marginBottom:6}}>四名玩家各执行一种判定（勇气/创造/逻辑/专注）</div>
          <div style={{display:"flex",gap:6,justifyContent:"center"}}>
            <button onClick={()=>doPhase2(true)} style={{padding:"6px 16px",fontSize:12,background:"#3a6a3a",color:"#fff",border:"none",borderRadius:3,cursor:"pointer",fontFamily:"inherit"}}>判定成功</button>
            <button onClick={()=>doPhase2(false)} style={{padding:"6px 16px",fontSize:12,background:"#6a2a2a",color:"#fff",border:"none",borderRadius:3,cursor:"pointer",fontFamily:"inherit"}}>判定失败</button>
          </div>
        </div>
      )}

      {/* Struggle */}
      {boss.phase==="struggle"&&(
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:11,color:"#e88060",marginBottom:4}}>挣扎阶段 · 全员重伤</div>
          <div style={{fontSize:9,color:C.txtDim,marginBottom:4}}>
            {players.map((p,i)=><div key={i}>{p.name}: 禁用{boss.wounds?.[i]}</div>)}
          </div>
          <div style={{fontSize:9,color:C.txtDim,marginBottom:6}}>在重伤状态下合作完成未完成的判定</div>
          <div style={{display:"flex",gap:6,justifyContent:"center"}}>
            <button onClick={()=>doStruggle(true)} style={{padding:"6px 16px",fontSize:12,background:"#3a6a3a",color:"#fff",border:"none",borderRadius:3,cursor:"pointer",fontFamily:"inherit"}}>挣扎成功</button>
            <button onClick={()=>doStruggle(false)} style={{padding:"6px 16px",fontSize:12,background:"#6a2a2a",color:"#fff",border:"none",borderRadius:3,cursor:"pointer",fontFamily:"inherit"}}>挣扎失败</button>
          </div>
        </div>
      )}

      {/* Phase 3: Hidden boss only */}
      {boss.phase===3&&(
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:11,color:"#c080ff",marginBottom:4}}>最终阶段：咒文</div>
          <div style={{fontSize:9,color:C.txtDim,marginBottom:4,lineHeight:1.5}}>
            四名玩家轮流说出最喜欢的角色并简述理由。<br/>
            然后每人一字接龙两圈，形成8字咒文（每次≤3秒）。<br/>
            全员齐声喊出咒文三次！
          </div>
          <div style={{display:"flex",gap:6,justifyContent:"center"}}>
            <button onClick={()=>doPhase3(true)} style={{padding:"6px 16px",fontSize:12,background:"#6a3aa0",color:"#fff",border:"none",borderRadius:3,cursor:"pointer",fontFamily:"inherit"}}>咒文成功</button>
            <button onClick={()=>doPhase3(false)} style={{padding:"6px 16px",fontSize:12,background:"#6a2a2a",color:"#fff",border:"none",borderRadius:3,cursor:"pointer",fontFamily:"inherit"}}>咒文失败</button>
          </div>
        </div>
      )}

      {/* Victory / Defeat */}
      {boss.phase==="victory"&&(
        <div style={{textAlign:"center",padding:12}}>
          <div style={{fontSize:20,color:C.goldBr,fontWeight:700}}>胜 利</div>
          <div style={{fontSize:10,color:C.txtDim,marginTop:4}}>{boss.type==="hidden"?"真结局——你们揭开了荒野的全部秘密。":"你们逃离了暴雨。"}</div>
        </div>
      )}
      {boss.phase==="defeat"&&(
        <div style={{textAlign:"center",padding:12}}>
          <div style={{fontSize:20,color:C.sGlow,fontWeight:700}}>失 败</div>
          <div style={{fontSize:10,color:C.txtDim,marginTop:4}}>暴雨吞没了一切……</div>
        </div>
      )}

      {/* Boss log */}
      <div style={{marginTop:8,maxHeight:100,overflow:"auto",background:"#100d0a",borderRadius:3,padding:6}}>
        {boss.log.slice().reverse().map((e,i)=>(
          <div key={i} style={{fontSize:9,color:i===0?C.txt:C.txtDim,padding:"1px 0"}}>{e}</div>
        ))}
      </div>
    </div>
  );
}

// ─── Car upgrade panel ───────────────────────────────────
function CarPanel({ carLevels, onUpgrade, playerRes, disabled }) {
  return (
    <div style={{display:"flex",gap:3,padding:"4px 0",flexWrap:"wrap"}}>
      {CAR_PARTS.map((part, i) => {
        const lv = carLevels[i] || 0;
        const maxed = lv >= CAR_MAX_LV;
        const canUp = playerRes >= 1 && !disabled && !maxed;
        return (
          <div key={i} style={{flex:"1 1 45%",background:C.frameLt,border:`1px solid ${maxed?C.gold:C.border}`,borderRadius:2,padding:4,textAlign:"center"}}>
            <div style={{fontSize:10}}>{part.icon}</div>
            <div style={{fontSize:8,color:maxed?C.goldBr:C.gold}}>{part.name} Lv.{lv}{maxed?" MAX":""}</div>
            {!maxed&&<div style={{fontSize:6,color:C.txtDim}}>下级: {part.desc[lv]}</div>}
            {maxed&&<div style={{fontSize:6,color:C.goldDim}}>{part.desc[5]}</div>}
            <button onClick={()=>canUp&&onUpgrade(i)} disabled={!canUp} style={{
              marginTop:2,fontSize:7,padding:"1px 4px",background:canUp?C.gold:"transparent",
              color:canUp?C.bg:C.txtMute,border:`1px solid ${canUp?C.gold:C.border}`,
              borderRadius:1,cursor:canUp?"pointer":"default",opacity:canUp?1:0.4,
            }}>{maxed?"已满级":"升级"}</button>
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
  const [treasureIdx, setTreasureIdx] = useState(0);
  const [lastCard, setLastCard] = useState(null);
  const [boss, setBoss] = useState(null);
  const [helpTokens, setHelpTokens] = useState(0);
  const [judgmentHistory, setJudgmentHistory] = useState([]);
  const [pendingJudgment, setPendingJudgment] = useState(null);
  const [autoJudge, setAutoJudge] = useState(false); // {jType, card, cell, hiddenSk} // tracks drawn judgment texts // { type, phase, hp, maxHp, round, timeLeft, log, wounds }
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

  const stormBlocked = curPlayer && curPlayer.stormConsec >= STORM_MAX_CONSECUTIVE
    && !((carLevels[0]||0) >= 6 && curPlayer.type === "mystic");

  // ─── Roll dice ─────────────────────────────────────────
  const doRoll = useCallback(() => {
    if (phase !== "roll" || gameOver) return;
    let d = Math.floor(Math.random()*10); if(d===0) d=10;
    // Tire upgrade: +1 AP
    const engineLv = carLevels[0] || 0;
    const totalAP = d + engineLv;
    setDice(d);
    const stormImmune = engineLv >= 6 && curPlayer.type === "mystic";
    const reach = getReachable(curCells, curPlayer.col, curPlayer.row, totalAP, round, curPlayer.side, stormImmune);
    setReachable(reach);
    setPhase("move");
    addLog(`${curPlayer.name} 掷骰 → ${d}${engineLv>0?` +${engineLv}引擎 = ${totalAP}`:""}`);
  }, [phase, gameOver, curCells, curPlayer, round, carLevels, addLog]);

  // ─── Start upgrade (skip roll) ─────────────────────────
  const startUpgrade = useCallback(() => {
    if (phase !== "roll" || !isOnCar || curPlayer.res < 1) return;
    setPhase("upgrade");
    addLog(`${curPlayer.name} 放弃行动，尝试升级汽车……`);
  }, [phase, isOnCar, curPlayer, addLog]);

  // ─── Judgment resolve (DM clicks pass/fail) ─────────────
  const resolveJudgment = useCallback((passed) => {
    if (!pendingJudgment) return;
    const pj = pendingJudgment;
    let bonusMsg = "";
    if (curPlayer.type === "human" && pj.drawCount >= 2) bonusMsg = " (理性：自动成功)";
    else if (curPlayer.type === "human" && pj.drawCount >= 1) bonusMsg = " (理性：+50%加时)";
    if (passed) {
      addLog(`判定成功！+1物资${bonusMsg}`);
      setPlayers(prev => { const n=[...prev]; n[curPid]={...n[curPid],res:n[curPid].res+1}; return n; });
    } else {
      addLog(`判定失败${bonusMsg}`);
    }
    setLastCard({ type:"judgment", category:pj.jType, text:pj.card, passed });
    setPendingJudgment(null);
    setPhase("resolve");
  }, [pendingJudgment, curPlayer, curPid, addLog]);

  const autoResolveJudgment = useCallback((permanent) => {
    if (!pendingJudgment) return;
    const pj = pendingJudgment;
    if (permanent) setAutoJudge(true);
    let passRate = 0.6;
    if (curPlayer.type === "human") { if (pj.drawCount >= 2) passRate = 1.0; else if (pj.drawCount >= 1) passRate = 0.8; }
    const passed = Math.random() < passRate;
    if (passed) {
      addLog(`判定自动成功！+1物资`);
      setPlayers(prev => { const n=[...prev]; n[curPid]={...n[curPid],res:n[curPid].res+1}; return n; });
    } else {
      addLog(`判定自动失败`);
    }
    setLastCard({ type:"judgment", category:pj.jType, text:pj.card, passed });
    setPendingJudgment(null);
    setPhase("resolve");
  }, [pendingJudgment, curPlayer, curPid, addLog]);

  const doUpgrade = useCallback((partIdx) => {
    const lv = carLevels[partIdx] || 0;
    if (lv >= CAR_MAX_LV) return;
    const roll = Math.floor(Math.random()*100);
    const ok = roll >= 30; // 70% success
    if (ok) {
      const newLv = lv + 1;
      // 锚点Lv1: 10% chance no resource cost
      const anchorLv = carLevels[2] || 0;
      const freeUpgrade = anchorLv >= 1 && Math.random() < 0.1;
      setCarLevels(prev => { const n=[...prev]; n[partIdx]=newLv; return n; });
      if (!freeUpgrade) {
        setPlayers(prev => { const n=[...prev]; n[curPid]={...n[curPid],res:n[curPid].res-1}; return n; });
      }
      addLog(`升级成功！${CAR_PARTS[partIdx].name} → Lv.${newLv}${freeUpgrade?" (锚点免费！)":""}`);
      // 通讯升级: 给场外援助token
      if (partIdx === 3) {
        const tokensToAdd = newLv === 6 ? 2 : 1;
        setHelpTokens(prev => prev + tokensToAdd);
        addLog(`场外援助 +${tokensToAdd} (当前${helpTokens+tokensToAdd})`);
      }
    } else {
      addLog(`升级失败。物资未消耗。`);
    }
    setPhase("resolve");
  }, [curPid, carLevels, helpTokens, addLog]);

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

        // Green sticker (judgment): pause for DM pass/fail or auto-resolve
        if (cell.sticker === "green") {
          const pick = (arr) => arr[Math.floor(Math.random()*arr.length)];
          const jType = curPlayer.type === "mystic" ? pick(["courage","creation"]) : pick(["logic","focus"]);
          const card = pick(JUDGMENTS[jType]);
          const drawCount = judgmentHistory.filter(t => t === card).length;
          const isAutoPass = curPlayer.type === "human" && drawCount >= 2;
          setJudgmentHistory(prev => [...prev, card]);
          // Remove sticker
          setBoard(prev => {
            const cells=[...prev[cell.side]];
            const idx=cells.findIndex(c=>c.col===cell.col&&c.row===cell.row);
            if(idx>=0) cells[idx]={...cells[idx],sticker:null,...(hiddenSk?{terrain:null}:{})};
            return{...prev,[cell.side]:cells};
          });
          // Auto-judge mode: resolve immediately
          if (autoJudge || isAutoPass) {
            let passRate = 0.6;
            if (curPlayer.type === "human") { if (drawCount >= 2) passRate = 1.0; else if (drawCount >= 1) passRate = 0.8; }
            const passed = Math.random() < passRate;
            addLog(`${curPlayer.name} → 物资格 → ${jType==="courage"?"勇气":jType==="creation"?"创造":jType==="logic"?"逻辑":"专注"}「${card.slice(0,12)}…」→ ${passed?"判定成功，+1物资":"判定失败"}${isAutoPass?" (理性：自动成功)":""}`);
            if (passed) setPlayers(prev => { const n=[...prev]; n[curPid]={...n[curPid],res:n[curPid].res+1}; return n; });
            setLastCard({ type:"judgment", category:jType, text:card, passed });
            setPhase("resolve");
            return;
          }
          // Manual mode: show DM panel
          addLog(`${curPlayer.name} → 物资格 → 判定挑战`);
          setPendingJudgment({ jType, card, cell, hiddenSk, drawCount, autoPass: isAutoPass });
          setPhase("judgment");
          return;
        }

        const result = resolveSticker(cell.sticker, curPlayer, carLevels, treasureIdx, judgmentHistory);
        // Track judgment draws for human 理性 ability
        if (result.drawnJudgment) setJudgmentHistory(prev => [...prev, result.drawnJudgment]);
        // 锚点Lv6: 鸡光武器 - all enemies become weak spirits (applied in resolveSticker via carLevels)
        const skName = ({green:"物资格",blue:"事件格",red:"战斗格",yellow:"宝藏格"})[cell.sticker];
        addLog(`${curPlayer.name} → ${skName} → ${result.msg}`);
        if (result.card) setLastCard(result.card);
        setPlayers(prev => {
          const n=[...prev]; const p={...n[curPid]};
          let dr = result.dr;
          // 锚点Lv3: 50% chance to block resource loss
          if (dr < 0 && (carLevels[2]||0) >= 3 && Math.random() < 0.5) {
            addLog(`锚点模块阻止了物资损失！`);
            dr = 0;
          }
          p.res = Math.max(0, p.res + dr);
          // Holdable treasures → add to inventory
          if (result.treasureCard?.holdable) {
            p.items = [...(p.items||[]), result.treasureCard.name];
            addLog(`${curPlayer.name} 获得道具「${result.treasureCard.name}」`);
          }
          if (result.combatWin && p.type === "mystic") p.combatBonus = Math.min(50, (p.combatBonus||0) + 10);
          if (result.treasure) { p.treasures = (p.treasures||0) + 1; setTreasureIdx(prev => prev + 1); }
          // Monster special effects
          if (result.fx) {
            if (result.fx.passionDr) p.combatBonus = Math.max(0, (p.combatBonus||0) + result.fx.passionDr * 10);
            if (result.fx.addItem) p.items = [...(p.items||[]), result.fx.addItem];
          }
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

    setDice(null); setReachable(null); setSel(null); setLastCard(null);
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
        const anchorLv = carLevels[2]||0;
        const raidBonus = anchorLv >= 2 ? 10 : 0;
        addLog(`突袭！难度${diff}${raidBonus>0?` (锚点+${raidBonus})`:""}`);
        setPlayers(prev => {
          const n = prev.map(p => {
            if (p.side !== "safe") return p;
            const roll = Math.floor(Math.random()*100);
            const ok = roll >= (diff - raidBonus);
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
      if (nr >= ROUNDS) {
        addLog("暴雨覆盖全域。BOSS战——");
        const isHidden = players.reduce((s,p)=>s+(p.treasures||0),0) >= 4;
        setBoss({
          type: isHidden ? "hidden" : "normal",
          phase: 1,
          hp: isHidden ? 1500 : 1000,
          maxHp: isHidden ? 1500 : 1000,
          round: 0,
          timeLeft: 0,
          log: [isHidden ? "隐藏BOSS「神秘戈尔贡型机械体」出现了！" : "BOSS「陆行戈尔贡」出现了！"],
          wounds: [],
        });
        setGameOver(true);
      }

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
    setTreasureIdx(0); setLastCard(null); setBoss(null); setHelpTokens(0); setJudgmentHistory([]); setPendingJudgment(null); setAutoJudge(false);
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
      {phase==="move"&&dice&&<Btn disabled icon={MapPin}>AP:{dice+(carLevels[0]||0)}</Btn>}
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

  const cardPanel = (lastCard && !pendingJudgment) ? <CardDisplay card={lastCard} onClose={()=>setLastCard(null)}/> : null;

  const judgmentPanel = pendingJudgment ? (
    <div style={{padding:"8px 10px",background:"#2a4a6a",border:`1px solid ${C.gold}60`,borderRadius:4,position:"relative"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <span style={{fontSize:13,color:C.goldBr,fontWeight:700,letterSpacing:1}}>物资格 · 判定挑战</span>
      </div>
      <div style={{fontSize:10,color:"#80b8e0",marginBottom:2}}>
        {pendingJudgment.jType==="courage"?"勇气":pendingJudgment.jType==="creation"?"创造":pendingJudgment.jType==="logic"?"逻辑":"专注"}
      </div>
      <div style={{fontSize:10,color:C.txt,lineHeight:1.6,marginBottom:4}}>{pendingJudgment.card}</div>
      <div style={{fontSize:8,color:C.txtDim,marginBottom:6}}>通过判定 → +1物资 · 失败 → 无物资</div>
      {pendingJudgment.autoPass ? (
        <div>
          <div style={{fontSize:9,color:C.gold,marginBottom:4}}>理性：此判定已被抽取2次，自动成功</div>
          <button onClick={()=>resolveJudgment(true)} style={{width:"100%",padding:"6px",fontSize:10,background:"#3a6a3a",color:"#fff",border:"none",borderRadius:4,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>自动成功</button>
        </div>
      ) : (
        <div>
          {pendingJudgment.drawCount===1&&curPlayer.type==="human"&&(
            <div style={{fontSize:9,color:C.gold,marginBottom:4}}>理性：此判定已被抽取1次，加时50%</div>
          )}
          <div style={{display:"flex",gap:6,marginBottom:6}}>
            <button onClick={()=>resolveJudgment(true)} style={{flex:1,padding:"6px",fontSize:10,background:"#3a6a3a",color:"#fff",border:"none",borderRadius:4,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>成功</button>
            <button onClick={()=>resolveJudgment(false)} style={{flex:1,padding:"6px",fontSize:10,background:"#6a2a2a",color:"#fff",border:"none",borderRadius:4,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>失败</button>
          </div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>autoResolveJudgment(false)} style={{flex:1,padding:"4px",fontSize:9,background:"transparent",color:C.txtDim,border:`1px solid ${C.border}`,borderRadius:3,cursor:"pointer",fontFamily:"inherit"}}>自动判定</button>
            <button onClick={()=>autoResolveJudgment(true)} style={{flex:1,padding:"4px",fontSize:9,background:"transparent",color:C.txtDim,border:`1px solid ${C.border}`,borderRadius:3,cursor:"pointer",fontFamily:"inherit"}}>自动判定（后续全部）</button>
          </div>
        </div>
      )}
    </div>
  ) : null;

  const bossPanel = boss ? <BossFightPanel boss={boss} setBoss={setBoss} players={players} addLog={addLog}/> : null;

  const playersPanel = (
    <div style={{background:C.frame,border:`1px solid ${C.border}`,borderRadius:2,padding:5}}>
      <div style={{fontSize:8,color:C.txtMute,marginBottom:3}}>PLAYERS · 宝藏 {totalTr}/4 · 援助 {helpTokens}</div>
      {players.map((p,i)=>(
        <div key={p.id} style={{fontSize:9,padding:"2px 0",borderLeft:curPid===i?`2px solid ${C.gold}`:"2px solid transparent",paddingLeft:3,opacity:curPid===i?1:0.5}}>
          <div style={{display:"flex",alignItems:"center",gap:3}}>
            <PieceIcon pid={i} size={13}/><span style={{flex:1}}>{p.name}</span>
            {p.skipNext&&<AlertTriangle size={8} color="#e88060"/>}
            {p.stormConsec>=2&&<CloudRain size={8} color="#e88060"/>}
            <span style={{color:C.txtDim,fontSize:7}}>{p.side==="wild"?"荒野":"抛锚地"} · {p.res}物资{p.treasures?` · ${p.treasures}宝`:""}{p.combatBonus?` · +${p.combatBonus}战`:""}</span>
          </div>
          {p.items?.length>0&&<div style={{fontSize:7,color:C.goldDim,paddingLeft:18}}>背包: {p.items.join("、")}</div>}
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
      {cardPanel && <div style={{marginBottom:4}}>{cardPanel}</div>}
      {judgmentPanel && <div style={{marginBottom:4}}>{judgmentPanel}</div>}
      {bossPanel && <div style={{marginBottom:4}}>{bossPanel}</div>}
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
            {phase==="move"&&dice&&<span style={{fontSize:13,color:C.txtDim,padding:"6px 12px",border:`1px solid ${C.border}`,borderRadius:3,display:"flex",alignItems:"center",gap:5}}><MapPin size={14} strokeWidth={1.5}/>AP: {dice+(carLevels[0]||0)}</span>}
            {phase==="resolve"&&<button onClick={nextTurn} style={{background:C.gold,color:C.bg,border:`1px solid ${C.gold}`,borderRadius:3,padding:"6px 16px",fontSize:13,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:5,fontWeight:700}}><ChevronRight size={15} strokeWidth={1.5}/>{turnIdx>=TURN_ORDER.length-1?"结束回合 → 缩圈":"下一位玩家"}</button>}
            {dice!=null&&<span style={{fontSize:18,color:C.gold,fontWeight:700}}>d10: {dice}</span>}
            <div style={{flex:1}}/>
            <button onClick={reset} style={{background:C.frame,color:C.txt,border:`1px solid ${C.border}`,borderRadius:3,padding:"5px 10px",fontSize:12,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:4}}><RotateCcw size={12} strokeWidth={1.5}/>重置</button>
          </div>

          {upgradePanel}

          {/* Card display */}
          {cardPanel}

          {/* Judgment DM panel */}
          {judgmentPanel}

          {/* Boss fight */}
          {bossPanel}

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
            <div style={{fontSize:11,color:C.txtMute,marginBottom:5}}>PLAYERS · 宝藏 {totalTr}/4 · 援助 {helpTokens}</div>
            {players.map((p,i)=>(
              <div key={p.id} style={{fontSize:13,padding:"4px 0",borderLeft:curPid===i?`3px solid ${C.gold}`:"3px solid transparent",paddingLeft:6,opacity:curPid===i?1:0.5}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <PieceIcon pid={i} size={16}/>
                  <span style={{flex:1}}>{p.name}</span>
                  {p.skipNext&&<AlertTriangle size={11} color="#e88060"/>}
                  {p.stormConsec>=2&&<CloudRain size={11} color="#e88060"/>}
                  <span style={{color:C.txtDim,fontSize:11}}>{p.side==="wild"?"荒野":"抛锚地"} · {p.res}物资{p.treasures?` · ${p.treasures}宝`:""}{p.combatBonus?` · +${p.combatBonus}战`:""}</span>
                </div>
                {p.items?.length>0&&<div style={{fontSize:9,color:C.goldDim,paddingLeft:22}}>背包: {p.items.join("、")}</div>}
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
