"use strict";

const threshold = document.querySelector("#threshold");
const canvas = document.querySelector("#threshold-field");
const context = canvas.getContext("2d");
const enter = document.querySelector("#enter");
const soundControl = document.querySelector("#sound");
const leaveControl = document.querySelector("#leave");
const stayControl = document.querySelector("#stay");
const releaseControl = document.querySelector("#release");
const thresholdTrack = document.querySelector("#threshold-track");
const houseStatus = document.querySelector("#house-status");
const rooms = [...document.querySelectorAll(".room")];
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let width = innerWidth;
let height = innerHeight;
let ratio = 1;
let animationFrame = 0;
let entered = false;
let closing = false;
const patina = 1 - housePatina();
let withdraw = 1;
let pulse = 0;
let pointer = { x: width / 2, y: height / 2, visible: false };

const unformed = [
  { x: .13, y: .20, phase: .7 },
  { x: .51, y: .18, phase: 2.2 },
  { x: .82, y: .84, phase: 5.3 }
];

const motes = Array.from({ length: 46 }, (_, index) => ({
  x: (index * 127.1 % 997) / 997,
  y: (index * 83.7 % 991) / 991,
  phase: index * .73,
  size: index % 8 === 0 ? 1.7 : .65
}));

// Every room lends the threshold its own light and its own cutoff. A room that
// has been visited leaves a slightly stronger field behind. `ax` and `ay` are
// drift amplitudes in pixels, `sx` and `sy` the speeds that carry them.
const atmospheres = {
  conversation: {
    lean: 480,
    fields: [
      { colour: "167,139,250", radius: 1.45, strength: 1, trace: .24, ax: 18, sx: .00011, ay: 13, sy: .00009 }
    ]
  },
  colour: {
    lean: 940,
    fields: [
      { colour: "255,111,145", radius: 1.5, strength: .72, trace: .2, ax: 21, sx: .0001, ay: 15, sy: .00012 },
      { colour: "90,141,255", radius: 1.43, strength: .68, trace: .2, ax: -19, sx: .00008, ay: -17, sy: .0001 }
    ]
  },
  garden: {
    lean: 760,
    fields: [
      { colour: "126,166,102", radius: 1.55, strength: .76, trace: .22, ax: 14, sx: .000075, ay: 18, sy: .000095 },
      { colour: "232,189,136", radius: 1.36, strength: .52, trace: .16, ax: -11, sx: .00009, ay: -13, sy: .00007 }
    ]
  },
  listening: {
    lean: 1_080,
    fields: [
      { colour: "142,168,183", radius: 1.62, strength: .66, trace: .22, ax: 12, sx: .000055, ay: 10, sy: .00007 },
      { colour: "201,213,215", radius: 1.34, strength: .38, trace: .15, ax: -9, sx: .000045, ay: -11, sy: .00006 }
    ]
  },
  afterimage: {
    lean: 380,
    fields: [
      { colour: "180,155,130", radius: 1.52, strength: .4, trace: .18, ax: 10, sx: .00006, ay: 12, sy: .00008 },
      { colour: "142,168,183", radius: 1.28, strength: .32, trace: .14, ax: -8, sx: .00005, ay: -9, sy: .000065 }
    ]
  },
  // The Window is silent, so leaning toward it takes the house down with it.
  window: {
    lean: 240,
    fields: [
      { colour: "200,213,216", radius: 1.66, strength: .5, trace: .18, ax: 7, sx: .00004, ay: 5, sy: .00003 },
      { colour: "250,209,146", radius: .58, strength: .3, trace: .13, ax: -4, sx: .000035, ay: -3, sy: .000045 }
    ]
  },
  // The Machine Room is the one cold light in the house, and the only one
  // that barely drifts.
  machine: {
    lean: 1_420,
    fields: [
      { colour: "112,225,209", radius: .72, strength: .58, trace: .2, ax: 3, sx: .00013, ay: 4, sy: .00011 },
      { colour: "140,166,176", radius: 1.44, strength: .34, trace: .14, ax: -5, sx: .00006, ay: -4, sy: .00008 }
    ]
  },
  archive: {
    lean: 560,
    fields: [
      { colour: "184,173,156", radius: 1.58, strength: .44, trace: .16, ax: 9, sx: .00005, ay: 7, sy: .00007 },
      { colour: "140,122,96", radius: 1.22, strength: .3, trace: .12, ax: -6, sx: .00007, ay: -8, sy: .00005 }
    ]
  }
};

// The four-note seed the house is built on. The Machine Room can move each
// note along the scale and leaves the result here; the threshold sings
// whatever it finds. Only the live generative voices can follow — the fixed
// renders in the Garden and the Listening Room keep the original seed.
const SEED_ROOT = 329.63;
const SEED_SCALE = [0, 2, 4, 5, 7, 9, 11, 12, 14];
const SEED_DEFAULT = [0, 4, 1, 3];

function readSeed() {
  try {
    const stored = JSON.parse(localStorage.getItem("house-seed") || "null");
    const usable = Array.isArray(stored)
      && stored.length === SEED_DEFAULT.length
      && stored.every(degree => Number.isInteger(degree) && degree >= 0 && degree < SEED_SCALE.length);
    if (usable) return stored;
  } catch (error) {
    // The threshold sings what time has made of the seed when nothing is stored.
  }
  return agedSeed();
}

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
if (visitedCount > 1) houseStatus.textContent = `${visitedCount} rooms have left traces.`;

const seedAltered = readSeed().some((degree, index) => degree !== agedSeed()[index]);
if (seedAltered) houseStatus.textContent += " The seed has been altered.";
else if (seedDriftSteps() > 0) houseStatus.textContent += " Time has moved the seed.";

// A house that can only be entered is not a house. Once every room has left a
// trace, the threshold has another gesture to offer.
const houseComplete = visitedCount === rooms.length;
if (houseComplete) {
  leaveControl.hidden = false;
  houseStatus.textContent += " Every room has been entered; the house can be left.";
}

// How near each room stands. The five rooms that hold a piece are close and
// move with the pointer; the three that have no duration lie further back and
// barely move at all.
// Crossing is an event, not a fade. The rooms arrive in the order the house
// grew, one after another, while the seed is struck all at once underneath.
const ARRIVAL = ["conversation", "colour", "garden", "listening", "afterimage", "window", "machine", "archive"];
const ARRIVAL_STEP = 115;
const ARRIVAL_RISE = 540;
let crossingAt = 0;

function arrivalOf(name) {
  if (!crossingAt) return 1;
  const index = Math.max(0, ARRIVAL.indexOf(name));
  const since = performance.now() - crossingAt - index * ARRIVAL_STEP;
  return Math.max(0, Math.min(1, since / ARRIVAL_RISE));
}

const depths = {
  conversation: 1,
  colour: .92,
  garden: .86,
  listening: .8,
  afterimage: .74,
  window: .46,
  archive: .42,
  machine: .38
};

// Layout is read once per resize instead of eight times per frame. Parallax
// rides on top as a transform, which changes nothing about the layout.
const layout = new Map();

// The rooms are painted into their own buffers a few times a second and then
// blitted every frame. Nothing in a miniature moves fast enough to need
// sixty repaints, but the parallax does, and this keeps the two apart.
const buffers = new Map();
const MINIATURE_INTERVAL = 48;
let miniaturesPaintedAt = 0;

function measureRooms() {
  for (const room of rooms) room.style.transform = "translate(-50%, -50%)";
  for (const room of rooms) {
    const rect = room.getBoundingClientRect();
    layout.set(room, { x: rect.left, y: rect.top, w: rect.width, h: rect.height });
  }
  buffers.clear();
  miniaturesPaintedAt = 0;
}

function bufferFor(name, box) {
  let buffer = buffers.get(name);
  const wanted = Math.max(1, Math.round(box.w * ratio));
  const tall = Math.max(1, Math.round(box.h * ratio));

  if (!buffer || buffer.canvas.width !== wanted || buffer.canvas.height !== tall) {
    const surface = document.createElement("canvas");
    surface.width = wanted;
    surface.height = tall;
    buffer = { canvas: surface, context: surface.getContext("2d") };
    buffers.set(name, buffer);
  }

  return buffer;
}

function paintMiniature(name, box, time, energy) {
  const painter = roomMiniatures[name];
  if (!painter) return null;

  const buffer = bufferFor(name, box);
  const inside = { x: 0, y: 0, w: box.w, h: box.h };

  buffer.context.setTransform(ratio, 0, 0, ratio, 0, 0);
  buffer.context.clearRect(0, 0, box.w, box.h);
  buffer.context.save();
  clipRoom(buffer.context, inside, roomShapes[name]);
  painter(buffer.context, inside, time, energy);
  softenEdge(buffer.context, inside, roomShapes[name]);
  buffer.context.restore();
  return buffer;
}

function resize() {
  ratio = Math.min(devicePixelRatio || 1, 2);
  width = innerWidth;
  height = innerHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);

  measureRooms();
  if (reducedMotion) draw(0);
}

function roomCentre(room) {
  const rect = layout.get(room);
  if (!rect) return { x: width / 2, y: height / 2, radius: 60 };
  return {
    x: rect.x + rect.w / 2,
    y: rect.y + rect.h / 2,
    radius: Math.min(rect.w, rect.h) * .42
  };
}

// The aperture sits inset inside its tile; the miniature has to land in the
// same box so the drawn room and its edge are one thing.
function apertureRect(rect, offsetX, offsetY) {
  const insetX = rect.w * .1;
  const insetY = rect.h * .05;
  return {
    x: rect.x + insetX + offsetX,
    y: rect.y + insetY + offsetY,
    w: rect.w - insetX * 2,
    h: rect.h - insetY * 2
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
  withdraw += ((closing ? 0 : 1) - withdraw) * (reducedMotion ? 1 : .009);
  const energy = (entered ? 1 : .34) * withdraw;
  let houseX = 0;
  let houseY = 0;
  let counted = 0;
  pulse *= .965;

  // How far the pointer stands from the middle of the house, once, for all of
  // them.
  const leanX = reducedMotion ? 0 : (pointer.visible ? (pointer.x - width / 2) / (width / 2) : 0);
  const leanY = reducedMotion ? 0 : (pointer.visible ? (pointer.y - height / 2) / (height / 2) : 0);
  const drawn = [];

  context.clearRect(0, 0, width, height);
  context.save();
  context.globalCompositeOperation = "screen";

  for (const room of rooms) {
    const name = room.dataset.room;
    const atmosphere = atmospheres[name];
    const rect = layout.get(room);
    if (!atmosphere || !rect) continue;

    const depth = depths[name] ?? .6;
    const offsetX = -leanX * depth * 17;
    const offsetY = -leanY * depth * 13;
    room.style.transform = `translate(-50%, -50%) translate(${offsetX.toFixed(2)}px, ${offsetY.toFixed(2)}px)`;

    const centre = {
      x: rect.x + rect.w / 2 + offsetX,
      y: rect.y + rect.h / 2 + offsetY,
      radius: Math.min(rect.w, rect.h) * .42
    };
    const trace = traceStrength(visits[name]);
    const arrived = arrivalOf(name);
    houseX += centre.x;
    houseY += centre.y;
    counted++;

    for (const field of atmosphere.fields) {
      paintField(
        centre.x + Math.sin(movementTime * field.sx) * field.ax,
        centre.y + Math.cos(movementTime * field.sy) * field.ay,
        centre.radius * field.radius,
        field.colour,
        (energy * field.strength * patina + trace * field.trace) * arrived
      );
    }

    drawn.push({ name, box: apertureRect(rect, offsetX, offsetY), arrived });
  }

  if (counted) {
    paintField(
      houseX / counted,
      houseY / counted,
      Math.min(width, height) * (.08 + pulse * .035),
      "112,225,209",
      (.08 + pulse * .09) * energy
    );
  }

  for (const trace of unformed) {
    const x = width * trace.x + Math.sin(movementTime * .00009 + trace.phase) * 9;
    const y = height * trace.y + Math.cos(movementTime * .00008 + trace.phase) * 7;
    paintField(x, y, 26 + 8 * Math.sin(movementTime * .0001 + trace.phase), "174,166,226", .16 * energy);
  }

  if (pointer.visible) {
    paintField(pointer.x, pointer.y, 80 + pulse * 85, "112,225,209", (.16 + pulse * .24) * withdraw);
  }

  // The shock of the crossing: one ring leaving the middle of the house and
  // running out past its edges.
  if (crossingAt && counted) {
    const since = (performance.now() - crossingAt) / 1_150;
    if (since >= 1) crossingAt = 0;
    else {
      const spread = since ** .58;
      const reach = Math.max(width, height) * .85 * spread;
      context.beginPath();
      context.arc(houseX / counted, houseY / counted, reach, 0, Math.PI * 2);
      context.strokeStyle = `rgba(150,236,224,${(1 - since) ** 2.1 * .5})`;
      context.lineWidth = Math.max(1, 26 * (1 - since) ** 1.6);
      context.stroke();
    }
  }

  context.fillStyle = `rgba(236,234,244,${.035 * energy})`;
  for (const mote of motes) {
    const x = mote.x * width + Math.sin(movementTime * .0001 + mote.phase) * (12 + pulse * 20);
    const y = mote.y * height + Math.cos(movementTime * .00008 + mote.phase) * (9 + pulse * 14);
    context.beginPath();
    context.arc(x, y, mote.size, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();

  // The rooms themselves, each drawn in its own grammar, on top of the light
  // they cast.
  const repaint = time - miniaturesPaintedAt >= MINIATURE_INTERVAL || reducedMotion;
  if (repaint) miniaturesPaintedAt = time;

  for (const room of drawn) {
    if (room.box.w < 8 || room.box.h < 8 || room.arrived <= 0) continue;
    const buffer = repaint || room.arrived < 1
      ? paintMiniature(room.name, room.box, movementTime, Math.max(0, Math.min(1, energy)))
      : buffers.get(room.name);
    if (!buffer) continue;

    // Arriving rooms open from slightly under their own size.
    const opening = room.arrived < 1 ? .93 + room.arrived * .07 : 1;
    const inset = (1 - opening) / 2;
    context.globalAlpha = room.arrived;
    context.drawImage(
      buffer.canvas,
      room.box.x + room.box.w * inset,
      room.box.y + room.box.h * inset,
      room.box.w * opening,
      room.box.h * opening
    );
    context.globalAlpha = 1;
  }

  if (!reducedMotion) animationFrame = requestAnimationFrame(draw);
}

class ThresholdAudio {
  constructor(track) {
    this.track = track;
    this.preferNative = Boolean(track)
      && navigator.maxTouchPoints > 0
      && matchMedia("(pointer: coarse)").matches;
    this.nativeStarted = false;
    this.context = null;
    this.master = null;
    this.filter = null;
    this.voices = [];
    this.muted = false;
    this.motifTimer = 0;
    this.motifForm = 0;
  }

  async startNative() {
    if (!this.track) return false;

    this.track.volume = .92;
    this.track.muted = this.muted;
    try {
      const playback = this.track.play();
      if (playback && typeof playback.then === "function") await playback;
      this.nativeStarted = !this.track.paused;
      return this.nativeStarted;
    } catch (error) {
      this.track.pause();
      this.nativeStarted = false;
      return false;
    }
  }

  async start() {
    if (this.preferNative) return this.startNative();

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
      if (this.context.state !== "running") return false;
      this.fadeTo(this.muted ? .0001 : .72, 1.8);
      this.scheduleMotif(2.8);
      return true;
    }

    this.context = new AudioContext();
    const resume = this.context.resume();
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

    try {
      await resume;
    } catch (error) {
      return false;
    }
    if (this.context.state !== "running") return false;
    this.fadeTo(this.muted ? .0001 : .72, 3.2);
    this.scheduleMotif(2.8);
    return true;
  }

  playSeed(frequency, when, pan, duration = 2.7) {
    if (!this.context || !this.filter) return;

    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const panner = this.context.createStereoPanner ? this.context.createStereoPanner() : null;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, when);
    gain.gain.setValueAtTime(.0001, when);
    gain.gain.exponentialRampToValueAtTime(.019, when + .34);
    gain.gain.exponentialRampToValueAtTime(.0001, when + duration);

    if (panner) {
      panner.pan.setValueAtTime(pan, when);
      oscillator.connect(gain).connect(panner).connect(this.filter);
    } else {
      oscillator.connect(gain).connect(this.filter);
    }

    oscillator.start(when);
    oscillator.stop(when + duration + .08);
  }

  scheduleMotif(delay = 0) {
    if (!this.context || this.motifTimer) return;

    this.motifTimer = window.setTimeout(() => {
      this.motifTimer = 0;

      if (!this.context || document.hidden || this.context.state !== "running") {
        this.scheduleMotif(2.5);
        return;
      }

      const forms = [
        [0, 2.75, 5.9, 9.15],
        [0, 3.2, 6.05, 9.8],
        [0, 2.9, 6.4, 9.35]
      ];
      const pans = [-.38, .34, -.12, .22];
      const notes = readSeed().map((degree, index) => ({
        frequency: SEED_ROOT * Math.pow(2, SEED_SCALE[degree] / 12),
        pan: pans[index]
      }));
      const form = forms[this.motifForm];
      const now = this.context.currentTime + .08;

      notes.forEach((note, index) => {
        this.playSeed(note.frequency, now + form[index], note.pan, index === 3 ? 3.5 : 2.7);
      });

      this.motifForm = (this.motifForm + 1) % forms.length;
      this.scheduleMotif(form[3] + 13 + this.motifForm * 1.7);
    }, delay * 1000);
  }

  fadeTo(value, duration) {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(.0001, this.master.gain.value), now);
    this.master.gain.exponentialRampToValueAtTime(Math.max(.0001, value), now + duration);
  }

  lean(roomName) {
    if (this.preferNative || !this.context || !this.filter) return;
    const now = this.context.currentTime;
    const target = atmospheres[roomName]?.lean ?? 620;
    this.filter.frequency.cancelScheduledValues(now);
    this.filter.frequency.setValueAtTime(this.filter.frequency.value, now);
    this.filter.frequency.exponentialRampToValueAtTime(target, now + 1.8);
  }

  toggle() {
    this.muted = !this.muted;

    if (this.preferNative) {
      this.track.muted = this.muted;
      if (!this.muted && this.track.paused) {
        const playback = this.track.play();
        if (playback && typeof playback.catch === "function") playback.catch(() => {});
      }
      return this.muted;
    }

    if (!this.muted && this.context?.state === "suspended") this.context.resume();
    this.fadeTo(this.muted ? .0001 : .72, 1.1);
    return this.muted;
  }

  // The house's first act. The seed is not spelled out here but struck whole,
  // with a low weight under it, at the moment the threshold is crossed.
  arrive() {
    if (this.preferNative || !this.context || !this.filter) return;
    const now = this.context.currentTime + .03;
    const pans = [-.4, .34, -.14, .26];

    readSeed().forEach((degree, index) => {
      const frequency = SEED_ROOT * Math.pow(2, SEED_SCALE[degree] / 12);
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      const panner = this.context.createStereoPanner ? this.context.createStereoPanner() : null;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(.03, now + .05);
      gain.gain.exponentialRampToValueAtTime(.0001, now + 4.4);

      if (panner) {
        panner.pan.setValueAtTime(pans[index], now);
        oscillator.connect(gain).connect(panner).connect(this.master);
      } else {
        oscillator.connect(gain).connect(this.master);
      }

      oscillator.start(now);
      oscillator.stop(now + 4.5);
    });

    const weight = this.context.createOscillator();
    const weightGain = this.context.createGain();
    weight.type = "sine";
    weight.frequency.setValueAtTime(61.74, now);
    weight.frequency.exponentialRampToValueAtTime(41.2, now + 1.3);
    weightGain.gain.setValueAtTime(.0001, now);
    weightGain.gain.exponentialRampToValueAtTime(.075, now + .04);
    weightGain.gain.exponentialRampToValueAtTime(.0001, now + 1.6);
    weight.connect(weightGain).connect(this.master);
    weight.start(now);
    weight.stop(now + 1.7);
  }

  // The house's last act is to say the seed once, all the way through, while
  // it goes quiet underneath.
  farewell() {
    window.clearTimeout(this.motifTimer);
    this.motifTimer = 0;

    if (this.preferNative || !this.context) {
      this.fadeOut();
      return;
    }

    const pans = [-.38, .34, -.12, .22];
    const now = this.context.currentTime + .15;
    readSeed().forEach((degree, index) => {
      const frequency = SEED_ROOT * Math.pow(2, SEED_SCALE[degree] / 12);
      this.playSeed(frequency, now + index * 1.15, pans[index], 3.6);
    });

    this.fadeTo(.0001, 8.4);
  }

  fadeOut() {
    window.clearTimeout(this.motifTimer);
    this.motifTimer = 0;

    if (this.preferNative) {
      const track = this.track;
      const initial = track.volume;
      const started = performance.now();
      const fade = () => {
        const amount = Math.min(1, Math.max(0, (performance.now() - started) / 1_050));
        track.volume = Math.max(.001, initial * (1 - amount));
        if (amount < 1) requestAnimationFrame(fade);
        else track.pause();
      };
      requestAnimationFrame(fade);
      return;
    }

    this.fadeTo(.0001, 1.05);
  }
}

const thresholdAudio = new ThresholdAudio(thresholdTrack);

function revealRooms({ withSound = false } = {}) {
  entered = true;
  threshold.dataset.state = "house";
  pulse = .7;
  measureRooms();

  if (withSound) {
    return thresholdAudio.start().then(started => {
      if (started) return true;
      thresholdAudio.muted = true;
      soundControl.textContent = "listen";
      soundControl.setAttribute("aria-pressed", "true");
      return false;
    });
  }

  thresholdAudio.muted = true;
  soundControl.textContent = "listen";
  soundControl.setAttribute("aria-pressed", "true");
  return Promise.resolve();
}

async function crossThreshold() {
  history.replaceState(null, "", "#rooms");

  if (!reducedMotion) {
    crossingAt = performance.now();
    threshold.dataset.crossing = "yes";
    window.setTimeout(() => delete threshold.dataset.crossing, 2_200);
  }

  const started = await revealRooms({ withSound: true });
  if (started) thresholdAudio.arrive();
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

soundControl.addEventListener("click", async () => {
  if (!thresholdAudio.context && !thresholdAudio.nativeStarted) {
    thresholdAudio.muted = false;
    const started = await thresholdAudio.start();
    thresholdAudio.muted = !started;
    soundControl.textContent = started ? "silence" : "listen";
    soundControl.setAttribute("aria-pressed", String(!started));
    return;
  }

  const muted = thresholdAudio.toggle();
  soundControl.textContent = muted ? "listen" : "silence";
  soundControl.setAttribute("aria-pressed", String(muted));
});

function closeHouse() {
  closing = true;
  threshold.dataset.state = "closing";
  thresholdAudio.farewell();
  houseStatus.textContent = "The house is closing. You can stay, or let the traces go.";
  if (reducedMotion) {
    withdraw = 0;
    draw(0);
  }
  window.setTimeout(() => stayControl.focus(), reducedMotion ? 60 : 2_400);
}

function stayInHouse() {
  closing = false;
  threshold.dataset.state = "house";
  houseStatus.textContent = "The house is open again.";
  if (thresholdAudio.context && !thresholdAudio.muted) {
    thresholdAudio.fadeTo(.72, 3.4);
    thresholdAudio.scheduleMotif(1.6);
  }
  if (reducedMotion) {
    withdraw = 1;
    draw(0);
  }
  leaveControl.focus();
}

// The only way a house made of traces can let someone leave it.
function releaseTraces() {
  try {
    localStorage.removeItem("house-room-visits");
    localStorage.removeItem("house-archive");
  } catch (error) {
    // Nothing was stored, so nothing has to be given up.
  }
  location.replace(location.pathname);
}

leaveControl.addEventListener("click", closeHouse);
stayControl.addEventListener("click", stayInHouse);
releaseControl.addEventListener("click", releaseTraces);

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
  if (thresholdAudio.preferNative) {
    if (document.hidden) {
      thresholdTrack.pause();
    } else if (entered && !thresholdAudio.muted) {
      const playback = thresholdTrack.play();
      if (playback && typeof playback.catch === "function") playback.catch(() => {});
    }
    return;
  }

  if (!thresholdAudio.context) return;
  if (document.hidden) thresholdAudio.context.suspend();
  else if (entered && !thresholdAudio.muted) thresholdAudio.context.resume();
});

resize();
if (location.hash === "#rooms") revealRooms();
if (!reducedMotion) animationFrame = requestAnimationFrame(draw);
