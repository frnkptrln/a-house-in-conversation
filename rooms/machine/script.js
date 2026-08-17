"use strict";

const room = document.querySelector("#room");
const canvas = document.querySelector("#machine");
const context = canvas.getContext("2d");
const enter = document.querySelector("#enter");
const soundControl = document.querySelector("#sound");
const forgetControl = document.querySelector("#forget");
const seedReadout = document.querySelector("#readout-seed");
const stateReadout = document.querySelector("#readout-state");
const loopReadout = document.querySelector("#readout-loop");
const tracesReadout = document.querySelector("#readout-traces");
const status = document.querySelector("#status");

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// The house is built on one four-note seed. Here it is a sequence of four
// slots, each holding a degree of E major; everything else in the room is a
// way of making that sequence visible while it runs.
const ROOT = 329.63;
const SCALE = [0, 2, 4, 5, 7, 9, 11, 12, 14];
const NAMES = ["E", "F♯", "G♯", "A", "B", "C♯", "D♯", "E′", "F♯′"];
const SLOTS = 4;
const DEFAULT_SEED = [0, 4, 1, 3];
const PANS = [-.4, .3, -.16, .36];
const LOOP = 9.6;
const SUBDIVISIONS = 8;
const TAU = Math.PI * 2;

// Every room in the house, so the count of traces is a fact and not a guess.
const HOUSE = [
  "conversation",
  "colour",
  "garden",
  "listening",
  "afterimage",
  "window",
  "machine",
  "archive"
];

let seed = readSeed();
let selected = 0;
let width = innerWidth;
let height = innerHeight;
let ratio = 1;
let animationFrame = 0;
let running = false;
let startedAt = 0;
let hiddenAt = 0;
let lastSlot = -1;
let lastSubdivision = -1;
let needsDraw = true;
let hasAltered = false;
let instructionState = "alter";
let drag = null;
let audio = null;

const flares = Array.from({ length: SLOTS }, () => 0);

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function readSeed() {
  try {
    const stored = JSON.parse(localStorage.getItem("house-seed") || "null");
    const usable = Array.isArray(stored)
      && stored.length === SLOTS
      && stored.every(degree => Number.isInteger(degree) && degree >= 0 && degree < SCALE.length);
    if (usable) return stored.slice();
  } catch (error) {
    // The mechanism runs whether or not the browser keeps anything.
  }
  return DEFAULT_SEED.slice();
}

function isDefaultSeed() {
  return seed.every((degree, index) => degree === DEFAULT_SEED[index]);
}

function writeSeed() {
  try {
    // Returning the seed to the form the house wrote leaves nothing behind.
    if (isDefaultSeed()) localStorage.removeItem("house-seed");
    else localStorage.setItem("house-seed", JSON.stringify(seed));
  } catch (error) {
    // The mechanism runs whether or not the browser keeps anything.
  }
}

function rememberVisit() {
  try {
    const visits = JSON.parse(localStorage.getItem("house-room-visits") || "{}");
    visits.machine = Date.now();
    localStorage.setItem("house-room-visits", JSON.stringify(visits));
  } catch (error) {
    // The mechanism runs whether or not the browser keeps anything.
  }
}

function countTraces() {
  try {
    const visits = JSON.parse(localStorage.getItem("house-room-visits") || "{}");
    return HOUSE.filter(name => visits[name]).length;
  } catch (error) {
    return 0;
  }
}

function frequencyOf(degree) {
  return ROOT * Math.pow(2, SCALE[degree] / 12);
}

function describeSeed() {
  return seed.map(degree => NAMES[degree]).join(" · ");
}

function refreshReadout() {
  const altered = !isDefaultSeed();
  seedReadout.textContent = describeSeed();
  stateReadout.textContent = altered ? "altered by you" : "as the house wrote it";
  tracesReadout.textContent = `${countTraces()} / ${HOUSE.length}`;
  room.dataset.seed = altered ? "altered" : "written";
  forgetControl.hidden = !altered;
}

class MachineAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.muted = false;
    this.hum = [];
  }

  async start() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      soundControl.hidden = true;
      return false;
    }

    if (this.context) {
      try {
        await this.context.resume();
      } catch (error) {
        return false;
      }
      return this.context.state === "running";
    }

    this.context = new AudioContext();
    const resume = this.context.resume();

    this.master = this.context.createGain();
    this.master.gain.value = .0001;
    this.master.connect(this.context.destination);

    const bed = this.context.createBiquadFilter();
    bed.type = "lowpass";
    bed.frequency.value = 210;
    bed.Q.value = .7;
    bed.connect(this.master);

    for (const frequency of [55, 55.37, 110.2]) {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = "sawtooth";
      oscillator.frequency.value = frequency;
      gain.gain.value = frequency > 100 ? .006 : .019;
      oscillator.connect(gain).connect(bed);
      oscillator.start();
      this.hum.push(oscillator);
    }

    this.noise = this.context.createBuffer(1, this.context.sampleRate * .4, this.context.sampleRate);
    const samples = this.noise.getChannelData(0);
    for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;

    try {
      await resume;
    } catch (error) {
      return false;
    }
    if (this.context.state !== "running") return false;
    this.fadeTo(this.muted ? .0001 : .78, 2.4);
    return true;
  }

  fadeTo(value, duration) {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(.0001, this.master.gain.value), now);
    this.master.gain.exponentialRampToValueAtTime(Math.max(.0001, value), now + duration);
  }

  connectPan(node, pan) {
    if (!this.context.createStereoPanner) return node.connect(this.master);
    const panner = this.context.createStereoPanner();
    panner.pan.value = pan;
    return node.connect(panner).connect(this.master);
  }

  // A cold pluck: a square voice pushed through a narrow band, with a short
  // sine underneath so the note has a body and not only an edge.
  strike(frequency, pan) {
    if (!this.context || this.context.state !== "running") return;
    const now = this.context.currentTime + .01;

    const voice = this.context.createOscillator();
    const band = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    voice.type = "square";
    voice.frequency.setValueAtTime(frequency, now);
    band.type = "bandpass";
    band.frequency.setValueAtTime(frequency * 2.1, now);
    band.Q.value = 7;
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(.075, now + .006);
    gain.gain.exponentialRampToValueAtTime(.0001, now + .82);
    voice.connect(band).connect(gain);
    this.connectPan(gain, pan);
    voice.start(now);
    voice.stop(now + .9);

    const body = this.context.createOscillator();
    const bodyGain = this.context.createGain();
    body.type = "sine";
    body.frequency.setValueAtTime(frequency / 2, now);
    bodyGain.gain.setValueAtTime(.0001, now);
    bodyGain.gain.exponentialRampToValueAtTime(.03, now + .012);
    bodyGain.gain.exponentialRampToValueAtTime(.0001, now + .44);
    body.connect(bodyGain);
    this.connectPan(bodyGain, pan * .4);
    body.start(now);
    body.stop(now + .5);
  }

  tick() {
    if (!this.context || this.context.state !== "running" || !this.noise) return;
    const now = this.context.currentTime + .01;
    const source = this.context.createBufferSource();
    const edge = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noise;
    edge.type = "highpass";
    edge.frequency.value = 3_600;
    gain.gain.setValueAtTime(.0055, now);
    gain.gain.exponentialRampToValueAtTime(.0001, now + .045);
    source.connect(edge).connect(gain).connect(this.master);
    source.start(now);
    source.stop(now + .06);
  }

  // The sound of the mechanism accepting a change.
  confirm(frequency) {
    if (!this.context || this.context.state !== "running") return;
    const now = this.context.currentTime + .005;
    const voice = this.context.createOscillator();
    const gain = this.context.createGain();
    voice.type = "triangle";
    voice.frequency.setValueAtTime(frequency * 4, now);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(.018, now + .004);
    gain.gain.exponentialRampToValueAtTime(.0001, now + .22);
    voice.connect(gain).connect(this.master);
    voice.start(now);
    voice.stop(now + .25);
  }

  toggle() {
    this.muted = !this.muted;
    if (!this.muted && this.context?.state === "suspended") this.context.resume();
    this.fadeTo(this.muted ? .0001 : .78, .9);
    return this.muted;
  }
}

function resize() {
  ratio = Math.min(devicePixelRatio || 1, 2);
  width = innerWidth;
  height = innerHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  needsDraw = true;
  if (!running || reducedMotion) draw(phaseNow());
}

function geometry() {
  const centreX = width / 2;
  const centreY = height / 2;
  const short = Math.min(width, height);
  const step = clamp(short * .026, 9, 19);
  const radius = clamp(short * .17, 74, 190);
  return { centreX, centreY, radius, step };
}

function nodeAngle(index) {
  return -Math.PI / 2 + index * TAU / SLOTS;
}

function nodePoint(index, { centreX, centreY, radius, step }) {
  const angle = nodeAngle(index);
  const distance = radius + seed[index] * step;
  return {
    angle,
    x: centreX + Math.cos(angle) * distance,
    y: centreY + Math.sin(angle) * distance,
    baseX: centreX + Math.cos(angle) * radius,
    baseY: centreY + Math.sin(angle) * radius
  };
}

function phaseNow(time = performance.now()) {
  if (!running) return 0;
  return ((time - startedAt) / 1000 % LOOP) / LOOP;
}

function draw(phase) {
  const { centreX, centreY, radius, step } = geometry();
  const lattice = radius + (SCALE.length - 1) * step;

  context.clearRect(0, 0, width, height);

  // The lattice the notes stand on: one ring for every degree of the scale.
  for (let degree = 0; degree < SCALE.length; degree++) {
    const distance = radius + degree * step;
    context.beginPath();
    context.arc(centreX, centreY, distance, 0, TAU);
    context.strokeStyle = `rgba(140,166,176,${degree === 0 ? .16 : .045})`;
    context.lineWidth = 1;
    context.stroke();
  }

  // Spokes: the four positions the rotor keeps returning to. The chosen one
  // shows the whole scale it can be moved along, so a change is legible as a
  // step and not as a jump.
  for (let index = 0; index < SLOTS; index++) {
    const angle = nodeAngle(index);
    const across = { x: -Math.sin(angle), y: Math.cos(angle) };
    context.beginPath();
    context.moveTo(centreX + Math.cos(angle) * (radius * .3), centreY + Math.sin(angle) * (radius * .3));
    context.lineTo(centreX + Math.cos(angle) * lattice, centreY + Math.sin(angle) * lattice);
    context.strokeStyle = `rgba(140,166,176,${index === selected ? .2 : .08})`;
    context.lineWidth = 1;
    context.stroke();

    if (index !== selected) continue;

    for (let degree = 0; degree < SCALE.length; degree++) {
      const distance = radius + degree * step;
      const x = centreX + Math.cos(angle) * distance;
      const y = centreY + Math.sin(angle) * distance;
      const reach = degree === seed[index] ? 6 : 3.4;
      context.beginPath();
      context.moveTo(x - across.x * reach, y - across.y * reach);
      context.lineTo(x + across.x * reach, y + across.y * reach);
      context.strokeStyle = `rgba(112,225,209,${degree === seed[index] ? .5 : .17})`;
      context.stroke();
    }
  }

  // The rotor.
  const rotorAngle = -Math.PI / 2 + phase * TAU;
  const rotorX = centreX + Math.cos(rotorAngle) * lattice;
  const rotorY = centreY + Math.sin(rotorAngle) * lattice;
  const sweep = context.createLinearGradient(centreX, centreY, rotorX, rotorY);
  sweep.addColorStop(0, "rgba(112,225,209,0)");
  sweep.addColorStop(1, "rgba(112,225,209,.42)");
  context.beginPath();
  context.moveTo(centreX, centreY);
  context.lineTo(rotorX, rotorY);
  context.strokeStyle = sweep;
  context.lineWidth = 1.2;
  context.stroke();

  context.beginPath();
  context.arc(
    centreX + Math.cos(rotorAngle) * radius,
    centreY + Math.sin(rotorAngle) * radius,
    2.6,
    0,
    TAU
  );
  context.fillStyle = "rgba(112,225,209,.72)";
  context.fill();

  // The centre holds nothing. A machine is mostly the space it turns in.
  context.beginPath();
  context.arc(centreX, centreY, 3.2, 0, TAU);
  context.strokeStyle = "rgba(140,166,176,.3)";
  context.stroke();

  for (let index = 0; index < SLOTS; index++) {
    const point = nodePoint(index, { centreX, centreY, radius, step });
    const flare = flares[index];
    const chosen = index === selected;

    context.beginPath();
    context.moveTo(point.baseX, point.baseY);
    context.lineTo(point.x, point.y);
    context.strokeStyle = `rgba(219,228,232,${.16 + flare * .5})`;
    context.lineWidth = chosen ? 1.6 : 1;
    context.stroke();

    if (flare > .01) {
      const halo = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, 34 + flare * 30);
      halo.addColorStop(0, `rgba(112,225,209,${flare * .3})`);
      halo.addColorStop(1, "rgba(112,225,209,0)");
      context.fillStyle = halo;
      context.beginPath();
      context.arc(point.x, point.y, 34 + flare * 30, 0, TAU);
      context.fill();
    }

    const size = chosen ? 5.4 : 4.2;
    context.beginPath();
    context.rect(point.x - size, point.y - size, size * 2, size * 2);
    context.fillStyle = `rgba(7,9,12,.9)`;
    context.fill();
    context.strokeStyle = chosen
      ? `rgba(112,225,209,${.6 + flare * .4})`
      : `rgba(219,228,232,${.4 + flare * .6})`;
    context.lineWidth = chosen ? 1.5 : 1;
    context.stroke();

    const outward = radius + seed[index] * step + 20;
    const labelX = centreX + Math.cos(point.angle) * outward;
    const labelY = centreY + Math.sin(point.angle) * outward;
    context.font = `${chosen ? 600 : 400} 11px "SFMono-Regular", Consolas, monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = chosen
      ? `rgba(112,225,209,${.78 + flare * .22})`
      : `rgba(219,228,232,${.44 + flare * .5})`;
    context.fillText(NAMES[seed[index]], labelX, labelY);
  }
}

function fire(index) {
  flares[index] = 1;
  if (audio) audio.strike(frequencyOf(seed[index]), PANS[index]);
  needsDraw = true;
}

function frame(now) {
  if (!running) return;
  const phase = phaseNow(now);
  const slot = Math.floor(phase * SLOTS) % SLOTS;
  const subdivision = Math.floor(phase * SUBDIVISIONS) % SUBDIVISIONS;

  if (slot !== lastSlot) {
    lastSlot = slot;
    fire(slot);
  }

  if (subdivision !== lastSubdivision) {
    if (lastSubdivision !== -1 && subdivision % 2 === 1 && audio) audio.tick();
    lastSubdivision = subdivision;
  }

  for (let index = 0; index < SLOTS; index++) {
    if (flares[index] > 0) {
      flares[index] = Math.max(0, flares[index] - .022);
      needsDraw = true;
    }
  }

  if (!reducedMotion || needsDraw) {
    draw(phase);
    needsDraw = false;
  }

  animationFrame = requestAnimationFrame(frame);
}

function announce(message) {
  status.textContent = message;
}

function alterSelected(direction) {
  const next = clamp(seed[selected] + direction, 0, SCALE.length - 1);
  if (next === seed[selected]) return;

  seed[selected] = next;
  writeSeed();
  refreshReadout();
  needsDraw = true;
  if (audio) audio.confirm(frequencyOf(next));

  if (!hasAltered) {
    hasAltered = true;
    instructionState = "altered";
    room.dataset.instruction = instructionState;
  }

  announce(`Note ${selected + 1} is now ${NAMES[next]}. The seed reads ${describeSeed()}.`);
}

function select(index) {
  selected = (index + SLOTS) % SLOTS;
  needsDraw = true;
  announce(`Note ${selected + 1} of four, ${NAMES[seed[selected]]}.`);
}

function nearestNode(x, y) {
  const shape = geometry();
  let closest = -1;
  let distance = Infinity;

  for (let index = 0; index < SLOTS; index++) {
    const point = nodePoint(index, shape);
    const span = Math.hypot(point.x - x, point.y - y);
    if (span < distance) {
      distance = span;
      closest = index;
    }
  }

  return distance < Math.max(46, shape.step * 2.6) ? closest : -1;
}

function begin() {
  rememberVisit();
  running = true;
  startedAt = performance.now();
  lastSlot = -1;
  lastSubdivision = -1;
  needsDraw = true;
  room.dataset.state = "running";
  refreshReadout();
  announce("The mechanism is running. Four notes repeat every nine and a half seconds.");
  canvas.focus({ preventScroll: true });

  audio = new MachineAudio();
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

forgetControl.addEventListener("click", () => {
  seed = DEFAULT_SEED.slice();
  writeSeed();
  refreshReadout();
  needsDraw = true;
  instructionState = "gone";
  room.dataset.instruction = instructionState;
  announce(`The house has forgotten. The seed reads ${describeSeed()} again.`);
  canvas.focus({ preventScroll: true });
});

canvas.addEventListener("pointerdown", event => {
  if (!running) return;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const index = nearestNode(x, y);
  if (index === -1) return;

  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  select(index);
  fire(index);
  drag = { y, degree: seed[index] };
});

canvas.addEventListener("pointermove", event => {
  if (!running || !drag) return;
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const travelled = drag.y - (event.clientY - rect.top);
  const wanted = clamp(drag.degree + Math.round(travelled / 26), 0, SCALE.length - 1);
  if (wanted !== seed[selected]) alterSelected(wanted - seed[selected]);
});

function releasePointer(event) {
  if (!drag) return;
  drag = null;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
}

canvas.addEventListener("pointerup", releasePointer);
canvas.addEventListener("pointercancel", releasePointer);

canvas.addEventListener("keydown", event => {
  if (!running) return;

  if (event.key === "ArrowLeft") select(selected - 1);
  else if (event.key === "ArrowRight") select(selected + 1);
  else if (event.key === "ArrowUp") alterSelected(1);
  else if (event.key === "ArrowDown") alterSelected(-1);
  else if (event.key === " " || event.key === "Enter") fire(selected);
  else return;

  event.preventDefault();
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

  startedAt += performance.now() - hiddenAt;
  if (audio?.context && !audio.muted) audio.context.resume();
  animationFrame = requestAnimationFrame(frame);
});

addEventListener("pagehide", () => {
  cancelAnimationFrame(animationFrame);
  writeSeed();
});

loopReadout.textContent = `${LOOP.toFixed(1)} s`;
refreshReadout();
resize();
