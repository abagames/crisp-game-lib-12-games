#!/usr/bin/env node
/*
 * Derives the audio validation manifest from the runtime kit data.
 * It is a projection of audio/vk-kit.js, never a hand-maintained copy: if a
 * program changes, this output changes with it.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const kit = require(path.join(here, "..", "audio", "vk-kit.js"));

const step = (s) => ({ offset: s.offset, duration: s.duration, voice: s.voice });

const programs = {};
for (const [id, p] of Object.entries(kit.PROGRAMS)) {
  programs[id] = { id, kind: p.kind, steps: p.steps.map(step) };
}

const bgmCues = {};
for (const [id, c] of Object.entries(kit.BGM_CUES)) {
  bgmCues[id] = {
    id,
    durationSeconds: c.durationSeconds,
    loopStartSeconds: c.loopStartSeconds,
    loopEndSeconds: c.loopEndSeconds,
    steps: c.steps.map(step),
  };
}

const manifest = {
  version: 1,
  audioMode: "active",
  hardwareProfile: {
    id: kit.PROFILE.id,
    fidelity: kit.PROFILE.fidelity,
    voiceLimit: kit.PROFILE.voiceLimit,
    primitives: kit.PROFILE.primitives,
  },
  budgets: {
    sfxMaxDurationSeconds: kit.BUDGETS.sfxMaxDurationSeconds,
    jingleMaxDurationSeconds: kit.BUDGETS.jingleMaxDurationSeconds,
    maxStepsPerProgram: kit.BUDGETS.maxStepsPerProgram,
    bgmLoopMaxDurationSeconds: kit.BUDGETS.bgmLoopMaxDurationSeconds,
    bgmLoopMaxTailSeconds: kit.BUDGETS.bgmLoopMaxTailSeconds,
  },
  programs,
  aliases: kit.ALIASES,
  events: kit.EVENTS.map((e) => ({
    name: e.name,
    classification: e.classification,
    priority: e.priority,
  })),
  bgmCues,
};

const outPath = path.resolve(process.argv[2] || "build/audio-manifest.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
console.log(
  `Exported audio manifest: ${outPath}\n` +
    `  ${Object.keys(programs).length} programs, ${Object.keys(bgmCues).length} cues, ` +
    `${manifest.events.length} events, profile ${manifest.hardwareProfile.id}`
);
