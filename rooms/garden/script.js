"use strict";

const room = document.querySelector("#room");
const canvas = document.querySelector("#garden-field");
const context = canvas.getContext("2d");
const enter = document.querySelector("#enter");
const again = document.querySelector("#again");
const soundtrack = document.querySelector("#soundtrack");
const soundFallback = document.querySelector("#sound-fallback");

const DURATION = 144000;
const ENDING_AT = 132000;
const MEMORY_KEY = "house-garden-memory";
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let width = innerWidth;
let height = innerHeight;
let ratio = 1;
let startTime = 0;
let animationFrame = 0;
let running = false;
let endingShown = false;
let rememberedThisVisit = false;
let returnDepth = 0;
let plants = [];
let driftingSeeds = [];
let invitedBlooms = [];
let pointer = { x: width / 2, y: height / 2, visible: false };

function freshSeed() {
  if (window.crypto?.getRandomValues) {
    const value = new Uint32Array(1);
    window.crypto.getRandomValues(value);
    return value[0];
  }
  return Math.floor(Math.random() * 0xffffffff);
}

function readMemory() {
  try {
    const stored = JSON.parse(localStorage.getItem(MEMORY_KEY) || "null");
    if (stored && Number.isFinite(stored.seed)) {
      return {
        seed: stored.seed >>> 0,
        visits: Math.max(0, Number(stored.visits) || 0),
        lastVisit: Math.max(0, Number(stored.lastVisit) || 0)
      };
    }
  } catch (error) {
    // A private garden can still exist without browser storage.
  }
  return { seed: freshSeed(), visits: 0, lastVisit: 0 };
}

let memory = readMemory();

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

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function rememberGarden() {
  if (rememberedThisVisit) return;
  rememberedThisVisit = true;

  const now = Date.now();
  if (memory.lastVisit) {
    const daysAway = (now - memory.lastVisit) / 86400000;
    returnDepth = clamp(Math.log1p(Math.max(0, daysAway)) / 4, 0, .32);
  }
  memory.visits += 1;
  memory.lastVisit = now;

  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
    const visits = JSON.parse(localStorage.getItem("house-room-visits") || "{}");
    visits.garden = now;
    localStorage.setItem("house-room-visits", JSON.stringify(visits));
  } catch (error) {
    // Growth and the score remain complete when storage is unavailable.
  }
}

function createGarden() {
  const random = randomFrom(memory.seed);
  const visitGrowth = Math.min(7, memory.visits);
  const count = (reducedMotion ? 13 : 18) + visitGrowth * 3;
  plants = [];

  for (let index = 0; index < count; index++) {
    const branchCount = 2 + Math.floor(random() * 5);
    const branches = Array.from({ length: branchCount }, (_, branchIndex) => ({
      at: .25 + branchIndex / Math.max(1, branchCount - 1) * .58 + (random() - .5) * .07,
      side: random() > .5 ? 1 : -1,
      length: .08 + random() * .11,
      angle: .42 + random() * .44,
      leafScale: .68 + random() * .74
    })).sort((a, b) => a.at - b.at);

    plants.push({
      x: .035 + random() * .93,
      baseY: .89 + random() * .09,
      height: .24 + random() * .52,
      lean: (random() - .5) * .24,
      delay: random() * 30000 - visitGrowth * 2100,
      duration: 39000 + random() * 47000,
      width: .7 + random() * 2,
      hue: 78 + random() * 52,
      warmth: random(),
      phase: random() * Math.PI * 2,
      bloomAt: 58000 + random() * 61000 - visitGrowth * 1800,
      branches,
      returnedBloom: index < Math.max(0, visitGrowth - 1),
      spent: 0
    });
  }

  // A tall one near the middle, so that what the wind takes is visible.
  const candidates = plants
    .map((plant, index) => ({ index, plant }))
    .filter(entry => entry.plant.x > .28 && entry.plant.x < .72)
    .sort((a, b) => b.plant.height - a.plant.height);
  if (candidates.length) candidates[0].plant.fragile = true;

  driftingSeeds = Array.from({ length: reducedMotion ? 14 : 38 }, () => ({
    x: random(),
    y: .08 + random() * .68,
    size: .7 + random() * 1.9,
    phase: random() * Math.PI * 2,
    speed: .000012 + random() * .000025,
    hue: 42 + random() * 35
  }));
}

function resize() {
  ratio = Math.min(devicePixelRatio || 1, 2);
  width = innerWidth;
  height = innerHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  createGarden();
  if (!running) drawGarden(0, 0);
}

// Once in the whole garden, wind crosses the field from one side to the other.
// It is the only thing here that happens rather than grows.
const WIND_AT = 88_000;
const WIND_LENGTH = 7_400;
let wind = 0;
let windCentre = -1;

function gustAt(x) {
  if (wind <= 0) return 0;
  return Math.exp(-(((x - windCentre) / .19) ** 2)) * wind;
}

function plantPoint(plant, amount, time, attention = 0) {
  const baseX = plant.x * width;
  const baseY = plant.baseY * height;
  const plantHeight = plant.height * height;
  const stillTime = reducedMotion ? 0 : time;
  const sway = Math.sin(stillTime * .00042 + plant.phase + amount * 1.8) * plantHeight * (.008 + attention * .022);
  const gust = gustAt(plant.x) * plantHeight * .21 * amount * amount;
  const shiver = gustAt(plant.x) * Math.sin(stillTime * .006 + plant.phase) * plantHeight * .022 * amount;
  const given = (plant.spent || 0) * plantHeight * .34 * amount * amount;
  return {
    x: baseX + plant.lean * plantHeight * amount * amount + sway + gust + shiver + given * .5,
    y: baseY - plantHeight * amount + Math.abs(gust) * .12 + given
  };
}

function drawLeaf(x, y, size, angle, hue, alpha) {
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.fillStyle = `hsla(${hue} 32% 34% / ${alpha})`;
  context.beginPath();
  context.ellipse(0, 0, size * 1.9, size * .72, 0, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = `hsla(${hue + 18} 30% 68% / ${alpha * .34})`;
  context.lineWidth = .55;
  context.beginPath();
  context.moveTo(-size * 1.15, 0);
  context.lineTo(size * 1.2, 0);
  context.stroke();
  context.restore();
}

function drawFlower(x, y, radius, hue, alpha, phase = 0) {
  context.save();
  context.globalCompositeOperation = "screen";
  for (let petal = 0; petal < 6; petal++) {
    const angle = phase + petal / 6 * Math.PI * 2;
    context.fillStyle = `hsla(${hue + petal * 3} 74% 68% / ${alpha * .52})`;
    context.beginPath();
    context.ellipse(
      x + Math.cos(angle) * radius * .72,
      y + Math.sin(angle) * radius * .72,
      radius * .72,
      radius * .3,
      angle,
      0,
      Math.PI * 2
    );
    context.fill();
  }
  const glow = context.createRadialGradient(x, y, 0, x, y, radius * 2.4);
  glow.addColorStop(0, `hsla(${hue + 30} 88% 72% / ${alpha * .8})`);
  glow.addColorStop(1, `hsla(${hue + 30} 88% 72% / 0)`);
  context.fillStyle = glow;
  context.beginPath();
  context.arc(x, y, radius * 2.4, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawPlant(plant, elapsed, time) {
  // One plant does not come through the wind. The garden goes on around it,
  // which is the point: growth without a target state includes this.
  plant.spent = plant.fragile && !reducedMotion
    ? clamp((elapsed - (WIND_AT + WIND_LENGTH * .5)) / 17_000)
    : 0;

  const baseGrowth = Math.min(.48, Math.max(0, memory.visits - 1) * .075 + returnDepth);
  const growth = reducedMotion ? 1 : clamp(baseGrowth + (elapsed - plant.delay) / plant.duration);
  if (growth <= 0) return;

  const baseX = plant.x * width;
  const distance = pointer.visible ? Math.abs(pointer.x - baseX) : width;
  const attention = pointer.visible ? clamp(1 - distance / (width * .18)) : 0;
  const segments = 28;

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  const drained = plant.spent;
  context.strokeStyle = `hsla(${plant.hue - drained * 42} ${(30 + plant.warmth * 18) * (1 - drained * .74)}% ${25 + plant.warmth * 9 + drained * 8}% / ${(.42 + growth * .42) * (1 - drained * .42)})`;
  context.lineWidth = plant.width + growth * 1.2;
  context.beginPath();
  for (let index = 0; index <= segments; index++) {
    const amount = growth * index / segments;
    const point = plantPoint(plant, amount, time, attention);
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  }
  context.stroke();

  for (const branch of plant.branches) {
    if (growth <= branch.at) continue;
    const emergence = clamp((growth - branch.at) / .2);
    const origin = plantPoint(plant, branch.at, time, attention);
    const plantHeight = plant.height * height;
    const length = plantHeight * branch.length * emergence;
    const end = {
      x: origin.x + branch.side * Math.cos(branch.angle) * length,
      y: origin.y - Math.sin(branch.angle) * length
    };
    context.strokeStyle = `hsla(${plant.hue + 4} 30% 30% / ${.34 + emergence * .4})`;
    context.lineWidth = Math.max(.55, plant.width * .56);
    context.beginPath();
    context.moveTo(origin.x, origin.y);
    context.quadraticCurveTo(
      origin.x + (end.x - origin.x) * .62,
      origin.y - length * .18,
      end.x,
      end.y
    );
    context.stroke();

    if (emergence > .45) {
      const leafSize = (2.4 + plant.width * 1.45) * branch.leafScale * emergence;
      drawLeaf(end.x, end.y, leafSize, -branch.side * branch.angle * .72, plant.hue + branch.side * 7, emergence * .72);
    }
  }

  const tip = plantPoint(plant, growth, time, attention);
  if (growth > .82) {
    drawLeaf(tip.x, tip.y, 3.2 + plant.width, plant.lean * 2.6, plant.hue + 8, clamp((growth - .82) / .18) * .74);
  }

  const bloomReady = plant.returnedBloom || elapsed >= plant.bloomAt;
  if (growth > .94 && bloomReady && drained < .9) {
    const bloom = (plant.returnedBloom ? 1 : clamp((elapsed - plant.bloomAt) / 7000)) * (1 - drained);
    const hue = plant.warmth > .58 ? 30 + plant.warmth * 35 : 318 + plant.warmth * 38;
    drawFlower(tip.x, tip.y, (3.1 + plant.width * 1.5) * bloom, hue, .62 * bloom, plant.phase);
  }
  context.restore();
}

function drawInvitedBlooms(time) {
  invitedBlooms = invitedBlooms.filter(bloom => time - bloom.started < 14500);
  for (const bloom of invitedBlooms) {
    const age = Math.max(0, time - bloom.started);
    const arrival = reducedMotion ? 1 : clamp(age / 1700);
    const leaving = age < 9700 ? 1 : 1 - clamp((age - 9700) / 4800);
    const radius = (7 + bloom.size * 9) * arrival;
    drawFlower(bloom.x, bloom.y, radius, bloom.hue, leaving * .78, bloom.phase);

    if (!reducedMotion) {
      context.strokeStyle = `hsla(${bloom.hue + 25} 66% 74% / ${leaving * .17})`;
      context.lineWidth = 1;
      context.beginPath();
      context.arc(bloom.x, bloom.y, radius * (1.3 + age / 4200), 0, Math.PI * 2);
      context.stroke();
    }
  }
}

function mixHex(a, b, amount) {
  const from = [1, 3, 5].map(at => parseInt(a.slice(at, at + 2), 16));
  const to = [1, 3, 5].map(at => parseInt(b.slice(at, at + 2), 16));
  return `rgb(${from.map((value, index) => Math.round(value + (to[index] - value) * amount)).join(",")})`;
}

// The light does not stand still for two and a half minutes. It crosses,
// lowers, and cools, so that the end of the garden is a different hour from
// its beginning.
function paintBackground(time, elapsed) {
  const day = clamp(elapsed / DURATION);
  const late = day ** 1.5;

  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, mixHex("#d9dfc0", "#57648a", late));
  sky.addColorStop(.53, mixHex("#e7bd88", "#c47b63", late));
  sky.addColorStop(.78, mixHex("#7f9766", "#4a5c52", late));
  sky.addColorStop(1, mixHex("#17251a", "#0d1614", late));
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);

  const lightX = width * (.7 - day * .46 + Math.sin((reducedMotion ? 0 : time) * .000035) * .035);
  const lightY = height * (.2 + day * .34);
  const light = context.createRadialGradient(lightX, lightY, 0, lightX, lightY, Math.min(width, height) * (.46 + day * .2));
  light.addColorStop(0, `rgba(255,${Math.round(238 - late * 52)},171,${.42 - late * .16})`);
  light.addColorStop(.4, `rgba(240,198,137,${.13 - late * .05})`);
  light.addColorStop(1, "rgba(240,198,137,0)");
  context.fillStyle = light;
  context.fillRect(0, 0, width, height);

  const soil = context.createLinearGradient(0, height * .78, 0, height);
  soil.addColorStop(0, "rgba(28,48,29,0)");
  soil.addColorStop(1, "rgba(10,25,15,.82)");
  context.fillStyle = soil;
  context.fillRect(0, height * .7, width, height * .3);
}

function drawSeeds(time) {
  context.save();
  context.globalCompositeOperation = "screen";
  for (const seed of driftingSeeds) {
    const stillTime = reducedMotion ? 0 : time;
    const x = ((seed.x * width + stillTime * seed.speed * width + Math.sin(stillTime * .00017 + seed.phase) * 14) % (width + 30)) - 15;
    const y = seed.y * height + Math.cos(stillTime * .0001 + seed.phase) * 17;
    context.fillStyle = `hsla(${seed.hue} 76% 74% / .2)`;
    context.beginPath();
    context.arc(x, y, seed.size, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawGarden(elapsed, time) {
  const crossing = (elapsed - WIND_AT) / WIND_LENGTH;
  if (crossing <= 0 || crossing >= 1 || reducedMotion) {
    wind = 0;
    windCentre = -1;
  } else {
    wind = Math.sin(crossing * Math.PI) ** .7;
    windCentre = -.25 + crossing * 1.5;
  }

  paintBackground(time, elapsed);
  drawSeeds(time);
  const orderedPlants = [...plants].sort((a, b) => a.height - b.height);
  orderedPlants.forEach(plant => drawPlant(plant, elapsed, time));
  drawInvitedBlooms(time);

  if (pointer.visible) {
    const glow = context.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 76);
    glow.addColorStop(0, "rgba(247,224,139,.12)");
    glow.addColorStop(1, "rgba(247,224,139,0)");
    context.fillStyle = glow;
    context.fillRect(pointer.x - 76, pointer.y - 76, 152, 152);
  }
}

class BloomAudio {
  constructor() {
    this.context = null;
    this.master = null;
  }

  start() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return Promise.resolve();
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = .34;
      this.master.connect(this.context.destination);
    }
    return this.context.resume();
  }

  bloom(horizontalPosition) {
    if (!this.context || !this.master) return;
    const scale = [659.25, 739.99, 830.61, 880, 987.77, 1108.73];
    const index = Math.min(scale.length - 1, Math.floor(clamp(horizontalPosition) * scale.length));
    const frequency = scale[index];
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const harmonic = this.context.createOscillator();
    const gain = this.context.createGain();
    const harmonicGain = this.context.createGain();
    const panner = this.context.createStereoPanner ? this.context.createStereoPanner() : null;

    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    harmonic.type = "sine";
    harmonic.frequency.value = frequency * 2.01;
    harmonicGain.gain.value = .18;
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(.052, now + .035);
    gain.gain.exponentialRampToValueAtTime(.0001, now + 2.8);

    oscillator.connect(gain);
    harmonic.connect(harmonicGain).connect(gain);
    if (panner) {
      panner.pan.value = clamp(horizontalPosition * 2 - 1, -.72, .72);
      gain.connect(panner).connect(this.master);
    } else {
      gain.connect(this.master);
    }

    oscillator.start(now);
    harmonic.start(now);
    oscillator.stop(now + 2.9);
    harmonic.stop(now + 2.9);
  }
}

const bloomAudio = new BloomAudio();

function frame(now) {
  if (!running) return;
  const elapsed = now - startTime;
  drawGarden(Math.min(elapsed, DURATION), now);

  if (elapsed >= ENDING_AT && !endingShown) {
    endingShown = true;
    room.dataset.state = "ending";
    document.body.dataset.roomState = "ending";
  }

  if (elapsed >= DURATION) finish();
  else animationFrame = requestAnimationFrame(frame);
}

async function begin() {
  cancelAnimationFrame(animationFrame);
  rememberGarden();
  createGarden();
  invitedBlooms = [];
  pointer.visible = false;
  endingShown = false;
  running = true;
  room.dataset.state = "running";
  document.body.dataset.roomState = "running";
  soundFallback.hidden = true;

  soundtrack.pause();
  soundtrack.currentTime = 0;
  soundtrack.volume = .92;
  soundtrack.muted = false;
  const contextPromise = bloomAudio.start();
  const playbackPromise = soundtrack.play();
  try {
    await Promise.all([contextPromise, playbackPromise]);
  } catch (error) {
    soundFallback.hidden = false;
  }

  startTime = performance.now();
  animationFrame = requestAnimationFrame(frame);
}

function finish() {
  if (!running) return;
  running = false;
  cancelAnimationFrame(animationFrame);
  room.dataset.state = "ending";
  document.body.dataset.roomState = "ending";
  soundtrack.pause();
}

function pointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function inviteBloom(x, y) {
  if (!running) return;
  const random = randomFrom((memory.seed ^ Math.floor(x * 97) ^ Math.floor(y * 193) ^ invitedBlooms.length) >>> 0);
  invitedBlooms.push({
    x,
    y,
    started: performance.now(),
    hue: random() > .46 ? 32 + random() * 38 : 316 + random() * 44,
    phase: random() * Math.PI * 2,
    size: .65 + random() * .72
  });
  bloomAudio.bloom(x / width);
}

canvas.addEventListener("pointerdown", event => {
  const point = pointFromEvent(event);
  pointer = { ...point, visible: true };
  inviteBloom(point.x, point.y);
});

canvas.addEventListener("pointermove", event => {
  const point = pointFromEvent(event);
  pointer = { ...point, visible: true };
});

canvas.addEventListener("pointerleave", () => {
  pointer.visible = false;
});

canvas.addEventListener("keydown", event => {
  if (event.code !== "Space" && event.code !== "Enter") return;
  event.preventDefault();
  inviteBloom(width / 2, height * .48);
});

enter.addEventListener("click", begin);
again.addEventListener("click", begin);
soundFallback.addEventListener("click", async event => {
  event.stopPropagation();
  const contextPromise = bloomAudio.start();
  const playbackPromise = soundtrack.play();
  try {
    await Promise.all([contextPromise, playbackPromise]);
    soundFallback.hidden = true;
  } catch (error) {
    soundFallback.hidden = false;
  }
});

soundtrack.addEventListener("ended", finish);
addEventListener("resize", resize);
resize();
