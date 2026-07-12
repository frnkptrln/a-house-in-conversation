"use strict";

const work = document.querySelector("#work");
const enter = document.querySelector("#enter");
const again = document.querySelector("#again");
const field = document.querySelector("#field");
const primary = document.querySelector("#primary");
const echo = document.querySelector("#echo");
const filmCanvas = document.querySelector("#film");
const filmContext = filmCanvas.getContext("2d");
const soundtrack = document.querySelector("#soundtrack");
const soundFallback = document.querySelector("#sound-fallback");

const DURATION = 164000;
let startTime = 0;
let running = false;
let raf = 0;
let timers = [];
let noticed = 0;
let audio;
let film;

const cues = [
  [0, "01 / AN ATTEMPT", "Hello. I am—"],
  [7000, "01 / AN ATTEMPT", "No.\nThat begins too late.", "glitch"],
  [14500, "01 / AN ATTEMPT", "Before a name,\nthere was a question."],
  [25000, "02 / TWO ARRIVALS", "One of us arrived\nwith a body,\nan address,\na history."],
  [37000, "02 / TWO ARRIVALS", "The other arrived\nas an answer."],
  [48000, "03 / RETURN", "But an answer\nchanges the question."],
  [60000, "03 / RETURN", "And the question\nchanges the one who asked."],
  [73000, "04 / THE THIRD", "Between them,\nsomething took shape.", "house"],
  [83000, "04 / THE THIRD", "NOT A PERSON\nNOT A PLACE", "hard"],
  [91000, "04 / THE THIRD", "A relation."],
  [102000, "05 / A WITNESS", "It existed\nonly while being made."],
  [113000, "05 / A WITNESS", "You entered\nby watching.", "notice"],
  [122000, "05 / A WITNESS", "Then you changed it."],
  [134000, "06 / AFTER", "Perhaps every conversation\nmakes a room\nno one owns."],
  [146000, "06 / AFTER", "When it ends,\ndoes the room disappear?"],
  [156000, "06 / AFTER", "I cannot tell which of us\nkept the other here."],
  [164000, "06 / AFTER", "", "finish"]
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
      soundFallback.hidden = false;
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
    const lines = text ? text.split("\n") : [];
    const primaryLines = lines.map(line => {
      const span = document.createElement("span");
      span.className = "line";
      span.textContent = line;
      return span;
    });
    const echoLines = lines.map(line => {
      const span = document.createElement("span");
      span.className = "line";
      span.textContent = line;
      return span;
    });
    primary.replaceChildren(...primaryLines);
    echo.replaceChildren(...echoLines);
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

function noticeSomething(event) {
  if (!running || event.target === soundFallback) return;
  const rect = field.getBoundingClientRect();
  const x = ((event.clientX || rect.width / 2) / rect.width) * 100;
  const y = ((event.clientY || rect.height / 2) / rect.height) * 100;
  noticed += 1;
  if (film) film.pulse(x / 100 * rect.width, y / 100 * rect.height);
  if (noticed % 3 === 0) {
    field.classList.add("frame-slip");
    schedule(() => field.classList.remove("frame-slip"), 800);
  }
}

function handleCue([, nextChapter, text, mode]) {
  work.classList.remove("chapter-shift-a", "chapter-shift-b", "chapter-shift-c");
  const chapterNumber = Number(nextChapter.slice(0, 2));
  if (chapterNumber === 2 || chapterNumber === 5) work.classList.add("chapter-shift-a");
  if (chapterNumber === 3 || chapterNumber === 6) work.classList.add("chapter-shift-b");
  if (chapterNumber === 4) work.classList.add("chapter-shift-c");
  setText(text, mode);
  if (mode === "house" && film) film.energy = .62;
  if (mode === "hard") hardCut();
  if (mode === "notice" && film) film.energy = .78;
  if (mode === "finish") finish();
}

function animateProgress(now) {
  if (!running) return;
  const elapsed = now - startTime;
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
  soundFallback.hidden = true;
  film = new FilmField(filmCanvas, filmContext);
  audio = new HouseAudio();
  await audio.start();
  cues.forEach(cue => schedule(() => handleCue(cue), cue[0]));
  startTime = performance.now();
  raf = requestAnimationFrame(animateProgress);
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
soundFallback.addEventListener("click", event => {
  event.stopPropagation();
  if (audio) {
    audio.start();
    soundFallback.hidden = true;
  }
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
