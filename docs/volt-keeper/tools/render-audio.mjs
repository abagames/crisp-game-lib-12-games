#!/usr/bin/env node
/*
 * Offline render + measurement. This is what an executor that cannot listen
 * has instead of listening: it catches silence, clipping, a late onset, and a
 * tail past the declared bound, and nothing beyond that.
 *
 *   node tools/render-audio.mjs            # measure + assert
 *   node tools/render-audio.mjs --wav DIR  # also bounce WAVs for auditioning
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const dsp = require(path.join(here, "..", "audio", "vk-dsp.js"));
const kit = require(path.join(here, "..", "audio", "vk-kit.js"));

const SR = 48000;
const MASTER = kit.PROFILE.master;
const AUDIBLE_FLOOR = 0.02; // pre-master peak below this is effectively silent
const MARGIN = kit.BUDGETS.coOccurrenceMargin;

/* Co-occurrence groups: what can actually sound at the same time. */
const TIERS = {
  control: ["ground", "groundEmpty", "absorb1", "absorb2", "absorb3", "absorbHeavy", "absorbCharger", "warning", "overcharge", "quotaMet"],
  consequence: ["scavenge", "multMax", "absorbDrone"],
  ambience: ["deflect", "bumper", "launch"],
  ceremony: ["jingle:miss", "jingle:surge", "jingle:start", "jingle:gameover"],
};

function sum(buffers) {
  const len = Math.max(...buffers.map((b) => b.length));
  const out = new Float32Array(len);
  for (const b of buffers) for (let i = 0; i < b.length; i++) out[i] += b[i];
  return out;
}

function writeWav(file, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
}

const wavDir = process.argv.includes("--wav")
  ? process.argv[process.argv.indexOf("--wav") + 1] || "build/wav"
  : null;
if (wavDir) fs.mkdirSync(wavDir, { recursive: true });

const errors = [];
const rows = [];
const peaks = new Map();
let stressLine = "";

/* ------------------------------------------------------------- programs */
for (const program of kit.PROGRAM_LIST) {
  const pre = dsp.renderProgram(program, { sampleRate: SR });
  const post = dsp.applyMaster(pre, MASTER, SR);
  const mPre = dsp.measure(pre, SR, AUDIBLE_FLOOR * 0.25);
  const mPost = dsp.measure(post, SR, 0.002);
  peaks.set(program.id, mPre.peak);
  rows.push({
    id: program.id,
    kind: program.kind,
    dur: program.durationSeconds,
    peak: mPre.peak,
    rms: mPre.rms,
    postPeak: mPost.peak,
    onset: mPre.onsetSeconds,
    tail: mPre.tailSeconds,
  });

  const firstOffset = Math.min(...program.steps.map((s) => s.offset));
  if (mPre.peak < AUDIBLE_FLOOR) errors.push(`${program.id}: silent (peak ${mPre.peak.toFixed(4)})`);
  if (mPost.peak > MASTER.ceiling + 1e-6) errors.push(`${program.id}: clips (post-master ${mPost.peak.toFixed(4)})`);
  if (mPre.onsetSeconds == null || mPre.onsetSeconds > firstOffset + 0.005) {
    errors.push(`${program.id}: onset ${mPre.onsetSeconds} does not match first step offset ${firstOffset}`);
  }
  if (mPre.tailSeconds != null && mPre.tailSeconds > program.durationSeconds + 0.002) {
    errors.push(`${program.id}: tail ${mPre.tailSeconds.toFixed(4)}s exceeds declared ${program.durationSeconds}s`);
  }
  if (wavDir) writeWav(path.join(wavDir, `${program.id.replace(/:/g, "_")}.wav`), post);
}

/* ------------------------------------------------------------ BGM cues */
const bedStats = {};
for (const cue of Object.values(kit.BGM_CUES)) {
  const voiceBuffers = [];
  for (const layer of kit.BGM_LAYERS) {
    const buf = dsp.renderCueVoice(cue, layer.voice, { sampleRate: SR });
    const m = dsp.measure(buf, SR, AUDIBLE_FLOOR * 0.25);
    rows.push({
      id: `${cue.id}:${layer.voice}`,
      kind: "bgm",
      dur: cue.loopEndSeconds,
      peak: m.peak,
      rms: m.rms,
      postPeak: dsp.measure(dsp.applyMaster(buf, MASTER, SR), SR, 0.002).peak,
      onset: m.onsetSeconds,
      tail: m.tailSeconds,
    });
    if (m.peak < AUDIBLE_FLOOR) errors.push(`${cue.id}:${layer.voice}: silent`);
    if (m.tailSeconds != null && m.tailSeconds > cue.loopEndSeconds + 0.002) {
      errors.push(`${cue.id}:${layer.voice}: tail ${m.tailSeconds.toFixed(4)}s crosses the loop boundary`);
    }
    voiceBuffers.push(buf);
  }
  const full = sum(voiceBuffers);
  const mFull = dsp.measure(full, SR, AUDIBLE_FLOOR * 0.25);
  const post = dsp.applyMaster(full, MASTER, SR);
  const mPost = dsp.measure(post, SR, 0.002);
  bedStats[cue.id] = mFull;
  rows.push({
    id: `${cue.id} (all layers)`,
    kind: "bgm",
    dur: cue.loopEndSeconds,
    peak: mFull.peak,
    rms: mFull.rms,
    postPeak: mPost.peak,
    onset: mFull.onsetSeconds,
    tail: mFull.tailSeconds,
  });
  if (mPost.peak > MASTER.ceiling + 1e-6) errors.push(`${cue.id}: clips (post-master ${mPost.peak.toFixed(4)})`);
  if (wavDir) writeWav(path.join(wavDir, `cue_${cue.id}.wav`), post);
}

/* --------------------------------------- level ordering inside the group */
// Group "play": every SE that can sound while a cue is looping. The bed is
// compared by RMS (a sustained loop) against SE peaks (transients); comparing
// peak-to-peak would reject transients that are perfectly audible over it.
const bedRms = Math.max(bedStats.main.rms, bedStats.critical.rms);
const tierPeak = (tier) => TIERS[tier].map((id) => peaks.get(id));

const minControl = Math.min(...tierPeak("control"));
const minConsequence = Math.min(...tierPeak("consequence"));
const maxAmbience = Math.max(...tierPeak("ambience"));

if (minControl < bedRms * MARGIN) {
  errors.push(
    `control/danger feedback (min peak ${minControl.toFixed(3)}) does not clear the BGM bed ` +
      `(rms ${bedRms.toFixed(3)} x margin ${MARGIN})`
  );
}
if (minConsequence < bedRms) {
  errors.push(`consequence tier (min peak ${minConsequence.toFixed(3)}) sits under the BGM bed rms ${bedRms.toFixed(3)}`);
}
if (maxAmbience >= minControl) {
  errors.push(
    `ambience (max peak ${maxAmbience.toFixed(3)}) is not below control/danger feedback (min ${minControl.toFixed(3)})`
  );
}
// Ambience is meant to sit under the bed, not vanish beneath it. This is the
// weakest of the level checks: peak-vs-rms understates a short high click that
// is spectrally clear of a bass-heavy loop, and only listening settles it.
const minAmbience = Math.min(...tierPeak("ambience"));
if (minAmbience < bedRms * 0.6) {
  errors.push(`ambience (min peak ${minAmbience.toFixed(3)}) is buried under the bed rms ${bedRms.toFixed(3)}`);
}

/* ------------------------------------------ densest realistic co-occurrence */
// Voice arbitration plus per-voice monophony allow at most: BGM bass + BGM
// lead + one SE occupying pulse2 and the shared noise generator. Two SEs can
// never sound together, so anything denser than this is impossible by
// construction and this is the true worst case for clipping.
const STRESS_SE = "absorb3";
{
  const cue = kit.BGM_CUES.critical;
  const bedBuffers = ["bass", "pulse1"].map((v) => dsp.renderCueVoice(cue, v, { sampleRate: SR }));
  const se = dsp.renderProgram(kit.PROGRAMS[STRESS_SE], { sampleRate: SR, totalSeconds: cue.loopEndSeconds });
  const stress = sum([...bedBuffers, se]);
  const post = dsp.applyMaster(stress, MASTER, SR);
  const mStress = dsp.measure(post, SR, 0.002);
  stressLine =
    `stress mix (BGM bass+lead + ${STRESS_SE} on pulse2/noise): ` +
    `pre peak ${dsp.measure(stress, SR).peak.toFixed(4)}, post peak ${mStress.peak.toFixed(4)}`;
  if (mStress.peak > MASTER.ceiling + 1e-6) errors.push(`stress mix clips (post-master ${mStress.peak.toFixed(4)})`);
  if (wavDir) writeWav(path.join(wavDir, "stress_mix.wav"), post);
}
// Ceremony plays with the BGM ducked, so it is only compared with itself.
const minCeremony = Math.min(...TIERS.ceremony.map((id) => peaks.get(id)));
if (minCeremony < AUDIBLE_FLOOR * 4) errors.push(`ceremony tier too quiet (min peak ${minCeremony.toFixed(3)})`);

/* ---------------------------------------------------------------- report */
rows.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
const pad = (s, n) => String(s).padEnd(n);
console.log(`Rendered ${rows.length} items at ${SR} Hz (master gain ${MASTER.gain}, drive ${MASTER.drive}, ceiling ${MASTER.ceiling})`);
console.log(pad("id", 22) + pad("kind", 8) + pad("dur", 8) + pad("peak", 9) + pad("rms", 9) + pad("post", 9) + pad("onset", 9) + "tail");
for (const r of rows) {
  console.log(
    pad(r.id, 22) +
      pad(r.kind, 8) +
      pad(r.dur.toFixed(3), 8) +
      pad(r.peak.toFixed(4), 9) +
      pad(r.rms.toFixed(4), 9) +
      pad(r.postPeak.toFixed(4), 9) +
      pad(r.onset == null ? "-" : r.onset.toFixed(4), 9) +
      (r.tail == null ? "-" : r.tail.toFixed(4))
  );
}
console.log(
  `\nco-occurrence group "play": bed rms ${bedRms.toFixed(4)} | ` +
    `control min ${minControl.toFixed(4)} | consequence min ${minConsequence.toFixed(4)} | ambience max ${maxAmbience.toFixed(4)}`
);
console.log(stressLine);
if (wavDir) console.log(`WAVs written to ${path.resolve(wavDir)}`);

if (errors.length) {
  console.error(`\nAudio render checks FAILED (${errors.length}):`);
  errors.forEach((e) => console.error(`- ${e}`));
  process.exitCode = 1;
} else {
  console.log(`\nAudio render checks passed: ${rows.length} items, 0 silent, 0 clipping, onsets and tails in bounds.`);
}
