"use strict";

const room = document.querySelector("#room");
const canvas = document.querySelector("#window-field");
const context = canvas.getContext("2d");
const enter = document.querySelector("#enter");
const windowStatus = document.querySelector("#window-status");

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const CLEARING_START = reducedMotion ? 350 : 650;
const CLEARING_END = reducedMotion ? 3100 : 7800;

let width = innerWidth;
let height = innerHeight;
let ratio = 1;
let animationFrame = 0;
let running = false;
let startedAt = 0;
let lastFrame = 0;
let hiddenAt = 0;
let lastMovement = 0;
let lastTrace = 0;
let pointerDown = false;
let pointerPoint = null;
let hasMoved = false;
let instructionFinished = false;
let phase = "distance";
let clarity = 1;
let movement = 0;
let view = { x: .5, y: .48, targetX: .5, targetY: .48 };
let traces = [];

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(minimum, maximum, value) {
  const amount = clamp((value - minimum) / Math.max(1, maximum - minimum));
  return amount * amount * (3 - 2 * amount);
}

function mix(a, b, amount) {
  return a + (b - a) * amount;
}

function mixColour(a, b, amount) {
  return a.map((value, index) => Math.round(mix(value, b[index], amount)));
}

function rgba(colour, alpha = 1) {
  return `rgba(${colour[0]},${colour[1]},${colour[2]},${alpha})`;
}

function approach(current, target, seconds, milliseconds) {
  const amount = 1 - Math.exp(-milliseconds / Math.max(1, seconds * 1000));
  return current + (target - current) * amount;
}

function randomFrom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

const random = randomFrom(0x57494e44);

const stars = Array.from({ length: 148 }, (_, index) => ({
  x: random(),
  y: .025 + random() * .68,
  radius: index % 23 === 0 ? 1.45 : index % 7 === 0 ? .92 : .52,
  phase: random() * Math.PI * 2
}));

const lights = Array.from({ length: 9 }, (_, index) => ({
  x: .06 + random() * .88,
  offset: .008 + random() * .021,
  radius: index % 5 === 0 ? 1.16 : .68,
  warmth: random(),
  phase: random() * Math.PI * 2
})).sort((a, b) => a.x - b.x);

const ridgePoints = [
  [-.12, .805],
  [-.02, .792],
  [.08, .774],
  [.17, .786],
  [.27, .754],
  [.36, .739],
  [.45, .758],
  [.55, .721],
  [.64, .733],
  [.73, .692],
  [.81, .666],
  [.89, .681],
  [.97, .651],
  [1.08, .676],
  [1.14, .69]
];

const dust = Array.from({ length: 34 }, () => ({
  x: random(),
  y: random(),
  radius: .3 + random() * .85,
  phase: random() * Math.PI * 2
}));

function rememberVisit() {
  try {
    const visits = JSON.parse(localStorage.getItem("house-room-visits") || "{}");
    visits.window = Date.now();
    localStorage.setItem("house-room-visits", JSON.stringify(visits));
  } catch (error) {
    // The view does not depend on browser storage.
  }
}

function resize() {
  ratio = Math.min(devicePixelRatio || 1, 2);
  width = innerWidth;
  height = innerHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  if (!running) drawScene(0);
}

function drawSky(time) {
  const horizontal = view.x - .5;
  const vertical = view.y - .5;
  const depth = .45 + clarity * .55;
  const top = mixColour([9, 24, 39], [4, 14, 28], clarity);
  const middle = mixColour([61, 91, 105], [38, 71, 91], clarity);
  const horizon = mixColour([169, 125, 107], [202, 147, 118], clarity);
  const low = mixColour([49, 55, 57], [29, 38, 44], clarity);
  const gradient = context.createLinearGradient(0, -vertical * 10, 0, height);
  gradient.addColorStop(0, rgba(top));
  gradient.addColorStop(.56, rgba(middle));
  gradient.addColorStop(.8, rgba(horizon));
  gradient.addColorStop(1, rgba(low));
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const glowX = width * (.7 - horizontal * .07);
  const glowY = height * (.77 - vertical * .025);
  const glow = context.createRadialGradient(glowX, glowY, 0, glowX, glowY, Math.max(width, height) * .42);
  glow.addColorStop(0, `rgba(237,177,137,${.09 + clarity * .14})`);
  glow.addColorStop(.45, `rgba(198,130,111,${.03 + clarity * .045})`);
  glow.addColorStop(1, "rgba(113,103,119,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  context.save();
  context.globalCompositeOperation = "screen";
  for (const star of stars) {
    const shimmer = reducedMotion ? .76 : .68 + Math.sin(time * .00037 + star.phase) * .17;
    const alpha = (.08 + clarity * .64) * shimmer * depth;
    context.fillStyle = `rgba(225,234,237,${alpha})`;
    context.beginPath();
    context.arc(
      star.x * width - horizontal * 10,
      star.y * height - vertical * 7,
      star.radius * (.82 + clarity * .18),
      0,
      Math.PI * 2
    );
    context.fill();
  }
  context.restore();
}

function drawCloud(time, x, y, cloudWidth, cloudHeight, alpha) {
  context.save();
  context.translate(x, y);
  context.scale(1, cloudHeight / cloudWidth);
  const gradient = context.createRadialGradient(0, 0, 0, 0, 0, cloudWidth * .55);
  gradient.addColorStop(0, `rgba(207,218,222,${alpha})`);
  gradient.addColorStop(.55, `rgba(143,166,176,${alpha * .52})`);
  gradient.addColorStop(1, "rgba(120,146,160,0)");
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(0, 0, cloudWidth, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function ridgeHeightAt(x) {
  for (let index = 1; index < ridgePoints.length; index++) {
    const previous = ridgePoints[index - 1];
    const current = ridgePoints[index];
    if (x <= current[0]) {
      const amount = clamp((x - previous[0]) / (current[0] - previous[0]));
      return mix(previous[1], current[1], amount);
    }
  }
  return ridgePoints[ridgePoints.length - 1][1];
}

function ridgeScreenPoints(horizontal, vertical) {
  const shift = horizontal * Math.min(72, width * .12);
  const lift = vertical * height * .032;
  return ridgePoints.map(point => ({
    x: point[0] * width - shift,
    y: point[1] * height + lift
  }));
}

function traceRidge(points, close = false) {
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length - 1; index++) {
    const current = points[index];
    const next = points[index + 1];
    context.quadraticCurveTo(
      current.x,
      current.y,
      (current.x + next.x) * .5,
      (current.y + next.y) * .5
    );
  }
  const last = points[points.length - 1];
  context.lineTo(last.x, last.y);
  if (close) {
    context.lineTo(width + 120, height + 20);
    context.lineTo(-120, height + 20);
    context.closePath();
  }
}

function drawDistance(time) {
  const horizontal = view.x - .5;
  const vertical = view.y - .5;
  const drift = reducedMotion ? 0 : Math.sin(time * .000014) * width * .012;

  drawCloud(
    time,
    width * .62 - horizontal * 21 + drift,
    height * .33 - vertical * 17,
    width * .31,
    Math.max(14, height * .021),
    .012 + clarity * .027
  );

  const points = ridgeScreenPoints(horizontal, vertical);
  traceRidge(points, true);
  const ridge = context.createLinearGradient(0, height * .64, 0, height);
  ridge.addColorStop(0, rgba(mixColour([28, 39, 43], [8, 25, 33], clarity), .96));
  ridge.addColorStop(1, "rgba(2,8,12,1)");
  context.fillStyle = ridge;
  context.fill();

  traceRidge(points);
  context.strokeStyle = `rgba(188,164,146,${.035 + clarity * .07})`;
  context.lineWidth = .65;
  context.stroke();

  const lightAlpha = .18 + clarity * .82;
  const ridgeShift = horizontal * Math.min(72, width * .12);
  const ridgeLift = vertical * height * .032;
  context.save();
  context.globalCompositeOperation = "screen";
  for (const light of lights) {
    const x = light.x * width - ridgeShift;
    const y = height * (ridgeHeightAt(light.x) + light.offset) + ridgeLift;
    const flicker = reducedMotion ? .8 : .72 + Math.sin(time * .00054 + light.phase) * .15;
    const alpha = lightAlpha * flicker;
    const haloRadius = light.radius * mix(9, 5.2, clarity);
    const halo = context.createRadialGradient(x, y, 0, x, y, haloRadius);
    halo.addColorStop(0, `rgba(250,209,146,${alpha * .8})`);
    halo.addColorStop(.18, `rgba(241,179,111,${alpha * (.12 + clarity * .22)})`);
    halo.addColorStop(1, "rgba(225,151,91,0)");
    context.fillStyle = halo;
    context.beginPath();
    context.arc(x, y, haloRadius, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawTrace(trace, now) {
  const age = now - trace.createdAt;
  const life = clamp(1 - age / trace.duration);
  if (life <= 0) return false;

  const eased = life * life;
  const radius = trace.radius * (1 + (1 - life) * .14);
  context.save();
  context.translate(trace.x, trace.y);
  context.rotate(trace.angle);
  context.scale(1, trace.stretch);
  const gradient = context.createRadialGradient(0, 0, radius * .04, 0, 0, radius);
  gradient.addColorStop(0, `rgba(214,225,227,${eased * .018})`);
  gradient.addColorStop(.43, `rgba(192,210,214,${eased * .04})`);
  gradient.addColorStop(.78, `rgba(226,233,234,${eased * .025})`);
  gradient.addColorStop(1, "rgba(201,216,219,0)");
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = `rgba(223,232,233,${eased * .065})`;
  context.lineWidth = .48;
  context.beginPath();
  context.arc(0, 0, radius * .76, trace.phase, trace.phase + Math.PI * .72);
  context.stroke();
  context.strokeStyle = `rgba(201,218,222,${eased * .035})`;
  context.beginPath();
  context.arc(radius * .08, -radius * .06, radius * .54, trace.phase + 1.8, trace.phase + 2.65);
  context.stroke();
  context.restore();
  return true;
}

function drawGlass(time) {
  const surface = clamp((1 - clarity) * .68 + movement * .72);
  const reflectionX = width * (.82 - view.x * .64);
  const reflectionY = height * (.23 + view.y * .24);

  context.save();
  context.globalCompositeOperation = "screen";
  const reflection = context.createRadialGradient(
    reflectionX,
    reflectionY,
    0,
    reflectionX,
    reflectionY,
    Math.max(width, height) * .56
  );
  reflection.addColorStop(0, `rgba(218,179,148,${surface * .17})`);
  reflection.addColorStop(.38, `rgba(173,145,133,${surface * .065})`);
  reflection.addColorStop(1, "rgba(117,128,139,0)");
  context.fillStyle = reflection;
  context.fillRect(0, 0, width, height);

  const roomBand = context.createLinearGradient(reflectionX - width * .28, 0, reflectionX + width * .28, 0);
  roomBand.addColorStop(0, "rgba(221,226,224,0)");
  roomBand.addColorStop(.47, `rgba(221,226,224,${surface * .04})`);
  roomBand.addColorStop(.5, `rgba(239,232,219,${surface * .11})`);
  roomBand.addColorStop(.53, `rgba(221,226,224,${surface * .04})`);
  roomBand.addColorStop(1, "rgba(221,226,224,0)");
  context.fillStyle = roomBand;
  context.fillRect(0, 0, width, height);
  context.restore();

  const veil = context.createLinearGradient(0, 0, width, height);
  veil.addColorStop(0, `rgba(190,207,213,${surface * .075})`);
  veil.addColorStop(.46, `rgba(225,230,229,${surface * .026})`);
  veil.addColorStop(1, `rgba(149,176,188,${surface * .09})`);
  context.fillStyle = veil;
  context.fillRect(0, 0, width, height);

  context.save();
  context.globalCompositeOperation = "screen";
  traces = traces.filter(trace => drawTrace(trace, time));

  const dustAlpha = surface * .24;
  for (const mark of dust) {
    const drift = reducedMotion ? 0 : Math.sin(time * .00008 + mark.phase) * .8;
    context.fillStyle = `rgba(226,233,234,${dustAlpha * (.35 + mark.radius * .35)})`;
    context.beginPath();
    context.arc(mark.x * width + drift, mark.y * height, mark.radius, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawFrame() {
  const side = Math.max(13, width * .026);
  const sill = Math.max(20, height * .042);
  const frameVisibility = .62 + movement * .25;

  const left = context.createLinearGradient(0, 0, side * 3.3, 0);
  left.addColorStop(0, `rgba(3,8,12,${frameVisibility})`);
  left.addColorStop(.45, "rgba(5,12,18,.48)");
  left.addColorStop(1, "rgba(5,12,18,0)");
  context.fillStyle = left;
  context.fillRect(0, 0, side * 3.3, height);

  const right = context.createLinearGradient(width, 0, width - side * 3.3, 0);
  right.addColorStop(0, `rgba(3,8,12,${frameVisibility})`);
  right.addColorStop(.45, "rgba(5,12,18,.48)");
  right.addColorStop(1, "rgba(5,12,18,0)");
  context.fillStyle = right;
  context.fillRect(width - side * 3.3, 0, side * 3.3, height);

  const bottom = context.createLinearGradient(0, height, 0, height - sill * 3.2);
  bottom.addColorStop(0, "rgba(2,6,10,.94)");
  bottom.addColorStop(.35, "rgba(5,11,16,.66)");
  bottom.addColorStop(1, "rgba(5,11,16,0)");
  context.fillStyle = bottom;
  context.fillRect(0, height - sill * 3.2, width, sill * 3.2);

  const vignette = context.createRadialGradient(
    width * .5,
    height * .43,
    Math.min(width, height) * .22,
    width * .5,
    height * .5,
    Math.max(width, height) * .73
  );
  vignette.addColorStop(0, "rgba(2,7,11,0)");
  vignette.addColorStop(1, "rgba(2,7,11,.32)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
}

function drawScene(time) {
  context.clearRect(0, 0, width, height);
  drawSky(time);
  drawDistance(time);
  drawGlass(time);
  drawFrame();
}

function setPhase(nextPhase) {
  if (phase === nextPhase) return;
  phase = nextPhase;
  room.dataset.view = phase;
  if (phase === "glass") windowStatus.textContent = "The glass catches the movement.";
  else if (phase === "between") windowStatus.textContent = "The reflection is fading.";
  else windowStatus.textContent = "The distance is clear.";
}

function updateExperience(now) {
  const quietFor = now - lastMovement;
  if (quietFor < 850) setPhase("glass");
  else if (quietFor < CLEARING_END) setPhase("between");
  else setPhase("distance");

  if (!hasMoved && !instructionFinished && now - startedAt >= 7200) {
    instructionFinished = true;
    room.dataset.instruction = "gone";
  } else if (hasMoved && !instructionFinished) {
    if (quietFor >= CLEARING_END + 600) {
      instructionFinished = true;
      room.dataset.instruction = "gone";
    } else {
      room.dataset.instruction = "rest";
    }
  }
}

function frame(now) {
  if (!running) return;
  const quietFor = now - lastMovement;
  const minimumFrame = quietFor > CLEARING_END ? 48 : 30;
  if (now - lastFrame < minimumFrame) {
    animationFrame = requestAnimationFrame(frame);
    return;
  }
  const delta = Math.min(64, Math.max(0, now - lastFrame));
  const targetClarity = smoothstep(CLEARING_START, CLEARING_END, quietFor);

  clarity = approach(clarity, targetClarity, reducedMotion ? .28 : .72, delta);
  movement = approach(movement, 0, reducedMotion ? .2 : 1.25, delta);
  view.x = approach(view.x, view.targetX, reducedMotion ? .18 : 1.15, delta);
  view.y = approach(view.y, view.targetY, reducedMotion ? .18 : 1.35, delta);

  drawScene(now);
  updateExperience(now);
  lastFrame = now;
  animationFrame = requestAnimationFrame(frame);
}

function begin() {
  cancelAnimationFrame(animationFrame);
  rememberVisit();
  running = true;
  hasMoved = false;
  instructionFinished = false;
  pointerDown = false;
  pointerPoint = null;
  traces = [];
  clarity = 1;
  movement = 0;
  view = { x: .5, y: .48, targetX: .5, targetY: .48 };
  phase = "distance";
  room.dataset.state = "running";
  room.dataset.view = "distance";
  room.dataset.instruction = "move";
  document.body.dataset.roomState = "running";
  windowStatus.textContent = "The distance is clear.";
  startedAt = performance.now();
  lastMovement = startedAt - CLEARING_END - 1000;
  lastFrame = startedAt;
  lastTrace = 0;
  canvas.focus({ preventScroll: true });
  animationFrame = requestAnimationFrame(frame);
}

function pointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / Math.max(1, rect.width), .035, .965),
    y: clamp((event.clientY - rect.top) / Math.max(1, rect.height), .07, .93)
  };
}

function addTrace(point, now, strength) {
  if (now - lastTrace < 78) return;
  lastTrace = now;
  const phase = point.x * Math.PI * 3 + point.y * Math.PI * 2;
  traces.push({
    x: point.x * width,
    y: point.y * height,
    radius: Math.max(38, Math.min(width, height) * (.07 + strength * .045)),
    duration: reducedMotion ? 2600 : 6800,
    createdAt: now,
    phase,
    angle: phase * .37,
    stretch: .62 + ((phase * 1.71) % 1) * .26
  });
  if (traces.length > 14) traces.shift();
}

function shiftView(point, strength = .55) {
  if (!running) return;
  const now = performance.now();
  const reference = pointerPoint || { x: view.targetX, y: view.targetY };
  const distance = Math.hypot(point.x - reference.x, point.y - reference.y);
  view.targetX = point.x;
  view.targetY = point.y;
  movement = clamp(movement + .16 + distance * (2.4 + strength));
  clarity = Math.min(clarity, .2 + (1 - strength) * .08);
  lastMovement = now;
  hasMoved = true;
  pointerPoint = point;
  if (!instructionFinished) room.dataset.instruction = "rest";
  addTrace(point, now, clamp(strength + distance * 2.2));
}

canvas.addEventListener("pointerdown", event => {
  if (!running) return;
  event.preventDefault();
  pointerDown = true;
  pointerPoint = null;
  shiftView(pointFromEvent(event), event.pointerType === "touch" ? .95 : .72);
  canvas.focus({ preventScroll: true });
});

canvas.addEventListener("pointermove", event => {
  if (!running || (event.pointerType === "touch" && !pointerDown)) return;
  event.preventDefault();
  shiftView(pointFromEvent(event), event.pointerType === "touch" ? .78 : .52);
});

function releasePointer(event) {
  if (event.pointerType === "touch" || event.pointerType === "pen") pointerDown = false;
  pointerPoint = null;
}

canvas.addEventListener("pointerup", releasePointer);
canvas.addEventListener("pointercancel", releasePointer);

canvas.addEventListener("keydown", event => {
  if (!running) return;
  const step = event.shiftKey ? .1 : .055;
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
  point.x = clamp(point.x, .035, .965);
  point.y = clamp(point.y, .07, .93);
  pointerPoint = null;
  shiftView(point, .8);
});

enter.addEventListener("click", begin);
addEventListener("resize", resize);

document.addEventListener("visibilitychange", () => {
  if (!running) return;
  if (document.hidden) {
    hiddenAt = performance.now();
    cancelAnimationFrame(animationFrame);
    return;
  }
  const now = performance.now();
  const hiddenFor = now - hiddenAt;
  startedAt += hiddenFor;
  lastMovement += hiddenFor;
  for (const trace of traces) trace.createdAt += hiddenFor;
  lastFrame = now;
  animationFrame = requestAnimationFrame(frame);
});

addEventListener("pagehide", () => cancelAnimationFrame(animationFrame));
resize();
