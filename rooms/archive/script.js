"use strict";

const room = document.querySelector("#room");
const canvas = document.querySelector("#field");
const context = canvas.getContext("2d");
const enter = document.querySelector("#enter");
const soundControl = document.querySelector("#sound");
const fragmentLog = document.querySelector("#fragment-log");

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// The archive holds nothing of its own. Every fragment is a sentence one of
// the other rooms says to whoever is standing in it.
const SOURCES = {
  conversation: [
    "the answer changed the question",
    "the question changed the one who asked",
    "you entered by watching"
  ],
  colour: [
    "bring two colours together",
    "a third field neither contained alone",
    "stillness restores what mixing took"
  ],
  garden: [
    "stay",
    "growth without a target state",
    "returning changes the density"
  ],
  listening: [
    "movement brings the room near",
    "stillness lets distance arrive",
    "doing less reveals more"
  ],
  afterimage: [
    "listen without solving",
    "manche Räume verändern nicht sich",
    "ninety-two seconds and nothing asked"
  ],
  window: [
    "this room is silent",
    "movement finds the glass",
    "stillness lets it disappear"
  ],
  machine: [
    "four notes are assembled here",
    "as the house wrote it",
    "the threshold will remember"
  ]
};

const STORE = "house-archive";
const SPENT = .12;
// A fragment is dimmer the next time it surfaces. Seven readings use one up;
// holding it in view uses it up in three.
const READ_COST = .74;
const HELD_COST = .5;
const FADE_IN = 2_200;
const HOLD = 3_400;
const HELD_HOLD = 2_400;
const FADE_OUT = 3_000;
const AT_ONCE = 3;

// The seed, so the archive hums whatever the Machine Room last left behind.
const SEED_ROOT = 329.63;
const SEED_SCALE = [0, 2, 4, 5, 7, 9, 11, 12, 14];
const SEED_DEFAULT = [0, 4, 1, 3];

let width = innerWidth;
let height = innerHeight;
let ratio = 1;
let animationFrame = 0;
let running = false;
let startedAt = 0;
let hiddenAt = 0;
let nextSurfacing = 0;
let instructionGone = false;
let pointer = { x: -1, y: -1 };
let pool = [];
let active = [];
let audio = null;

function readStore() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE) || "null");
    if (stored && typeof stored === "object") {
      return {
        seen: stored.seen && typeof stored.seen === "object" ? stored.seen : {},
        pool: Array.isArray(stored.pool) ? stored.pool : []
      };
    }
  } catch (error) {
    // An archive that cannot be stored is simply an archive that forgets faster.
  }
  return { seen: {}, pool: [] };
}

function writeStore(seen) {
  try {
    if (!pool.length && !Object.keys(seen).length) localStorage.removeItem(STORE);
    else localStorage.setItem(STORE, JSON.stringify({ seen, pool }));
  } catch (error) {
    // An archive that cannot be stored is simply an archive that forgets faster.
  }
}

function readVisits() {
  try {
    return JSON.parse(localStorage.getItem("house-room-visits") || "{}");
  } catch (error) {
    return {};
  }
}

function rememberVisit() {
  try {
    const visits = JSON.parse(localStorage.getItem("house-room-visits") || "{}");
    visits.archive = Date.now();
    localStorage.setItem("house-room-visits", JSON.stringify(visits));
  } catch (error) {
    // The reading does not depend on being remembered.
  }
}

function readSeed() {
  try {
    const stored = JSON.parse(localStorage.getItem("house-seed") || "null");
    const usable = Array.isArray(stored)
      && stored.length === SEED_DEFAULT.length
      && stored.every(degree => Number.isInteger(degree) && degree >= 0 && degree < SEED_SCALE.length);
    if (usable) return stored;
  } catch (error) {
    // The archive hums what time has made of the seed when nothing is stored.
  }
  return typeof agedSeed === "function" ? agedSeed() : SEED_DEFAULT;
}

// A room writes into the archive by being entered. Nothing arrives here that
// the visitor did not go and stand in first.
let store = readStore();
let seen = store.seen;
pool = store.pool.filter(entry => SOURCES[entry.r]?.[entry.f] && entry.s > SPENT);

function deposit() {
  const visits = readVisits();

  for (const name of Object.keys(SOURCES)) {
    const visited = visits[name];
    if (!visited || visited <= (seen[name] || 0)) continue;

    SOURCES[name].forEach((_, index) => {
      const existing = pool.find(entry => entry.r === name && entry.f === index);
      if (existing) existing.s = 1;
      else pool.push({ r: name, f: index, s: 1 });
    });

    seen[name] = visited;
  }

  writeStore(seen);
}

function textOf(entry) {
  return SOURCES[entry.r][entry.f];
}

function chooseEntry() {
  const available = pool.filter(entry => !active.some(item => item.entry === entry));
  if (!available.length) return null;

  const total = available.reduce((sum, entry) => sum + entry.s, 0);
  let target = Math.random() * total;
  for (const entry of available) {
    target -= entry.s;
    if (target <= 0) return entry;
  }
  return available[available.length - 1];
}

function resize() {
  ratio = Math.min(devicePixelRatio || 1, 2);
  width = innerWidth;
  height = innerHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function fontSize() {
  return Math.max(15, Math.min(28, Math.round(Math.min(width, height) * .028)));
}

function surface(now) {
  const entry = chooseEntry();
  if (!entry) return;

  const size = fontSize();
  context.font = `300 ${size}px "Iowan Old Style", Palatino, Georgia, serif`;
  const span = context.measureText(textOf(entry)).width;
  const marginX = Math.min(width * .1, 90) + span / 2;
  const marginY = Math.max(height * .18, 96);

  active.push({
    entry,
    text: textOf(entry),
    size,
    span,
    x: marginX + Math.random() * Math.max(1, width - marginX * 2),
    y: marginY + Math.random() * Math.max(1, height - marginY * 2),
    drift: (Math.random() - .5) * .0055,
    born: now,
    held: false,
    alpha: 0
  });

  fragmentLog.textContent = textOf(entry);
  if (audio) audio.sound(entry.s);
}

function retire(item) {
  const entry = item.entry;
  entry.s *= item.held ? HELD_COST : READ_COST;
  if (entry.s <= SPENT) pool = pool.filter(other => other !== entry);
  writeStore(seen);
}

function frame(now) {
  if (!running) return;

  context.clearRect(0, 0, width, height);

  // The emptier the archive, the less it can afford to wait. What is left
  // comes faster and fainter, until the last fragment is alone.
  const left = pool.reduce((sum, entry) => sum + entry.s, 0);
  const fullness = Math.max(0, Math.min(1, left / (SOURCES.garden.length * 3)));
  const haste = .3 + fullness * .7;
  const alone = pool.length <= 1;

  if (now >= nextSurfacing && active.length < (alone ? 1 : AT_ONCE) && pool.length) {
    surface(now);
    nextSurfacing = now + (alone ? 5_200 : (2_600 + Math.random() * 1_900) * haste);
  }

  const remaining = [];

  for (const item of active) {
    const age = now - item.born;
    // The last one is given the time the others were not.
    const hold = HOLD + (item.held ? HELD_HOLD : 0) + (alone ? 7_400 : 0);
    const leaving = alone ? FADE_OUT * 2.2 : FADE_OUT;
    const lifetime = FADE_IN + hold + leaving;

    if (age >= lifetime) {
      retire(item);
      continue;
    }

    item.alpha = age < FADE_IN
      ? age / FADE_IN
      : age < FADE_IN + hold
        ? 1
        : 1 - (age - FADE_IN - hold) / leaving;

    if (!reducedMotion) item.x += item.drift * 16;

    // Attention is the only thing that happens to a fragment here, and it
    // costs the fragment more than being left alone.
    const reach = Math.max(70, item.span * .6);
    if (Math.abs(pointer.x - item.x) < reach && Math.abs(pointer.y - item.y) < 46) item.held = true;

    remaining.push(item);
  }

  active = remaining;

  for (let index = 0; index < active.length; index++) {
    for (let other = index + 1; other < active.length; other++) {
      const a = active[index];
      const b = active[other];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const near = Math.hypot(width, height) * .42;
      if (distance > near) continue;

      const strength = Math.min(a.alpha, b.alpha) * (1 - distance / near) * .3;
      context.beginPath();
      context.moveTo(a.x, a.y + 6);
      context.lineTo(b.x, b.y + 6);
      context.strokeStyle = `rgba(184,173,156,${strength})`;
      context.lineWidth = 1;
      context.stroke();
    }
  }

  for (const item of active) {
    const strength = Math.max(0, Math.min(1, item.alpha));
    const faded = .3 + item.entry.s * .58;
    context.font = `300 ${item.size}px "Iowan Old Style", Palatino, Georgia, serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = `rgba(230,224,214,${strength * faded})`;
    context.fillText(item.text, item.x, item.y);

    if (item.held) {
      context.beginPath();
      context.moveTo(item.x - item.span / 2, item.y + item.size * .78);
      context.lineTo(item.x + item.span / 2, item.y + item.size * .78);
      context.strokeStyle = `rgba(184,173,156,${strength * .3})`;
      context.stroke();
    }
  }

  if (!instructionGone && now - startedAt > 15_000) {
    instructionGone = true;
    room.dataset.instruction = "gone";
  }

  if (!pool.length && !active.length) {
    finish();
    return;
  }

  animationFrame = requestAnimationFrame(frame);
}

function finish() {
  running = false;
  cancelAnimationFrame(animationFrame);
  context.clearRect(0, 0, width, height);
  room.dataset.state = "empty";
  fragmentLog.textContent = "The archive is empty. The rooms will write it again if you go back to them.";
  if (audio) audio.fadeOut();
}

class ArchiveAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.muted = false;
    this.step = 0;
  }

  async start() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      soundControl.hidden = true;
      return false;
    }

    this.context = new AudioContext();
    const resume = this.context.resume();

    this.master = this.context.createGain();
    this.master.gain.value = .0001;
    this.master.connect(this.context.destination);

    const air = this.context.createBiquadFilter();
    air.type = "lowpass";
    air.frequency.value = 320;
    air.connect(this.master);

    for (const frequency of [74.42, 111.2]) {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.value = frequency < 100 ? .026 : .011;
      oscillator.connect(gain).connect(air);
      oscillator.start();
    }

    try {
      await resume;
    } catch (error) {
      return false;
    }
    if (this.context.state !== "running") return false;
    this.fadeTo(this.muted ? .0001 : .7, 4);
    return true;
  }

  fadeTo(value, duration) {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(.0001, this.master.gain.value), now);
    this.master.gain.exponentialRampToValueAtTime(Math.max(.0001, value), now + duration);
  }

  // One note of the current seed per fragment, quieter the fainter it is.
  sound(strength) {
    if (!this.context || this.context.state !== "running") return;
    const seed = readSeed();
    const degree = seed[this.step % seed.length];
    this.step++;

    const now = this.context.currentTime + .05;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(SEED_ROOT * Math.pow(2, SEED_SCALE[degree] / 12) / 2, now);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(.002, .016 * strength), now + 1.3);
    gain.gain.exponentialRampToValueAtTime(.0001, now + 4.6);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 4.8);
  }

  toggle() {
    this.muted = !this.muted;
    if (!this.muted && this.context?.state === "suspended") this.context.resume();
    this.fadeTo(this.muted ? .0001 : .7, 1.1);
    return this.muted;
  }

  fadeOut() {
    this.fadeTo(.0001, 3.4);
  }
}

function begin() {
  rememberVisit();
  deposit();

  if (!pool.length) {
    room.dataset.state = "empty";
    fragmentLog.textContent = "The archive is empty. Rooms write into it by being entered.";
    return;
  }

  running = true;
  startedAt = performance.now();
  nextSurfacing = startedAt + 900;
  room.dataset.state = "reading";

  audio = new ArchiveAudio();
  audio.start().then(started => {
    if (started) return;
    audio.muted = true;
    soundControl.textContent = "listen";
    soundControl.setAttribute("aria-pressed", "true");
  });

  cancelAnimationFrame(animationFrame);
  animationFrame = requestAnimationFrame(frame);
}

enter.addEventListener("click", begin);

soundControl.addEventListener("click", () => {
  if (!audio) return;
  const muted = audio.toggle();
  soundControl.textContent = muted ? "listen" : "silence";
  soundControl.setAttribute("aria-pressed", String(muted));
});

addEventListener("pointermove", event => {
  pointer = { x: event.clientX, y: event.clientY };
});

addEventListener("pointerdown", event => {
  pointer = { x: event.clientX, y: event.clientY };
});

addEventListener("resize", resize);

document.addEventListener("visibilitychange", () => {
  if (!running) return;

  if (document.hidden) {
    hiddenAt = performance.now();
    cancelAnimationFrame(animationFrame);
    if (audio?.context) audio.context.suspend();
    return;
  }

  const away = performance.now() - hiddenAt;
  startedAt += away;
  nextSurfacing += away;
  for (const item of active) item.born += away;
  if (audio?.context && !audio.muted) audio.context.resume();
  animationFrame = requestAnimationFrame(frame);
});

addEventListener("pagehide", () => {
  cancelAnimationFrame(animationFrame);
  writeStore(seen);
});

resize();
