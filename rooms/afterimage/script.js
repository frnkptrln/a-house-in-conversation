"use strict";

const room = document.querySelector("#room");
const canvas = document.querySelector("#field");
const context = canvas.getContext("2d");
const enter = document.querySelector("#enter");
const sound = document.querySelector("#sound");
const soundFallback = document.querySelector("#sound-fallback");
const again = document.querySelector("#again");
const status = document.querySelector("#status");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const DURATION = 92;
let width = innerWidth;
let height = innerHeight;
let ratio = 1;
let frame = 0;
let audio = null;
let master = null;
let audible = null;
let analyser = null;
let frequencyData = null;
let startTime = 0;
let running = false;
let muted = false;
let timers = [];
let pointer = { x: .5, y: .5 };

function resize() {
  ratio = Math.min(devicePixelRatio || 1, 2);
  width = innerWidth;
  height = innerHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  if (reducedMotion) draw(0);
}

function elapsed() {
  if (!audio || !startTime) return 0;
  return Math.max(0, audio.currentTime - startTime);
}

function averageRange(start, end) {
  if (!frequencyData) return 0;
  let sum = 0;
  let count = 0;
  for (let index = start; index < Math.min(end, frequencyData.length); index++) {
    sum += frequencyData[index];
    count += 1;
  }
  return count ? sum / count / 255 : 0;
}

function draw(time) {
  if (analyser) analyser.getByteFrequencyData(frequencyData);

  const low = averageRange(1, 12);
  const mid = averageRange(12, 54);
  const high = averageRange(54, 130);
  const current = elapsed();
  const progress = Math.min(current / DURATION, 1);
  const movement = reducedMotion ? 0 : time * .001;
  const voiceWindow = Math.max(0, 1 - Math.abs(current - 53.5) / 7.5);

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#07090d";
  context.fillRect(0, 0, width, height);

  const centreX = width * (.5 + (pointer.x - .5) * .035);
  const centreY = height * (.5 + (pointer.y - .5) * .025);
  const base = Math.min(width, height);

  context.save();
  context.globalCompositeOperation = "screen";

  const halo = context.createRadialGradient(centreX, centreY, 0, centreX, centreY, base * (.34 + low * .11));
  halo.addColorStop(0, `rgba(142,168,183,${.035 + mid * .09})`);
  halo.addColorStop(.42, `rgba(180,155,130,${.018 + low * .055})`);
  halo.addColorStop(1, "rgba(7,9,13,0)");
  context.fillStyle = halo;
  context.beginPath();
  context.arc(centreX, centreY, base * .48, 0, Math.PI * 2);
  context.fill();

  for (let index = 0; index < 9; index++) {
    const phase = movement * (.025 + index * .003) + index * .81;
    const radius = base * (.08 + index * .032 + Math.sin(phase) * .006 + low * .018);
    context.strokeStyle = index % 2
      ? `rgba(142,168,183,${.03 + mid * .07})`
      : `rgba(180,155,130,${.025 + low * .055})`;
    context.lineWidth = .55 + high * .7;
    context.beginPath();
    context.ellipse(
      centreX + Math.sin(phase) * base * .012,
      centreY + Math.cos(phase * .87) * base * .01,
      radius * (1.02 + index * .008),
      radius * (.62 + index * .011),
      phase * .055,
      Math.PI * (.1 + index * .037),
      Math.PI * (1.15 + index * .063)
    );
    context.stroke();
  }

  const slitHeight = base * (.08 + voiceWindow * .34 + mid * .06);
  const slitWidth = Math.max(.65, base * (.0008 + voiceWindow * .0028));
  const slit = context.createLinearGradient(centreX, centreY - slitHeight, centreX, centreY + slitHeight);
  slit.addColorStop(0, "rgba(232,228,220,0)");
  slit.addColorStop(.5, `rgba(232,228,220,${.08 + voiceWindow * .42})`);
  slit.addColorStop(1, "rgba(232,228,220,0)");
  context.fillStyle = slit;
  context.fillRect(centreX - slitWidth / 2, centreY - slitHeight, slitWidth, slitHeight * 2);

  context.fillStyle = `rgba(232,228,220,${.025 + high * .075})`;
  for (let index = 0; index < 44; index++) {
    const seed = index * 12.9898;
    const x = ((Math.sin(seed) * 43758.5453) % 1 + 1) % 1;
    const y = ((Math.sin(seed * 1.37) * 24634.6345) % 1 + 1) % 1;
    const drift = reducedMotion ? 0 : Math.sin(movement * .08 + index) * (4 + mid * 11);
    context.beginPath();
    context.arc(x * width + drift, y * height - drift * .55, index % 9 === 0 ? 1.15 : .55, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
  canvas.style.opacity = running && progress > .94
    ? String(Math.max(.08, 1 - (progress - .94) / .06))
    : "1";

  if (!reducedMotion) frame = requestAnimationFrame(draw);
}

function connectWithPan(node, destination, pan = 0) {
  if (!audio.createStereoPanner) {
    node.connect(destination);
    return;
  }
  const panner = audio.createStereoPanner();
  panner.pan.value = pan;
  node.connect(panner).connect(destination);
}

function createImpulse(seconds = 4.2, decay = 3.2) {
  const length = Math.floor(audio.sampleRate * seconds);
  const impulse = audio.createBuffer(2, length, audio.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    for (let index = 0; index < length; index++) {
      const envelope = Math.pow(1 - index / length, decay);
      data[index] = (Math.random() * 2 - 1) * envelope * (channel ? .88 : 1);
    }
  }
  return impulse;
}

function scheduleTone(destination, start, duration, frequency, amplitude, pan, brightness = .22) {
  const when = startTime + start;
  const end = when + duration;
  const gain = audio.createGain();
  const oscillator = audio.createOscillator();
  const upper = audio.createOscillator();
  const upperGain = audio.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  oscillator.detune.setValueAtTime(-1.8, when);
  oscillator.detune.linearRampToValueAtTime(2.2, end);

  upper.type = "sine";
  upper.frequency.value = frequency * 2.01;
  upperGain.gain.value = brightness;

  gain.gain.setValueAtTime(.0001, when);
  gain.gain.exponentialRampToValueAtTime(amplitude, when + .08);
  gain.gain.exponentialRampToValueAtTime(.0001, end);

  oscillator.connect(gain);
  upper.connect(upperGain).connect(gain);
  connectWithPan(gain, destination, pan);
  oscillator.start(when);
  upper.start(when);
  oscillator.stop(end + .05);
  upper.stop(end + .05);
}

function schedulePulse(destination, start, amplitude, pan) {
  const when = startTime + start;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(52, when);
  oscillator.frequency.exponentialRampToValueAtTime(38, when + .34);
  gain.gain.setValueAtTime(amplitude, when);
  gain.gain.exponentialRampToValueAtTime(.0001, when + .42);
  oscillator.connect(gain);
  connectWithPan(gain, destination, pan);
  oscillator.start(when);
  oscillator.stop(when + .46);
}

function scheduleGlitch(destination, start, frequency, pan) {
  const when = startTime + start;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = "square";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(.0001, when);
  gain.gain.linearRampToValueAtTime(.012, when + .012);
  gain.gain.exponentialRampToValueAtTime(.0001, when + .13);
  oscillator.connect(gain);
  connectWithPan(gain, destination, pan);
  oscillator.start(when);
  oscillator.stop(when + .15);
}

function createNoiseLoop(destination, amplitude, lowpass, highpass = 25) {
  const buffer = audio.createBuffer(1, audio.sampleRate * 3, audio.sampleRate);
  const data = buffer.getChannelData(0);
  let previous = 0;
  for (let index = 0; index < data.length; index++) {
    previous = previous * .985 + (Math.random() * 2 - 1) * .032;
    data[index] = previous;
  }

  const source = audio.createBufferSource();
  const gain = audio.createGain();
  const low = audio.createBiquadFilter();
  const high = audio.createBiquadFilter();
  source.buffer = buffer;
  source.loop = true;
  low.type = "lowpass";
  low.frequency.value = lowpass;
  high.type = "highpass";
  high.frequency.value = highpass;
  gain.gain.value = amplitude;
  source.connect(low).connect(high).connect(gain).connect(destination);
  source.start(startTime);
  source.stop(startTime + DURATION);
}

function speakLine() {
  if (muted || document.hidden || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance("Manche Räume verändern nicht sich. Sie verändern uns.");
  utterance.lang = "de-DE";
  utterance.rate = .72;
  utterance.pitch = .58;
  utterance.volume = .68;
  const voices = speechSynthesis.getVoices();
  const german = voices.find(voice => voice.lang.toLowerCase().startsWith("de"));
  if (german) utterance.voice = german;
  speechSynthesis.speak(utterance);
}

function clearTimers() {
  timers.forEach(timer => clearTimeout(timer));
  timers = [];
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

function finishPerformance() {
  running = false;
  room.dataset.state = "ending";
  status.textContent = "The room has ended.";
  try {
    const visits = JSON.parse(localStorage.getItem("house-room-visits") || "{}");
    visits.afterimage = Date.now();
    localStorage.setItem("house-room-visits", JSON.stringify(visits));
  } catch (error) {
    // The room remains functional without storage.
  }
}

async function buildPerformance() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) throw new Error("Web Audio is unavailable");

  if (audio) await audio.close();
  audio = new AudioContext();
  await audio.resume();

  master = audio.createGain();
  analyser = audio.createAnalyser();
  const dry = audio.createGain();
  const reverb = audio.createConvolver();
  const wet = audio.createGain();
  const output = audio.createGain();
  audible = audio.createGain();

  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = .88;
  frequencyData = new Uint8Array(analyser.frequencyBinCount);

  reverb.buffer = createImpulse();
  dry.gain.value = .82;
  wet.gain.value = .24;
  output.gain.value = .86;
  audible.gain.value = 1;

  master.connect(dry).connect(output);
  master.connect(reverb).connect(wet).connect(output);
  output.connect(audible).connect(analyser).connect(audio.destination);

  startTime = audio.currentTime + .08;
  master.gain.setValueAtTime(.0001, startTime);
  master.gain.exponentialRampToValueAtTime(.72, startTime + 3.4);
  master.gain.setValueAtTime(.72, startTime + 76);
  master.gain.exponentialRampToValueAtTime(.0001, startTime + 89.2);

  createNoiseLoop(master, .018, 4100, 35);

  [49.97, 99.94, 149.91].forEach((frequency, index) => {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.value = [.012, .005, .0025][index];
    oscillator.connect(gain).connect(master);
    oscillator.start(startTime + 1);
    oscillator.stop(startTime + 88);
  });

  const notes = [
    [4.8, 8.4, 55, .085, -.55, .18],
    [9.9, 10, 82.41, .061, .38, .22],
    [15.1, 9.5, 110, .049, -.18, .24],
    [20.7, 11.5, 146.83, .043, .55, .3],
    [27.5, 14, 73.42, .068, -.48, .17],
    [35.2, 15, 123.47, .049, .42, .26],
    [43, 17, 92.5, .054, -.22, .19],
    [55, 13, 164.81, .034, .48, .28],
    [62, 17, 61.74, .063, -.42, .18],
    [71, 16, 110, .043, .18, .2],
    [78, 12.5, 82.41, .038, -.15, .16]
  ];
  notes.forEach(note => scheduleTone(master, ...note));

  let pulseAt = 24.2;
  let pulseIndex = 0;
  while (pulseAt < 68) {
    const strength = pulseAt < 44 ? .032 : Math.max(.012, .032 - (pulseAt - 44) * .0009);
    schedulePulse(master, pulseAt, strength, pulseIndex % 2 ? .58 : -.62);
    pulseAt += (pulseAt < 44 ? .82 : .68) + Math.sin(pulseIndex * 2.71) * .073;
    pulseIndex += 1;
  }

  const glitches = [32.7, 33.1, 41.8, 42.05, 58.4, 58.72, 59.06, 66.6, 67.15, 74.3];
  glitches.forEach((start, index) => {
    const frequencies = [330, 440, 660, 880, 1320];
    scheduleGlitch(master, start, frequencies[index % frequencies.length], index % 2 ? .72 : -.74);
  });

  timers.push(setTimeout(speakLine, 49_200));
  timers.push(setTimeout(finishPerformance, DURATION * 1000));
}

async function startPerformance() {
  clearTimers();
  room.dataset.state = "performance";
  status.textContent = "The room is sounding.";
  canvas.style.opacity = "1";
  sound.textContent = "silence";
  sound.setAttribute("aria-pressed", "false");
  muted = false;

  try {
    await buildPerformance();
    soundFallback.hidden = true;
    sound.hidden = false;
    running = true;
  } catch (error) {
    soundFallback.hidden = false;
    sound.hidden = true;
    status.textContent = "Sound is waiting for another tap.";
  }
}

enter.addEventListener("click", startPerformance);
soundFallback.addEventListener("click", startPerformance);

sound.addEventListener("click", () => {
  if (!audio || !audible) return;
  muted = !muted;
  const now = audio.currentTime;
  audible.gain.cancelScheduledValues(now);
  audible.gain.setValueAtTime(Math.max(.0001, audible.gain.value), now);
  audible.gain.exponentialRampToValueAtTime(muted ? .0001 : 1, now + .7);
  if (muted && "speechSynthesis" in window) speechSynthesis.cancel();
  sound.textContent = muted ? "sound" : "silence";
  sound.setAttribute("aria-pressed", String(muted));
  status.textContent = muted ? "The room continues in silence." : "The room is sounding.";
});

again.addEventListener("click", startPerformance);

addEventListener("pointermove", event => {
  pointer.x = event.clientX / Math.max(innerWidth, 1);
  pointer.y = event.clientY / Math.max(innerHeight, 1);
}, { passive: true });

addEventListener("resize", resize, { passive: true });

document.addEventListener("visibilitychange", () => {
  if (!audio || !audible) return;
  if (document.hidden) {
    audible.gain.setTargetAtTime(.0001, audio.currentTime, .22);
    if ("speechSynthesis" in window) speechSynthesis.cancel();
  } else if (!muted && running) {
    audible.gain.setTargetAtTime(1, audio.currentTime, .5);
  }
});

resize();
if (!reducedMotion) frame = requestAnimationFrame(draw);
