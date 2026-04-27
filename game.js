/* global THREE */
(() => {
  "use strict";

  const TAU = Math.PI * 2;
  const WORLD_SIZE = 5200;
  const BOSS_TIME = 115;

  const canvas = document.getElementById("game");

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
    home: document.getElementById("homeButton"),
    pause: document.getElementById("pauseButton"),
    resume: document.getElementById("resumeButton"),
    restart: document.getElementById("restartButton"),
    pauseHome: document.getElementById("pauseHomeButton"),
    resultHome: document.getElementById("resultHomeButton"),
    again: document.getElementById("againButton"),
    timer: document.getElementById("timer"),
    level: document.getElementById("level"),
    kills: document.getElementById("kills"),
    wave: document.getElementById("wave"),
    hpFill: document.getElementById("hpFill"),
    xpFill: document.getElementById("xpFill"),
    bossBar: document.getElementById("bossBar"),
    bossFill: document.getElementById("bossFill"),
    build: document.getElementById("build"),
    toast: document.getElementById("toast"),
    stick: document.getElementById("touchStick"),
    stickThumb: document.querySelector("#touchStick span"),
  };

  if (typeof THREE === "undefined") {
    ui.toast.textContent = "The 3D runtime did not load.";
    ui.toast.classList.add("is-visible");
    return;
  }

  const HEROES = {
    runner: {
      id: "runner",
      name: "Vector Runner",
      color: 0x39d7c3,
      trim: 0xffd166,
      maxHp: 96,
      speed: 346,
      magnet: 138,
      damageMult: 1,
      armor: 0,
      setup(player) {
        player.weapons.pulse.level = 1;
        player.weapons.pulse.count = 1;
        player.weapons.pulse.rate = 0.56;
        player.weapons.pulse.damage = 18;
      },
    },
    warden: {
      id: "warden",
      name: "Iron Warden",
      color: 0x82e66f,
      trim: 0xff6b5f,
      maxHp: 126,
      speed: 248,
      magnet: 96,
      damageMult: 0.96,
      armor: 0.17,
      setup(player) {
        player.weapons.pulse.level = 1;
        player.weapons.pulse.rate = 0.72;
        player.weapons.orbit.level = 1;
        player.weapons.orbit.count = 2;
      },
    },
    spark: {
      id: "spark",
      name: "Volt Ace",
      color: 0xffd166,
      trim: 0x39d7c3,
      maxHp: 76,
      speed: 292,
      magnet: 104,
      damageMult: 1.18,
      armor: 0,
      setup(player) {
        player.weapons.pulse.level = 1;
        player.weapons.pulse.count = 2;
        player.weapons.pulse.damage = 15;
        player.chainChance = 0.25;
      },
    },
  };

  const RARITIES = [
    { id: "common", label: "Common", color: "#d9e7e1", scale: 1, weight: 54 },
    { id: "rare", label: "Rare", color: "#39d7c3", scale: 1.45, weight: 28 },
    { id: "epic", label: "Epic", color: "#b887ff", scale: 2.05, weight: 13 },
    { id: "max", label: "Max", color: "#ffd166", scale: 3.1, weight: 5 },
  ];

  const keys = new Set();
  const pointer = {
    active: false,
    id: null,
    startX: 0,
    startY: 0,
    vx: 0,
    vy: 0,
  };

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07100f);
  scene.fog = new THREE.FogExp2(0x07100f, 0.00034);

  const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 7200);
  const cameraTarget = new THREE.Vector3();
  const root = new THREE.Group();
  const propGroup = new THREE.Group();
  const dynamicGroup = new THREE.Group();
  const fxGroup = new THREE.Group();
  scene.add(root);
  root.add(propGroup, dynamicGroup, fxGroup);

  const hemi = new THREE.HemisphereLight(0xc8fff5, 0x17251b, 1.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.15);
  sun.position.set(-420, 820, 260);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -1250;
  sun.shadow.camera.right = 1250;
  sun.shadow.camera.top = 1250;
  sun.shadow.camera.bottom = -1250;
  scene.add(sun);

  const materials = createMaterials();
  const geometries = createGeometries();

  let width = 1;
  let height = 1;
  let selectedHero = "runner";
  let mode = "menu";
  let game = null;
  let lastTime = 0;
  let toastTimer = 0;
  let projectileId = 0;
  let enemyId = 0;
  let homeSeed = 911;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (from, to, amount) => from + (to - from) * amount;
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

  function createMaterials() {
    const standard = (color, options = {}) =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: options.roughness ?? 0.58,
        metalness: options.metalness ?? 0.06,
        emissive: options.emissive ?? 0x000000,
        emissiveIntensity: options.emissiveIntensity ?? 0,
      });
    return {
      ground: standard(0x163428, { roughness: 0.92 }),
      cliff: standard(0x3e5948, { roughness: 0.85 }),
      grid: new THREE.LineBasicMaterial({ color: 0x6fffe1, transparent: true, opacity: 0.15 }),
      runner: standard(0x39d7c3, { emissive: 0x0d756e, emissiveIntensity: 0.25 }),
      warden: standard(0x82e66f, { emissive: 0x245d23, emissiveIntensity: 0.16 }),
      spark: standard(0xffd166, { emissive: 0x7b4700, emissiveIntensity: 0.2 }),
      skin: standard(0xfff8df, { roughness: 0.64 }),
      dark: standard(0x07100f, { roughness: 0.5 }),
      amber: standard(0xffd166, { emissive: 0x8f5a00, emissiveIntensity: 0.45 }),
      teal: standard(0x39d7c3, { emissive: 0x0c615e, emissiveIntensity: 0.55 }),
      coral: standard(0xff6b5f, { emissive: 0x7e100a, emissiveIntensity: 0.5 }),
      violet: standard(0xb887ff, { emissive: 0x3a116d, emissiveIntensity: 0.45 }),
      green: standard(0x82e66f, { emissive: 0x1d6b25, emissiveIntensity: 0.28 }),
      enemyBlob: standard(0x7dd35c),
      enemyCharger: standard(0xff6b5f),
      enemySpitter: standard(0xb887ff),
      enemyBrute: standard(0xa8b098),
      enemyBoss: standard(0xff875f, { emissive: 0x68130d, emissiveIntensity: 0.38 }),
      rock: standard(0x5b6a60, { roughness: 0.88 }),
      crystalBlue: standard(0x77a7ff, { metalness: 0.18, emissive: 0x183f8c, emissiveIntensity: 0.45 }),
      crystalPink: standard(0xff6b9a, { metalness: 0.16, emissive: 0x7e1838, emissiveIntensity: 0.38 }),
      chest: standard(0x8b5b35),
      mine: standard(0xf3c15e, { emissive: 0x8a5200, emissiveIntensity: 0.24 }),
      heart: standard(0xff6b5f, { emissive: 0x75120d, emissiveIntensity: 0.38 }),
      ring: new THREE.MeshBasicMaterial({
        color: 0x39d7c3,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      beam: new THREE.MeshBasicMaterial({ color: 0x39d7c3, transparent: true, opacity: 0.78 }),
    };
  }

  function createGeometries() {
    return {
      floor: new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 48, 48),
      wallLong: new THREE.BoxGeometry(WORLD_SIZE, 56, 56),
      wallShort: new THREE.BoxGeometry(56, 56, WORLD_SIZE),
      body: new THREE.CylinderGeometry(15, 19, 36, 18),
      head: new THREE.SphereGeometry(13, 20, 16),
      arm: new THREE.CylinderGeometry(3.5, 4, 32, 10),
      sphere: new THREE.SphereGeometry(1, 18, 14),
      blob: new THREE.SphereGeometry(18, 20, 14),
      charger: new THREE.ConeGeometry(18, 42, 4),
      brute: new THREE.DodecahedronGeometry(26, 1),
      boss: new THREE.BoxGeometry(98, 122, 98, 2, 2, 2),
      projectile: new THREE.SphereGeometry(7, 14, 10),
      gem: new THREE.OctahedronGeometry(10, 0),
      hammer: new THREE.BoxGeometry(24, 18, 16),
      mine: new THREE.CylinderGeometry(14, 16, 10, 18),
      ring: new THREE.RingGeometry(0.82, 1, 72),
      rock: new THREE.DodecahedronGeometry(1, 0),
      crystal: new THREE.ConeGeometry(1, 2.4, 5),
      chest: new THREE.BoxGeometry(36, 24, 28),
      line: new THREE.CylinderGeometry(2, 2, 1, 8),
    };
  }

  function baseWeapons() {
    return {
      pulse: {
        name: "Vector Pulse",
        level: 0,
        cooldown: 0.1,
        rate: 0.66,
        damage: 17,
        speed: 740,
        count: 1,
        pierce: 0,
        range: 980,
      },
      orbit: {
        name: "Orbit Hammer",
        level: 0,
        count: 0,
        radius: 82,
        damage: 11,
        speed: 2.9,
        hitDelay: 0.3,
        angle: 0,
        meshes: [],
      },
      wave: {
        name: "Shock Ring",
        level: 0,
        cooldown: 0.2,
        rate: 4.2,
        damage: 42,
        radius: 152,
      },
      mine: {
        name: "Rift Mine",
        level: 0,
        cooldown: 0.9,
        rate: 3.1,
        damage: 58,
        radius: 104,
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
      chainChance: 0.06,
      explosiveKills: 0,
      thorns: 0,
      level: 1,
      xp: 0,
      xpNext: 20,
      weapons: baseWeapons(),
      mesh: null,
      trailTimer: 0,
    };
    hero.setup(player);
    return player;
  }

  function createGame(heroId) {
    const seed = (Date.now() ^ Math.floor(Math.random() * 1000000)) >>> 0;
    const player = createPlayer(HEROES[heroId]);
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
      time: 0,
      kills: 0,
      wave: 1,
      spawnBudget: 0,
      nextElite: 8,
      bossSpawned: false,
      pendingLevelUps: 0,
      upgradeChoices: [],
      upgradeCounts: {},
      screenShake: 0,
      cameraX: player.x,
      cameraY: player.y,
    };
  }

  const UPGRADE_TEMPLATES = [
    {
      id: "pulseUnlock",
      title: "Vector Pulse",
      desc: () => "Adds a fast 3D energy shot that seeks nearby threats.",
      max: 1,
      needs: (g) => g.player.weapons.pulse.level === 0,
      apply: (g) => {
        g.player.weapons.pulse.level = 1;
        g.player.weapons.pulse.count = 1;
      },
    },
    {
      id: "pulseDamage",
      title: "Overcharged Pulse",
      desc: (s) => `Vector Pulse damage +${Math.round(24 * s)}%.`,
      max: 8,
      needs: (g) => g.player.weapons.pulse.level > 0,
      apply: (g, s) => {
        const w = g.player.weapons.pulse;
        w.damage *= 1 + 0.24 * s;
        w.level += 1;
      },
    },
    {
      id: "pulseCount",
      title: "Split Vector",
      desc: (s) => `Vector Pulse fires +${s >= 2 ? 2 : 1} shot${s >= 2 ? "s" : ""}.`,
      max: 5,
      needs: (g) => g.player.weapons.pulse.level > 0,
      apply: (g, s) => {
        const w = g.player.weapons.pulse;
        w.count += s >= 2 ? 2 : 1;
        w.rate *= 0.94;
        w.level += 1;
      },
    },
    {
      id: "pulseRate",
      title: "Rapid Index",
      desc: (s) => `Vector Pulse cooldown -${Math.round(10 * s)}%.`,
      max: 7,
      needs: (g) => g.player.weapons.pulse.level > 0,
      apply: (g, s) => {
        const w = g.player.weapons.pulse;
        w.rate = Math.max(0.15, w.rate * (1 - 0.1 * s));
        w.level += 1;
      },
    },
    {
      id: "pulsePierce",
      title: "Phase Needle",
      desc: (s) => `Vector Pulse pierces +${s >= 2.8 ? 2 : 1}.`,
      max: 4,
      needs: (g) => g.player.weapons.pulse.level > 0,
      apply: (g, s) => {
        const w = g.player.weapons.pulse;
        w.pierce += s >= 2.8 ? 2 : 1;
        w.damage *= 1 + 0.08 * s;
        w.level += 1;
      },
    },
    {
      id: "orbitUnlock",
      title: "Orbit Hammer",
      desc: () => "Adds 3D hammers that orbit and slam crowds.",
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
      title: "Hammer Array",
      desc: (s) => `Orbit Hammer gains +${s >= 2 ? 2 : 1} hammer${s >= 2 ? "s" : ""}.`,
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
      title: "Heavy Rotation",
      desc: (s) => `Orbit Hammer damage +${Math.round(28 * s)}%.`,
      max: 7,
      needs: (g) => g.player.weapons.orbit.level > 0,
      apply: (g, s) => {
        const w = g.player.weapons.orbit;
        w.damage *= 1 + 0.28 * s;
        w.radius += 6 * s;
        w.level += 1;
      },
    },
    {
      id: "orbitSpeed",
      title: "Gyro Core",
      desc: (s) => `Orbit Hammer spin speed +${Math.round(20 * s)}%.`,
      max: 5,
      needs: (g) => g.player.weapons.orbit.level > 0,
      apply: (g, s) => {
        const w = g.player.weapons.orbit;
        w.speed *= 1 + 0.2 * s;
        w.hitDelay = Math.max(0.14, w.hitDelay * (1 - 0.07 * s));
        w.level += 1;
      },
    },
    {
      id: "waveUnlock",
      title: "Shock Ring",
      desc: () => "Adds a periodic ground burst that clears breathing room.",
      max: 1,
      needs: (g) => g.player.weapons.wave.level === 0,
      apply: (g) => {
        g.player.weapons.wave.level = 1;
      },
    },
    {
      id: "wavePower",
      title: "Wider Shock",
      desc: (s) => `Shock Ring damage +${Math.round(32 * s)}% and radius +${Math.round(10 * s)}%.`,
      max: 6,
      needs: (g) => g.player.weapons.wave.level > 0,
      apply: (g, s) => {
        const w = g.player.weapons.wave;
        w.damage *= 1 + 0.32 * s;
        w.radius *= 1 + 0.1 * s;
        w.level += 1;
      },
    },
    {
      id: "waveRate",
      title: "Pulse Clock",
      desc: (s) => `Shock Ring cooldown -${Math.round(13 * s)}%.`,
      max: 5,
      needs: (g) => g.player.weapons.wave.level > 0,
      apply: (g, s) => {
        const w = g.player.weapons.wave;
        w.rate = Math.max(1.05, w.rate * (1 - 0.13 * s));
        w.level += 1;
      },
    },
    {
      id: "mineUnlock",
      title: "Rift Mine",
      desc: () => "Drops proximity mines that blast clustered enemies.",
      max: 1,
      needs: (g) => g.player.weapons.mine.level === 0,
      apply: (g) => {
        g.player.weapons.mine.level = 1;
      },
    },
    {
      id: "minePower",
      title: "Deep Charge",
      desc: (s) => `Rift Mine blast +${Math.round(24 * s)}% and radius +${Math.round(9 * s)}%.`,
      max: 6,
      needs: (g) => g.player.weapons.mine.level > 0,
      apply: (g, s) => {
        const w = g.player.weapons.mine;
        w.damage *= 1 + 0.24 * s;
        w.radius *= 1 + 0.09 * s;
        w.level += 1;
      },
    },
    {
      id: "speed",
      title: "Sprint Matrix",
      desc: (s) => `Move speed +${Math.round(10 * s)}%.`,
      max: 7,
      apply: (g, s) => {
        g.player.speed *= 1 + 0.1 * s;
      },
    },
    {
      id: "hp",
      title: "Titan Cells",
      desc: (s) => `Max health +${Math.round(17 * s)} and heal now.`,
      max: 7,
      apply: (g, s) => {
        const amount = 17 * s;
        g.player.maxHp += amount;
        g.player.hp = Math.min(g.player.maxHp, g.player.hp + amount * 1.25);
      },
    },
    {
      id: "armor",
      title: "Impact Mesh",
      desc: (s) => `Incoming damage -${Math.round(5 * s)}%.`,
      max: 5,
      apply: (g, s) => {
        g.player.armor = Math.min(0.58, g.player.armor + 0.05 * s);
      },
    },
    {
      id: "magnet",
      title: "Gravity Pocket",
      desc: (s) => `Pickup pull +${Math.round(34 * s)}%.`,
      max: 6,
      apply: (g, s) => {
        g.player.magnet += 34 * s;
      },
    },
    {
      id: "damage",
      title: "Damage Index",
      desc: (s) => `All damage +${Math.round(12 * s)}%.`,
      max: 8,
      apply: (g, s) => {
        g.player.damageMult *= 1 + 0.12 * s;
      },
    },
    {
      id: "crit",
      title: "Critical Math",
      desc: (s) => `Critical chance +${Math.round(5 * s)}%.`,
      max: 5,
      apply: (g, s) => {
        g.player.crit = Math.min(0.52, g.player.crit + 0.05 * s);
      },
    },
    {
      id: "xpGain",
      title: "Level Manual",
      desc: (s) => `XP gained +${Math.round(14 * s)}%.`,
      max: 5,
      apply: (g, s) => {
        g.player.xpGain *= 1 + 0.14 * s;
      },
    },
    {
      id: "regen",
      title: "Repair Loop",
      desc: (s) => `Regenerate ${Math.round(0.48 * s * 10) / 10} health each second.`,
      max: 5,
      apply: (g, s) => {
        g.player.regen += 0.48 * s;
      },
    },
    {
      id: "chain",
      title: "Chain Spark",
      desc: (s) => `Hits can jump to another target +${Math.round(8 * s)}%.`,
      max: 5,
      apply: (g, s) => {
        g.player.chainChance = Math.min(0.68, g.player.chainChance + 0.08 * s);
      },
    },
    {
      id: "luck",
      title: "Rarity Bias",
      desc: (s) => `Better upgrade rarity and chest odds +${Math.round(10 * s)}%.`,
      max: 5,
      apply: (g, s) => {
        g.player.luck += 0.1 * s;
      },
    },
  ];

  const CHEST_ITEMS = [
    {
      title: "Detonator Core",
      apply(g) {
        g.player.explosiveKills += 1;
      },
    },
    {
      title: "Heart Cache",
      apply(g) {
        g.player.maxHp += 28;
        g.player.hp = Math.min(g.player.maxHp, g.player.hp + 52);
      },
    },
    {
      title: "Glass Reactor",
      apply(g) {
        g.player.damageMult *= 1.24;
        g.player.maxHp = Math.max(38, g.player.maxHp - 8);
      },
    },
    {
      title: "Thorn Plate",
      apply(g) {
        g.player.thorns += 1;
      },
    },
    {
      title: "Pull Engine",
      apply(g) {
        g.player.magnet += 74;
      },
    },
    {
      title: "Repair Gel",
      apply(g) {
        g.player.regen += 0.9;
        g.player.speed *= 1.04;
      },
    },
  ];

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function makeGroundTexture(seed) {
    const rng = mulberry32(seed + 404);
    const texCanvas = document.createElement("canvas");
    texCanvas.width = 512;
    texCanvas.height = 512;
    const c = texCanvas.getContext("2d");
    c.fillStyle = "#163428";
    c.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 650; i += 1) {
      const x = rng() * 512;
      const y = rng() * 512;
      const shade = rng() > 0.5 ? "rgba(111, 255, 225, 0.055)" : "rgba(255, 209, 102, 0.04)";
      c.fillStyle = shade;
      c.fillRect(x, y, 2 + rng() * 14, 1 + rng() * 8);
    }
    c.strokeStyle = "rgba(255, 248, 223, 0.055)";
    c.lineWidth = 1;
    for (let i = 0; i <= 512; i += 64) {
      c.beginPath();
      c.moveTo(i, 0);
      c.lineTo(i, 512);
      c.stroke();
      c.beginPath();
      c.moveTo(0, i);
      c.lineTo(512, i);
      c.stroke();
    }
    const texture = new THREE.CanvasTexture(texCanvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(24, 24);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  function clearGroup(group) {
    while (group.children.length) group.remove(group.children[0]);
  }

  function buildWorld(seed) {
    clearGroup(propGroup);
    materials.ground.map = makeGroundTexture(seed);
    materials.ground.needsUpdate = true;

    const floor = new THREE.Mesh(geometries.floor, materials.ground);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(WORLD_SIZE / 2, 0, WORLD_SIZE / 2);
    floor.receiveShadow = true;
    propGroup.add(floor);

    const grid = new THREE.GridHelper(WORLD_SIZE, 58, 0x39d7c3, 0xffffff);
    grid.material.transparent = true;
    grid.material.opacity = 0.12;
    grid.position.set(WORLD_SIZE / 2, 1.2, WORLD_SIZE / 2);
    propGroup.add(grid);

    const north = new THREE.Mesh(geometries.wallLong, materials.cliff);
    north.position.set(WORLD_SIZE / 2, 28, 16);
    north.castShadow = true;
    north.receiveShadow = true;
    propGroup.add(north);
    const south = north.clone();
    south.position.z = WORLD_SIZE - 16;
    propGroup.add(south);
    const west = new THREE.Mesh(geometries.wallShort, materials.cliff);
    west.position.set(16, 28, WORLD_SIZE / 2);
    west.castShadow = true;
    west.receiveShadow = true;
    propGroup.add(west);
    const east = west.clone();
    east.position.x = WORLD_SIZE - 16;
    propGroup.add(east);

    const rng = mulberry32(seed + 77);
    for (let i = 0; i < 190; i += 1) {
      const x = 130 + rng() * (WORLD_SIZE - 260);
      const z = 130 + rng() * (WORLD_SIZE - 260);
      if (Math.abs(x - WORLD_SIZE / 2) < 760 && Math.abs(z - WORLD_SIZE / 2) < 760) continue;
      const roll = rng();
      let mesh;
      if (roll < 0.45) {
        mesh = new THREE.Mesh(geometries.rock, materials.rock);
        const s = 10 + rng() * 20;
        mesh.scale.set(s * (0.9 + rng() * 0.5), s * (0.55 + rng() * 0.4), s * (0.9 + rng() * 0.5));
        mesh.position.set(x, mesh.scale.y * 0.8, z);
      } else if (roll < 0.74) {
        mesh = new THREE.Mesh(geometries.crystal, rng() > 0.5 ? materials.crystalBlue : materials.crystalPink);
        const s = 10 + rng() * 20;
        mesh.scale.set(s * 0.6, s, s * 0.6);
        mesh.position.set(x, s, z);
      } else {
        mesh = new THREE.Mesh(geometries.brute, materials.cliff);
        const s = 9 + rng() * 18;
        mesh.scale.set(s * 0.9, s * 1.25, s * 0.9);
        mesh.position.set(x, s, z);
      }
      mesh.rotation.y = rng() * TAU;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      propGroup.add(mesh);
    }
  }

  function materialForHero(heroId) {
    if (heroId === "warden") return materials.warden;
    if (heroId === "spark") return materials.spark;
    return materials.runner;
  }

  function createPlayerMesh(player) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(geometries.body, materialForHero(player.heroId));
    body.position.y = 28;
    body.castShadow = true;
    group.add(body);
    const head = new THREE.Mesh(geometries.head, materials.skin);
    head.position.y = 58;
    head.castShadow = true;
    group.add(head);
    const trim = new THREE.Mesh(new THREE.TorusGeometry(17, 3, 8, 28), materials.amber);
    trim.position.y = 33;
    trim.rotation.x = Math.PI / 2;
    group.add(trim);
    const leftArm = new THREE.Mesh(geometries.arm, materials.amber);
    leftArm.position.set(-21, 35, 0);
    leftArm.rotation.z = -0.68;
    leftArm.castShadow = true;
    group.add(leftArm);
    const rightArm = leftArm.clone();
    rightArm.position.x = 21;
    rightArm.rotation.z = 0.68;
    group.add(rightArm);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 2), materials.dark);
    eye.position.set(-5, 60, -11);
    group.add(eye);
    const eye2 = eye.clone();
    eye2.position.x = 5;
    group.add(eye2);
    dynamicGroup.add(group);
    player.mesh = group;
  }

  function createEnemyMesh(enemy) {
    const group = new THREE.Group();
    let mesh;
    if (enemy.type === "charger") {
      mesh = new THREE.Mesh(geometries.charger, materials.enemyCharger);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y = 21;
    } else if (enemy.type === "spitter") {
      mesh = new THREE.Mesh(geometries.blob, materials.enemySpitter);
      mesh.scale.set(1.1, 0.95, 1.1);
      mesh.position.y = 22;
    } else if (enemy.type === "brute") {
      mesh = new THREE.Mesh(geometries.brute, materials.enemyBrute);
      mesh.position.y = 28;
    } else if (enemy.type === "boss") {
      mesh = new THREE.Mesh(geometries.boss, materials.enemyBoss);
      mesh.position.y = 74;
    } else {
      mesh = new THREE.Mesh(geometries.blob, materials.enemyBlob);
      mesh.scale.set(0.9, 0.76, 0.9);
      mesh.position.y = 18;
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    if (enemy.elite) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(enemy.r + 8, 2.5, 8, 40), materials.amber);
      ring.position.y = enemy.type === "boss" ? 144 : 38;
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
    }
    group.scale.setScalar(enemy.type === "boss" ? 1 : enemy.r / 18);
    dynamicGroup.add(group);
    enemy.mesh = group;
  }

  function spawnPoint(near = false) {
    const player = game.player;
    const angle = game.rng() * TAU;
    const distance = near ? 280 + game.rng() * 320 : Math.max(width, height) * 0.74 + 240 + game.rng() * 330;
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
      if (t > 65 && roll < 0.18) type = "brute";
      else if (t > 34 && roll < 0.35) type = "spitter";
      else if (t > 15 && roll < 0.56) type = "charger";
      else type = "blob";
    }
    const pos = spawnPoint(near);
    const scale = 1 + game.wave * 0.17 + t * 0.002;
    const enemy = {
      id: enemyId += 1,
      type,
      x: pos.x,
      y: pos.y,
      vx: 0,
      vy: 0,
      r: 16,
      hp: 25 * scale,
      maxHp: 25 * scale,
      speed: 88,
      damage: 10,
      xp: 4,
      flash: 0,
      age: 0,
      attack: 0.7 + game.rng(),
      charge: 0,
      chargeAngle: 0,
      elite: false,
      dead: false,
      hitTimes: {},
      mesh: null,
    };
    if (type === "charger") {
      Object.assign(enemy, {
        r: 15,
        hp: 24 * scale,
        maxHp: 24 * scale,
        speed: 138 + game.wave * 3,
        damage: 14,
        xp: 5,
      });
    } else if (type === "spitter") {
      Object.assign(enemy, {
        r: 19,
        hp: 36 * scale,
        maxHp: 36 * scale,
        speed: 70,
        damage: 13,
        xp: 7,
        attack: 0.6 + game.rng() * 1.4,
      });
    } else if (type === "brute") {
      Object.assign(enemy, {
        r: 27,
        hp: 118 * scale,
        maxHp: 118 * scale,
        speed: 54,
        damage: 22,
        xp: 15,
      });
    } else if (type === "elite") {
      const base = game.rng() < 0.45 ? "brute" : game.rng() < 0.5 ? "spitter" : "charger";
      enemy.type = base;
      enemy.elite = true;
      enemy.r = base === "brute" ? 36 : 25;
      enemy.hp = 250 * scale;
      enemy.maxHp = enemy.hp;
      enemy.speed = base === "charger" ? 120 : 58;
      enemy.damage = 26;
      enemy.xp = 38;
    } else if (type === "boss") {
      Object.assign(enemy, {
        type: "boss",
        r: 68,
        hp: 2400 + game.wave * 330,
        maxHp: 2400 + game.wave * 330,
        speed: 43,
        damage: 34,
        xp: 240,
        attack: 1.8,
        elite: true,
      });
    }
    createEnemyMesh(enemy);
    game.enemies.push(enemy);
  }

  function startGame() {
    clearGroup(dynamicGroup);
    clearGroup(fxGroup);
    game = createGame(selectedHero);
    buildWorld(game.seed);
    createPlayerMesh(game.player);
    mode = "playing";
    lastTime = performance.now();
    hide(ui.menu);
    hide(ui.pauseScreen);
    hide(ui.resultScreen);
    hide(ui.levelScreen);
    show(ui.hud);
    show(ui.build);
    hide(ui.bossBar);
    showToast(`${HEROES[selectedHero].name} entered LevelMax`);
    for (let i = 0; i < 10; i += 1) spawnEnemy("blob", true);
    updateHud();
  }

  function returnHome() {
    mode = "menu";
    game = null;
    homeSeed += 1;
    clearGroup(dynamicGroup);
    clearGroup(fxGroup);
    buildWorld(homeSeed);
    hide(ui.hud);
    hide(ui.build);
    hide(ui.bossBar);
    hide(ui.pauseScreen);
    hide(ui.resultScreen);
    hide(ui.levelScreen);
    show(ui.menu);
    ui.toast.classList.remove("is-visible");
    ui.toast.textContent = "";
    toastTimer = 0;
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
    mode = "result";
    hide(ui.levelScreen);
    hide(ui.pauseScreen);
    ui.resultEyebrow.textContent = victory ? "Core Destroyed" : "Run Complete";
    ui.resultTitle.textContent = victory ? "Level Maxed" : "Overrun";
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
    toastTimer = 2.3;
  }

  function rollRarity() {
    const luck = game.player.luck;
    const weights = RARITIES.map((rarity, index) => {
      if (index === 0) return Math.max(22, rarity.weight - luck * 44);
      return rarity.weight + luck * (index * 9 + 5);
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
    while (choices.length < 3 && guard < 90) {
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
      window.setTimeout(() => openLevelUp(), 110);
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
      player.xpNext = Math.floor(20 + player.level * 11 + Math.pow(player.level, 1.46) * 4.2);
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
    game.wave = 1 + Math.floor(game.time / 20);
    updatePlayer(dt);
    updateWeapons(dt);
    updateSpawns(dt);
    updateEnemies(dt);
    updateProjectiles(dt);
    updateEnemyShots(dt);
    updateGems(dt);
    updatePickups(dt);
    updateMines(dt);
    updateEffects(dt);
    game.enemies = game.enemies.filter((enemy) => !enemy.dead);
    game.projectiles = game.projectiles.filter((projectile) => !projectile.dead);
    game.enemyShots = game.enemyShots.filter((shot) => !shot.dead);
    game.gems = game.gems.filter((gem) => !gem.dead);
    game.pickups = game.pickups.filter((pickup) => !pickup.dead);
    game.mines = game.mines.filter((mine) => !mine.dead);
    game.pulses = game.pulses.filter((pulseItem) => pulseItem.life > 0);
    game.particles = game.particles.filter((particle) => particle.life > 0);
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
    player.x = clamp(player.x + player.vx * dt, 86, WORLD_SIZE - 86);
    player.y = clamp(player.y + player.vy * dt, 86, WORLD_SIZE - 86);
    if (player.regen > 0) player.hp = Math.min(player.maxHp, player.hp + player.regen * dt);
    if (player.mesh) {
      player.mesh.position.set(player.x, 0, player.y);
      player.mesh.position.y = Math.sin(game.time * 10) * Math.min(4, Math.hypot(player.vx, player.vy) / 80);
      if (Math.hypot(player.vx, player.vy) > 18) player.mesh.rotation.y = Math.atan2(player.vx, player.vy);
    }
    player.trailTimer -= dt;
    if (Math.hypot(player.vx, player.vy) > 140 && player.trailTimer <= 0) {
      player.trailTimer = 0.04;
      addParticle(player.x - player.vx * 0.035, player.y - player.vy * 0.035, player.trim, 0.38, 7, 18);
    }
  }

  function updateWeapons(dt) {
    const player = game.player;
    const pulseWeapon = player.weapons.pulse;
    if (pulseWeapon.level > 0) {
      pulseWeapon.cooldown -= dt;
      if (pulseWeapon.cooldown <= 0) {
        firePulses();
        pulseWeapon.cooldown += pulseWeapon.rate;
      }
    }

    const orbit = player.weapons.orbit;
    if (orbit.level > 0 && orbit.count > 0) {
      syncOrbiters();
      orbit.angle += orbit.speed * dt;
      for (let i = 0; i < orbit.meshes.length; i += 1) {
        const angle = orbit.angle + (i / orbit.count) * TAU;
        const hx = player.x + Math.cos(angle) * orbit.radius;
        const hy = player.y + Math.sin(angle) * orbit.radius;
        const mesh = orbit.meshes[i];
        mesh.position.set(hx, 34 + Math.sin(angle * 2) * 8, hy);
        mesh.rotation.set(0.4, -angle, 0.35);
      }
      for (const enemy of game.enemies) {
        if (enemy.dead) continue;
        for (let i = 0; i < orbit.count; i += 1) {
          const angle = orbit.angle + (i / orbit.count) * TAU;
          const hx = player.x + Math.cos(angle) * orbit.radius;
          const hy = player.y + Math.sin(angle) * orbit.radius;
          const key = `o${i}`;
          const lastHit = enemy.hitTimes[key] || -99;
          if (game.time - lastHit > orbit.hitDelay && distSq(hx, hy, enemy.x, enemy.y) < (enemy.r + 16) ** 2) {
            enemy.hitTimes[key] = game.time;
            damageEnemy(enemy, orbit.damage, hx, hy, 0xffd166, 0.55);
          }
        }
      }
    }

    const wave = player.weapons.wave;
    if (wave.level > 0) {
      wave.cooldown -= dt;
      if (wave.cooldown <= 0) {
        pulse(player.x, player.y, wave.radius, wave.damage, 0x39d7c3);
        wave.cooldown += wave.rate;
      }
    }

    const mine = player.weapons.mine;
    if (mine.level > 0) {
      mine.cooldown -= dt;
      if (mine.cooldown <= 0) {
        const angle = game.rng() * TAU;
        const distance = 34 + game.rng() * 64;
        const item = {
          x: clamp(player.x + Math.cos(angle) * distance, 70, WORLD_SIZE - 70),
          y: clamp(player.y + Math.sin(angle) * distance, 70, WORLD_SIZE - 70),
          r: 15,
          radius: mine.radius,
          damage: mine.damage,
          armed: 0.25,
          life: 15,
          mesh: createMineMesh(),
          dead: false,
        };
        item.mesh.position.set(item.x, 5, item.y);
        game.mines.push(item);
        mine.cooldown += mine.rate;
      }
    }
  }

  function syncOrbiters() {
    const orbit = game.player.weapons.orbit;
    while (orbit.meshes.length < orbit.count) {
      const mesh = new THREE.Mesh(geometries.hammer, materials.amber);
      mesh.castShadow = true;
      dynamicGroup.add(mesh);
      orbit.meshes.push(mesh);
    }
    while (orbit.meshes.length > orbit.count) {
      const mesh = orbit.meshes.pop();
      dynamicGroup.remove(mesh);
    }
  }

  function firePulses() {
    const player = game.player;
    const weapon = player.weapons.pulse;
    const targets = nearestEnemies(player.x, player.y, weapon.count, weapon.range);
    if (!targets.length) return;
    for (let i = 0; i < weapon.count; i += 1) {
      const target = targets[i % targets.length];
      const baseAngle = Math.atan2(target.y - player.y, target.x - player.x);
      const spread = (i - (weapon.count - 1) / 2) * 0.13;
      const angle = baseAngle + spread;
      const crit = game.rng() < player.crit;
      const projectile = {
        id: projectileId += 1,
        x: player.x + Math.cos(angle) * 20,
        y: player.y + Math.sin(angle) * 20,
        vx: Math.cos(angle) * weapon.speed,
        vy: Math.sin(angle) * weapon.speed,
        r: crit ? 8 : 6,
        damage: weapon.damage * (crit ? 1.8 : 1),
        life: 1.28,
        pierceLeft: weapon.pierce,
        color: crit ? 0xffd166 : player.color,
        hit: new Set(),
        mesh: createProjectileMesh(crit ? materials.amber : materialForHero(player.heroId), crit ? 8 : 6),
        dead: false,
      };
      projectile.mesh.position.set(projectile.x, 34, projectile.y);
      game.projectiles.push(projectile);
    }
  }

  function updateSpawns(dt) {
    const spawnRate = 1.28 + Math.min(9.4, game.time * 0.04) + game.wave * 0.17;
    game.spawnBudget += dt * spawnRate;
    const cap = Math.min(285, 74 + game.wave * 24);
    while (game.spawnBudget >= 1 && game.enemies.length < cap) {
      spawnEnemy();
      game.spawnBudget -= 1;
    }
    game.nextElite -= dt;
    if (game.nextElite <= 0) {
      spawnEnemy("elite");
      game.nextElite = Math.max(5.5, 14 - game.wave * 0.42) + game.rng() * 5.5;
    }
    if (!game.bossSpawned && game.time >= BOSS_TIME) {
      game.bossSpawned = true;
      spawnEnemy("boss");
      showToast("The LevelMax core has deployed");
    }
  }

  function updateEnemies(dt) {
    const player = game.player;
    for (const enemy of game.enemies) {
      if (enemy.dead) continue;
      enemy.age += dt;
      enemy.flash = Math.max(0, enemy.flash - dt);
      if (enemy.type === "boss") updateBoss(enemy, dt);
      else if (enemy.type === "spitter") updateSpitter(enemy, dt);
      else if (enemy.type === "charger") updateCharger(enemy, dt);
      else chasePlayer(enemy, dt, enemy.speed);

      enemy.x = clamp(enemy.x, 48, WORLD_SIZE - 48);
      enemy.y = clamp(enemy.y, 48, WORLD_SIZE - 48);
      if (enemy.mesh) {
        enemy.mesh.position.set(enemy.x, 0, enemy.y);
        enemy.mesh.lookAt(player.x, 0, player.y);
        enemy.mesh.position.y = Math.sin(game.time * 6 + enemy.id) * (enemy.type === "boss" ? 2 : 3);
      }

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
        hurtPlayer(enemy.damage * dt * 0.72);
        if (player.thorns > 0 && game.rng() < dt * 4.5) {
          damageEnemy(enemy, 9 * player.thorns, player.x, player.y, 0x82e66f, 0.25);
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
    const desired = distance < 330 ? -enemy.speed * 0.9 : enemy.speed * 0.82;
    enemy.vx = lerp(enemy.vx, (dx / distance) * desired + (-dy / distance) * 30, 0.06);
    enemy.vy = lerp(enemy.vy, (dy / distance) * desired + (dx / distance) * 30, 0.06);
    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;
    enemy.attack -= dt;
    if (enemy.attack <= 0 && distance < 820) {
      shootEnemyBullet(enemy.x, enemy.y, Math.atan2(dy, dx), 275 + game.wave * 8, 16, materials.violet);
      enemy.attack = Math.max(0.72, 1.9 - game.wave * 0.045) + game.rng() * 0.65;
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
      enemy.vx = Math.cos(enemy.chargeAngle) * (enemy.speed * 3.2);
      enemy.vy = Math.sin(enemy.chargeAngle) * (enemy.speed * 3.2);
    } else if (enemy.attack <= 0 && distance < 680) {
      enemy.charge = 0.42;
      enemy.chargeAngle = Math.atan2(dy, dx);
      enemy.attack = 1.8 + game.rng() * 1.0;
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
      const count = 14 + Math.min(20, game.wave);
      const offset = game.time * 0.8;
      for (let i = 0; i < count; i += 1) {
        shootEnemyBullet(enemy.x, enemy.y, offset + (i / count) * TAU, 205 + game.wave * 6, 18, materials.coral);
      }
      enemy.attack = Math.max(1.45, 3.15 - game.wave * 0.06);
      game.screenShake = Math.max(game.screenShake, 10);
      pulse(enemy.x, enemy.y, 210, 12, 0xff6b5f, true);
    }
  }

  function shootEnemyBullet(x, y, angle, speed, damage, material) {
    const shot = {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 8,
      damage,
      life: 4.2,
      mesh: createProjectileMesh(material, 8),
      dead: false,
    };
    shot.mesh.position.set(x, 30, y);
    game.enemyShots.push(shot);
  }

  function updateProjectiles(dt) {
    for (const projectile of game.projectiles) {
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      projectile.life -= dt;
      projectile.mesh.position.set(projectile.x, 34, projectile.y);
      projectile.mesh.rotation.y += dt * 9;
      if (projectile.life <= 0) projectile.dead = true;
      for (const enemy of game.enemies) {
        if (enemy.dead || projectile.dead || projectile.hit.has(enemy.id)) continue;
        if (distSq(projectile.x, projectile.y, enemy.x, enemy.y) <= (projectile.r + enemy.r) ** 2) {
          projectile.hit.add(enemy.id);
          damageEnemy(enemy, projectile.damage, projectile.x, projectile.y, projectile.color, 0.85);
          if (game.rng() < game.player.chainChance) zapChain(enemy, projectile.damage * 0.58);
          if (projectile.pierceLeft <= 0) projectile.dead = true;
          else projectile.pierceLeft -= 1;
        }
      }
      if (projectile.dead) dynamicGroup.remove(projectile.mesh);
    }
  }

  function updateEnemyShots(dt) {
    const player = game.player;
    for (const shot of game.enemyShots) {
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.life -= dt;
      shot.mesh.position.set(shot.x, 30, shot.y);
      shot.mesh.rotation.x += dt * 7;
      if (shot.life <= 0) shot.dead = true;
      if (!shot.dead && distSq(shot.x, shot.y, player.x, player.y) < (shot.r + player.r) ** 2) {
        shot.dead = true;
        hurtPlayer(shot.damage);
        for (let i = 0; i < 10; i += 1) addParticle(shot.x, shot.y, 0xb887ff, 0.35, 5, 40);
      }
      if (shot.dead) dynamicGroup.remove(shot.mesh);
    }
  }

  function updateGems(dt) {
    const player = game.player;
    for (const gem of game.gems) {
      const dx = player.x - gem.x;
      const dy = player.y - gem.y;
      const distance = Math.hypot(dx, dy) || 1;
      if (distance < player.magnet + gem.r) {
        const pull = 175 + (1 - distance / (player.magnet + gem.r)) * 780;
        gem.vx = lerp(gem.vx, (dx / distance) * pull, 0.11);
        gem.vy = lerp(gem.vy, (dy / distance) * pull, 0.11);
      } else {
        gem.vx *= 0.98;
        gem.vy *= 0.98;
      }
      gem.x += gem.vx * dt;
      gem.y += gem.vy * dt;
      gem.mesh.position.set(gem.x, 18 + Math.sin(game.time * 5 + gem.id) * 3, gem.y);
      gem.mesh.rotation.y += dt * 2.8;
      gem.mesh.rotation.x += dt * 1.4;
      if (distance < player.r + gem.r + 8) {
        gem.dead = true;
        addXp(gem.value);
        addParticle(gem.x, gem.y, 0x39d7c3, 0.28, 7, 55);
        dynamicGroup.remove(gem.mesh);
      }
    }
  }

  function updatePickups(dt) {
    const player = game.player;
    for (const pickup of game.pickups) {
      pickup.age += dt;
      pickup.mesh.position.y = 18 + Math.sin(game.time * 3 + pickup.age) * 4;
      pickup.mesh.rotation.y += dt * 1.2;
      if (distSq(pickup.x, pickup.y, player.x, player.y) < (pickup.r + player.r + 10) ** 2) {
        pickup.dead = true;
        dynamicGroup.remove(pickup.mesh);
        if (pickup.type === "chest") openChest();
        if (pickup.type === "heart") {
          player.hp = Math.min(player.maxHp, player.hp + pickup.value);
          showToast("Health recovered");
        }
      }
    }
  }

  function updateMines(dt) {
    for (const mine of game.mines) {
      mine.armed -= dt;
      mine.life -= dt;
      mine.mesh.rotation.y += dt * 1.5;
      mine.mesh.scale.setScalar(mine.armed > 0 ? 0.8 : 1 + Math.sin(game.time * 8) * 0.04);
      if (mine.life <= 0) mine.dead = true;
      if (!mine.dead && mine.armed <= 0) {
        const target = game.enemies.find((enemy) => !enemy.dead && distSq(enemy.x, enemy.y, mine.x, mine.y) < (enemy.r + mine.r + 8) ** 2);
        if (target) {
          mine.dead = true;
          pulse(mine.x, mine.y, mine.radius, mine.damage, 0xffd166);
          game.screenShake = Math.max(game.screenShake, 6);
        }
      }
      if (mine.dead) dynamicGroup.remove(mine.mesh);
    }
  }

  function updateEffects(dt) {
    for (const pulseItem of game.pulses) {
      pulseItem.life -= dt;
      const progress = 1 - pulseItem.life / pulseItem.maxLife;
      pulseItem.mesh.scale.setScalar(Math.max(0.1, pulseItem.radius * progress));
      pulseItem.mesh.material.opacity = Math.max(0, 0.62 * (1 - progress));
      if (pulseItem.life <= 0) fxGroup.remove(pulseItem.mesh);
    }
    for (const particle of game.particles) {
      particle.life -= dt;
      if (particle.type === "beam") {
        particle.mesh.material.opacity = Math.max(0, 0.78 * (particle.life / particle.maxLife));
        if (particle.life <= 0) fxGroup.remove(particle.mesh);
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.z += particle.vz * dt;
      particle.vy -= 96 * dt;
      particle.mesh.position.set(particle.x, Math.max(2, particle.y), particle.z);
      particle.mesh.scale.setScalar(Math.max(0.02, particle.size * (particle.life / particle.maxLife)));
      if (particle.life <= 0) fxGroup.remove(particle.mesh);
    }
    game.screenShake = Math.max(0, game.screenShake - dt * 22);
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) ui.toast.classList.remove("is-visible");
    }
  }

  function hurtPlayer(amount) {
    const player = game.player;
    const reduced = amount * Math.max(0.22, 1 - player.armor);
    player.hp -= reduced;
    game.screenShake = Math.max(game.screenShake, Math.min(10, reduced * 0.32));
  }

  function damageEnemy(enemy, amount, sourceX, sourceY, color, knockback) {
    if (enemy.dead) return;
    const finalDamage = amount * game.player.damageMult;
    enemy.hp -= finalDamage;
    enemy.flash = 0.08;
    const dx = enemy.x - sourceX;
    const dy = enemy.y - sourceY;
    const distance = Math.hypot(dx, dy) || 1;
    enemy.x += (dx / distance) * (knockback || 0) * 14;
    enemy.y += (dy / distance) * (knockback || 0) * 14;
    if (enemy.mesh) enemy.mesh.scale.setScalar((enemy.type === "boss" ? 1 : enemy.r / 18) * 1.04);
    addParticle(enemy.x, enemy.y, color, 0.24, 4, 35);
    if (enemy.hp <= 0) killEnemy(enemy);
  }

  function killEnemy(enemy) {
    if (enemy.dead) return;
    enemy.dead = true;
    game.kills += 1;
    if (enemy.mesh) dynamicGroup.remove(enemy.mesh);
    const gemCount = enemy.type === "boss" ? 22 : enemy.elite ? 8 : enemy.type === "brute" ? 4 : 1;
    for (let i = 0; i < gemCount; i += 1) {
      const angle = game.rng() * TAU;
      const distance = game.rng() * enemy.r * 1.25;
      spawnGem(enemy.x + Math.cos(angle) * distance, enemy.y + Math.sin(angle) * distance, enemy.xp / gemCount);
    }
    if (enemy.elite && enemy.type !== "boss") {
      spawnPickup("chest", enemy.x, enemy.y);
    } else if (game.rng() < 0.014 + game.player.luck * 0.014) {
      spawnPickup("heart", enemy.x, enemy.y, 22);
    }
    if (game.player.explosiveKills > 0) {
      pulse(enemy.x, enemy.y, 70 + game.player.explosiveKills * 20, 20 + game.player.explosiveKills * 11, 0xff6b5f, true);
    }
    for (let i = 0; i < 14; i += 1) addParticle(enemy.x, enemy.y, enemy.elite ? 0xffd166 : 0xfff8df, 0.48, 6, 80);
    if (enemy.type === "boss") endRun(true);
  }

  function spawnGem(x, y, value) {
    const angle = game.rng() * TAU;
    const speed = 55 + game.rng() * 95;
    const gem = {
      id: projectileId += 1,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 8 + Math.min(5, value * 0.18),
      value,
      mesh: new THREE.Mesh(geometries.gem, value > 7 ? materials.amber : materials.teal),
      dead: false,
    };
    gem.mesh.position.set(x, 18, y);
    gem.mesh.scale.setScalar(gem.r / 10);
    gem.mesh.castShadow = true;
    dynamicGroup.add(gem.mesh);
    game.gems.push(gem);
  }

  function spawnPickup(type, x, y, value = 0) {
    const mesh = type === "chest" ? createChestMesh() : createHeartMesh();
    mesh.position.set(x, 18, y);
    dynamicGroup.add(mesh);
    game.pickups.push({ type, x, y, r: type === "chest" ? 22 : 15, age: 0, value, mesh, dead: false });
  }

  function openChest() {
    const item = CHEST_ITEMS[Math.floor(game.rng() * CHEST_ITEMS.length)];
    item.apply(game);
    showToast(`Chest: ${item.title}`);
    for (let i = 0; i < 30; i += 1) addParticle(game.player.x, game.player.y, 0xffd166, 0.62, 7, 120);
  }

  function pulse(x, y, radius, damage, color, quiet) {
    const material = materials.ring.clone();
    material.color.setHex(color);
    const ring = new THREE.Mesh(geometries.ring, material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 4, y);
    fxGroup.add(ring);
    const pulseItem = { x, y, radius, mesh: ring, life: 0.42, maxLife: 0.42 };
    game.pulses.push(pulseItem);
    for (const enemy of game.enemies) {
      if (!enemy.dead && distSq(x, y, enemy.x, enemy.y) < (radius + enemy.r) ** 2) {
        damageEnemy(enemy, damage, x, y, color, 1.15);
      }
    }
    if (!quiet) game.screenShake = Math.max(game.screenShake, 4);
  }

  function zapChain(source, amount) {
    const target = nearestEnemies(source.x, source.y, 1, 220, source.id)[0];
    if (!target) return;
    damageEnemy(target, amount, source.x, source.y, 0x39d7c3, 0.3);
    const beam = makeBeam(source.x, 44, source.y, target.x, 44, target.y, 0x39d7c3);
    fxGroup.add(beam);
    game.particles.push({
      type: "beam",
      mesh: beam,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      size: 1,
      life: 0.14,
      maxLife: 0.14,
    });
  }

  function nearestEnemies(x, y, count, range, excludeId) {
    const rangeSq = range * range;
    return game.enemies
      .filter((enemy) => !enemy.dead && enemy.id !== excludeId && distSq(x, y, enemy.x, enemy.y) <= rangeSq)
      .sort((a, b) => distSq(x, y, a.x, a.y) - distSq(x, y, b.x, b.y))
      .slice(0, count);
  }

  function createProjectileMesh(material, scale) {
    const mesh = new THREE.Mesh(geometries.projectile, material);
    mesh.scale.setScalar(scale / 7);
    mesh.castShadow = true;
    dynamicGroup.add(mesh);
    return mesh;
  }

  function createMineMesh() {
    const mesh = new THREE.Mesh(geometries.mine, materials.mine);
    mesh.castShadow = true;
    dynamicGroup.add(mesh);
    return mesh;
  }

  function createChestMesh() {
    const group = new THREE.Group();
    const box = new THREE.Mesh(geometries.chest, materials.chest);
    box.castShadow = true;
    group.add(box);
    const band = new THREE.Mesh(new THREE.BoxGeometry(40, 6, 31), materials.amber);
    band.position.y = 5;
    group.add(band);
    return group;
  }

  function createHeartMesh() {
    const group = new THREE.Group();
    const left = new THREE.Mesh(geometries.sphere, materials.heart);
    left.scale.set(9, 9, 9);
    left.position.set(-6, 3, 0);
    group.add(left);
    const right = left.clone();
    right.position.x = 6;
    group.add(right);
    const point = new THREE.Mesh(new THREE.ConeGeometry(13, 22, 4), materials.heart);
    point.rotation.z = Math.PI;
    point.position.y = -8;
    group.add(point);
    return group;
  }

  function addParticle(x, z, color, life, size, burst) {
    const angle = game ? game.rng() * TAU : Math.random() * TAU;
    const speed = (burst || 55) * (0.35 + (game ? game.rng() : Math.random()));
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.88 });
    const mesh = new THREE.Mesh(geometries.sphere, mat);
    mesh.scale.setScalar(size);
    mesh.position.set(x, 32, z);
    fxGroup.add(mesh);
    game.particles.push({
      x,
      y: 32,
      z,
      vx: Math.cos(angle) * speed,
      vy: 45 + (game ? game.rng() : Math.random()) * 90,
      vz: Math.sin(angle) * speed,
      size,
      life,
      maxLife: life,
      mesh,
    });
  }

  function makeBeam(x1, y1, z1, x2, y2, z2, color) {
    const start = new THREE.Vector3(x1, y1, z1);
    const end = new THREE.Vector3(x2, y2, z2);
    const mid = start.clone().lerp(end, 0.5);
    const direction = end.clone().sub(start);
    const length = direction.length();
    const material = materials.beam.clone();
    material.color.setHex(color);
    const mesh = new THREE.Mesh(geometries.line, material);
    mesh.position.copy(mid);
    mesh.scale.set(1, length, 1);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return mesh;
  }

  function updateCamera(dt) {
    const player = game.player;
    game.cameraX = lerp(game.cameraX, player.x, 1 - Math.pow(0.0006, dt));
    game.cameraY = lerp(game.cameraY, player.y, 1 - Math.pow(0.0006, dt));
    const shake = game.screenShake;
    const sx = shake ? (game.rng() - 0.5) * shake : 0;
    const sz = shake ? (game.rng() - 0.5) * shake : 0;
    camera.position.set(game.cameraX + sx, 780 + Math.min(70, game.wave * 6), game.cameraY + 520 + sz);
    cameraTarget.set(game.cameraX, 24, game.cameraY - 42);
    camera.lookAt(cameraTarget);
    sun.position.set(game.cameraX - 420, 840, game.cameraY + 260);
    sun.target.position.set(game.cameraX, 0, game.cameraY);
  }

  function updateHomeCamera(now) {
    const t = now * 0.00018;
    const center = WORLD_SIZE / 2;
    camera.position.set(center + Math.cos(t) * 820, 690, center + Math.sin(t) * 820);
    camera.lookAt(center, 10, center);
  }

  function render(now) {
    if (!game) updateHomeCamera(now);
    renderer.render(scene, camera);
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
    if (player.explosiveKills > 0) tags.push(`<span>Detonator ${player.explosiveKills}</span>`);
    if (player.thorns > 0) tags.push(`<span>Thorns ${player.thorns}</span>`);
    ui.build.innerHTML = tags.join("");
  }

  function drawBossBar() {
    const boss = game?.enemies.find((enemy) => enemy.type === "boss" && !enemy.dead);
    if (!boss) {
      hide(ui.bossBar);
      return;
    }
    show(ui.bossBar);
    const pct = clamp(boss.hp / boss.maxHp, 0, 1);
    ui.bossFill.style.transform = `scaleX(${pct})`;
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
    drawBossBar();
    render(now);
    requestAnimationFrame(tick);
  }

  function updatePointerVector(event) {
    const dx = event.clientX - pointer.startX;
    const dy = event.clientY - pointer.startY;
    const cap = 46;
    pointer.vx = clamp(dx / cap, -1, 1);
    pointer.vy = clamp(dy / cap, -1, 1);
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

  ui.roster.addEventListener("click", (event) => {
    const card = event.target.closest("[data-hero]");
    if (!card) return;
    selectedHero = card.dataset.hero;
    document.querySelectorAll(".hero-card").forEach((item) => item.classList.toggle("is-selected", item === card));
  });

  ui.start.addEventListener("click", startGame);
  ui.home.addEventListener("click", returnHome);
  ui.pause.addEventListener("click", () => (mode === "playing" ? pauseGame() : resumeGame()));
  ui.resume.addEventListener("click", resumeGame);
  ui.restart.addEventListener("click", startGame);
  ui.pauseHome.addEventListener("click", returnHome);
  ui.resultHome.addEventListener("click", returnHome);
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
  hide(ui.hud);
  hide(ui.build);
  hide(ui.bossBar);
  buildWorld(homeSeed);
  requestAnimationFrame((now) => {
    lastTime = now;
    tick(now);
  });
})();
