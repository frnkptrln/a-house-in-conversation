#!/usr/bin/env python3
"""Render the fixed score for The Garden.

The threshold's E–B–F♯–A seed grows into a warm, melodic form. Small
fluctuations of breath, bow, wood, timing, and tuning keep the performance
alive. The composition is deterministic so the room can be rebuilt without
external recordings, plugins, or services.
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
            hz = frequency(note + RNG.uniform(-.045, .045))
            phase = RNG.uniform(0, np.pi * 2)
            wander_source = RNG.normal(0, 1, length).astype(np.float32)
            wander_filter = butter(1, .42 + index * .035, btype="lowpass", fs=RATE, output="sos")
            wander = sosfilt(wander_filter, wander_source).astype(np.float32)
            wander /= max(float(np.std(wander)), 1e-6)
            cents = 1.8 * np.sin(2 * np.pi * (.055 + index * .007) * time + phase) + wander * .65
            instantaneous = hz * np.exp2(cents / 1_200)
            bowed_phase = np.cumsum(instantaneous, dtype=np.float64) * (2 * np.pi / RATE) + phase

            voice = np.zeros(length, dtype=np.float32)
            for partial, weight in ((1, 1.0), (2, .29), (3, .13), (4, .055), (5, .024)):
                voice += weight * np.sin(bowed_phase * partial + phase * partial * .17).astype(np.float32)

            bow = RNG.normal(0, 1, length).astype(np.float32)
            bow_filter = butter(2, [520, 4_600], btype="bandpass", fs=RATE, output="sos")
            bow = sosfilt(bow_filter, bow).astype(np.float32)
            gesture = .9 + .1 * np.sin(2 * np.pi * (.071 + index * .005) * time + phase * .4)
            gesture += np.clip(wander * .024, -.06, .06)
            voice = voice * gesture.astype(np.float32) + bow * .018
            signal += voice / (1.53 * len(midi_notes))
        signal *= window(length, 7.5, 10.0)
        signal *= (.86 + .14 * np.sin(2 * np.pi * .027 * time + pan)).astype(np.float32)
        self.add(signal, start, amplitude, pan)

    def bass(self, start: float, duration: float, midi_note: int, amplitude: float = .045) -> None:
        length = min(SAMPLES - int(start * RATE), int(duration * RATE))
        if length <= 0:
            return
        time = np.arange(length, dtype=np.float32) / RATE
        hz = frequency(midi_note + RNG.uniform(-.035, .035))
        phase = RNG.uniform(0, np.pi * 2)
        drift = 1.15 * np.sin(2 * np.pi * .073 * time + phase)
        instantaneous = hz * np.exp2(drift / 1_200)
        bass_phase = np.cumsum(instantaneous, dtype=np.float64) * (2 * np.pi / RATE)
        signal = np.sin(bass_phase)
        signal += .23 * np.sin(bass_phase * 2 + .3)
        signal += .07 * np.sin(bass_phase * 3 + 1.1)
        grain = RNG.normal(0, 1, length).astype(np.float32)
        grain = sosfilt(butter(2, 780, btype="lowpass", fs=RATE, output="sos"), grain).astype(np.float32)
        signal += grain * .012
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
        hz = frequency(midi_note + RNG.uniform(-.055, .055))
        phase = RNG.uniform(0, np.pi * 2)
        breath_source = RNG.normal(0, 1, length).astype(np.float32)
        breath_filter = butter(1, 2.7, btype="lowpass", fs=RATE, output="sos")
        breath_motion = sosfilt(breath_filter, breath_source).astype(np.float32)
        breath_motion /= max(float(np.std(breath_motion)), 1e-6)
        vibrato = (2.7 + .75 * np.sin(2 * np.pi * .13 * time + phase)) * np.sin(
            2 * np.pi * (4.35 + RNG.uniform(-.22, .22)) * time + phase
        )
        cents = vibrato + breath_motion * .42
        instantaneous = hz * np.exp2(cents / 1_200)
        note_phase = np.cumsum(instantaneous, dtype=np.float64) * (2 * np.pi / RATE) + phase
        signal = np.sin(note_phase)
        signal += .16 / softness * np.sin(note_phase * 2 + phase * .41)
        signal += .048 / softness * np.sin(note_phase * 3 + phase * .83)

        breath = RNG.normal(0, 1, length).astype(np.float32)
        breath = sosfilt(
            butter(2, [720, 5_200], btype="bandpass", fs=RATE, output="sos"), breath
        ).astype(np.float32)
        breath_level = .02 + .012 * np.clip(breath_motion, -.8, .8)
        signal += breath * breath_level
        envelope = window(length, .34 * softness, min(duration * .72, 2.8 * softness))
        envelope *= np.exp(-time * (.11 / softness)).astype(np.float32)
        envelope *= np.clip(1 + breath_motion * .035, .88, 1.1)
        self.add((signal * envelope / 1.22).astype(np.float32), start, amplitude, pan)

    def wood(self, start: float, midi_note: int, amplitude: float = .027, pan: float = 0) -> None:
        duration = 4.9
        length = min(SAMPLES - int(start * RATE), int(duration * RATE))
        if length <= 0:
            return
        time = np.arange(length, dtype=np.float32) / RATE
        hz = frequency(midi_note)
        signal = np.zeros(length, dtype=np.float32)
        for partial, weight, decay in ((1, 1, .78), (2.34, .26, 1.18), (3.91, .11, 1.65), (5.18, .038, 2.3)):
            signal += weight * np.sin(2 * np.pi * hz * partial * time) * np.exp(-time * decay)
        mallet = RNG.normal(0, 1, length).astype(np.float32)
        mallet = sosfilt(butter(2, 2_300, btype="lowpass", fs=RATE, output="sos"), mallet).astype(np.float32)
        mallet *= np.exp(-time * 38).astype(np.float32) * .24
        signal = (signal + mallet) * window(length, .008, 1.9)
        self.add(signal / 1.42, start, amplitude, pan)

    def texture(self) -> None:
        noise = RNG.normal(0, 1, SAMPLES).astype(np.float32)
        rustle_filter = butter(2, [340, 5_400], btype="bandpass", fs=RATE, output="sos")
        rustle = sosfilt(rustle_filter, noise).astype(np.float32)
        time = np.arange(SAMPLES, dtype=np.float32) / RATE
        movement_noise = RNG.normal(0, 1, SAMPLES).astype(np.float32)
        movement = sosfilt(
            butter(1, .19, btype="lowpass", fs=RATE, output="sos"), movement_noise
        ).astype(np.float32)
        movement -= float(np.min(movement))
        movement /= max(float(np.max(movement)), 1e-6)
        movement = .12 + movement ** 2.15
        rustle *= movement.astype(np.float32) * .0082
        self.mix[0] += rustle
        self.mix[1] += np.roll(rustle, int(.041 * RATE)) * .78

        wind = RNG.normal(0, 1, SAMPLES).astype(np.float32)
        wind = sosfilt(butter(2, [72, 760], btype="bandpass", fs=RATE, output="sos"), wind).astype(np.float32)
        wind *= (.0022 + movement * .0041).astype(np.float32)
        self.mix[0] += wind
        self.mix[1] += np.roll(wind, int(.083 * RATE)) * .86

        for start in (18.5, 42.7, 68.4, 92.1, 115.6, 133.1):
            length = int(RNG.uniform(6.7, 9.3) * RATE)
            time_local = np.arange(length, dtype=np.float32) / RATE
            breath = RNG.normal(0, 1, length).astype(np.float32)
            breath = sosfilt(butter(2, 620, btype="lowpass", fs=RATE, output="sos"), breath).astype(np.float32)
            breath *= window(length, 2.8, 3.8) * .012
            breath *= (1 + .13 * np.sin(2 * np.pi * RNG.uniform(.11, .21) * time_local)).astype(np.float32)
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
                duration = (3.8 if index < len(notes) - 1 else 5.6) + RNG.uniform(-.28, .34)
                human_start = phrase_start + offset + RNG.uniform(-.16, .16)
                human_amplitude = amplitude * RNG.uniform(.91, 1.07)
                self.note(human_start, duration, note, human_amplitude, pans[index], 1.12)

        counterpoint = [
            (64.2, 52, 7.5, -.56), (70.8, 57, 6.2, .48), (77.0, 61, 7.2, -.24),
            (99.0, 59, 7.5, .51), (105.5, 61, 6.4, -.48), (111.0, 64, 7.1, .18),
            (125.4, 73, 5.4, -.52), (130.0, 76, 6.0, .46), (135.0, 80, 6.8, .02),
        ]
        for start, note, duration, pan in counterpoint:
            self.note(start + RNG.uniform(-.2, .2), duration + RNG.uniform(-.25, .32), note, .039, pan, 1.7)

        for start, note, pan in (
            (22.4, 83, .62), (26.1, 78, -.58), (49.5, 80, .48), (53.2, 85, -.42),
            (81.0, 83, .55), (84.3, 88, -.5), (109.0, 85, .57), (113.2, 90, -.44),
            (139.0, 88, .38),
        ):
            self.wood(start + RNG.uniform(-.11, .11), note, .023, pan)

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
        echoes = (
            (.083, .11), (.127, .095), (.181, .088), (.263, .078), (.347, .071),
            (.461, .064), (.619, .056), (.797, .049), (1.013, .043), (1.283, .037),
            (1.579, .031), (1.907, .026), (2.291, .021), (2.713, .017),
        )
        for index, (delay, gain) in enumerate(echoes):
            offset = int(delay * RATE)
            if index % 3:
                wet[0, offset:] += dry[1, :-offset] * gain
                wet[1, offset:] += dry[0, :-offset] * gain * .94
            else:
                wet[0, offset:] += dry[0, :-offset] * gain * .9
                wet[1, offset:] += dry[1, :-offset] * gain
        wet_filter = butter(2, 4_900, btype="lowpass", fs=RATE, output="sos")
        wet[0] = sosfilt(wet_filter, wet[0]).astype(np.float32)
        wet[1] = sosfilt(wet_filter, wet[1]).astype(np.float32)
        self.mix = dry * .9 + wet * 1.08

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
            self.mix *= .51 / peak
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
