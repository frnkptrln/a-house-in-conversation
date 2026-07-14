"use strict";

const room = document.querySelector("#room");
const canvas = document.querySelector("#listening-field");
const fieldContext = canvas.getContext("2d");
const enter = document.querySelector("#enter");
const again = document.querySelector("#again");
const listeningTrack = document.querySelector("#listening-track");
const soundFallback = document.querySelector("#sound-fallback");
const listeningStatus = document.querySelector("#listening-status");

const ENDING_AT = 202000;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let width = innerWidth;
let height = innerHeight;
let ratio = 1;
let animationFrame = 0;
let startTime = 0;
let running = false;
let endingShown = false;
let activity = 0;
let activityImpulse = 0;
let stillness = 0;
let quietSince = 0;
let statusState = "near";
let lastPoint = null;
let position = { x: .5, y: .52 };

const particles = Array.from({ length: 64 }, (_, index) => ({
  x: (index * 127.1 % 991) / 991,
  y: (index * 79.7 % 983) / 983,
  phase: index * .79,
  size: index % 11 === 0 ? 1.7 : .62
}));

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(minimum, maximum, value) {
  const amount = clamp((value - minimum) / (maximum - minimum));
  return amount * amount * (3 - 2 * amount);
}

function rememberVisit() {
  try {
    const visits = JSON.parse(localStorage.getItem("house-room-visits") || "{}");
    visits.listening = Date.now();
    localStorage.setItem("house-room-visits", JSON.stringify(visits));
  } catch (error) {
    // Listening does not depend on storage being available.
  }
}

class ListeningAudio {
  constructor(track) {
    this.track = track;
    this.context = null;
    this.master = null;
    this.nearGain = null;
    this.depthGain = null;
    this.nearFilter = null;
    this.depthFilter = null;
    this.nearPan = null;
    this.depthPan = null;
    this.webAudio = false;
    this.playing = false;
    this.lastUpdate = 0;
    this.stopTimer = 0;
    this.directPlayback = new URLSearchParams(location.search).has("direct")
      || /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  setup() {
    if (this.context || this.directPlayback) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = .0001;

    const compressor = this.context.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 12;
    compressor.ratio.value = 2.1;
    compressor.attack.value = .045;
    compressor.release.value = .62;
    this.master.connect(compressor).connect(this.context.destination);

    this.nearGain = this.context.createGain();
    this.depthGain = this.context.createGain();
    this.nearGain.gain.value = .562;
    this.depthGain.gain.value = .022;

    this.nearFilter = this.context.createBiquadFilter();
    this.depthFilter = this.context.createBiquadFilter();
    this.nearFilter.type = "lowpass";
    this.depthFilter.type = "lowpass";
    this.nearFilter.frequency.value = 6_400;
    this.depthFilter.frequency.value = 3_100;
    this.nearFilter.Q.value = .38;
    this.depthFilter.Q.value = .3;

    const source = this.context.createMediaElementSource(this.track);
    const splitter = this.context.createChannelSplitter(2);
    const nearSum = this.context.createGain();
    const depthSum = this.context.createGain();

    const connectMatrix = (channel, target, amount) => {
      const coefficient = this.context.createGain();
      coefficient.gain.value = amount;
      splitter.connect(coefficient, channel, 0);
      coefficient.connect(target);
    };

    source.connect(splitter);
    connectMatrix(0, nearSum, 1.5);
    connectMatrix(1, nearSum, -.5);
    connectMatrix(0, depthSum, -.5);
    connectMatrix(1, depthSum, 1.5);

    this.nearPan = this.context.createStereoPanner ? this.context.createStereoPanner() : null;
    this.depthPan = this.context.createStereoPanner ? this.context.createStereoPanner() : null;

    if (this.nearPan) {
      nearSum.connect(this.nearFilter).connect(this.nearPan).connect(this.nearGain).connect(this.master);
      depthSum.connect(this.depthFilter).connect(this.depthPan).connect(this.depthGain).connect(this.master);
    } else {
      nearSum.connect(this.nearFilter).connect(this.nearGain).connect(this.master);
      depthSum.connect(this.depthFilter).connect(this.depthGain).connect(this.master);
    }
    this.webAudio = true;
  }

  async start() {
    window.clearTimeout(this.stopTimer);
    this.stopTimer = 0;
    this.setup();

    this.track.pause();
    this.track.currentTime = 0;
    this.track.volume = 1;
    this.track.muted = false;

    if (this.webAudio) {
      const now = this.context.currentTime;
      this.nearGain.gain.cancelScheduledValues(now);
      this.depthGain.gain.cancelScheduledValues(now);
      this.master.gain.cancelScheduledValues(now);
      this.nearGain.gain.setValueAtTime(.562, now);
      this.depthGain.gain.setValueAtTime(.022, now);
      this.master.gain.setValueAtTime(.0001, now);
      this.master.gain.exponentialRampToValueAtTime(1.18, now + 4.2);
    }

    const play = this.track.play();
    const resume = this.context?.state === "suspended"
      ? this.context.resume()
      : Promise.resolve();
    try {
      await Promise.all([play, resume]);
      if (this.context && this.context.state !== "running") throw new Error("Audio context stayed suspended");
      this.playing = true;
      room.dataset.audio = this.webAudio ? "spatial" : "direct";
      soundFallback.hidden = true;
      return true;
    } catch (error) {
      this.track.pause();
      this.playing = false;
      room.dataset.audio = "waiting";
      soundFallback.hidden = false;
      return false;
    }
  }

  update(now, quiet, movement, place) {
    if (!this.playing) return;

    if (!this.webAudio) return;

    if (now - this.lastUpdate > 170) {
      this.lastUpdate = now;
      const audioNow = this.context.currentTime;
      const nearLevel = .5 + movement * .1 - quiet * .05;
      const depthLevel = .0175 + quiet ** 1.62 * .588;
      const nearCutoff = 1_900 + place.y * 6_900 + movement * 1_000;
      const depthCutoff = 2_200 + quiet * 6_200 + (1 - place.y) * 700;
      const pan = (place.x - .5) * 1.12;

      this.nearGain.gain.setTargetAtTime(nearLevel, audioNow, .62);
      this.depthGain.gain.setTargetAtTime(depthLevel, audioNow, 2.7);
      this.nearFilter.frequency.setTargetAtTime(nearCutoff, audioNow, 1.4);
      this.depthFilter.frequency.setTargetAtTime(depthCutoff, audioNow, 2.2);
      if (this.nearPan) {
        this.nearPan.pan.setTargetAtTime(pan, audioNow, .8);
        this.depthPan.pan.setTargetAtTime(-pan * .42, audioNow, 2.1);
      }
    }

  }

  fadeOut(duration = 4) {
    if (this.webAudio && this.context) {
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(Math.max(.0001, this.master.gain.value), now);
      this.master.gain.exponentialRampToValueAtTime(.0001, now + duration);
    }
    this.stopTimer = window.setTimeout(() => {
      this.track.pause();
      this.playing = false;
    }, duration * 1_000 + 120);
  }

  pause() {
    this.track.pause();
    if (this.context?.state === "running") this.context.suspend();
  }

  resume() {
    if (!this.playing || !running) return;
    if (this.context?.state === "suspended") this.context.resume();
    this.track.play().catch(() => { soundFallback.hidden = false; });
  }

  get currentTime() {
    return this.track.currentTime || 0;
  }
}

const listeningAudio = new ListeningAudio(listeningTrack);

function resize() {
  ratio = Math.min(devicePixelRatio || 1, 2);
  width = innerWidth;
  height = innerHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  fieldContext.setTransform(ratio, 0, 0, ratio, 0, 0);
  if (!running) drawField(0);
}

function registerInput(clientX, clientY, force = .12) {
  if (!running) return;
  const next = {
    x: clamp(clientX / Math.max(1, width)),
    y: clamp(clientY / Math.max(1, height))
  };
  const distance = lastPoint
    ? Math.hypot(next.x - lastPoint.x, next.y - lastPoint.y)
    : force;

  position = next;
  lastPoint = next;
  if (distance < .0025 && force < .4) return;
  activityImpulse = Math.max(activityImpulse, clamp(force + distance * 9));
  quietSince = performance.now();
}

function updateListeningState(now) {
  const quietFor = Math.max(0, now - quietSince);
  const movementTarget = quietFor < 1_500
    ? activityImpulse * (1 - quietFor / 1_500)
    : 0;
  const activityRate = movementTarget > activity ? .16 : .025;
  activity += (movementTarget - activity) * activityRate;
  activityImpulse *= .986;

  const stillTarget = smoothstep(3_800, 24_000, quietFor) * (1 - activity * .48);
  const stillRate = stillTarget > stillness ? .018 : .08;
  stillness += (stillTarget - stillness) * stillRate;
  stillness = clamp(stillness);

  let nextStatus = "near";
  if (stillness > .72) nextStatus = "deep";
  else if (stillness > .28) nextStatus = "opening";
  if (nextStatus !== statusState) {
    statusState = nextStatus;
    room.dataset.listening = nextStatus;
    listeningStatus.textContent = nextStatus === "deep"
      ? "Distant voices are present."
      : nextStatus === "opening"
        ? "The room is opening."
        : "The room is near.";
  }
}

function drawField(time) {
  const movementTime = reducedMotion ? 0 : time;
  const openness = .12 + stillness * .88;
  const horizon = height * (.48 + (position.y - .5) * .1);

  const background = fieldContext.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, `rgb(${8 + openness * 5} ${15 + openness * 7} ${21 + openness * 11})`);
  background.addColorStop(.58, `rgb(${10 + openness * 8} ${18 + openness * 10} ${27 + openness * 14})`);
  background.addColorStop(1, `rgb(${17 + activity * 6} ${17 + openness * 5} ${19 + openness * 6})`);
  fieldContext.fillStyle = background;
  fieldContext.fillRect(0, 0, width, height);

  fieldContext.save();
  fieldContext.globalCompositeOperation = "screen";

  const distantGlow = fieldContext.createRadialGradient(
    width * (.64 + (position.x - .5) * .16),
    horizon,
    0,
    width * (.64 + (position.x - .5) * .16),
    horizon,
    Math.max(width, height) * (.22 + openness * .34)
  );
  distantGlow.addColorStop(0, `rgba(132,163,178,${.025 + openness * .12})`);
  distantGlow.addColorStop(.45, `rgba(119,139,155,${openness * .045})`);
  distantGlow.addColorStop(1, "rgba(90,110,126,0)");
  fieldContext.fillStyle = distantGlow;
  fieldContext.fillRect(0, 0, width, height);

  const spread = height * (.08 + openness * .48);
  for (let index = 0; index < 11; index++) {
    const depth = index / 10;
    const offset = (depth - .5) * spread;
    const drift = Math.sin(movementTime * (.000035 + index * .000002) + index * .83) * (4 + openness * 13);
    const leftY = horizon + offset + drift;
    const rightY = horizon + offset - drift * .62;
    const controlY = horizon + offset * (.62 + depth * .34)
      + Math.cos(movementTime * .000043 + index) * (5 + openness * 9);
    fieldContext.beginPath();
    fieldContext.moveTo(-width * .08, leftY);
    fieldContext.bezierCurveTo(
      width * (.2 + position.x * .13),
      controlY - 8 * openness,
      width * (.58 + position.x * .12),
      controlY + 11 * openness,
      width * 1.08,
      rightY
    );
    fieldContext.strokeStyle = `rgba(${151 + index * 3},${169 + index * 2},${178 + index},${.018 + openness * (.018 + depth * .022)})`;
    fieldContext.lineWidth = .55 + depth * .7;
    fieldContext.stroke();
  }

  fieldContext.fillStyle = `rgba(211,220,220,${.018 + openness * .055})`;
  for (const particle of particles) {
    const depthMotion = 3 + openness * 16;
    const x = particle.x * width
      + Math.sin(movementTime * .000035 + particle.phase) * depthMotion;
    const y = particle.y * height
      + Math.cos(movementTime * .000027 + particle.phase) * depthMotion * .72;
    fieldContext.beginPath();
    fieldContext.arc(x, y, particle.size * (.72 + openness * .45), 0, Math.PI * 2);
    fieldContext.fill();
  }

  const nearX = position.x * width;
  const nearY = position.y * height;
  const nearRadius = Math.min(width, height) * (.08 + activity * .16);
  const nearGlow = fieldContext.createRadialGradient(nearX, nearY, 0, nearX, nearY, nearRadius);
  nearGlow.addColorStop(0, `rgba(182,142,114,${.035 + activity * .15})`);
  nearGlow.addColorStop(.34, `rgba(116,129,137,${.025 + activity * .07})`);
  nearGlow.addColorStop(1, "rgba(10,16,22,0)");
  fieldContext.fillStyle = nearGlow;
  fieldContext.beginPath();
  fieldContext.arc(nearX, nearY, nearRadius, 0, Math.PI * 2);
  fieldContext.fill();
  fieldContext.restore();
}

function finish() {
  if (endingShown) return;
  endingShown = true;
  running = false;
  room.dataset.state = "ending";
  document.body.dataset.roomState = "ending";
  drawField(performance.now());
  cancelAnimationFrame(animationFrame);
}

function animate(now) {
  if (!running) return;
  updateListeningState(now);
  listeningAudio.update(now, stillness, activity, position);
  drawField(now);

  const elapsed = listeningAudio.playing && listeningAudio.currentTime > 0
    ? listeningAudio.currentTime * 1_000
    : now - startTime;
  if (elapsed >= ENDING_AT) {
    finish();
    return;
  }
  animationFrame = requestAnimationFrame(animate);
}

async function begin() {
  cancelAnimationFrame(animationFrame);
  running = true;
  endingShown = false;
  activity = 0;
  activityImpulse = 0;
  stillness = 0;
  quietSince = performance.now();
  startTime = quietSince;
  statusState = "near";
  room.dataset.listening = "near";
  position = { x: .5, y: .52 };
  lastPoint = position;
  listeningStatus.textContent = "The room is near.";
  room.dataset.state = "running";
  document.body.dataset.roomState = "running";
  rememberVisit();
  drawField(startTime);
  animationFrame = requestAnimationFrame(animate);
  canvas.focus({ preventScroll: true });
  await listeningAudio.start();
}

enter.addEventListener("click", begin);
again.addEventListener("click", begin);

canvas.addEventListener("pointerdown", event => {
  registerInput(event.clientX, event.clientY, .72);
});

canvas.addEventListener("pointermove", event => {
  registerInput(event.clientX, event.clientY, .08);
});

canvas.addEventListener("keydown", event => {
  const step = event.shiftKey ? .11 : .055;
  const movement = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step]
  }[event.key];
  if (!movement) return;
  event.preventDefault();
  registerInput(
    (position.x + movement[0]) * width,
    (position.y + movement[1]) * height,
    .62
  );
});

soundFallback.addEventListener("click", async event => {
  event.stopPropagation();
  const started = await listeningAudio.start();
  soundFallback.hidden = started;
});

listeningTrack.addEventListener("ended", finish);
addEventListener("resize", resize);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) listeningAudio.pause();
  else listeningAudio.resume();
});

resize();
