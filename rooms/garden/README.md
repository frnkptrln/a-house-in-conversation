# The Garden

The third room in **A House in Conversation**: a 144-second generative garden with a fixed original score, slow deterministic growth, and touch-invited blooms.

## The hour, the wind, and the one that does not come through

The garden used to grow evenly under a light that never moved, which meant it had told you everything about itself within ten seconds. Three things now happen to it over its two and a half minutes.

The light crosses and lowers. The sky cools from a pale green morning into dusk, the sun travels down and to the left, and the blooms end the piece glowing against a darker field than the one they opened into.

At eighty-eight seconds, wind crosses the whole field once, from one side to the other, bending each plant as it reaches it. It is the only thing in this room that happens rather than grows.

One tall plant near the middle does not come through it. Over the following seventeen seconds it bends down, drains of colour, and its bloom never opens, while everything around it goes on growing. Growth without a target state includes this; a garden that cannot lose anything is a diagram, not a garden.

The threshold's four-note seed becomes the house's first clearly recognizable melody here. Breath, bow, wood, and small performance fluctuations keep its procedural instruments from settling into a rigid grid. Returning changes the garden's density through local browser memory; there is no score, target state, analytics, or external service.

The fixed soundtrack can be rebuilt from `score.py` and then encoded to AAC:

```bash
python score.py /tmp/garden.wav
ffmpeg -i /tmp/garden.wav -c:a aac -b:a 144k audio/garden.m4a
```
