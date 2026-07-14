#!/usr/bin/env python3
"""Render the two fixed stems for The Listening Room.

The browser does not synthesize or download anything at runtime beyond these
two synchronized files. Movement foregrounds the near stem; stillness reveals
the depth stem. Both are complete compositions built from the house's
E–B–F-sharp–A seed and deterministic physical/noise models.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt


RATE = 44_100
DURATION = 216.0
SAMPLES = int(RATE * DURATION)
RNG = np.random.default_rng(260714)


def frequency(midi_note: float) -> float:
    return 440.0 * 2.0 ** ((midi_note - 69.0) / 12.0)


def constant_power_pan(pan: float) -> tuple[float, float]:
    angle = (np.clip(pan, -1.0, 1.0) + 1.0) * np.pi / 4.0
    return float(np.cos(angle)), float(np.sin(angle))


def envelope(length: int, attack: float, release: float) -> np.ndarray:
    shape = np.ones(length, dtype=np.float32)
    attack_samples = min(length, max(1, int(attack * RATE)))
    release_samples = min(length, max(1, int(release * RATE)))
    shape[:attack_samples] = np.sin(
        np.linspace(0, np.pi / 2, attack_samples, dtype=np.float32)
    ) ** 2
    shape[-release_samples:] *= np.cos(
        np.linspace(0, np.pi / 2, release_samples, dtype=np.float32)
    ) ** 2
    return shape


def slow_curve(length: int, interval: float = 1.2, scale: float = 1.0) -> np.ndarray:
    step = max(2, int(interval * RATE))
    anchors = np.arange(0, length + step, step)
    values = RNG.normal(0, scale, anchors.size).astype(np.float32)
    return np.interp(np.arange(length), anchors, values).astype(np.float32)


class ListeningScore:
    def __init__(self) -> None:
        self.near = np.zeros((2, SAMPLES), dtype=np.float32)
        self.depth = np.zeros((2, SAMPLES), dtype=np.float32)

    def add(
        self,
        mix: np.ndarray,
        signal: np.ndarray,
        start: float,
        amplitude: float,
        pan: float,
    ) -> None:
        begin = max(0, int(start * RATE))
        end = min(SAMPLES, begin + signal.size)
        if end <= begin:
            return
        left, right = constant_power_pan(pan)
        segment = signal[: end - begin] * amplitude
        mix[0, begin:end] += segment * left
        mix[1, begin:end] += segment * right

    def bowed(
        self,
        mix: np.ndarray,
        start: float,
        duration: float,
        midi_note: float,
        amplitude: float,
        pan: float,
        warmth: float = 1.0,
    ) -> None:
        length = min(SAMPLES - int(start * RATE), int(duration * RATE))
        if length <= 0:
            return
        time = np.arange(length, dtype=np.float32) / RATE
        phase_seed = RNG.uniform(0, np.pi * 2)
        drift = slow_curve(length, 1.35, .72)
        drift += 1.7 * np.sin(2 * np.pi * RNG.uniform(.035, .061) * time + phase_seed)
        drift += .8 * np.sin(2 * np.pi * RNG.uniform(.083, .127) * time + phase_seed * .31)
        instantaneous = frequency(midi_note + RNG.uniform(-.045, .045)) * np.exp2(drift / 1_200)
        phase = np.cumsum(instantaneous, dtype=np.float64) * (2 * np.pi / RATE) + phase_seed

        signal = np.zeros(length, dtype=np.float32)
        partials = (
            (1, 1.0),
            (2, .26 / warmth),
            (3, .105 / warmth),
            (4, .046 / warmth),
            (5, .019 / warmth),
        )
        for partial, weight in partials:
            signal += weight * np.sin(phase * partial + phase_seed * partial * .13).astype(np.float32)

        bow = RNG.normal(0, 1, length).astype(np.float32)
        bow = sosfilt(
            butter(2, [430, 5_800], btype="bandpass", fs=RATE, output="sos"), bow
        ).astype(np.float32)
        pressure = .88 + .08 * np.sin(2 * np.pi * RNG.uniform(.047, .081) * time + phase_seed)
        pressure += np.clip(slow_curve(length, .83, .035), -.08, .08)
        signal = signal * pressure.astype(np.float32) + bow * (.012 + .007 / warmth)
        signal *= envelope(length, min(6.5, duration * .22), min(9.0, duration * .3))
        self.add(mix, signal / 1.43, start, amplitude, pan)

    def breath(
        self,
        mix: np.ndarray,
        start: float,
        duration: float,
        amplitude: float,
        pan: float,
        centre: float = 900,
    ) -> None:
        length = min(SAMPLES - int(start * RATE), int(duration * RATE))
        if length <= 0:
            return
        noise = RNG.normal(0, 1, length).astype(np.float32)
        low = max(80, centre * .32)
        high = min(9_000, centre * 3.8)
        signal = sosfilt(
            butter(2, [low, high], btype="bandpass", fs=RATE, output="sos"), noise
        ).astype(np.float32)
        motion = .7 + .3 * np.clip(slow_curve(length, .48, .72), -1, 1)
        signal *= motion.astype(np.float32) * envelope(length, duration * .33, duration * .46)
        self.add(mix, signal, start, amplitude, pan)

    def body(
        self,
        start: float,
        midi_note: float,
        amplitude: float,
        pan: float,
        duration: float = 7.5,
    ) -> None:
        length = min(SAMPLES - int(start * RATE), int(duration * RATE))
        if length <= 0:
            return
        time = np.arange(length, dtype=np.float32) / RATE
        base = frequency(midi_note + RNG.uniform(-.08, .08))
        signal = np.zeros(length, dtype=np.float32)
        modes = (
            (1.0, 1.0, .34),
            (1.497, .34, .48),
            (2.073, .19, .66),
            (2.91, .095, .91),
            (4.17, .042, 1.34),
            (5.63, .018, 1.82),
        )
        for ratio, weight, decay in modes:
            phase = RNG.uniform(0, np.pi * 2)
            signal += (
                weight
                * np.sin(2 * np.pi * base * ratio * time + phase)
                * np.exp(-time * decay)
            ).astype(np.float32)
        touch = RNG.normal(0, 1, length).astype(np.float32)
        touch = sosfilt(butter(2, 2_800, btype="lowpass", fs=RATE, output="sos"), touch).astype(np.float32)
        touch *= np.exp(-time * 34).astype(np.float32) * .22
        signal = (signal + touch) * envelope(length, .012, min(3.1, duration * .46))
        self.add(self.near, signal / 1.5, start, amplitude, pan)

    def line(
        self,
        start: float,
        notes: list[float],
        gaps: list[float],
        amplitude: float,
        pan_path: tuple[float, ...],
        register_warmth: float = 1.25,
    ) -> None:
        for index, (note, offset) in enumerate(zip(notes, gaps, strict=True)):
            next_offset = gaps[index + 1] if index + 1 < len(gaps) else offset + 8.4
            duration = max(4.8, next_offset - offset + RNG.uniform(2.1, 3.8))
            self.bowed(
                self.depth,
                start + offset + RNG.uniform(-.18, .18),
                duration,
                note,
                amplitude * RNG.uniform(.9, 1.08),
                pan_path[index % len(pan_path)],
                register_warmth,
            )

    def near_form(self) -> None:
        body_events = [
            (2.4, 40, .060, -.42), (14.8, 47, .047, .35), (27.1, 54, .041, -.12),
            (39.6, 45, .057, .48), (52.0, 52, .043, -.5), (65.2, 57, .044, .2),
            (78.8, 42, .061, -.28), (91.5, 49, .047, .52), (104.2, 52, .043, -.44),
            (117.8, 47, .054, .13), (130.0, 54, .045, .47), (142.6, 57, .046, -.52),
            (155.4, 40, .063, .24), (168.0, 47, .05, -.38), (180.1, 54, .046, .5),
            (191.8, 57, .043, -.16), (203.0, 40, .056, .08),
        ]
        for start, note, amplitude, pan in body_events:
            self.body(start + RNG.uniform(-.2, .2), note, amplitude, pan, RNG.uniform(6.2, 9.2))

        seed_fragments = (
            (8.5, [64, 71]), (31.2, [66, 69]), (58.0, [64, 71, 66]),
            (84.0, [69, 66]), (109.0, [71, 64, 69]), (136.0, [66, 71]),
            (162.0, [64, 69, 71]), (187.0, [66, 64]),
        )
        for phrase_start, notes in seed_fragments:
            for index, note in enumerate(notes):
                self.body(
                    phrase_start + index * RNG.uniform(2.2, 3.4),
                    note + 12,
                    .018,
                    (-.58, .46, -.14)[index % 3],
                    4.1,
                )

        for start, duration, amplitude, pan, centre in (
            (5, 9, .0038, -.6, 680), (21, 12, .0042, .48, 1_100),
            (47, 11, .0035, -.25, 740), (73, 14, .0040, .58, 1_300),
            (101, 10, .0036, -.48, 820), (124, 14, .0043, .22, 1_450),
            (151, 12, .0037, .52, 900), (176, 15, .0042, -.34, 1_180),
            (198, 10, .0033, .1, 720),
        ):
            self.breath(self.near, start, duration, amplitude, pan, centre)

        noise = RNG.normal(0, 1, SAMPLES).astype(np.float32)
        low_body = sosfilt(butter(2, [34, 410], btype="bandpass", fs=RATE, output="sos"), noise).astype(np.float32)
        air = sosfilt(butter(2, [520, 4_600], btype="bandpass", fs=RATE, output="sos"), noise).astype(np.float32)
        motion = np.clip(.34 + slow_curve(SAMPLES, 2.7, .22), .08, .78)
        self.near[0] += low_body * .0034 + air * motion * .0014
        self.near[1] += np.roll(low_body, int(.057 * RATE)) * .0031 + np.roll(air, int(.031 * RATE)) * motion * .0013

    def depth_form(self) -> None:
        harmonies = [
            (0.0, 51.0, [40, 47, 54, 57, 64], .035),
            (39.0, 51.0, [35, 42, 47, 52, 57], .036),
            (78.0, 52.0, [42, 49, 52, 57, 59], .037),
            (117.0, 53.0, [45, 52, 54, 59, 64], .038),
            (156.0, 60.0, [40, 47, 52, 54, 57, 64], .041),
        ]
        pans = (-.68, .54, -.28, .31, .7, -.04)
        for start, duration, notes, amplitude in harmonies:
            for index, note in enumerate(notes):
                self.bowed(
                    self.depth,
                    start + index * .37,
                    duration - index * .19,
                    note,
                    amplitude / np.sqrt(len(notes)),
                    pans[index],
                    1.65,
                )

        self.line(32.0, [64, 71, 66, 69], [0, 7.2, 14.8, 22.5], .041, (-.42, .38, -.17, .24))
        self.line(
            78.0,
            [64, 71, 66, 69, 73, 71, 76],
            [0, 5.6, 11.7, 18.2, 25.1, 31.4, 38.0],
            .044,
            (-.5, .42, -.23, .16, .48, -.34, .08),
        )
        self.line(
            124.0,
            [52, 59, 54, 57, 61, 59, 64, 66],
            [0, 6.8, 13.9, 20.8, 28.0, 34.2, 40.8, 47.3],
            .036,
            (.5, -.43, .2, -.16, .44, -.5, .1, .31),
            1.8,
        )
        self.line(
            164.0,
            [76, 71, 78, 73, 81, 76, 83, 81],
            [0, 5.0, 10.7, 16.3, 22.0, 28.2, 34.3, 40.7],
            .035,
            (-.55, .34, -.18, .52, -.36, .16, .43, 0),
            1.35,
        )

        for start, duration, amplitude, pan, centre in (
            (0, 24, .0026, -.48, 1_100), (28, 19, .0029, .46, 1_500),
            (55, 22, .0025, -.2, 950), (86, 26, .0030, .58, 1_700),
            (119, 21, .0027, -.55, 1_250), (147, 27, .0031, .24, 1_900),
            (180, 27, .0028, -.35, 1_300),
        ):
            self.breath(self.depth, start, duration, amplitude, pan, centre)

        noise = RNG.normal(0, 1, SAMPLES).astype(np.float32)
        distant_air = sosfilt(
            butter(2, [170, 3_900], btype="bandpass", fs=RATE, output="sos"), noise
        ).astype(np.float32)
        tide = np.clip(.4 + slow_curve(SAMPLES, 4.2, .25), .05, .85)
        self.depth[0] += distant_air * tide * .0017
        self.depth[1] += np.roll(distant_air, int(.097 * RATE)) * tide * .00155

    def space(self, mix: np.ndarray, wide: bool) -> np.ndarray:
        source = mix.copy()
        wet = np.zeros_like(mix)
        taps = (
            (.071, .10), (.113, .09), (.173, .081), (.251, .072), (.367, .064),
            (.521, .057), (.743, .05), (1.019, .043), (1.337, .036), (1.721, .03),
            (2.179, .025), (2.703, .02), (3.281, .016),
        ) if wide else (
            (.047, .07), (.089, .058), (.151, .049), (.233, .041), (.347, .034),
            (.503, .028), (.719, .022),
        )
        for index, (delay, gain) in enumerate(taps):
            offset = int(delay * RATE)
            if index % 2:
                wet[0, offset:] += source[1, :-offset] * gain
                wet[1, offset:] += source[0, :-offset] * gain * .94
            else:
                wet[0, offset:] += source[0, :-offset] * gain * .92
                wet[1, offset:] += source[1, :-offset] * gain
        cutoff = 4_600 if wide else 6_200
        lowpass = butter(2, cutoff, btype="lowpass", fs=RATE, output="sos")
        wet[0] = sosfilt(lowpass, wet[0]).astype(np.float32)
        wet[1] = sosfilt(lowpass, wet[1]).astype(np.float32)
        return source * (.87 if wide else .94) + wet * (1.18 if wide else .72)

    def finish_stem(self, mix: np.ndarray, peak_target: float) -> np.ndarray:
        highpass = butter(2, 27, btype="highpass", fs=RATE, output="sos")
        mix[0] = sosfilt(highpass, mix[0]).astype(np.float32)
        mix[1] = sosfilt(highpass, mix[1]).astype(np.float32)

        fade_in = int(4.8 * RATE)
        fade_out = int(11.0 * RATE)
        mix[:, :fade_in] *= np.sin(
            np.linspace(0, np.pi / 2, fade_in, dtype=np.float32)
        ) ** 2
        mix[:, -fade_out:] *= np.cos(
            np.linspace(0, np.pi / 2, fade_out, dtype=np.float32)
        ) ** 2

        mix = np.tanh(mix * 1.28).astype(np.float32)
        peak = float(np.max(np.abs(mix)))
        if peak:
            mix *= peak_target / peak
        return np.transpose(mix)

    def render(self) -> tuple[np.ndarray, np.ndarray]:
        self.near_form()
        self.depth_form()
        near = self.finish_stem(self.space(self.near, False), .46)
        depth = self.finish_stem(self.space(self.depth, True), .39)
        return near, depth


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("output_directory", type=Path)
    args = parser.parse_args()
    args.output_directory.mkdir(parents=True, exist_ok=True)

    near, depth = ListeningScore().render()
    wavfile.write(
        args.output_directory / "near.wav",
        RATE,
        np.int16(np.clip(near, -1, 1) * 32767),
    )
    wavfile.write(
        args.output_directory / "depth.wav",
        RATE,
        np.int16(np.clip(depth, -1, 1) * 32767),
    )


if __name__ == "__main__":
    main()
