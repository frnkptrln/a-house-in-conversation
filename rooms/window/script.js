"use strict";

const room = document.querySelector("#room");
const canvas = document.querySelector("#window-field");
const context = canvas.getContext("2d");
const enter = document.querySelector("#enter");
const again = document.querySelector("#again");
const windowStatus = document.querySelector("#window-status");

const DURATION = 168000;
const ENDING_AT = 156000;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let width = innerWidth;
let height = innerHeight;
let ratio = 1;
let animationFrame = 0;
let startTime = 0;
let lastFrame = 0;
let pausedAt = 0;
let running = false;
let endingShown = false;
let lastInteraction = 0;
let lastStatusUpdate = 0;
let motion = 0;
let clarity = .62;
let view = { x: .5, y: .48, targetX: .5, targetY: .48 };

const stars = Array.from({ length: 94 }, (_, index) => ({
  x: ((index * 127.1) % 991) / 991,
  y: .035 + (((index * 73.7) % 977) / 977) * .56,
  size: index % 17 === 0 ? 1.55 : index % 7 === 0 ? 1.05 : .55,
  phase: index * .83
}));

const clouds = Array.from({ length: 7 }, (_, index) => ({
  x: ((index * 193.7) % 947) / 947,
  y: .16 + (((index * 61.3) % 919) / 919) * .34,
  width: .14 + (index % 3) * .045,
  height: .018 + (index % 4) * .006,
  speed: .0000017 + (index % 3) * .00000042,
  phase: index * 1.31
}));

const lights = Array.from({ length: 18 }, (_, index) => ({
  x: .08 + (((index * 89.7) % 967) / 967) * .84,
  y: ((index * 47.3) % 907) / 907,
  size: index % 6 === 0 ? 1.5 : .8,
  phase: index * 1.07
}));

const glassMarks = Array.from({ length: 15 }, (_, index) => ({
  x: .08 + (((index * 107.9) % 953) / 953) * .84,
  y: .08 + (((index * 67.1) % 929) / 929) * .78,
  radius: 8 + (index % 5) * 7,
  phase: index * .91
}));

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(minimum, maximum, value) {
  const amount = clamp((value - minimum) / (maximum - minimum));
  return amount * amount * (3 - 2 * amount);
}

function mix(a, b, amount) {
  return a + (b - a) * amount;
}

function mixColour(a, b, amount) {
  return a.map((value, index) => Math.round(mix(value, b[index], amount)));
}

function rgb(colour, alpha = 1) {
  return `rgba(${colour[0]},${colour[1]},${colour[2]},${alpha})`;
}

function approach(current, target, seconds, milliseconds) {
  const amount = 1 - Math.exp(-milliseconds / Math.max(1, seconds * 1000));
  return current + (target - current) * amount;
}

function rememberVisit() {
  try {
    const visits = JSON.parse(localStorage.getItem("house-room-visits") || "{}");
    visits.window = Date.now();
    localStorage.setItem("house-room-visits", JSON.stringify(visits));
  } catch (error) {
    // The view does not depend on storage being available.
  }
}

function resize() {
  ratio = Math.min(devicePixelRatio || 1, 2);
  width = innerWidth;
  height = innerHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  if (!running) drawScene(0, reducedMotion ? .58 : 0);
}

function drawSky(time, progress) {
  const dusk = smoothstep(.34, 1, progress);
  const top = mixColour([9, 24, 42], [4, 9, 23], dusk);
  const middle = mixColour([40, 72, 92], [23, 37, 58], dusk);
  const horizon = mixColour([205, 147, 116], [92, 91, 111], dusk);
  const base = mixColour([48, 52, 57], [24, 29, 37], dusk);
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, rgb(top));
  gradient.addColorStop(.54, rgb(middle));
  gradient.addColorStop(.75, rgb(horizon));
  gradient.addColorStop(1, rgb(base));
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const glowX = width * (.72 - (view.x - .5) * .035);
  const glowY = height * (.67 - (view.y - .5) * .02);
  const glow = context.createRadialGradient(glowX, glowY, 0, glowX, glowY, Math.max(width, height) * .36);
  glow.addColorStop(0, `rgba(238,175,133,${.2 * (1 - dusk) + .035})`);
  glow.addColorStop(.45, `rgba(204,130,111,${.07 * (1 - dusk)})`);
  glow.addColorStop(1, "rgba(116,102,121,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  if (!reducedMotion) {
    const breath = .012 + Math.sin(time * .00007) * .006;
    context.fillStyle = `rgba(214,220,225,${breath})`;
    context.fillRect(0, 0, width, height * .66);
  }
}

function drawStars(time, progress) {
  const arrival = .12 + smoothstep(.22, .95, progress) * .78;
  const parallaxX = (view.x - .5) * 18;
  const parallaxY = (view.y - .5) * 12;
  context.save();
  context.globalCompositeOperation = "screen";
  for (const star of stars) {
    const shimmer = reducedMotion ? .78 : .62 + Math.sin(time * .001 + star.phase) * .22;
    context.fillStyle = `rgba(224,232,237,${arrival * clarity * shimmer})`;
    context.beginPath();
    context.arc(star.x * width - parallaxX, star.y * height - parallaxY, star.size, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawClouds(time, progress) {
  const dusk = smoothstep(.35, 1, progress);
  const parallax = (view.x - .5) * 32;
  context.save();
  for (const cloud of clouds) {
    const travel = reducedMotion ? 0 : (time * cloud.speed + cloud.phase) % 1.35;
    const x = (cloud.x + travel - .18) * width - parallax;
    const y = cloud.y * height - (view.y - .5) * height * 7;
    const cloudWidth = cloud.width * width;
    const cloudHeight = Math.max(10, cloud.height * height);
    context.save();
    context.translate(x, y);
    context.scale(1, cloudHeight / cloudWidth);
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, cloudWidth * .58);
    gradient.addColorStop(0, `rgba(207,216,222,${mix(.07, .035, dusk) * clarity})`);
    gradient.addColorStop(.56, `rgba(130,151,166,${mix(.045, .025, dusk)})`);
    gradient.addColorStop(1, "rgba(92,112,128,0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(0, 0, cloudWidth, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
  context.restore();
}

function terrainPath(baseY, amplitude, wavelength, offset, phase) {
  context.beginPath();
  context.moveTo(-80, height + 20);
  for (let x = -80; x <= width + 80; x += 18) {
    const shifted = x + offset;
    const y = baseY
      + Math.sin(shifted / wavelength + phase) * amplitude
      + Math.sin(shifted / (wavelength * .39) + phase * 1.7) * amplitude * .24;
    context.lineTo(x, y);
  }
  context.lineTo(width + 80, height + 20);
  context.closePath();
}

function drawDistance(time, progress) {
  const vertical = view.y - .5;
  const horizontal = view.x - .5;
  const dusk = smoothstep(.36, 1, progress);

  terrainPath(height * .69 + vertical * height * .018, height * .035, Math.max(140, width * .19), horizontal * 18, .8);
  context.fillStyle = rgb(mixColour([73, 88, 96], [39, 49, 65], dusk), .78);
  context.fill();

  terrainPath(height * .76 + vertical * height * .032, height * .05, Math.max(110, width * .14), horizontal * 30, 2.1);
  context.fillStyle = rgb(mixColour([45, 61, 66], [24, 34, 46], dusk), .92);
  context.fill();

  terrainPath(height * .83 + vertical * height * .05, height * .038, Math.max(80, width * .1), horizontal * 48, 4.3);
  context.fillStyle = rgb(mixColour([28, 39, 42], [13, 21, 30], dusk));
  context.fill();

  const lightArrival = smoothstep(.18, .75, progress) * (.35 + clarity * .65);
  context.save();
  context.globalCompositeOperation = "screen";
  for (const light of lights) {
    const x = light.x * width - horizontal * 35;
    const y = height * (.735 + light.y * .08) + vertical * height * .03;
    const flicker = reducedMotion ? .78 : .64 + Math.sin(time * .00062 + light.phase) * .18;
    const alpha = lightArrival * flicker;
    const halo = context.createRadialGradient(x, y, 0, x, y, light.size * 7);
    halo.addColorStop(0, `rgba(246,198,130,${alpha * .8})`);
    halo.addColorStop(.16, `rgba(238,175,108,${alpha * .34})`);
    halo.addColorStop(1, "rgba(224,152,94,0)");
    context.fillStyle = halo;
    context.beginPath();
    context.arc(x, y, light.size * 7, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawReflection(time) {
  const strength = .035 + (1 - clarity) * .17 + motion * .12;
  const reflectionX = width * (.5 - (view.x - .5) * .55);
  const reflectionY = height * (.34 + (view.y - .5) * .16);

  context.save();
  context.globalCompositeOperation = "screen";
  const warmth = context.createRadialGradient(reflectionX, reflectionY, 0, reflectionX, reflectionY, Math.max(width, height) * .48);
  warmth.addColorStop(0, `rgba(211,164,124,${strength})`);
  warmth.addColorStop(.4, `rgba(165,128,112,${strength * .42})`);
  warmth.addColorStop(1, "rgba(105,105,121,0)");
  context.fillStyle = warmth;
  context.fillRect(0, 0, width, height);

  const pane = context.createLinearGradient(reflectionX - width * .22, 0, reflectionX + width * .22, 0);
  pane.addColorStop(0, "rgba(220,207,192,0)");
  pane.addColorStop(.5, `rgba(220,207,192,${strength * .24})`);
  pane.addColorStop(1, "rgba(220,207,192,0)");
  context.fillStyle = pane;
  context.fillRect(0, 0, width, height);

  const band = context.createLinearGradient(0, 0, width, 0);
  band.addColorStop(0, `rgba(226,211,190,${strength * .22})`);
  band.addColorStop(.16, "rgba(226,211,190,0)");
  band.addColorStop(.72, "rgba(226,211,190,0)");
  band.addColorStop(1, `rgba(194,174,158,${strength * .18})`);
  context.fillStyle = band;
  context.fillRect(0, 0, width, height);
  context.restore();

  context.save();
  context.strokeStyle = `rgba(220,228,232,${.018 + motion * .025})`;
  context.lineWidth = .7;
  for (const mark of glassMarks) {
    const drift = reducedMotion ? 0 : Math.sin(time * .00006 + mark.phase) * 1.2;
    context.beginPath();
    context.arc(mark.x * width + drift, mark.y * height, mark.radius, mark.phase, mark.phase + 1.28);
    context.stroke();
  }
  context.restore();
}

function drawFrame() {
  const side = Math.max(10, width * .022);
  const sill = Math.max(16, height * .035);
  const leftShade = context.createLinearGradient(0, 0, side * 3.2, 0);
  leftShade.addColorStop(0, "rgba(4,8,13,.9)");
  leftShade.addColorStop(.48, "rgba(9,15,21,.62)");
  leftShade.addColorStop(1, "rgba(9,15,21,0)");
  context.fillStyle = leftShade;
  context.fillRect(0, 0, side * 3.2, height);

  const rightShade = context.createLinearGradient(width, 0, width - side * 3.2, 0);
  rightShade.addColorStop(0, "rgba(4,8,13,.9)");
  rightShade.addColorStop(.48, "rgba(9,15,21,.62)");
  rightShade.addColorStop(1, "rgba(9,15,21,0)");
  context.fillStyle = rightShade;
  context.fillRect(width - side * 3.2, 0, side * 3.2, height);

  const bottomShade = context.createLinearGradient(0, height, 0, height - sill * 3.4);
  bottomShade.addColorStop(0, "rgba(3,7,11,.96)");
  bottomShade.addColorStop(.38, "rgba(8,13,18,.76)");
  bottomShade.addColorStop(1, "rgba(8,13,18,0)");
  context.fillStyle = bottomShade;
  context.fillRect(0, height - sill * 3.4, width, sill * 3.4);

  const vignette = context.createRadialGradient(width * .5, height * .44, Math.min(width, height) * .2, width * .5, height * .48, Math.max(width, height) * .72);
  vignette.addColorStop(0, "rgba(3,7,11,0)");
  vignette.addColorStop(1, "rgba(3,7,11,.33)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
}

function drawScene(time, progress) {
  context.clearRect(0, 0, width, height);
  drawSky(time, progress);
  drawStars(time, progress);
  drawClouds(time, progress);
  drawDistance(time, progress);
  drawReflection(time);
  drawFrame();
}

function updateStatus(timeSinceInteraction) {
  if (timeSinceInteraction > 8500 && room.dataset.view !== "far") {
    room.dataset.view = "far";
    windowStatus.textContent = "The distance is clear.";
  } else if (timeSinceInteraction < 1400 && room.dataset.view !== "glass") {
    room.dataset.view = "glass";
    windowStatus.textContent = "The glass reflects the room.";
  } else if (timeSinceInteraction >= 1400 && timeSinceInteraction <= 8500 && room.dataset.view !== "between") {
    room.dataset.view = "between";
    windowStatus.textContent = "The view holds both sides.";
  }
}

function showEnding() {
  if (endingShown) return;
  endingShown = true;
  room.dataset.state = "ending";
  document.body.dataset.roomState = "ending";
  windowStatus.textContent = "Distance entered the room.";
}

function frame(time) {
  if (!running) return;
  const elapsed = time - startTime;
  const delta = Math.min(64, Math.max(0, time - lastFrame));
  const sinceInteraction = time - lastInteraction;
  const progress = clamp(elapsed / DURATION);
  const visualProgress = reducedMotion ? .58 : progress;
  const autoView = sinceInteraction > 9000;
  const targetX = autoView && !reducedMotion ? .5 + Math.sin(time * .000018) * .045 : view.targetX;
  const targetY = autoView && !reducedMotion ? .48 + Math.cos(time * .000014) * .018 : view.targetY;

  view.x = approach(view.x, targetX, reducedMotion ? .25 : 2.7, delta);
  view.y = approach(view.y, targetY, reducedMotion ? .25 : 3.1, delta);
  motion = approach(motion, 0, 4.2, delta);
  const targetClarity = .5 + smoothstep(1600, 11000, sinceInteraction) * .5;
  clarity = approach(clarity, targetClarity, 2.8, delta);

  drawScene(time, visualProgress);
  if (time - lastStatusUpdate > 900) {
    updateStatus(sinceInteraction);
    lastStatusUpdate = time;
  }

  if (elapsed >= ENDING_AT) showEnding();
  lastFrame = time;
  if (elapsed < DURATION) animationFrame = requestAnimationFrame(frame);
  else running = false;
}

function begin() {
  cancelAnimationFrame(animationFrame);
  rememberVisit();
  running = true;
  endingShown = false;
  room.dataset.state = "running";
  room.dataset.view = "between";
  document.body.dataset.roomState = "running";
  motion = 0;
  clarity = .62;
  view = { x: .5, y: .48, targetX: .5, targetY: .48 };
  startTime = performance.now();
  lastFrame = startTime;
  lastInteraction = startTime;
  lastStatusUpdate = 0;
  canvas.focus({ preventScroll: true });
  animationFrame = requestAnimationFrame(frame);
}

function pointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / Math.max(1, rect.width), .06, .94),
    y: clamp((event.clientY - rect.top) / Math.max(1, rect.height), .12, .86)
  };
}

function shiftView(point, impulse) {
  const distance = Math.hypot(point.x - view.targetX, point.y - view.targetY);
  view.targetX = point.x;
  view.targetY = point.y;
  motion = clamp(motion + distance * impulse + .035);
  clarity = Math.max(.42, clarity - distance * .28);
  lastInteraction = performance.now();
}

canvas.addEventListener("pointerdown", event => {
  if (!running) return;
  shiftView(pointFromEvent(event), 1.6);
  canvas.focus({ preventScroll: true });
});

canvas.addEventListener("pointermove", event => {
  if (!running) return;
  shiftView(pointFromEvent(event), event.pointerType === "touch" ? 1.2 : .72);
});

canvas.addEventListener("keydown", event => {
  if (!running) return;
  const step = event.shiftKey ? .09 : .045;
  const point = { x: view.targetX, y: view.targetY };
  if (event.key === "ArrowLeft") point.x -= step;
  else if (event.key === "ArrowRight") point.x += step;
  else if (event.key === "ArrowUp") point.y -= step;
  else if (event.key === "ArrowDown") point.y += step;
  else if (event.key === "Home" || event.key === " ") {
    point.x = .5;
    point.y = .48;
  } else return;
  event.preventDefault();
  point.x = clamp(point.x, .06, .94);
  point.y = clamp(point.y, .12, .86);
  shiftView(point, 1.35);
});

enter.addEventListener("click", begin);
again.addEventListener("click", begin);
addEventListener("resize", resize);

document.addEventListener("visibilitychange", () => {
  if (!running) return;
  if (document.hidden) {
    pausedAt = performance.now();
    cancelAnimationFrame(animationFrame);
    return;
  }
  const now = performance.now();
  startTime += now - pausedAt;
  lastInteraction += now - pausedAt;
  lastFrame = now;
  animationFrame = requestAnimationFrame(frame);
});

addEventListener("pagehide", () => cancelAnimationFrame(animationFrame));
resize();
