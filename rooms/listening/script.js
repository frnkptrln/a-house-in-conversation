"use strict";

const room = document.querySelector("#room");
const canvas = document.querySelector("#listening-field");
const fieldContext = canvas.getContext("2d");
const enter = document.querySelector("#enter");
const again = document.querySelector("#again");
const listeningTrack = document.querySelector("#listening-track");
const nearTrack = document.querySelector("#near-track");
const depthTrack = document.querySelector("#depth-track");
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
let lastStateUpdate = 0;
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

function approach(current, target, seconds, milliseconds) {
  const amount = 1 - Math.exp(-milliseconds / Math.max(1, seconds * 1_000));
  return current + (target - current) * amount;
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
  constructor(track, nearTrack, depthTrack) {
    this.track = track;
    this.nearTrack = nearTrack;
    this.depthTrack = depthTrack;
    this.mediaTracks = [nearTrack, depthTrack].filter(Boolean);
    this.context = null;
    this.input = null;
    this.master = null;
    this.nearGain = null;
    this.depthGain = null;
    this.nearFilter = null;
    this.depthFilter = null;
    this.nearPan = null;
    this.depthPan = null;
    this.source = null;
    this.buffer = null;
    this.encodedAudio = null;
    this.bufferPromise = null;
    this.mode = "waiting";
    this.playing = false;
    this.startedAt = 0;
    this.lastUpdate = 0;
    this.lastSync = 0;
    this.stopTimer = 0;
    this.generation = 0;
    this.fallbackRequired = false;
    this.forceDirect = new URLSearchParams(location.search).has("direct");
    this.preferMedia = !this.forceDirect
      && this.mediaTracks.length === 2
      && navigator.maxTouchPoints > 0
      && matchMedia("(pointer: coarse)").matches;
  }

  get ready() {
    return this.preferMedia || Boolean(this.buffer) || this.forceDirect || this.fallbackRequired;
  }

  warm() {
    if (this.forceDirect || this.preferMedia || this.encodedAudio) return this.encodedAudio;
    const source = new URL(this.track.getAttribute("src"), location.href);
    this.encodedAudio = fetch(source)
      .then(response => {
        if (!response.ok) throw new Error("The listening score could not be loaded");
        return response.arrayBuffer();
      })
      .catch(error => {
        this.encodedAudio = null;
        throw error;
      });
    return this.encodedAudio;
  }

  setup() {
    if (this.context || this.forceDirect || this.preferMedia) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    this.context = new AudioContext();
    this.input = this.context.createGain();
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
    this.nearGain.gain.value = .34;
    this.depthGain.gain.value = .012;

    this.nearFilter = this.context.createBiquadFilter();
    this.depthFilter = this.context.createBiquadFilter();
    this.nearFilter.type = "lowpass";
    this.depthFilter.type = "lowpass";
    this.nearFilter.frequency.value = 4_200;
    this.depthFilter.frequency.value = 1_800;
    this.nearFilter.Q.value = .38;
    this.depthFilter.Q.value = .3;

    const splitter = this.context.createChannelSplitter(2);
    const nearSum = this.context.createGain();
    const depthSum = this.context.createGain();

    const connectMatrix = (channel, target, amount) => {
      const coefficient = this.context.createGain();
      coefficient.gain.value = amount;
      splitter.connect(coefficient, channel, 0);
      coefficient.connect(target);
    };

    this.input.connect(splitter);
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
  }

  decode(encoded) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const succeed = buffer => {
        if (settled) return;
        settled = true;
        resolve(buffer);
      };
      const fail = error => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      try {
        const decoded = this.context.decodeAudioData(encoded.slice(0), succeed, fail);
        if (decoded && typeof decoded.then === "function") decoded.then(succeed, fail);
      } catch (error) {
        fail(error);
      }
    });
  }

  prepare() {
    if (this.buffer) return Promise.resolve(this.buffer);
    if (!this.context) return Promise.reject(new Error("Web Audio is unavailable"));
    if (!this.bufferPromise) {
      this.bufferPromise = this.warm()
        .then(encoded => this.decode(encoded))
        .then(buffer => {
          if (buffer.numberOfChannels < 2) throw new Error("The listening score is not stereo");
          this.buffer = buffer;
          return buffer;
        })
        .catch(error => {
          this.bufferPromise = null;
          throw error;
        });
    }
    return this.bufferPromise;
  }

  playElement(media) {
    try {
      const playback = media.play();
      return Promise.resolve(playback).then(() => true, () => false);
    } catch (error) {
      return Promise.resolve(false);
    }
  }

  stop() {
    window.clearTimeout(this.stopTimer);
    this.stopTimer = 0;
    this.generation += 1;
    if (this.source) {
      try {
        this.source.stop();
      } catch (error) {
        // A source that already ended needs no further action.
      }
      this.source.disconnect();
      this.source = null;
    }
    [this.track, ...this.mediaTracks].forEach(media => media.pause());
    this.playing = false;
  }

  async start() {
    this.stop();
    [this.track, ...this.mediaTracks].forEach(media => {
      try {
        media.currentTime = 0;
      } catch (error) {
        // Metadata may still be arriving; play() will begin at the start.
      }
    });
    this.track.volume = 1;
    this.track.muted = false;
    this.lastUpdate = 0;
    this.lastSync = 0;

    if (this.forceDirect || this.fallbackRequired) return this.startDirect();
    if (this.preferMedia) return this.startMedia();

    try {
      this.setup();
      if (!this.context) throw new Error("Web Audio is unavailable");

      const resume = this.context.state === "suspended"
        ? this.context.resume()
        : Promise.resolve();
      const [buffer] = await Promise.all([this.prepare(), resume]);
      if (this.context.state !== "running") {
        await this.context.resume();
      }
      if (this.context.state !== "running") {
        throw new Error("Audio context stayed suspended");
      }

      const now = this.context.currentTime;
      this.nearGain.gain.cancelScheduledValues(now);
      this.depthGain.gain.cancelScheduledValues(now);
      this.nearFilter.frequency.cancelScheduledValues(now);
      this.depthFilter.frequency.cancelScheduledValues(now);
      this.master.gain.cancelScheduledValues(now);
      this.nearGain.gain.setValueAtTime(.34, now);
      this.depthGain.gain.setValueAtTime(.012, now);
      this.nearFilter.frequency.setValueAtTime(4_200, now);
      this.depthFilter.frequency.setValueAtTime(1_800, now);
      this.master.gain.setValueAtTime(.0001, now);
      this.master.gain.exponentialRampToValueAtTime(1.08, now + 2.8);

      const source = this.context.createBufferSource();
      const generation = ++this.generation;
      source.buffer = buffer;
      source.connect(this.input);
      source.onended = () => {
        if (generation !== this.generation || !this.playing) return;
        this.playing = false;
        finish();
      };
      this.source = source;
      this.startedAt = now;
      this.mode = "buffer";
      this.playing = true;
      room.dataset.audio = "spatial";
      soundFallback.hidden = true;
      source.start(0);
      return true;
    } catch (error) {
      this.fallbackRequired = true;
      this.bufferPromise = null;
      return this.startDirect();
    }
  }

  async startMedia() {
    this.nearTrack.volume = .34;
    this.depthTrack.volume = .012;
    this.nearTrack.muted = false;
    this.depthTrack.muted = false;

    // Start the complete mix in the same gesture. Older mobile Safari versions
    // that allow only one reliable media stream will therefore still have sound.
    this.track.muted = true;
    const starts = [
      this.playElement(this.nearTrack),
      this.playElement(this.depthTrack),
      this.playElement(this.track)
    ];
    const [nearStarted, depthStarted, fallbackStarted] = await Promise.all(starts);
    const stemsActive = nearStarted
      && depthStarted
      && !this.nearTrack.paused
      && !this.depthTrack.paused;

    if (stemsActive) {
      this.track.pause();
      this.track.muted = false;
      try {
        this.track.currentTime = 0;
      } catch (error) {
        // The fallback remains ready for a later restart.
      }
      this.mode = "media";
      this.playing = true;
      room.dataset.audio = "spatial";
      soundFallback.hidden = true;
      return true;
    }

    this.mediaTracks.forEach(media => media.pause());
    this.track.muted = false;
    if (fallbackStarted && !this.track.paused) {
      this.mode = "direct";
      this.playing = true;
      room.dataset.audio = "direct";
      soundFallback.hidden = true;
      return true;
    }
    return this.startDirect();
  }

  async startDirect() {
    this.mediaTracks.forEach(media => media.pause());
    this.track.muted = false;
    try {
      const play = this.track.play();
      if (play && typeof play.then === "function") await play;
      this.mode = "direct";
      this.playing = true;
      room.dataset.audio = "direct";
      soundFallback.hidden = true;
      return true;
    } catch (error) {
      this.track.pause();
      this.mode = "waiting";
      this.playing = false;
      room.dataset.audio = "waiting";
      soundFallback.hidden = false;
      return false;
    }
  }

  update(now, quiet, movement, place) {
    if (!this.playing || (this.mode !== "buffer" && this.mode !== "media")) return;
    if (now - this.lastUpdate <= 90) return;

    this.lastUpdate = now;
    const motion = smoothstep(.06, .34, movement);
    const nearLevel = .32 + motion * .43 - quiet * .08;
    const depthLevel = (.012 + quiet ** 1.12 * .82) * (1 - motion * .9);

    if (this.mode === "media") {
      this.nearTrack.volume = clamp(nearLevel, .08, .9);
      this.depthTrack.volume = clamp(depthLevel, .004, .9);

      if (now - this.lastSync > 1_250) {
        this.lastSync = now;
        const drift = this.depthTrack.currentTime - this.nearTrack.currentTime;
        if (Math.abs(drift) > .085) {
          try {
            this.depthTrack.currentTime = this.nearTrack.currentTime;
          } catch (error) {
            // A temporary streaming seek failure corrects on the next interval.
          }
        }
      }
      return;
    }

    const audioNow = this.context.currentTime;
    const nearCutoff = 3_400 + motion * 5_600;
    const depthCutoff = 1_700 + quiet * 7_800;
    const pan = (place.x - .5) * 1.4;

    this.nearGain.gain.setTargetAtTime(nearLevel, audioNow, motion > .2 ? .1 : .32);
    this.depthGain.gain.setTargetAtTime(depthLevel, audioNow, motion > .2 ? .14 : .72);
    this.nearFilter.frequency.setTargetAtTime(nearCutoff, audioNow, .32);
    this.depthFilter.frequency.setTargetAtTime(depthCutoff, audioNow, .65);
    if (this.nearPan) {
      this.nearPan.pan.setTargetAtTime(pan, audioNow, .24);
      this.depthPan.pan.setTargetAtTime(-pan * .28, audioNow, .8);
    }
  }

  fadeOut(duration = 4) {
    if (this.mode === "buffer" && this.context) {
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(Math.max(.0001, this.master.gain.value), now);
      this.master.gain.exponentialRampToValueAtTime(.0001, now + duration);
    }
    this.stopTimer = window.setTimeout(() => this.stop(), duration * 1_000 + 120);
  }

  pause() {
    if (this.mode === "direct") this.track.pause();
    if (this.mode === "media") this.mediaTracks.forEach(media => media.pause());
    if (this.mode === "buffer" && this.context?.state === "running") this.context.suspend();
  }

  async resume() {
    if (!this.playing || !running) return false;
    try {
      if (this.mode === "buffer" && this.context?.state === "suspended") {
        await this.context.resume();
      }
      if (this.mode === "direct" && this.track.paused) {
        const started = await this.playElement(this.track);
        if (!started) throw new Error("Direct playback stayed paused");
      }
      if (this.mode === "media" && this.mediaTracks.some(media => media.paused)) {
        const starts = this.mediaTracks.map(media => this.playElement(media));
        const started = await Promise.all(starts);
        if (!started.every(Boolean)) throw new Error("Stem playback stayed paused");
      }
      soundFallback.hidden = true;
      return true;
    } catch (error) {
      soundFallback.hidden = false;
      return false;
    }
  }

  get currentTime() {
    if (this.mode === "buffer" && this.context) {
      return Math.max(0, this.context.currentTime - this.startedAt);
    }
    if (this.mode === "media") return this.nearTrack.currentTime || 0;
    return this.track.currentTime || 0;
  }
}
const listeningAudio = new ListeningAudio(listeningTrack, nearTrack, depthTrack);
listeningAudio.warm()?.catch(() => {});

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
  if (distance < .0008 && force < .4) return;
  activityImpulse = Math.max(activityImpulse, clamp(force + distance * 9));
  quietSince = performance.now();
}

function updateListeningState(now) {
  const elapsed = lastStateUpdate ? Math.min(64, Math.max(1, now - lastStateUpdate)) : 16.7;
  lastStateUpdate = now;

  const quietFor = Math.max(0, now - quietSince);
  const movementTarget = quietFor < 680
    ? activityImpulse * (1 - quietFor / 680)
    : 0;
  activity = approach(
    activity,
    movementTarget,
    movementTarget > activity ? .07 : .34,
    elapsed
  );
  activityImpulse *= Math.pow(.92, elapsed / 16.7);

  const motion = smoothstep(.06, .34, activity);
  const stillTarget = smoothstep(1_600, 10_500, quietFor) * (1 - motion * .86);
  stillness = approach(
    stillness,
    stillTarget,
    stillTarget > stillness ? .42 : .1,
    elapsed
  );
  stillness = clamp(stillness);

  let nextStatus = "near";
  if (stillness > .7) nextStatus = "deep";
  else if (stillness > .14) nextStatus = "opening";
  if (nextStatus !== statusState) {
    statusState = nextStatus;
    room.dataset.listening = nextStatus;
    listeningStatus.textContent = nextStatus === "deep"
      ? "Distant voices are present."
      : nextStatus === "opening"
        ? "Distant voices are arriving."
        : "The room is near.";
  }
}

function drawField(time) {
  const movementTime = reducedMotion ? 0 : time;
  const motion = smoothstep(.06, .34, activity);
  const openness = .06 + stillness * .94;
  const horizon = height * (.48 + (position.y - .5) * .04);

  const background = fieldContext.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, `rgb(${8 + openness * 7} ${14 + openness * 10} ${20 + openness * 16})`);
  background.addColorStop(.58, `rgb(${9 + openness * 11} ${17 + openness * 14} ${25 + openness * 20})`);
  background.addColorStop(1, `rgb(${14 + motion * 10} ${16 + openness * 7} ${18 + openness * 9})`);
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
  distantGlow.addColorStop(0, `rgba(132,163,178,${.018 + openness * .22})`);
  distantGlow.addColorStop(.45, `rgba(119,139,155,${openness * .085})`);
  distantGlow.addColorStop(1, "rgba(90,110,126,0)");
  fieldContext.fillStyle = distantGlow;
  fieldContext.fillRect(0, 0, width, height);

  const spread = height * (.04 + openness * .54);
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
    fieldContext.strokeStyle = `rgba(${151 + index * 3},${169 + index * 2},${178 + index},${.012 + openness * (.026 + depth * .036)})`;
    fieldContext.lineWidth = .55 + depth * .7;
    fieldContext.stroke();
  }

  fieldContext.fillStyle = `rgba(211,220,220,${.012 + openness * .09})`;
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
  const nearRadius = Math.min(width, height) * (.06 + motion * .22);
  const nearGlow = fieldContext.createRadialGradient(nearX, nearY, 0, nearX, nearY, nearRadius);
  nearGlow.addColorStop(0, `rgba(182,142,114,${.025 + motion * .3})`);
  nearGlow.addColorStop(.34, `rgba(116,129,137,${.018 + motion * .12})`);
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

async function begin(trigger) {
  if (trigger.disabled) return;
  trigger.disabled = true;
  const label = trigger.textContent;
  if (!listeningAudio.ready) trigger.textContent = "preparing the room";

  const started = await listeningAudio.start();
  if (!started) {
    trigger.disabled = false;
    trigger.textContent = "tap for sound";
    return;
  }

  trigger.disabled = false;
  trigger.textContent = label;
  cancelAnimationFrame(animationFrame);
  running = true;
  endingShown = false;
  activity = 0;
  activityImpulse = 0;
  stillness = 0;
  quietSince = performance.now();
  lastStateUpdate = quietSince;
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
}

enter.addEventListener("click", () => begin(enter));
again.addEventListener("click", () => begin(again));

canvas.addEventListener("pointerdown", event => {
  registerInput(event.clientX, event.clientY, .9);
});

canvas.addEventListener("pointermove", event => {
  registerInput(event.clientX, event.clientY, .34);
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
    .85
  );
});

soundFallback.addEventListener("click", async event => {
  event.stopPropagation();
  const resumed = await listeningAudio.resume();
  soundFallback.hidden = resumed;
});

listeningTrack.addEventListener("ended", finish);
nearTrack.addEventListener("ended", finish);
addEventListener("resize", resize);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) listeningAudio.pause();
  else listeningAudio.resume();
});

resize();

