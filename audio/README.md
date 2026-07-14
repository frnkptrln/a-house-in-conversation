# Threshold mobile audio

`threshold.m4a` is a 72-second fixed render of the threshold's E–B–F-sharp–A musical seed. Touch devices play it as native media so the house remains audible when mobile browsers suppress oscillator-based Web Audio. Desktop browsers keep the live generative version.

Rebuild and encode the mobile render:

```bash
python audio/threshold-score.py
ffmpeg -i audio/threshold.wav -af "loudnorm=I=-23:TP=-2:LRA=7" -ar 44100 -c:a aac -b:a 80k -movflags +faststart audio/threshold.m4a
```
