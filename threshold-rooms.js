"use strict";

// Each aperture at the threshold is a live miniature of the room behind it,
// drawn onto the threshold canvas rather than painted as a gradient in CSS.
// The point is that no two rooms should look like the same object: the Colour
// Room is loud, the Afterimage barely there, the Machine Room has corners and
// the Window has a horizon. Every painter is deterministic in time, so nothing
// flickers, and all of them are cheap enough to run eight at once.

const TAU = Math.PI * 2;

function wave(time, speed, phase = 0) {
  return Math.sin(time * speed + phase);
}

function fade(time, speed, phase = 0) {
  return (wave(time, speed, phase) + 1) / 2;
}

function clipRoom(context, rect, kind) {
  context.beginPath();
  if (kind === "corners") {
    const radius = Math.min(rect.w, rect.h) * .05;
    if (context.roundRect) context.roundRect(rect.x, rect.y, rect.w, rect.h, radius);
    else context.rect(rect.x, rect.y, rect.w, rect.h);
  } else if (kind === "pane") {
    const radius = Math.min(rect.w, rect.h) * .04;
    if (context.roundRect) context.roundRect(rect.x, rect.y, rect.w, rect.h, radius);
    else context.rect(rect.x, rect.y, rect.w, rect.h);
  } else {
    context.ellipse(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, rect.h / 2, 0, 0, TAU);
  }
  context.clip();
}

function ground(context, rect, colour) {
  context.fillStyle = colour;
  context.fillRect(rect.x, rect.y, rect.w, rect.h);
}

function glow(context, x, y, radius, colour, strength) {
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(${colour},${strength})`);
  gradient.addColorStop(.5, `rgba(${colour},${strength * .34})`);
  gradient.addColorStop(1, `rgba(${colour},0)`);
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(x, y, radius, 0, TAU);
  context.fill();
}

const roomMiniatures = {
  // Dark, typographic, relational. Lines of type arrive, hold, and are gone;
  // now and then one slips sideways.
  conversation(context, rect, time, energy) {
    ground(context, rect, "#0a0a12");
    glow(context, rect.x + rect.w * .34, rect.y + rect.h * .66, rect.w * .74, "241,182,110", .17 * energy);
    glow(context, rect.x + rect.w * .68, rect.y + rect.h * .33, rect.w * .66, "167,139,250", .2 * energy);

    const lines = [
      { y: .34, w: .52, speed: .00021 },
      { y: .45, w: .34, speed: .00017, phase: 2.1 },
      { y: .56, w: .61, speed: .00019, phase: 4.3 },
      { y: .67, w: .27, speed: .00023, phase: 1.2 }
    ];

    for (const line of lines) {
      const presence = Math.max(0, wave(time, line.speed, line.phase || 0));
      if (presence < .02) continue;
      const slip = Math.sin(time * .0009 + line.y * 31) > .992 ? rect.w * .05 : 0;
      const height = Math.max(1.4, rect.h * .019);
      context.fillStyle = `rgba(236,234,244,${presence * .5 * energy})`;
      context.fillRect(
        rect.x + rect.w * .19 + slip,
        rect.y + rect.h * line.y,
        rect.w * line.w * (.55 + presence * .45),
        height
      );
    }
  },

  // The loud one. Two fields approach, and where they meet they make a third
  // that neither of them contained.
  colour(context, rect, time, energy) {
    ground(context, rect, "#120a14");
    const centreX = rect.x + rect.w / 2;
    const centreY = rect.y + rect.h / 2;
    const reach = rect.w * .3;
    const closing = fade(time, .00013);

    context.save();
    context.globalCompositeOperation = "lighter";
    glow(
      context,
      centreX - reach * (1 - closing * .82),
      centreY - rect.h * .1 * (1 - closing),
      rect.w * .58,
      "255,111,145",
      .78 * energy
    );
    glow(
      context,
      centreX + reach * (1 - closing * .82),
      centreY + rect.h * .1 * (1 - closing),
      rect.w * .56,
      "90,141,255",
      .74 * energy
    );
    glow(context, centreX, centreY, rect.w * .3 * closing, "112,225,209", .34 * closing * energy);
    context.restore();
  },

  // Deterministic growth without a target state. Stems rise, blooms open when
  // they are ready to.
  garden(context, rect, time, energy) {
    ground(context, rect, "#0b1109");
    glow(context, rect.x + rect.w * .5, rect.y + rect.h * .8, rect.w * .8, "126,166,102", .16 * energy);

    const base = rect.y + rect.h;
    for (let index = 0; index < 7; index++) {
      const at = rect.x + rect.w * (.16 + index * .115);
      const grown = .3 + fade(time, .00007, index * 1.31) * .52;
      const top = base - rect.h * grown;
      const lean = Math.sin(time * .00013 + index) * rect.w * .035;

      context.beginPath();
      context.moveTo(at, base);
      context.quadraticCurveTo(at + lean, (base + top) / 2, at + lean * 1.7, top);
      context.strokeStyle = `rgba(140,182,112,${(.3 + grown * .4) * energy})`;
      context.lineWidth = Math.max(1, rect.w * .008);
      context.stroke();

      const opening = Math.max(0, wave(time, .00009, index * 2.07) - .55) / .45;
      if (opening <= 0) continue;
      context.beginPath();
      context.arc(at + lean * 1.7, top, rect.w * .022 * opening, 0, TAU);
      context.fillStyle = `rgba(240,206,132,${opening * .8 * energy})`;
      context.fill();
    }
  },

  // A position inside a composition: near rings pass, far ones keep arriving.
  listening(context, rect, time, energy) {
    ground(context, rect, "#0a0e11");
    const centreX = rect.x + rect.w * .5;
    const centreY = rect.y + rect.h * .5;
    const furthest = rect.w * .62;

    for (let index = 0; index < 5; index++) {
      const travel = ((time * .00007 + index / 5) % 1);
      const radius = travel * furthest;
      const presence = Math.sin(travel * Math.PI);
      context.beginPath();
      context.arc(centreX, centreY, radius, 0, TAU);
      context.strokeStyle = `rgba(178,201,211,${presence * .34 * energy})`;
      context.lineWidth = Math.max(1, rect.w * .011 * (1 - travel));
      context.stroke();
    }

    glow(context, centreX, centreY, rect.w * .2, "201,213,215", .2 * energy);
  },

  // What is left after the light. The shape is always already leaving.
  afterimage(context, rect, time, energy) {
    ground(context, rect, "#070608");
    const centreX = rect.x + rect.w * .5;
    const centreY = rect.y + rect.h * .5;

    for (let step = 7; step >= 0; step--) {
      const past = time - step * 620;
      const x = centreX + Math.sin(past * .00011) * rect.w * .22;
      const y = centreY + Math.cos(past * .00008) * rect.h * .2;
      const remaining = (1 - step / 8) ** 2.4;
      glow(context, x, y, rect.w * (.2 + step * .022), "180,155,130", remaining * .3 * energy);
    }

    glow(context, centreX, centreY, rect.w * .5, "142,168,183", .07 * energy);
  },

  // A horizon rather than a place: sky, one ridge, a few lights that are not
  // anywhere in particular.
  window(context, rect, time, energy) {
    const horizon = rect.y + rect.h * .66;
    const sky = context.createLinearGradient(rect.x, rect.y, rect.x, horizon);
    sky.addColorStop(0, "#0a1a2a");
    sky.addColorStop(.62, "#26384a");
    sky.addColorStop(1, "#8a6b58");
    context.fillStyle = sky;
    context.fillRect(rect.x, rect.y, rect.w, horizon - rect.y);

    context.fillStyle = "rgba(232,178,124,.2)";
    context.fillRect(rect.x, horizon - rect.h * .1, rect.w, rect.h * .1);

    for (let index = 0; index < 7; index++) {
      const x = rect.x + rect.w * ((index * .1913 + .07) % 1);
      const y = rect.y + rect.h * (.08 + (index * .2371 % 1) * .42);
      const twinkle = .3 + fade(time, .00035, index * 2.2) * .7;
      context.fillStyle = `rgba(225,234,237,${twinkle * .5 * energy})`;
      context.fillRect(x, y, 1.3, 1.3);
    }

    context.beginPath();
    context.moveTo(rect.x, rect.y + rect.h);
    context.lineTo(rect.x, horizon + rect.h * .02);
    for (let step = 0; step <= 10; step++) {
      const x = rect.x + rect.w * step / 10;
      const ridge = horizon + rect.h * (.02 - Math.sin(step * .74 + 1.2) * .045);
      context.lineTo(x, ridge);
    }
    context.lineTo(rect.x + rect.w, rect.y + rect.h);
    context.closePath();
    context.fillStyle = "#050d14";
    context.fill();

    for (let index = 0; index < 4; index++) {
      const x = rect.x + rect.w * (.18 + index * .21);
      const y = horizon + rect.h * .055;
      glow(context, x, y, rect.w * .035, "250,209,146", .5 * energy);
    }

    const sheen = context.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
    sheen.addColorStop(0, "rgba(200,213,216,0)");
    sheen.addColorStop(.42, `rgba(200,213,216,${.05 * energy})`);
    sheen.addColorStop(.55, "rgba(200,213,216,0)");
    context.fillStyle = sheen;
    context.fillRect(rect.x, rect.y, rect.w, rect.h);
  },

  // The mechanism, still running, and showing the seed as it currently stands.
  machine(context, rect, time, energy) {
    ground(context, rect, "#070a0c");
    const centreX = rect.x + rect.w * .5;
    const centreY = rect.y + rect.h * .5;
    const radius = Math.min(rect.w, rect.h) * .19;
    const step = Math.min(rect.w, rect.h) * .043;
    const seed = typeof readSeed === "function" ? readSeed() : [0, 4, 1, 3];
    const scale = typeof SEED_SCALE !== "undefined" ? SEED_SCALE : [0, 2, 4, 5, 7, 9, 11, 12, 14];

    for (let ring = 0; ring < 4; ring++) {
      context.beginPath();
      context.arc(centreX, centreY, radius + ring * step * 2, 0, TAU);
      context.strokeStyle = `rgba(140,166,176,${(ring === 0 ? .22 : .07) * energy})`;
      context.lineWidth = 1;
      context.stroke();
    }

    const phase = (time * .0001) % 1;
    const rotor = -Math.PI / 2 + phase * TAU;
    const reach = radius + (scale.length - 1) * step;
    const sweep = context.createLinearGradient(
      centreX, centreY,
      centreX + Math.cos(rotor) * reach, centreY + Math.sin(rotor) * reach
    );
    sweep.addColorStop(0, "rgba(112,225,209,0)");
    sweep.addColorStop(1, `rgba(112,225,209,${.6 * energy})`);
    context.beginPath();
    context.moveTo(centreX, centreY);
    context.lineTo(centreX + Math.cos(rotor) * reach, centreY + Math.sin(rotor) * reach);
    context.strokeStyle = sweep;
    context.stroke();

    for (let slot = 0; slot < 4; slot++) {
      const angle = -Math.PI / 2 + slot * TAU / 4;
      const distance = radius + seed[slot] * step;
      const x = centreX + Math.cos(angle) * distance;
      const y = centreY + Math.sin(angle) * distance;
      const struck = Math.max(0, 1 - ((phase - slot / 4 + 1) % 1) * 5);
      const size = Math.max(1.8, rect.w * .022);

      context.beginPath();
      context.moveTo(centreX + Math.cos(angle) * radius, centreY + Math.sin(angle) * radius);
      context.lineTo(x, y);
      context.strokeStyle = `rgba(219,228,232,${(.16 + struck * .5) * energy})`;
      context.stroke();

      if (struck > .02) glow(context, x, y, rect.w * .1, "112,225,209", struck * .4 * energy);

      context.strokeStyle = `rgba(219,228,232,${(.42 + struck * .58) * energy})`;
      context.strokeRect(x - size, y - size, size * 2, size * 2);
    }
  },

  // Fragments surface, occasionally reach for one another, and go.
  archive(context, rect, time, energy) {
    ground(context, rect, "#0c0b0a");
    glow(context, rect.x + rect.w * .45, rect.y + rect.h * .42, rect.w * .7, "184,173,156", .1 * energy);

    const visible = [];
    for (let index = 0; index < 4; index++) {
      const presence = Math.max(0, wave(time, .00011, index * 1.87));
      if (presence < .04) continue;
      const x = rect.x + rect.w * (.2 + (index * .2683 % 1) * .55);
      const y = rect.y + rect.h * (.26 + (index * .4139 % 1) * .48);
      const width = rect.w * (.16 + (index % 3) * .1);
      visible.push({ x, y, width, presence });
    }

    for (let index = 0; index < visible.length; index++) {
      for (let other = index + 1; other < visible.length; other++) {
        const a = visible[index];
        const b = visible[other];
        context.beginPath();
        context.moveTo(a.x + a.width / 2, a.y);
        context.lineTo(b.x + b.width / 2, b.y);
        context.strokeStyle = `rgba(184,173,156,${Math.min(a.presence, b.presence) * .16 * energy})`;
        context.lineWidth = 1;
        context.stroke();
      }
    }

    for (const fragment of visible) {
      context.fillStyle = `rgba(230,224,214,${fragment.presence * .46 * energy})`;
      context.fillRect(fragment.x, fragment.y, fragment.width, Math.max(1.2, rect.h * .014));
    }
  }
};

// Without this the miniatures read as pictures stuck onto the field rather
// than as openings in it. The edge of every room dissolves into the night the
// house is drawn on.
function softenEdge(context, rect, kind) {
  const centreX = rect.x + rect.w / 2;
  const centreY = rect.y + rect.h / 2;
  const reach = Math.max(rect.w, rect.h) * .72;
  const start = kind ? .74 : .58;

  const vignette = context.createRadialGradient(centreX, centreY, reach * start, centreX, centreY, reach);
  vignette.addColorStop(0, "rgba(11,12,21,0)");
  vignette.addColorStop(.62, "rgba(11,12,21,.42)");
  vignette.addColorStop(1, "rgba(11,12,21,.94)");
  context.fillStyle = vignette;
  context.fillRect(rect.x, rect.y, rect.w, rect.h);
}

const roomShapes = {
  machine: "corners",
  window: "pane"
};
