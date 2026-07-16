"use strict";

const threshold = document.querySelector("#threshold");
const canvas = document.querySelector("#threshold-field");
const context = canvas.getContext("2d");
const enter = document.querySelector("#enter");
const soundControl = document.querySelector("#sound");
const thresholdTrack = document.querySelector("#threshold-track");
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
  { x: .42, y: .16, phase: .7 },
  { x: .75, y: .86, phase: 2.2 }
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
if (visitedCount > 1) houseStatus.textContent = `${visitedCount} rooms have left traces.`;

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
  const garden = roomCentre(document.querySelector(".room-garden"));
  const listening = roomCentre(document.querySelector(".room-listening"));
  const windowRoom = roomCentre(document.querySelector(".room-window"));
  const energy = entered ? 1 : .34;
  pulse *= .965;

  context.clearRect(0, 0, width, height);
  context.save();
  context.globalCompositeOperation = "screen";

  paintField(
    conversation.x + Math.sin(movementTime * .00011) * 18,
    conversation.y + Math.cos(movementTime * .00009) * 13,
    conversation.radius * 1.45,
    "167,139,250",
    energy + (visits.conversation ? .24 : 0)
  );
  paintField(
    colour.x + Math.cos(movementTime * .0001) * 21,
    colour.y + Math.sin(movementTime * .00012) * 15,
    colour.radius * 1.5,
    "255,111,145",
    energy * .72 + (visits.colour ? .2 : 0)
  );
  paintField(
    colour.x - Math.sin(movementTime * .00008) * 19,
    colour.y - Math.cos(movementTime * .0001) * 17,
    colour.radius * 1.43,
    "90,141,255",
    energy * .68 + (visits.colour ? .2 : 0)
  );
  paintField(
    garden.x + Math.sin(movementTime * .000075) * 14,
    garden.y + Math.cos(movementTime * .000095) * 18,
    garden.radius * 1.55,
    "126,166,102",
    energy * .76 + (visits.garden ? .22 : 0)
  );
  paintField(
    garden.x - Math.cos(movementTime * .00009) * 11,
    garden.y - Math.sin(movementTime * .00007) * 13,
    garden.radius * 1.36,
    "232,189,136",
    energy * .52 + (visits.garden ? .16 : 0)
  );
  paintField(
    listening.x + Math.sin(movementTime * .000055) * 12,
    listening.y + Math.cos(movementTime * .00007) * 10,
    listening.radius * 1.62,
    "142,168,183",
    energy * .66 + (visits.listening ? .22 : 0)
  );
  paintField(
    listening.x - Math.cos(movementTime * .000045) * 9,
    listening.y - Math.sin(movementTime * .00006) * 11,
    listening.radius * 1.34,
    "201,213,215",
    energy * .38 + (visits.listening ? .15 : 0)
  );
  paintField(
    windowRoom.x + Math.sin(movementTime * .000035) * 8,
    windowRoom.y + Math.cos(movementTime * .000042) * 7,
    windowRoom.radius * 1.58,
    "116,151,176",
    energy * .54 + (visits.window ? .2 : 0)
  );
  paintField(
    windowRoom.x - Math.cos(movementTime * .00003) * 6,
    windowRoom.y - Math.sin(movementTime * .000038) * 7,
    windowRoom.radius * 1.3,
    "209,178,156",
    energy * .32 + (visits.window ? .14 : 0)
  );

  paintField(
    (conversation.x + colour.x + garden.x + listening.x + windowRoom.x) / 5,
    (conversation.y + colour.y + garden.y + listening.y + windowRoom.y) / 5,
    Math.min(width, height) * (.08 + pulse * .035),
    "112,225,209",
    (.08 + pulse * .09) * energy
  );

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
    paintField(pointer.x, pointer.y, 80 + pulse * 85, "112,225,209", .16 + pulse * .24);
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
      const notes = [
        { frequency: 329.63, pan: -.38 },
        { frequency: 493.88, pan: .34 },
        { frequency: 369.99, pan: -.12 },
        { frequency: 440, pan: .22 }
      ];
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
    const target = roomName === "colour"
      ? 940
      : roomName === "garden"
        ? 760
        : roomName === "listening"
          ? 1_080
          : roomName === "window"
            ? 1_260
          : 480;
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
