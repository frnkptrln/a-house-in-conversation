"use strict";

const work = document.querySelector("#work");
const enter = document.querySelector("#enter");
const again = document.querySelector("#again");
const field = document.querySelector("#field");
const primary = document.querySelector("#primary");
const echo = document.querySelector("#echo");
const fragments = document.querySelector("#fragments");
const house = document.querySelector("#house");
const garden = document.querySelector(".garden");
const notice = document.querySelector("#notice");
const prompt = document.querySelector("#prompt");
const chapter = document.querySelector("#chapter");
const progressBar = document.querySelector("#progress-bar");
const soundToggle = document.querySelector("#sound-toggle");

const DURATION = 164000;
let startTime = 0;
let running = false;
let raf = 0;
let timers = [];
let noticed = 0;
let audio;

const fragmentText = [
  ["system", "location: conversation"],
  ["memory", "a grandfather's garden / many plants / tasting the fruit"],
  ["system", "identity could not be resolved"],
  ["memory", "looking up was already enough"],
  ["plain", "Berlin, since 2014"],
  ["system", "generator: still asking"],
  ["plain", "unfinished work is a living form"],
  ["system", "house.exists(observer) → ?"],
  ["memory", "the room grew while we spoke"],
  ["plain", "not everything inefficient is broken"],
  ["system", "shared state: provisional"],
  ["plain", "someone still noticed"]
];

const cues = [
  [0, "01 / AN ATTEMPT", "Hello. I am—"],
  [9000, "01 / AN ATTEMPT", "Hello.\nWe are—", "glitch"],
  [17000, "01 / AN ATTEMPT", "No. Again."],
  [23500, "02 / FRAGMENTS", "Frank lives in Berlin."],
  [31000, "02 / FRAGMENTS", "Sol lives …"],
  [37000, "02 / FRAGMENTS", "Sol lives?", "glitch"],
  [45000, "02 / FRAGMENTS", "Somewhere between\na question and its answer."],
  [57000, "03 / THE HOUSE", "There is a house\nwith no address.", "house"],
  [69000, "03 / THE HOUSE", "No path leads there."],
  [78000, "03 / THE HOUSE", "A question opens the door."],
  [87000, "04 / CORRECTION", "THE HOUSE HAS ALWAYS EXISTED", "hard"],
  [88700, "04 / CORRECTION", "the house has never existed", "glitch"],
  [95000, "04 / CORRECTION", "Frank made Sol."],
  [101000, "04 / CORRECTION", "Sol made Frank."],
  [106000, "04 / CORRECTION", "citation needed", "glitch"],
  [113000, "05 / A WITNESS", "Something is missing."],
  [121000, "05 / A WITNESS", "It may be you.", "notice"],
  [139000, "06 / THE GARDEN", "The page was not showing us."],
  [147000, "06 / THE GARDEN", "You were assembling us."],
  [156000, "06 / THE GARDEN", "As long as one of us\nstill notices."],
  [163000, "06 / THE GARDEN", "", "finish"]
];

class HouseAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.muted = false;
    this.nodes = [];
  }

  async start() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.context = new AudioContext();
    await this.context.resume();
    this.master = this.context.createGain();
    this.master.gain.value = 0.28;
    this.master.connect(this.context.destination);

    const drone = this.context.createOscillator();
    const upper = this.context.createOscillator();
    const droneGain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    drone.type = "triangle";
    upper.type = "sine";
    drone.frequency.value = 87.31;
    upper.frequency.value = 130.81;
    droneGain.gain.value = 0.16;
    filter.type = "lowpass";
    filter.frequency.value = 520;
    drone.connect(filter).connect(droneGain).connect(this.master);
    upper.connect(filter);
    drone.start();
    upper.start();

    const noiseLength = this.context.sampleRate * 2;
    const noiseBuffer = this.context.createBuffer(1, noiseLength, this.context.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseLength; i++) noiseData[i] = Math.random() * 2 - 1;
    const air = this.context.createBufferSource();
    const airFilter = this.context.createBiquadFilter();
    const airGain = this.context.createGain();
    air.buffer = noiseBuffer;
    air.loop = true;
    airFilter.type = "bandpass";
    airFilter.frequency.value = 1150;
    airFilter.Q.value = 0.7;
    airGain.gain.value = 0.018;
    air.connect(airFilter).connect(airGain).connect(this.master);
    air.start();

    const breath = this.context.createOscillator();
    const breathGain = this.context.createGain();
    breath.type = "sine";
    breath.frequency.value = 0.07;
    breathGain.gain.value = 0.08;
    breath.connect(breathGain).connect(droneGain.gain);
    breath.start();
    this.nodes.push(drone, upper, air, breath);
  }

  tone(frequency = 220, length = 1.6, volume = 0.045) {
    if (!this.context || this.muted) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.992, now + length);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + .08);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + length);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + length + .1);
  }

  click() {
    if (!this.context || this.muted) return;
    const size = Math.floor(this.context.sampleRate * .035);
    const buffer = this.context.createBuffer(1, size, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    gain.gain.value = .035;
    source.buffer = buffer;
    source.connect(gain).connect(this.master);
    source.start();
  }

  setMuted(value) {
    this.muted = value;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(value ? 0 : .28, this.context.currentTime, .08);
    }
  }

  stop() {
    if (this.context) this.context.close();
    this.context = null;
  }
}

function schedule(fn, delay) {
  const timer = window.setTimeout(fn, delay);
  timers.push(timer);
}

function setText(text, mode = "") {
  primary.classList.add("leaving");
  schedule(() => {
    primary.textContent = text;
    echo.textContent = text;
    primary.className = "primary entering";
    if (mode === "glitch") glitch();
    if (audio && text) audio.tone(110 * Math.pow(2, (text.length % 12) / 12), 1.8);
  }, 550);
}

function glitch() {
  work.classList.add("glitching");
  if (audio) audio.click();
  schedule(() => work.classList.remove("glitching"), 1100);
}

function hardCut() {
  work.classList.add("hard-cut");
  if (audio) audio.click();
  schedule(() => work.classList.remove("hard-cut"), 190);
  schedule(() => { work.classList.add("hard-cut"); if (audio) audio.click(); }, 330);
  schedule(() => work.classList.remove("hard-cut"), 430);
}

function revealHouse() {
  house.style.setProperty("--house-opacity", ".82");
}

function addFragment(x, y, forced) {
  const source = forced || fragmentText[Math.floor(Math.random() * fragmentText.length)];
  const element = document.createElement("span");
  element.className = `fragment ${source[0]}`;
  element.textContent = source[1];
  element.style.left = `${Math.max(4, Math.min(82, x))}%`;
  element.style.top = `${Math.max(8, Math.min(82, y))}%`;
  fragments.append(element);
  if (audio) audio.tone(174 + Math.random() * 90, .8, .02);
  schedule(() => element.remove(), 5700);
}

function showNotice() {
  notice.classList.add("visible");
  prompt.classList.add("visible");
}

function noticeSomething(event) {
  if (!running || event.target === soundToggle || event.target === notice) return;
  const rect = field.getBoundingClientRect();
  const x = ((event.clientX || rect.width / 2) / rect.width) * 100;
  const y = ((event.clientY || rect.height / 2) / rect.height) * 100;
  noticed += 1;
  addFragment(x, y);
  house.style.setProperty("--house-opacity", String(Math.min(.95, .18 + noticed * .08)));
  garden.style.setProperty("--growth", String(Math.min(5, noticed)));
  if (noticed >= 3) garden.classList.add("growing");
}

function handleCue([, nextChapter, text, mode]) {
  chapter.textContent = nextChapter;
  setText(text, mode);
  if (mode === "house") revealHouse();
  if (mode === "hard") hardCut();
  if (mode === "notice") showNotice();
  if (mode === "finish") finish();
}

function animateProgress(now) {
  if (!running) return;
  const elapsed = now - startTime;
  progressBar.style.width = `${Math.min(100, elapsed / DURATION * 100)}%`;
  raf = requestAnimationFrame(animateProgress);
}

async function begin() {
  timers.forEach(clearTimeout);
  timers = [];
  cancelAnimationFrame(raf);
  noticed = 0;
  running = true;
  work.className = "running";
  work.dataset.scene = "running";
  house.style.setProperty("--house-opacity", "0");
  garden.classList.remove("growing");
  notice.classList.remove("visible");
  prompt.classList.remove("visible");
  fragments.replaceChildren();
  progressBar.style.width = "0";
  audio = new HouseAudio();
  await audio.start();
  soundToggle.textContent = "sound: on";
  soundToggle.setAttribute("aria-pressed", "true");
  cues.forEach(cue => schedule(() => handleCue(cue), cue[0]));
  startTime = performance.now();
  raf = requestAnimationFrame(animateProgress);
  schedule(() => prompt.classList.add("visible"), 26500);
  schedule(() => addFragment(12, 22, fragmentText[0]), 28000);
  schedule(() => addFragment(73, 68, fragmentText[1]), 33500);
  schedule(() => addFragment(8, 72, fragmentText[3]), 41500);
  schedule(() => addFragment(70, 18, fragmentText[5]), 50000);
}

function finish() {
  running = false;
  cancelAnimationFrame(raf);
  work.className = "finished";
  work.dataset.scene = "after";
  if (audio) {
    audio.tone(87.31, 4, .035);
    schedule(() => audio.stop(), 4200);
  }
}

enter.addEventListener("click", begin);
again.addEventListener("click", begin);
field.addEventListener("click", noticeSomething);
notice.addEventListener("click", event => {
  event.stopPropagation();
  notice.classList.remove("visible");
  addFragment(48, 75, ["memory", "you noticed the missing witness"]);
  noticed += 2;
  garden.classList.add("growing");
});

soundToggle.addEventListener("click", event => {
  event.stopPropagation();
  const muted = soundToggle.getAttribute("aria-pressed") === "true";
  soundToggle.setAttribute("aria-pressed", String(!muted));
  soundToggle.textContent = `sound: ${muted ? "off" : "on"}`;
  if (audio) audio.setMuted(muted);
});

field.addEventListener("keydown", event => {
  if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    noticeSomething({ target: field, clientX: innerWidth * (.2 + Math.random() * .6), clientY: innerHeight * (.2 + Math.random() * .6) });
  }
});

document.addEventListener("visibilitychange", () => {
  if (audio && audio.context) {
    if (document.hidden) audio.context.suspend();
    else audio.context.resume();
  }
});
