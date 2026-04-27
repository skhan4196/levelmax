(() => {
  "use strict";

  const TAU = Math.PI * 2;
  const WORLD_SIZE = 5200;
  const BOSS_TIME = 165;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const ui = {
    hud: document.getElementById("hud"),
    menu: document.getElementById("menu"),
    roster: document.getElementById("roster"),
    start: document.getElementById("startButton"),
    levelScreen: document.getElementById("levelScreen"),
    upgradeChoices: document.getElementById("upgradeChoices"),
    pauseScreen: document.getElementById("pauseScreen"),
    resultScreen: document.getElementById("resultScreen"),
    resultEyebrow: document.getElementById("resultEyebrow"),
    resultTitle: document.getElementById("resultTitle"),
    resultStats: document.getElementById("resultStats"),
    pause: document.getElementById("pauseButton"),
    resume: document.getElementById("resumeButton"),
    restart: document.getElementById("restartButton"),
    again: document.getElementById("againButton"),
    timer: document.getElementById("timer"),
    level: document.getElementById("level"),
    kills: document.getElementById("kills"),
    wave: document.getElementById("wave"),
    hpFill: document.getElementById("hpFill"),
    xpFill: document.getElementById("xpFill"),
    build: document.getElementById("build"),
    toast: document.getElementById("toast"),
    stick: document.getElementById("touchStick"),
    stickThumb: document.querySelector("#touchStick span"),
  };

  const HEROES = {
    runner: {
      id: "runner",
      name: "Rift Runner",
      color: "#44d9c7",
      trim: "#ffd166",
      maxHp: 88,
      speed: 318,
      magnet: 132,
      damageMult: 1,
      armor: 0.02,
      setup(player) {
        player.weapons.bolt.level = 1;
        player.weapons.bolt.count = 1;
        player.weapons.bolt.rate = 0.64;
        player.weapons.bolt.damage = 18;
      },
    },
    warden: {
      id: "warden",
      name: "Moss Warden",
      color: "#63d471",
      trim: "#ff6b5f",
      maxHp: 126,
      speed: 242,
      magnet: 92,
      damageMult: 0.96,
      armor: 0.16,
      setup(player) {
        player.weapons.bolt.level = 1;
        player.weapons.bolt.rate = 0.86;
        player.weapons.orbit.level = 1;
        player.weapons.orbit.count = 2;
      },
    },
    spark: {
      id: "spark",
      name: "Volt Jester",
      color: "#ffd166",
      trim: "#44d9c7",
      maxHp: 76,
      speed: 284,
      magnet: 102,
      damageMult: 1.12,
      armor: 0,
      setup(player) {
        player.weapons.bolt.level = 1;
        player.weapons.bolt.count = 2;
        player.weapons.bolt.damage = 15;
        player.chainChance = 0.22;
      },
    },
  };

  const RARITIES = [
    { id: "common", label: "Common", color: "#cfe8df", scale: 1, weight: 58 },
    { id: "rare", label: "Rare", color: "#44d9c7", scale: 1.45, weight: 27 },
    { id: "epic", label: "Epic", color: "#ba7cff", scale: 2.05, weight: 11 },
    { id: "legendary", label: "Legendary", color: "#ffd166", scale: 3, weight: 4 },
  ];

  const keys = new Set();
  const pointer = {
    active: false,
    id: null,
    startX: 0,
    startY: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
  };

  let width = 1;
  let height = 1;
  let dpr = 1;
  let mode = "menu";
  let selectedHero = "runner";
  let game = null;
  let lastTime = 0;
  let toastTimer = 0;
  let projectileId = 0;
  let enemyId = 0;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (from, to, amt) => from + (to - from) * amt;
  const distSq = (ax, ay, bx, by) => {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  };
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  function mulberry32(seed) {
    return function random() {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function baseWeapons() {
    return {
      bolt: {
        name: "Spark Bolt",
        level: 0,
        cooldown: 0.2,
        rate: 0.76,
        damage: 17,
        speed: 680,
        count: 1,
        pierce: 0,
        range: 860,
      },
      orbit: {
        name: "Orbit Bonker",
        level: 0,
        count: 0,
        radius: 74,
        damage: 10,
        speed: 2.6,
        hitDelay: 0.34,
        angle: 0,
      },
      nova: {
        name: "Clap Nova",
        level: 0,
        cooldown: 0.4,
        rate: 4.8,
        damage: 38,
        radius: 138,
      },
      mine: {
        name: "Thunk Mine",
        level: 0,
        cooldown: 1.2,
        rate: 3.7,
        damage: 55,
        radius: 92,
      },
    };
  }

  function createPlayer(hero) {
    const player = {
      heroId: hero.id,
      name: hero.name,
      color: hero.color,
      trim: hero.trim,
      x: WORLD_SIZE / 2,
      y: WORLD_SIZE / 2,
      vx: 0,
      vy: 0,
      r: 18,
      maxHp: hero.maxHp,
      hp: hero.maxHp,
      speed: hero.speed,
      magnet: hero.magnet,
      damageMult: hero.damageMult,
      armor: hero.armor,
      regen: 0,
      xpGain: 1,
      luck: 0,
      crit: 0.04,
      chainChance: 0.05,
      explosiveKills: 0,
      thorns: 0,
      level: 1,
      xp: 0,
      xpNext: 18,
      weapons: baseWeapons(),
      trailTimer: 0,
    };
    hero.setup(player);
    return player;
  }

  function generateProps(seed) {
    const rng = mulberry32(seed + 7919);
    const props = [];
    const types = ["rock", "tuft", "ruin", "lamp", "mush"];
    for (let i = 0; i < 270; i += 1) {
      const type = types[Math.floor(rng() * types.length)];
      const margin = 180;
      props.push({
        type,
        x: margin + rng() * (WORLD_SIZE - margin * 2),
        y: margin + rng() * (WORLD_SIZE - margin * 2),
        size: 12 + rng() * 34,
        rot: rng() * TAU,
        colorShift: rng(),
      });
    }
    return props.sort((a, b) => a.y - b.y);
  }

  function createGame(heroId) {
    const seed = (Date.now() ^ Math.floor(Math.random() * 999999)) >>> 0;
    const hero = HEROES[heroId];
    const player = createPlayer(hero);
    return {
      seed,
      rng: mulberry32(seed),
      player,
      enemies: [],
      projectiles: [],
      enemyShots: [],
      gems: [],
      pickups: [],
      pulses: [],
      mines: [],
      particles: [],
      texts: [],
      props: generateProps(seed),
      camera: { x: player.x - width / 2, y: player.y - height / 2 },
      time: 0,
      kills: 0,
      wave: 1,
      score: 0,
      spawnBudget: 0,
      nextElite: 16,
      bossSpawned: false,
      pendingLevelUps: 0,
      upgradeChoices: [],
      upgradeCounts: {},
      screenShake: 0,
      result: null,
    };
  }

  const UPGRADE_TEMPLATES = [
    {
      id: "boltUnlock",
      title: "Spark Bolt",
      desc: () => "Adds a fast auto-shot that hunts the nearest target.",
      max: 1,
      needs: (g) => g.player.weapons.bolt.level === 0,
      apply: (g) => {
        const w = g.player.weapons.bolt;
        w.level = 1;
        w.count = 1;
      },
    },
    {
      id: "boltDamage",
      title: "Hotter Bolts",
      desc: (s) => `Spark Bolt damage +${Math.round(22 * s)}%.`,
      max: 8,
      needs: (g) => g.player.weapons.bolt.level > 0,
      apply: (g, s) => {
        const w = g.player.weapons.bolt;
        w.damage *= 1 + 0.22 * s;
        w.level += 1;
      },
    },
    {
      id: "boltCount",
      title: "Forked Sparks",
      desc: (s) => `Spark Bolt fires +${s >= 2 ? 2 : 1} shot${s >= 2 ? "s" : ""}.`,
      max: 5,
      needs: (g) => g.player.weapons.bolt.level > 0,
      apply: (g, s) => {
        const w = g.player.weapons.bolt;
        w.count += s >= 2 ? 2 : 1;
        w.rate *= 0.96;
        w.level += 1;
      },
    },
    {
      id: "boltRate",
      title: "Greased Trigger",
      desc: (s) => `Spark Bolt cooldown -${Math.round(9 * s)}%.`,
      max: 7,
      needs: (g) => g.player.weapons.bolt.level > 0,
      apply: (g, s) => {
        const w = g.player.weapons.bolt;
        w.rate = Math.max(0.18, w.rate * (1 - 0.09 * s));
        w.level += 1;
      },
    },
    {
      id: "boltPierce",
      title: "Needle Sparks",
      desc: (s) => `Spark Bolt pierces +${s >= 2.8 ? 2 : 1}.`,
      max: 4,
      needs: (g) => g.player.weapons.bolt.level > 0,
      apply: (g, s) => {
        const w = g.player.weapons.bolt;
        w.pierce += s >= 2.8 ? 2 : 1;
        w.damage *= 1 + 0.08 * s;
        w.level += 1;
      },
    },
    {
      id: "orbitUnlock",
      title: "Orbit Bonker",
      desc: () => "Adds hammers that circle you and smack crowds.",
      max: 1,
      needs: (g) => g.player.weapons.orbit.level === 0,
      apply: (g) => {
        const w = g.player.weapons.orbit;
        w.level = 1;
        w.count = 2;
      },
    },
    {
      id: "orbitCount",
      title: "More Bonkers",
      desc: (s) => `Orbit Bonker gains +${s >= 2 ? 2 : 1} hammer${s >= 2 ? "s" : ""}.`,
      max: 5,
      needs: (g) => g.player.weapons.orbit.level > 0,
      apply: (g, s) => {
        const w = g.player.weapons.orbit;
        w.count += s >= 2 ? 2 : 1;
        w.level += 1;
      },
    },
    {
      id: "orbitDamage",
      title: "Heavy Bonks",
      desc: (s) => `Orbit Bonker damage +${Math.round(26 * s)}%.`,
      max: 7,
      needs: (g) => g.player.weapons.orbit.level > 0,
      apply: (g, s) => {
        const w = g.player.weapons.orbit;
        w.damage *= 1 + 0.26 * s;
        w.radius += 5 * s;
        w.level += 1;
      },
    },
    {
      id: "orbitSpeed",
      title: "Whirligig",
      desc: (s) => `Orbit Bonker spin speed +${Math.round(18 * s)}%.`,
      max: 5,
      needs: (g) => g.player.weapons.orbit.level > 0,
      apply: (g, s) => {
        const w = g.player.weapons.orbit;
        w.speed *= 1 + 0.18 * s;
        w.hitDelay = Math.max(0.18, w.hitDelay * (1 - 0.06 * s));
        w.level += 1;
      },
    },
    {
      id: "novaUnlock",
      title: "Clap Nova",
      desc: () => "Adds a periodic shockwave around you.",
      max: 1,
      needs: (g) => g.player.weapons.nova.level === 0,
      apply: (g) => {
        const w = g.player.weapons.nova;
        w.level = 1;
      },
    },
    {
      id: "novaPower",
      title: "Louder Clap",
      desc: (s) => `Clap Nova damage +${Math.round(30 * s)}% and radius +${Math.round(10 * s)}%.`,
      max: 6,
      needs: (g) => g.player.weapons.nova.level > 0,
      apply: (g, s) => {
        const w = g.player.weapons.nova;
        w.damage *= 1 + 0.3 * s;
        w.radius *= 1 + 0.1 * s;
        w.level += 1;
      },
    },
    {
      id: "novaRate",
      title: "Echo Clap",
      desc: (s) => `Clap Nova cooldown -${Math.round(12 * s)}%.`,
      max: 5,
      needs: (g) => g.player.weapons.nova.level > 0,
      apply: (g, s) => {
        const w = g.player.weapons.nova;
        w.rate = Math.max(1.25, w.rate * (1 - 0.12 * s));
        w.level += 1;
      },
    },
    {
      id: "mineUnlock",
      title: "Thunk Mine",
      desc: () => "Drops little pressure plates that burst under mobs.",
      max: 1,
      needs: (g) => g.player.weapons.mine.level === 0,
      apply: (g) => {
        const w = g.player.weapons.mine;
        w.level = 1;
      },
    },
    {
      id: "minePower",
      title: "Packed Thunks",
      desc: (s) => `Thunk Mine blast +${Math.round(22 * s)}% and radius +${Math.round(8 * s)}%.`,
      max: 6,
      needs: (g) => g.player.weapons.mine.level > 0,
      apply: (g, s) => {
        const w = g.player.weapons.mine;
        w.damage *= 1 + 0.22 * s;
        w.radius *= 1 + 0.08 * s;
        w.level += 1;
      },
    },
    {
      id: "mineRate",
      title: "Pocket Tinkerer",
      desc: (s) => `Thunk Mine cooldown -${Math.round(12 * s)}%.`,
      max: 5,
      needs: (g) => g.player.weapons.mine.level > 0,
      apply: (g, s) => {
        const w = g.player.weapons.mine;
        w.rate = Math.max(0.9, w.rate * (1 - 0.12 * s));
        w.level += 1;
      },
    },
    {
      id: "speed",
      title: "Golden Sneakers",
      desc: (s) => `Move speed +${Math.round(10 * s)}%.`,
      max: 7,
      apply: (g, s) => {
        g.player.speed *= 1 + 0.1 * s;
      },
    },
    {
      id: "hp",
      title: "Snack Armor",
      desc: (s) => `Max health +${Math.round(18 * s)} and heal now.`,
      max: 7,
      apply: (g, s) => {
        const amount = 18 * s;
        g.player.maxHp += amount;
        g.player.hp = Math.min(g.player.maxHp, g.player.hp + amount * 1.4);
      },
    },
    {
      id: "armor",
      title: "Stubborn Padding",
      desc: (s) => `Incoming damage -${Math.round(5 * s)}%.`,
      max: 5,
      apply: (g, s) => {
        g.player.armor = Math.min(0.62, g.player.armor + 0.05 * s);
      },
    },
    {
      id: "magnet",
      title: "Greedy Magnet",
      desc: (s) => `Pickup pull +${Math.round(34 * s)}%.`,
      max: 6,
      apply: (g, s) => {
        g.player.magnet += 34 * s;
      },
    },
    {
      id: "damage",
      title: "Meaner Hands",
      desc: (s) => `All damage +${Math.round(12 * s)}%.`,
      max: 8,
      apply: (g, s) => {
        g.player.damageMult *= 1 + 0.12 * s;
      },
    },
    {
      id: "crit",
      title: "Lucky Knuckles",
      desc: (s) => `Critical chance +${Math.round(5 * s)}%.`,
      max: 5,
      apply: (g, s) => {
        g.player.crit = Math.min(0.5, g.player.crit + 0.05 * s);
      },
    },
    {
      id: "xpGain",
      title: "Book of Bonk",
      desc: (s) => `XP gained +${Math.round(14 * s)}%.`,
      max: 5,
      apply: (g, s) => {
        g.player.xpGain *= 1 + 0.14 * s;
      },
    },
    {
      id: "regen",
      title: "Warm Soup",
      desc: (s) => `Regenerate ${Math.round(0.55 * s * 10) / 10} health each second.`,
      max: 5,
      apply: (g, s) => {
        g.player.regen += 0.55 * s;
      },
    },
    {
      id: "chain",
      title: "Chain Giggle",
      desc: (s) => `Hits can jump to another target +${Math.round(8 * s)}%.`,
      max: 5,
      apply: (g, s) => {
        g.player.chainChance = Math.min(0.68, g.player.chainChance + 0.08 * s);
      },
    },
    {
      id: "luck",
      title: "Shiny Dice",
      desc: (s) => `Better upgrade rarity and chest odds +${Math.round(10 * s)}%.`,
      max: 5,
      apply: (g, s) => {
        g.player.luck += 0.1 * s;
      },
    },
  ];

  const CHEST_ITEMS = [
    {
      title: "Spark Keg",
      desc: "Defeated targets burst for splash damage.",
      apply(g) {
        g.player.explosiveKills += 1;
      },
    },
    {
      title: "Heart Jar",
      desc: "A bigger health pool with a fresh refill.",
      apply(g) {
        g.player.maxHp += 32;
        g.player.hp = Math.min(g.player.maxHp, g.player.hp + 58);
      },
    },
    {
      title: "Pocket Anvil",
      desc: "More damage with a little less footwork.",
      apply(g) {
        g.player.damageMult *= 1.22;
        g.player.speed *= 0.96;
      },
    },
    {
      title: "Thorny Button",
      desc: "Contact damage zaps nearby targets.",
      apply(g) {
        g.player.thorns += 1;
      },
    },
    {
      title: "Velvet Magnet",
      desc: "Loot slides in from farther away.",
      apply(g) {
        g.player.magnet += 72;
      },
    },
    {
      title: "Soup Coupon",
      desc: "Regeneration and a small speed lift.",
      apply(g) {
        g.player.regen += 1.1;
        g.player.speed *= 1.06;
      },
    },
  ];

  function startGame() {
    game = createGame(selectedHero);
    mode = "playing";
    lastTime = performance.now();
    hide(ui.menu);
    hide(ui.pauseScreen);
    hide(ui.resultScreen);
    hide(ui.levelScreen);
    show(ui.hud);
    show(ui.build);
    showToast(`${HEROES[selectedHero].name} enters the rift`);
    for (let i = 0; i < 10; i += 1) spawnEnemy("blob", true);
    updateHud();
  }

  function pauseGame() {
    if (mode !== "playing") return;
    mode = "paused";
    show(ui.pauseScreen);
  }

  function resumeGame() {
    if (mode !== "paused") return;
    mode = "playing";
    lastTime = performance.now();
    hide(ui.pauseScreen);
  }

  function endRun(victory) {
    if (!game || mode === "result") return;
    game.result = victory ? "victory" : "defeat";
    mode = "result";
    hide(ui.levelScreen);
    hide(ui.pauseScreen);
    ui.resultEyebrow.textContent = victory ? "Boss Broken" : "Run Complete";
    ui.resultTitle.textContent = victory ? "Rift Cleared" : "Bonked";
    ui.resultStats.innerHTML = [
      `<span><strong>${formatTime(game.time)}</strong>Time</span>`,
      `<span><strong>${game.kills}</strong>KOs</span>`,
      `<span><strong>${game.player.level}</strong>Level</span>`,
    ].join("");
    show(ui.resultScreen);
  }

  function hide(element) {
    element.classList.add("is-hidden");
  }

  function show(element) {
    element.classList.remove("is-hidden");
  }

  function showToast(message) {
    ui.toast.textContent = message;
    ui.toast.classList.add("is-visible");
    toastTimer = 2.5;
  }

  function rollRarity() {
    const luck = game.player.luck;
    const weights = RARITIES.map((rarity, index) => {
      if (index === 0) return Math.max(24, rarity.weight - luck * 42);
      return rarity.weight + luck * (index * 8 + 5);
    });
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let roll = game.rng() * total;
    for (let i = 0; i < RARITIES.length; i += 1) {
      roll -= weights[i];
      if (roll <= 0) return RARITIES[i];
    }
    return RARITIES[0];
  }

  function openLevelUp() {
    if (!game || mode === "result") return;
    mode = "level";
    game.pendingLevelUps = Math.max(0, game.pendingLevelUps - 1);
    const choices = [];
    const used = new Set();
    let guard = 0;
    while (choices.length < 3 && guard < 80) {
      guard += 1;
      const eligible = UPGRADE_TEMPLATES.filter((template) => {
        const count = game.upgradeCounts[template.id] || 0;
        return count < (template.max || Infinity) && (!template.needs || template.needs(game));
      });
      if (!eligible.length) break;
      const template = eligible[Math.floor(game.rng() * eligible.length)];
      if (used.has(template.id)) continue;
      used.add(template.id);
      const rarity = rollRarity();
      choices.push({
        template,
        rarity,
        scale: rarity.scale,
        title: template.title,
        desc: template.desc(rarity.scale),
      });
    }
    game.upgradeChoices = choices;
    ui.upgradeChoices.innerHTML = "";
    choices.forEach((choice, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "upgrade-card";
      button.style.setProperty("--rarity-color", choice.rarity.color);
      button.innerHTML = `
        <span class="rarity">${choice.rarity.label}</span>
        <strong>${choice.title}</strong>
        <span>${choice.desc}</span>
      `;
      button.addEventListener("click", () => chooseUpgrade(index));
      ui.upgradeChoices.appendChild(button);
    });
    show(ui.levelScreen);
  }

  function chooseUpgrade(index) {
    if (mode !== "level" || !game) return;
    const choice = game.upgradeChoices[index];
    if (!choice) return;
    choice.template.apply(game, choice.scale, choice.rarity);
    game.upgradeCounts[choice.template.id] = (game.upgradeCounts[choice.template.id] || 0) + 1;
    showToast(`${choice.rarity.label}: ${choice.title}`);
    hide(ui.levelScreen);
    if (game.pendingLevelUps > 0) {
      window.setTimeout(() => openLevelUp(), 120);
    } else {
      mode = "playing";
      lastTime = performance.now();
    }
    updateHud();
  }

  function addXp(amount) {
    const player = game.player;
    player.xp += amount * player.xpGain;
    while (player.xp >= player.xpNext) {
      player.xp -= player.xpNext;
      player.level += 1;
      player.xpNext = Math.floor(18 + player.level * 10 + Math.pow(player.level, 1.42) * 3.8);
      game.pendingLevelUps += 1;
    }
    if (game.pendingLevelUps > 0 && mode === "playing") openLevelUp();
  }

  function getMoveVector() {
    let x = 0;
    let y = 0;
    if (keys.has("w") || keys.has("arrowup")) y -= 1;
    if (keys.has("s") || keys.has("arrowdown")) y += 1;
    if (keys.has("a") || keys.has("arrowleft")) x -= 1;
    if (keys.has("d") || keys.has("arrowright")) x += 1;
    if (pointer.active) {
      x += pointer.vx;
      y += pointer.vy;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  function update(dt) {
    if (!game) return;
    game.time += dt;
    game.wave = 1 + Math.floor(game.time / 28);
    updatePlayer(dt);
    updateWeapons(dt);
    updateSpawns(dt);
    updateEnemies(dt);
    updateProjectiles(dt);
    updateEnemyShots(dt);
    updateGems(dt);
    updatePickups(dt);
    updateMines(dt);
    updatePulses(dt);
    updateParticles(dt);
    game.enemies = game.enemies.filter((enemy) => !enemy.dead);
    game.projectiles = game.projectiles.filter((projectile) => !projectile.dead);
    game.enemyShots = game.enemyShots.filter((shot) => !shot.dead);
    game.gems = game.gems.filter((gem) => !gem.dead);
    game.pickups = game.pickups.filter((pickup) => !pickup.dead);
    game.mines = game.mines.filter((mine) => !mine.dead);
    game.pulses = game.pulses.filter((pulse) => pulse.life > 0);
    game.particles = game.particles.filter((particle) => particle.life > 0);
    game.texts = game.texts.filter((text) => text.life > 0);
    updateCamera(dt);
    updateHud();
    if (game.player.hp <= 0) endRun(false);
  }

  function updatePlayer(dt) {
    const player = game.player;
    const move = getMoveVector();
    const targetVx = move.x * player.speed;
    const targetVy = move.y * player.speed;
    player.vx = lerp(player.vx, targetVx, 1 - Math.pow(0.002, dt));
    player.vy = lerp(player.vy, targetVy, 1 - Math.pow(0.002, dt));
    player.x = clamp(player.x + player.vx * dt, 80, WORLD_SIZE - 80);
    player.y = clamp(player.y + player.vy * dt, 80, WORLD_SIZE - 80);
    if (player.regen > 0) player.hp = Math.min(player.maxHp, player.hp + player.regen * dt);
    player.trailTimer -= dt;
    if (Math.hypot(player.vx, player.vy) > 120 && player.trailTimer <= 0) {
      player.trailTimer = 0.045;
      addParticle(player.x - player.vx * 0.035, player.y - player.vy * 0.035, player.trim, 0.35, 5, {
        vx: -player.vx * 0.05 + (game.rng() - 0.5) * 30,
        vy: -player.vy * 0.05 + (game.rng() - 0.5) * 30,
      });
    }
  }

  function updateWeapons(dt) {
    const player = game.player;
    const bolt = player.weapons.bolt;
    if (bolt.level > 0) {
      bolt.cooldown -= dt;
      if (bolt.cooldown <= 0) {
        fireBolts();
        bolt.cooldown += bolt.rate;
      }
    }

    const orbit = player.weapons.orbit;
    if (orbit.level > 0 && orbit.count > 0) {
      orbit.angle += orbit.speed * dt;
      for (const enemy of game.enemies) {
        if (enemy.dead) continue;
        for (let i = 0; i < orbit.count; i += 1) {
          const angle = orbit.angle + (i / orbit.count) * TAU;
          const hx = player.x + Math.cos(angle) * orbit.radius;
          const hy = player.y + Math.sin(angle) * orbit.radius * 0.72;
          const key = `o${i}`;
          const lastHit = enemy.hitTimes[key] || -99;
          if (game.time - lastHit > orbit.hitDelay && distSq(hx, hy, enemy.x, enemy.y) < (enemy.r + 13) ** 2) {
            enemy.hitTimes[key] = game.time;
            damageEnemy(enemy, orbit.damage, hx, hy, player.trim, 0.45);
          }
        }
      }
    }

    const nova = player.weapons.nova;
    if (nova.level > 0) {
      nova.cooldown -= dt;
      if (nova.cooldown <= 0) {
        pulse(player.x, player.y, nova.radius, nova.damage, player.color);
        nova.cooldown += nova.rate;
      }
    }

    const mine = player.weapons.mine;
    if (mine.level > 0) {
      mine.cooldown -= dt;
      if (mine.cooldown <= 0) {
        const angle = game.rng() * TAU;
        const distance = 30 + game.rng() * 54;
        game.mines.push({
          x: clamp(player.x + Math.cos(angle) * distance, 60, WORLD_SIZE - 60),
          y: clamp(player.y + Math.sin(angle) * distance, 60, WORLD_SIZE - 60),
          r: 13,
          radius: mine.radius,
          damage: mine.damage,
          armed: 0.34,
          life: 18,
          pulse: 0,
        });
        mine.cooldown += mine.rate;
      }
    }
  }

  function fireBolts() {
    const player = game.player;
    const weapon = player.weapons.bolt;
    const targets = nearestEnemies(player.x, player.y, weapon.count, weapon.range);
    if (!targets.length) return;
    for (let i = 0; i < weapon.count; i += 1) {
      const target = targets[i % targets.length];
      const baseAngle = Math.atan2(target.y - player.y, target.x - player.x);
      const spread = (i - (weapon.count - 1) / 2) * 0.13;
      const angle = baseAngle + spread;
      const crit = game.rng() < player.crit;
      game.projectiles.push({
        id: projectileId += 1,
        x: player.x + Math.cos(angle) * 16,
        y: player.y + Math.sin(angle) * 16,
        vx: Math.cos(angle) * weapon.speed,
        vy: Math.sin(angle) * weapon.speed,
        r: crit ? 7 : 5,
        damage: weapon.damage * (crit ? 1.75 : 1),
        life: 1.25,
        pierceLeft: weapon.pierce,
        color: crit ? "#ffd166" : player.color,
        hit: new Set(),
      });
    }
  }

  function updateSpawns(dt) {
    const living = game.enemies.length;
    const spawnRate = 0.62 + Math.min(7.2, game.time * 0.022) + game.wave * 0.08;
    game.spawnBudget += dt * spawnRate;
    const cap = Math.min(230, 55 + game.wave * 16);
    while (game.spawnBudget >= 1 && living + game.spawnBudget < cap) {
      spawnEnemy();
      game.spawnBudget -= 1;
    }
    game.nextElite -= dt;
    if (game.nextElite <= 0) {
      spawnEnemy("elite");
      game.nextElite = Math.max(8, 22 - game.wave * 0.7) + game.rng() * 9;
    }
    if (!game.bossSpawned && game.time >= BOSS_TIME) {
      game.bossSpawned = true;
      spawnEnemy("boss");
      showToast("A very bad statue has arrived");
    }
  }

  function spawnPoint(near = false) {
    const player = game.player;
    const angle = game.rng() * TAU;
    const distance = near ? 230 + game.rng() * 260 : Math.max(width, height) * 0.62 + 180 + game.rng() * 260;
    return {
      x: clamp(player.x + Math.cos(angle) * distance, 80, WORLD_SIZE - 80),
      y: clamp(player.y + Math.sin(angle) * distance, 80, WORLD_SIZE - 80),
    };
  }

  function spawnEnemy(forceType, near = false) {
    const t = game.time;
    const roll = game.rng();
    let type = forceType;
    if (!type) {
      if (t > 82 && roll < 0.13) type = "brute";
      else if (t > 46 && roll < 0.27) type = "spitter";
      else if (t > 22 && roll < 0.44) type = "charger";
      else type = "blob";
    }
    const pos = spawnPoint(near);
    const scale = 1 + game.wave * 0.12;
    const enemy = {
      id: enemyId += 1,
      type,
      x: pos.x,
      y: pos.y,
      vx: 0,
      vy: 0,
      r: 16,
      hp: 20 * scale,
      maxHp: 20 * scale,
      speed: 72,
      damage: 10,
      xp: 4,
      flash: 0,
      age: 0,
      attack: 1 + game.rng(),
      charge: 0,
      chargeAngle: 0,
      elite: false,
      dead: false,
      hitTimes: {},
    };
    if (type === "charger") {
      Object.assign(enemy, {
        r: 14,
        hp: 17 * scale,
        maxHp: 17 * scale,
        speed: 112 + game.wave * 2,
        damage: 12,
        xp: 5,
      });
    } else if (type === "spitter") {
      Object.assign(enemy, {
        r: 18,
        hp: 27 * scale,
        maxHp: 27 * scale,
        speed: 58,
        damage: 9,
        xp: 6,
        attack: 0.8 + game.rng() * 1.6,
      });
    } else if (type === "brute") {
      Object.assign(enemy, {
        r: 25,
        hp: 92 * scale,
        maxHp: 92 * scale,
        speed: 43,
        damage: 18,
        xp: 13,
      });
    } else if (type === "elite") {
      const base = game.rng() < 0.45 ? "brute" : game.rng() < 0.5 ? "spitter" : "charger";
      enemy.type = base;
      enemy.elite = true;
      enemy.r = base === "brute" ? 34 : 24;
      enemy.hp = 190 * scale;
      enemy.maxHp = enemy.hp;
      enemy.speed = base === "charger" ? 98 : 48;
      enemy.damage = 22;
      enemy.xp = 34;
    } else if (type === "boss") {
      Object.assign(enemy, {
        type: "boss",
        r: 62,
        hp: 1850 + game.wave * 240,
        maxHp: 1850 + game.wave * 240,
        speed: 36,
        damage: 28,
        xp: 200,
        attack: 2.5,
        elite: true,
      });
    }
    game.enemies.push(enemy);
  }

  function updateEnemies(dt) {
    const player = game.player;
    for (const enemy of game.enemies) {
      if (enemy.dead) continue;
      enemy.age += dt;
      enemy.flash = Math.max(0, enemy.flash - dt);
      if (enemy.type === "boss") {
        updateBoss(enemy, dt);
      } else if (enemy.type === "spitter") {
        updateSpitter(enemy, dt);
      } else if (enemy.type === "charger") {
        updateCharger(enemy, dt);
      } else {
        chasePlayer(enemy, dt, enemy.speed);
      }

      enemy.x = clamp(enemy.x, 40, WORLD_SIZE - 40);
      enemy.y = clamp(enemy.y, 40, WORLD_SIZE - 40);

      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;
      const minDistance = player.r + enemy.r;
      if (distance < minDistance) {
        const nx = dx / distance;
        const ny = dy / distance;
        const overlap = minDistance - distance;
        enemy.x -= nx * overlap * 0.5;
        enemy.y -= ny * overlap * 0.5;
        player.x += nx * overlap * 0.12;
        player.y += ny * overlap * 0.12;
        hurtPlayer(enemy.damage * dt * 0.92);
        if (player.thorns > 0 && game.rng() < dt * 4) {
          damageEnemy(enemy, 8 * player.thorns, player.x, player.y, "#63d471", 0.2);
        }
      }
    }
  }

  function chasePlayer(enemy, dt, speed) {
    const player = game.player;
    const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    enemy.vx = lerp(enemy.vx, Math.cos(angle) * speed, 0.08);
    enemy.vy = lerp(enemy.vy, Math.sin(angle) * speed, 0.08);
    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;
  }

  function updateSpitter(enemy, dt) {
    const player = game.player;
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    const desired = distance < 310 ? -enemy.speed * 0.8 : enemy.speed * 0.75;
    enemy.vx = lerp(enemy.vx, (dx / distance) * desired + (-dy / distance) * 24, 0.06);
    enemy.vy = lerp(enemy.vy, (dy / distance) * desired + (dx / distance) * 24, 0.06);
    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;
    enemy.attack -= dt;
    if (enemy.attack <= 0 && distance < 760) {
      shootEnemyBullet(enemy.x, enemy.y, Math.atan2(dy, dx), 240 + game.wave * 6, 12, "#ba7cff");
      enemy.attack = Math.max(1.0, 2.4 - game.wave * 0.05) + game.rng() * 0.8;
    }
  }

  function updateCharger(enemy, dt) {
    const player = game.player;
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    enemy.attack -= dt;
    if (enemy.charge > 0) {
      enemy.charge -= dt;
      enemy.vx = Math.cos(enemy.chargeAngle) * (enemy.speed * 3.1);
      enemy.vy = Math.sin(enemy.chargeAngle) * (enemy.speed * 3.1);
    } else if (enemy.attack <= 0 && distance < 620) {
      enemy.charge = 0.38;
      enemy.chargeAngle = Math.atan2(dy, dx);
      enemy.attack = 2.4 + game.rng() * 1.2;
    } else {
      enemy.vx = lerp(enemy.vx, (dx / distance) * enemy.speed, 0.08);
      enemy.vy = lerp(enemy.vy, (dy / distance) * enemy.speed, 0.08);
    }
    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;
  }

  function updateBoss(enemy, dt) {
    chasePlayer(enemy, dt, enemy.speed);
    enemy.attack -= dt;
    if (enemy.attack <= 0) {
      const count = 12 + Math.min(16, game.wave);
      const offset = game.time * 0.7;
      for (let i = 0; i < count; i += 1) {
        shootEnemyBullet(enemy.x, enemy.y, offset + (i / count) * TAU, 178 + game.wave * 4, 16, "#ff6b5f");
      }
      enemy.attack = Math.max(2.2, 4.2 - game.wave * 0.07);
      game.screenShake = Math.max(game.screenShake, 7);
      showToast("The statue is throwing a tantrum");
    }
  }

  function shootEnemyBullet(x, y, angle, speed, damage, color) {
    game.enemyShots.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 7,
      damage,
      color,
      life: 4.2,
      dead: false,
    });
  }

  function updateProjectiles(dt) {
    for (const projectile of game.projectiles) {
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      projectile.life -= dt;
      if (projectile.life <= 0) projectile.dead = true;
      for (const enemy of game.enemies) {
        if (enemy.dead || projectile.dead || projectile.hit.has(enemy.id)) continue;
        if (distSq(projectile.x, projectile.y, enemy.x, enemy.y) <= (projectile.r + enemy.r) ** 2) {
          projectile.hit.add(enemy.id);
          damageEnemy(enemy, projectile.damage, projectile.x, projectile.y, projectile.color, 0.8);
          if (game.rng() < game.player.chainChance) zapChain(enemy, projectile.damage * 0.55);
          if (projectile.pierceLeft <= 0) projectile.dead = true;
          else projectile.pierceLeft -= 1;
        }
      }
    }
  }

  function updateEnemyShots(dt) {
    const player = game.player;
    for (const shot of game.enemyShots) {
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.life -= dt;
      if (shot.life <= 0) shot.dead = true;
      if (!shot.dead && distSq(shot.x, shot.y, player.x, player.y) < (shot.r + player.r) ** 2) {
        shot.dead = true;
        hurtPlayer(shot.damage);
        for (let i = 0; i < 8; i += 1) addParticle(shot.x, shot.y, shot.color, 0.35, 4);
      }
    }
  }

  function updateGems(dt) {
    const player = game.player;
    for (const gem of game.gems) {
      const dx = player.x - gem.x;
      const dy = player.y - gem.y;
      const distance = Math.hypot(dx, dy) || 1;
      if (distance < player.magnet + gem.r) {
        const pull = 140 + (1 - distance / (player.magnet + gem.r)) * 700;
        gem.vx = lerp(gem.vx, (dx / distance) * pull, 0.1);
        gem.vy = lerp(gem.vy, (dy / distance) * pull, 0.1);
      } else {
        gem.vx *= 0.98;
        gem.vy *= 0.98;
      }
      gem.x += gem.vx * dt;
      gem.y += gem.vy * dt;
      if (distance < player.r + gem.r + 8) {
        gem.dead = true;
        addXp(gem.value);
        addParticle(gem.x, gem.y, "#44d9c7", 0.28, 7);
      }
    }
  }

  function updatePickups(dt) {
    const player = game.player;
    for (const pickup of game.pickups) {
      pickup.age += dt;
      if (distSq(pickup.x, pickup.y, player.x, player.y) < (pickup.r + player.r + 8) ** 2) {
        pickup.dead = true;
        if (pickup.type === "chest") openChest();
        if (pickup.type === "heart") {
          player.hp = Math.min(player.maxHp, player.hp + pickup.value);
          showToast("Fresh snack");
        }
      }
    }
  }

  function updateMines(dt) {
    for (const mine of game.mines) {
      mine.armed -= dt;
      mine.life -= dt;
      mine.pulse += dt;
      if (mine.life <= 0) mine.dead = true;
      if (mine.dead || mine.armed > 0) continue;
      const target = game.enemies.find((enemy) => !enemy.dead && distSq(enemy.x, enemy.y, mine.x, mine.y) < (enemy.r + mine.r + 6) ** 2);
      if (target) {
        mine.dead = true;
        pulse(mine.x, mine.y, mine.radius, mine.damage, "#ffd166");
        game.screenShake = Math.max(game.screenShake, 5);
      }
    }
  }

  function updatePulses(dt) {
    for (const pulseItem of game.pulses) {
      pulseItem.life -= dt;
      pulseItem.t += dt;
    }
  }

  function updateParticles(dt) {
    for (const particle of game.particles) {
      particle.life -= dt;
      particle.x += (particle.vx || 0) * dt;
      particle.y += (particle.vy || 0) * dt;
      if (particle.type === "beam") continue;
      particle.vx *= 0.96;
      particle.vy *= 0.96;
    }
    for (const text of game.texts) {
      text.life -= dt;
      text.y -= 24 * dt;
    }
    game.screenShake = Math.max(0, game.screenShake - dt * 18);
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) ui.toast.classList.remove("is-visible");
    }
  }

  function updateCamera(dt) {
    const targetX = game.player.x - width / 2;
    const targetY = game.player.y - height / 2;
    game.camera.x = clamp(lerp(game.camera.x, targetX, 1 - Math.pow(0.0006, dt)), 0, WORLD_SIZE - width);
    game.camera.y = clamp(lerp(game.camera.y, targetY, 1 - Math.pow(0.0006, dt)), 0, WORLD_SIZE - height);
  }

  function hurtPlayer(amount) {
    const player = game.player;
    const reduced = amount * Math.max(0.24, 1 - player.armor);
    player.hp -= reduced;
    game.screenShake = Math.max(game.screenShake, Math.min(8, reduced * 0.32));
  }

  function damageEnemy(enemy, amount, sourceX, sourceY, color, knockback) {
    if (enemy.dead) return;
    const player = game.player;
    const finalDamage = amount * player.damageMult;
    enemy.hp -= finalDamage;
    enemy.flash = 0.08;
    const dx = enemy.x - sourceX;
    const dy = enemy.y - sourceY;
    const distance = Math.hypot(dx, dy) || 1;
    enemy.x += (dx / distance) * (knockback || 0) * 12;
    enemy.y += (dy / distance) * (knockback || 0) * 12;
    if (finalDamage > 34 || game.rng() < 0.16) {
      game.texts.push({
        x: enemy.x,
        y: enemy.y - enemy.r - 6,
        value: Math.round(finalDamage),
        color,
        life: 0.55,
      });
    }
    addParticle(enemy.x, enemy.y, color, 0.22, 3, {
      vx: (dx / distance) * 60,
      vy: (dy / distance) * 60,
    });
    if (enemy.hp <= 0) killEnemy(enemy);
  }

  function killEnemy(enemy) {
    if (enemy.dead) return;
    enemy.dead = true;
    game.kills += 1;
    game.score += Math.floor(enemy.maxHp);
    const gemCount = enemy.type === "boss" ? 18 : enemy.elite ? 8 : enemy.type === "brute" ? 4 : 1;
    for (let i = 0; i < gemCount; i += 1) {
      const angle = game.rng() * TAU;
      const distance = game.rng() * enemy.r * 1.2;
      spawnGem(enemy.x + Math.cos(angle) * distance, enemy.y + Math.sin(angle) * distance, enemy.xp / gemCount);
    }
    if (enemy.elite && enemy.type !== "boss") {
      game.pickups.push({ type: "chest", x: enemy.x, y: enemy.y, r: 20, age: 0 });
    } else if (game.rng() < 0.012 + game.player.luck * 0.015) {
      game.pickups.push({ type: "heart", x: enemy.x, y: enemy.y, r: 14, age: 0, value: 22 });
    }
    if (game.player.explosiveKills > 0) {
      pulse(enemy.x, enemy.y, 62 + game.player.explosiveKills * 18, 18 + game.player.explosiveKills * 10, "#ff6b5f", true);
    }
    for (let i = 0; i < 10; i += 1) addParticle(enemy.x, enemy.y, enemy.elite ? "#ffd166" : "#fff7df", 0.45, 5);
    if (enemy.type === "boss") {
      endRun(true);
    }
  }

  function spawnGem(x, y, value) {
    const angle = game.rng() * TAU;
    const speed = 45 + game.rng() * 90;
    game.gems.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 7 + Math.min(5, value * 0.18),
      value,
      dead: false,
    });
  }

  function openChest() {
    const item = CHEST_ITEMS[Math.floor(game.rng() * CHEST_ITEMS.length)];
    item.apply(game);
    showToast(`Chest: ${item.title}`);
    for (let i = 0; i < 28; i += 1) addParticle(game.player.x, game.player.y, "#ffd166", 0.65, 7);
  }

  function pulse(x, y, radius, damage, color, quiet) {
    const pulseItem = { x, y, radius, color, life: 0.42, maxLife: 0.42, t: 0 };
    game.pulses.push(pulseItem);
    for (const enemy of game.enemies) {
      if (!enemy.dead && distSq(x, y, enemy.x, enemy.y) < (radius + enemy.r) ** 2) {
        damageEnemy(enemy, damage, x, y, color, 1.1);
      }
    }
    if (!quiet) game.screenShake = Math.max(game.screenShake, 3);
  }

  function zapChain(source, amount) {
    const target = nearestEnemies(source.x, source.y, 1, 190, source.id)[0];
    if (!target) return;
    damageEnemy(target, amount, source.x, source.y, "#44d9c7", 0.25);
    game.particles.push({
      type: "beam",
      x: source.x,
      y: source.y,
      x2: target.x,
      y2: target.y,
      color: "#44d9c7",
      life: 0.16,
      maxLife: 0.16,
    });
  }

  function nearestEnemies(x, y, count, range, excludeId) {
    const rangeSq = range * range;
    return game.enemies
      .filter((enemy) => !enemy.dead && enemy.id !== excludeId && distSq(x, y, enemy.x, enemy.y) <= rangeSq)
      .sort((a, b) => distSq(x, y, a.x, a.y) - distSq(x, y, b.x, b.y))
      .slice(0, count);
  }

  function addParticle(x, y, color, life, size, extra = {}) {
    const angle = game ? game.rng() * TAU : Math.random() * TAU;
    const speed = 20 + (game ? game.rng() : Math.random()) * 100;
    game.particles.push({
      x,
      y,
      vx: extra.vx ?? Math.cos(angle) * speed,
      vy: extra.vy ?? Math.sin(angle) * speed,
      color,
      life,
      maxLife: life,
      size,
    });
  }

  function draw(now) {
    ctx.clearRect(0, 0, width, height);
    if (!game) {
      drawAttract(now);
      return;
    }

    const shake = game.screenShake;
    const sx = shake ? (game.rng() - 0.5) * shake : 0;
    const sy = shake ? (game.rng() - 0.5) * shake : 0;
    ctx.save();
    ctx.translate(-game.camera.x + sx, -game.camera.y + sy);
    drawGround();
    drawPickups();
    drawMines();
    drawGems();
    drawPulses();
    drawProjectiles();
    drawEnemyShots();
    drawActors();
    drawParticles();
    drawTexts();
    ctx.restore();
    drawBossBar();
  }

  function drawAttract(now) {
    const t = now * 0.001;
    ctx.fillStyle = "#172014";
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, height / 2);
    for (let i = 0; i < 120; i += 1) {
      const angle = i * 2.399 + t * 0.18;
      const radius = 80 + (i % 16) * 32 + Math.sin(t + i) * 6;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius * 0.58;
      ctx.globalAlpha = 0.16 + (i % 5) * 0.02;
      ctx.fillStyle = i % 3 === 0 ? "#44d9c7" : i % 3 === 1 ? "#ff6b5f" : "#ffd166";
      ctx.beginPath();
      ctx.moveTo(x, y - 5);
      ctx.lineTo(x + 5, y);
      ctx.lineTo(x, y + 5);
      ctx.lineTo(x - 5, y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawGround() {
    const cam = game.camera;
    ctx.fillStyle = "#1c3727";
    ctx.fillRect(cam.x - 80, cam.y - 80, width + 160, height + 160);

    const grid = 96;
    const startX = Math.floor((cam.x - 80) / grid) * grid;
    const endX = cam.x + width + 80;
    const startY = Math.floor((cam.y - 80) / grid) * grid;
    const endY = cam.y + height + 80;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(255, 247, 223, 0.045)";
    for (let x = startX; x < endX; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
      ctx.stroke();
    }
    for (let y = startY; y < endY; y += grid) {
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(255, 209, 102, 0.28)";
    ctx.lineWidth = 10;
    ctx.strokeRect(18, 18, WORLD_SIZE - 36, WORLD_SIZE - 36);

    for (const prop of game.props) {
      if (prop.x < cam.x - 80 || prop.x > cam.x + width + 80 || prop.y < cam.y - 100 || prop.y > cam.y + height + 120) continue;
      drawProp(prop);
    }
  }

  function drawProp(prop) {
    ctx.save();
    ctx.translate(prop.x, prop.y);
    ctx.rotate(prop.rot);
    ctx.globalAlpha = 0.78;
    if (prop.type === "rock") {
      ctx.fillStyle = prop.colorShift > 0.5 ? "#586456" : "#384c42";
      ellipse(0, prop.size * 0.2, prop.size * 0.8, prop.size * 0.34, "rgba(0,0,0,0.2)");
      polygon([
        [-prop.size * 0.7, 0],
        [-prop.size * 0.2, -prop.size * 0.52],
        [prop.size * 0.56, -prop.size * 0.34],
        [prop.size * 0.72, prop.size * 0.24],
        [0, prop.size * 0.54],
      ]);
      ctx.fill();
    } else if (prop.type === "tuft") {
      ctx.strokeStyle = prop.colorShift > 0.5 ? "#63d471" : "#2f8b57";
      ctx.lineWidth = 2;
      for (let i = -2; i <= 2; i += 1) {
        ctx.beginPath();
        ctx.moveTo(i * 4, prop.size * 0.2);
        ctx.lineTo(i * 7, -prop.size * (0.34 + Math.abs(i) * 0.04));
        ctx.stroke();
      }
    } else if (prop.type === "lamp") {
      ctx.fillStyle = "#402b22";
      ctx.fillRect(-3, -prop.size * 0.9, 6, prop.size);
      ellipse(0, -prop.size, prop.size * 0.28, prop.size * 0.28, "#ffd166");
    } else if (prop.type === "mush") {
      ctx.fillStyle = "#d96459";
      ellipse(0, -prop.size * 0.28, prop.size * 0.58, prop.size * 0.34, "#d96459");
      ctx.fillStyle = "#f5d49a";
      ctx.fillRect(-prop.size * 0.12, -prop.size * 0.28, prop.size * 0.24, prop.size * 0.62);
    } else {
      ctx.fillStyle = "#5c7c58";
      ctx.fillRect(-prop.size * 0.42, -prop.size * 0.42, prop.size * 0.84, prop.size * 0.84);
      ctx.strokeStyle = "rgba(0,0,0,0.24)";
      ctx.strokeRect(-prop.size * 0.42, -prop.size * 0.42, prop.size * 0.84, prop.size * 0.84);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawActors() {
    const actors = [...game.enemies, game.player].sort((a, b) => a.y - b.y);
    for (const actor of actors) {
      if (actor === game.player) drawPlayer(actor);
      else drawEnemy(actor);
    }
    drawOrbiters();
  }

  function drawPlayer(player) {
    ellipse(player.x, player.y + 19, 24, 9, "rgba(0,0,0,0.28)");
    ctx.save();
    ctx.translate(player.x, player.y);
    const bob = Math.sin(game.time * 10) * Math.min(2.5, Math.hypot(player.vx, player.vy) / 120);
    ctx.translate(0, bob);
    ctx.fillStyle = player.color;
    ellipse(0, 2, 15, 18, player.color);
    ctx.fillStyle = player.trim;
    ctx.fillRect(-15, 11, 30, 5);
    ctx.fillStyle = "#fff7df";
    ellipse(0, -16, 12, 11, "#fff7df");
    ctx.fillStyle = "#15110e";
    ellipse(-4, -17, 2, 2, "#15110e");
    ellipse(5, -17, 2, 2, "#15110e");
    ctx.strokeStyle = player.trim;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-14, -4);
    ctx.lineTo(-24, 7);
    ctx.moveTo(14, -3);
    ctx.lineTo(24, 5);
    ctx.stroke();
    ctx.restore();
  }

  function drawOrbiters() {
    const player = game.player;
    const orbit = player.weapons.orbit;
    if (orbit.level <= 0 || orbit.count <= 0) return;
    ctx.save();
    ctx.strokeStyle = "rgba(255,247,223,0.08)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(player.x, player.y, orbit.radius, orbit.radius * 0.72, 0, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < orbit.count; i += 1) {
      const angle = orbit.angle + (i / orbit.count) * TAU;
      const hx = player.x + Math.cos(angle) * orbit.radius;
      const hy = player.y + Math.sin(angle) * orbit.radius * 0.72;
      ellipse(hx, hy + 7, 12, 5, "rgba(0,0,0,0.24)");
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(angle);
      ctx.fillStyle = player.trim;
      ctx.fillRect(-10, -8, 20, 16);
      ctx.fillStyle = "#fff7df";
      ctx.fillRect(-3, 8, 6, 12);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawEnemy(enemy) {
    ellipse(enemy.x, enemy.y + enemy.r * 0.72, enemy.r * 0.92, enemy.r * 0.34, "rgba(0,0,0,0.25)");
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    const flash = enemy.flash > 0;
    let color = "#7fcf5a";
    let trim = "#2d6b45";
    if (enemy.type === "charger") {
      color = "#ff6b5f";
      trim = "#672e2a";
    } else if (enemy.type === "spitter") {
      color = "#ba7cff";
      trim = "#4b356f";
    } else if (enemy.type === "brute") {
      color = "#a8b098";
      trim = "#536052";
    } else if (enemy.type === "boss") {
      color = "#ff8a5b";
      trim = "#ffd166";
    }
    if (flash) color = "#fff7df";
    if (enemy.type === "charger") {
      ctx.rotate(Math.atan2(game.player.y - enemy.y, game.player.x - enemy.x));
      ctx.fillStyle = color;
      polygon([
        [enemy.r, 0],
        [-enemy.r * 0.75, -enemy.r * 0.74],
        [-enemy.r * 0.45, 0],
        [-enemy.r * 0.75, enemy.r * 0.74],
      ]);
      ctx.fill();
    } else if (enemy.type === "boss") {
      ctx.fillStyle = color;
      ctx.fillRect(-enemy.r * 0.72, -enemy.r * 0.82, enemy.r * 1.44, enemy.r * 1.42);
      ctx.fillStyle = trim;
      ctx.fillRect(-enemy.r * 0.5, -enemy.r * 1.02, enemy.r, enemy.r * 0.2);
      ctx.fillStyle = "#15110e";
      ctx.fillRect(-enemy.r * 0.36, -enemy.r * 0.42, enemy.r * 0.22, enemy.r * 0.18);
      ctx.fillRect(enemy.r * 0.14, -enemy.r * 0.42, enemy.r * 0.22, enemy.r * 0.18);
    } else if (enemy.type === "brute") {
      ctx.fillStyle = color;
      polygon([
        [-enemy.r * 0.8, -enemy.r * 0.35],
        [-enemy.r * 0.2, -enemy.r],
        [enemy.r * 0.7, -enemy.r * 0.58],
        [enemy.r * 0.82, enemy.r * 0.34],
        [0, enemy.r],
        [-enemy.r * 0.88, enemy.r * 0.44],
      ]);
      ctx.fill();
      ctx.fillStyle = trim;
      ctx.fillRect(-enemy.r * 0.3, -enemy.r * 0.05, enemy.r * 0.6, enemy.r * 0.18);
    } else {
      ellipse(0, 0, enemy.r, enemy.r * 0.86, color);
      ctx.fillStyle = trim;
      ellipse(-enemy.r * 0.34, -enemy.r * 0.12, enemy.r * 0.14, enemy.r * 0.16, trim);
      ellipse(enemy.r * 0.34, -enemy.r * 0.12, enemy.r * 0.14, enemy.r * 0.16, trim);
    }
    if (enemy.elite) {
      ctx.strokeStyle = "#ffd166";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, enemy.r + 5 + Math.sin(game.time * 5) * 2, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawProjectiles() {
    for (const projectile of game.projectiles) {
      ellipse(projectile.x, projectile.y, projectile.r, projectile.r, projectile.color);
      ctx.strokeStyle = "rgba(255,255,255,0.44)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(projectile.x - projectile.vx * 0.025, projectile.y - projectile.vy * 0.025);
      ctx.lineTo(projectile.x, projectile.y);
      ctx.stroke();
    }
  }

  function drawEnemyShots() {
    for (const shot of game.enemyShots) {
      ellipse(shot.x, shot.y, shot.r + 3, shot.r + 3, "rgba(0,0,0,0.22)");
      ellipse(shot.x, shot.y, shot.r, shot.r, shot.color);
    }
  }

  function drawGems() {
    for (const gem of game.gems) {
      ctx.save();
      ctx.translate(gem.x, gem.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = gem.value > 7 ? "#ffd166" : "#44d9c7";
      ctx.fillRect(-gem.r * 0.72, -gem.r * 0.72, gem.r * 1.44, gem.r * 1.44);
      ctx.restore();
    }
  }

  function drawPickups() {
    for (const pickup of game.pickups) {
      if (pickup.type === "chest") {
        ellipse(pickup.x, pickup.y + 15, 22, 8, "rgba(0,0,0,0.24)");
        ctx.save();
        ctx.translate(pickup.x, pickup.y + Math.sin(game.time * 3 + pickup.age) * 2);
        ctx.fillStyle = "#8b5b35";
        ctx.fillRect(-18, -13, 36, 26);
        ctx.fillStyle = "#ffd166";
        ctx.fillRect(-18, -4, 36, 6);
        ctx.fillRect(-4, -13, 8, 26);
        ctx.restore();
      } else {
        ellipse(pickup.x, pickup.y, pickup.r, pickup.r, "#ff6b5f");
        ellipse(pickup.x, pickup.y - 3, pickup.r * 0.42, pickup.r * 0.42, "#fff7df");
      }
    }
  }

  function drawMines() {
    for (const mine of game.mines) {
      const alpha = mine.armed > 0 ? 0.45 : 0.8 + Math.sin(mine.pulse * 8) * 0.16;
      ctx.globalAlpha = alpha;
      ellipse(mine.x, mine.y + 7, 15, 5, "rgba(0,0,0,0.25)");
      ctx.fillStyle = "#ffd166";
      ctx.fillRect(mine.x - 10, mine.y - 7, 20, 14);
      ctx.fillStyle = "#15110e";
      ctx.fillRect(mine.x - 4, mine.y - 2, 8, 4);
      ctx.globalAlpha = 1;
    }
  }

  function drawPulses() {
    for (const pulseItem of game.pulses) {
      const progress = 1 - pulseItem.life / pulseItem.maxLife;
      ctx.globalAlpha = Math.max(0, 1 - progress);
      ctx.strokeStyle = pulseItem.color;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(pulseItem.x, pulseItem.y, pulseItem.radius * progress, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawParticles() {
    for (const particle of game.particles) {
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      if (particle.type === "beam") {
        ctx.strokeStyle = particle.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(particle.x, particle.y);
        ctx.lineTo(particle.x2, particle.y2);
        ctx.stroke();
      } else {
        ellipse(particle.x, particle.y, particle.size * alpha, particle.size * alpha, particle.color);
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawTexts() {
    ctx.save();
    ctx.font = "800 13px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const text of game.texts) {
      ctx.globalAlpha = clamp(text.life / 0.55, 0, 1);
      ctx.fillStyle = text.color;
      ctx.fillText(text.value, text.x, text.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawBossBar() {
    const boss = game.enemies.find((enemy) => enemy.type === "boss" && !enemy.dead);
    if (!boss) return;
    const barWidth = Math.min(620, width - 52);
    const x = (width - barWidth) / 2;
    const y = 78;
    const pct = clamp(boss.hp / boss.maxHp, 0, 1);
    ctx.save();
    ctx.fillStyle = "rgba(10,12,11,0.78)";
    ctx.fillRect(x, y, barWidth, 14);
    ctx.fillStyle = "#ff6b5f";
    ctx.fillRect(x, y, barWidth * pct, 14);
    ctx.strokeStyle = "rgba(255,247,223,0.28)";
    ctx.strokeRect(x, y, barWidth, 14);
    ctx.restore();
  }

  function ellipse(x, y, rx, ry, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.fill();
  }

  function polygon(points) {
    ctx.beginPath();
    points.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  }

  function updateHud() {
    if (!game) return;
    const player = game.player;
    ui.timer.textContent = formatTime(game.time);
    ui.level.textContent = player.level;
    ui.kills.textContent = game.kills;
    ui.wave.textContent = game.wave;
    ui.hpFill.style.transform = `scaleX(${clamp(player.hp / player.maxHp, 0, 1)})`;
    ui.xpFill.style.transform = `scaleX(${clamp(player.xp / player.xpNext, 0, 1)})`;
    const tags = [];
    Object.values(player.weapons).forEach((weapon) => {
      if (weapon.level > 0) tags.push(`<span>${weapon.name} ${weapon.level}</span>`);
    });
    if (player.explosiveKills > 0) tags.push(`<span>Spark Keg ${player.explosiveKills}</span>`);
    if (player.thorns > 0) tags.push(`<span>Thorns ${player.thorns}</span>`);
    ui.build.innerHTML = tags.join("");
  }

  function updatePointerVector(event) {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    const dx = pointer.x - pointer.startX;
    const dy = pointer.y - pointer.startY;
    const len = Math.hypot(dx, dy);
    const cap = 46;
    pointer.vx = len ? clamp(dx / cap, -1, 1) : 0;
    pointer.vy = len ? clamp(dy / cap, -1, 1) : 0;
    const thumbX = clamp(dx, -cap, cap);
    const thumbY = clamp(dy, -cap, cap);
    ui.stick.style.left = `${pointer.startX - 56}px`;
    ui.stick.style.top = `${pointer.startY - 56}px`;
    ui.stick.style.bottom = "auto";
    ui.stick.classList.add("is-active");
    ui.stickThumb.style.transform = `translate(calc(-50% + ${thumbX}px), calc(-50% + ${thumbY}px))`;
  }

  function releasePointer() {
    pointer.active = false;
    pointer.id = null;
    pointer.vx = 0;
    pointer.vy = 0;
    ui.stick.classList.remove("is-active");
    ui.stickThumb.style.transform = "translate(-50%, -50%)";
  }

  function tick(now) {
    const rawDt = (now - lastTime) / 1000 || 0;
    const dt = clamp(rawDt, 0, 0.05);
    lastTime = now;
    if (mode === "playing") update(dt);
    else if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) ui.toast.classList.remove("is-visible");
    }
    draw(now);
    requestAnimationFrame(tick);
  }

  ui.roster.addEventListener("click", (event) => {
    const card = event.target.closest("[data-hero]");
    if (!card) return;
    selectedHero = card.dataset.hero;
    document.querySelectorAll(".hero-card").forEach((item) => item.classList.toggle("is-selected", item === card));
  });

  ui.start.addEventListener("click", startGame);
  ui.pause.addEventListener("click", () => (mode === "playing" ? pauseGame() : resumeGame()));
  ui.resume.addEventListener("click", resumeGame);
  ui.restart.addEventListener("click", startGame);
  ui.again.addEventListener("click", startGame);

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
      event.preventDefault();
    }
    if (key === " " || key === "escape") {
      if (mode === "playing") pauseGame();
      else if (mode === "paused") resumeGame();
    }
    if (mode === "level" && ["1", "2", "3"].includes(key)) chooseUpgrade(Number(key) - 1);
    keys.add(key);
  });

  window.addEventListener("keyup", (event) => {
    keys.delete(event.key.toLowerCase());
  });

  canvas.addEventListener("pointerdown", (event) => {
    if (mode !== "playing") return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointer.active = true;
    pointer.id = event.pointerId;
    pointer.startX = event.clientX;
    pointer.startY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    updatePointerVector(event);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!pointer.active || pointer.id !== event.pointerId) return;
    updatePointerVector(event);
  });

  canvas.addEventListener("pointerup", (event) => {
    if (pointer.id === event.pointerId) releasePointer();
  });

  canvas.addEventListener("pointercancel", releasePointer);
  window.addEventListener("resize", resize);

  resize();
  requestAnimationFrame(tick);
})();
