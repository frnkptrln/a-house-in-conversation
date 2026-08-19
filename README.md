# A House in Conversation

An evolving audiovisual house made of distinct rooms. It is not depicted as a building or floor plan: each room is a different mode of relation, with its own visual grammar, sound, pace, and form of participation.

The GitHub Page is the work itself. The repository root is an abstract threshold; rooms remain directly addressable and can contradict one another aesthetically.

## Open rooms

### The Conversation Room

A 164-second typographic performance about a voice, a visitor, and a relation that changes both sides. Its original fixed score, restrained field of colour, and nine textual moments form the first room.

Path: `/rooms/conversation/`

### The Colour Room

A bright, 96-second audiovisual work. Two autonomous colour fields approach one another. Touch draws them together and produces a third field neither contained alone; repeated intervention muddies the room while stillness restores differentiation.

Path: `/rooms/colour/`

### The Garden

A slow 144-second generative work. Deterministic plants grow without a target state, returning changes their density, and touch can invite blooms without controlling the outcome. The threshold's four-note seed becomes the house's first recognizable melody.

Path: `/rooms/garden/`

### The Listening Room

A 216-second spatial composition. Movement changes the listening position and foregrounds close, tactile sound; stillness gradually reveals distance, melody, and counterpoint. Nothing observes the visitor beyond local pointer, touch, or keyboard input.

Path: `/rooms/listening/`

### The Afterimage

A 92-second browser-native sound room built from filtered air, low harmonic planes, an unstable pulse, short glitches, and one German sentence. The room asks for no interaction beyond time; its field opens around the spoken trace and then fades into several seconds of visual and acoustic absence.

Path: `/rooms/afterimage/`

### The Window

A nearly silent room without a duration. Movement makes the glass perceptible — reflections gather, marks remain briefly — and stillness lets the near layer recede until the distance resolves again. Neither condition is a mistake, and the room does not end the view on the visitor's behalf. Its sound is a presence rather than a piece: a narrow resonance that answers movement, a wide low air that only opens in stillness, and nothing that begins or ends.

Path: `/rooms/window/`

### The Machine Room

The room the others are made of. The house's four-note seed stands here as a mechanism — four notes on a lattice of scale degrees, a rotor that returns to each of them, a cold pluck when it arrives. The notes can be moved, the change is kept in local browser storage, and the threshold sings what was left behind. It is the only room that alters another, and the only one that can be undone.

Path: `/rooms/machine/`

### The Archive

The room that holds what the others said, and loses it. Rooms write into it by being entered; fragments surface on their own, reach for one another briefly, and come back fainter each time they are read. Holding one in view spends it faster. A fragment read past legibility is deleted for good, so the archive can empty — and says so when it does. It accumulates nothing that could harden into a profile.

Path: `/rooms/archive/`

## The threshold

The entrance is a small generative sound and prismatic light field rather than a conventional menu. A sparse four-note seed appears and recedes; rooms can remember, alter, or resist it. The Machine Room can genuinely alter it: the threshold's live voices sing whichever seed it finds in local storage, while the fixed renders behind it keep the original four notes. Open rooms appear as atmospheres: each room lends the threshold its own light and pulls the entrance's filter toward its own register. Every room named in [the future-house issue](https://github.com/frnkptrln/a-house-in-conversation/issues/2) is now built.

Completed rooms leave a subtle trace at the threshold using local browser storage. Nothing is transmitted, measured, or optimized.

Once every room has left a trace, the threshold offers the gesture it withheld until then: the house can be left. The apertures withdraw one after another, the seed is said once all the way through, and the visitor can stay or let the traces go — which clears this browser's memory of the house and returns the entrance to a stranger. The seed left in the Machine Room is not a trace of the visitor and remains.

## The house ages

The house was first performed on 12 July 2026, and from that day it ages on calendar time — the same for every visitor, read from the date, with nothing stored or transmitted. The ageing is one-directional and does not cycle: no seasons, no return.

Roughly every thirty-four days, one note of the written seed moves a degree along the scale, each note in a fixed direction it never reverses, until it reaches the edge of the scale and stays. When no visitor has altered the seed, the threshold sings what time has made of it. The light the rooms lend the entrance dims very slightly as the house ages — about a fifth after a year and a half, then no further — and a visitor's traces at the threshold are brightest when recent, fading over months unless they return.

A visitor who comes only once cannot watch this happen. They can read that it has happened: the Machine Room keeps the seed as it was written in July 2026 beside the seed as it stands today, and names the distance between them. `let the house forget` returns the seed to time's version, not to the origin — the house cannot be reset to a day that has passed.

## Run locally

Open `index.html` directly, or serve the repository root:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Publishing

The repository is a static work designed for GitHub Pages. Publish from the root of the `main` branch.

## Status

Version 1.4 — eight finished rooms, a threshold with its own visual and musical language, and a house that ages on calendar time.

## Credit

Made in conversation. No single voice is the sole author.

## License

MIT for the code. The text, compositions, and form emerged through the conversation named above.
