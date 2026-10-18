import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Original synthesis only: no recordings, sample packs, or external services.
// Keep cue points aligned with Launch.tsx (30 fps / 450 frames).
const sampleRate = 48_000;
const duration = 15;
const length = sampleRate * duration;
const left = new Float64Array(length);
const right = new Float64Array(length);
const tau = Math.PI * 2;
const at = (frame: number) => frame / 30;
let seed = 0x44454d4f;

function random() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
  return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => {
  const t = clamp(n);
  return t * t * (3 - 2 * t);
};

function event(
  start: number,
  seconds: number,
  signal: (t: number, progress: number) => number,
  gain: number,
  pan = 0,
) {
  const startSample = Math.round(start * sampleRate);
  const sampleCount = Math.round(seconds * sampleRate);
  const gainL = Math.cos(((pan + 1) * Math.PI) / 4) * gain;
  const gainR = Math.sin(((pan + 1) * Math.PI) / 4) * gain;
  for (let index = 0; index < sampleCount; index++) {
    const destination = startSample + index;
    if (destination < 0 || destination >= length) continue;
    const t = index / sampleRate;
    // A short edge envelope prevents a click at every oscillator boundary.
    const edge = smooth(t / 0.003) * smooth((seconds - t) / 0.025);
    const value = signal(t, index / sampleCount) * edge;
    left[destination] += value * gainL;
    right[destination] += value * gainR;
  }
}

function pulse(start: number, gain: number, pitch = 48.999) {
  event(
    start,
    0.95,
    (t) => {
      // Integrating an exponential glide preserves oscillator phase.
      const phase = tau * (pitch * t + 30 * 0.025 * (1 - Math.exp(-t / 0.025)));
      const body = Math.sin(phase) + Math.sin(phase * 2) * 0.13;
      return (
        body * Math.exp(-t * 7.5) +
        Math.sin(tau * 110 * t) * Math.exp(-t * 30) * 0.1
      );
    },
    gain,
  );
}

function brush(start: number, gain: number, pan = 0, seconds = 0.15) {
  let low = 0;
  let high = 0;
  event(
    start,
    seconds,
    (t) => {
      const noise = random() * 2 - 1;
      low += (noise - low) * 0.2;
      high += (noise - high) * 0.025;
      return (low - high) * Math.exp(-t * 38) * smooth(t / 0.006);
    },
    gain,
    pan,
  );
}

function sweep(start: number, seconds: number, gain: number, pan: number) {
  let lowPass = 0;
  let previous = 0;
  event(
    start,
    seconds,
    (t, progress) => {
      const noise = random() * 2 - 1;
      const cutoff = 0.012 + progress * progress * 0.26;
      lowPass += (noise - lowPass) * cutoff;
      const highPass = lowPass - previous;
      previous += (lowPass - previous) * 0.005;
      const envelope =
        Math.pow(Math.sin(progress * Math.PI * 0.5), 2) *
        smooth((seconds - t) / 0.055);
      const shimmer = Math.sin(tau * (660 * t + 180 * t * t)) * 0.025;
      return (highPass + shimmer) * envelope;
    },
    gain,
    pan,
  );
}

function note(
  start: number,
  base: number,
  gain: number,
  pan = 0,
  seconds = 1.1,
) {
  event(
    start,
    seconds,
    (t) => {
      const phase = tau * base * t;
      const rounded =
        Math.sin(phase) +
        Math.sin(phase * 2.0007) * Math.exp(-t * 2.8) * 0.24 +
        Math.sin(phase * 3.001) * Math.exp(-t * 6) * 0.055;
      const envelope = smooth(t / 0.017) * Math.exp(-t * 3.1);
      return rounded * envelope;
    },
    gain,
    pan,
  );
}

function bass(start: number, base: number, gain: number, seconds = 0.63) {
  event(
    start,
    seconds,
    (t) => {
      const phase = tau * base * t;
      const tone =
        Math.sin(phase) +
        Math.sin(phase * 2) * 0.32 +
        Math.sin(phase * 3) * 0.08;
      const envelope =
        smooth(t / 0.015) * smooth((seconds - t) / 0.09) * Math.exp(-t * 1.35);
      return tone * envelope;
    },
    gain,
  );
}

// Suspended, gently moving harmony; upper harmonics give phone speakers a
// musical center while the bass remains centered and compatible with mono.
function bed(start: number, seconds: number, notes: number[], gain: number) {
  notes.forEach((frequency, voice) => {
    const pan = [-0.54, 0.43, -0.26, 0.61][voice % 4];
    event(
      start,
      seconds,
      (t) => {
        const swell = smooth(t / 0.28) * smooth((seconds - t) / 0.62);
        const breath = 0.91 + Math.sin(tau * 0.23 * t + voice) * 0.09;
        const center = Math.sin(tau * frequency * t + voice * 0.71);
        const air = Math.sin(tau * frequency * 2.0009 * t + voice) * 0.21;
        const width =
          Math.sin(tau * frequency * 0.9985 * t + voice * 0.71) * 0.18;
        return (center + air + width) * swell * breath;
      },
      gain / Math.sqrt(notes.length),
      pan,
    );
  });
}

const D = 293.665,
  E = 329.628,
  Fs = 369.994,
  A = 440;

// A small original D–F#–E–A identity makes the opening feel authored rather
// than a succession of UI bleeps. Its reprise and final cadence carry the edit.
pulse(0.02, 0.3, D / 4);
bed(0, 2.13, [D / 2, A / 2, E, Fs], 0.19);
for (const [time, pitch, gain, pan] of [
  [0.025, D, 0.25, -0.12],
  [0.36, Fs, 0.23, 0.14],
  [0.75, E, 0.22, -0.08],
  [1.19, A, 0.22, 0.12],
])
  note(time, pitch, gain, pan);

// Pull back the rhythmic foreground for the old workflow; a darker suspended
// chord and two joined inhalations build purposefully toward the reveal.
brush(at(54), 0.12, -0.14);
bass(at(54), 123.471, 0.14, 1.15);
bed(1.72, 2.1, [123.471, 184.997, 277.183, E], 0.17);
note(at(54) + 0.04, E, 0.14, -0.15);
note(2.48, Fs, 0.12, 0.15);
sweep(2.56, 0.94, 0.18, -0.16);
sweep(3.15, 0.35, 0.075, 0.26);

// The reveal opens the harmony and reprises the hook an octave higher. The
// pulse is deliberately rounded: a product arrival, not a trailer explosion.
pulse(at(105), 0.43, D / 4);
bass(at(105), D / 4, 0.19, 0.9);
bed(at(105), 2.55, [D / 2, A / 2, D, Fs], 0.235);
for (const [offset, pitch, pan] of [
  [0.025, D * 2, -0.16],
  [0.37, Fs * 2, 0.16],
  [0.76, E * 2, -0.08],
  [1.2, A, 0.1],
])
  note(at(105) + offset, pitch, 0.205, pan);

// A relaxed 85.7 BPM groove starts on proof one. Four quarter notes land
// exactly at proof two (171→255 frames = 2.8s). Soft brushed subdivisions and
// warm pitched bass provide motion without a harsh, repetitive ticking bed.
const quarter = 0.7;
const proofBass = [
  D / 4,
  A / 4,
  D / 2,
  Fs / 4,
  123.471,
  Fs / 4,
  A / 4,
  D / 2,
  123.471,
];
for (const [beat, pitch] of proofBass.entries()) {
  const start = at(171) + beat * quarter;
  if (start > 11.45) continue;
  bass(start, pitch, beat === 0 || beat === 4 ? 0.25 : 0.2);
  if (beat % 2 === 0) pulse(start, 0.145, D / 4);
  else brush(start, 0.105, beat % 4 === 1 ? -0.15 : 0.15, 0.18);
  for (const offset of [0.175, 0.525]) {
    if (start + offset < 11.43)
      brush(start + offset, 0.043, offset < 0.3 ? 0.22 : -0.22, 0.105);
  }
}
bed(at(171), 3.15, [D / 2, A / 2, E, Fs], 0.23);
bed(at(255), 3.55, [123.471, 184.997, 220, 277.183], 0.24);
for (const [time, pitch, pan] of [
  [5.72, D, -0.14],
  [6.42, Fs, 0.14],
  [6.77, E, -0.08],
  [7.47, A, 0.1],
  [8.52, D * 2, 0.12],
  [9.22, E * 2, -0.12],
  [9.57, Fs * 2, 0.14],
  [10.27, E * 2, -0.1],
  [10.97, A, 0.1],
])
  note(time, pitch, 0.185, pan);
for (const frame of [171, 255]) {
  sweep(at(frame) - 0.24, 0.24, 0.1, frame === 171 ? -0.12 : 0.12);
}

// Rhythm gives way to a deliberate E–F#–D brand cadence. A held D6/add9
// resolution leaves a clean musical tail under the final name and action.
sweep(at(354) - 0.38, 0.38, 0.15, 0);
pulse(at(354), 0.29, D / 4);
bass(at(354), D / 4, 0.22, 1.4);
bed(at(354), duration - at(354), [D / 2, A / 2, D, E, Fs, 493.883], 0.25);
note(at(354) + 0.025, E, 0.22, -0.12, 1.4);
note(12.14, Fs, 0.23, 0.12, 1.4);
note(12.52, D, 0.29, 0, 2.2);
note(12.56, D * 2, 0.11, 0.18, 1.9);

// A little diffuse air around the transients, implemented as feed-forward taps.
// Delays are asymmetric rather than phase-inverted, keeping mono compatibility.
const dryLeft = left.slice();
const dryRight = right.slice();
for (const [delaySeconds, gain] of [
  [0.083, 0.09],
  [0.137, 0.065],
  [0.229, 0.034],
]) {
  const offset = Math.round(delaySeconds * sampleRate);
  for (let index = offset; index < length; index++) {
    left[index] += dryRight[index - offset] * gain;
    right[index] += dryLeft[index - offset] * gain;
  }
}

let rawPeak = 0;
let sumSquares = 0;
// A 15 Hz DC blocker removes subsonic energy without thinning the reveal bass.
const dcPole = Math.exp((-tau * 15) / sampleRate);
let previousLeft = 0;
let previousRight = 0;
let filteredLeft = 0;
let filteredRight = 0;
for (let index = 0; index < length; index++) {
  const t = index / sampleRate;
  const fade =
    smooth(t / 0.012) * smooth((duration - t - 1 / sampleRate) / 0.22);
  const saturatedLeft = Math.tanh(left[index] * 1.2);
  const saturatedRight = Math.tanh(right[index] * 1.2);
  filteredLeft = saturatedLeft - previousLeft + dcPole * filteredLeft;
  filteredRight = saturatedRight - previousRight + dcPole * filteredRight;
  previousLeft = saturatedLeft;
  previousRight = saturatedRight;
  left[index] = filteredLeft * fade;
  right[index] = filteredRight * fade;
  rawPeak = Math.max(rawPeak, Math.abs(left[index]), Math.abs(right[index]));
  sumSquares += left[index] ** 2 + right[index] ** 2;
}
const rawRms = Math.sqrt(sumSquares / (length * 2));
// RMS is a sample-level measure, not a claim of perceptual LUFS normalization.
// Aim for a fuller -18 dBFS sample RMS without chasing perceived loudness.
// Leave 2.5 dB sample peak headroom for the AAC encode; no hard limiting.
const masterGain = Math.min(
  10 ** (-18 / 20) / rawRms,
  10 ** (-2.5 / 20) / rawPeak,
);
const wav = Buffer.alloc(44 + length * 4);
wav.write("RIFF", 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 4, 28);
wav.writeUInt16LE(4, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(length * 4, 40);
let peak = 0;
let energy = 0;
for (let index = 0; index < length; index++) {
  for (const [channel, signal] of [left[index], right[index]].entries()) {
    const value = signal * masterGain;
    // Deterministic triangular dither before 16-bit quantization.
    const dither = (random() - random()) / 65_536;
    const pcm = Math.max(
      -32_768,
      Math.min(32_767, Math.round((value + dither) * 32_767)),
    );
    // Exact silent endpoints make trimming/joining safe, including the dither.
    const finalPcm = index === 0 || index === length - 1 ? 0 : pcm;
    wav.writeInt16LE(finalPcm, 44 + index * 4 + channel * 2);
    peak = Math.max(peak, Math.abs(finalPcm / 32_768));
    energy += (finalPcm / 32_768) ** 2;
  }
}

const destination = fileURLToPath(
  new URL("../public/audio/launch-pulse.wav", import.meta.url),
);
await mkdir(fileURLToPath(new URL("../public/audio/", import.meta.url)), {
  recursive: true,
});
await writeFile(destination, wav);
const rms = Math.sqrt(energy / (length * 2));
console.log(
  JSON.stringify(
    {
      file: "public/audio/launch-pulse.wav",
      durationSeconds: duration,
      sampleRate,
      channels: 2,
      bitsPerSample: 16,
      bytes: wav.length,
      peakDbfs: Number((20 * Math.log10(peak)).toFixed(2)),
      rmsDbfs: Number((20 * Math.log10(rms)).toFixed(2)),
      sha256: createHash("sha256").update(wav).digest("hex"),
      cuesAtFrames: [0, 54, 105, 171, 255, 354],
    },
    null,
    2,
  ),
);
