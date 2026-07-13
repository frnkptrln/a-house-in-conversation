"use strict";

const threshold = document.querySelector("#threshold");
const canvas = document.querySelector("#threshold-field");
const context = canvas.getContext("2d");
const enter = document.querySelector("#enter");
const soundControl = document.querySelector("#sound");
const houseStatus = document.querySelector("#house-status");
const rooms = [...document.querySelectorAll(".room")];
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let width = innerWidth;
let height = innerHeight;
let ratio = 1;
let animationFrame = 0;
let entered = false;
let pulse = 0;
let pointer = { x: width / 2, y: height / 2, visible: false };

const unformed = [
  { x: .13, y: .20, phase: .7 },
  { x: .51, y: .18, phase: 2.2 },
  { x: .90, y: .25, phase: 4.1 },
  { x: .47, y: .88, phase: 1.4 },
  { x: .82, y: .84, phase: 5.3 }
];

const motes = Array.from({ length: 46 }, (_, index) => ({
  x: (index * 127.1 % 997) / 997,
  y: (index * 83.7 % 991) / 991,
  phase: index * .73,
  size: index % 8 === 0 ? 1.7 : .65
}));

function readVisits() {
  try {
    return JSON.parse(localStorage.getItem("house-room-visits") || "{}");
  } catch (error) {
    return {};
  }
}

const visits = readVisits();
rooms.forEach(room => {
  if (visits[room.dataset.room]) room.classList.add("visited");
});

const visitedCount = rooms.filter(room => room.classList.contains("visited")).length;
if (visitedCount === 1) houseStatus.textContent = "One room has left a trace.";
if (visitedCount === rooms.length) houseStatus.textContent = "Two rooms have left traces.";

function resize() {
  ratio = Math.min(devicePixelRatio || 1, 2);
  width = innerWidth;
  height = innerHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  if (reducedMotion) draw(0);
}

function roomCentre(room) {
  const rect = room.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    radius: Math.min(rect.width, rect.height) * .42
  };
}

function paintField(x, y, radius, colour, strength) {
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(${colour},${strength * .22})`);
  gradient.addColorStop(.42, `rgba(${colour},${strength * .075})`);
  gradient.addColorStop(1, `rgba(${colour},0)`);
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

function draw(time) {
  const movementTime = reducedMotion ? 0 : time;
  const conversation = roomCentre(document.querySelector(".room-conversation"));
  const colour = roomCentre(document.querySelector(".room-colour"));
  const energy = entered ? 1 : .34;
  pulse *= .965;

  context.clearRect(0, 0, width, height);
  context.save();
  context.globalCompositeOperation = "screen";

  paintField(
    conversation.x + Math.sin(movementTime * .00011) * 18,
    conversation.y + Math.cos(movementTime * .00009) * 13,
    conversation.radius * 1.45,
    "199,155,109",
    energy + (visits.conversation ? .24 : 0)
  );
  paintField(
    colour.x + Math.cos(movementTime * .0001) * 21,
    colour.y + Math.sin(movementTime * .00012) * 15,
    colour.radius * 1.5,
    "255,88,125",
    energy * .72 + (visits.colour ? .2 : 0)
  );
  paintField(
    colour.x - Math.sin(movementTime * .00008) * 19,
    colour.y - Math.cos(movementTime * .0001) * 17,
    colour.radius * 1.43,
    "50,132,255",
    energy * .68 + (visits.colour ? .2 : 0)
  );

  paintField(
    (conversation.x + colour.x) / 2,
    (conversation.y + colour.y) / 2,
    Math.min(width, height) * (.08 + pulse * .035),
    "216,255,79",
    (.08 + pulse * .09) * energy
  );

  for (const trace of unformed) {
    const x = width * trace.x + Math.sin(movementTime * .00009 + trace.phase) * 9;
    const y = height * trace.y + Math.cos(movementTime * .00008 + trace.phase) * 7;
    paintField(x, y, 26 + 8 * Math.sin(movementTime * .0001 + trace.phase), "222,217,204", .16 * energy);
  }

  context.fillStyle = `rgba(222,217,204,${.035 * energy})`;
  for (const mote of motes) {
    const x = mote.x * width + Math.sin(movementTime * .0001 + mote.phase) * (12 + pulse * 20);
    const y = mote.y * height + Math.cos(movementTime * .00008 + mote.phase) * (9 + pulse * 14);
    context.beginPath();
    context.arc(x, y, mote.size, 0, Math.PI * 2);
    context.fill();
  }

  if (pointer.visible) {
    paintField(pointer.x, pointer.y, 80 + pulse * 85, "216,255,79", .16 + pulse * .24);
  }

  context.restore();
  if (!reducedMotion) animationFrame = requestAnimationFrame(draw);
}

class ThresholdAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.filter = null;
    this.voices = [];
    this.muted = false;
  }

  async start() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      soundControl.hidden = true;
      return;
    }

    if (this.context) {
      await this.context.resume();
      this.fadeTo(this.muted ? .0001 : .72, 1.8);
      return;
    }

    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = .0001;
    this.master.connect(this.context.destination);

    this.filter = this.context.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 620;
    this.filter.Q.value = .45;
    this.filter.connect(this.master);

    const tones = [
      { frequency: 82.41, gain: .026, type: "sine", pan: -.38 },
      { frequency: 123.47, gain: .016, type: "sine", pan: .34 },
      { frequency: 164.81, gain: .009, type: "triangle", pan: .06 }
    ];

    for (const tone of tones) {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      const panner = this.context.createStereoPanner ? this.context.createStereoPanner() : null;
      oscillator.type = tone.type;
      oscillator.frequency.value = tone.frequency;
      gain.gain.value = tone.gain;
      if (panner) {
        panner.pan.value = tone.pan;
        oscillator.connect(gain).connect(panner).connect(this.filter);
      } else {
        oscillator.connect(gain).connect(this.filter);
      }
      oscillator.start();
      this.voices.push(oscillator);
    }

    const noiseBuffer = this.context.createBuffer(1, this.context.sampleRate * 3, this.context.sampleRate);
    const noise = noiseBuffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < noise.length; index++) {
      previous = previous * .985 + (Math.random() * 2 - 1) * .035;
      noise[index] = previous;
    }
    const noiseSource = this.context.createBufferSource();
    const noiseGain = this.context.createGain();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;
    noiseGain.gain.value = .012;
    noiseSource.connect(noiseGain).connect(this.filter);
    noiseSource.start();

    const lfo = this.context.createOscillator();
    const lfoDepth = this.context.createGain();
    lfo.frequency.value = .035;
    lfoDepth.gain.value = 4.5;
    lfo.connect(lfoDepth);
    this.voices.forEach(voice => lfoDepth.connect(voice.detune));
    lfo.start();

    await this.context.resume();
    this.fadeTo(this.muted ? .0001 : .72, 3.2);
  }

  fadeTo(value, duration) {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(.0001, this.master.gain.value), now);
    this.master.gain.exponentialRampToValueAtTime(Math.max(.0001, value), now + duration);
  }

  lean(roomName) {
    if (!this.context || !this.filter) return;
    const now = this.context.currentTime;
    const target = roomName === "colour" ? 940 : 480;
    this.filter.frequency.cancelScheduledValues(now);
    this.filter.frequency.setValueAtTime(this.filter.frequency.value, now);
    this.filter.frequency.exponentialRampToValueAtTime(target, now + 1.8);
  }

  toggle() {
    this.muted = !this.muted;
    this.fadeTo(this.muted ? .0001 : .72, 1.1);
    return this.muted;
  }

  fadeOut() {
    this.fadeTo(.0001, 1.05);
  }
}

const thresholdAudio = new ThresholdAudio();

async function crossThreshold() {
  entered = true;
  threshold.dataset.state = "house";
  pulse = .7;
  await thresholdAudio.start();
}

function chooseRoom(event) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button > 0) return;
  event.preventDefault();
  const destination = event.currentTarget.href;
  threshold.dataset.state = "leaving";
  thresholdAudio.fadeOut();
  window.setTimeout(() => window.location.assign(destination), reducedMotion ? 20 : 1150);
}

enter.addEventListener("click", crossThreshold);

soundControl.addEventListener("click", () => {
  const muted = thresholdAudio.toggle();
  soundControl.textContent = muted ? "listen" : "silence";
  soundControl.setAttribute("aria-pressed", String(muted));
});

rooms.forEach(room => {
  room.addEventListener("click", chooseRoom);
  room.addEventListener("pointerenter", () => thresholdAudio.lean(room.dataset.room));
  room.addEventListener("focus", () => thresholdAudio.lean(room.dataset.room));
});

document.querySelectorAll(".house-nav a").forEach(link => {
  link.addEventListener("click", chooseRoom);
});

addEventListener("pointermove", event => {
  pointer = { x: event.clientX, y: event.clientY, visible: true };
});

addEventListener("pointerdown", event => {
  pointer = { x: event.clientX, y: event.clientY, visible: true };
  pulse = Math.min(1, pulse + .34);
});

addEventListener("resize", resize);
document.addEventListener("visibilitychange", () => {
  if (!thresholdAudio.context) return;
  if (document.hidden) thresholdAudio.context.suspend();
  else if (entered && !thresholdAudio.muted) thresholdAudio.context.resume();
});

resize();
if (!reducedMotion) animationFrame = requestAnimationFrame(draw);
