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
    // The threshold sings the house's own seed when nothing is stored.
  }
  return SEED_DEFAULT;
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

const seedAltered = readSeed().some((degree, index) => degree !== SEED_DEFAULT[index]);
if (seedAltered) houseStatus.textContent += " The seed has been altered.";

// A house that can only be entered is not a house. Once every room has left a
// trace, the threshold has another gesture to offer.
const houseComplete = visitedCount === rooms.length;
if (houseComplete) {
  leaveControl.hidden = false;
  houseStatus.textContent += " Every room has been entered; the house can be left.";
}

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
  withdraw += ((closing ? 0 : 1) - withdraw) * (reducedMotion ? 1 : .009);
  const energy = (entered ? 1 : .34) * withdraw;
  let houseX = 0;
  let houseY = 0;
  let counted = 0;
  pulse *= .965;

  context.clearRect(0, 0, width, height);
  context.save();
  context.globalCompositeOperation = "screen";

  for (const room of rooms) {
    const atmosphere = atmospheres[room.dataset.room];
    if (!atmosphere) continue;

    const centre = roomCentre(room);
    const trace = visits[room.dataset.room] ? 1 : 0;
    houseX += centre.x;
    houseY += centre.y;
    counted++;

    for (const field of atmosphere.fields) {
      paintField(
        centre.x + Math.sin(movementTime * field.sx) * field.ax,
        centre.y + Math.cos(movementTime * field.sy) * field.ay,
        centre.radius * field.radius,
        field.colour,
        energy * field.strength + trace * field.trace
      );
    }
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

  context.fillStyle = `rgba(236,234,244,${.035 * energy})`;
  for (const mote of motes) {
    const x = mote.x * width + Math.sin(movementTime * .0001 + mote.phase) * (12 + pulse * 20);
    const y = mote.y * height + Math.cos(movementTime * .00008 + mote.phase) * (9 + pulse * 14);
    context.beginPath();
    context.arc(x, y, mote.size, 0, Math.PI * 2);
    context.fill();
  }

  if (pointer.visible) {
    paintField(pointer.x, pointer.y, 80 + pulse * 85, "112,225,209", (.16 + pulse * .24) * withdraw);
  }

  context.restore();
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
  await revealRooms({ withSound: true });
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
