"use strict";

// The house was first performed on 12 July 2026. From that day it ages, on
// calendar time, the same for everyone, without storing or transmitting
// anything: the age is read from the date, not from the visitor.
//
// The ageing is one-directional. Roughly every thirty-four days one note of
// the written seed moves a degree along the scale, each note in a fixed
// direction it never reverses, until it reaches the edge of the scale and
// stays there. The seed does not circle through moods and it does not find
// its way back. What the Machine Room calls "as the house wrote it" is the
// July 2026 seed; what the threshold sings, when no visitor has altered it,
// is what time has made of that.

const HOUSE_BORN = Date.UTC(2026, 6, 12);
const DRIFT_EVERY_DAYS = 34;
const SEED_ORIGINAL = [0, 4, 1, 3];
const SEED_SPAN = 9;

function houseAgeDays(now = Date.now()) {
  return Math.max(0, (now - HOUSE_BORN) / 86_400_000);
}

function driftHash(value) {
  let hash = Math.imul(value + 1, 2654435761) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 1274126177) >>> 0;
  hash ^= hash >>> 16;
  return hash;
}

function agedSeed(now = Date.now()) {
  const steps = Math.floor(houseAgeDays(now) / DRIFT_EVERY_DAYS);
  const seed = SEED_ORIGINAL.slice();
  const directions = SEED_ORIGINAL.map((_, index) => (driftHash(index) % 2 === 0 ? 1 : -1));

  for (let step = 1; step <= steps; step++) {
    const note = driftHash(step * 7 + 3) % seed.length;
    const next = seed[note] + directions[note];
    // At the edge of the scale the note stays where it is. Time passes anyway.
    if (next >= 0 && next < SEED_SPAN) seed[note] = next;
  }

  return seed;
}

function seedDriftSteps(now = Date.now()) {
  const aged = agedSeed(now);
  return SEED_ORIGINAL.reduce((sum, degree, index) => sum + Math.abs(aged[index] - degree), 0);
}

// The light the rooms lend the threshold loses a little strength as the house
// ages — about a fifth after a year and a half, and no further. Not a cycle,
// not a season: a patina.
function housePatina(now = Date.now()) {
  return Math.min(.22, houseAgeDays(now) * .0004);
}

// A visitor's trace at the threshold is brightest when the visit is recent
// and fades over months if they do not go back. Returning renews it.
function traceStrength(visitedAt, now = Date.now()) {
  if (!Number.isFinite(visitedAt) || visitedAt <= 0) return 0;
  const days = Math.max(0, (now - visitedAt) / 86_400_000);
  return Math.exp(-days / 120);
}
