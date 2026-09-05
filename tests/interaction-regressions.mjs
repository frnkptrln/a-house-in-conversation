import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../script.js", import.meta.url), "utf8");
const day = 86_400_000;

function memoryHarness() {
  let clock = Date.UTC(2026, 8, 5);
  let saved = null;
  const context = {
    Date: { now: () => clock },
    window: { setTimeout: () => 1 },
    clearTimeout() {},
    localStorage: {
      getItem: () => saved,
      setItem: (_key, value) => { saved = value; }
    }
  };
  const definitions = source.slice(source.indexOf("const clamp ="), source.indexOf("const memory ="));
  const HouseMemory = vm.runInNewContext(definitions + "; HouseMemory;", context);
  return { HouseMemory, advance: amount => { clock += amount; } };
}

test("reopening at the same instant preserves the strength and hue of a memory", () => {
  const { HouseMemory, advance } = memoryHarness();
  let memory = new HouseMemory();
  memory.leaveTrace({ kind: "colour", strength: 1, hue: 200 });
  memory.save();
  advance(3 * day);
  memory = new HouseMemory();
  const strength = memory.latestTrace().strength;
  const hue = memory.latestTrace().hue;
  assert.ok(Math.abs(strength - Math.exp(-3 / 15)) < 1e-12);
  for (let visit = 0; visit < 5; visit++) {
    memory.save();
    memory = new HouseMemory();
    assert.equal(memory.latestTrace().strength, strength);
    assert.equal(memory.latestTrace().hue, hue);
  }
});

test("an intermediate visit does not accelerate time-based forgetting", () => {
  const { HouseMemory, advance } = memoryHarness();
  let memory = new HouseMemory();
  memory.leaveTrace({ kind: "window", strength: 1, hue: 204 });
  memory.save();
  advance(day);
  memory = new HouseMemory();
  memory.save();
  advance(day);
  memory = new HouseMemory();
  assert.ok(Math.abs(memory.latestTrace().strength - Math.exp(-2 / 15)) < 1e-12);
});

test("pigment contact must last long enough regardless of the page's age", () => {
  let mixtures = 0;
  const status = { textContent: "" };
  const context = {
    innerWidth: 1200, innerHeight: 800, devicePixelRatio: 1,
    addEventListener() {},
    document: { querySelector: () => status },
    status,
    memory: { addBehavior: () => { mixtures++; } },
    updateDiscoveries() {},
    clamp: value => Math.max(0, Math.min(1, value))
  };
  const definition = source.slice(source.indexOf("class ColourField"), source.indexOf("class GardenField"));
  const ColourField = vm.runInNewContext(definition + "; ColourField;", context);
  const paint = new Proxy({}, { get: () => () => {} });
  const field = new ColourField({ getContext: () => paint, addEventListener() {} });
  field.sources.forEach(pigment => { pigment.x = .5; pigment.y = .5; });
  for (let frame = 0; frame < 30; frame++) field.draw(120_000 + frame * 1000 / 60, 1 / 60);
  assert.equal(mixtures, 0, "half a second of contact is insufficient");
  for (let frame = 0; frame < 15; frame++) field.draw(120_500 + frame * 1000 / 60, 1 / 60);
  assert.equal(mixtures, 1, "sustained contact forms one mixture");
});

test("keyboard gestures can satisfy movement without pointer coordinates", () => {
  let handler;
  const context = {
    currentPlace: "colour", movementBank: 0, innerWidth: 1200, innerHeight: 800,
    noteMovement() {},
    addEventListener: (_name, listener) => { handler = listener; }
  };
  const start = source.indexOf('addEventListener("keydown", event => {\n  if ([');
  assert.ok(start > 0);
  vm.runInNewContext(source.slice(start, source.indexOf("function frame(now)", start)), context);
  context.currentPlace = "threshold";
  handler({ key: "Enter", repeat: false });
  assert.equal(context.movementBank, 0);
  context.currentPlace = "colour";
  for (let press = 0; press < 20; press++) handler({ key: "ArrowRight", repeat: false });
  assert.ok(context.movementBank > 1.6);
  const movement = context.movementBank;
  handler({ key: "ArrowRight", repeat: true });
  assert.equal(context.movementBank, movement);
});
