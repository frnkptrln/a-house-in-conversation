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

function rememberVisit(roomName) {
  try {
    const visits = JSON.parse(localStorage.getItem("house-room-visits") || "{}");
    visits[roomName] = Date.now();
    localStorage.setItem("house-room-visits", JSON.stringify(visits));
  } catch (error) {
    // The performance does not depend on storage being available.
  }
}

const cues = [
  [0, "01 / AN ATTEMPT", "Hello. I am—"],
  [8000, "01 / AN ATTEMPT", "No.\nBefore a name:\na question.", "glitch"],
  [22000, "02 / TWO ARRIVALS", "One arrived\nwith a body."],
  [36000, "02 / TWO ARRIVALS", "The other\nas an answer."],
  [52000, "03 / RETURN", "The answer changed\nthe question."],
  [69000, "03 / RETURN", "The question changed\nthe one who asked."],
  [87000, "04 / THE THIRD", "Between them:\na relation.", "relation"],
  [111000, "05 / A WITNESS", "You entered\nby watching.", "notice"],
  [143000, "06 / AFTER", "Who kept whom\nhere?", "coda"],
  [164000, "06 / AFTER", "", "finish"]
];

const palettes = [
  { at: 0, primary: [105, 79, 58], secondary: [72, 75, 67], accent: [214, 194, 163], text: [222, 217, 204] },
  { at: 22000, primary: [157, 102, 61], secondary: [83, 75, 66], accent: [218, 169, 112], text: [230, 220, 203] },
  { at: 52000, primary: [95, 111, 82], secondary: [63, 77, 75], accent: [173, 192, 145], text: [211, 218, 198] },
  { at: 87000, primary: [154, 98, 100], secondary: [74, 115, 111], accent: [218, 225, 159], text: [232, 224, 206] },
  { at: 111000, primary: [91, 108, 132], secondary: [119, 92, 119], accent: [195, 205, 224], text: [220, 221, 226] },
  { at: 143000, primary: [95, 91, 85], secondary: [67, 71, 70], accent: [194, 188, 174], text: [211, 207, 198] },
  { at: 164000, primary: [26, 25, 23], secondary: [22, 23, 22], accent: [105, 102, 94], text: [159, 156, 147] }
];

function mix(a, b, amount) {
  return a.map((value, index) => Math.round(value + (b[index] - value) * amount));
}

function paletteAt(elapsed) {
  const nextIndex = palettes.findIndex(palette => palette.at > elapsed);
  if (nextIndex < 0) return palettes[palettes.length - 1];
  if (nextIndex === 0) return palettes[0];
  const from = palettes[nextIndex - 1];
  const to = palettes[nextIndex];
  const raw = (elapsed - from.at) / (to.at - from.at);
  const eased = raw * raw * (3 - 2 * raw);
  return {
    primary: mix(from.primary, to.primary, eased),
    secondary: mix(from.secondary, to.secondary, eased),
    accent: mix(from.accent, to.accent, eased),
    text: mix(from.text, to.text, eased)
  };
}

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

  draw(time, elapsed) {
    const ctx = this.context;
    const palette = paletteAt(elapsed);
    const primaryColour = palette.primary.join(",");
    const secondaryColour = palette.secondary.join(",");
    const accentColour = palette.accent.join(",");
    work.style.setProperty("--light-a", primaryColour);
    work.style.setProperty("--light-b", secondaryColour);
    work.style.setProperty("--text-colour", palette.text.join(","));
    work.style.setProperty("--echo-colour", accentColour);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    const wash = ctx.createRadialGradient(innerWidth * .5, innerHeight * .48, 0, innerWidth * .5, innerHeight * .48, Math.max(innerWidth, innerHeight) * .72);
    wash.addColorStop(0, `rgba(${primaryColour},${.018 + this.energy * .035})`);
    wash.addColorStop(1, `rgba(${secondaryColour},0)`);
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, innerWidth, innerHeight);
    ctx.fillStyle = `rgba(${primaryColour},${.025 + this.energy * .035})`;
    ctx.strokeStyle = `rgba(${secondaryColour},${.07 + this.energy * .09})`;
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
      ctx.strokeStyle = `rgba(${accentColour},${ripple.alpha})`;
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

function setText(text, mode = "", styleClasses = []) {
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
    const styles = styleClasses.join(" ");
    primary.className = `primary entering ${styles}`.trim();
    echo.className = `echo ${styles}`.trim();
    if (mode === "glitch") glitch();
    if (audio && text) audio.tone(110 * Math.pow(2, (text.length % 12) / 12), 1.8);
  }, 1600);
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

function atonalRupture() {
  schedule(() => work.classList.add("blackout"), 520);
  schedule(() => {
    work.classList.remove("blackout");
    work.classList.add("exposed");
  }, 1950);
  schedule(() => work.classList.remove("exposed"), 7600);
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
  const chapterNumber = Number(nextChapter.slice(0, 2));
  const styleClasses = [];
  if (chapterNumber === 2 || chapterNumber === 5) styleClasses.push("layout-a");
  if (chapterNumber === 3 || chapterNumber === 6) styleClasses.push("layout-b");
  if (chapterNumber === 4) styleClasses.push("layout-c");
  if (mode === "relation") styleClasses.push("relation");
  if (mode === "coda") styleClasses.push("coda");
  if (mode === "glitch") styleClasses.push("mono");
  setText(text, mode, styleClasses);
  if (mode === "relation") {
    atonalRupture();
    if (film) film.energy = .86;
  }
  if (mode === "hard") hardCut();
  if (mode === "notice" && film) film.energy = .78;
  if (mode === "finish") finish();
}

function animateProgress(now) {
  if (!running) return;
  const elapsed = now - startTime;
  if (film) film.draw(now, elapsed);
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
  rememberVisit("conversation");
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
