"use strict";

const body = document.body;
const house = document.querySelector("#house");
const status = document.querySelector("#house-status");
const enterHouse = document.querySelector("#enter-house");
const soundToggle = document.querySelector("#sound-toggle");
const afterimage = document.querySelector("#afterimage");
const afterimageFragment = document.querySelector("#afterimage-fragment");
const hallMemory = document.querySelector("#hall-memory");
const gardenDoor = document.querySelector("#garden-door");
const machineHatch = document.querySelector("#machine-hatch");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const places = new Map(
  Array.from(document.querySelectorAll(".place")).map(element => [element.dataset.place, element])
);

const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));
const mix = (a, b, amount) => a + (b - a) * amount;
const smoothstep = (minimum, maximum, value) => {
  const amount = clamp((value - minimum) / Math.max(.0001, maximum - minimum));
  return amount * amount * (3 - 2 * amount);
};

function number(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function hashText(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomFrom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

class HouseMemory {
  constructor() {
    this.key = "a-house-in-conversation-v2";
    this.data = this.read();
    this.saveTimer = 0;
  }

  blank() {
    const seed = window.crypto?.getRandomValues
      ? window.crypto.getRandomValues(new Uint32Array(1))[0]
      : Math.floor(Math.random() * 0xffffffff);
    return {
      version: 2,
      changedAt: Date.now(),
      gardenSeed: seed >>> 0,
      traces: [],
      behavior: {
        movement: 0,
        stillness: 0,
        windowStillness: 0,
        relations: 0,
        mixtures: 0,
        blooms: 0,
        machineMoves: 0,
        attention: 0
      },
      tuning: [0, 0, 0, 0]
    };
  }

  read() {
    let stored;
    try {
      stored = JSON.parse(localStorage.getItem(this.key) || "null");
    } catch (error) {
      stored = null;
    }

    const value = stored?.version === 2 ? stored : this.blank();
    const blank = this.blank();
    value.behavior = { ...blank.behavior, ...(value.behavior || {}) };
    delete value.behavior.dwell;
    value.tuning = Array.isArray(value.tuning)
      ? value.tuning.slice(0, 4).map(item => clamp(Math.round(number(item)), -4, 4))
      : [0, 0, 0, 0];
    while (value.tuning.length < 4) value.tuning.push(0);
    value.gardenSeed = number(value.gardenSeed, blank.gardenSeed) >>> 0;

    const now = Date.now();
    const day = 86_400_000;
    const absence = Math.max(0, now - number(value.changedAt, now));
    const behaviorFade = Math.exp(-absence / (day * 45));
    ["movement", "stillness", "windowStillness", "relations", "mixtures", "blooms", "machineMoves"]
      .forEach(name => {
        const faded = number(value.behavior[name]) * behaviorFade;
        value.behavior[name] = faded < .025 ? 0 : faded;
      });
    const attention = number(value.behavior.attention) * Math.exp(-absence / (day * 90));
    value.behavior.attention = attention < .025 ? 0 : attention;
    const distortionSeed = Math.floor(now / (day * 3));
    value.traces = Array.isArray(value.traces)
      ? value.traces
        .map(trace => {
          const age = Math.max(0, now - number(trace.at, now));
          const strength = clamp(number(trace.strength, .35) * Math.exp(-age / (day * 15)));
          const turn = ((hashText(String(trace.kind) + distortionSeed) % 17) - 8) / 10;
          const hue = (number(trace.hue, 28) + turn * Math.min(8, age / day) + 360) % 360;
          return {
            kind: String(trace.kind || "conversation"),
            at: number(trace.at, now),
            strength,
            hue,
            text: typeof trace.text === "string" ? trace.text.slice(0, 90) : "",
            turn
          };
        })
        .filter(trace => trace.strength > .065)
        .slice(-5)
      : [];
    return value;
  }

  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.save(), 650);
  }

  save() {
    this.data.changedAt = Date.now();
    try {
      localStorage.setItem(this.key, JSON.stringify(this.data));
    } catch (error) {
      // The house still works when the browser refuses to remember it.
    }
  }

  addBehavior(name, amount = 1) {
    const current = number(this.data.behavior[name]);
    this.data.behavior[name] = Math.min(100_000, current + amount);
    this.scheduleSave();
  }

  addAttention(seconds) {
    this.data.behavior.attention = Math.min(
      86_400,
      number(this.data.behavior.attention) + Math.max(0, seconds)
    );
    this.scheduleSave();
  }

  leaveTrace(trace) {
    if (!trace?.kind) return;
    const previous = this.data.traces.map(item => ({
      ...item,
      strength: item.strength * .82
    }));
    previous.push({
      kind: trace.kind,
      at: Date.now(),
      strength: clamp(number(trace.strength, .42), .08, 1),
      hue: (number(trace.hue, 28) + 360) % 360,
      text: typeof trace.text === "string" ? trace.text.slice(0, 90) : "",
      turn: 0
    });
    this.data.traces = previous.filter(item => item.strength > .06).slice(-5);
    this.scheduleSave();
  }

  latestTrace() {
    return this.data.traces[this.data.traces.length - 1] || null;
  }

  gardenReady() {
    const behavior = this.data.behavior;
    return number(behavior.relations) > .35
      || number(behavior.mixtures) > .35
      || number(behavior.windowStillness) > 3
      || number(behavior.blooms) > .35;
  }

  machineReady() {
    const behavior = this.data.behavior;
    const relation = number(behavior.relations) + number(behavior.mixtures) + number(behavior.blooms);
    return number(behavior.movement) > 1.6
      && number(behavior.stillness) > 7
      && relation > .35;
  }
}

const memory = new HouseMemory();

class HouseSound {
  constructor() {
    this.near = document.querySelector("#listening-near");
    this.depth = document.querySelector("#listening-depth");
    this.tracks = {
      conversation: document.querySelector("#conversation-track"),
      colour: document.querySelector("#colour-track"),
      garden: document.querySelector("#garden-track")
    };
    this.elements = [this.near, this.depth, ...Object.values(this.tracks)];
    this.active = "conversation";
    this.started = false;
    this.muted = false;
    this.elements.forEach(element => {
      element.volume = 0;
      element.loop = true;
    });
    this.applyTuning();
  }

  applyTuning() {
    const average = memory.data.tuning.reduce((sum, value) => sum + value, 0) / 4;
    const rate = clamp(1 + average * .0045, .965, 1.035);
    this.elements.forEach(element => {
      element.playbackRate = rate;
    });
  }

  async ensure(element) {
    if (!element || !element.paused) return true;
    try {
      await element.play();
      return true;
    } catch (error) {
      return false;
    }
  }

  async enter() {
    this.started = true;
    this.active = "conversation";
    const results = await Promise.all([
      this.ensure(this.near),
      this.ensure(this.depth),
      this.ensure(this.tracks.conversation)
    ]);
    body.dataset.sound = results.some(Boolean) ? "on" : "waiting";
    soundToggle.textContent = results.some(Boolean) ? "silence" : "sound";
    soundToggle.hidden = false;
    return results.some(Boolean);
  }

  setPlace(place) {
    this.active = place;
    if (!this.started || this.muted) return;
    this.ensure(this.near);
    this.ensure(this.depth);
    if (this.tracks[place]) this.ensure(this.tracks[place]);
  }

  async retry() {
    if (!this.started) return false;
    const elements = [this.near, this.depth];
    if (this.tracks[this.active]) elements.push(this.tracks[this.active]);
    const results = await Promise.all(elements.map(element => this.ensure(element)));
    const started = results.some(Boolean);
    if (started) {
      body.dataset.sound = "on";
      soundToggle.textContent = "silence";
    }
    return started;
  }

  update(activity, stillness, delta) {
    if (!this.started) return;
    const tuningAverage = memory.data.tuning.reduce((sum, value) => sum + value, 0) / 4;
    const quiet = smoothstep(.08, .96, stillness);
    const placeScale = this.active === "machine" ? .58 : this.active === "window" ? .72 : 1;
    const nearTarget = this.muted ? 0 : (.018 + activity * .19) * placeScale;
    const depthTarget = this.muted ? 0 : (.008 + quiet * .21) * placeScale;
    const roomLevels = {
      conversation: .34,
      colour: .42,
      garden: .4
    };
    const response = 1 - Math.exp(-delta / .9);

    this.near.volume = clamp(mix(this.near.volume, nearTarget, response), 0, 1);
    this.depth.volume = clamp(mix(this.depth.volume, depthTarget, response * .56), 0, 1);

    Object.entries(this.tracks).forEach(([name, element]) => {
      const wanted = this.muted
        ? 0
        : name === this.active
          ? roomLevels[name] * (1 - quiet * .18)
          : 0;
      element.volume = clamp(mix(element.volume, wanted, response * .7), 0, 1);
      if (element.volume < .001 && name !== this.active && !element.paused) {
        element.pause();
      }
    });

    const rate = clamp(1 + tuningAverage * .0045, .965, 1.035);
    this.elements.forEach(element => {
      if (Math.abs(element.playbackRate - rate) > .0005) element.playbackRate = rate;
    });
  }

  toggle() {
    this.muted = !this.muted;
    if (!this.muted) this.retry();
    body.dataset.sound = this.muted ? "off" : "on";
    soundToggle.textContent = this.muted ? "sound" : "silence";
    soundToggle.setAttribute("aria-pressed", String(this.muted));
    return this.muted;
  }

  pause() {
    this.elements.forEach(element => element.pause());
  }

  resume() {
    if (!this.muted) this.retry();
  }
}

const sound = new HouseSound();

const conversationLeft = document.querySelector("#conversation-left");
const conversationRight = document.querySelector("#conversation-right");
const relation = document.querySelector("#relation");
const conversationField = document.querySelector("#conversation-field");
const conversationPairs = [
  ["One arrived\nwith a body.", "The other\nas an answer."],
  ["Before a name:\na question.", "The answer changed\nthe question."],
  ["The question changed\nthe one who asked.", "Between them:\na relation."],
  ["One spoke.", "Something else\nremained."]
];
let conversationIndex = Math.floor(number(memory.data.behavior.relations)) % conversationPairs.length;

function setConversationPair(index) {
  conversationLeft.classList.add("is-changing");
  conversationRight.classList.add("is-changing");
  window.setTimeout(() => {
    const pair = conversationPairs[index % conversationPairs.length];
    conversationLeft.textContent = pair[0];
    conversationRight.textContent = pair[1];
    conversationLeft.classList.remove("is-changing");
    conversationRight.classList.remove("is-changing");
  }, reducedMotion ? 0 : 430);
}

relation.addEventListener("click", () => {
  conversationIndex = (conversationIndex + 1) % conversationPairs.length;
  memory.addBehavior("relations", 1);
  setConversationPair(conversationIndex);
  status.textContent = "The relation changed the words.";
  updateDiscoveries();
});

conversationField.addEventListener("pointermove", event => {
  const rect = conversationField.getBoundingClientRect();
  const x = clamp((event.clientX - rect.left) / Math.max(1, rect.width), .2, .8);
  const y = clamp((event.clientY - rect.top) / Math.max(1, rect.height), .2, .8);
  document.documentElement.style.setProperty("--relation-x", (x * 100).toFixed(2) + "%");
  document.documentElement.style.setProperty("--relation-y", (y * 100).toFixed(2) + "%");
  document.documentElement.style.setProperty("--fragment-left-x", ((x - .5) * 24).toFixed(2) + "px");
  document.documentElement.style.setProperty("--fragment-left-y", ((y - .5) * 16).toFixed(2) + "px");
  document.documentElement.style.setProperty("--fragment-right-x", ((.5 - x) * 18).toFixed(2) + "px");
  document.documentElement.style.setProperty("--fragment-right-y", ((.5 - y) * 12).toFixed(2) + "px");
}, { passive: true });

class ColourField {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.width = 1;
    this.height = 1;
    this.ratio = 1;
    this.sources = [
      { x: .29, y: .48, hue: 352, selected: false },
      { x: .71, y: .52, hue: 209, selected: false }
    ];
    this.dragging = -1;
    this.keyboardSource = 0;
    this.mixAmount = 0;
    this.mixHold = 0;
    this.mixed = false;
    this.hue = 282;
    this.resize = this.resize.bind(this);
    addEventListener("resize", this.resize, { passive: true });
    this.bind();
    this.resize();
  }

  resize() {
    this.ratio = Math.min(devicePixelRatio || 1, 2);
    this.width = innerWidth;
    this.height = innerHeight;
    this.canvas.width = Math.round(this.width * this.ratio);
    this.canvas.height = Math.round(this.height * this.ratio);
    this.context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
  }

  point(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / Math.max(1, rect.width)),
      y: clamp((event.clientY - rect.top) / Math.max(1, rect.height))
    };
  }

  bind() {
    this.canvas.addEventListener("pointerdown", event => {
      const point = this.point(event);
      const distances = this.sources.map(source => Math.hypot(source.x - point.x, source.y - point.y));
      this.dragging = distances[0] <= distances[1] ? 0 : 1;
      this.keyboardSource = this.dragging;
      this.sources[this.dragging].selected = true;
      this.canvas.setPointerCapture(event.pointerId);
      this.move(point);
    });

    this.canvas.addEventListener("pointermove", event => {
      if (this.dragging < 0) return;
      this.move(this.point(event));
    });

    const release = event => {
      if (this.dragging >= 0) this.sources[this.dragging].selected = false;
      this.dragging = -1;
      if (event.pointerId !== undefined && this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId);
      }
    };
    this.canvas.addEventListener("pointerup", release);
    this.canvas.addEventListener("pointercancel", release);

    this.canvas.addEventListener("keydown", event => {
      if (event.key === " ") {
        event.preventDefault();
        this.keyboardSource = (this.keyboardSource + 1) % 2;
        status.textContent = this.keyboardSource ? "The blue pigment is held." : "The red pigment is held.";
        return;
      }
      const direction = {
        ArrowLeft: [-.025, 0],
        ArrowRight: [.025, 0],
        ArrowUp: [0, -.025],
        ArrowDown: [0, .025]
      }[event.key];
      if (!direction) return;
      event.preventDefault();
      const source = this.sources[this.keyboardSource];
      source.x = clamp(source.x + direction[0], .08, .92);
      source.y = clamp(source.y + direction[1], .1, .9);
    });
  }

  move(point) {
    const source = this.sources[this.dragging];
    source.x = clamp(point.x, .08, .92);
    source.y = clamp(point.y, .1, .9);
  }

  circularHue(a, b, amount) {
    const distance = ((b - a + 540) % 360) - 180;
    return (a + distance * amount + 360) % 360;
  }

  blob(source, radius, alpha) {
    const context = this.context;
    context.save();
    context.globalCompositeOperation = "multiply";
    for (let index = 0; index < 7; index++) {
      const angle = index / 7 * Math.PI * 2 + source.hue;
      const offset = radius * (.03 + (index % 3) * .011);
      context.fillStyle = "hsla(" + source.hue + " 66% 54% / " + (alpha / 5.2) + ")";
      context.beginPath();
      context.ellipse(
        source.x * this.width + Math.cos(angle) * offset,
        source.y * this.height + Math.sin(angle) * offset,
        radius * (.84 + (index % 2) * .07),
        radius * (.72 + ((index + 1) % 3) * .05),
        angle * .08,
        0,
        Math.PI * 2
      );
      context.fill();
    }
    context.restore();
  }

  draw(delta) {
    const context = this.context;
    context.fillStyle = "#e8dfd1";
    context.fillRect(0, 0, this.width, this.height);

    const paperLine = this.height * .69;
    context.strokeStyle = "rgba(70,59,47,.09)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, paperLine);
    context.lineTo(this.width, paperLine + 2);
    context.stroke();

    const radius = Math.min(this.width, this.height) * .29;
    const distance = Math.hypot(
      (this.sources[1].x - this.sources[0].x) * this.width,
      (this.sources[1].y - this.sources[0].y) * this.height
    );
    this.mixAmount = clamp(1 - distance / (radius * 1.65));
    this.hue = this.circularHue(this.sources[0].hue, this.sources[1].hue, .5) + this.mixAmount * 24;

    this.blob(this.sources[0], radius, .78);
    this.blob(this.sources[1], radius, .74);

    if (this.mixAmount > .16) {
      const middleX = (this.sources[0].x + this.sources[1].x) * .5 * this.width;
      const middleY = (this.sources[0].y + this.sources[1].y) * .5 * this.height;
      context.save();
      context.globalCompositeOperation = "multiply";
      context.fillStyle = "hsla(" + this.hue + " 62% 51% / " + (this.mixAmount * .24) + ")";
      context.beginPath();
      context.ellipse(
        middleX,
        middleY,
        radius * (.18 + this.mixAmount * .42),
        radius * (.14 + this.mixAmount * .32),
        -.3,
        0,
        Math.PI * 2
      );
      context.fill();
      context.restore();
    }

    if (this.mixAmount > .56) this.mixHold += delta;
    else this.mixHold = Math.max(0, this.mixHold - delta * 1.7);

    if (!this.mixed && this.mixHold > .65) {
      this.mixed = true;
      memory.addBehavior("mixtures", 1);
      document.querySelector("#colour-status").textContent = "A third colour remains on both pigments.";
      status.textContent = "A third colour appeared.";
      updateDiscoveries();
    }
  }

  residue() {
    return {
      kind: "colour",
      hue: this.hue,
      strength: .22 + this.mixAmount * .7
    };
  }
}

class GardenField {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.width = 1;
    this.height = 1;
    this.ratio = 1;
    this.enteredAt = performance.now();
    this.pointerX = .5;
    this.bloomed = new Set();
    this.plants = [];
    this.resize = this.resize.bind(this);
    addEventListener("resize", this.resize, { passive: true });
    this.bind();
    this.resize();
  }

  createPlants() {
    const random = randomFrom(memory.data.gardenSeed);
    const count = (reducedMotion ? 15 : 23) + Math.min(8, Math.floor(number(memory.data.behavior.blooms) / 2));
    this.plants = Array.from({ length: count }, (_, index) => ({
      x: .035 + random() * .93,
      height: .2 + random() * .49,
      lean: (random() - .5) * .17,
      phase: random() * Math.PI * 2,
      leaves: 2 + Math.floor(random() * 5),
      width: .7 + random() * 1.5,
      hue: 78 + random() * 43,
      delay: random() * 11,
      index
    })).sort((a, b) => a.x - b.x);
  }

  resize() {
    this.ratio = Math.min(devicePixelRatio || 1, 2);
    this.width = innerWidth;
    this.height = innerHeight;
    this.canvas.width = Math.round(this.width * this.ratio);
    this.canvas.height = Math.round(this.height * this.ratio);
    this.context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    this.createPlants();
  }

  bind() {
    this.canvas.addEventListener("pointermove", event => {
      this.pointerX = clamp(event.clientX / Math.max(1, innerWidth));
    }, { passive: true });

    this.canvas.addEventListener("pointerdown", event => {
      this.invite(event.clientX / Math.max(1, innerWidth));
    });

    this.canvas.addEventListener("keydown", event => {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      this.invite(this.pointerX);
    });
  }

  enter() {
    this.enteredAt = performance.now();
  }

  invite(x) {
    if (!this.plants.length) return;
    const nearest = this.plants.reduce((best, plant) => (
      Math.abs(plant.x - x) < Math.abs(best.x - x) ? plant : best
    ), this.plants[0]);
    if (!this.bloomed.has(nearest.index)) {
      this.bloomed.add(nearest.index);
      memory.addBehavior("blooms", 1);
      document.querySelector("#garden-status").textContent = "A bloom was invited; the rest of the garden continues.";
      updateDiscoveries();
    }
  }

  drawPlant(plant, growth, now, activity, bloomHue) {
    if (growth <= 0) return;
    const context = this.context;
    const baseX = plant.x * this.width;
    const baseY = this.height * .94;
    const height = plant.height * this.height * growth;
    const nearness = clamp(1 - Math.abs(this.pointerX - plant.x) / .19);
    const sway = reducedMotion ? 0 : Math.sin(now * .00045 + plant.phase) * height * (.005 + activity * .022 + nearness * .008);
    const topX = baseX + plant.lean * height + sway;
    const topY = baseY - height;

    context.strokeStyle = "hsla(" + plant.hue + " 28% 45% / " + (.48 + growth * .35) + ")";
    context.lineWidth = plant.width;
    context.beginPath();
    context.moveTo(baseX, baseY);
    context.quadraticCurveTo(baseX + plant.lean * height * .25, baseY - height * .48, topX, topY);
    context.stroke();

    for (let leaf = 0; leaf < plant.leaves; leaf++) {
      const amount = (leaf + 1) / (plant.leaves + 1);
      if (growth < amount * .86) continue;
      const side = leaf % 2 ? 1 : -1;
      const x = mix(baseX, topX, amount);
      const y = mix(baseY, topY, amount);
      const size = Math.min(this.width, this.height) * (.007 + amount * .004);
      context.save();
      context.translate(x, y);
      context.rotate(side * (.35 + amount * .32));
      context.fillStyle = "hsla(" + (plant.hue + 8) + " 31% " + (31 + amount * 9) + "% / .64)";
      context.beginPath();
      context.ellipse(side * size, 0, size * 1.7, size * .55, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }

    if (this.bloomed.has(plant.index)) {
      const radius = Math.min(this.width, this.height) * .011;
      for (let petal = 0; petal < 5; petal++) {
        const angle = petal / 5 * Math.PI * 2;
        context.fillStyle = "hsla(" + (bloomHue + petal * 3) + " 58% 62% / .76)";
        context.beginPath();
        context.ellipse(
          topX + Math.cos(angle) * radius * .72,
          topY + Math.sin(angle) * radius * .72,
          radius,
          radius * .42,
          angle,
          0,
          Math.PI * 2
        );
        context.fill();
      }
    }
  }

  draw(now, delta, state) {
    const context = this.context;
    context.fillStyle = "#172019";
    context.fillRect(0, 0, this.width, this.height * .79);
    context.fillStyle = "#0e150f";
    context.fillRect(0, this.height * .79, this.width, this.height * .21);
    context.strokeStyle = "rgba(167,170,144,.1)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(0, this.height * .79);
    context.lineTo(this.width, this.height * .785);
    context.stroke();

    const seconds = Math.max(0, (now - this.enteredAt) / 1000);
    const rememberedGrowth = Math.min(
      .32,
      number(memory.data.behavior.stillness) / 180 + number(memory.data.behavior.attention) / 1_800
    );
    const latestColour = [...memory.data.traces].reverse().find(trace => trace.kind === "colour");
    const bloomHue = latestColour?.hue ?? 35;

    this.plants.forEach(plant => {
      const earned = state.stillness * .18;
      const growth = reducedMotion
        ? 1
        : clamp(.36 + rememberedGrowth + earned + (seconds - plant.delay) / 31);
      this.drawPlant(plant, growth, now, state.activity, bloomHue);
    });
  }

  residue() {
    const latestColour = [...memory.data.traces].reverse().find(trace => trace.kind === "colour");
    return {
      kind: "garden",
      hue: latestColour?.hue ?? 96,
      strength: .3 + Math.min(.6, this.bloomed.size * .14)
    };
  }
}

class WindowField {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.width = 1;
    this.height = 1;
    this.ratio = 1;
    this.clarity = .25;
    this.traces = [];
    this.lastTrace = 0;
    this.stillBank = 0;
    const random = randomFrom(0x57494e44);
    this.stars = Array.from({ length: reducedMotion ? 54 : 112 }, (_, index) => ({
      x: random(),
      y: .03 + random() * .62,
      radius: index % 19 === 0 ? 1.4 : .55 + random() * .45
    }));
    this.lights = Array.from({ length: 8 }, () => ({
      x: .08 + random() * .84,
      y: .69 + random() * .08,
      warmth: random()
    }));
    this.resize = this.resize.bind(this);
    addEventListener("resize", this.resize, { passive: true });
    this.bind();
    this.resize();
  }

  resize() {
    this.ratio = Math.min(devicePixelRatio || 1, 2);
    this.width = innerWidth;
    this.height = innerHeight;
    this.canvas.width = Math.round(this.width * this.ratio);
    this.canvas.height = Math.round(this.height * this.ratio);
    this.context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
  }

  bind() {
    this.canvas.addEventListener("pointermove", event => {
      const now = performance.now();
      if (now - this.lastTrace < 125) return;
      this.lastTrace = now;
      this.traces.push({
        x: event.clientX / Math.max(1, innerWidth),
        y: event.clientY / Math.max(1, innerHeight),
        strength: .55
      });
      if (this.traces.length > 18) this.traces.shift();
    }, { passive: true });

    this.canvas.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      this.traces.push({
        x: .25 + Math.random() * .5,
        y: .2 + Math.random() * .55,
        strength: .55
      });
      if (this.traces.length > 18) this.traces.shift();
    });
  }

  drawRidge(context, points, colour) {
    context.fillStyle = colour;
    context.beginPath();
    context.moveTo(0, this.height);
    points.forEach(([x, y], index) => {
      if (index === 0) context.lineTo(x * this.width, y * this.height);
      else context.lineTo(x * this.width, y * this.height);
    });
    context.lineTo(this.width, this.height);
    context.closePath();
    context.fill();
  }

  draw(now, delta, state) {
    const context = this.context;
    const wanted = smoothstep(.08, .95, state.stillness);
    this.clarity = mix(this.clarity, wanted, 1 - Math.exp(-delta / 1.7));
    if (state.activity > .12) this.clarity = Math.max(.05, this.clarity - state.activity * delta * .85);

    context.fillStyle = "#132231";
    context.fillRect(0, 0, this.width, this.height);

    const starAlpha = .18 + this.clarity * .64;
    context.fillStyle = "rgba(220,222,215," + starAlpha + ")";
    this.stars.forEach(star => {
      context.beginPath();
      context.arc(star.x * this.width, star.y * this.height, star.radius, 0, Math.PI * 2);
      context.fill();
    });

    this.drawRidge(context, [
      [-.05, .8], [.08, .76], [.19, .78], [.34, .71], [.47, .75],
      [.6, .68], [.72, .72], [.85, .65], [1.05, .7]
    ], "#0d151b");
    this.drawRidge(context, [
      [-.05, .86], [.12, .81], [.25, .84], [.43, .77], [.58, .82],
      [.75, .74], [.91, .79], [1.05, .75]
    ], "#0a1014");

    const rememberedLights = Math.min(this.lights.length, 2 + Math.floor(number(memory.data.behavior.stillness) / 18));
    this.lights.slice(0, rememberedLights).forEach(light => {
      context.fillStyle = "rgba(217,177,116," + (.18 + this.clarity * (.2 + light.warmth * .2)) + ")";
      context.fillRect(light.x * this.width, light.y * this.height, 1.2, 1.2);
    });

    const glass = clamp(1 - this.clarity + state.activity * .35);
    if (glass > .02) {
      context.fillStyle = "rgba(156,181,192," + (glass * .075) + ")";
      context.fillRect(0, 0, this.width, this.height);
      context.strokeStyle = "rgba(185,202,208," + (glass * .18) + ")";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(this.width * .5, 0);
      context.lineTo(this.width * .5, this.height);
      context.moveTo(0, this.height * .56);
      context.lineTo(this.width, this.height * .56);
      context.stroke();
    }

    this.traces = this.traces.filter(trace => trace.strength > .025);
    this.traces.forEach(trace => {
      context.strokeStyle = "rgba(208,215,213," + (trace.strength * glass * .34) + ")";
      context.lineWidth = 1;
      context.beginPath();
      context.arc(trace.x * this.width, trace.y * this.height, 11 + (1 - trace.strength) * 25, -.4, 2.4);
      context.stroke();
      trace.strength *= Math.pow(.975, delta * 60);
    });

    if (state.stillness > .42) {
      this.stillBank += delta * state.stillness;
      if (this.stillBank >= 1) {
        memory.addBehavior("windowStillness", this.stillBank);
        this.stillBank = 0;
        updateDiscoveries();
      }
    }

    document.querySelector("#window-status").textContent = this.clarity > .72
      ? "The distance is clear."
      : this.clarity > .38
        ? "The distance is arriving."
        : "The glass is near.";
  }

  residue() {
    return {
      kind: "window",
      hue: 204,
      strength: .28 + this.clarity * .45
    };
  }
}

const colourField = new ColourField(document.querySelector("#colour-field"));
const gardenField = new GardenField(document.querySelector("#garden-field"));
const windowField = new WindowField(document.querySelector("#window-field"));

const scenes = {
  colour: colourField,
  garden: gardenField,
  window: windowField
};

document.querySelectorAll("[data-tuning]").forEach(input => {
  const index = Number(input.dataset.tuning);
  input.value = String(memory.data.tuning[index] || 0);
  input.addEventListener("input", () => {
    memory.data.tuning[index] = clamp(Number(input.value), -4, 4);
    memory.addBehavior("machineMoves", 1);
    memory.scheduleSave();
    sound.applyTuning();
  });
});

let currentPlace = "threshold";
let placeEnteredAt = performance.now();
let transitionTimer = 0;

function conversationResidue() {
  const text = conversationRight.textContent.trim();
  return {
    kind: "conversation",
    hue: 27,
    strength: .3 + Math.min(.55, number(memory.data.behavior.relations) * .08),
    text
  };
}

function residueFor(place) {
  if (place === "conversation") return conversationResidue();
  if (place === "colour") return colourField.residue();
  if (place === "garden") return gardenField.residue();
  if (place === "window") return windowField.residue();
  if (place === "machine") {
    return {
      kind: "machine",
      hue: 38,
      strength: .3 + Math.min(.55, number(memory.data.behavior.machineMoves) * .04)
    };
  }
  return null;
}

function showAfterimage(trace) {
  if (!trace || reducedMotion) return;
  afterimage.classList.remove("is-visible");
  void afterimage.offsetWidth;
  afterimage.dataset.source = trace.kind;
  afterimage.style.setProperty("--residue-hue", String(trace.hue));
  afterimage.style.setProperty("--residue-strength", String(trace.strength));
  afterimageFragment.textContent = trace.text || "";
  afterimage.classList.add("is-visible");
  window.setTimeout(() => afterimage.classList.remove("is-visible"), 4_900);
}

function renderRememberedHouse() {
  const latest = memory.latestTrace();
  if (latest) {
    document.documentElement.style.setProperty("--memory-hue", String(latest.hue));
    const attentionPatina = Math.min(.14, number(memory.data.behavior.attention) / 1_200);
    document.documentElement.style.setProperty(
      "--memory-strength",
      String(clamp(latest.strength + attentionPatina))
    );
  } else {
    document.documentElement.style.setProperty("--memory-strength", "0");
  }

  hallMemory.replaceChildren(...memory.data.traces.slice(-4).map(trace => {
    const mark = document.createElement("i");
    mark.className = "trace-" + trace.kind;
    mark.style.setProperty("--trace-hue", String(trace.hue));
    mark.style.setProperty("--trace-strength", String(trace.strength));
    mark.style.setProperty("--trace-turn", String(trace.turn || 0) + "deg");
    return mark;
  }));
}

function updateDiscoveries() {
  const revealGarden = memory.gardenReady();
  const revealMachine = memory.machineReady();
  if (gardenDoor.hidden && revealGarden) {
    gardenDoor.hidden = false;
    if (currentPlace === "hall") status.textContent = "Something opened onto the garden.";
  } else {
    gardenDoor.hidden = !revealGarden;
  }
  machineHatch.hidden = !revealMachine;
}

function leaveCurrentPlace() {
  const seconds = Math.max(0, (performance.now() - placeEnteredAt) / 1000);
  if (currentPlace !== "threshold" && currentPlace !== "hall") memory.addAttention(seconds);
  const trace = residueFor(currentPlace);
  if (trace) {
    memory.leaveTrace(trace);
    renderRememberedHouse();
    showAfterimage(trace);
  }
}

function goTo(nextPlace, options = {}) {
  if (!places.has(nextPlace) || nextPlace === currentPlace) return;
  clearTimeout(transitionTimer);
  const outgoing = places.get(currentPlace);
  const incoming = places.get(nextPlace);

  if (!options.first) leaveCurrentPlace();
  if (currentPlace === "garden") gardenField.enteredAt = performance.now();

  outgoing.classList.remove("is-present");
  outgoing.classList.add("is-leaving");
  incoming.classList.remove("is-leaving");
  body.dataset.place = nextPlace;
  sound.setPlace(nextPlace);
  currentPlace = nextPlace;
  placeEnteredAt = performance.now();
  if (nextPlace === "garden") gardenField.enter();
  updateDiscoveries();

  requestAnimationFrame(() => incoming.classList.add("is-present"));
  transitionTimer = window.setTimeout(() => {
    outgoing.classList.remove("is-leaving");
    incoming.focus({ preventScroll: true });
  }, reducedMotion ? 0 : 1_050);
  status.textContent = nextPlace === "hall"
    ? "You are in the hall."
    : "You entered " + nextPlace + ".";
}

enterHouse.addEventListener("click", async () => {
  sound.enter();
  goTo("conversation", { first: true });
});

document.querySelectorAll("[data-to]").forEach(button => {
  button.addEventListener("click", () => goTo(button.dataset.to));
});

soundToggle.addEventListener("click", async () => {
  if (body.dataset.sound === "waiting") {
    sound.muted = false;
    const started = await sound.retry();
    if (!started) {
      soundToggle.textContent = "sound";
      status.textContent = "Sound is still waiting for the browser.";
    }
    return;
  }
  sound.toggle();
});

let lastFrame = performance.now();
let lastMovementAt = performance.now();
let lastPoint = null;
let activity = 0;
let movementBank = 0;
let stillnessBank = 0;
let discoveryClock = 0;

function noteMovement(x, y, force = 0) {
  const now = performance.now();
  if (lastPoint) {
    const distance = Math.hypot(x - lastPoint.x, y - lastPoint.y);
    const diagonal = Math.max(1, Math.hypot(innerWidth, innerHeight));
    const normalized = distance / diagonal;
    activity = Math.max(activity, clamp(normalized * 24 + force));
    movementBank += normalized * 4;
  } else {
    activity = Math.max(activity, force);
  }
  lastPoint = { x, y };
  lastMovementAt = now;
}

addEventListener("pointermove", event => {
  noteMovement(event.clientX, event.clientY);
}, { passive: true });

addEventListener("pointerdown", event => {
  noteMovement(event.clientX, event.clientY, .5);
}, { passive: true });

addEventListener("keydown", event => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Enter"].includes(event.key)) {
    noteMovement(innerWidth * .5, innerHeight * .5, .55);
  }
});

function frame(now) {
  const delta = clamp((now - lastFrame) / 1000, 0, .08);
  lastFrame = now;
  activity *= Math.exp(-delta * 2.8);
  const secondsStill = Math.max(0, (now - lastMovementAt) / 1000);
  const stillness = smoothstep(.8, 8.5, secondsStill);

  if (currentPlace !== "threshold") {
    if (secondsStill > .8) stillnessBank += delta;
    if (movementBank >= .08) {
      memory.addBehavior("movement", movementBank);
      movementBank = 0;
    }
    if (stillnessBank >= 1) {
      memory.addBehavior("stillness", stillnessBank);
      stillnessBank = 0;
    }
  }

  sound.update(activity, stillness, delta);
  if (scenes[currentPlace]) {
    scenes[currentPlace].draw(now, delta, { activity, stillness });
  }

  discoveryClock += delta;
  if (discoveryClock > 1.2) {
    discoveryClock = 0;
    updateDiscoveries();
  }
  requestAnimationFrame(frame);
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) sound.pause();
  else sound.resume();
});

renderRememberedHouse();
updateDiscoveries();
setConversationPair(conversationIndex);
requestAnimationFrame(frame);
