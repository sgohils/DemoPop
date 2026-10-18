`launch-pulse.wav` is original sound design synthesized by
[`scripts/create-launch-audio.ts`](../../scripts/create-launch-audio.ts).
It contains no sampled recordings, purchased music, or generated remote media.

Regenerate with `npx tsx scripts/create-launch-audio.ts`. The output is deterministic:
15 seconds, stereo PCM, 48 kHz, 16 bit. The mix has silent endpoints, a short final
fade, a 15 Hz DC blocker, and at least 2.5 dB of sample peak headroom. The script
targets -18 dBFS sample RMS without hard limiting. It reports sample peak, RMS,
and SHA-256; RMS is not a LUFS measurement.

The checked-in file is 2,880,044 bytes with a -6.10 dBFS sample peak and
-18.00 dBFS stereo RMS. Its SHA-256 is
`8c7e061ffcd894e90191f5bd0de12bdbca2eccd34ef890979e008913e244f615`.

At 30 fps the original score follows the launch template's cuts at frames 0, 54,
105, 171, 255, and 354. A rounded D–F#–E–A synth motif introduces a musical
identity. The old workflow has a darker suspended chord, then joined rises lead
into the reveal and an octave reprise. An 85.7 BPM bass and brushed-percussion
groove gives the proof beats forward motion; four quarter notes align exactly
with frames 171 through 255. A final E–F#–D cadence resolves into the brand
lockup. There are no vocals or repetitive high UI ticks.

The proof sections measure -17.39 and -16.99 dBFS stereo RMS. This gives them
more energy than the hook and old workflow (-20.14 and -20.09 dBFS), while the
closing cadence settles to -18.11 dBFS. The master has zero clipped samples,
near-zero DC, a 0.07 dB channel difference, and a -0.39 dB mono fold-down change.

The player and rendered export use the same local file. Existing projects and
other templates remain silent unless launch sound is explicitly enabled.
