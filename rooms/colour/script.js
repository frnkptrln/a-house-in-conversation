"use strict";

const room = document.querySelector("#room");
const canvas = document.querySelector("#colour-field");
const ctx = canvas.getContext("2d");
const enter = document.querySelector("#enter");
const again = document.querySelector("#again");
const soundtrack = document.querySelector("#soundtrack");
const soundFallback = document.querySelector("#sound-fallback");

const DURATION = 96000;
const ENDING_AT = 87500;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let width = innerWidth;
let height = innerHeight;
let ratio = 1;
let animationFrame = 0;
let startTime = 0;
let running = false;
let endingShown = false;
let agitation = 0;
let thirdStrength = 0;
let pointer = { x: width / 2, y: height / 2, active: false, previousX: width / 2, previousY: height / 2 };
let particles = [];
let ripples = [];
let sourceA = { x: width * .27, y: height * .48 };
let sourceB = { x: width * .73, y: height * .52 };

function rememberVisit(roomName) {
  try {
    const visits = JSON.parse(localStorage.getItem("house-room-visits") || "{}");
    visits[roomName] = Date.now();
    localStorage.setItem("house-room-visits", JSON.stringify(visits));
  } catch (error) {
    // The room remains complete when storage is unavailable.
  }
}

function resize() {
  ratio = Math.min(devicePixelRatio || 1, 2);
  width = innerWidth;
  height = innerHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function hsl(hue, saturation, lightness, alpha = 1) {
  return `hsla(${hue} ${saturation}% ${lightness}% / ${alpha})`;
}

function circularHue(a, b, amount) {
  const distance = ((b - a + 540) % 360) - 180;
  return (a + distance * amount + 360) % 360;
}

function paintBlob(x, y, radius, hue, saturation, lightness, alpha, time, phase) {
  const lobes = reducedMotion ? 3 : 7;
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  for (let i = 0; i < lobes; i++) {
    const angle = phase + i / lobes * Math.PI * 2 + time * .00006;
    const drift = radius * (.12 + .045 * Math.sin(time * .00017 + i));
    const lx = x + Math.cos(angle) * drift;
    const ly = y + Math.sin(angle) * drift;
    const lr = radius * (.72 + .1 * Math.sin(time * .00011 + i * 1.7));
    const gradient = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
    gradient.addColorStop(0, hsl(hue, saturation, lightness, alpha / lobes * 2.4));
    gradient.addColorStop(.45, hsl(hue, saturation, lightness, alpha / lobes * 1.2));
    gradient.addColorStop(1, hsl(hue, saturation, lightness, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(lx, ly, lr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function spawnThird(x, y, amount, hue) {
  const count = Math.min(reducedMotion ? 1 : 4, Math.ceil(amount * 4));
  for (let i = 0; i < count; i++) {
    particles.push({
      x: x + (Math.random() - .5) * 35,
      y: y + (Math.random() - .5) * 35,
      vx: (Math.random() - .5) * (1.2 + agitation * 2),
      vy: (Math.random() - .5) * (1.2 + agitation * 2),
      radius: 8 + Math.random() * 34,
      hue: (hue + (Math.random() - .5) * 38 + 360) % 360,
      life: 1
    });
  }
  if (particles.length > (reducedMotion ? 35 : 120)) particles.splice(0, particles.length - (reducedMotion ? 35 : 120));
}

function drawRibbon(hue, clarity) {
  const distance = Math.hypot(sourceB.x - sourceA.x, sourceB.y - sourceA.y);
  const closeness = Math.max(0, 1 - distance / (width * .65));
  const middleX = (sourceA.x + sourceB.x) / 2;
  const middleY = (sourceA.y + sourceB.y) / 2;
  const gradient = ctx.createLinearGradient(sourceA.x, sourceA.y, sourceB.x, sourceB.y);
  gradient.addColorStop(0, hsl(350, 84 * clarity, 58, .18 * closeness));
  gradient.addColorStop(.5, hsl(hue, 88 * clarity, 57, .55 * closeness));
  gradient.addColorStop(1, hsl(210, 86 * clarity, 56, .18 * closeness));
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 3 + closeness * 30;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(sourceA.x, sourceA.y);
  ctx.bezierCurveTo(middleX, middleY - height * .15, middleX, middleY + height * .15, sourceB.x, sourceB.y);
  ctx.stroke();
  return { closeness, middleX, middleY };
}

function drawParticles(clarity) {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  particles = particles.filter(particle => particle.life > .015);
  for (const particle of particles) {
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.vx *= .994;
    particle.vy *= .994;
    particle.life *= .993;
    const gradient = ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, particle.radius);
    gradient.addColorStop(0, hsl(particle.hue, 92 * clarity, 64, particle.life * .42));
    gradient.addColorStop(1, hsl(particle.hue, 80 * clarity, 58, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawRipples(hue) {
  ripples = ripples.filter(ripple => ripple.alpha > .01);
  for (const ripple of ripples) {
    ctx.strokeStyle = hsl(hue, 84, 58, ripple.alpha);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
    ctx.stroke();
    ripple.radius += 2.2;
    ripple.alpha *= .974;
  }
}

function frame(now) {
  if (!running) return;
  const elapsed = now - startTime;
  const progress = Math.min(1, elapsed / DURATION);
  const meeting = Math.sin(Math.PI * Math.min(1, progress * 1.08));
  const baseAX = width * (.24 + meeting * .16);
  const baseBX = width * (.76 - meeting * .16);
  const baseAY = height * (.47 + Math.sin(now * .00013) * .08);
  const baseBY = height * (.53 + Math.cos(now * .00011) * .08);

  if (pointer.active) {
    sourceA.x += (pointer.x - sourceA.x) * .028;
    sourceA.y += (pointer.y - sourceA.y) * .028;
    sourceB.x += (pointer.x - sourceB.x) * .019;
    sourceB.y += (pointer.y - sourceB.y) * .019;
  } else {
    sourceA.x += (baseAX - sourceA.x) * .012;
    sourceA.y += (baseAY - sourceA.y) * .012;
    sourceB.x += (baseBX - sourceB.x) * .012;
    sourceB.y += (baseBY - sourceB.y) * .012;
  }

  agitation *= .986;
  const clarity = Math.max(.22, 1 - agitation * .72);
  const hueA = (348 + progress * 38) % 360;
  const hueB = 207 + progress * 42;
  const thirdHue = circularHue(hueA, hueB, .5) + 28 * Math.sin(progress * Math.PI);
  const paperLightness = 93 - agitation * 20;
  const paperSaturation = 38 * clarity;

  ctx.fillStyle = hsl(38, paperSaturation, paperLightness, .19);
  ctx.fillRect(0, 0, width, height);

  const radius = Math.min(width, height) * (.29 + meeting * .08);
  paintBlob(sourceA.x, sourceA.y, radius, hueA, 88 * clarity, 57, .72, now, 0);
  paintBlob(sourceB.x, sourceB.y, radius, hueB, 86 * clarity, 55, .68, now, 1.7);
  const relation = drawRibbon(thirdHue, clarity);

  thirdStrength += (relation.closeness - thirdStrength) * .018;
  if (relation.closeness > .32 && Math.random() < .12 + relation.closeness * .2) {
    spawnThird(relation.middleX, relation.middleY, relation.closeness, thirdHue);
  }
  drawParticles(clarity);
  drawRipples(thirdHue);

  if (elapsed >= ENDING_AT && !endingShown) {
    endingShown = true;
    room.dataset.state = "ending";
  }
  if (elapsed >= DURATION) finish();
  else animationFrame = requestAnimationFrame(frame);
}

async function begin() {
  cancelAnimationFrame(animationFrame);
  particles = [];
  ripples = [];
  agitation = 0;
  thirdStrength = 0;
  endingShown = false;
  pointer.active = false;
  sourceA = { x: width * .27, y: height * .48 };
  sourceB = { x: width * .73, y: height * .52 };
  ctx.fillStyle = "#f3eadf";
  ctx.fillRect(0, 0, width, height);
  room.dataset.state = "running";
  soundFallback.hidden = true;
  running = true;
  rememberVisit("colour");
  soundtrack.currentTime = 0;
  soundtrack.volume = .88;
  soundtrack.muted = false;
  try {
    await soundtrack.play();
  } catch (error) {
    soundFallback.hidden = false;
  }
  startTime = performance.now();
  animationFrame = requestAnimationFrame(frame);
}

function finish() {
  running = false;
  cancelAnimationFrame(animationFrame);
  room.dataset.state = "ending";
  window.setTimeout(() => {
    soundtrack.pause();
    soundtrack.currentTime = 0;
  }, 500);
}

function pointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

canvas.addEventListener("pointerdown", event => {
  const point = pointFromEvent(event);
  pointer = { ...pointer, ...point, previousX: point.x, previousY: point.y, active: true };
  agitation = Math.min(1, agitation + .16);
  ripples.push({ x: point.x, y: point.y, radius: 5, alpha: .62 });
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", event => {
  if (!pointer.active) return;
  const point = pointFromEvent(event);
  const speed = Math.hypot(point.x - pointer.previousX, point.y - pointer.previousY);
  agitation = Math.min(1, agitation + speed / 900);
  pointer = { ...pointer, ...point, previousX: point.x, previousY: point.y };
});

function releasePointer(event) {
  pointer.active = false;
  if (event.pointerId !== undefined && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
}

canvas.addEventListener("pointerup", releasePointer);
canvas.addEventListener("pointercancel", releasePointer);

enter.addEventListener("click", begin);
again.addEventListener("click", begin);
soundFallback.addEventListener("click", async event => {
  event.stopPropagation();
  try {
    await soundtrack.play();
    soundFallback.hidden = true;
  } catch (error) {
    soundFallback.hidden = false;
  }
});

addEventListener("resize", resize);
resize();
