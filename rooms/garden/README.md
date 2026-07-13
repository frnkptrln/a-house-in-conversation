# The Garden

The third room in **A House in Conversation**: a 144-second generative garden with a fixed original score, slow deterministic growth, and touch-invited blooms.

The threshold's four-note seed becomes the house's first clearly recognizable melody here. Returning changes the garden's density through local browser memory; there is no score, target state, analytics, or external service.

The fixed soundtrack can be rebuilt from `score.py` and then encoded to AAC:

```bash
python score.py /tmp/garden.wav
ffmpeg -i /tmp/garden.wav -af loudnorm=I=-18:TP=-1.5:LRA=9 -c:a aac -b:a 144k audio/garden.m4a
```
