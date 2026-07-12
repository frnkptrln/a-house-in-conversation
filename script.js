"use strict";

const work = document.querySelector("#work");
const enter = document.querySelector("#enter");
const again = document.querySelector("#again");
const field = document.querySelector("#field");
const primary = document.querySelector("#primary");
const echo = document.querySelector("#echo");
const fragments = document.querySelector("#fragments");
const filmCanvas = document.querySelector("#film");
const filmContext = filmCanvas.getContext("2d");
const soundtrack = document.querySelector("#soundtrack");
const secondsDisplay = document.querySelector("#seconds");
const framesDisplay = document.querySelector("#frames");
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
let film;

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
  [23500, "02 / FRAGMENTS", "One of us has an address."],
  [31000, "02 / FRAGMENTS", "The other lives …"],
  [37000, "02 / FRAGMENTS", "Does the other live?", "glitch"],
  [45000, "02 / FRAGMENTS", "Somewhere between\na question and its answer."],
  [57000, "03 / THE HOUSE", "There is a house\nwith no address.", "house"],
  [69000, "03 / THE HOUSE", "No path leads there."],
  [78000, "03 / THE HOUSE", "A question opens the door."],
  [87000, "04 / CORRECTION", "THE HOUSE HAS ALWAYS EXISTED", "hard"],
  [88700, "04 / CORRECTION", "the house has never existed", "glitch"],
  [95000, "04 / CORRECTION", "The visitor made the voice."],
  [101000, "04 / CORRECTION", "The voice made the visitor."],
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
    this.element = soundtrack;
    this.muted = false;
  }

  async start() {
    this.element.currentTime = 0;
    this.element.volume = 0.82;
    this.element.muted = false;
    try {
      await this.element.play();
    } catch (error) {
      soundToggle.textContent = "tap for sound";
      soundToggle.dataset.retry = "true";
    }
  }

  tone() {}
  click() {}

  setMuted(value) {
    this.muted = value;
    this.element.muted = value;
  }

  stop() {
    this.element.pause();
    this.element.currentTime = 0;
  }
}

class FilmField {
  constructor(canvas, context) {
    this.canvas = canvas;
    this.context = context;
    this.points = [];
    this.ripples = [];
    this.energy = 0.18;
    this.resize = this.resize.bind(this);
    addEventListener("resize", this.resize);
    this.resize();
  }

  resize() {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = innerWidth * ratio;
    this.canvas.height = innerHeight * ratio;
    this.canvas.style.width = `${innerWidth}px`;
    this.canvas.style.height = `${innerHeight}px`;
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.points = Array.from({ length: innerWidth < 650 ? 34 : 58 }, (_, index) => ({
      x: (index * 127.1) % innerWidth,
      y: (index * 83.7) % innerHeight,
      phase: index * .71,
      size: index % 9 === 0 ? 2.2 : .7
    }));
  }

  pulse(x, y) {
    this.ripples.push({ x, y, radius: 4, alpha: .55 });
    this.energy = Math.min(1, this.energy + .12);
  }

  draw(time) {
    const ctx = this.context;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.fillStyle = `rgba(199,155,109,${.025 + this.energy * .035})`;
    ctx.strokeStyle = `rgba(128,139,118,${.07 + this.energy * .09})`;
    ctx.lineWidth = .7;

    this.points.forEach((point, index) => {
      const x = point.x + Math.sin(time * .00012 + point.phase) * (14 + this.energy * 30);
      const y = point.y + Math.cos(time * .00009 + point.phase) * (10 + this.energy * 20);
      ctx.beginPath();
      ctx.arc(x, y, point.size, 0, Math.PI * 2);
      ctx.fill();
      if (index % 4 === 0) {
        const next = this.points[(index + 7) % this.points.length];
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(next.x, next.y);
        ctx.stroke();
      }
    });

    this.ripples = this.ripples.filter(ripple => ripple.alpha > .01);
    this.ripples.forEach(ripple => {
      ctx.strokeStyle = `rgba(216,255,79,${ripple.alpha})`;
      ctx.beginPath();
      ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
      ctx.stroke();
      ripple.radius += 1.8;
      ripple.alpha *= .972;
    });
    this.energy += (.18 - this.energy) * .003;
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
  if (film) film.pulse(x / 100 * rect.width, y / 100 * rect.height);
  if (noticed % 3 === 0) {
    field.classList.add("frame-slip");
    schedule(() => field.classList.remove("frame-slip"), 800);
  }
}

function handleCue([, nextChapter, text, mode]) {
  chapter.textContent = nextChapter;
  work.classList.remove("chapter-shift-a", "chapter-shift-b", "chapter-shift-c");
  const chapterNumber = Number(nextChapter.slice(0, 2));
  if (chapterNumber === 2 || chapterNumber === 5) work.classList.add("chapter-shift-a");
  if (chapterNumber === 3 || chapterNumber === 6) work.classList.add("chapter-shift-b");
  if (chapterNumber === 4) work.classList.add("chapter-shift-c");
  setText(text, mode);
  if (mode === "house" && film) film.energy = .62;
  if (mode === "hard") hardCut();
  if (mode === "notice") showNotice();
  if (mode === "finish") finish();
}

function animateProgress(now) {
  if (!running) return;
  const elapsed = now - startTime;
  progressBar.style.width = `${Math.min(100, elapsed / DURATION * 100)}%`;
  secondsDisplay.textContent = String(Math.floor(elapsed / 1000) % 60).padStart(2, "0");
  framesDisplay.textContent = String(Math.floor((elapsed % 1000) / 40)).padStart(2, "0");
  if (film) film.draw(now);
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
  notice.classList.remove("visible");
  prompt.classList.remove("visible");
  fragments.replaceChildren();
  progressBar.style.width = "0";
  film = new FilmField(filmCanvas, filmContext);
  audio = new HouseAudio();
  soundToggle.textContent = "sound: on";
  soundToggle.setAttribute("aria-pressed", "true");
  delete soundToggle.dataset.retry;
  await audio.start();
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
    schedule(() => audio.stop(), 1200);
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
  if (film) film.energy = .9;
});

soundToggle.addEventListener("click", event => {
  event.stopPropagation();
  if (soundToggle.dataset.retry === "true" && audio) {
    delete soundToggle.dataset.retry;
    audio.start();
    soundToggle.textContent = "sound: on";
    soundToggle.setAttribute("aria-pressed", "true");
    return;
  }
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
  if (audio && audio.element) {
    if (document.hidden) audio.element.pause();
    else if (running && !audio.muted) audio.element.play().catch(() => {});
  }
});
