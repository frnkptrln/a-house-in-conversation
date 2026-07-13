#!/usr/bin/env python3
"""Render the fixed score for The Garden.

The threshold's E–B–F♯–A seed grows into a warm, melodic form. The
composition is deterministic so the room can be rebuilt without external
recordings, plugins, or services.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt


RATE = 44_100
DURATION = 144.0
SAMPLES = int(RATE * DURATION)
RNG = np.random.default_rng(260713)


def frequency(midi_note: float) -> float:
    return 440.0 * 2.0 ** ((midi_note - 69.0) / 12.0)


def constant_power_pan(pan: float) -> tuple[float, float]:
    angle = (np.clip(pan, -1.0, 1.0) + 1.0) * np.pi / 4.0
    return float(np.cos(angle)), float(np.sin(angle))


def window(length: int, attack: float, release: float) -> np.ndarray:
    envelope = np.ones(length, dtype=np.float32)
    attack_samples = min(length, max(1, int(attack * RATE)))
    release_samples = min(length, max(1, int(release * RATE)))
    envelope[:attack_samples] = np.sin(np.linspace(0, np.pi / 2, attack_samples, dtype=np.float32)) ** 2
    envelope[-release_samples:] *= np.cos(np.linspace(0, np.pi / 2, release_samples, dtype=np.float32)) ** 2
    return envelope


class GardenScore:
    def __init__(self) -> None:
        self.mix = np.zeros((2, SAMPLES), dtype=np.float32)

    def add(self, signal: np.ndarray, start: float, amplitude: float, pan: float) -> None:
        begin = max(0, int(start * RATE))
        end = min(SAMPLES, begin + signal.size)
        if end <= begin:
            return
        left, right = constant_power_pan(pan)
        segment = signal[: end - begin] * amplitude
        self.mix[0, begin:end] += segment * left
        self.mix[1, begin:end] += segment * right

    def pad(self, start: float, duration: float, midi_notes: list[int], amplitude: float, pan: float) -> None:
        length = min(SAMPLES - int(start * RATE), int(duration * RATE))
        if length <= 0:
            return
        time = np.arange(length, dtype=np.float32) / RATE
        signal = np.zeros(length, dtype=np.float32)
        for index, note in enumerate(midi_notes):
            hz = frequency(note)
            phase = RNG.uniform(0, np.pi * 2)
            drift = .016 * np.sin(2 * np.pi * (.018 + index * .004) * time + phase)
            voice = np.sin(2 * np.pi * hz * time + drift + phase)
            voice += .22 * np.sin(2 * np.pi * hz * 2.002 * time + phase * .7)
            voice += .07 * np.sin(2 * np.pi * hz * 3.997 * time + phase * 1.3)
            signal += voice.astype(np.float32) / (1.29 * len(midi_notes))
        signal *= window(length, 7.5, 10.0)
        signal *= (.88 + .12 * np.sin(2 * np.pi * .027 * time + pan)).astype(np.float32)
        self.add(signal, start, amplitude, pan)

    def bass(self, start: float, duration: float, midi_note: int, amplitude: float = .045) -> None:
        length = min(SAMPLES - int(start * RATE), int(duration * RATE))
        if length <= 0:
            return
        time = np.arange(length, dtype=np.float32) / RATE
        hz = frequency(midi_note)
        signal = np.sin(2 * np.pi * hz * time)
        signal += .16 * np.sin(2 * np.pi * hz * 2 * time + .3)
        signal *= window(length, 4.5, 7.0)
        self.add(signal.astype(np.float32), start, amplitude, -.08)

    def note(
        self,
        start: float,
        duration: float,
        midi_note: int,
        amplitude: float = .075,
        pan: float = 0,
        softness: float = 1,
    ) -> None:
        length = min(SAMPLES - int(start * RATE), int(duration * RATE))
        if length <= 0:
            return
        time = np.arange(length, dtype=np.float32) / RATE
        hz = frequency(midi_note)
        phase = RNG.uniform(0, np.pi * 2)
        vibrato = .018 * np.sin(2 * np.pi * (.32 + RNG.uniform(-.05, .05)) * time + phase)
        signal = np.sin(2 * np.pi * hz * time + vibrato)
        signal += .23 / softness * np.sin(2 * np.pi * hz * 2.001 * time + phase * .41)
        signal += .075 / softness * np.sin(2 * np.pi * hz * 3.004 * time + phase * .83)
        envelope = window(length, .34 * softness, min(duration * .72, 2.8 * softness))
        envelope *= np.exp(-time * (.16 / softness)).astype(np.float32)
        self.add((signal * envelope / 1.3).astype(np.float32), start, amplitude, pan)

    def bell(self, start: float, midi_note: int, amplitude: float = .027, pan: float = 0) -> None:
        duration = 5.8
        length = min(SAMPLES - int(start * RATE), int(duration * RATE))
        if length <= 0:
            return
        time = np.arange(length, dtype=np.float32) / RATE
        hz = frequency(midi_note)
        signal = np.zeros(length, dtype=np.float32)
        for partial, weight, decay in ((1, 1, .55), (2.01, .31, .9), (3.98, .12, 1.4), (6.07, .045, 2.1)):
            signal += weight * np.sin(2 * np.pi * hz * partial * time) * np.exp(-time * decay)
        signal *= window(length, .012, 2.4)
        self.add(signal / 1.48, start, amplitude, pan)

    def texture(self) -> None:
        noise = RNG.normal(0, 1, SAMPLES).astype(np.float32)
        rustle_filter = butter(2, [280, 4_200], btype="bandpass", fs=RATE, output="sos")
        rustle = sosfilt(rustle_filter, noise).astype(np.float32)
        time = np.arange(SAMPLES, dtype=np.float32) / RATE
        movement = .34 + .66 * (
            .5 + .5 * np.sin(2 * np.pi * .021 * time + .7)
        ) * (
            .5 + .5 * np.sin(2 * np.pi * .033 * time + 2.1)
        )
        rustle *= movement.astype(np.float32) * .0065
        self.mix[0] += rustle
        self.mix[1] += np.roll(rustle, int(.037 * RATE)) * .84

        for start in (18.5, 43.2, 67.8, 91.5, 116.1, 133.4):
            length = int(7.5 * RATE)
            time_local = np.arange(length, dtype=np.float32) / RATE
            breath = RNG.normal(0, 1, length).astype(np.float32)
            breath = sosfilt(butter(2, 620, btype="lowpass", fs=RATE, output="sos"), breath).astype(np.float32)
            breath *= window(length, 2.8, 3.8) * .013
            breath *= (1 + .16 * np.sin(2 * np.pi * .18 * time_local)).astype(np.float32)
            self.add(breath, start, 1, RNG.uniform(-.7, .7))

    def melody(self) -> None:
        phrases = [
            (7.0, [64, 71, 66, 69], [0, 3.2, 7.1, 11.5], .066),
            (30.5, [64, 71, 66, 69, 68, 73, 71, 76], [0, 2.25, 4.55, 6.9, 9.9, 11.8, 14.1, 16.8], .073),
            (58.5, [64, 71, 66, 69, 73, 68, 71, 76, 78, 76], [0, 2.1, 4.4, 6.7, 9.35, 11.2, 13.4, 15.6, 17.8, 20.3], .076),
            (87.0, [52, 59, 54, 57, 64, 66, 68, 69, 73, 71], [0, 3.0, 6.5, 10.0, 13.6, 15.6, 17.7, 19.8, 22.2, 24.5], .071),
            (116.0, [64, 71, 66, 69, 68, 73, 71, 76, 78, 80, 76], [0, 2.05, 4.25, 6.55, 9.0, 10.8, 12.85, 15.05, 17.1, 19.5, 22.0], .078),
        ]
        pans = (-.42, .34, -.18, .22, -.3, .4, -.08, .28, -.36, .18, 0)
        for phrase_start, notes, offsets, amplitude in phrases:
            for index, (note, offset) in enumerate(zip(notes, offsets, strict=True)):
                duration = 3.8 if index < len(notes) - 1 else 5.6
                self.note(phrase_start + offset, duration, note, amplitude, pans[index], 1.12)

        counterpoint = [
            (64.2, 52, 7.5, -.56), (70.8, 57, 6.2, .48), (77.0, 61, 7.2, -.24),
            (99.0, 59, 7.5, .51), (105.5, 61, 6.4, -.48), (111.0, 64, 7.1, .18),
            (125.4, 73, 5.4, -.52), (130.0, 76, 6.0, .46), (135.0, 80, 6.8, .02),
        ]
        for start, note, duration, pan in counterpoint:
            self.note(start, duration, note, .041, pan, 1.7)

        for start, note, pan in (
            (22.4, 83, .62), (26.1, 78, -.58), (49.5, 80, .48), (53.2, 85, -.42),
            (81.0, 83, .55), (84.3, 88, -.5), (109.0, 85, .57), (113.2, 90, -.44),
            (139.0, 88, .38),
        ):
            self.bell(start, note, .024, pan)

    def harmony(self) -> None:
        chords = [
            (0.0, 37.0, [40, 47, 52, 54, 56], .082, -.18),
            (25.5, 38.0, [33, 40, 45, 47, 49], .078, .22),
            (52.0, 38.0, [37, 44, 47, 52, 56], .082, -.24),
            (78.5, 39.0, [35, 42, 45, 52, 54], .079, .2),
            (105.5, 38.5, [40, 47, 52, 54, 56, 61], .088, 0),
        ]
        for start, duration, notes, amplitude, pan in chords:
            self.pad(start, duration, notes, amplitude, pan)

        for start, duration, note in (
            (0, 32, 28), (27, 32, 33), (54, 31, 37), (81, 31, 35), (108, 36, 28)
        ):
            self.bass(start, duration, note)

    def space(self) -> None:
        dry = self.mix.copy()
        wet = np.zeros_like(self.mix)
        echoes = ((.17, .23), (.31, .18), (.47, .14), (.73, .11), (1.13, .08), (1.79, .055), (2.41, .038))
        for delay, gain in echoes:
            offset = int(delay * RATE)
            wet[0, offset:] += dry[1, :-offset] * gain
            wet[1, offset:] += dry[0, :-offset] * gain
        wet_filter = butter(2, 5_800, btype="lowpass", fs=RATE, output="sos")
        wet[0] = sosfilt(wet_filter, wet[0]).astype(np.float32)
        wet[1] = sosfilt(wet_filter, wet[1]).astype(np.float32)
        self.mix = dry * .88 + wet * .92

    def finish(self) -> np.ndarray:
        self.harmony()
        self.texture()
        self.melody()
        self.space()

        highpass = butter(2, 28, btype="highpass", fs=RATE, output="sos")
        self.mix[0] = sosfilt(highpass, self.mix[0]).astype(np.float32)
        self.mix[1] = sosfilt(highpass, self.mix[1]).astype(np.float32)

        fade_in = int(5.5 * RATE)
        fade_out = int(8.5 * RATE)
        self.mix[:, :fade_in] *= np.sin(np.linspace(0, np.pi / 2, fade_in, dtype=np.float32)) ** 2
        self.mix[:, -fade_out:] *= np.cos(np.linspace(0, np.pi / 2, fade_out, dtype=np.float32)) ** 2

        self.mix = np.tanh(self.mix * 1.42).astype(np.float32)
        peak = float(np.max(np.abs(self.mix)))
        if peak:
            self.mix *= .86 / peak
        return np.transpose(self.mix)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path, help="Destination WAV file")
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    score = GardenScore().finish()
    wavfile.write(args.output, RATE, np.int16(np.clip(score, -1, 1) * 32767))


if __name__ == "__main__":
    main()
