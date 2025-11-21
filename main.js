(function dialogPolyfill(){
  function attachBackdrop(dlg){
    if(dlg._bd) return;
    const bd=document.createElement('div');
    bd.className='modal-backdrop';
    bd.addEventListener('click', ()=> dlg.close());
    document.body.appendChild(bd);
    document.body.classList.add('has-modal');
    dlg._bd=bd;
  }
  function detachBackdrop(dlg){
    if(!dlg._bd) return;
    dlg._bd.remove(); dlg._bd=null;
    const anyOpen=[...document.querySelectorAll('dialog')].some(d=>d.hasAttribute('open'));
    if(!anyOpen) document.body.classList.remove('has-modal');
  }
  function ensure(){
    document.querySelectorAll('dialog').forEach(d=>{
      if(typeof d.showModal!=='function'){
        d.showModal=function(){ this.setAttribute('open',''); attachBackdrop(this); };
      }
      if(typeof d.close!=='function'){
        d.close=function(){ this.removeAttribute('open'); detachBackdrop(this); };
      }else{
        const _close=d.close.bind(d);
        d.close=function(){ try{ _close(); }catch(_){ this.removeAttribute('open'); } detachBackdrop(this); };
      }
    });
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', ensure);
  }else{
    ensure();
  }
  const mo=new MutationObserver(()=>ensure());
  mo.observe(document.documentElement,{subtree:true,childList:true});
})();

function toggleUpdateLog(){
  const body = document.querySelector('#updateLog .log-body');
  const toggle = document.getElementById('logToggle');
  if(!body || !toggle) return;
  const hidden = body.hasAttribute('hidden');
  if(hidden){
    body.removeAttribute('hidden');
    toggle.textContent = "(點擊收合)";
  }else{
    body.setAttribute('hidden','');
    toggle.textContent = "(點擊展開)";
  }
}

(function(){
    const $=s=>document.querySelector(s), LKEY="stealth_rpg_full_v4";
  const log=$("#log"), statsBox=$("#stats"), invBox=$("#inv");
  const enemyUI={name:$("#eName"),lvl:$("#eLvl"),atk:$("#eAtk"),def:$("#eDef"),hpTxt:$("#eHpTxt"),mpTxt:$("#eMpTxt"),hpBar:$("#eHpBar"),mpBar:$("#eMpBar")};

    // 「更多功能…」：選項選到後，幫忙觸發對應按鈕
  const moreMenu = $("#moreMenu");
  if(moreMenu){
    moreMenu.addEventListener("change", e=>{
      const id = e.target.value;
      if(id){
        const btn = document.getElementById(id);
        if(btn) btn.click();
        e.target.value = ""; // 用完清空，方便下次選
      }
    });
  }


  const NOW=()=>Date.now();


  /* ========= 常數與資料 ========= */
  const REBIRTH_LVL = 200;
 // 正式品階：白>綠>藍>黃>橘>紫（神器獨立）
// 品質階級：多一階「神器」
const QUALS=["白","綠","藍","黃","橘","紫","神器"];
const QUAL_CLASS=["q-white","q-green","q-blue","q-yellow","q-orange","q-purple","q-arti"];
const QUALITY_ORDER={白:0,綠:1,藍:2,黃:3,橘:4,紫:5,神器:6};


// === 低階固定素質（依「部位」分別定義，可自行調整） ===
const FIXED_LOW_TIER = {
  weapon: { // 白/綠/藍固定值
    白:{atk:2, def:0,  hp:0,  mp:0},
    綠:{atk:6, def:1,  hp:2,  mp:2},
    藍:{atk:18, def:2,  hp:4,  mp:4}
  },
  armor: {
    白:{atk:0,  def:2,  hp:5, mp:0},
    綠:{atk:0,  def:6,  hp:15, mp:2},
    藍:{atk:0,  def:18, hp:45, mp:6}
  },
  acc:{
    白:{atk:1,  def:1,  hp:3, mp:2},
    綠:{atk:3,  def:3,  hp:9, mp:6},
    藍:{atk:9,  def:9,  hp:27, mp:18}
  }
};
// === 強化規則定義 ===
// 每 +1 的素質增量
const PLUS_DELTA = {
  藍:{atk:1,  def:1,  hp:5,  mp:3},
  黃:{atk:1,  def:1,  hp:5, mp:3},
  橘:{atk:1,  def:1,  hp:5, mp:3},
  紫:{atk:1, def:1,  hp:5, mp:3},
  神器:{atk:5, def:4, hp:20, mp:12} // 神器獨立用
};

// 強化成功率（依品階、星數段）
const ENH_RATE = {
  藍:   p => (p<=5?0.70 : 0.65),
  黃:   p => (p<=5?0.60 : 0.55),
  橘:   p => (p<=5?0.50 : 0.45),
  紫:   (p,stars)=> {
    if(stars===0) return (p<=5?0.45:0.40);
    if(stars===1) return 0.40;
    if(stars===2) return 0.35;
    if(stars===3) return 0.30;
    if(stars===4) return 0.25;
    if(stars>=5)  return 0.20;
  },
  神器:(p,stars)=>{
    let base;
    if(stars===0) base = 0.35;
    if(stars===1) base = 0.30;
    if(stars===2) base = 0.25;
    if(stars===3) base = 0.20;
    if(stars===4) base = 0.15;
    if(stars>=5)  base = 0.10;
    // ㄅㄅㄐ之錘每顆 +1%
    return Math.min(0.99, base + 0.01*(game.buffs?.artiHammer||0));
  }
};

// 失敗是否掉階（以及機率）
const FAIL_BEHAVIOR = {
  藍:   ()=>({ drop:true, rate:0.20 }),                          
  黃:   ()=>({ drop:true,  rate:0.50 }),
  橘:   ()=>({ drop:true,  rate:0.70 }),
  紫:   (stars)=>({ drop:true, rate: stars===0?0.70 : [0.70,0.70,0.75,0.75,0.80][Math.min(stars,5)-1] }),
  神器:(stars)=>({ drop:true, rate: stars===0?0.80 : [0.80,0.80,0.85,0.85,0.90][Math.min(stars,5)-1] })
};

// 升級邏輯：藍/黃/橘 +10 升下一階（弱化詞條*1）；紫 +10 → 星數+1、plus歸0（最多5星）
function onReachPlusTen(inst){
  const q = inst.qual;
  if(q==="藍"){ inst.qual="黃"; inst.plus=0; addWeakAffix(inst,1); return "藍→黃"; }
  if(q==="黃"){ inst.qual="橘"; inst.plus=0; addWeakAffix(inst,1); return "黃→橘"; }
  if(q==="橘"){ inst.qual="紫"; inst.plus=0; addWeakAffix(inst,1); inst.stars=0; return "橘→紫"; }
  if(q==="紫"){
    inst.stars = Math.min(5,(inst.stars||0)+1);
    inst.plus  = 0;
    return `紫升星 → ${inst.stars}☆`;
  }
  return "";
}

// 弱化版詞條（你可在 addRandomAffix 內做弱化處理）
function addWeakAffix(inst, n=1){
  for(let i=0;i<n;i++){
    if(typeof addRandomAffix==="function"){
      addRandomAffix(inst);
    }
  }
}

  
  // =============================
// 🟣 神器命名器：依部位/武器類型生成名稱
// =============================
const ARTIFACT_NAME_LIB = {
  prefix: ["星墜","冰封","深淵","焰心","黎明","暮影","靈泉","雷紋","夢魘","寂光","白銀","蒼穹","虛空","聖裁","暗月"],
  suffix: ["的低語","之誓","的枷鎖","的迴響","之影","之祈","的斷章","的心臟","之環","之印","的祝福","的宿命"],
  base: {
    weapon: {
      blade:  ["審判長劍","斬裂之刃","白狼細劍","破曉闊劍","裁決大劍"],
      dagger: ["夜行匕首","蛇牙短刃","影縫之刺","無聲之刃","獵月短刀"],
      staff:  ["星吟法杖","霜語長杖","魂燈權杖","靈潮長杖","雷唱權杖"],
      any:    ["遺落武器"]
    },
    armor: { any: ["白狼胸甲","霜紋鎧","星砂長袍","深寒皮甲","誓約戰袍","鳶影外套","蒼星護胸"] },
    acc:   { any: ["遠旅戒","回音之環","霧語吊墜","晨星耳飾","靈印手環","蒐魂勳章","月潮項鍊"] }
  }
};
function rndPick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function artifactBaseName(slot, weapon){
  if (slot === "weapon"){
    const lib = ARTIFACT_NAME_LIB.base.weapon;
    if (weapon && lib[weapon]) return rndPick(lib[weapon]);
    return rndPick(lib.any);
  }
  if (slot === "armor") return rndPick(ARTIFACT_NAME_LIB.base.armor.any);
  return rndPick(ARTIFACT_NAME_LIB.base.acc.any);
}
function inferPrefixByContext(){
  try{
    const z = currentZone?.() || {};
    const name = (z.name || "").toString();
    if (/冰|雪|寒|霜/.test(name)) return "冰封";
    if (/深淵|黑|暗|影/.test(name)) return "暗月";
    if (/星|空|天/.test(name)) return "星墜";
    if (/火|炎|焰/.test(name)) return "焰心";
  }catch(e){}
  return rndPick(ARTIFACT_NAME_LIB.prefix);
}
function generateArtifactName(slot, weapon){
  const pre = inferPrefixByContext();
  const base = artifactBaseName(slot, weapon);
  const suf = Math.random() < 0.6 ? rndPick(ARTIFACT_NAME_LIB.suffix) : "";
  return suf ? `${pre}·${base}${suf}` : `${pre}·${base}`;
}
function ensureUniqueName(name){
  if(!window.__artifactNamePool) window.__artifactNamePool = {};
  const pool = window.__artifactNamePool;
  if(!pool[name]){ pool[name]=1; return name; }
  pool[name]++;
  const roman = [""," Ⅱ"," Ⅲ"," Ⅳ"," Ⅴ"," Ⅵ"," Ⅶ"," Ⅷ"," Ⅸ"," Ⅹ"];
  const idx = Math.min(pool[name], roman.length-1);
  return name + roman[idx];
}
//神器命名器------------------------
  
  const JOB_TREE=[
    {tier:0,key:"Novice", name:"初心者"},
    {tier:1,key:"Warrior", name:"狂刃戰將", weapon:"blade", passive:"武勇", start:["armorbreak"]},
    {tier:2,key:"Mage",    name:"星紋術士", weapon:"staff", passive:"星識", start:["fireball"]},
    {tier:3,key:"Rogue",   name:"影襲行者", weapon:"dagger", passive:"潛匿", start:["flurry"]},
    {tier:4,key:"Paladin", name:"聖光裁決", weapon:"blade", passive:"祈護", start:["smite"]},
  ];
  const JOB_WEAPON={
  Novice:["blade","staff","dagger"],
  Warrior:["blade"], 
  Mage:["staff"], 
  Rogue:["dagger"], 
  Paladin:["blade","staff","dagger"] // ✅ 最終職全武器相容
};


  // 技能
  const SKILL={
 // ===== 基礎技能：頭槌 =====
headbutt:{
    id:"headbutt",
    name:"頭槌",
    type:"主動",
    baseMp:2,
    desc:"基礎衝撞攻擊，造成略高於普通攻擊的傷害（每級提升約 4%）。",
    use(p,e,lv){
      if(!e) return false;
      const cost = this.baseMp;
      if(p.mp < cost){ say("MP 不足。"); return false; }
      p.mp -= cost;

      const effDef = effectiveEnemyDef(e,p);
      let dmg = Math.max(1, rnd(p.atk-2, p.atk+2) - effDef);

      // 等級倍率：Lv1 稍微比普攻強，之後每級再多一點
      const scale = 1.10 + 0.04 * (lv-1);   // Lv1=1.10, Lv25≈2.06
      dmg = Math.floor(dmg * scale);

      dmg = critMaybe(p, dmg);
      e.hp = clamp(e.hp - dmg, 0, e.maxhp);
      affixOnHit(p, e, dmg);
      say(`🤕 你使出<b>頭槌</b>（Lv.${lv}），造成 <span class="hp">-${dmg}</span>！`);
      return true;
    }
  },



  // ===== 戰士系：破甲斬 =====
 armorbreak:{
    id:"armorbreak",
    name:"破甲斬",
    type:"主動",
    baseMp:4,
    desc:"強力斬擊，造成約 140% 傷害，並使敵人防禦 -50% 持續 2 回合（傷害隨等級上升）。",
    use(p,e,lv){
      if(!e) return false;
      const cost=this.baseMp + lv;        // 等級越高耗魔略升
      if(p.mp < cost){ say("MP 不足。"); return false; }
      p.mp -= cost;

      const effDef = effectiveEnemyDef(e,p);
      const base = Math.max(1, rnd(p.atk-1, p.atk+3) - effDef);
      let dmg = Math.floor(base * 1.4);   // 基礎 140% 傷害

      // 等級倍率：每級額外 +2% 傷害
      const scale = 1 + 0.02 * (lv-1);
      dmg = Math.floor(dmg * scale);

      dmg = critMaybe(p, dmg);
      e.hp = clamp(e.hp - dmg, 0, e.maxhp);

      // 🔻 防禦 -50%，持續 2 回合（比原本溫和一點）
      e.defDown = 0.5;
      e.defDownTurns = 2;

      affixOnHit(p, e, dmg);
      say(`🪓 你使出<b>破甲斬</b>（Lv.${lv}），造成 <span class="hp">-${dmg}</span>，並大幅削弱敵人防禦（-50%，2 回合）。`);
      return true;
    }
  },


  // ===== 戰士系：猛擊（如果你還要留著可以保留原本的） =====
 /*
    smash:{
    id:"smash",
    name:"猛擊",
    type:"主動",
    baseMp:4,
    desc:"沉重打擊，造成 120% 左右傷害。",
    use(p,e,lv){
      if(!e) return false;
      const cost=this.baseMp + lv;
      if(p.mp < cost){ say("MP 不足。"); return false; }
      p.mp -= cost;

      const effDef = effectiveEnemyDef(e,p);
      let dmg = Math.max(1, rnd(p.atk, p.atk+4) - effDef);
      dmg = Math.floor(dmg * 1.2);
      dmg = critMaybe(p, dmg);

      e.hp = clamp(e.hp - dmg, 0, e.maxhp);
      affixOnHit(p, e, dmg);
      say(`💢 你施展<b>猛擊</b>，造成 <span class="hp">-${dmg}</span>。`);
      return true;
    }
  },
*/
  // ===== 法師系：火球術 =====
  fireball:{
    id:"fireball",
    name:"火球術",
    type:"主動",
    baseMp:6,
    desc:"投擲火球造成約 130% 傷害，並點燃敵人 3 回合（等級越高主傷與燃燒都會變強）。",
    use(p,e,lv){
      if(!e) return false;
      const cost = this.baseMp + lv;
      if(p.mp < cost){ say("MP 不足。"); return false; }
      p.mp -= cost;

      const effDef = effectiveEnemyDef(e,p);
      const base = Math.max(1, rnd(p.atk-1, p.atk+3) - effDef);
      let main = Math.floor(base * 1.3);  // 130% 主傷害

      // 等級倍率：每級 +2% 主傷與 DOT
      const scale = 1 + 0.02 * (lv-1);
      main = Math.floor(main * scale);

      main = critMaybe(p, main);
      e.hp = clamp(e.hp - main, 0, e.maxhp);

      // 🔥 燃燒 DOT：3 回合，每回合 main 的 10~20%
      const dot = Math.max(1, Math.floor(main * rnd(10,20) / 100));
      e.dot = dot;
      e.dotTurns = 3;

      affixOnHit(p, e, main);
      say(`🔥 你施放<b>火球術</b>（Lv.${lv}），造成 <span class="hp">-${main}</span>，並點燃敵人（3 回合，每回合 -${dot} HP）。`);
      return true;
    }
  },

  // ===== 盜賊系：連擊 =====
  flurry:{
    id:"flurry",
    name:"連擊",
    type:"主動",
    baseMp:5,
    desc:"三段連擊：第一段必定命中，後兩段有機率追加（每級提升總傷害約 3%）。",
    use(p,e,lv){
      if(!e) return false;
      const cost=this.baseMp + lv;
      if(p.mp < cost){ say("MP 不足。"); return false; }
      p.mp -= cost;

      const effDef = effectiveEnemyDef(e,p);
      const baseRaw = Math.max(1, rnd(p.atk-2, p.atk+2) - effDef);

      let baseTotal = 0;
      const logs = [];

      // 第一段：100% 觸發，100% 傷害
      {
        const raw1 = Math.max(1, baseRaw);
        let d1 = critMaybe(p, raw1);
        baseTotal += d1;
        logs.push(`第一段 <span class="hp">-${d1}</span>`);
      }

      // 第二段：60% 機率，70% 傷害
      if(Math.random() < 0.60){
        const raw2 = Math.max(1, Math.floor(baseRaw * 0.7));
        let d2 = critMaybe(p, raw2);
        baseTotal += d2;
        logs.push(`第二段 <span class="hp">-${d2}</span>`);
      }

      // 第三段：30% 機率，30% 傷害
      if(Math.random() < 0.30){
        const raw3 = Math.max(1, Math.floor(baseRaw * 0.3));
        let d3 = critMaybe(p, raw3);
        baseTotal += d3;
        logs.push(`第三段 <span class="hp">-${d3}</span>`);
      }

      if(baseTotal <= 0){
        say("你的連擊沒有造成傷害。");
        return true;
      }

      // 等級倍率：總傷害再乘上一層
      const scale = 1 + 0.02 * (lv-1);
      const finalTotal = Math.max(1, Math.floor(baseTotal * scale));

      e.hp = clamp(e.hp - finalTotal, 0, e.maxhp);
      affixOnHit(p, e, finalTotal);
      say(`🔺 你施展<b>連擊</b>（Lv.${lv}）！${logs.join("，")}（合計 <span class="hp">-${finalTotal}</span>）。`);
      return true;
    }
  },

    
    smite:{ id:"smite", name:"聖光制裁", type:"主動", baseMp:6, desc:"聖光重擊，對黑暗系額外傷害。",
      use:(p,e,lv)=>{if (!e) return false;  // 沒敵人就直接跳出，不要繼續執行
 const mp=6; if(p.mp<mp) return say("魔力不足。"), false;
        p.mp-=mp; const scale=1+lv*0.06; const effDef=effectiveEnemyDef(e,p); let out=Math.max(5, Math.floor((p.atk+8 - Math.floor(effDef*0.5))*scale)); if(e.tag==="dark") out=Math.floor(out*1.25);
        out=critMaybe(p,out); e.hp=clamp(e.hp-out,0,e.maxhp); affixOnHit(p,e,out); tryCombo(p,e); say(`你釋放 <b>聖光制裁</b> Lv.${lv}！<span class="hp">-${out}</span>。`); return true; } },
    
    vitality:{ id:"vitality", name:"活力", type:"被動", desc:"最大HP +10 / 等",
      passive:(p,lv)=>{ p.maxhp+=10*lv; p.hp=Math.min(p.hp+10*lv,p.maxhp);} },
    
    focus:{ id:"focus", name:"專注", type:"被動", desc:"最大MP +6 / 等",
      passive:(p,lv)=>{ p.maxmp+=6*lv; p.mp=Math.min(p.mp+6*lv,p.maxmp);} },
    
    omnislash:{ id:"omnislash", name:"奧義：萬斬", type:"奧義", baseMp:8, desc:"爆發 4~6 段大傷。",
      use:(p,e,lv)=>{if (!e) return false;  // 沒敵人就直接跳出，不要繼續執行
 const mp=8; if(p.mp<mp) return say("魔力不足。"), false;
        p.mp-=mp; let h=rnd(4,6), tot=0, scale=1+lv*0.04; for(let i=0;i<h;i++){ const effDef=effectiveEnemyDef(e,p); const d=Math.max(2,rnd(p.atk+3,p.atk+8)-Math.floor(effDef*0.6)); tot+=critMaybe(p,d); }
        tot=Math.floor(tot*scale); e.hp=clamp(e.hp-tot,0,e.maxhp); affixOnHit(p,e,tot); tryCombo(p,e); say(`你使出 <b>奧義·萬斬</b> Lv.${lv}！合計 <span class="hp">-${tot}</span>！`); return true; } }
  };
// ===【經驗加倍捲倍率】===
// 1.00 = 每層 +100%（原本行為）
// 0.50 = 每層 +50%（建議）
// 0.75 = 每層 +75% ……自行調整
const XP_SCROLL_RATE = 2.0; 

  // 物品 / 裝備 / 坐騎 / 加倍捲
  const itemDefs={
    "小治療藥水":{type:"consum",desc:"回復 20~50 HP", use:(p)=>{ const v=rnd(20,50); p.hp=clamp(p.hp+v,0,p.maxhp); say(`你使用 <b>小治療藥水</b>，回復 <b>${v} HP</b>。`);} },
    "中治療藥水":{type:"consum",desc:"回復 150~300 HP", use:(p)=>{ const v=rnd(150,300); p.hp=clamp(p.hp+v,0,p.maxhp); say(`你使用 <b>中治療藥水</b>，回復 <b>${v} HP</b>。`);} }, // [NEW]
    "大治療藥水":{type:"consum",desc:"回復 500~750 HP", use:(p)=>{ const v=rnd(500,750); p.hp=clamp(p.hp+v,0,p.maxhp); say(`你使用 <b>大治療藥水</b>，回復 <b>${v} HP</b>。`);} }, // [NEW]
    "特級治療藥水":{type:"consum",desc:"回復 50% HP", use:(p)=>{ const v=Math.ceil(p.maxhp*0.5); p.hp=clamp(p.hp+v,0,p.maxhp); say(`你使用 <b>特級治療藥水</b>，回復 <b>${v} HP</b>。`);} }, // [NEW]
    "小魔力藥水":{type:"consum",desc:"回復 20~50 MP",  use:(p)=>{ const v=rnd(20,50); p.mp=clamp(p.mp+v,0,p.maxmp); say(`你使用 <b>小魔力藥水</b>，回復 <b>${v} MP</b>。`);} },
    "中魔力藥水":{type:"consum",desc:"回復 150~300 MP", use:(p)=>{ const v=rnd(150,300); p.mp=clamp(p.mp+v,0,p.maxmp); say(`你使用 <b>中魔力藥水</b>，回復 <b>${v} MP</b>。`);} },
    "大魔力藥水":{type:"consum",desc:"回復 500~750 MP", use:(p)=>{ const v=rnd(500,750); p.mp=clamp(p.mp+v,0,p.maxmp); say(`你使用 <b>大魔力藥水</b>，回復 <b>${v} MP</b>。`);} },
    "特級魔力藥水":{type:"consum",desc:"回復 50% MP", use:(p)=>{ const v=Math.ceil(p.maxmp*0.5); p.mp=clamp(p.mp+v,0,p.maxmp); say(`你使用 <b>特級魔力藥水</b>，回復 <b>${v} MP</b>。`);} },
        "任務藥水": {
      type:"consum",
      desc:"任務專用道具，可交付給任務換取報酬。",
      use:(p)=>{
        // 可以選擇「不能直接喝」，只做提示
        say("這是一瓶任務藥水，請交給相關任務使用。");
      }
    },

    "煙霧彈":{type:"consum",desc:"戰鬥中嘗試脫離",  use:(p,e,inBattle)=>{ if(inBattle){ say("你投擲了煙霧彈！你逃離了戰鬥。"); endBattle(false); } else { say("你在空地放了煙……好像有點招搖。"); } }},
    "經驗加倍捲":{type:"consum",desc:"5 日內經驗 +100%，可疊加", use:(p)=>{ addXpBuff(5); say(`📜 使用 <b>經驗加倍捲</b>：5 日加倍生效（目前層數 ${activeXpBuffs()}）。`);} }, // [NEW]
    "技能書：活力":{type:"book", skill:"vitality"},
    "技能書：專注":{type:"book", skill:"focus"},
    "技能書：火球術":{type:"book", skill:"fireball"},
    "技能書：連擊":{type:"book", skill:"flurry"},
    "技能書：破甲斬":{type:"book", skill:"armorbreak"},
  //  "技能書：猛擊":{type:"book", skill:"armorbreak"},
    "秘傳：萬斬":{type:"book", skill:"omnislash"},
    "ㄅㄅㄐ之錘":{type:"consum",desc:"本次神器強化每使用1槌 +1% 成功率（可疊加，強化後歸零）。",use:(p)=>{if(!game.buffs) game.buffs={xpLayers:[],artiHammer:0};game.buffs.artiHammer = (game.buffs.artiHammer||0) + 1;
    decInv("ㄅㄅㄐ之錘",1);
    say(`🔧 你使用了 ㄅㄅㄐ之錘，神器強化成功率加成：+${game.buffs.artiHammer}%`);
  }
},
"錢袋": {
  type:"consum",
  desc:"打開可獲得隨機 100～2000 金幣。",
  use:(p)=>{
    if(!game || !game.player) return;
    const g = rnd(100,2000);           // 隨機 100~2000
    game.player.gold += g;             // 加到玩家金幣
    decInv("錢袋",1);                  // 背包扣一個錢袋
    say(`💰 你打開了 <b>錢袋</b>，從 <b>100～2000</b> G 中抽中 <b>${g}</b> G！`);
    render();
    autosave();
  }
},

  };

  const EQUIPS={
    "木劍":{slot:"weapon", weapon:"blade", qual:"白", atk:2, def:0, hp:2, mp:0},
    "法杖":{slot:"weapon", weapon:"staff", qual:"白", atk:2, def:0, hp:0, mp:5},
    "匕首":{slot:"weapon", weapon:"dagger",qual:"白", atk:2, def:0, hp:1, mp:1},
    "皮甲":{slot:"armor",  qual:"白", atk:0, def:1, hp:5, mp:2},
    "學者斗篷":{slot:"armor",qual:"白", atk:0, def:1, hp:2, mp:8},
    "幸運戒指":{slot:"acc", qual:"白", atk:1, def:1, hp:1, mp:1},
  };

const MOUNTS={
  // 商店坐騎（保留）
  "戰馬": { atk:20,  def:20,  hp:500,  mp:500,  spd:12, desc:"穩健耐跑，提供少量四圍＋移動效率" },

  // ⬇⬇⬇ Boss 專屬坐騎（對應 bossMountName(name) => `${name}坐騎`）⬇⬇⬇
  "火龍坐騎":   { atk:200, def:20,  hp:500, mp:500,  spd:14, desc:"炙熱怒焰，偏攻擊與少量速度" },
  "暴雪巨靈坐騎": { atk:100,  def:200, hp:2500, mp:500,  spd:12, desc:"寒霜壁障，偏防禦與耐久" },
  "深淵之眼坐騎": { atk:300,  def:100,  hp:1200, mp:1000,  spd:15, desc:"暗潮凝視，兼顧攻擊與高 MP，速度略快" },
  "星墜魔像坐騎": { atk:100,  def:500, hp:4000, mp:500,  spd:10, desc:"星核重鎧，極高防禦與血量，偏慢" },
  "終末領主坐騎": { atk:10000, def:1000, hp:3000, mp:1000, spd:16, desc:"終焉權威，全面強化；最稀有" }
};



  // 商店目錄
  const shopCatalog=[
    {name:"小治療藥水",type:"consum",price:8},
    {name:"小魔力藥水",type:"consum",price:10},
    {name:"煙霧彈",type:"consum",price:15},
    {name:"經驗加倍捲",type:"consum",price:100}, // [NEW]
    {name:"木劍",type:"equip",price:20},
    {name:"皮甲",type:"equip",price:22},
    {name:"法杖",type:"equip",price:26},
    {name:"匕首",type:"equip",price:18},
    {name:"學者斗篷",type:"equip",price:24},
    {name:"幸運戒指",type:"equip",price:30},
    {name:"戰馬",type:"mount",price:10000},
  ];

   // 💰 全局金幣倍率：1 = 原本數字，4 = 四倍金幣
  const GOLD_RATE = 10;
  // ⭐ 全局經驗倍率：1 = 原本數字，2 = 兩倍經驗，0.5 = 半倍經驗
  const EXP_RATE = 1;
  
  const CLASS_REQ=[10,30,70,120];
  const zones = buildZones();
  function monsterTemplate(lvl,labelTag=""){ return {
    hp: Math.round(18 + lvl*3.2),
    mp: Math.round(lvl*0.6),
    atk: Math.round(4 + lvl*0.9),
    def: Math.round(1 + lvl*0.5),
  //  gold:[3+Math.floor(lvl*0.6), 6+Math.floor(lvl*1.0)],
        gold:[
      Math.round((3+Math.floor(lvl*0.6)) * GOLD_RATE),
      Math.round((6+Math.floor(lvl*1.0)) * GOLD_RATE)],
    exp:[10+Math.floor(lvl*1.8), 18+Math.floor(lvl*2.6)],
    drops: baseDropsForLevel(lvl,labelTag),
    tag: labelTag
  };}

 

 function baseDropsForLevel(lvl,tag){
  const base = [
    {item:"技能書：活力",rate:0.00},//技能書掉落率
    {item:"技能書：專注",rate:0.00},
    {item:"技能書：火球術",rate:0.04},
    {item:"技能書：連擊",rate:0.04},
    {item:"技能書：破甲斬",rate:0.04},   // ★ 新增這行
//    {item:"技能書：猛擊",rate:0.04},
  ];

  // 🔻 基本藥水依等級分配（最高到「高級」）
  if(lvl <= 30){
    // 新手區：小藥水
    base.push(
      {item:"小治療藥水",rate:0.14},
      {item:"小魔力藥水",rate:0.12}
    );
  } else if(lvl <= 60){
    // 中期：中藥水
    base.push(
      {item:"中治療藥水",rate:0.14},
      {item:"中魔力藥水",rate:0.12}
    );
  } else if(lvl <= 90){
    // 後期：大藥水
    base.push(
      {item:"大治療藥水",rate:0.14},
      {item:"大魔力藥水",rate:0.12}
    );
  } else {
    // 高等地圖：高級藥水（最高掉到這一階）
    base.push(
      {item:"高級治療藥水",rate:0.14},
      {item:"高級魔力藥水",rate:0.12}
    );
  }

  // 任務藥水：掉落表先寫進去，實際掉不掉交給 handleDrops() 判斷有沒有任務
  base.push(
    {item:"任務藥水", rate:0.12}
  );

  // 低等區域白裝掉落（1~30 等）
  if(lvl<=30){
    base.push(
      {equip:"木劍",rate:0.05},
      {equip:"皮甲",rate:0.05},
      {equip:"法杖",rate:0.03},
      {equip:"匕首",rate:0.04},
      {equip:"學者斗篷",rate:0.03},
      {equip:"幸運戒指",rate:0.03}
    );
  }

  // Boss / Mimic 額外掉落
  if(tag==="boss" || tag==="mimic"){
    base.push({item:"秘傳：萬斬",rate:0.08});
  }

  return base;
}

  /* ========= 狀態 ========= */

  const game = {
    player:{
  name:"你", job:"Novice", tier:0, lvl:1, exp:0,
  hp:32, mp:12, atk:6, def:5, maxhp:32, maxmp:12,
  gold:200, afk:false, lastTick:0,
    equip:{weapon:null,armor:null,acc:null,mount:null},
    learned:{"headbutt":1},   // 初始只會頭槌
    activeSkill:"headbutt",
    skillQual:{},
    passiveKills:{}
,
  rebirths: 0   // ← 新增：已轉生次數
},

      inv:{ 
    "小治療藥水":10, 
    "小魔力藥水":10, 
    "煙霧彈":1,
   },
    state:{ inBattle:false, enemy:null, kills:{}, zoneId:"z-01", day:1 },
    quests:[], shop:{stock:[]},
    buffs:{ xpLayers:[] } // 多層加倍，每層為剩餘日數
  };

  /* ========= 工具 ========= */
// ─────────────────────────────
// 分類標籤：武器/防具/飾品/坐騎/技能書/消耗品
// ─────────────────────────────
const SLOT_TAG = { weapon:"武器", armor:"防具", acc:"飾品", mount:"坐騎" };

function categoryTagForKey(k){
  // 裝備實體（E#...）
  if(k.startsWith("E#")){
    const inst = getEquipInstance(k);
    if(!inst) return `<span class="cat">[裝備]</span>`;
    const lab = SLOT_TAG[inst.slot] || "裝備";
    return `<span class="cat cat-${inst.slot}">[${lab}]</span>`;
  }
  // 坐騎實體（M#...）
  if(k.startsWith("M#")){
    return `<span class="cat cat-mount">[坐騎]</span>`;
  }
  // 一般物品：判斷技能書，其餘當消耗品
  const n = k || "";
  const defType = itemDefs?.[n]?.type;
  const isBook =
    defType === "book" ||
    defType === "skillbook" ||
    n.includes("技能書") ||
    n.startsWith("秘傳：");
  if(isBook) return `<span class="cat cat-book">[技能書]</span>`;
  return `<span class="cat cat-consum">[消耗品]</span>`;
}


// （可選）把「技能書：活力」這種名稱清成「活力」
function cleanBookName(n){ return n.replace(/^技能書[:：]\s*/,''); }


  
  // 可 2 合 1 的藥水鏈（治療 & 魔力）
const POTION_CHAINS = [
  ["小治療藥水","中治療藥水","大治療藥水","特級治療藥水"],
  ["小魔力藥水","中魔力藥水","大魔力藥水","特級魔力藥水"],
];
// ===== 自動用藥參數（可自行調整） =====
const AUTO_POTION = {
  hp: { threshold: 0.60, minMissing: 10, cooldownMs: 800 },  // 低於60%且至少少10HP才喝
  mp: { threshold: 0.35, minMissing: 8,  cooldownMs: 800 }   // 低於35%且至少少8MP才喝
};

// ✅ 自動治療（HP）
function autoUseHeal(){
  const p = game.player, inv = game.inv || {};
  if(!p || p.maxhp<=0) return false;

  // 滿血、缺血不足、不在冷卻 → 直接退出
  const missing = p.maxhp - p.hp;
  if(missing <= 0) return false;
  if(missing < AUTO_POTION.hp.minMissing) return false;

  const now = Date.now();
  if(p._healCD && now - p._healCD < AUTO_POTION.hp.cooldownMs) return false;

  const hpRate = p.hp / p.maxhp;
  if(hpRate >= AUTO_POTION.hp.threshold) return false;

  // 依血量挑藥：特→大→中→小
  const tryList =
    hpRate < 0.20 ? ["特級治療藥水","大治療藥水","中治療藥水","小治療藥水"] :
    hpRate < 0.40 ? ["大治療藥水","中治療藥水","小治療藥水"] :
                    ["中治療藥水","小治療藥水"];

  for(const name of tryList){
    if((inv[name]||0) > 0){
      const used = useItem(name);      // 需搭配B段的useItem回傳布林
      if(used){ p._healCD = Date.now(); return true; }
    }
  }
  return false;
}

// ✅ 自動回魔（MP）
function autoUseMana(){
  const p = game.player, inv = game.inv || {};
  if(!p || p.maxmp<=0) return false;

  const missing = p.maxmp - p.mp;
  if(missing <= 0) return false;
  if(missing < AUTO_POTION.mp.minMissing) return false;

  const now = Date.now();
  if(p._manaCD && now - p._manaCD < AUTO_POTION.mp.cooldownMs) return false;

  const mpRate = p.mp / p.maxmp;
  if(mpRate >= AUTO_POTION.mp.threshold) return false;

  const tryList =
    mpRate < 0.20 ? ["特級魔力藥水","大魔力藥水","中魔力藥水","小魔力藥水"] :
    mpRate < 0.40 ? ["大魔力藥水","中魔力藥水","小魔力藥水"] :
                    ["中魔力藥水","小魔力藥水"];

  for(const name of tryList){
    if((inv[name]||0) > 0){
      const used = useItem(name);
      if(used){ p._manaCD = Date.now(); return true; }
    }
  }
  return false;
}

  
  
// 回傳下一級藥水名稱；若不在任何鏈或已到頂，回傳 null
function nextPotionName(name){
  for(const chain of POTION_CHAINS){
    const idx = chain.indexOf(name);
    if(idx>=0) return (idx<chain.length-1) ? chain[idx+1] : null;
  }
  return null;
}

  const rnd=(n,m)=>Math.floor(Math.random()*(m-n+1))+n;
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

  const LOG_MAX_KEEP = 400;      // 觸發修剪的上限
  const LOG_TRIM_TARGET = 300;   // 修剪後保留的目標行數

  function trimLog(){
    const count = log.childElementCount;
    if(count <= LOG_MAX_KEEP) return;

    const remove = Math.max(0, count - LOG_TRIM_TARGET);
    for(let i=0; i<remove; i++){
      const first = log.firstChild;
      if(!first) break;
      log.removeChild(first);
    }
  }

  function appendLog(html, {save=true} = {}){
    const p=document.createElement("p");
    p.innerHTML=html;
    log.appendChild(p);
    trimLog();
    log.scrollTop=log.scrollHeight;
    if(save) autosave();
  }

  const say=html=> appendLog(html);
/* ================2合1藥水鏈=============== */
  /* =============================== */
  /* [ADD] 全域錯誤寫入冒險日誌（排錯用） */
  /* =============================== */
  window.addEventListener('error', e=>{
    try{ appendLog(`⚠️ <b>腳本錯誤</b>：${e.message}`, {save:false}); }catch(_){}
  });

  const colorQual=(q)=> QUAL_CLASS[QUALITY_ORDER[q]||0]||"";
  const fmtQual=(q,txt)=>`<span class="${colorQual(q)}">${txt}</span>`;
  const fmtItem=(name,qual)=> qual ? fmtQual(qual,qualName(name,qual)) : name;
  const qualName=(name,qual)=> qual==="神器" ? `[神器☆${name}]` : name;
// ★ 品質文字旁顯示星數（紫／神器）
function qualWithStars(inst){
  const s = inst.stars || 0;
  const q = inst.qual;
  if(q === "紫" || q === "神器"){
    return `${fmtQual(q, q)}${s ? ` <span class="star">${s}☆</span>` : ""}`;
  }
  return fmtQual(q, q);
}

  // 裝備詞條
   // 裝備詞條
  const AFFIX_LIB=[
    // 吸血：改成「依這次傷害的 2~4%」，不會回太多，但後期也不至於廢
    {key:"lifesteal", name:"吸血",  desc:"回復已造成傷害的 2~4%",  min:2,  max:4},

    // 中毒：改成「每回合吃玩家攻擊 10~18%」，至少 3 回合
    {key:"poison",    name:"中毒",  desc:"每回合造成攻擊 10~18% 傷害（三回合）", min:10, max:18},

    // 爆擊：維持 +5% 就好，穩定但不逆天
    {key:"crit",      name:"爆擊",  desc:"暴擊率 +5%", min:5,  max:5},

    // 連擊：觸發率從 25% 降到 15%，而且只吃大約 7 成傷害
    {key:"combo",     name:"連擊",  desc:"15% 觸發 7 成傷害的追加打擊", min:15, max:15},

    // 破甲：維持敵防 -20%，當作一個穩定輸出詞條
    {key:"shred",     name:"破甲",  desc:"計算傷害時敵防 -20%", min:20, max:20},
  ];


  function autosave(){
    try{
      // 一併存入裝備／坐騎資料庫，避免重載後顯示 E# 原字串
      game._eqdb = EQUIP_DB;
      game._mddb = MOUNT_DB;
      localStorage.setItem(LKEY, JSON.stringify(game));
    }catch(e){}
  }
  function load(){
    try{
      const raw=localStorage.getItem(LKEY);
      if(raw){
        const data=JSON.parse(raw);
        Object.assign(game.player, data.player||{});
        game.inv=data.inv||game.inv;
        game.state={...game.state, ...(data.state||{})};
                // 任務：舊存檔兼容＆新格式初始化
        game.quests=data.quests||[];
        if(!Array.isArray(game.quests)) game.quests=[];
        // 如果是舊版存檔（沒有 type），或根本沒任務，就用新系統重建
        if(game.quests.length===0 || !game.quests[0].type){
          seedQuests();
        }
        game.shop=data.shop||{stock:[]};
        game.buffs=data.buffs||{xpLayers:[]};
        // 反序列化 DB
        Object.assign(EQUIP_DB, data._eqdb||{});
        Object.assign(MOUNT_DB, data._mddb||{});
        recomputeStats(true);
      } else {
        seedQuests();
      }
    }catch(e){}
  }

  /* ========= 任務資料表 ========= */
  const QUEST_DB = [
    {
      id:"Q_KILL_01",
      type:"killAny",
      minLvl:1,
      name:"新手訓練：擊敗 20 隻怪物",
      desc:"在任何地區擊敗 20 隻怪物，熟悉戰鬥節奏。",
      req:{ killAny:20 },
      reward:{ exp:200, gold:150 }
    },
    {
      id:"Q_KILL_02",
      type:"killAny",
      minLvl:20,
      name:"熟練冒險者：擊敗 50 隻怪物",
      desc:"持續戰鬥，讓自己成為更可靠的主力。",
      req:{ killAny:50 },
      reward:{ exp:600, gold:500, item:"錢袋", itemCount:1 }
    },
    {
      id:"Q_ITEM_POTION",
      type:"submitItem",
      minLvl:10,
      name:"物資補給：交付任務藥水 5 瓶",
      desc:"任務小隊需要補給，收集 5 瓶任務藥水交付。",
      req:{ submitItems:{ "任務藥水":5 } },
      reward:{ exp:250, gold:300 }
    },
    {
      id:"Q_EQUIP_GREEN",
      type:"submitEquip",
      minLvl:15,
      name:"裝備回收：交出 3 件綠裝",
      desc:"把不用的綠裝回收，換取一些實用資源。",
      req:{ submitEquip:{ green:3 } },
      reward:{ exp:300, gold:400 }
    },
    {
      id:"Q_EQUIP_BLUE",
      type:"submitEquip",
      minLvl:30,
      name:"精良裝備整理：交出 2 件藍裝",
      desc:"整理多餘的藍裝，讓鐵匠鋪回收再利用。",
      req:{ submitEquip:{ blue:2 } },
      reward:{ exp:800, gold:800, item:"錢袋", itemCount:2 }
    }
  ];

  function seedQuests(){
    const lvl = game.player?.lvl || 1;
    game.quests = QUEST_DB.map(def=>({
      id: def.id,
      type: def.type,
      minLvl: def.minLvl || 1,
      name: def.name,
      desc: def.desc,
      req: JSON.parse(JSON.stringify(def.req || {})),
      reward: { ...(def.reward || {}) },
      state: (lvl >= (def.minLvl || 1)) ? "available" : "locked",
      progress: {}
    }));
    // 依目前等級刷新一次可接受狀態
    refreshQuestsForLevel(lvl);
  }

  /* ========= 地圖生成 ========= */
  function buildZones(){
    const out=[];
    for(let a=1;a<=200;a+=10){
      const b=Math.min(200,a+9);
      const id = "z-"+String(Math.ceil(a/10)).padStart(2,"0");
      out.push({
        id, name:`Lv${a}-${b} 區域 ${Math.ceil(a/10)}`, lvlReq:a, suggest:[a,b], danger:Math.ceil(a/10),
        type:"field", boss:false, hidden:false, pool: basicMonstersForBand(a,b)
      });
    }
    const hiddenTiers=[1,2,3,4];
    hiddenTiers.forEach((t,i)=>{
      const idH="h-"+(i+1);
      out.push({ id:idH, name:`【隱藏】暗影祕徑 T${t}`, lvlReq: CLASS_REQ[i], suggest:[CLASS_REQ[i], CLASS_REQ[i]+9], danger:8+i,
        type:"hidden", boss:false, hidden:true, pool: specialHiddenPool(CLASS_REQ[i]) });
      const idB="b-"+(i+1);
      out.push({ id:idB, name:`【Boss】階段守衛 T${t}`, lvlReq: CLASS_REQ[i], suggest:[CLASS_REQ[i], CLASS_REQ[i]+10], danger:10+i,
        type:"boss", boss:true, hidden:false, pool: bossPoolForTier(t) });
    });
    out.push({ id:"b-omega", name:"【Boss】終末領主", lvlReq:160, suggest:[180,200], danger:15, type:"boss", boss:true, hidden:false, pool: bossPoolForTier(5,true) });
    return out;
  }
  function basicMonstersForBand(a,b){
    const lv = Math.floor((a+b)/2);
    const names=["史萊姆","哥布林","巨鼠","蝙蝠群","樹精碎枝","石像鬼"];
    return names.map(n=>({ name:n, base:monsterTemplate(lv,""), isBoss:false }));
  }
  function specialHiddenPool(baseLvl){
    const names=["幽魂","秘紋寶箱怪","遺跡守衛"];
    return names.map(n=>({ name:n, base:monsterTemplate(baseLvl+5, n==="幽魂"?"dark":""), isBoss:false }));
  }
// Boss 掉落表（含神器碎片）
function bossPoolForTier(t,isFinal=false){
  const tbl=[["火龍"],["暴雪巨靈"],["深淵之眼"],["星墜魔像"],["終末領主"]];
  const name = isFinal ? "終末領主" : tbl[t-1][0];

  const baseLvl = t===1 ? 12 :
                  t===2 ? 35 :
                  t===3 ? 72 :
                  t===4 ? 125 : 190;

  const base = monsterTemplate(baseLvl,"boss");
  base.hp  = Math.round(base.hp*3.5);
  base.atk = Math.round(base.atk*1.6);
  base.def = Math.round(base.def*1.4);

  // 🐎 坐騎掉落
  base.drops.push({ mount: bossMountName(name), rate:0.01 });

  // 🧩 神器碎片（每種 Boss 一種碎片，5 片合成隨機該 Boss 神器）
  // 👉 rate = 0.05 = 5%
  base.drops.push({ artifactBoss: name, rate:0.05 });

  // 🔧 ㄅㄅㄐ之錘：Boss 額外 10% 掉落（搭配全地圖 1% 稀有）
  base.drops.push({ item:"ㄅㄅㄐ之錘", rate:0.10 });

  // 📜 萬斬
  base.drops.push({ item:"秘傳：萬斬", rate:0.05 });

  return [{ name, base, isBoss:true }];
}

function bossMountName(name){ return `${name}坐騎`; }
// bossArtifactName 目前不用了，保留也沒關係
//function bossArtifactName(name){ return `${name}之核`; }


  /* ========= 角色計算 ========= */
// === 白板核心設定（職業底值 + 等級成長 + 轉職/轉生倍率 + 被動） ===

// 1) 職業底值（不穿裝、不吃技能）——可依你遊戲職業調
const JOB_BASE = {
  Novice: { atk: 6,  def: 2,  hp: 32, mp: 12 },
  Warrior:{ atk: 9,  def: 4,  hp: 40, mp: 10 },
  Rogue:  { atk: 10, def: 3,  hp: 34, mp: 12 },
  Mage:   { atk: 5,  def: 2,  hp: 28, mp: 18 },
  Priest: { atk: 6,  def: 3,  hp: 30, mp: 20 }
};

// 2) 等級成長（白板）——只加在白板階段
function levelGrowth(lvl){
  return {
    atk: 2 * (lvl - 1),
    def: 1 * (lvl - 1),
    hp:  5 * (lvl - 1),
    mp:  3 * (lvl - 1)
  };
}

// 3) 轉職/轉生倍率：只吃白板（不要乘到裝備）
function tierMultiplier(tier){ return 1 + 0.005 * (tier||0); }   // 每轉 +2%
function rebirthMultiplier(r){ return 1 + 0.20 * (r||0); }       // 每轉生 +10%

// 4) 被動（白板層）——如需更強可在此讀 p.learned 決定加法/乘法
function passiveFromSkills(p){
  return { add:{atk:0,def:0,hp:0,mp:0}, mul:{atk:0,def:0,hp:0,mp:0} };
}
  
function recomputeStats(applyPassives=false){
  const p = game.player;

  // （A）白板：職業底值 + 等級成長
  const jb = JOB_BASE[p.job] || JOB_BASE.Novice;
  const lg = levelGrowth(p.lvl||1);
  let core = {
    atk: (jb.atk||0) + lg.atk,
    def: (jb.def||0) + lg.def,
    hp:  (jb.hp ||0) + lg.hp,
    mp:  (jb.mp ||0) + lg.mp
  };

  // （B）轉職/轉生：只吃白板
  const mulTier = tierMultiplier(p.tier||0);
  const mulReb  = rebirthMultiplier(p.rebirths||0);
  core.atk = Math.floor(core.atk * mulTier * mulReb);
  core.def = Math.floor(core.def * mulTier * mulReb);
  core.hp  = Math.floor(core.hp  * mulTier * mulReb);
  core.mp  = Math.floor(core.mp  * mulTier * mulReb);

  // （C）職業獎勵（你原本的 p.jobBonus 參數）——也只乘在白板
  if (game.player.jobBonus){
    const jbMul = game.player.jobBonus; // 內容是「加多少倍率」，如 1.10 表「+110%」→ 這裡當作 1.10 使用
    core.hp  = Math.floor(core.hp  * (1 + (jbMul.hp  || 0)));
    core.mp  = Math.floor(core.mp  * (1 + (jbMul.mp  || 0)));
    core.atk = Math.floor(core.atk * (1 + (jbMul.atk || 0)));
    core.def = Math.floor(core.def * (1 + (jbMul.def || 0)));
  }

  // （D）被動技能（白板層）
  const pas = passiveFromSkills(p);
  core.atk = Math.floor( (core.atk + (pas.add.atk||0)) * (1 + (pas.mul.atk||0)) );
  core.def = Math.floor( (core.def + (pas.add.def||0)) * (1 + (pas.mul.def||0)) );
  core.hp  = Math.floor( (core.hp  + (pas.add.hp ||0)) * (1 + (pas.mul.hp ||0)) );
  core.mp  = Math.floor( (core.mp  + (pas.add.mp ||0)) * (1 + (pas.mul.mp ||0)) );

  // （E）最後才把裝備/坐騎的屬性疊上去
  let addHp=0, addMp=0, addAtk=0, addDef=0;
  ["weapon","armor","acc"].forEach(slot=>{
    const n = p.equip[slot];
    if(!n) return;
    const inst = getEquipInstance(n);
    if(inst){ addHp+=inst.hp||0; addMp+=inst.mp||0; addAtk+=inst.atk||0; addDef+=inst.def||0; }
  });
  const mid = p.equip.mount;
  if(mid){
    const m = getMountInstance(mid);
    if(m){ addHp+=m.hp||0; addMp+=m.mp||0; addAtk+=m.atk||0; addDef+=m.def||0; }
  }

  // 依舊 HP/MP 百分比過渡（避免突滿或見底）
  const prevMaxHp = p.maxhp||1, prevMaxMp = p.maxmp||1;
  const hpRate = Math.max(0, Math.min(1, (p.hp||prevMaxHp) / prevMaxHp ));
  const mpRate = Math.max(0, Math.min(1, (p.mp||prevMaxMp) / prevMaxMp ));

   p.maxhp = Math.max(1, core.hp + addHp);
  p.maxmp = Math.max(0, core.mp + addMp);
  p.atk   = Math.max(0, core.atk + addAtk);
  p.def   = Math.max(0, core.def + addDef);

  // 數值上限：避免攻擊、防禦、HP/MP 膨脹到失控
  const CAP_ATK = 50000, CAP_DEF = 50000, CAP_HP = 80000, CAP_MP = 50000;
  p.atk   = Math.min(p.atk,   CAP_ATK);
  p.def   = Math.min(p.def,   CAP_DEF);
  p.maxhp = Math.min(p.maxhp, CAP_HP);
  p.maxmp = Math.min(p.maxmp, CAP_MP);

  p.hp = clamp(Math.floor(p.maxhp * hpRate), 1, p.maxhp);
  p.mp = clamp(Math.floor(p.maxmp * mpRate), 0, p.maxmp);

  // （F）如需把坐騎移速記到玩家上（未來可用）
  p.spdFromMount = 0; // 先不計算移速（你的移速邏輯可之後接）
}



  function expNeedForLevel(lvl){
    let base = Math.floor(20 + Math.pow(lvl, 1.4)*3);
    const tier = game.player.tier || 0;
    base = base * Math.max(1, Math.pow(2, tier));
    return base;
  }

  /* ========= Render ========= */
  function render(){
    const p=game.player, z=currentZone();
    const hpPct = Math.round((p.hp / p.maxhp) * 100);
    const mpPct = Math.round((p.mp / p.maxmp) * 100);
    $("#shopGold").textContent=p.gold;
    $("#zoneName").textContent = `${z.name}`;
    $("#activeSkillName").textContent = skillNameWithLv(p.activeSkill);
    statsBox.innerHTML=`
    <div class="stat hp">HP：${p.hp} / ${p.maxhp} <span class="pct ${hpPct<=35?'low':hpPct<=60?'mid':''}">（${hpPct}%）</span></div>
    <div class="stat mp">MP：${p.mp} / ${p.maxmp} <span class="pct ${mpPct<=25?'low':mpPct<=60?'mid':''}">（${mpPct}%）</span></div>
      <div class="stat atk">攻擊：${p.atk}</div>
      <div class="stat def">防禦：${p.def}</div>
      <div class="stat lvl">等級：${p.lvl}（EXP ${p.exp}/${expNeedForLevel(p.lvl)}）</div>
      <div class="stat gold">金幣：${p.gold}｜職業：${jobName(p.job)}（${p.tier}轉）｜轉生：${p.rebirths||0} 次｜日數：${game.state.day}｜經驗加倍層數：${activeXpBuffs()}</div>
    `;
    // 背包（快速預覽）
    if(invBox){
      const keys = Object.keys(game.inv).filter(k => (game.inv[k]||0) > 0);

      if(keys.length === 0){
        invBox.innerHTML = `<span class="pill muted">（空）</span>`;
      }else{
        invBox.innerHTML = "";

        // 先把背包內容轉成「含類型資訊」的陣列，準備排序
        const entries = keys.map(name=>{
          const meta = invMeta(name);
          let typeOrder =
            meta.type === "consum" ? 0 :   // 消耗品
            meta.type === "book"  ? 1 :   // 技能書
            meta.type === "equip" ? 2 :   // 裝備
            meta.type === "mount" ? 3 :   // 坐騎
                                      4;  // 其他
          return { name, meta, typeOrder };
        }).sort((a,b)=>{
          // 先比類型優先順序
          if(a.typeOrder !== b.typeOrder) return a.typeOrder - b.typeOrder;
          // 同類型再比名稱（你之後想改成照品質也可以調這裡）
          return a.name.localeCompare(b.name, "zh-Hant");
        });

        // 只顯示前 12 個（避免太擠）
        entries.slice(0,12).forEach(({name, meta})=>{
          const pill = document.createElement("button");
          pill.type = "button";
          pill.className = "pill";

          // 顯示「分類 + 名稱 + 數量」
          pill.innerHTML = `${displayInvName(name)} × ${game.inv[name]}`;

          if(meta.type === "consum"){
            // 消耗品：可以直接點擊使用
            pill.classList.add("clickable");
            pill.onclick = ()=>{
              useItem(name);
            };
          }else{
            // 其他（裝備 / 坐騎 / 雜物）：點了就打開正式背包
            pill.onclick = ()=>{
              openInventory();
            };
          }

          invBox.appendChild(pill);
        });
      }
    }


    $("#runBtn").disabled=!game.state.inBattle;
    renderEnemy(); renderEquipSlots();
  }
 function renderEquipSlots(){
  const show = (slot) => {
    const id = game.player.equip[slot];
    const el = $("#equip-"+slot);
    if(id){
      if(slot === "mount"){
        el.innerHTML = displayInvName(id);     // 坐騎維持純文字
      }else{
        el.innerHTML = displayEquipName(id);     // 其他裝備吃顏色（不顯示詞條）
      }
    }else{
      el.textContent = (slot === "mount") ? "（無）" : "（空）";
    }
  };
  show("weapon"); show("armor"); show("acc"); show("mount");
}

  function renderEnemy(){
    const e=game.state.enemy;
    if(!e){ enemyUI.name.textContent="—"; enemyUI.lvl.textContent="—"; enemyUI.atk.textContent="—"; enemyUI.def.textContent="—";
      enemyUI.hpTxt.textContent="0/0"; enemyUI.mpTxt.textContent="0/0"; enemyUI.hpBar.style.width="0%"; enemyUI.mpBar.style.width="0%"; return; }
    enemyUI.name.textContent=e.name; enemyUI.lvl.textContent=e.lvl; enemyUI.atk.textContent=e.atk; enemyUI.def.textContent=e.def;
    enemyUI.hpTxt.textContent=`${e.hp}/${e.maxhp}`; enemyUI.mpTxt.textContent=`${e.mp}/${e.maxmp}`;
    enemyUI.hpBar.style.width=`${Math.max(0,Math.round(e.hp/e.maxhp*100))}%`;
    enemyUI.mpBar.style.width=`${Math.max(0,Math.round(e.mp/e.maxmp*100))}%`;
  }
  function displayInvName(k){
  // 裝備（E#…）
  if(k.startsWith("E#")){
    const inst = getEquipInstance(k);
    if(!inst) return k;
    const tag = categoryTagForKey(k);
    const nameHtml = fmtItem(inst.name, inst.qual);
    const starHtml = (inst.qual==="紫" || inst.qual==="神器") && (inst.stars>0)
      ? ` <span class="star">${inst.stars}☆</span>` : "";
    // 背包清單：分類標籤 + 名稱 + +N + 星數 + 詞條
    return `${tag} ${nameHtml}${inst.plus ? ` +${inst.plus}` : ""}${starHtml}${affixShort(inst)}`;
  }

    // 坐騎（M#…）
  if(k.startsWith("M#")){
    const tag = categoryTagForKey(k);

    // 先從目前記憶體找，如果沒有就試著從存檔還原
    let m = getMountInstance(k);
    if(!m){
      m = tryRestoreMountFromSave(k);
    }

    return m ? `${tag} ${m.name}` : `${tag} ${k}`;
  }


  // 其他道具（技能書 / 消耗品）
  const tag = categoryTagForKey(k);
  const isBook = (itemDefs?.[k]?.type === "skillbook") || k.includes("技能書");
  return isBook ? `${tag} ${cleanBookName(k)}` : `${tag} ${k}`;
}


function displayEquipName(id){
  const inst = getEquipInstance(id); 
  if(!inst) return id;
  // 🧩 這裡用 fmtItem + inst.qual，就會吃到你的品質顏色
  const nameHtml = fmtItem(inst.name, inst.qual); // 依品質上色
  const starHtml = (inst.qual==="紫" || inst.qual==="神器") && (inst.stars>0)
    ? ` <span class="star">${inst.stars}☆</span>` : "";
  const tag = categoryTagForKey(id); // [武器] / [防具] / [飾品] / [坐騎]
  // ➜ 「[武器] 木劍 +5 ☆」整串會帶顏色
  return `${tag} ${nameHtml}${inst.plus ? ` +${inst.plus}` : ""}${starHtml}`;
}




  function affixShort(inst){
    if(!inst||!inst.affix||!inst.affix.length) return "";
    const tags = inst.affix.map(a=>{
      const def=AFFIX_LIB.find(x=>x.key===a.key);
      if(!def) return "";
      if(a.key==="crit") return "｜爆擊+5%";
      if(a.key==="combo") return "｜連擊25%";
      if(a.key==="shred") return "｜破甲20%";
      if(a.key==="lifesteal") return `｜吸血${a.val}`;
      if(a.key==="poison") return `｜毒${a.val}`;
      return "";
    }).join("");
    return tags;
  }
  function skillNameWithLv(id){
    const lv = game.player.learned[id]||1;
    const qual = game.player.skillQual[id]||0;
    const tag = qual>=1? `（${QUALS[qual]}）`:"";
    return `${SKILL[id]?.name||"—"} Lv.${lv}${tag}`;
  }
  function jobName(key){ const j=JOB_TREE.find(j=>j.key===key); return j?j.name:key; }

  /* ========= 地圖 / 戰鬥 ========= */
  function currentZone(){ return zones.find(z=>z.id===game.state.zoneId) || zones[0]; }
  function openMap(){
    const p=game.player;
    const box=$("#zoneList"); box.innerHTML="";
    zones.forEach(z=>{
      const locked = p.lvl < z.lvlReq;
      const row=document.createElement("div"); row.className="row";
      const sug = `建議 ${z.suggest[0]}-${z.suggest[1]} 等`;
      row.innerHTML = `<div><b>${z.name}</b> <span class="tag">Lv≥${z.lvlReq}${z.hidden?"｜隱藏":""}｜${sug}${z.boss?"｜Boss獨立":""}</span></div>`;
      const go=btn( locked?"未開放" : (game.state.zoneId===z.id?"目前地區":"前往"), ()=>{
        if(locked) return;
        game.state.zoneId=z.id; say(`🧭 你移動到 <b>${z.name}</b>。`); render(); mapDlg.close();
      });
      if(locked) go.disabled=true; row.appendChild(go); box.appendChild(row);
    });
    mapDlg.showModal();
  }

  function randomEnemy(){
  const z=currentZone();
  const bandMid = Math.floor((z.suggest[0]+z.suggest[1])/2);
  const basePick = z.pool[rnd(0,z.pool.length-1)];
  const base = JSON.parse(JSON.stringify(basePick.base));
  const dayScale=1+(Math.min(60,game.state.day)-1)*0.01;
  const lvl=rnd(z.suggest[0],z.suggest[1]);
  const sc = 1 + (lvl - bandMid)*0.03;
  const p=game.player;
  const tierScale = 1 + p.tier*0.15 + Math.max(0, (p.lvl - bandMid))*0.01;
  ["hp","mp","atk","def"].forEach(k=> base[k]=Math.max(1, Math.round(base[k]*dayScale*sc*tierScale)));

  const e = {
    name: basePick.name,
    lvl,
    maxhp: base.hp, hp: base.hp,
    maxmp: base.mp, mp: base.mp,
    atk: base.atk, def: base.def,
    gold: Math.round(rnd(...base.gold)),
    exp:  Math.round(rnd(...base.exp)),
    drops: base.drops,            // ⬅️ 這一行是關鍵：把掉落表帶進敵人物件
      isBoss: !!basePick.isBoss,
    tag: base.tag || "",
    dot: 0, dotTurns: 0,
    defDown: 0, defDownTurns: 0   // 防禦 Debuff 用
  };

  return e;
}


  function startBattle(){
    if(game.state.inBattle){ say("你還在戰鬥中！"); return; }
    const z=currentZone();
    const e=randomEnemy(); game.state.enemy=e; game.state.inBattle=true;
    say(`⚔️ 在「${z.name}」遭遇 <b>${e.name}</b>（Lv.${e.lvl}｜HP ${e.hp}｜攻 ${e.atk}｜防 ${e.def}）。`);
    render();
  }
  function playerAttack(){
    if(!game.state.inBattle){ say("現在沒有在戰鬥。"); return; }
    const p=game.player, e=game.state.enemy;
    const effDef=effectiveEnemyDef(e,p);
    let out=Math.max(1, rnd(p.atk-2,p.atk+2)-effDef);
    out=critMaybe(p,out);
    e.hp=clamp(e.hp-out,0,e.maxhp); affixOnHit(p,e,out);
    say(`你進行普通攻擊，造成 <span class="hp">-${out}</span>。`);
    if(e.hp<=0) return endBattle(true);
    // 中毒DOT在回合終結時生效
    enemyTurn();
  }
 function useActiveSkill(){
  // 不在戰鬥中 → 不算施放
  if(!game.state.inBattle){
    say("不在戰鬥中。");
    return false;
  }

  const id = game.player.activeSkill;
  const sk = SKILL[id];
  if(!sk || sk.type === "被動"){
    say("沒有可施放的主動技能。");
    return false;
  }

  const lv = game.player.learned[id] || 1;
  const ok = sk.use(game.player, game.state.enemy, lv);
  render();

  // 技能本身回傳 false（多半是 MP 不足）→ 視為施放失敗
  if(!ok) return false;

  if(game.state.enemy.hp <= 0){
    endBattle(true);
    return true;
  }

  enemyTurn();
  return true;
}

  function enemyTurn(){
    const p=game.player, e=game.state.enemy;
      // ✅ 沒敵人就結束（避免 e.dot 取值報錯）
  if(!e){
    game.state.inBattle = false;
    return;
  }

    // 持續傷害（毒 / 燃燒等，在敵方回合前結算）
  if(e.dot && e.dotTurns > 0){
    const d = e.dot;
    e.hp = clamp(e.hp - d, 0, e.maxhp);
    e.dotTurns--;
    say(`☠️ <b>${e.name}</b> 受到持續傷害 <span class="bad">-${d}</span>。`);
    if(e.hp <= 0){ return endBattle(true); }
  }

  // 防禦 Debuff 回合數遞減
  if(e.defDown && e.defDownTurns > 0){
    e.defDownTurns--;
    if(e.defDownTurns <= 0){
      e.defDown = 0;
      say(`🛡️ <b>${e.name}</b> 的防禦恢復了。`);
    }
  }

    const dmg=Math.max(1, rnd(e.atk-1,e.atk+3)-p.def);
    p.hp=clamp(p.hp-dmg,0,p.maxhp);
    say(`<b>${e.name}</b> 攻擊了你，<span class="bad">-${dmg}</span>。`);
    if(p.hp<=0) return endBattle(false);
    render();
  }
  function endBattle(victory){
    const e=game.state.enemy; game.state.inBattle=false; game.state.enemy=null; $("#runBtn").disabled=true;
    if(victory){
      const z=currentZone(); let gold=e.gold, exp=e.exp;
      const mult = 1 + activeXpBuffs(); // 每層 +100%，=1+層數
      const finalExp = Math.floor(exp*mult);
      game.player.gold+=gold; gainExp(finalExp);
      game.state.kills[e.name]=(game.state.kills[e.name]||0)+1;
      updatePassivesOnKill();
      handleDrops(e);
      say(`🏆 勝利！（${z.name}）獲得 <b>${gold}G</b> 與 <b>${finalExp} EXP</b>（加倍層數 ${activeXpBuffs()}）。`);
      if(Math.random()<0.35){ advanceDay(1); }
    } else {
      const lostExp=Math.floor(game.player.exp*0.5), lostGold=Math.floor(game.player.gold*0.2);
      game.player.exp=Math.max(0, game.player.exp - lostExp);
      game.player.gold=Math.max(0, game.player.gold - lostGold);
      say(`💀 你倒下了……損失 <b>${lostExp} EXP</b> 與 <b>${lostGold} G</b>。`);
      const p=game.player; p.hp=Math.max(10,Math.round(p.maxhp*0.5)); p.mp=Math.max(5,Math.round(p.maxmp*0.5));
    }
    render(); autosave();
  }
  function gainExp(v){
    // 🔧 經驗倍率入口：所有來源的 EXP 都會先乘上 EXP_RATE
    const rate = (typeof EXP_RATE !== "undefined" ? EXP_RATE : 1);
    const add  = Math.floor(v * rate);

    const p = game.player;
    p.exp += add;

    while(p.exp >= expNeedForLevel(p.lvl)){
      p.exp -= expNeedForLevel(p.lvl);

      const before = {
        maxhp: p.maxhp,
        maxmp: p.maxmp,
        atk:   p.atk,
        def:   p.def
      };

      p.lvl++;
      recomputeStats(false);

      const dhp  = p.maxhp - before.maxhp;
      const dmp  = p.maxmp - before.maxmp;
      const datk = p.atk   - before.atk;
      const ddef = p.def   - before.def;

      // 滿血 / 滿魔（可改成保留比例，依你的遊戲手感）
      p.hp = p.maxhp;
      p.mp = p.maxmp;

      say(
        `🎉 升級到 <b>Lv.${p.lvl}</b>！` +
        `HP ${dhp>=0?"+":""}${dhp}, ` +
        `MP ${dmp>=0?"+":""}${dmp}, ` +
        `攻 ${datk>=0?"+":""}${datk}, ` +
        `防 ${ddef>=0?"+":""}${ddef}。`
      );

      checkUnlocks();
      if(p.lvl % 10 === 0) refreshQuestsForLevel(p.lvl);
    }
  }

  function updatePassivesOnKill(){
    const job=game.player.job;
    game.player.passiveKills[job]=(game.player.passiveKills[job]||0)+1;
    if(game.player.passiveKills[job]%100===0){
      const id = jobPassiveId(job);
      if(id){
        game.player.learned[id]=(game.player.learned[id]||0)+1;
        say(`✨ 你的職業被動 <b>${SKILL[id].name}</b> 提升至 Lv.${game.player.learned[id]}（每 100 擊殺）。`);
      }
    }
  }
  function jobPassiveId(job){
    const j=JOB_TREE.find(x=>x.key===job); if(!j) return null;
    return (j.key==="Warrior"||j.key==="Paladin") ? "vitality" : "focus";
  }
// =============================
// 🟥 神器系統 3.0：Boss 專屬神器 + 碎片合成
// =============================

// 每個 Boss 的專屬神器清單：只用 slot / weapon / base 來控制強度
// slot: "weapon" / "armor" / "acc"
// weapon: "blade" / "staff" / "dagger"（只有武器才需要）
const BOSS_ARTIFACT_DATA = {
  "火龍":{
    fragmentName:"[火龍神器碎片]",
    artifacts:[
      {slot:"weapon", weapon:"blade",  name:"燼焰斬界劍", base:{atk:110, def:8,  hp:60,  mp:20}},
      {slot:"weapon", weapon:"staff",  name:"焰心詠咒杖", base:{atk:90,  def:6,  hp:40,  mp:60}},
      {slot:"weapon", weapon:"dagger", name:"赤燄影牙刃", base:{atk:100, def:6,  hp:40,  mp:20}},
      {slot:"armor",               name:"熾鱗君王鎧", base:{atk:20,  def:80, hp:260, mp:40}},
      {slot:"armor",               name:"焰翼戰袍",   base:{atk:30,  def:60, hp:200, mp:80}},
      {slot:"acc",                 name:"紅蓮誓約戒", base:{atk:40,  def:20, hp:120, mp:40}},
      {slot:"acc",                 name:"燼心龍牙鏈", base:{atk:50,  def:15, hp:100, mp:60}}
    ]
  },
  "暴雪巨靈":{
    fragmentName:"[暴雪巨靈神器碎片]",
    artifacts:[
      {slot:"weapon", weapon:"staff",  name:"霜域審判杖", base:{atk:80,  def:12, hp:80,  mp:80}},
      {slot:"weapon", weapon:"blade",  name:"冰脈裂嶺劍", base:{atk:95,  def:18, hp:80,  mp:30}},
      {slot:"weapon", weapon:"dagger", name:"凜鋒碎霜刃", base:{atk:90,  def:16, hp:60,  mp:40}},
      {slot:"armor",               name:"永凍巨靈鎧", base:{atk:10,  def:110, hp:320, mp:40}},
      {slot:"armor",               name:"雪紋護法袍", base:{atk:15,  def:80,  hp:260, mp:80}},
      {slot:"acc",                 name:"霜心環印",   base:{atk:25,  def:30,  hp:160, mp:60}},
      {slot:"acc",                 name:"寒魄冰晶鏈", base:{atk:20,  def:35,  hp:140, mp:80}}
    ]
  },
  "深淵之眼":{
    fragmentName:"[深淵之眼神器碎片]",
    artifacts:[
      {slot:"weapon", weapon:"staff",  name:"深淵凝視杖", base:{atk:85,  def:8,  hp:40,  mp:110}},
      {slot:"weapon", weapon:"dagger", name:"冥潮噬魂刃", base:{atk:100, def:10, hp:40,  mp:80}},
      {slot:"weapon", weapon:"blade",  name:"暗潮絕鳴劍", base:{atk:105, def:8,  hp:50,  mp:70}},
      {slot:"armor",               name:"深淵觀測袍", base:{atk:20,  def:55, hp:200, mp:120}},
      {slot:"armor",               name:"虛渦棱光甲", base:{atk:25,  def:65, hp:220, mp:100}},
      {slot:"acc",                 name:"渦心瞳戒",   base:{atk:25,  def:20, hp:120, mp:100}},
      {slot:"acc",                 name:"深淵囁語鏈", base:{atk:20,  def:20, hp:100, mp:120}}
    ]
  },
  "星墜魔像":{
    fragmentName:"[星墜魔像神器碎片]",
    artifacts:[
      {slot:"weapon", weapon:"blade",  name:"隕星斷界刃", base:{atk:105, def:20, hp:80,  mp:30}},
      {slot:"weapon", weapon:"staff",  name:"星核導引杖", base:{atk:85,  def:18, hp:80,  mp:70}},
      {slot:"weapon", weapon:"dagger", name:"星蝕裂殘刃", base:{atk:95,  def:18, hp:70,  mp:40}},
      {slot:"armor",               name:"星墜重核鎧", base:{atk:10,  def:120, hp:360, mp:40}},
      {slot:"armor",               name:"流隕披風袍", base:{atk:20,  def:80,  hp:260, mp:80}},
      {slot:"acc",                 name:"星塵權衡戒", base:{atk:25,  def:30,  hp:160, mp:60}},
      {slot:"acc",                 name:"墜星共鳴鏈", base:{atk:25,  def:25,  hp:160, mp:80}}
    ]
  },
  "終末領主":{
    fragmentName:"[終末領主神器碎片]",
    artifacts:[
      {slot:"weapon", weapon:"blade",  name:"終焉審判劍", base:{atk:130, def:24, hp:90,  mp:60}},
      {slot:"weapon", weapon:"staff",  name:"末日詔令杖", base:{atk:120, def:20, hp:80,  mp:90}},
      {slot:"weapon", weapon:"dagger", name:"墜星終刻刃", base:{atk:125, def:22, hp:80,  mp:70}},
      {slot:"armor",               name:"終末權威鎧", base:{atk:20,  def:130, hp:380, mp:80}},
      {slot:"armor",               name:"終焉聖紋袍", base:{atk:30,  def:95,  hp:280, mp:120}},
      {slot:"acc",                 name:"審判王座戒", base:{atk:35,  def:35,  hp:180, mp:80}},
      {slot:"acc",                 name:"終焉心臟鏈", base:{atk:35,  def:30,  hp:180, mp:100}}
    ]
  }
};

// 從某個 Boss 的清單裡隨機挑一件神器模板
function pickBossArtifactDef(bossName){
  const cfg = BOSS_ARTIFACT_DATA[bossName];
  if(!cfg || !cfg.artifacts || !cfg.artifacts.length) return null;
  const list = cfg.artifacts;
  const idx = typeof rnd === "function" ? rnd(0, list.length-1) : Math.floor(Math.random()*list.length);
  return list[idx];
}

// 建立一件 Boss 神器實體（回傳裝備 id）
function createBossArtifact(bossName){
  const def = pickBossArtifactDef(bossName);

  // 萬一表沒填好就退回舊的隨機神器產生器當保險
  if(!def){
    if(typeof rollArtifactStatsForSlot === "function" &&
       typeof generateArtifactName === "function" &&
       typeof ensureUniqueName === "function"){
      const roll = rollArtifactStatsForSlot();
      const genName = ensureUniqueName(generateArtifactName(roll.slot, roll.weapon));
      const base = {
        atk: roll.stats.atk * 4,
        def: roll.stats.def * 3,
        hp:  roll.stats.hp  * 4,
        mp:  roll.stats.mp  * 3
      };
      const id = makeEquipInstance(`[神器_${genName}]`,"神器",roll.slot,roll.weapon,base);
      const inst = getEquipInstance(id);
      if(typeof addRandomAffixN === "function")      addRandomAffixN(inst,2);
      else if(typeof addRandomAffix === "function"){ addRandomAffix(inst); addRandomAffix(inst); }
      return id;
    }
    return null;
  }

// 內部只存「Boss名·武器名」，不要含[神器_]，顯示時再組
const innerName = `${bossName}·${def.name}`;
const id = makeEquipInstance(innerName,"神器",def.slot,def.weapon||null,def.base);

  const inst = getEquipInstance(id);

  // 詞條：武器 2 條、防具／飾品 1 條，走你原本的 AFFIX 系統
  if(inst){
    if(typeof addRandomAffixN === "function"){
      const n = def.slot==="weapon" ? 2 : 1;
      addRandomAffixN(inst,n);
    }else if(typeof addRandomAffix === "function"){
      addRandomAffix(inst);
      if(def.slot==="weapon") addRandomAffix(inst);
    }
  }
  return id;
}
// ✅ 確保某個 Boss 的神器碎片已經在 itemDefs 裡註冊成可使用道具
function ensureArtifactFragmentDef(bossName){
  const cfg = BOSS_ARTIFACT_DATA[bossName];
  if(!cfg) return;

  const fragName = cfg.fragmentName;

  // 已經有定義就不用重複
  if(itemDefs[fragName]) return;

  itemDefs[fragName] = {
    type:"consum",
    desc:`${bossName} 專屬神器碎片。收集 5 片可隨機合成一件 ${bossName} 的神器裝備。`,
    use:(p)=>{
      // 目前碎片數量
      const have = game.inv[fragName] || 0;

      // 不足 5 片 → 只提示，不扣數量
      if(have < 5){
        say(`🧩 ${fragName}：目前 <b>${have}</b>/5，尚不足以合成神器。`);
        return;
      }

      // 足夠才扣 5 片
      game.inv[fragName] = have - 5;
      if(game.inv[fragName] <= 0) delete game.inv[fragName];

      // 開始合成神器
      const id = createBossArtifact(bossName);
      if(!id){
        say("❌ 合成失敗：神器資料表有問題，請回報作者。");
        return;
      }
      const inst = getEquipInstance(id);
      addInv(id,1);
      say(`🟥 合成完成：<b>${inst?.name||"未知神器"}</b>！`);
      render();
    }
  };
}
// ✅ 遊戲啟動時呼叫：把所有 Boss 的碎片道具都先註冊好
function initAllArtifactFragments(){
  Object.keys(BOSS_ARTIFACT_DATA).forEach(name=>{
    ensureArtifactFragmentDef(name);
  });
}

// 掉落一片 Boss 神器碎片（並確保道具定義存在）
function dropArtifactFragmentFromBoss(bossName){
  const cfg = BOSS_ARTIFACT_DATA[bossName];
  if(!cfg) return;

  const fragName = cfg.fragmentName;

  // 先確保碎片道具有定義（只會做一次）
  ensureArtifactFragmentDef(bossName);

  // 實際給碎片
  addInv(fragName,1);
  say(`🧩 你獲得神器碎片：<b>${fragName}</b>！`);
}


// 🔍 檢查：目前是否有「需要任務藥水」的進行中任務
function hasActiveQuestNeedTaskPotion(){
  const qs = Array.isArray(game.quests) ? game.quests : [];
  return qs.some(q=>{
    if(q.state !== "active") return false;
    const req = q.req || {};
    // 新任務系統：使用 submitItems 形式
    if(req.submitItems && req.submitItems["任務藥水"]) return true;
    // 舊格式相容：如果有寫 req.item / req.count
    if(req.item === "任務藥水" && (req.count || 0) > 0) return true;
    return false;
  });
}

  
function handleDrops(e){
  // 🌟 全地圖稀有掉落：ㄅㄅㄐ之錘（1% 機率，每次戰鬥結算判定一次）
  if(Math.random() < 0.005){
    addInv("ㄅㄅㄐ之錘",1);
    say(`🌟 你獲得了稀有道具：<b>ㄅㄅㄐ之錘</b>！`);
  }

  (e.drops || []).forEach(d=>{
      // 一般道具
    if(d.item && Math.random() < d.rate){

      // 任務藥水特殊規則：
      // 只有在有「需要任務藥水」的進行中任務時，才會真的掉
      if(d.item === "任務藥水" && !hasActiveQuestNeedTaskPotion()){
        // 沒有相關任務，這次就當作沒掉
        return;
      }

      addInv(d.item,1);
      say(`📖 掉落：<b>${d.item}</b>！`);
    }


    // 白裝
    if(d.equip && Math.random() < d.rate){
      addEquipToInv(d.equip,"白");
    }

    // 坐騎
    if(d.mount && Math.random() < d.rate){
      addMountToInv(d.mount);
      say(`🐎 你獲得坐騎：<b>${d.mount}</b>！`);
    }

    // 🧩 Boss 神器碎片（Boss 掉落表用 artifactBoss 設定）
    if(d.artifactBoss && Math.random() < d.rate){
      dropArtifactFragmentFromBoss(d.artifactBoss);
    }
  });
}


  
  // ===========================================
// 🟣 相容層：讓 handleDrops() 呼叫到的接口存在
// 內部直接沿用你現有的 rollArtifactAffix() 結果
// ===========================================
function rollArtifactStatsForSlot() {
  // 你原本已定義的產生器：回傳 { slot, weapon, stats:{atk,def,hp,mp} }
  if (typeof rollArtifactAffix === "function") {
    return rollArtifactAffix();
  }
  // 防呆：萬一未載入，給一組安全的預設
  const slots = ["weapon","armor","acc"];
  const slot = slots[Math.floor(Math.random()*slots.length)];
  const weapon = slot==="weapon" ? ["blade","staff","dagger"][Math.floor(Math.random()*3)] : null;
  return { slot, weapon, stats:{ atk:5, def:3, hp:20, mp:12 } };
}

  function rollArtifactAffix(){
    const slots=["weapon","armor","acc"]; const slot=slots[rnd(0,slots.length-1)];
    const weapon = slot==="weapon" ? ["blade","staff","dagger"][rnd(0,2)] : null;
    return {slot, weapon, stats:{
      atk: rnd(3,7), def: rnd(2,5), hp: rnd(12,30), mp: rnd(6,18)
    }};
  }
// ===========================================
// 🟣 相容層：讓 handleDrops() 呼叫到的接口存在
// 內部直接沿用你現有的 rollArtifactAffix() 結果
// ===========================================
function rollArtifactStatsForSlot() {
  if (typeof rollArtifactAffix === "function") {
    return rollArtifactAffix(); // 期望回傳 {slot, weapon, stats:{atk,def,hp,mp}}
  }
  // 防呆預設
  const slots = ["weapon","armor","acc"];
  const slot = slots[Math.floor(Math.random()*slots.length)];
  const weapon = slot==="weapon" ? ["blade","staff","dagger"][Math.floor(Math.random()*3)] : null;
  return { slot, weapon, stats:{ atk:5, def:3, hp:20, mp:12 } };
}
//===========================================
  /* ========= 背包 / 裝備 / 強化 / 合成 ========= */
  const invDlg=$("#invDlg"), invList=$("#invList"), invFilters=$("#invFilters"), equipCompare=$("#equipCompare");

  const invCats=[
    {key:"all",name:"全部"}, {key:"consum",name:"消耗"}, {key:"equip",name:"裝備"}, {key:"book",name:"技能書"}, {key:"mount",name:"坐騎"}
  ];
let invFilter="all";
function openInventory(){
  if(equipCompare) equipCompare.innerHTML = "";   // 打開背包先清空比較
  renderInvFilters();
  renderInventoryList();
  invDlg.showModal();
}

  function renderInvFilters(){
    invFilters.innerHTML="";
    invCats.forEach(c=>{
      const b=btn(`${c.name}`,()=>{ invFilter=c.key; renderInventoryList(); });
      if(invFilter===c.key) b.classList.add("active");
      invFilters.appendChild(b);
    });
  }
    function renderInventoryList(){
    invList.innerHTML = '';

    const entries = Object.entries(game.inv);
    if(entries.length === 0){
      invList.innerHTML = `<div class="row"><span class="muted">（空）</span></div>`;
      return;
    }

    // 先把道具轉成含 meta 的陣列
    let arr = entries.map(([name, count])=>{
      const meta = invMeta(name);
      return { name, count, meta };
    });

    // 依目前的分類過濾（全部 / 裝備 / 消耗品 / 技能書 / 坐騎 / 其他）
    if(invFilter !== "all"){
      arr = arr.filter(e => e.meta.type === invFilter);
    }

    if(arr.length === 0){
      invList.innerHTML = `<div class="row"><span class="muted">（此分類目前沒有道具）</span></div>`;
      return;
    }

    // 類型排序優先順序：裝備→坐騎→消耗品→技能書→其他
    const typeOrder = { equip:0, mount:1, consum:2, book:3, misc:4 };

    // ✅ 排序規則：
    // 1) 依 typeOrder
    // 2) 同類型再依 displayInvName 的字母/中文字排序
    arr.sort((a, b)=>{
      const ta = typeOrder[a.meta.type] ?? 99;
      const tb = typeOrder[b.meta.type] ?? 99;
      if(ta !== tb) return ta - tb;

      const da = displayInvName(a.name);
      const db = displayInvName(b.name);
      return da.localeCompare(db, "zh-Hant");
    });

    // 依排序後結果畫列表
    arr.forEach(({name, count, meta})=>{
      const row   = document.createElement("div"); row.className = "row";
      const right = document.createElement("div"); right.className = "right";

      let lineTitle = `<b>${displayInvName(name)}</b> × ${count}`;
      let extra = "";

      if(meta.type === "equip"){
        const eq = getEquipInstance(name);
        extra = `｜ATK ${eq.atk||0} DEF ${eq.def||0} HP ${eq.hp||0} MP ${eq.mp||0}${eq.plus?`｜+${eq.plus}`:""}${affixShort(eq)}`;
        right.append(btn("裝備", ()=>equipItem(name)));

        // 合成：白→綠→藍（同名 3 件）
        const q = eq.qual || "白";
        if(QUALITY_ORDER[q] < QUALITY_ORDER["藍"]){
          const need = 3;
          let cnt = 0;
          Object.entries(game.inv).forEach(([k,v])=>{
            const e2 = getEquipInstance(k);
            if(e2 && e2.name === eq.name && e2.qual === eq.qual){ cnt += v; }
          });
          if(cnt >= need){
            right.append(btn("合成升階", ()=>{ combineEquip(name, need); }));
          }
        }

           }else if(meta.type === "consum"){
        const def = itemDefs[meta.ref] || {};
        extra = `｜${def.desc || ""}`;

        // 🟢 單次使用（原本功能）
        right.append(btn("使用", ()=>{ 
          useItem(name); 
          renderInventoryList(); 
        }));

        // 🟣 批量使用（只有非戰鬥中才允許一次用多個）
        right.append(btn("批量使用", ()=>{
          const have = game.inv[name] || 0;
          if(have <= 0) return;

          // 戰鬥中禁止一次吃很多，避免怪物一直輪流行動
          if(game.state && game.state.inBattle){
            say("⚔ 戰鬥中一次只能使用 1 個。");
            useItem(name);
            renderInventoryList();
            return;
          }

          const input = prompt(`你有 ${have} 個 ${displayInvName(name)}。\n要一次使用幾個？`, "1");
          if(input === null) return; // 按取消
          const n = parseInt(input, 10);
          if(isNaN(n) || n <= 0){
            alert("請輸入大於 0 的整數。");
            return;
          }

          const times = Math.min(n, have);
          for(let i = 0; i < times; i++){
            if((game.inv[name] || 0) <= 0) break; // 用到沒了就停
            useItem(name);
          }

          renderInventoryList();
        }));

        // 藥水 2 合 1（只對治療藥水鏈）
        const next = nextPotionName(meta.ref);
        if(next && (game.inv[name] || 0) >= 2){
          right.append(btn("合成→下一級", ()=>{ 
            combinePotion(meta.ref); 
            renderInventoryList(); 
          }));
        }

      }else if(meta.type === "book"){
        const skillId = itemDefs[meta.ref]?.skill;
        const sk = SKILL[skillId];
        extra = `｜學習/升級：${sk ? sk.name : "未知"}`;
        right.append(btn("閱讀", ()=>{ useBook(name); renderInventoryList(); }));

      }else if(meta.type === "mount"){
        const m = getMountInstance(name);
        const mAtk = m?.atk || 0,
              mDef = m?.def || 0,
              mHp  = m?.hp  || 0,
              mMp  = m?.mp  || 0,
              mSpd = m?.spd || 0;
        extra = `｜ATK ${mAtk} DEF ${mDef} HP ${mHp} MP ${mMp} SPD ${mSpd}`;
        right.append(btn("裝備坐騎", ()=>{ equipMount(name); renderInventoryList(); }));
      }
      
      // 點整列來預覽＆比較（按鈕本身不觸發）
      row.onclick = (ev)=>{
        if(ev.target.closest("button")) return;   // 點到按鈕就交給原本功能
        if(meta.type === "equip"){
          const eqInst = getEquipInstance(name);
          if(eqInst) showEquipCompare(name, eqInst);
        }
      };

      // 販售
      right.append(btn("販售", ()=>sellSingle(name)));

      row.innerHTML = `<div>${lineTitle} <span class="tag">${extra}</span></div>`;
      row.append(right);
      invList.appendChild(row);
    });
  }
  // 顯示裝備比較（背包選取 vs 身上裝備）
  function showEquipCompare(id, eq){
    if(!equipCompare) return;

    const p = game.player;
    const slot = eq.slot;

    // 只有武器 / 防具 / 飾品有比較意義
    if(!slot || !["weapon","armor","acc"].includes(slot)){
      equipCompare.innerHTML = `<div class="hint">此裝備沒有對應比較槽位。</div>`;
      return;
    }

    const eid = p.equip[slot];
    if(!eid){
      equipCompare.innerHTML = `<div class="hint">目前此槽位尚未裝備任何裝備。</div>`;
      return;
    }

    const cur = getEquipInstance(eid);
    if(!cur){
      equipCompare.innerHTML = `<div class="hint">目前身上裝備資料異常，請重新裝備一次。</div>`;
      return;
    }

    // 數值差異：上升綠色、下降紅色、沒變灰色
const diff = (a,b)=>{
  const d = (a||0) - (b||0);

  if(d > 0)
    return `<span class="diff-up">+${d}   🟥</span>`;   // 上升 → 紅色＋上箭頭

  if(d < 0)
    return `<span class="diff-down">${d} 🟩</span>`;  // 下降 → 綠色＋下箭頭

  return `<span class="diff-zero">0</span>`;          // 無變化 → 灰色
};



    // 詞條內文（如果沒有詞條就顯示「無特殊詞條」）
    const affixText = (inst)=>{
      const s = affixShort(inst);
      return (s && s.trim()) ? s : "（無特殊詞條）";
    };

    // 取得詞條顯示名稱
    const affixLabel = (key)=>{
      const def = AFFIX_LIB.find(x=>x.key===key);
      return def ? (def.name || key) : key;
    };

    // 詞條變化描述：新增／移除什麼詞條
    const affixChange = (oldInst, newInst)=>{
      const oldKeys = (oldInst?.affix || []).map(a=>a.key);
      const newKeys = (newInst?.affix || []).map(a=>a.key);

      const added   = newKeys.filter(k => !oldKeys.includes(k));
      const removed = oldKeys.filter(k => !newKeys.includes(k));

      const parts = [];
      if(added.length)   parts.push(`新增：${added.map(affixLabel).join("、")}`);
      if(removed.length) parts.push(`移除：${removed.map(affixLabel).join("、")}`);

      return parts.length ? parts.join("｜") : "無變化";
    };

    equipCompare.innerHTML = `
      <div class="row" style="flex-direction:column;align-items:flex-start">
        <div><b>目前裝備：</b>${displayEquipName(eid)}｜ATK ${cur.atk||0} DEF ${cur.def||0} HP ${cur.hp||0} MP ${cur.mp||0}</div>
        <div class="eq-affix-line"><b>目前詞條：</b>${affixText(cur)}</div>

        <div><b>背包選取：</b>${displayEquipName(id)}｜ATK ${eq.atk||0} DEF ${eq.def||0} HP ${eq.hp||0} MP ${eq.mp||0}</div>
        <div class="eq-affix-line"><b>背包詞條：</b>${affixText(eq)}</div>

        <div><b>差異（背包 − 身上）：</b>
          ATK ${diff(eq.atk,cur.atk)}／
          DEF ${diff(eq.def,cur.def)}／
          HP ${diff(eq.hp,cur.hp)}／
          MP ${diff(eq.mp,cur.mp)}
        </div>
        <div><b>詞條變化：</b>${affixChange(cur, eq)}</div>
      </div>
    `;
  }

  
  function invMeta(key){
    if(key.startsWith("E#")) return {type:"equip"};
    if(key.startsWith("M#")) return {type:"mount"};
    const ref = itemDefs[key];
    if(ref){ return {type: ref.type, ref:key}; }
    return {type:"misc"};
  }
 function useItem(key){
  const p = game.player;
  const meta = invMeta(key);
  if (meta.type !== "consum") return;

  const def = itemDefs[meta.ref];
  if (!def) return;

  // 先執行道具本身的效果
  def.use(p, game.state.enemy, game.state.inBattle);

  // 🧩 特例：
  // 1) 神器碎片（名稱裡包含「神器碎片」）
  // 2) ㄅㄅㄐ之錘（在 use 裡自己 decInv）
  // 3) 錢袋（在 use 裡自己 decInv）
  // 這三種道具在自己的 use() 裡已經處理數量，不要再自動扣 1 次
  if (
    !meta.ref.includes("神器碎片") &&
    meta.ref !== "ㄅㄅㄐ之錘" &&
    meta.ref !== "錢袋"
  ) {
    decInv(key, 1);
  }

  render();
  if (game.state.inBattle) enemyTurn();
}


function combinePotion(name){
  const next = nextPotionName(name);
  if (!next) return say("此物品不可再合成。");

  const have = game.inv[name] || 0;
  if (have < 2) return say("需要至少 2 瓶同級藥水。");

  // 一次把能合的都合掉：每 2 瓶 → 1 瓶下一級
  const times = Math.floor(have / 2);   // 可以合成幾次
  const cost  = times * 2;              // 會消耗幾瓶
  const gain  = times;                  // 會得到幾瓶下一級藥水

  decInv(name, cost);   // 扣掉原本藥水
  addInv(next, gain);   // 給予新藥水

  say(`⚗️ 批量合成：<b>${name}</b> ×${cost} → <b>${next}</b> ×${gain}`);
}


  function useBook(key){
    const meta=invMeta(key); if(meta.type!=="book") return;
    const skill = itemDefs[meta.ref]?.skill; if(!skill) return;
    learnOrUpgradeSkill(skill, meta.ref);
  }

  
/* === 技能書升級設定 ===========================
   可改參數（依你喜好調整）
----------------------------------------------- */
const SKILL_MAX_LV = 25;           // 每個品質的等級上限（原本 25）
const SKILL_QUALITY_UP = true;     // 滿級後是否升一階品質並重置等級
const SKILL_UP_GOLD_COST = 0;      // 升級額外需要的金幣（0=不需要）
// 升級需求模式：選一種
//  "pow2"   : 2^當前等級（原本的作法，如 Lv1→1本，Lv2→2本，Lv3→4本…）
//  "linear" : 每級固定 1 本
//  "arith"  : 1, 2, 3, 4…（等級越高越多）
//  "custom" : 自訂公式（改下面的 calcSkillBooksNeeded）
const SKILL_BOOK_MODE = "custom";

/** 算升級需要幾本技能書（依當前等級 curLv） */
function calcSkillBooksNeeded(totalLv){
  switch(SKILL_BOOK_MODE){
    case "pow2":   return Math.pow(2, Math.max(0, totalLv));          // 原版
    case "linear": return 1;                                          // 每級 1 本
    case "arith":  return Math.max(1, totalLv);                       // 1,2,3,4…
    case "custom":
      // 依「總等級」（含品質）緩慢成長：起始 1 本，每 5 級多 1 本
      return 1 + Math.floor(Math.max(0, totalLv) / 5);
    default:       return 1;
  }
}


function learnOrUpgradeSkill(id, bookName){
  const p = game.player;
  const maxLv = SKILL_MAX_LV;
  const cur = p.learned[id] || 0;

  // 🔒 進階技能職業限制（依你前面設定）
  // headbutt：頭槌（基礎技，不鎖）
  // flurry：連擊 → 盜賊系
  // fireball：火球術 → 法師系
  // armorbreak：破甲斬 → 戰士系
const jobLock = {
  flurry:     ["Rogue","Paladin"],
  fireball:   ["Mage","Paladin"],
  armorbreak: ["Warrior","Paladin"]
};


  // 若這個技能有職業限制，就檢查「是否有轉職」＋「職業是否正確」
  if (jobLock[id]) {
    const t = p.tier || 0;
    if (t <= 0) {
      say("❌ 尚未轉職，無法學習這個技能。");
      return;
    }
    if (!jobLock[id].includes(p.job)) {
      say("❌ 這本技能書只能由對應職業習得。");
      return;
    }
  }

   // 需要的書本數（由設定決定）
  const qual = (p.skillQual && p.skillQual[id]) || 0;  // 技能目前品質階級
  const totalLv = cur + qual * maxLv;                  // 總等級 = 當前等級 + 品質階 * 上限
  const need = calcSkillBooksNeeded(totalLv);

  // 檢查書本是否足夠
  if( (game.inv[bookName]||0) < need ){
    say(`📘 升級需要 <b>${need}</b> 本 <b>${bookName}</b>（目前 ${game.inv[bookName]||0}）`);
    return;
  }

  // 檢查金幣是否足夠（若有設定）
  if(SKILL_UP_GOLD_COST > 0 && p.gold < SKILL_UP_GOLD_COST){
    say(`💰 升級需要 <b>${SKILL_UP_GOLD_COST}</b> 金幣（目前 ${p.gold}）`);
    return;
  }

  // 扣道具／金幣
  for(let i=0;i<need;i++) decInv(bookName,1);
  if(SKILL_UP_GOLD_COST > 0){ p.gold -= SKILL_UP_GOLD_COST; }

  // 未學會 → 學會 Lv.1
  if(cur === 0){
    p.learned[id] = 1;
    say(`📖 你學會了 <b>${SKILL[id].name}</b>！`);
  }
  // 已學會且未滿級 → 升一級
  else if(cur < maxLv){
    p.learned[id] = cur + 1;
    say(`📈 <b>${SKILL[id].name}</b> 升至 Lv.${p.learned[id]}（消耗 ${need} 本${SKILL_UP_GOLD_COST>0?`＋${SKILL_UP_GOLD_COST} 金幣`:``}）。`);
  }
  // 滿級後 → 是否升品質
  else{
    if(SKILL_QUALITY_UP){
      const q = (p.skillQual[id]||0) + 1;
      p.skillQual[id] = Math.min(q, QUALS.length-1);
      p.learned[id] = 1;
      say(`🌟 <b>${SKILL[id].name}</b> 升為 <b>${QUALS[p.skillQual[id]]}</b> 品質，等級重置為 Lv.1。`);
    }else{
      say(`🔒 <b>${SKILL[id].name}</b> 已達本品質上限 Lv.${maxLv}。`);
    }
  }
  // 主動技能：升級後自動設為當前技能（維持原行為）
  if(SKILL[id].type!=="被動"){ p.activeSkill = id; }
  render(); autosave();
}
  function addInv(name,c=1){ game.inv[name]=(game.inv[name]||0)+c; autosave(); }
  function decInv(name,c=1){ if(!game.inv[name]) return; game.inv[name]-=c; if(game.inv[name]<=0) delete game.inv[name]; autosave(); }
  function addEquipToInv(baseName,qual="白"){
    const tpl=EQUIPS[baseName]; if(!tpl) return;
    const id = makeEquipInstance(baseName, qual, tpl.slot, tpl.weapon||null, {atk:tpl.atk,def:tpl.def,hp:tpl.hp,mp:tpl.mp});
    addInv(id,1);
    say(`🗡️ 獲得裝備：${fmtItem(baseName,qual)}。`);
  }
  function makeEquipInstance(name, qual, slot, weapon, stats){
    // 先用模板給的原始素質當 base
    let base = { ...(stats || {}) };
    // 白 / 綠 / 藍 → 用「固定素質表」覆蓋（依部位＋品質）
    if (["白","綠","藍"].includes(qual) &&
        FIXED_LOW_TIER[slot] &&
        FIXED_LOW_TIER[slot][qual]){
      base = { ...FIXED_LOW_TIER[slot][qual] };
    }
    // 黃 / 橘 / 紫 → 沿用模板素質，之後靠強化成長
    const inst = {
      id:   "E#" + Math.random().toString(36).slice(2),
      name,
      qual,
      slot,
      weapon: weapon || null,
      atk: Math.round(base.atk || 0),
      def: Math.round(base.def || 0),
      hp:  Math.round(base.hp  || 0),
      mp:  Math.round(base.mp  || 0),
      plus:  0,
      stars: 0,
      affix: []
    };
    addEquip(inst);
    return inst.id;
  }

  function addMountToInv(name){
  const tpl = MOUNTS[name] || {};
  const inst = {
    id: "M#" + Math.random().toString(36).slice(2),
    name,
    // 坐騎四圍加成
    atk: tpl.atk || 0,
    def: tpl.def || 0,
    hp:  tpl.hp  || 0,
    mp:  tpl.mp  || 0,
    spd: tpl.spd || 0,
    desc: tpl.desc || ""
  };
  MOUNT_DB[inst.id] = inst;
  addInv(inst.id, 1);
}

  const EQUIP_DB={}; const MOUNT_DB={};
  function getEquipInstance(id){ return EQUIP_DB[id]; }
  function getMountInstance(id){ return MOUNT_DB[id]; }

  // ✅ 註冊裝備實例到資料庫（修補 addEquip 未定義）
function addEquip(inst){
  // 防呆：若 EQUIP_DB 尚未存在，先建立
  if (typeof EQUIP_DB === "undefined") { window.EQUIP_DB = {}; }
  EQUIP_DB[inst.id] = inst;
}

  /* =============================== */
  /* [FIX] 裝備/坐騎顯示防呆＋自動從存檔還原實例 */
  /* =============================== */
  const __orig_displayEquipName = displayEquipName;
  const __orig_displayInvName   = displayInvName;
  function tryRestoreEquipFromSave(id){
    try{
      const raw=localStorage.getItem(LKEY);
      if(!raw) return null;
      const data=JSON.parse(raw);
      const found=data && data._eqdb && data._eqdb[id];
      if(found){ EQUIP_DB[id]=found; return found; }
    }catch(_){}
    return null;
  }
  function tryRestoreMountFromSave(id){
    try{
      const raw=localStorage.getItem(LKEY);
      if(!raw) return null;
      const data=JSON.parse(raw);
      const found=data && data._mddb && data._mddb[id];
      if(found){ MOUNT_DB[id]=found; return found; }
    }catch(_){}
    return null;
  }
displayEquipName = function(id){
  let inst = getEquipInstance(id);
  if(!inst && typeof id==="string" && id.startsWith("E#")){
    inst = tryRestoreEquipFromSave(id);
  }
  if(!inst){
    try{
      return __orig_displayEquipName(id);
    }catch(_){
      return "（裝備資料遺失）";
    }
  }
  const nameHtml = fmtItem(inst.name, inst.qual);   // ★ 套用品質顏色 ★
  const starHtml = (inst.qual === "紫" || inst.qual === "神器") && (inst.stars > 0)
    ? ` <span class="star">${inst.stars}☆</span>`
    : "";
  return `${nameHtml}${inst.plus ? ` +${inst.plus}` : ""}${starHtml}`;
};


  displayInvName = function(k){
    // 裝備實體 E#...
    if (typeof k === "string" && k.startsWith("E#")) {
      let inst = getEquipInstance(k);
      if (!inst) inst = tryRestoreEquipFromSave(k);
      if (!inst) return "（裝備資料遺失）";

      const tag      = categoryTagForKey(k);                 // ← 這行決定 [武器]/[防具]/[飾品]
      const baseName = fmtItem(inst.name, inst.qual);        // 依品質上色
      const starHtml = (inst.qual === "紫" || inst.qual === "神器") && (inst.stars > 0)
        ? ` <span class="star">${inst.stars}☆</span>` : "";

      return `${tag} ${baseName}${inst.plus ? ` +${inst.plus}` : ""}${starHtml}${affixShort(inst)}`;
    }

    // 坐騎實體 M#...
    if (typeof k === "string" && k.startsWith("M#")) {
      let m = getMountInstance(k);
      if (!m) m = tryRestoreMountFromSave(k);
      const tag = categoryTagForKey(k);                      // ← 這裡會變成 [坐騎]
      return m ? `${tag} ${m.name}` : `${tag} （坐騎資料遺失）`;
    }

    // 其他：交回原本版本處理（藥水、技能書等）
    return __orig_displayInvName ? __orig_displayInvName(k) : k;
  };

 function equipItem(id){
  const inst = getEquipInstance(id); if(!inst) return;
  const allowed = JOB_WEAPON[game.player.job]||[];
  if(inst.slot==="weapon" && inst.weapon && !allowed.includes(inst.weapon)){
    return say(`❌ 你的職業 <b>${jobName(game.player.job)}</b> 不能裝備此武器類型。`);
  }
  const slot=inst.slot; const old=game.player.equip[slot];
  if(old){ addInv(old,1); say(`你卸下了 <b>${displayEquipName(old)}</b>。`); }
  game.player.equip[slot]=id;
  decInv(id,1);
  say(`你裝備了 <b>${displayEquipName(id)}</b>。`);
  recomputeStats(false); render();
}

 function equipMount(id){
  const inst = getMountInstance(id); if(!inst) return;
  const p = game.player;
  const old = p.equip.mount;

  if(old){
    addInv(old,1);
    say(`你卸下了坐騎 <b>${displayInvName(old)}</b>。`);
  }

  p.equip.mount = id;
  decInv(id,1);
  say(`你騎上了 <b>${inst.name}</b>！`);

  recomputeStats(false); render();
}


  function applyEquipMod(id,sign){
    const inst=getEquipInstance(id); if(!inst) return;
    const p=game.player;
    p.atk += sign*(inst.atk||0);
    p.def += sign*(inst.def||0);
    p.maxhp += sign*(inst.hp||0);
    p.maxmp += sign*(inst.mp||0);
    p.hp = clamp(p.hp,1,p.maxhp); p.mp=clamp(p.mp,0,p.maxmp);
  }
//套用坐騎加成函數
  function applyMountMod(id, sign){
  const m = getMountInstance(id); if(!m) return;
  const p = game.player;
  p.atk   += sign * (m.atk || 0);
  p.def   += sign * (m.def || 0);
  p.maxhp += sign * (m.hp  || 0);
  p.maxmp += sign * (m.mp  || 0);
  // 夾回合法區間
  p.hp = clamp(p.hp, 1, p.maxhp);
  p.mp = clamp(p.mp, 0, p.maxmp);
}

  
    // 合成（同名裝備 ×3 → 下一品質；上限藍）
  function combineEquip(id, need){
    const inst = getEquipInstance(id);
    if(!inst) return;

    const q = inst.qual || "白";
    if(QUALITY_ORDER[q] >= QUALITY_ORDER["藍"]){
      say("已達合成上限。");
      return;
    }

    const p = game.player;
    let cnt = 0;
    const keys = [];
    const equipSlots = [];

    // 1) 先數背包裡的同名同品質裝備
    Object.entries(game.inv).forEach(([k, v])=>{
      const eq = getEquipInstance(k);
      if(eq && eq.name === inst.name && eq.qual === inst.qual){
        cnt += v;
        keys.push([k, v]);
      }
    });

    // 2) 再把身上穿的同名同品質裝備也一起算進來
    ["weapon","armor","acc"].forEach(slot=>{
      const eid = p.equip[slot];
      if(!eid) return;
      const eq = getEquipInstance(eid);
      if(eq && eq.name === inst.name && eq.qual === inst.qual){
        cnt += 1;
        equipSlots.push(slot);
      }
    });

    if(cnt < need){
      say(`需要同名同品質裝備 ${need} 件（目前 ${cnt}）`);
      return;
    }

    // 3) 先從背包扣除素材
    let left = need;
    for(const [k, v] of keys){
      if(left <= 0) break;
      const take = Math.min(v, left);
      decInv(k, take);
      left -= take;
    }

    // 4) 不夠的話，再從身上裝備扣除（會直接拆掉裝備，並重新計算能力值）
    if(left > 0){
      for(const slot of equipSlots){
        if(left <= 0) break;
        const eid = p.equip[slot];
        if(!eid) continue;

        // 解除裝備：從能力值扣回去，並清空該槽位
        applyEquipMod(eid, -1);
        p.equip[slot] = null;
        left -= 1;
        say(`你消耗了身上裝備 <b>${displayEquipName(eid)}</b> 作為合成素材。`);
      }
    }

    // 5) 計算下一品質的實際屬性
    const next = QUALS[QUALITY_ORDER[q] + 1];

    const base = {
      atk: inst.atk || 0,
      def: inst.def || 0,
      hp : inst.hp  || 0,
      mp : inst.mp  || 0,
    };

    // 品質倍率表（照你原本的設定）
    const invMul = [1, 1.05, 1.1, 1.15, 1.2, 1.5];
    const curMul  = invMul[QUALITY_ORDER[q]];
    const nextMul = invMul[QUALITY_ORDER[next]];

    // 邏輯：先還原回「白品等價」→ 再套用下一階倍率（向上取整避免被吃掉）
    const baseWhite = {
      atk: Math.max(0, Math.round(base.atk / curMul)),
      def: Math.max(0, Math.round(base.def / curMul)),
      hp : Math.max(0, Math.round(base.hp  / curMul)),
      mp : Math.max(0, Math.round(base.mp  / curMul)),
    };

    // 產生新數值：向上取整；若原屬性>0且新值沒有比舊值大，保底+1
    function grow(oldVal, whiteVal){
      if(whiteVal <= 0) return 0;
      const scaled = Math.ceil(whiteVal * nextMul);
      return Math.max(scaled, oldVal + 1);
    }

    const newStats = {
      atk: grow(base.atk, baseWhite.atk),
      def: grow(base.def, baseWhite.def),
      hp : grow(base.hp,  baseWhite.hp),
      mp : grow(base.mp,  baseWhite.mp),
    };

    const newId = makeEquipInstance(inst.name, next, inst.slot, inst.weapon || null, newStats);
    addInv(newId, 1);

    say(
      `⚗️ 合成成功！獲得 ${fmtQual(next,qualName(inst.name,next))}` +
      `（ATK ${base.atk}→${newStats.atk}｜DEF ${base.def}→${newStats.def}` +
      `｜HP ${base.hp}→${newStats.hp}｜MP ${base.mp}→${newStats.mp}）`
    );

    // 重新計算一次角色能力（避免因為拆裝而沒更新）
    recomputeStats(false);
    renderInventoryList();
    render();
    return newId;   // ⬅ 只加這一行
  }

  // 強化
  let enhTargetId = null;
  const enhDlg = $("#enhDlg"),
        enhInfo = $("#enhInfo"),
        enhBtnDo = $("#enhBtnDo"),
        enhBtnCombine = $("#enhBtnCombine");

  $("#slot-weapon").onclick = ()=>openEnhForSlot("weapon");
  $("#slot-armor").onclick  = ()=>openEnhForSlot("armor");
  $("#slot-acc").onclick    = ()=>openEnhForSlot("acc");

  function openEnhForSlot(slot){
    const id=game.player.equip[slot];
    if(!id){ say("此槽位尚未裝備。"); return; }
    enhTargetId=id; renderEnhancePanel(); enhDlg.showModal();
  }
//坐騎裝備欄開窗
// [MOUNT-UI] 坐騎資訊面板
const mountDlg   = $("#mountDlg");
const mountInfo  = $("#mountInfo");
const closeMount = $("#closeMount");

// 點擊坐騎槽位 → 開啟坐騎資訊
$("#slot-mount").onclick = ()=> openMountPanel();

function openMountPanel(){
  const id = game.player.equip.mount;
  if(!id){
    say("尚未裝備坐騎。");
    return;
  }
  // 嘗試取出坐騎實例（若重整後失聯，走救援還原）
  let m = getMountInstance(id);
  if(!m && typeof tryRestoreMountFromSave === "function"){
    m = tryRestoreMountFromSave(id);
  }
  if(!m){
    say("坐騎資料遺失。");
    return;
  }

  // 取原始定義（拿描述 desc 用，不影響實例數值）
  const tpl = (typeof MOUNTS !== "undefined") ? (MOUNTS[m.name] || {}) : {};

  // 排版：沿用你的 .stats/.stat 風格
  mountInfo.innerHTML = `
    <div class="row" style="align-items:center;gap:8px">
      <div style="font-weight:700">${m.name}</div>
      <span class="tag">移動效率 SPD：${m.spd || 0}</span>
    </div>
    <div class="hint" style="margin:6px 0 10px 0">描述：${tpl.desc || "—"}</div>
    <div class="stats" style="margin-top:4px">
      <div class="stat atk">攻擊：${m.atk || 0}</div>
      <div class="stat def">防禦：${m.def || 0}</div>
      <div class="stat hp">HP：${m.hp || 0}</div>
      <div class="stat mp">MP：${m.mp || 0}</div>
    </div>
  `;
  mountDlg.showModal();
}

closeMount.onclick = ()=> mountDlg.close();
//坐騎裝備欄開窗
  
function renderEnhancePanel(){
  enhInfo.innerHTML = "";

  const inst = getEquipInstance(enhTargetId);
  if(!inst){
    enhInfo.innerHTML = "<div class='row'>找不到裝備。</div>";
    if(enhBtnDo) enhBtnDo.disabled = true;
    if(enhBtnCombine) enhBtnCombine.disabled = true;
    return;
  }

  const q = inst.qual || "白";
  const canEnh = QUALITY_ORDER[q] >= QUALITY_ORDER["藍"];
  const chance = enhChance(inst);
  const cost   = enhCost(inst);

  const line = document.createElement("div");
  line.className = "row";
  line.innerHTML = `<div>
    ${displayEquipName(enhTargetId)}｜${qualWithStars(inst)}｜
    ATK ${inst.atk} DEF ${inst.def} HP ${inst.hp} MP ${inst.mp}
    <br><span class="tag affix">${affixShort(inst)}</span>
    <br><span class="tag">強化成功率：${Math.round(chance*100)}%｜費用：${cost} G</span>
  </div>`;

  enhInfo.appendChild(line);

  if(inst.name && inst.name.startsWith("[神器_")){
    const tip = document.createElement("div");
    tip.className = "hint";
    tip.innerHTML = "（神器強化：每+1 ATK+25 DEF+15 HP+80 MP+50；成功率可被「ㄅㄅㄐ之錘」加成）";
    enhInfo.appendChild(tip);
  }

  // 強化按鈕：只有藍品以上可以強化
  if(enhBtnDo) enhBtnDo.disabled = !canEnh;

  // 合成按鈕：白 / 綠 才可以，且需要至少 3 件（含身上）
  if(enhBtnCombine){
    let canCombine = QUALITY_ORDER[q] < QUALITY_ORDER["藍"];

    if(canCombine){
      let cnt = 0;

      // 背包
      Object.entries(game.inv).forEach(([k,v])=>{
        const eq = getEquipInstance(k);
        if(eq && eq.name === inst.name && eq.qual === inst.qual){
          cnt += v;
        }
      });

      // 身上
      ["weapon","armor","acc"].forEach(slot=>{
        const eid = game.player.equip[slot];
        if(!eid) return;
        const eq = getEquipInstance(eid);
        if(eq && eq.name === inst.name && eq.qual === inst.qual){
          cnt += 1;
        }
      });

      canCombine = cnt >= 3;
    }

    enhBtnCombine.disabled = !canCombine;
  }
}


  // 成功率表（藍 / 黃 / 橘）
function enhChance(inst){
  const p = inst.plus || 0;
  const q = inst.qual || "";
  const s = inst.stars || 0;

  // 紫色：用你原本的 ENH_RATE.紫
  if(q === "紫"){
    return ENH_RATE.紫(p, s);
  }

  // 神器 & 神器☆：用你原本的 ENH_RATE.神器
  if(q === "神器" || q.startsWith("神器")){
    return ENH_RATE.神器(p, s);
  }

  // 藍 / 黃 / 橘：用你原本的 ENH_RATE.藍/黃/橘
  if(q === "藍" || q === "黃" || q === "橘"){
    return ENH_RATE[q](p);
  }

  // 白 / 綠 不可強化
  return 0;
}

function failDropChance(inst){
  const q = inst.qual;
  if(q==="藍") return 0; // 不掉
  if(q==="黃") return 0.20;
  if(q==="橘") return 0.30;
  if(q==="紫"){
    const s = inst.stars||0;
    return (s===0?0.40 : [0.45,0.50,0.55,0.60,0.65][Math.min(s,5)-1]);
  }
  return 0;
}

  /* 失敗降階機率
  function failDropChance(qual){
    if(qual==="藍") return 0.50;
    if(qual==="黃") return 0.65;
    if(qual==="橘") return 0.75;
    if(qual === "神器") return 0.85;   // ★ 新增：神器失敗多半會掉階
    return 1.0;
  }*/
  //強化費用
function enhCost(inst){
  const p = inst.plus || 0;       // +0～+9
  const s = inst.stars || 0;      // ☆0～5
  const q = inst.qual || "";      // 品質

  // 品質基礎價格
  const tierCost = {
    藍:200,
    黃:500,
    橘:1200,
    紫:3000,
    神器:4000   // ← 神器改成依品質判斷，不看名字
  };

  // 若找不到 → base=0（白／綠不可強化會被外層擋掉）
  const base = tierCost[q] || 0;

  // 星數倍率：每 1☆ 多 +0.5 倍
  const starMul = 1 + 0.5 * s;

  // 強化費用： (base + plus*100) * 星數倍率
  return Math.round((base + p * 100) * starMul);
}


enhBtnDo.onclick=()=>{
  const inst = getEquipInstance(enhTargetId);
  if(!inst) return;

  const cost = enhCost(inst);
  if(game.player.gold < cost){
    say("金幣不足。");
    return;
  }

// 神器規則另外處理
if(inst.qual && inst.qual.startsWith("神器")){
  const p = inst.plus || 0;
  const s = inst.stars || 0;
  const rate = ENH_RATE.神器(p, s);

  game.player.gold -= cost;

  if(Math.random() < rate){
    // 成功：+1 並加屬性
    inst.plus = p + 1;
    const d = PLUS_DELTA.神器;
    if(d){
      inst.atk += d.atk;
      inst.def += d.def;
      inst.hp  += d.hp;
      inst.mp  += d.mp;
    }

    if(inst.plus >= 10){
      inst.stars = Math.min(5, s + 1);
      inst.plus  = 0;
      say(`🟥 神器升星成功 → ${inst.stars}☆！`);
    }else{
      say(`🟥 神器強化成功：+${inst.plus}`);
    }
    }else{
    const fb = FAIL_BEHAVIOR.神器(s);
    if(Math.random() < fb.rate){
      // 有機會掉階：+ 等級下降，同時扣回對應的屬性
      if(p > 0){
        inst.plus = p - 1;

        const d = PLUS_DELTA.神器;
        if(d){
          inst.atk -= d.atk;
          inst.def -= d.def;
          inst.hp  -= d.hp;
          inst.mp  -= d.mp;
        }

        say(`❌ 神器強化失敗，降為 +${inst.plus}`);
      }else{
        // 已經是 +0 就只提示，不再扣
        say("❌ 神器強化失敗，但已是 +0。");
      }
    }else{
      // 保級：什麼都不變
      say("❌ 神器強化失敗（保級）。");
    }
  }

  // 🔻 不論成功 / 失敗，都把 ㄅㄅㄐ  buff 清掉
  if(!game.buffs) game.buffs = {xpLayers:[], artiHammer:0};
  game.buffs.artiHammer = 0;

  recomputeStats(false);
  renderEnhancePanel();
  render();
  autosave();
  return;
}


  // 🟦 其他品質：只能強化 藍 / 黃 / 橘 / 紫
  if(!["藍","黃","橘","紫"].includes(inst.qual)){
    say("此品階不可強化。");
    return;
  }

  game.player.gold -= cost;
  const ch = enhChance(inst);
  if(Math.random() < ch){
    // 成功：+1 並加屬性
    inst.plus = (inst.plus || 0) + 1;
    const delta = PLUS_DELTA[inst.qual];
    inst.atk += delta.atk;
    inst.def += delta.def;
    inst.hp  += delta.hp;
    inst.mp  += delta.mp;

    if(inst.plus >= 10){
      const progress = onReachPlusTen(inst); // 升階或升星
      if(progress) say(`🌈 ${progress}！`);
    } else {
      say(`✅ 強化成功：<b>+${inst.plus}</b>（${inst.qual}）`);
    }
    recomputeStats(false);
  }else{
    // 失敗：依規則是否掉階
    const beforePlus = inst.plus || 0;
    const dropP = failDropChance(inst);
    if (beforePlus > 0 && Math.random() < dropP) {
      inst.plus = beforePlus - 1;
      const d = PLUS_DELTA[inst.qual];
      if (d) {
        inst.atk -= d.atk;
        inst.def -= d.def;
        inst.hp  -= d.hp;
        inst.mp  -= d.mp;
      }
      say(`❌ 強化失敗，降為 +${inst.plus}。`);
    } else {
      say(`❌ 強化失敗，但等級不變（保底）。`);
    }
    recomputeStats(false);
  }
  renderEnhancePanel();
  render();
  autosave();
};

  if(enhBtnCombine){
  enhBtnCombine.onclick = ()=>{
    if(!enhTargetId) return;
    const inst = getEquipInstance(enhTargetId);
    if(!inst) return;

    const q = inst.qual || "白";
    // 藍以上就不允許用「合成」了，只能強化
    if(QUALITY_ORDER[q] >= QUALITY_ORDER["藍"]){
      say("已達合成上限（藍品以上請用強化）。");
      return;
    }

    const need = 3;              
    // 1) 先合成，拿到新裝備 id
    const newId = combineEquip(enhTargetId, need);
    if(!newId) return; // 合成失敗就不動

    // 2) 自動穿上新裝備（用你原本的 equipItem 邏輯）
    equipItem(newId);

    // 3) 更新強化目標，讓面板顯示新裝備
    enhTargetId = newId;
    renderEnhancePanel();
  };
}


  // 詞條追加
  function addRandomAffix(inst){
    // 避免重複同 key（可重複則移除此判斷）
    const candidates = AFFIX_LIB.filter(a=>!inst.affix.some(x=>x.key===a.key));
    if(candidates.length===0) return;
    const pick = candidates[rnd(0,candidates.length-1)];
    const val = rnd(pick.min, pick.max);
    inst.affix.push({key:pick.key,val});
  }
// ===========================================
// [PATCH] 批量抽詞綴：連續呼叫 addRandomAffix N 次
// 放置位置：建議貼在 addRandomAffix(inst) 定義「後面」
// ===========================================
function addRandomAffixN(inst, n){
  n = (n|0);
  if (n <= 0) return;

  if (typeof addRandomAffix === "function"){
    for (let i = 0; i < n; i++) addRandomAffix(inst);
    return;
  }

  // ---- 安全後備：萬一你的專案沒有定義 addRandomAffix() ----
  if (!inst.affixes) inst.affixes = [];
  const pool = Object.keys(window.AFFIX_LIB || {});
  for (let i = 0; i < n; i++){
    // 避免重複同 key 詞綴（依你的結構微調）
    const cand = pool.filter(k => !inst.affixes.some(a => a.key === k));
    if (!cand.length) break;

    const key = cand[Math.floor(Math.random() * cand.length)];
    const roll = (window.AFFIX_LIB || {})[key];
    let val = 1;

    if (typeof roll === "function") {
      // 若你的詞綴是函式型，給它 inst 讓它能依裝備狀態滾值
      val = roll(inst);
    } else if (roll && typeof roll.min === "number" && typeof roll.max === "number") {
      val = Math.floor(Math.random() * (roll.max - roll.min + 1)) + roll.min;
    }
    inst.affixes.push({ key, val });
  }
}



  
  // 傷害修飾
  function effectiveEnemyDef(e,p){
  if(!e) return 0;
  let def = e.def;

  // 技能造成的防禦下降（例如破甲斬 -80%）
  if(e.defDown && e.defDown > 0){
    def = Math.floor(def * (1 - e.defDown));
  }

  // 詞條「破甲」再額外 -20%
  const w = getEquippedWithAffix(p);
  if(w?.affix?.some(a=>a.key==="shred")){
    def = Math.floor(def * 0.8);
  }

  return Math.max(0, def);
}

  function getEquippedWithAffix(p){
    const ids=[p.equip.weapon,p.equip.armor,p.equip.acc].filter(Boolean);
    for(const id of ids){ const inst=getEquipInstance(id); if(inst && inst.affix && inst.affix.length) return inst; }
    return null;
  }
  function critMaybe(p,base){
    const w = getEquippedWithAffix(p);
    let critRate=5; // 基礎 5%
    if(w?.affix?.some(a=>a.key==="crit")) critRate+=5;
    const isCrit = Math.random()*100 < critRate;
    return isCrit ? Math.floor(base*1.8) : base;
  }
  function tryCombo(p,e){
    const w = getEquippedWithAffix(p);
    if(!w) return;

    // 有「連擊」詞條才觸發
    if(w.affix?.some(a => a.key === "combo")){
      // 觸發率從 25% 降到 15%，比較不逆天
      if(Math.random() * 100 < 15){
        const effDef = effectiveEnemyDef(e,p);
        let extra = Math.max(1, rnd(p.atk-2, p.atk+2) - effDef);

        // 降到約 7 成傷害，當作半顆被動技能
        extra = Math.floor(extra * 0.5);
        extra = critMaybe(p, extra);

        e.hp = clamp(e.hp - extra, 0, e.maxhp);
        say(`🔁 連擊觸發！追加傷害 <span class="hp">-${extra}</span>。`);
      }
    }
  }

   function affixOnHit(p,e,damage){
    // ✅ 沒有敵人就別處理詞條
    if(!e) return;
    const w = getEquippedWithAffix(p); 
    if(!w) return;

    w.affix.forEach(a=>{
      // 吸血：依「本次傷害」的 2~4%，且加上上限，避免一刀吸太多
      if(a.key === "lifesteal"){
        // 舊存檔如果以前是 5~10，這裡會被夾成 2~4，避免太超過
        const percent = Math.max(2, Math.min(a.val, 4)); // 2% ~ 4%
        let heal = Math.floor(damage * percent / 100);

        // 單次最多回 20% maxHP，順便避免一刀回滿
        const cap  = Math.floor(p.maxhp * 0.20);
        heal = Math.min(heal, cap, damage);

        if(heal > 0){
          p.hp = clamp(p.hp + heal, 0, p.maxhp);
          say(`🩸 吸血回復 <b>${heal} HP</b>。`);
        }
      }

      // 中毒：依「玩家攻擊力」的 10~18% 當成 DOT，至少 3 回合
      if(a.key === "poison"){
        // 舊存檔如果之前是 2~5，這裡會被拉高到至少 8%，不會太廢
        const percent = Math.max(8, Math.min(a.val, 18)); // 8% ~ 18%
        const dot = Math.max(1, Math.floor(p.atk * percent / 100));

        e.dot = dot;
        e.dotTurns = Math.max(3, e.dotTurns || 0); // 至少 3 回合
        say(`☠️ ${e.name} 中毒了，每回合將損失約 <b>${dot}</b> HP（${e.dotTurns} 回合）。`);
      }
    });
  }


    /* ========= 商店 ========= */

  const shopDlg = $("#shopDlg"),
        buyList = $("#shopBuyList"),
        sellList = $("#shopSellList");
  // HTML 裡已經拿掉 restockBtn，但這裡保留變數，不會壞（是 null）
  const restockBtn = $("#restockBtn");

  // 商店目前的顯示分類（all / equip / consum / mount / enh）
  let shopCategory = "all";

  // 開啟商店：只要初始化一次商品清單即可，之後不限制庫存
  function openShop(){
    if(game.state.inBattle) return say("戰鬥中無法逛街！");
    ensureStock();
    renderShop();
    shopDlg.showModal();
  }

  // 只把 shopCatalog 複製成固定清單，不再有 qty / 補貨
  function ensureStock(){
    if(!game.shop.stock || game.shop.stock.length === 0){
      game.shop.stock = shopCatalog.map(x => ({
        name:  x.name,
        type:  x.type,   // equip / consum / mount / 之後也可以加 enh
        price: x.price
      }));
    }
  }

  // 依分類判斷要不要顯示
  function matchShopCategory(s, cat){
    if(cat === "all") return true;

    if(cat === "equip")  return s.type === "equip";
    if(cat === "consum") return s.type === "consum";
    if(cat === "mount")  return s.type === "mount";

    // 強化道具：預留給之後 type === "enh" 或名稱含關鍵字都可以
    if(cat === "enh"){
      return s.type === "enh" || /錘|鎚|強化|神器碎片/.test(s.name);
    }
    return true;
  }

  function renderShop(){
    $("#shopGold").textContent = game.player.gold;
    buyList.innerHTML = "";

    // 依目前分類篩選
    const list = (game.shop.stock || []).filter(s => matchShopCategory(s, shopCategory));

    if(list.length === 0){
      buyList.innerHTML = `<div class="row"><span class="muted">目前沒有此分類的商品。</span></div>`;
    }else{
      list.forEach(s=>{
        const row = document.createElement("div");
        row.className = "row";

        let desc = "";
        if(s.type === "equip"){
          const tpl = EQUIPS[s.name];
          if(tpl){
            desc = `｜白品｜ATK ${tpl.atk||0} DEF ${tpl.def||0} HP ${tpl.hp||0} MP ${tpl.mp||0}`;
          }else{
            desc = "｜裝備";
          }
        }
        if(s.type === "mount"){
          const tpl = MOUNTS[s.name] || {};
          desc = `｜坐騎｜ATK ${tpl.atk||0} DEF ${tpl.def||0} HP ${tpl.hp||0} MP ${tpl.mp||0}｜SPD ${tpl.spd||0}`;
        }
        if(s.type === "consum"){
          desc = `｜消耗品${s.name==="經驗加倍捲"?"（5 日加倍，可疊加）":""}`;
        }
        if(s.type === "enh" && !desc){
          desc = "｜強化道具";
        }

        row.innerHTML = `
          <div>
            <b>${s.name}</b>
            <span class="tag">${desc}</span><br>
            <span class="tag">價格：${s.price}G（庫存不限）</span>
          </div>
        `;

        const buyBtn = btn("購買", ()=>buyFromShop(s));
        row.appendChild(buyBtn);
        buyList.appendChild(row);
      });
    }

    renderSellList();
  }

  // ✅ 購買時可以輸入數量，不再限制庫存
  function buyFromShop(s){
    const price = s.price || 0;

    let q = prompt(`要購買多少個「${s.name}」？`, "1");
    if(q === null) return;        // 取消
    q = parseInt(q, 10);
    if(!Number.isFinite(q) || q <= 0){
      alert("數量要是正整數喔。");
      return;
    }

    // 坐騎通常只需要 1 個，這裡限制為 1
    if(s.type === "mount"){
      q = 1;
    }

    const total = price * q;
    if(game.player.gold < total){
      alert("金幣不足");
      return;
    }

    game.player.gold -= total;

    if(s.type === "consum"){
      addInv(s.name, q);
      say(`🛒 買下 <b>${s.name}</b> ×${q}（-${total}G）。`);
    }else if(s.type === "equip"){
      for(let i=0;i<q;i++) addEquipToInv(s.name,"白");
      say(`🛒 買下 <b>${s.name}</b> ×${q}（-${total}G）。`);
    }else if(s.type === "mount"){
      addMountToInv(s.name);
      say(`🛒 買下坐騎 <b>${s.name}</b>（-${total}G）。`);
    }else if(s.type === "enh"){
      addInv(s.name, q);
      say(`🛒 買下 <b>${s.name}</b> ×${q}（-${total}G）。`);
    }

    $("#shopGold").textContent = game.player.gold;
    render();
    renderShop();
  }

  // ====== 販售（支援輸入數量＋一鍵賣出） ======

  function renderSellList(){
    sellList.innerHTML = "";
    const entries = Object.entries(game.inv);
    if(entries.length === 0){
      sellList.innerHTML = `<div class="row"><span class="muted">沒有可販售的物品。</span></div>`;
      return;
    }

    entries.forEach(([name,count])=>{
      if(count <= 0) return;

      const price = sellPrice(name);
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `<div><b>${displayInvName(name)}</b> × ${count} <span class="tag">— 單價 ${price}G</span></div>`;

      // 1 個、輸入數量、全部賣出
      row.append(
        btn("賣出 1 個", ()=>sellItem(name,1,price)),
        btn("輸入數量", ()=>{
          let q = prompt(`要賣出多少個「${displayInvName(name)}」？（最多 ${count}）`, String(count));
          if(q === null) return;
          q = parseInt(q,10);
          if(!Number.isFinite(q) || q <= 0){
            alert("數量要是正整數喔。");
            return;
          }
          q = Math.min(q, count);
          sellItem(name,q,price);
        }),
        btn("全部賣出", ()=>sellItem(name,count,price))
      );

      sellList.appendChild(row);
    });
  }

  function sellPrice(name){
    // 🧩 神器碎片：固定售價 500G
    if(name.includes("神器碎片")) return 500;

    const meta = invMeta(name);
    if(meta.type === "consum"){
      return Math.max(1, Math.floor((shopCatalog.find(x=>x.name===name)?.price || 4) * 0.5));
    }
    if(meta.type === "mount"){
      return 5000;
    }
    if(meta.type === "equip"){
      const eq = getEquipInstance(name);
      if(!eq) return 5;
      const affixScore = (eq.affix || []).length * 20;
      const base = 20 + QUALITY_ORDER[eq.qual] * 40 + (eq.plus || 0) * 10 + affixScore;
      return Math.max(5, base);
    }
    if(meta.type === "book"){
      return 8;
    }
    return 1;
  }

  function sellItem(name, cnt, price){
    const real = Math.min(cnt, game.inv[name] || 0);
    if(real <= 0) return;
    decInv(name, real);
    const got = real * price;
    game.player.gold += got;
    say(`💰 賣出 <b>${displayInvName(name)}</b> ×${real}，獲得 <b>${got}G</b>。`);
    render();
    renderSellList();
    $("#shopGold").textContent = game.player.gold;
  }

  function sellSingle(name){
    sellItem(name, 1, sellPrice(name));
    renderInventoryList();
  }

  // 一鍵賣出：依照下拉選單設定的條件批量處理
  function bulkSellByFilter(mode){
    if(!mode || mode === "none") return;

    let totalGold = 0;
    let totalCount = 0;

    for(const [name, count] of Object.entries(game.inv)){
      if(count <= 0) continue;
      if(!matchBulkSell(name, mode)) continue;

      const price = sellPrice(name);
      const real = count;
      decInv(name, real);
      const got = real * price;
      totalGold += got;
      totalCount += real;
    }

    if(totalCount > 0){
      game.player.gold += totalGold;
      say(`💰 一鍵賣出 ${totalCount} 件物品，獲得 <b>${totalGold}G</b>。`);
      render();
      renderSellList();
      $("#shopGold").textContent = game.player.gold;
    }else{
      say("沒有符合條件的物品可賣出。");
    }
  }

  // 判斷某個物品是否符合一鍵賣出的條件
  function matchBulkSell(name, mode){
    const meta = invMeta(name);

    if(mode === "consum"){
      return meta.type === "consum";
    }

    if(mode.endsWith("Equip")){
      if(meta.type !== "equip") return false;
      const inst = getEquipInstance(name);
      if(!inst) return false;

      if(mode === "whiteEquip") return inst.qual === "白";
      if(mode === "greenEquip") return inst.qual === "綠";
      if(mode === "blueEquip")  return inst.qual === "藍";
    }

    return false;
  }
  // 🔧 補貨按鈕：HTML 已經拿掉，這裡留著不做事（保留舊存檔相容性）
  if(restockBtn){
    restockBtn.onclick = ()=>{
      // 不再補貨，只提示一次
      alert("現在商店庫存不限，不需要補貨囉。");
    };
  }
  /* ========= 任務 ========= */  
  // 依等級解鎖可接受任務（從 locked → available）
  function refreshQuestsForLevel(lvl){
    if(!Array.isArray(game.quests)) return;
    game.quests.forEach(q=>{
      const need = q.minLvl || 1;
      if(q.state === "locked" && lvl >= need){
        q.state = "available";
      }
    });
  }

  // 計算指定品質裝備數量（綠 / 藍）
  function countEquipsByQuality(qual){
    let cnt = 0;
    for(const [k,v] of Object.entries(game.inv)){
      if(!k.startsWith("E#") || v<=0) continue;
      const inst = getEquipInstance(k);
      if(inst && inst.qual === qual){
        cnt += v;
      }
    }
    return cnt;
  }

  // 由背包中扣除指定品質裝備（用於任務提交）
  function removeEquipsByQuality(qual, need){
    if(need <= 0) return true;
    const toRemove = [];
    for(const [k,v] of Object.entries(game.inv)){
      if(!k.startsWith("E#") || v<=0) continue;
      const inst = getEquipInstance(k);
      if(!inst || inst.qual !== qual) continue;
      const use = Math.min(v, need);
      if(use > 0){
        toRemove.push([k, use]);
        need -= use;
        if(need <= 0) break;
      }
    }
    if(need > 0) return false;
    toRemove.forEach(([k,c])=>decInv(k,c));
    return true;
  }

  function findQuestDef(id){
    return QUEST_DB.find(d=>d.id === id);
  }

  // 將任務獎勵物件轉成可閱讀字串
  function formatQuestReward(r){
    if(!r) return "無";
    const parts = [];
    if(r.exp)  parts.push(`EXP ${r.exp}`);
    if(r.gold) parts.push(`${r.gold} G`);
    if(r.item){
      const c = r.itemCount || 1;
      parts.push(`${r.item} ×${c}`);
    }
    if(r.items){
      for(const [name,c] of Object.entries(r.items)){
        parts.push(`${name} ×${c}`);
      }
    }
    return parts.join("、");
  }  
// ✅ 遊戲載入或需要時檢查：如果所有任務都已領獎，就刷新一輪
function refreshQuestsIfAllRewarded(){
  const qs = Array.isArray(game.quests) ? game.quests : [];
  if(qs.length === 0) return; // 沒任務就先不管，通常 init 會自己 seed

  const allRewarded = qs.every(q => q.state === "rewarded");
  if(allRewarded){
    say("📜 檢測到所有任務都已完成，已刷新新一輪任務！");
    seedQuests();
    renderQuestList();
    autosave();
  }
}  
  function renderQuestList(){
    const box = $("#questList");
    box.innerHTML = "";
    if(!Array.isArray(game.quests) || game.quests.length === 0){
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = "<div>目前沒有任務。</div>";
      box.appendChild(row);
      return;
    }
    game.quests.forEach(q=>{
      const row = document.createElement("div");
      row.className = "row";

      let st;
      switch(q.state){
        case "done":      st = "✅ 可領取"; break;
        case "active":    st = "🟡 進行中"; break;
        case "rewarded":  st = "✔ 已完成"; break;
        case "available": st = "📜 可接受"; break;
        default:          st = "🔒 未解鎖"; break;
      }
      const needSubmitBtn = (q.state === "active") &&
        (q.req?.submitItems || q.req?.submitEquip);

            row.innerHTML = `
        <div>
          <b>${q.name}</b> <span class="tag">${st}</span><br>
          <span class="muted">${q.desc}</span><br>
          <span class="tag">${formatQuestProgress(q)}</span><br>
          <span class="tag">獎勵：${formatQuestReward(q.reward)}</span><br>
          ${q.state === "available"
            ? `<button class="btn tiny" data-act="accept" data-qid="${q.id}">接受</button>`
            : ""}
          ${needSubmitBtn
            ? `<button class="btn tiny" data-act="submit" data-qid="${q.id}">提交</button>`
            : ""}
          ${q.state === "done"
            ? `<button class="btn tiny" data-act="reward" data-qid="${q.id}">領取獎勵</button>`
            : ""}
        </div>
      `;
      row.onclick = (ev)=>{
        const btn = ev.target.closest("button[data-act]");
        if(!btn) return;
        const act = btn.dataset.act;
        const id  = btn.dataset.qid;
        const qq  = game.quests.find(x=>x.id === id);
        if(!qq) return;
        if(act === "accept")      acceptQuest(qq);
        else if(act === "submit") trySubmitQuest(qq);
        else if(act === "reward") claimQuestReward(qq);
        renderQuestList();
        autosave();
      };
      box.appendChild(row);
    });
  }

  function formatQuestProgress(q){
    const req = q.req || {};
    // 擊殺任意怪物
    if(req.killAny){
      const cur = q.progress?.killAny || 0;
      return `擊敗任意怪物：${cur} / ${req.killAny}`;
    }
    // 提交指定道具
    if(req.submitItems){
      const parts = [];
      for(const [name,need] of Object.entries(req.submitItems)){
        const have = game.inv[name] || 0;
        parts.push(`${name}：${have} / ${need}`);
      }
      return "提交道具：" + parts.join("，");
    }
    // 提交指定品質裝備
    if(req.submitEquip){
      const parts = [];
      if(req.submitEquip.green){
        const g = countEquipsByQuality("綠");
        parts.push(`綠裝：${g} / ${req.submitEquip.green}`);
      }
      if(req.submitEquip.blue){
        const b = countEquipsByQuality("藍");
        parts.push(`藍裝：${b} / ${req.submitEquip.blue}`);
      }
      return "提交裝備：" + parts.join("，");
    }
    return "—";
  }
  function acceptQuest(q){
    if(q.state !== "available") return;
    q.state = "active";
    if(!q.progress) q.progress = {};
    say(`📜 接受任務：<b>${q.name}</b>`);
  }
  function trySubmitQuest(q){
    if(q.state !== "active") return;
    const req = q.req || {};

    // 提交道具
    if(req.submitItems){
      for(const [name,need] of Object.entries(req.submitItems)){
        const have = game.inv[name] || 0;
        if(have < need){
          say(`❌ ${name} 不足，還需要 ${need - have} 瓶。`);
          return;
        }
      }
      // 扣除
      for(const [name,need] of Object.entries(req.submitItems)){
        decInv(name, need);
      }
      q.state = "done";
      say(`📦 你已提交任務道具，<b>${q.name}</b> 已可領取獎勵。`);
      return;
    }

    // 提交裝備
    if(req.submitEquip){
      if(req.submitEquip.green){
        const okG = removeEquipsByQuality("綠", req.submitEquip.green);
        if(!okG){
          const cur = countEquipsByQuality("綠");
          say(`❌ 綠裝不足，還需要 ${req.submitEquip.green - cur} 件。`);
          return;
        }
      }
      if(req.submitEquip.blue){
        const okB = removeEquipsByQuality("藍", req.submitEquip.blue);
        if(!okB){
          const cur = countEquipsByQuality("藍");
          say(`❌ 藍裝不足，還需要 ${req.submitEquip.blue - cur} 件。`);
          return;
        }
      }
      q.state = "done";
      say(`📦 你已提交裝備，<b>${q.name}</b> 已可領取獎勵。`);
    }
  }
 function claimQuestReward(q){
    if(q.state !== "done") return;

    // 發放獎勵
    grantReward(q.reward);
    q.state = "rewarded";

    // 顯示這次任務的獎勵內容
    const text = formatQuestReward(q.reward);
    say(`🎉 任務完成：<b>${q.name}</b>！獲得獎勵：<b>${text}</b>`);

    // 🌟 檢查是否所有任務已領獎，如果是就刷新
    refreshQuestsIfAllRewarded();
  }
  // 擊殺任意怪物的進度更新
  function updateQuestProgressOnKill(name){
    if(!Array.isArray(game.quests)) return;
    game.quests.forEach(q=>{
      if(q.state !== "active") return;
      const req = q.req || {};
      if(req.killAny){
        if(!q.progress) q.progress = {};
        const cur = q.progress.killAny || 0;
        q.progress.killAny = cur + 1;
        if(q.progress.killAny >= req.killAny){
          q.state = "done";
          say(`📜 任務完成：<b>${q.name}</b>！請回任務欄領取獎勵。`);
        }
      }
    });
  }

  // 目前只給 killAny 任務用；預留未來擴充
  function checkQuestDone(q){
    const req = q.req || {};
    if(req.killAny){
      const cur = q.progress?.killAny || 0;
      if(cur >= req.killAny){
        q.state = "done";
      }
    }
  }

  function grantReward(r){
    if(!r) return;
    if(r.exp)  gainExp(r.exp);
    if(r.gold) game.player.gold += r.gold;

    // 單一物品
    if(r.item){
      const c = r.itemCount || 1;
      addInv(r.item, c);
      say(`🎁 獲得 ${r.item} ×${c}`);
    }

    // 多個物品
    if(r.items){
      for(const [name,c] of Object.entries(r.items)){
        addInv(name, c);
        say(`🎁 獲得 ${name} ×${c}`);
      }
    }
    render();
    autosave();
  }

  /* ========= 轉職 ========= */
 function checkUnlocks(){
  const p=game.player; const t=p.tier||0; const nextReq=CLASS_REQ[t];
  if(nextReq && p.lvl>=nextReq){
    $("#classBtn").disabled=false;
    say("🏷️ 你感受到職業之力在共鳴，<b>可以轉職</b>了！");
  }
  // ★ 200 等解鎖轉生
  if(p.lvl >= 200){
    $("#rebirthBtn").disabled = false;
    // 可避免一直刷訊息：只在從未開啟→開啟的瞬間提示
    if(!checkUnlocks.__tipped){
      say("♻️ 你的靈魂在顫動，<b>可以轉生</b>了！");
      checkUnlocks.__tipped = true;
    }
  }
}

  function openClass(){
    const p=game.player, t=p.tier||0, nextReq=CLASS_REQ[t];
    const list=$("#classList"); list.innerHTML="";
    if(!nextReq){ $("#classHint").textContent="已達最高轉職段。"; }
    else if(p.lvl<nextReq){ $("#classHint").textContent=`需要 Lv.${nextReq} 才能進行下一次轉職。`; }
    else{
      $("#classHint").textContent="選擇你的道路（一次性，每段一次）。";
      const candidates = classCandidatesForTier(t+1);
      candidates.forEach(c=>{
        const row=document.createElement("div"); row.className="row";
        row.innerHTML=`<div><b>${c.name}</b> <span class="tag">— 轉職後學會：${c.start.map(id=>SKILL[id].name).join("、")}｜武器：${(JOB_WEAPON[c.key]||[]).join("/")}</span></div>`;
        row.appendChild(btn("選擇",()=>chooseClass(c.key))); list.appendChild(row);
      });
    }
    classDlg.showModal();
  }
  function classCandidatesForTier(tier){
    if(tier===1) return JOB_TREE.filter(j=>j.tier===1||j.tier===2||j.tier===3);
    if(tier===4) return JOB_TREE.filter(j=>j.key==="Paladin");
    return JOB_TREE.filter(j=>j.key===game.player.job);
  }
  function chooseClass(key){
  const p=game.player, t=p.tier||0, need=CLASS_REQ[t];
  if(!need){ return say("已無更高轉職。"); }
  if(p.lvl<need){ return say(`❌ 需要 Lv.${need} 才能轉職。`); }

  const cls=JOB_TREE.find(j=>j.key===key);
  if(!cls) return;

  // ① 保留轉職前 HP/MP 百分比
  const hpRatio = Math.max(0, Math.min(1, p.hp / Math.max(1, p.maxhp)));
  const mpRatio = Math.max(0, Math.min(1, p.mp / Math.max(1, p.maxmp)));

  // ② 不重置數值模板；僅切換職業/段數、發放起始技能
  p.job = key;
  p.tier = t + 1;
  cls.start.forEach(id=>{ if(!p.learned[id]) p.learned[id]=1; });

  // ③ 設定/疊加轉職獎勵（可自行調整）
  //    建議：第一段轉職就送這個倍率；之後每次轉職都「疊加」。
  const ADD = { hp:1.10, mp:1.10, atk:1.05, def:1.05 }; // ← 想調整就改這裡
  p.jobBonus = p.jobBonus || {hp:0, mp:0, atk:0, def:0};
  p.jobBonus.hp  += ADD.hp;
  p.jobBonus.mp  += ADD.mp;
  p.jobBonus.atk += ADD.atk;
  p.jobBonus.def += ADD.def;

  // 重新計算，並依比例恢復血魔
  recomputeStats(false);
  p.hp = clamp(Math.floor(p.maxhp * hpRatio), 1, p.maxhp);
  p.mp = clamp(Math.floor(p.maxmp * mpRatio), 0, p.maxmp);

  say(`🏷️ 你成為了 <b>${cls.name}</b>！
✅ 屬性獎勵：HP +${Math.round(ADD.hp*100)}%、MP +${Math.round(ADD.mp*100)}%、攻防 +${Math.round(ADD.atk*100)}% / +${Math.round(ADD.def*100)}%（可累積）`);
  $("#classBtn").disabled=true;
  classDlg.close();
  render(); autosave();
}

  /* ========= 掛機 ========= */
  let afkTimer=null;
  function toggleAFK(){
    game.player.afk=!game.player.afk;
    $("#afkBtn").textContent = game.player.afk? "🤖 掛機：開" : "🤖 掛機：關";
    if(game.player.afk){
      if(afkTimer) clearInterval(afkTimer);
      afkTimer=setInterval(()=>afkTick(), 1000);
      say("🤖 掛機已開啟。");
    }else{
      if(afkTimer) clearInterval(afkTimer), afkTimer=null;
      say("🛑 掛機已關閉。");
    }
  }
// [FIX] 掛機主迴圈：不在戰鬥時要主動探索；在戰鬥時才打與判定
function afkTick(){
  const st = game.state;

  // [FIX] 安全善後：旗標與敵人不同步時，結束戰鬥避免技能空放
  if(st.inBattle && (!st.enemy || st.enemy.hp <= 0)){
    endBattle(true);
    return;
  }

  // [FIX] 不在戰鬥 → 立刻探索以觸發新戰鬥
  if(!st.inBattle){
    explore();
    return;
  }

  // 執行到這裡代表「正在戰鬥」且有敵人
  const p = game.player;
  const e = st.enemy;
  if(!e){ 
    // 理論上不會到這，但保險
    endBattle(false);
    return;
  }

   // ✅ 自動用藥（支援小/中/大/特級）與回魔
  if( autoUseHeal() ) return;
  if( autoUseMana() ) return;

  // ✅ 自動釋放主動技能：失敗時改用普通攻擊
  const usedSkill = useActiveSkill();   // 會回傳 true / false

  if(!usedSkill){
    // MP 不足 / 沒有技能可用 → 用普通攻擊頂上，避免掛機卡死
    playerAttack();
  }
  // ✅ 勝負判定
  if(st.enemy && st.enemy.hp <= 0){
    endBattle(true);
    return;
  }
}  
// ==========================
// ♻️ 轉生功能
// ==========================
function doRebirth(){
  const p = game.player;
  if(p.lvl < 200){ say("尚未達到 200 等，不能轉生。"); return; }
  if(game.state.inBattle){ say("戰鬥中不可轉生。"); return; }

  const hpR = Math.max(0, Math.min(1, p.hp / Math.max(1, p.maxhp)));
  const mpR = Math.max(0, Math.min(1, p.mp / Math.max(1, p.maxmp)));

  p.rebirths = (p.rebirths||0) + 1;
  p.lvl = 1;
  p.exp = 0;

  game.state.inBattle = false;
  game.state.enemy = null;

  recomputeStats(true);
  p.hp = clamp(Math.floor(p.maxhp * hpR), 1, p.maxhp);
  p.mp = clamp(Math.floor(p.maxmp * mpR), 0, p.maxmp);

  say(`♻️ <b>轉生成功！</b>（第 ${p.rebirths} 次）基礎素質永久提升：HP/MP/攻擊/防禦 各 +10。`);
  $("#rebirthBtn").disabled = true;
  rebirthDlg.close();
  render(); autosave();
}

  /* ========= 說明 ========= */
  function openHelp(){
    const box=$("#helpBox");
    box.innerHTML=`
      <b>功能總覽</b><br>
      • 網頁偽裝：按 Esc 先關對話框，再切換儀表板/報表模式，讓你上班免煩惱。<br>
      • 掛機：按「🤖 掛機」開關；每 1 秒自動探索/戰鬥，血/魔自動用藥。<br>
      • 地圖：每 10 等一張地圖，另設有BOSS地圖。<br>
      • 轉職：Lv10/30/70/120 四轉；轉職發放專屬技能。<br>
      • 商店：只賣白品裝備、消耗品與戰馬（10,000G）。<b>經驗加倍捲</b>（100G，5 日，可疊加）。<br>
      • 藥水：治療與魔力藥水皆可 2 合 1（小→中→大→特級）。特級：治療回 50% HP、魔力回 50% MP。<br>
      • 裝備品質：白/綠/藍/黃/橘/紫/神器（紅）；白→綠→藍可用合成（同名 3 件）。<br>
      • 強化：藍品以上可強化；成功率依品質與等級表；失敗時有機率 -1。+10升下一品質。<br>
      • 詞條：藍→黃、黃→橘時各追加 1 條詞條（吸血/中毒/爆擊/連擊/破甲）。<br>
      • 技能：基礎技能書怪物可掉；技能最高 25，滿級可升品質並重置。<br>
      • 經驗：每層加倍捲 = +100% EXP，可疊加，按「日數」遞減。死亡損失 50% EXP、20% 金幣。<br>
      • 任務：解任務可獲得[錢袋]來挑戰人品吧。<br>
      • Boss：5% 掉專屬坐騎；0.5% 掉 <span class="arti-name">[神器☆名稱]</span>（隨機屬性）。<br>
      <br>
      <b>怪物與掉落（當前地圖）</b><br>
      ${currentZone().pool.map(m=>`・${m.name}`).join("、")}<br>
    `;
    helpDlg.showModal();
  }

  /* ========= XP 加倍捲 ========= */
  function addXpBuff(days){ for(let i=0;i<1;i++) game.buffs.xpLayers.push(days); autosave(); } // 一次使用一層
  function activeXpBuffs(){ return game.buffs.xpLayers.filter(d=>d>0).length; }
  function advanceDay(n){
    for(let i=0;i<n;i++){
      game.state.day+=1;
      game.buffs.xpLayers = game.buffs.xpLayers.map(d=>Math.max(0,d-1));
    }
    const left = activeXpBuffs();
    say(`☀️ 日數推進至 Day ${game.state.day}（加倍層數 ${left}）`);
  }

  /* ========= 綁定 ========= */
  const mapDlg=$("#mapDlg"), classDlg=$("#classDlg"), questDlg=$("#questDlg"), skillDlg=$("#skillDlg"),
        shopClose1=$("#closeShop"), shopClose2=$("#closeShop2"),
        shopTabs=[...document.querySelectorAll("#shopDlg .tab")],
        shopCatBtns=[...document.querySelectorAll(".shopCatBtn")],
        bulkSellFilter=$("#bulkSellFilter"),
        bulkSellBtn=$("#bulkSellBtn"),
        helpDlg=$("#helpDlg");


  $("#exploreBtn").onclick=explore;
  $("#restBtn").onclick=rest;
  $("#battleBtn").onclick=startBattle;
  $("#attackBtn").onclick=playerAttack;
  $("#skillBtn").onclick=useActiveSkill;
  $("#invBtn").onclick=()=>openInventory();
  $("#runBtn").onclick=tryRun;

$("#saveBtn").onclick = ()=>{
  autosave();
  say("💾 存檔成功！");
};
$("#resetBtn").onclick=()=>{ if(confirm("確定要重開？會清除存檔與商店庫存。")){ localStorage.removeItem(LKEY); location.reload(); } };
$("#questBtn").onclick=()=>{ renderQuestList(); questDlg.showModal(); };

 const rebirthDlg = $("#rebirthDlg");
const doRebirthBtn = $("#doRebirthBtn");
  $("#classBtn").onclick=()=>openClass();
  $("#shopBtn").onclick=()=>openShop();
  $("#mapBtn").onclick=()=>openMap();
  $("#skillBookBtn").onclick=()=>{ renderSkillList(); skillDlg.showModal(); };
  $("#helpBtn").onclick=()=>openHelp();
  $("#afkBtn").onclick=()=>toggleAFK();

  $("#closeInv").onclick=()=>invDlg.close();
  $("#closeQuest").onclick=()=>questDlg.close();
  $("#closeClass").onclick=()=>classDlg.close();
  $("#closeShop").onclick=()=>shopDlg.close();
  $("#closeShop2").onclick=()=>shopDlg.close();
  $("#closeMap").onclick=()=>mapDlg.close();
  $("#closeSkill").onclick=()=>skillDlg.close();
  $("#closeHelp").onclick=()=>helpDlg.close();
  $("#closeEnh").onclick=()=>enhDlg.close();
$("#rebirthBtn").onclick = ()=>{ rebirthDlg.showModal(); };
$("#closeRebirth").onclick = ()=>{ rebirthDlg.close(); };
doRebirthBtn.onclick = ()=>{ doRebirth(); };
  
  // 商店分頁
  shopTabs.forEach(t=>{
    t.onclick=()=>{
      shopTabs.forEach(x=>x.classList.remove("active"));
      t.classList.add("active");
      const tab=t.getAttribute("data-tab");
      $("#buyPanel").style.display=(tab==="buy")?"block":"none";
      $("#sellPanel").style.display=(tab==="sell")?"block":"none";
    };
  });
  // 商店分類按鈕（全部／武器裝備／消耗品／坐騎／強化道具）
  if(shopCatBtns && shopCatBtns.length){
    shopCatBtns.forEach(b=>{
      b.onclick = ()=>{
        shopCatBtns.forEach(x=>x.classList.remove("active"));
        b.classList.add("active");
        shopCategory = b.getAttribute("data-cat") || "all";
        renderShop();
      };
    });
  }

  // 一鍵賣出按鈕
  if(bulkSellBtn && bulkSellFilter){
    bulkSellBtn.onclick = ()=>{
      const mode = bulkSellFilter.value;
      if(mode === "none"){
        alert("請先選擇一鍵賣出的條件。");
        return;
      }
      bulkSellByFilter(mode);
    };
  }

  // 偽裝＆鍵盤
  const introDlg = document.getElementById("introDlg");
  const introBtn = document.getElementById("introBtn");
  const introStartBtn = document.getElementById("introStartBtn");
  const introDontShow = document.getElementById("introDontShow");
  const INTRO_KEY = "stealth_rpg_intro_seen_v1";

  function anyDialogOpen(){
    return [invDlg,questDlg,classDlg,shopDlg,mapDlg,skillDlg,helpDlg,enhDlg,introDlg].some(d=>d && d.open);
  }
  document.addEventListener("keydown",(e)=>{
    if(e.key==="Escape"){
      if(anyDialogOpen()){ [enhDlg,helpDlg,skillDlg,mapDlg,shopDlg,classDlg,questDlg,invDlg,introDlg].forEach(d=>d && d.open&&d.close()); return; }
    }
    if(document.body.classList.contains("stealth")){ if(e.key==="Escape"){ document.body.classList.toggle("stealth"); } return; }
    const map={
      "1":"#exploreBtn","2":"#restBtn","3":"#battleBtn","4":"#attackBtn","5":"#skillBtn","6":"#invBtn","x":"#runBtn",
      "a":"#exploreBtn","r":"#restBtn","b":"#battleBtn","v":"#attackBtn","s":"#skillBtn","i":"#invBtn",
      "q":"#questBtn","c":"#classBtn","o":"#shopBtn","m":"#mapBtn","k":"#skillBookBtn","h":"#helpBtn"
    };
    if(e.key==="Escape"){ document.body.classList.toggle("stealth"); return; }
    const sel=map[e.key.toLowerCase()]; if(sel && !anyDialogOpen()){ const b=$(sel); if(b && !b.disabled) b.click(); }
  });
  $("#stealthBtn").onclick=()=>{
    if(anyDialogOpen()){ [enhDlg,helpDlg,skillDlg,mapDlg,shopDlg,classDlg,questDlg,invDlg,introDlg].forEach(d=>d && d.open&&d.close()); return; }
    document.body.classList.toggle("stealth");
  };

  function openIntro(force=false){
    try{
      const seen = localStorage.getItem(INTRO_KEY)==="1";
      if(seen && !force) return;
    }catch(e){}
    if(introDlg) introDlg.showModal();
  }
  function closeIntroAndMaybeRemember(){
    if(introDontShow && introDontShow.checked){
      try{ localStorage.setItem(INTRO_KEY,"1"); }catch(e){}
    }
    if(introDlg) introDlg.close();
  }
  if(introBtn) introBtn.onclick = ()=> openIntro(true);
  if(introStartBtn) introStartBtn.onclick = closeIntroAndMaybeRemember;

  /* ========= 技能庫 Render ========= */
  function renderSkillList(){
    const box=$("#skillList"); box.innerHTML="";
    const entries = Object.keys(game.player.learned||{});
    if(entries.length===0){ box.innerHTML=`<div class="row"><span class="muted">尚未學習任何技能。</span></div>`; return; }
    entries.forEach(id=>{
      const lv=game.player.learned[id]||1; const qual=game.player.skillQual[id]||0; const sk=SKILL[id];
      const row=document.createElement("div"); row.className="row";
      row.innerHTML=`<div><b>${sk.name}</b> <span class="tag">【${sk.type}】Lv.${lv}${qual>=1?`｜${QUALS[qual]}`:""}</span><br><span class="muted">${sk.desc}</span></div>`;
      const right=document.createElement("div"); right.className="right";
      if(sk.type!=="被動"){
        const setBtn=btn( game.player.activeSkill===id?"當前技能✓":"設為當前", ()=>{ game.player.activeSkill=id; say(`📚 已將當前技能設為 <b>${sk.name}</b>。`); $("#activeSkillName").textContent=skillNameWithLv(id); autosave(); renderSkillList(); });
        right.append(setBtn);
      }else{
        const pass=btn("被動生效", ()=>{}); pass.disabled=true; right.append(pass);
      }
      row.append(right); box.appendChild(row);
    });
  }

  /* ========= 初始化 ========= */
  function renderFake(){
    const rows=[]; const depts=["Sales","Marketing","Ops","Finance","HR","R&D","CS"];
    for(let i=0;i<12;i++){ const d=depts[i%depts.length]; const kpi=["CTR","MRR","AHT","NPS","Churn","ARPU","Util"][i%7];
      const target=rnd(80,120), actual=target+rnd(-12,12), delta=actual-target;
      rows.push(`<tr><td style="text-align:left">${d}-${String(i+1).padStart(2,"0")}</td><td style="text-align:left">${kpi}</td><td>${target}</td><td>${actual}</td><td style="color:${delta>=0?'#16a34a':'#dc2626'}">${delta>=0?'+':''}${delta}</td></tr>`); }
    $("#fakeRows").innerHTML=rows.join("");
  }

  function intro(){ say("你踏上旅途——每 10 等一張地圖直到 200，轉職四階，Boss 獨立地圖掉坐騎/神器。"); say("提示：按 Esc 可切換偽裝；打開『❓ 說明』查看完整規則。"); }

  const _origEnd=endBattle;
  endBattle=function(v){ if(v && game.state.enemy){ updateQuestProgressOnKill(game.state.enemy.name); } _origEnd(v); };

  function explore(){
    if(game.state.inBattle) return say("戰鬥中無法探索！");
    const z=currentZone(), roll=rnd(1,100);
    if(roll<=62 || z.boss){
      startBattle();
    }else if(roll<=85){
      const g=Math.round(rnd(3,10)*GOLD_RATE* (1 + (game.player.equip.mount?0.1:0)));
      game.player.gold+=g; say(`你在 ${z.name} 拾獲 <b>${g}G</b>。`);
    }else{
      const options = ["小治療藥水","小魔力藥水"];
      const find=options[rnd(0,options.length-1)]; addInv(find,1); say(`你在 ${z.name} 發現 <b>${find}</b> ×1。`);
    }
    render();
  }
  function rest(){ if(game.state.inBattle) return say("戰鬥中不能休息！"); 
  // 20%～80% 隨機回復（依上限）
const pct = 0.2 + Math.random() * 0.6;               // 0.2~0.8
const h = Math.max(1, Math.floor(game.player.maxhp * pct));
const m = Math.max(1, Math.floor(game.player.maxmp * pct));

  game.player.hp=clamp(game.player.hp+h,0,game.player.maxhp); game.player.mp=clamp(game.player.mp+m,0,game.player.maxmp); say(`你在 ${currentZone().name} 小憩，回復 <b>${h} HP</b> 與 <b>${m} MP</b>。`); if(Math.random()<0.2) advanceDay(1); render(); }
  function tryRun(){ 
  if(!game.state.inBattle) return say("現在沒有在戰鬥。"); 
  const ok = Math.random() < 0.6; 
  if(ok){ 
    // ✅ 改成單純脫離戰鬥，不結算勝利
    game.state.inBattle = false;
    game.state.enemy = null;
    $("#runBtn").disabled = true;
    say("🏃‍♂️ 你成功脫離了戰鬥。");
    render(); autosave();
  } else { 
    say("你試圖逃跑，但失敗了！"); 
    enemyTurn(); 
  } 
}
    // 啟動
  load();
  initAllArtifactFragments();            // ⬅ 在這裡先註冊所有神器碎片道具
  renderFake();
  ensureStock();
  recomputeStats(true);
  if(game.quests.length===0) seedQuests();
  intro();
  render();
  // 開場介紹只在未勾選不再顯示時跳出
  try{ if(localStorage.getItem(INTRO_KEY)!=="1"){ openIntro(false); } }catch(e){ openIntro(false); }

  // 生成按鈕（小工具）
  function btn(txt,fn){ const b=document.createElement("button"); b.className="btn small"; b.textContent=txt; b.onclick=fn; return b; }

})();
