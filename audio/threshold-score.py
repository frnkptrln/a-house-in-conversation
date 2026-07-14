#!/usr/bin/env python3
"""Render the native mobile threshold loop from the house's Web Audio seed."""

from pathlib import Path
import wave

import numpy as np
from scipy.signal import butter, lfilter, sosfilt


SAMPLE_RATE = 44_100
DURATION = 72.0
FRAMES = int(SAMPLE_RATE * DURATION)
TIME = np.arange(FRAMES, dtype=np.float64) / SAMPLE_RATE
RNG = np.random.default_rng(41)


def oscillator(frequency, gain, pan, waveform="sine"):
    detune = 2 ** ((4.5 * np.sin(2 * np.pi * 0.035 * TIME)) / 1200)
    phase = 2 * np.pi * np.cumsum(frequency * detune) / SAMPLE_RATE
    signal = np.sin(phase)
    if waveform == "triangle":
        signal = 2 / np.pi * np.arcsin(signal)
    left = np.sqrt((1 - pan) / 2)
    right = np.sqrt((1 + pan) / 2)
    return np.column_stack((signal * gain * left, signal * gain * right))


mix = np.zeros((FRAMES, 2), dtype=np.float64)
mix += oscillator(82.41, 0.026, -0.38)
mix += oscillator(123.47, 0.016, 0.34)
mix += oscillator(164.81, 0.009, 0.06, "triangle")

white = RNG.uniform(-1, 1, FRAMES)
brown = lfilter([0.035], [1, -0.985], white)
mix += np.column_stack((brown, np.roll(brown, 733))) * 0.012

motif_notes = [
    (329.63, -0.38),
    (493.88, 0.34),
    (369.99, -0.12),
    (440.00, 0.22),
]
motif_forms = [
    (0, 2.75, 5.90, 9.15),
    (0, 3.20, 6.05, 9.80),
    (0, 2.90, 6.40, 9.35),
]

for form_index, origin in enumerate((3.0, 27.0, 51.0)):
    form = motif_forms[form_index % len(motif_forms)]
    for note_index, (frequency, pan) in enumerate(motif_notes):
        onset = origin + form[note_index]
        duration = 3.5 if note_index == 3 else 2.7
        start = int(onset * SAMPLE_RATE)
        stop = min(FRAMES, start + int(duration * SAMPLE_RATE))
        local_time = np.arange(stop - start, dtype=np.float64) / SAMPLE_RATE
        envelope = np.minimum(1, local_time / 0.34)
        envelope *= np.exp(-2.9 * np.maximum(0, local_time - 0.34) / duration)
        envelope *= np.sin(np.pi * np.minimum(1, local_time / duration)) ** 0.35
        tone = np.sin(2 * np.pi * frequency * local_time) * envelope * 0.019
        left = np.sqrt((1 - pan) / 2)
        right = np.sqrt((1 + pan) / 2)
        mix[start:stop, 0] += tone * left
        mix[start:stop, 1] += tone * right

sos = butter(3, 1_150, btype="lowpass", fs=SAMPLE_RATE, output="sos")
mix = sosfilt(sos, mix, axis=0)

fade_frames = int(2.5 * SAMPLE_RATE)
fade = np.sin(np.linspace(0, np.pi / 2, fade_frames)) ** 2
mix[:fade_frames] *= fade[:, None]
mix[-fade_frames:] *= fade[::-1, None]

peak = np.max(np.abs(mix))
mix *= 0.42 / max(peak, 1e-9)
pcm = np.clip(mix * 32767, -32768, 32767).astype("<i2")

output = Path(__file__).with_name("threshold.wav")
with wave.open(str(output), "wb") as target:
    target.setnchannels(2)
    target.setsampwidth(2)
    target.setframerate(SAMPLE_RATE)
    target.writeframes(pcm.tobytes())

print(output)
