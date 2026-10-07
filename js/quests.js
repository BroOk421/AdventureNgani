"use strict";

/* =================================================================
   STORY — "The Last Light of the Crystal".

   Per request (the story flow agreed in chat): a chain of main quests
   through the Prologue and five chapters to the Demon Lord, plus side
   quests, with
     - talk boxes (dialogue): name, face, typed-out lines, tap / click /
       Space / E / Enter to go on;
     - "!" over someone with a quest for you, "?" when you can hand one in;
     - the Quest log (J, or the 📜 button — next to the Bag on the phone):
       Main / Side / Tapos na tabs, objectives with progress, rewards,
       Track;
     - a small tracker of the tracked quest on screen.
   Objectives: talk (hand in to someone), kill (a mob type or any), collect
   / deliver (items in the bag; deliver hands them over), equip, upgrade (any
   piece to +N), chests (hidden chests opened), level, reach (a world).
   Saved as player.quests = { active: { id: { kills } }, done: [id], tracked }.
================================================================= */

const NPC_INFO = {
  maria: { name: "Maria" }, armorer: { name: "Armorer" }, blacksmith: { name: "Blacksmith" }, alchemist: { name: "Alchemist" },
  lita: { name: "Lita" }, berto: { name: "Berto" }, journal: { name: "Grandpa's Journal" }, me: { name: "You" },
};
const ANY_CROP = ["cropCarrots", "cropCabbage", "cropOnion", "cropPetchay", "cropBrocolli", "cropBrocolliFlower", "cropDragonfruit"];

// [speaker, line]. The quests in story order; `next` chains the main story.
const QUESTS = [
  /* ---------- PROLOGUE ---------- */
  { id: "p1", kind: "main", chapter: "Prologue: A New Beginning", title: "Grandpa's Journal", giver: null, turnIn: null,
    start: [["journal", "\"My dear grandchild, if you're reading this, I'm no longer at home. Don't worry — there's something I have to watch over.\""],
      ["journal", "\"This house is yours now. But first: you'll need wood. Use the Axe — equip it and chop the trees around the house.\""],
      ["me", "Grandpa Andoy... where could you have gone?"]],
    objectives: [{ type: "equip", item: "woodAxe", label: "Equip the Axe" }, { type: "collect", item: "woodLog", count: 3, label: "Gather Wood Logs" }],
    end: [["journal", "\"Well done. Now head down to the town — there's a road east of the house. Find Maria at the Tavern. She knows me.\""]],
    rewards: { gold: 30, exp: 20 }, next: "p2" },
  { id: "p2", kind: "main", chapter: "Prologue: A New Beginning", title: "The Road to Town", giver: null, turnIn: null,
    start: [["me", "To the town... to Maria. Alright, let's go."]],
    objectives: [{ type: "reach", world: "main", label: "Go to the town" }],
    end: [["me", "The town is bigger than I thought. Where's the Tavern?"]], rewards: { exp: 20 }, next: "c1a" },
  /* ---------- CHAPTER 1 ---------- */
  { id: "c1a", kind: "main", chapter: "Chapter 1: The Town", title: "Maria", giver: null, turnIn: "maria",
    start: [["me", "I need to find Maria. The journal says she's at the Tavern."]],
    objectives: [{ type: "talk", npc: "maria", label: "Talk to Maria" }],
    end: [["maria", "Hey, you're new here? I'm Maria. ...Wait, you're Andoy's grandchild? You look just like him!"],
      ["maria", "He disappeared about a week ago. The last thing he said was: \"The crystals are growing dim.\" I never understood what he meant."],
      ["maria", "But before you go looking, you need to get by here first. Here's a little money — plant something. The Grocery sells seeds."]],
    rewards: { gold: 60, exp: 30 }, next: "c1b" },
  { id: "c1b", kind: "main", chapter: "Chapter 1: The Town", title: "First Harvest", giver: null, turnIn: "maria",
    start: [["maria", "Buy seeds at the Grocery, till the soil with the Hoe, water it, then wait. Come back to me when you've harvested something!"]],
    objectives: [{ type: "collect", item: "anyCrop", count: 1, label: "Harvest any crop" }],
    end: [["maria", "There you go! You're a hard worker, just like your grandpa. Want to learn to fish? There's water by the docks, east of town."]],
    rewards: { gold: 60, exp: 40 }, next: "c1c" },
  { id: "c1c", kind: "main", chapter: "Chapter 1: The Town", title: "The Fishing Rod", giver: null, turnIn: "maria",
    start: [["maria", "Equip the Fishing Rod, face the water and press F (or ATTACK). When you see a \"!\", press it again!"]],
    objectives: [{ type: "collect", item: "fishTilapia", count: 1, label: "Catch a Tilapia" }],
    end: [["maria", "A Tilapia! Delicious fried. Now, you need a weapon — it's dangerous outside of town."],
      ["maria", "Go see the Blacksmith on the west side. He's been Andoy's friend for years."]],
    rewards: { gold: 40, exp: 40 }, next: "c1d" },
  { id: "c1d", kind: "main", chapter: "Chapter 1: The Town", title: "The Blacksmith", giver: null, turnIn: "blacksmith",
    start: [["me", "The Blacksmith... at the west end of town, next to the Armorer and the Alchemist."]],
    objectives: [{ type: "talk", npc: "blacksmith", label: "Talk to the Blacksmith" }],
    end: [["blacksmith", "Andoy's grandchild! I've been waiting for you. He left this for you — his very first sword."],
      ["blacksmith", "It's not much, but it's enough to start. Head down into the caves — the cave at the top-left of your house."]],
    rewards: { exp: 50, items: [["woodSword", 1]] }, next: "c2a" },
  /* ---------- CHAPTER 2 ---------- */
  { id: "c2a", kind: "main", chapter: "Chapter 2: Beneath the Earth", title: "First Fight", giver: null, turnIn: null,
    start: [["blacksmith", "Equip the sword (G or from your bag) and defeat the monsters in the cave. Be careful."]],
    objectives: [{ type: "equip", item: "woodSword", label: "Equip the Wood Sword" }, { type: "kill", mob: "any", count: 5, label: "Defeat monsters" }],
    end: [["me", "I can do this... But there's something strange about their eyes. They're violet."]], rewards: { gold: 50, exp: 80 }, next: "c2b" },
  { id: "c2b", kind: "main", chapter: "Chapter 2: Beneath the Earth", title: "Iron for the Blacksmith", giver: null, turnIn: "blacksmith",
    start: [["me", "The Blacksmith said to bring Iron Ingots so he can strengthen my gear. They're in hidden chests and dropped by rock monsters."]],
    objectives: [{ type: "deliver", item: "ironIngot", count: 2, label: "Bring Iron Ingots" }],
    end: [["blacksmith", "Good! Now try upgrading your sword. Click me, then ⚒ Upgrade."]],
    rewards: { gold: 120, exp: 80, items: [["oreLuck", 1]] }, next: "c2c" },
  { id: "c2c", kind: "main", chapter: "Chapter 2: Beneath the Earth", title: "First Upgrade", giver: null, turnIn: null,
    start: [["blacksmith", "Every upgrade makes it stronger — and the aura starts to show. Start with +1."]],
    objectives: [{ type: "upgrade", level: 1, label: "Upgrade a piece of gear (+1)" }],
    end: [["blacksmith", "Feel that? Now — Andoy was last seen in the deepest cave. Mine 10. Something guards it: the Crystal Golem."]],
    rewards: { exp: 60 }, next: "c2d" },
  { id: "c2d", kind: "main", chapter: "Chapter 2: Beneath the Earth", title: "The Heart of the Crystal", giver: null, turnIn: "blacksmith",
    start: [["me", "Mine 10... every cave goes deeper and deeper. I can do this."]],
    objectives: [{ type: "kill", mob: "golemBoss", count: 1, label: "Defeat the Crystal Golem (Mine 10)" }],
    end: [["blacksmith", "You beat the Golem?! And that... is the Heart of the Crystal. So Andoy did pass through here."],
      ["blacksmith", "If the crystals are dimming, a curse is spreading. The Alchemist knows about these things."]],
    rewards: { gold: 300, exp: 500, items: [["crystalShard", 3]] }, next: "c3a" },
  /* ---------- CHAPTER 3 ---------- */
  { id: "c3a", kind: "main", chapter: "Chapter 3: The Highlands", title: "The Violet Curse", giver: null, turnIn: "alchemist",
    start: [["me", "The Alchemist... at the Potion Shop."]],
    objectives: [{ type: "talk", npc: "alchemist", label: "Talk to the Alchemist" }],
    end: [["alchemist", "Violet eyes? That's a curse — from the far east. Something out there feeds on the light of the crystals."],
      ["alchemist", "The bosses of the east carry the curse. Start in the Highlands: the Slime King. Here, take some potions."]],
    rewards: { exp: 100, items: [["potionHealth", 3]] }, next: "c3b" },
  { id: "c3b", kind: "main", chapter: "Chapter 3: The Highlands", title: "The Slime King", giver: null, turnIn: null,
    start: [["me", "The Highlands — east of town, down the road at the far end."]],
    objectives: [{ type: "kill", mob: "bossSlime", count: 1, label: "Defeat the Slime King (Highlands)" }],
    end: [["me", "I beat him... and the violet around here faded. The Alchemist was right."]], rewards: { gold: 200, exp: 400 }, next: "c3c" },
  { id: "c3c", kind: "main", chapter: "Chapter 3: The Highlands", title: "Shadow over Crystal Ridge", giver: null, turnIn: "alchemist",
    start: [["me", "Next: Crystal Ridge. They say a Shadow Golem lives there."]],
    objectives: [{ type: "kill", mob: "bossGolem", count: 1, label: "Defeat the Shadow Golem (Crystal Ridge)" }],
    end: [["alchemist", "Two bosses already! You're getting stronger. But the curse is stronger in the forest — in Wolfpine Woods."]],
    rewards: { gold: 300, exp: 700, items: [["potionElixir", 1]] }, next: "c4a" },
  /* ---------- CHAPTER 4 ---------- */
  { id: "c4a", kind: "main", chapter: "Chapter 4: The Forest of Spirits", title: "The Shadow Fang", giver: null, turnIn: null,
    start: [["me", "Wolfpine Woods... the wolves there have violet eyes too."]],
    objectives: [{ type: "kill", mob: "bossWolf", count: 1, label: "Defeat the Shadow Fang (Wolfpine Woods)" }],
    end: [["me", "At night there are lights floating here — fireflies? It's like they're guarding something."]], rewards: { gold: 400, exp: 1200 }, next: "c4b" },
  { id: "c4b", kind: "main", chapter: "Chapter 4: The Forest of Spirits", title: "The Spirits", giver: null, turnIn: "maria",
    start: [["journal", "(On the back of the journal:) \"The fireflies are the spirits of the crystals. When they fade, there will be no light left.\""]],
    objectives: [{ type: "kill", mob: "bossWisp", count: 1, label: "Defeat the Wraith (Spirit Glade)" }],
    end: [["maria", "You're back! I was worried. People say the nights have been brighter lately. Was that you?"],
      ["maria", "There's news: someone saw Andoy in the desert — in the Sunscar Barrens. Trapped inside a crystal, they say."]],
    rewards: { gold: 600, exp: 2500 }, next: "c5a" },
  /* ---------- CHAPTER 5 ---------- */
  { id: "c5a", kind: "main", chapter: "Chapter 5: Fire in the East", title: "The Venom Queen", giver: null, turnIn: null,
    start: [["me", "The Sunscar Barrens... scorching, and the Venom Queen rules the land. They say she carries Inferno gear."]],
    objectives: [{ type: "level", level: 50, label: "Reach Level 50" }, { type: "kill", mob: "bossScorpion", count: 1, label: "Defeat the Venom Queen (Sunscar Barrens)" }],
    end: [["me", "Grandpa isn't here... but there's a trail of fire leading to Ember Peaks."]], rewards: { gold: 1200, exp: 6000 }, next: "c5b" },
  { id: "c5b", kind: "main", chapter: "Chapter 5: Fire in the East", title: "The Demon Lord", giver: null, turnIn: null,
    start: [["me", "Ember Peaks. Where the curse began. The Demon Lord."]],
    objectives: [{ type: "kill", mob: "bossImp", count: 1, label: "Defeat the Demon Lord (Ember Peaks)" }],
    end: [["me", "He's fallen... and the crystal behind him — it shattered. Grandpa!"],
      ["journal", "\"My grandchild... I knew you would come. The crystals have their light back. Let's go home.\""]],
    rewards: { gold: 3000, exp: 15000 }, next: "ep" },
  /* ---------- EPILOGUE ---------- */
  { id: "ep", kind: "main", chapter: "Epilogue: The Town Festival", title: "The Town Festival", giver: null, turnIn: "maria",
    start: [["me", "I have to tell Maria!"]],
    objectives: [{ type: "talk", npc: "maria", label: "Tell Maria the news" }],
    end: [["maria", "Andoy! And you — our hero! We're having a festival tonight!"], ["maria", "Thank you. If you ever need anything, you know where to find me."]],
    rewards: { gold: 2000, exp: 5000, items: [["oreDivine", 1]] }, next: null },
  /* ---------- SIDE QUESTS ---------- */
  { id: "s_koi", kind: "side", title: "The Golden Fish", giver: "maria", turnIn: "maria", requires: "c1c",
    start: [["maria", "There's a legend at the docks: the Golden Koi. Rare and fast. Catch one and I'll reward you!"]],
    objectives: [{ type: "deliver", item: "fishKoi", count: 1, label: "Catch a Golden Koi" }],
    end: [["maria", "It's real! It's beautiful... Here's what I promised."]], rewards: { gold: 300, exp: 200 } },
  { id: "s_farm", kind: "side", title: "The Farmer", giver: "maria", turnIn: "maria", requires: "c1b",
    start: [["maria", "The Tavern needs vegetables for the festival. Can you harvest ten?"]],
    objectives: [{ type: "deliver", item: "anyCrop", count: 10, label: "Bring 10 vegetables" }],
    end: [["maria", "So many! Thank you, we'll have soup for everyone."]], rewards: { gold: 250, exp: 150 } },
  { id: "s_potion", kind: "side", title: "A New Remedy", giver: "alchemist", turnIn: "alchemist", requires: "c3a",
    start: [["alchemist", "I'm brewing a new remedy. I need 5 Glow Caps and 5 Slime Gels."]],
    objectives: [{ type: "deliver", item: "glowCap", count: 5, label: "Glow Cap" }, { type: "deliver", item: "slimeGel", count: 5, label: "Slime Gel" }],
    end: [["alchemist", "Perfect! Here are two from the first batch."]], rewards: { exp: 200, items: [["potionElixir", 2]] } },
  { id: "s_armor", kind: "side", title: "Full Armour", giver: "armorer", turnIn: "armorer", requires: "c2a",
    start: [["armorer", "So you're a fighter now! But you're barely dressed for it. Wear a helmet, armour, gauntlets and boots — the full set."]],
    objectives: [{ type: "wearAll", label: "Wear a helmet, armour, gauntlets and boots" }],
    end: [["armorer", "There — now you look like a real hero!"]], rewards: { gold: 200, exp: 150 } },
  { id: "s_chest", kind: "side", title: "Crystal Collector", giver: "blacksmith", turnIn: "blacksmith", requires: "c2b",
    start: [["blacksmith", "There are hidden chests in the caves, among the crystals. Open ten and I'll have a reward for you."]],
    objectives: [{ type: "chests", count: 10, label: "Open hidden chests" }],
    end: [["blacksmith", "Ten! You've got sharp eyes. Here — use it on your next upgrade."]], rewards: { exp: 300, items: [["oreFortune", 1]] } },
  { id: "s_perfect", kind: "side", title: "The Perfect Smith", giver: "blacksmith", turnIn: "blacksmith", requires: "c2c",
    start: [["blacksmith", "The highest upgrade is +10. Only a few have ever made it. Think you can?"]],
    objectives: [{ type: "upgrade", level: 10, label: "Upgrade a piece of gear to +10" }],
    end: [["blacksmith", "+10! I can't believe it. Here — my rarest ore."]], rewards: { exp: 2000, items: [["oreDivine", 1]] } },
  { id: "s_titan", kind: "side", title: "The Heart of the Volcano", giver: "maria", turnIn: "maria", requires: "c5b",
    start: [["maria", "Traders say that south of Ember Peaks there's a waking volcano — and a dragon sleeps in its fire. The Ember Dragon."]],
    objectives: [{ type: "kill", mob: "bossDragon", count: 1, label: "Defeat the Ember Dragon (Volcano)" }],
    end: [["maria", "You slew a DRAGON?! You really are the strongest in the land."]], rewards: { gold: 5000, exp: 20000, items: [["oreDivine", 1]] } },
  { id: "s_leviathan", kind: "side", title: "The Beast of the Sea", giver: "maria", turnIn: "maria", requires: "s_titan",
    start: [["maria", "Past the volcano there's a blue shore — the Azure Coast. Sirens sing there, and the fishermen live in fear of the Leviathan. Will you help them?"]],
    objectives: [{ type: "kill", mob: "bossLeviathan", count: 1, label: "Defeat the Leviathan (Azure Coast)" }],
    end: [["maria", "The Leviathan! The sea is safe again. Here — for the hero of land AND sea."]], rewards: { gold: 8000, exp: 30000, items: [["oreDivine", 2]] } },
  { id: "s_home", kind: "side", title: "A New Home", giver: "lita", turnIn: "lita", requires: "c1a",
    start: [["lita", "Oh, you're the one living in Andoy's house? It must feel empty in there. Buy at least 3 pieces from us, indoor or outdoor!"]],
    objectives: [{ type: "bought", count: 3, label: "Buy furniture" }],
    end: [["lita", "There, it'll feel like home again! Here's a little gift."]], rewards: { gold: 120, exp: 60 } },
];
const QUEST_BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

/* ---------------- state ---------------- */
function questState() {
  if (!player.quests || typeof player.quests !== "object") player.quests = { active: {}, done: [], tracked: null, bought: 0 };
  const s = player.quests;
  s.active = s.active || {}; s.done = s.done || []; s.bought = s.bought || 0;
  return s;
}
const questDone = (id) => questState().done.includes(id);
const questActive = (id) => !!questState().active[id];
function questAvailable(q) {
  return !questDone(q.id) && !questActive(q.id) && q.giver && (!q.requires || questDone(q.requires));
}
function countItem(item) { return item === "anyCrop" ? ANY_CROP.reduce((n, t) => n + ownedCount(t), 0) : ownedCount(item); }
function chestsOpened() {
  return (player.treasure && player.treasure.openedTotal) || 0;
}
function maxUpgrade() { let m = 0; for (const u of Object.values(player.upgrades || {})) m = Math.max(m, u.lvl || 0); return m; }
// [have, need] for one objective
function objectiveProgress(q, o) {
  const st = questState().active[q.id] || {};
  switch (o.type) {
    case "kill": return [Math.min(o.count, (st.kills && st.kills[o.mob]) || 0), o.count];
    case "collect": case "deliver": return [Math.min(o.count, countItem(o.item)), o.count];
    case "equip": return [player.equippedWeapon === o.item || Object.values(player.equipment || {}).includes(o.item) ? 1 : 0, 1];
    case "upgrade": return [Math.min(o.level, maxUpgrade()), o.level];
    case "chests": return [Math.min(o.count, chestsOpened() - (st.chestBase || 0)), o.count];
    case "level": return [Math.min(o.level, player.level || 1), o.level];
    case "reach": return [typeof currentWorld !== "undefined" && currentWorld === o.world && player.scene === "outside" ? 1 : 0, 1];
    case "wearAll": { const e = player.equipment || {}; const n = ["helmet", "armor", "gauntlet", "boots"].filter((s) => e[s]).length; return [n, 4]; }
    case "bought": return [Math.min(o.count, (questState().bought || 0) - (st.boughtBase || 0)), o.count];
    case "talk": return [0, 1];
  }
  return [0, 1];
}
function questObjectivesMet(q) { return q.objectives.every((o) => o.type === "talk" || (([a, b]) => a >= b)(objectiveProgress(q, o))); }

/* ---------------- starting / finishing ---------------- */
function startQuest(id, quiet) {
  const q = QUEST_BY_ID[id];
  if (!q || questDone(id) || questActive(id)) return;
  const st = { kills: {}, chestBase: chestsOpened(), boughtBase: questState().bought || 0 };
  questState().active[id] = st;
  if (!questState().tracked || q.kind === "main") questState().tracked = id;
  const go = () => { if (typeof showToast === "function") showToast("📜 New quest: " + q.title); renderQuestTracker(); if (typeof saveGame === "function") saveGame(); };
  if (!quiet && q.start && q.start.length) showDialogue(q.start, go); else go();
}
function completeQuest(id) {
  const q = QUEST_BY_ID[id];
  const s = questState();
  if (!q || !s.active[id]) return;
  for (const o of q.objectives) if (o.type === "deliver") takeQuestItems(o.item, o.count);
  delete s.active[id];
  s.done.push(id);
  if (s.tracked === id) s.tracked = null;
  const R = q.rewards || {};
  const finish = () => {
    if (R.gold) { player.gold = (player.gold || 0) + R.gold; if (typeof renderGoldDisplays === "function") renderGoldDisplays(); }
    if (R.items) for (const [t, n] of R.items) grantItem(t, n);
    if (R.exp && typeof gainExp === "function") gainExp(R.exp);
    const parts = [R.gold ? R.gold + " gold" : "", R.exp ? R.exp + " EXP" : "", ...(R.items || []).map(([t, n]) => n + " " + (itemDefs[t] ? itemDefs[t].name : t))].filter(Boolean);
    if (typeof showToast === "function") showToast("✅ Complete: " + q.title + (parts.length ? " — " + parts.join(", ") : ""));
    if (q.next) startQuest(q.next);
    if (!s.tracked) { const a = Object.keys(s.active)[0]; s.tracked = a || null; }
    renderQuestTracker(); renderQuestPanel();
    if (typeof saveGame === "function") saveGame();
  };
  if (q.end && q.end.length) showDialogue(q.end, finish); else finish();
}
function takeQuestItems(item, n) {
  const list = item === "anyCrop" ? ANY_CROP : [item];
  for (const t of list) {
    const slot = inventory.find((x) => x && x.type === t);
    if (!slot) continue;
    const k = Math.min(n, slot.count); slot.count -= k; n -= k;
    if (n <= 0) break;
  }
  if (typeof renderInventory === "function") renderInventory();
  if (typeof renderHotbar === "function") renderHotbar();
}
// what this person has for you right now: a quest to hand in, a quest to start, or nothing
function npcQuestAction(npcId) {
  const s = questState();
  for (const id of Object.keys(s.active)) {
    const q = QUEST_BY_ID[id];
    if (q && q.turnIn === npcId && questObjectivesMet(q)) return { kind: "turnIn", q };
  }
  for (const q of QUESTS) if (q.giver === npcId && questAvailable(q)) return { kind: "start", q };
  return null;
}
function npcMarker(npcId) {
  const a = npcQuestAction(npcId);
  return a ? (a.kind === "turnIn" ? "?" : "!") : null;
}
// talking to someone: their quest business first; true = handled (don't open their shop / menu)
function questTalk(npcId) {
  const a = npcQuestAction(npcId);
  if (!a) return false;
  if (a.kind === "turnIn") completeQuest(a.q.id); else startQuest(a.q.id);
  return true;
}

/* ---------------- watching the world ---------------- */
{
  const base = gainExp;
  gainExp = function (n, m) {
    if (m && m.type) {
      for (const [id, st] of Object.entries(questState().active)) {
        const q = QUEST_BY_ID[id];
        if (!q) continue;
        for (const o of q.objectives) if (o.type === "kill" && (o.mob === m.type || o.mob === "any")) { st.kills = st.kills || {}; st.kills[o.mob] = (st.kills[o.mob] || 0) + 1; }
      }
    }
    return base.apply(this, arguments);
  };
}
if (typeof buyFromNpc === "function") {
  const base = buyFromNpc;
  buyFromNpc = function (type) {
    const g = player.gold;
    const r = base.apply(this, arguments);
    if (player.gold < g && typeof furnitureStock === "function" && [...furnitureStock("indoor"), ...furnitureStock("outdoor")].some((e) => e.type === type)) questState().bought++;
    return r;
  };
}
// self-completing quests (no one to hand in to) finish as soon as they're met
setInterval(() => {
  if (dialogueOpen()) return;
  for (const id of Object.keys(questState().active)) {
    const q = QUEST_BY_ID[id];
    if (q && !q.turnIn && questObjectivesMet(q)) { completeQuest(id); return; }
  }
  renderQuestTracker();
}, 500);
// a brand-new adventure starts the story
// (checked until the game has loaded its save — then once, a couple of seconds in)
{
  let readyAt = 0;
  const t = setInterval(() => {
    if (typeof saveGameReady === "undefined" || !saveGameReady) return;
    if (!readyAt) { readyAt = performance.now(); return; }
    if (performance.now() - readyAt < 2000) return;
    clearInterval(t);
    const s = questState();
    if (!s.done.length && !Object.keys(s.active).length) startQuest("p1");
  }, 250);
}

/* ---------------- talking: shops and Maria ---------------- */
{
  const shop = openNpcShop;
  openNpcShop = function (stock, title) {
    let id = null;
    if (!arguments.length) id = "maria";
    else if (typeof lastShopKeeper !== "undefined" && lastShopKeeper && title === lastShopKeeper.title) id = lastShopKeeper.name.toLowerCase();
    if (id && questTalk(id)) return;
    return shop.apply(this, arguments);
  };
  const talk = openNpcTalk;
  openNpcTalk = function () { if (questTalk("maria")) return; return talk.apply(this, arguments); };
}

/* ---------------- the talk box ---------------- */
let dlgEl = null, dlgQueue = null, dlgIdx = 0, dlgDone = null, dlgTyping = null, dlgFull = "";
function dialogueOpen() { return !!(dlgEl && dlgEl.style.display !== "none"); }
function portraitFor(id) {
  if (id === "maria" && typeof currentNpcSheet === "function") return currentNpcSheet();
  const k = { armorer: "Shop_Smith", blacksmith: "Shop_Blacksmith", alchemist: "Shop_Alchemist", lita: "Shop_FurnitureIn", berto: "Shop_FurnitureOut" }[id];
  if (k) return assets["keeper_" + k];
  if (id === "me" && typeof currentPlayerSheet === "function") return currentPlayerSheet();
  return null;
}
function buildDialogue() {
  dlgEl = document.createElement("div");
  dlgEl.id = "dlg";
  dlgEl.innerHTML = '<canvas id="dlg-face" width="64" height="64"></canvas><div id="dlg-body"><div id="dlg-name"></div><div id="dlg-text"></div><div id="dlg-next">▼</div></div>';
  dlgEl.style.display = "none";
  document.body.appendChild(dlgEl);
  const advance = (e) => { if (e) { e.preventDefault(); e.stopPropagation(); } nextDialogueLine(); };
  dlgEl.addEventListener("pointerdown", advance);
  window.addEventListener("keydown", (e) => {
    if (!dialogueOpen()) return;
    const k = e.key.toLowerCase();
    e.stopImmediatePropagation(); e.preventDefault(); // nothing else moves while someone's talking
    if (!e.repeat && (k === " " || k === "enter" || k === "e" || k === "f")) nextDialogueLine();
  }, true);
}
function showDialogue(lines, done) {
  if (!dlgEl) buildDialogue();
  if (dialogueOpen()) { const prev = dlgDone; dlgQueue = dlgQueue.concat(lines); dlgDone = () => { if (prev) prev(); if (done) done(); }; return; }
  dlgQueue = lines.slice(); dlgIdx = 0; dlgDone = done || null;
  dlgEl.style.display = "flex";
  for (const k of Object.keys(keys)) keys[k] = false; // stop walking
  showDialogueLine();
}
function showDialogueLine() {
  const [who, text] = dlgQueue[dlgIdx];
  const info = NPC_INFO[who] || { name: who };
  dlgEl.querySelector("#dlg-name").textContent = info.name;
  const face = dlgEl.querySelector("#dlg-face"), g = face.getContext("2d");
  g.clearRect(0, 0, 64, 64); g.imageSmoothingEnabled = false;
  const sheet = portraitFor(who);
  if (sheet && sheet.width) g.drawImage(sheet, 0, 0, 64, 64, -16, -2, 96, 96); // head and shoulders
  else { g.font = "38px serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(who === "journal" ? "📖" : "💬", 32, 34); }
  const el = dlgEl.querySelector("#dlg-text");
  dlgFull = text; el.textContent = "";
  clearInterval(dlgTyping);
  let i = 0;
  dlgTyping = setInterval(() => { i += 2; el.textContent = dlgFull.slice(0, i); if (i >= dlgFull.length) { clearInterval(dlgTyping); dlgTyping = null; } }, 22);
}
function nextDialogueLine() {
  if (dlgTyping) { clearInterval(dlgTyping); dlgTyping = null; dlgEl.querySelector("#dlg-text").textContent = dlgFull; return; } // first tap: finish the line
  dlgIdx++;
  if (dlgIdx < dlgQueue.length) { showDialogueLine(); return; }
  dlgEl.style.display = "none";
  const d = dlgDone; dlgDone = null;
  if (d) d();
}

/* ---------------- "!" and "?" over people ---------------- */
function drawQuestMarker(mark, x, y) {
  const t = performance.now() / 1000, bob = Math.sin(t * 4) * 2 * zoom / 3.5;
  const fs = Math.max(14, Math.round(6.5 * zoom));
  ctx.save();
  ctx.font = "900 " + fs + "px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
  ctx.lineWidth = Math.max(3, fs / 4); ctx.strokeStyle = "#2a1600";
  ctx.strokeText(mark, x, y + bob); ctx.fillStyle = mark === "?" ? "#ffd84a" : "#ffef7a"; ctx.fillText(mark, x, y + bob);
  ctx.restore();
}
{
  const base = drawNPC;
  drawNPC = function (px, py, scale) {
    const r = base.apply(this, arguments);
    const m = npcMarker("maria");
    if (m) drawQuestMarker(m, px, py - NPC_DRAW_SIZE * scale * 0.42);
    return r;
  };
  if (typeof shopKeeperDrawables === "function") {
    const kd = shopKeeperDrawables;
    shopKeeperDrawables = function () {
      const out = kd.apply(this, arguments);
      for (const k of shopKeepersHere()) {
        const m = npcMarker(k.name.toLowerCase());
        if (!m) continue;
        const f = keeperFeet(k);
        out.push({ sortY: f.y + 0.01, character: true, draw: () => drawQuestMarker(m, (f.x - camX) * zoom, (f.y - 40 - camY) * zoom) });
      }
      return out;
    };
  }
}

/* ---------------- the quest log ---------------- */
let questPanelEl = null, questTab = "main", questSel = null;
function toggleQuestPanel(show) {
  if (!questPanelEl) {
    questPanelEl = document.createElement("div");
    questPanelEl.id = "quest-overlay";
    questPanelEl.innerHTML = '<div id="quest-panel"><div id="quest-head"><b>📜 Quests</b><button id="quest-close">✕</button></div><div id="quest-tabs"><button data-t="main">Main</button><button data-t="side">Side</button><button data-t="done">Completed</button></div><div id="quest-cols"><div id="quest-list" class="scroll-ok"></div><div id="quest-detail" class="scroll-ok"></div></div></div>';
    document.body.appendChild(questPanelEl);
    questPanelEl.addEventListener("pointerdown", (e) => { if (e.target === questPanelEl) toggleQuestPanel(false); });
    questPanelEl.querySelector("#quest-close").addEventListener("click", () => toggleQuestPanel(false));
    questPanelEl.querySelectorAll("#quest-tabs button").forEach((b) => b.addEventListener("click", () => { questTab = b.dataset.t; questSel = null; renderQuestPanel(); }));
  }
  const on = show === undefined ? questPanelEl.style.display !== "flex" : show;
  questPanelEl.style.display = on ? "flex" : "none";
  if (on) renderQuestPanel();
}
function questListFor(tab) {
  const s = questState();
  if (tab === "done") return QUESTS.filter((q) => questDone(q.id));
  return QUESTS.filter((q) => q.kind === tab && (questActive(q.id) || (tab === "side" && questAvailable(q))));
}
function renderQuestPanel() {
  if (!questPanelEl || questPanelEl.style.display !== "flex") return;
  questPanelEl.querySelectorAll("#quest-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.t === questTab));
  const list = questListFor(questTab), L = questPanelEl.querySelector("#quest-list"), D = questPanelEl.querySelector("#quest-detail");
  if (!questSel || !list.some((q) => q.id === questSel)) questSel = list[0] ? list[0].id : null;
  L.innerHTML = list.length ? "" : '<div class="q-empty">' + (questTab === "done" ? "Nothing completed yet." : questTab === "side" ? "No side quests yet — talk to people with a \"!\"." : "No active quests.") + "</div>";
  for (const q of list) {
    const b = document.createElement("button");
    b.className = "q-item" + (q.id === questSel ? " on" : "") + (questState().tracked === q.id ? " tracked" : "");
    const tag = questDone(q.id) ? "✓" : questActive(q.id) ? (questObjectivesMet(q) ? "?" : "•") : "!";
    b.innerHTML = '<span class="q-tag">' + tag + "</span><span>" + q.title + (q.chapter ? '<small>' + q.chapter + "</small>" : "") + "</span>";
    b.addEventListener("click", () => { questSel = q.id; renderQuestPanel(); });
    L.appendChild(b);
  }
  const q = questSel && QUEST_BY_ID[questSel];
  if (!q) { D.innerHTML = ""; return; }
  const active = questActive(q.id), done = questDone(q.id);
  let h = (q.chapter ? '<div class="q-chap">' + q.chapter + "</div>" : "") + '<div class="q-title">' + q.title + "</div>";
  const intro = q.start && q.start.length ? q.start[q.start.length - 1][1] : "";
  if (intro) h += '<div class="q-desc">' + intro + "</div>";
  h += '<div class="q-sec">Objectives</div>';
  for (const o of q.objectives) {
    const [a, b] = done ? [1, 1] : o.type === "talk" ? [active && questObjectivesMet(q) ? 0 : 0, 1] : objectiveProgress(q, o);
    const ok = done || (o.type !== "talk" && a >= b);
    h += '<div class="q-obj' + (ok ? " ok" : "") + '">' + (ok ? "✔" : "◻") + " " + o.label + (o.type !== "talk" && b > 1 ? ' <span class="q-n">' + a + "/" + b + "</span>" : "") + "</div>";
  }
  if (q.turnIn && active) h += '<div class="q-obj">◻ Hand in to ' + (NPC_INFO[q.turnIn] || { name: q.turnIn }).name + (questObjectivesMet(q) ? ' <span class="q-ready">ready!</span>' : "") + "</div>";
  if (!active && !done && q.giver) h += '<div class="q-obj">Talk to ' + (NPC_INFO[q.giver] || { name: q.giver }).name + " to start</div>";
  const R = q.rewards || {};
  const rw = [R.gold ? "💰 " + R.gold + " gold" : "", R.exp ? "⭐ " + R.exp + " EXP" : "", ...(R.items || []).map(([t, n]) => n + "× " + (itemDefs[t] ? itemDefs[t].name : t))].filter(Boolean);
  if (rw.length) h += '<div class="q-sec">Rewards</div><div class="q-rew">' + rw.join(" · ") + "</div>";
  if (active) h += '<button id="q-track">' + (questState().tracked === q.id ? "★ Tracked" : "☆ Track") + "</button>";
  D.innerHTML = h;
  const tb = D.querySelector("#q-track");
  if (tb) tb.addEventListener("click", () => { questState().tracked = questState().tracked === q.id ? null : q.id; renderQuestPanel(); renderQuestTracker(); });
}
window.addEventListener("keydown", (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = e.target && e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (e.key.toLowerCase() === "j") toggleQuestPanel();
  if (e.key === "Escape" && questPanelEl && questPanelEl.style.display === "flex") toggleQuestPanel(false);
});
// the desktop toolbar button (the phone has its own, next to the Bag — js/mobile.js)
{
  const bar = document.getElementById("top-toolbar");
  if (bar) {
    const b = document.createElement("button");
    b.id = "btn-quests"; b.title = "Quests (J)"; b.textContent = "📜 Quests";
    b.addEventListener("click", () => toggleQuestPanel());
    bar.insertBefore(b, bar.firstChild);
  }
}

/* ---------------- the on-screen tracker ---------------- */
let trackerEl = null, trackerKey = "";
function renderQuestTracker() {
  if (!trackerEl) { trackerEl = document.createElement("div"); trackerEl.id = "quest-tracker"; document.body.appendChild(trackerEl); trackerEl.addEventListener("click", () => toggleQuestPanel(true)); }
  const s = questState(), q = s.tracked && QUEST_BY_ID[s.tracked];
  if (!q || !questActive(q.id)) { if (trackerKey !== "") { trackerEl.style.display = "none"; trackerKey = ""; } return; }
  let h = '<div class="qt-title">📜 ' + q.title + "</div>";
  if (questObjectivesMet(q) && q.turnIn) h += '<div class="qt-obj ok">➜ Return to ' + (NPC_INFO[q.turnIn] || { name: q.turnIn }).name + "</div>";
  else for (const o of q.objectives) {
    if (o.type === "talk") { h += '<div class="qt-obj">◻ ' + o.label + "</div>"; continue; }
    const [a, b] = objectiveProgress(q, o);
    h += '<div class="qt-obj' + (a >= b ? " ok" : "") + '">' + (a >= b ? "✔ " : "◻ ") + o.label + (b > 1 ? " " + a + "/" + b : "") + "</div>";
  }
  if (h !== trackerKey) { trackerEl.innerHTML = h; trackerKey = h; }
  trackerEl.style.display = "block";
}

/* ---------------- saving ---------------- */
{
  const saveBase = buildSaveData;
  buildSaveData = function () { const d = saveBase.apply(this, arguments); d.quests = questState(); return d; };
  const loadBase = applySaveData;
  applySaveData = function (data) {
    const r = loadBase.apply(this, arguments);
    player.quests = data && data.quests && typeof data.quests === "object" ? data.quests : { active: {}, done: [], tracked: null, bought: 0 };
    // a fresh start (js/freshStart.js) starts the story over too
    if (data && (!data.freshStartV || data.freshStartV < FRESH_START_VERSION)) player.quests = { active: {}, done: [], tracked: null, bought: 0 };
    return r;
  };
}

/* Quest progress is written straight away (not only by the autosave), so closing
   the app right after a quest starts or ends can't lose it and replay it. */
{
  const later = () => setTimeout(() => { if (typeof saveGame === "function") saveGame(); }, 60);
  const sq = startQuest, cq = completeQuest;
  startQuest = function () { const r = sq.apply(this, arguments); later(); return r; };
  completeQuest = function () { const r = cq.apply(this, arguments); later(); return r; };
}
