/*
 * VOLT KEEPER — audio bus and adapters.
 *
 *   game code -> bus.emit(name, options)
 *             -> kit resolves alias -> program / cue
 *             -> adapter plays resolved data
 *             -> synth output
 *
 * The bus owns mute, demo gating, per-frame repeat caps, per-event cooldowns,
 * priority, and same-tick voice arbitration. Gameplay code never touches the
 * synth.
 */
(function (root, factory) {
  const isNode = typeof module === "object" && module.exports;
  const mod = factory(
    isNode ? require("./vk-dsp.js") : root.VKDsp,
    isNode ? require("./vk-kit.js") : root.VKKit
  );
  if (isNode) module.exports = mod;
  else root.VKBus = mod;
})(typeof globalThis !== "undefined" ? globalThis : this, function (VKDsp, VKKit) {
  const SE_VOICE_POOL = ["pulse2", "noise"];
  const JINGLE_VOICE_POOL = ["pulse1", "pulse2", "bass", "noise"];
  const REPEAT_CAP = 2; // per event name per frame (bookkeeping, not audibility)

  /* ------------------------------------------------------------ mock adapter */

  function createMockAdapter() {
    const calls = [];
    const voiceOwner = new Map(); // voice -> program id currently sounding
    return {
      kind: "mock",
      calls,
      voiceOwner,
      init() {},
      configureMaster() {},
      playProgram(program, options) {
        // A physical voice is monophonic: starting a note on it ends the note
        // that was still ringing there, it does not layer on top of it.
        const frame = (options && options.frame) || 0;
        const until = frame + Math.ceil(program.durationSeconds * 60);
        for (const voice of program.voices) {
          const owner = voiceOwner.get(voice);
          if (owner && frame < owner.until) {
            calls.push({ type: "stopVoice", voice, previous: owner.id, next: program.id, frame });
          }
          voiceOwner.set(voice, { id: program.id, until });
        }
        calls.push({ type: "program", id: program.id, voices: program.voices.slice(), options });
      },
      startCue(cueId) {
        calls.push({ type: "cue", id: cueId });
      },
      setLayerGains(gains) {
        calls.push({ type: "layers", gains: Object.assign({}, gains) });
      },
      duck(voices, seconds) {
        calls.push({ type: "duck", voices: voices.slice(), seconds });
      },
      stopAll() {
        calls.push({ type: "stopAll" });
      },
      suspend() {
        calls.push({ type: "suspend" });
      },
      resume() {
        calls.push({ type: "resume" });
      },
      reset() {
        calls.length = 0;
        voiceOwner.clear();
      },
    };
  }

  /* -------------------------------------------------------- web audio adapter */

  function createWebAudioAdapter() {
    let ctx = null;
    let master = null;
    let started = false;
    const buffers = new Map(); // `${programId}:${voice}` -> AudioBuffer
    const cueBuffers = new Map(); // `${cueId}:${voice}` -> AudioBuffer
    const voiceGains = new Map(); // voice -> GainNode (BGM loop bus)
    const voiceSources = new Map(); // voice -> AudioBufferSourceNode (BGM loop)
    const seSources = new Map(); // voice -> currently sounding SE/jingle source
    let currentCue = null;
    let cueStartTime = 0;
    let layerTargets = {};
    let duckUntil = {};
    let lastTarget = {};

    function toBuffer(samples) {
      const buf = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      buf.copyToChannel(samples, 0);
      return buf;
    }

    return {
      kind: "webaudio",
      get context() {
        return ctx;
      },
      get isStarted() {
        return started;
      },
      init() {
        if (ctx) return ctx.state;
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return "unavailable";
        ctx = new Ctor();
        const cfg = VKKit.PROFILE.master;
        const gain = ctx.createGain();
        gain.gain.value = cfg.gain;
        const shaper = ctx.createWaveShaper();
        shaper.curve = VKDsp.masterCurve(cfg, 2048);
        shaper.oversample = "2x";
        const dcBlock = ctx.createBiquadFilter();
        dcBlock.type = "highpass";
        dcBlock.frequency.value = cfg.dcBlockHz;
        gain.connect(shaper).connect(dcBlock).connect(ctx.destination);
        master = gain;

        const sr = ctx.sampleRate;
        // One buffer per (program, voice) so that a physical voice can be made
        // monophonic: a new note on pulse2 must end the note still ringing
        // there, exactly as a four-voice board would.
        for (const program of VKKit.PROGRAM_LIST) {
          for (const voice of program.voices) {
            buffers.set(
              `${program.id}:${voice}`,
              toBuffer(
                VKDsp.renderSteps(program.steps, {
                  sampleRate: sr,
                  id: program.id,
                  totalSeconds: program.durationSeconds,
                  voiceFilter: voice,
                })
              )
            );
          }
        }
        for (const cue of Object.values(VKKit.BGM_CUES)) {
          for (const layer of VKKit.BGM_LAYERS) {
            cueBuffers.set(
              `${cue.id}:${layer.voice}`,
              toBuffer(VKDsp.renderCueVoice(cue, layer.voice, { sampleRate: sr }))
            );
          }
        }
        for (const layer of VKKit.BGM_LAYERS) {
          const g = ctx.createGain();
          g.gain.value = 0;
          g.connect(master);
          voiceGains.set(layer.voice, g);
        }
        return ctx.state;
      },
      resume() {
        if (ctx && ctx.state === "suspended") ctx.resume();
      },
      /* A looping BufferSource does not care that the tab is hidden: the
       * animation frame loop stops but the audio clock does not. Suspending
       * the context stops both, and freezes currentTime so the BGM loop
       * bookkeeping stays consistent across the gap. */
      suspend() {
        if (ctx && ctx.state === "running") ctx.suspend();
      },
      get state() {
        return ctx ? ctx.state : "uninitialised";
      },
      configureMaster() {
        /* master is fixed by the frozen profile; nothing to reconfigure */
      },
      playProgram(program) {
        if (!ctx) return;
        const now = ctx.currentTime;
        for (const voice of program.voices) {
          const buf = buffers.get(`${program.id}:${voice}`);
          if (!buf) continue;
          const previous = seSources.get(voice);
          if (previous) {
            // Steal the voice with a 3 ms fade so the cut is not a click.
            try {
              previous.gain.gain.cancelScheduledValues(now);
              previous.gain.gain.setTargetAtTime(0, now, 0.001);
              previous.source.stop(now + 0.01);
            } catch (e) {
              /* already finished */
            }
          }
          const gain = ctx.createGain();
          gain.gain.value = 1;
          gain.connect(master);
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(gain);
          src.start(now);
          const slot = { source: src, gain };
          seSources.set(voice, slot);
          src.onended = () => {
            if (seSources.get(voice) === slot) seSources.delete(voice);
          };
        }
      },
      activeVoices() {
        return Array.from(seSources.keys());
      },
      startCue(cueId) {
        if (!ctx) return;
        if (currentCue === cueId && started) return;
        const now = ctx.currentTime;
        const loop = VKKit.LOOP_SECONDS;
        let at = now + 0.02;
        let offset = 0;
        if (started && currentCue) {
          // Swap on the four-bar grid, and start the incoming cue at the
          // position the outgoing one had reached. Both cues share the form,
          // so the swap continues the phrase instead of restarting it -- and
          // the player hears the change within four bars rather than waiting
          // out a whole loop.
          const grid = VKKit.SWAP_GRID_SECONDS;
          const elapsed = now - cueStartTime;
          let k = Math.ceil(elapsed / grid);
          if (cueStartTime + k * grid - now < 0.05) k++;
          at = cueStartTime + k * grid;
          offset = (k * grid) % loop;
        }
        for (const [voice, src] of voiceSources) {
          try {
            src.stop(at);
          } catch (e) {
            /* already stopped */
          }
          voiceSources.delete(voice);
        }
        for (const layer of VKKit.BGM_LAYERS) {
          const buf = cueBuffers.get(`${cueId}:${layer.voice}`);
          if (!buf) continue;
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.loop = true;
          src.connect(voiceGains.get(layer.voice));
          src.start(at, offset);
          voiceSources.set(layer.voice, src);
        }
        currentCue = cueId;
        // cueStartTime always means "when buffer position 0 last passed", so
        // the grid maths above stays correct across any number of swaps.
        cueStartTime = at - offset;
        started = true;
      },
      /** Position inside the loop, for boundary-quantised layer changes. */
      cuePosition() {
        if (!ctx || !started) return null;
        const loop = VKKit.LOOP_SECONDS;
        const p = (ctx.currentTime - cueStartTime) % loop;
        return p < 0 ? p + loop : p;
      },
      setLayerGains(gains) {
        if (!ctx) return;
        layerTargets = gains;
        const now = ctx.currentTime;
        for (const [voice, g] of voiceGains) {
          const target = gains[voice] || 0;
          // A duck holds the voice down while it runs -- but a request for
          // silence must always get through. Stopping the BGM has to survive a
          // duck that is still in flight, or the scheduled end of that duck
          // brings the music back on top of the ceremony.
          if (target > 0 && duckUntil[voice] && duckUntil[voice] > now) continue;
          if (target === 0) duckUntil[voice] = 0;
          if (lastTarget[voice] === target) continue;
          lastTarget[voice] = target;
          g.gain.cancelScheduledValues(now);
          g.gain.setTargetAtTime(target, now, 0.08);
        }
      },
      duck(voices, seconds) {
        if (!ctx) return;
        const now = ctx.currentTime;
        for (const voice of voices) {
          const g = voiceGains.get(voice);
          if (!g) continue;
          duckUntil[voice] = now + seconds;
          lastTarget[voice] = 0;
          g.gain.cancelScheduledValues(now);
          g.gain.setTargetAtTime(0, now, 0.005);
          // No scheduled restore: the per-frame setLayerGains brings the voice
          // back once the duck expires, reading the target that is live then
          // rather than the one captured here. A captured target is wrong the
          // moment anything changes during the jingle -- including the BGM
          // being stopped.
        }
      },
      stopAll() {
        if (!ctx) return;
        for (const [voice, src] of voiceSources) {
          try {
            src.stop();
          } catch (e) {
            /* already stopped */
          }
          voiceSources.delete(voice);
        }
        for (const [voice, slot] of seSources) {
          try {
            slot.source.stop();
          } catch (e) {
            /* already stopped */
          }
          seSources.delete(voice);
        }
        started = false;
        currentCue = null;
        duckUntil = {};
        lastTarget = {};
      },
    };
  }

  /* ---------------------------------------------------------------- the bus */

  function createBus(options) {
    const opts = options || {};
    const adapter = opts.adapter || createMockAdapter();
    const kit = VKKit;
    const state = {
      muted: false,
      paused: false,
      demoSoundEnabled: false, // attract mode is silent by default
      demoFrame: false,
      frameId: -1,
      danger: 0,
      queue: [],
      seq: 0,
      counts: new Map(),
      lastFrameByName: new Map(),
      log: [],
      logLimit: opts.logLimit == null ? 400 : opts.logLimit,
      bgmEnabled: false,
      activeCue: null,
      cueStartFrame: null,
      layerOn: {},
      layerBar: null,
      jingleUntilFrame: -1,
      voicesUsedLastTick: [],
    };
    for (const layer of kit.BGM_LAYERS) state.layerOn[layer.voice] = layer.dangerOn <= 0;

    function record(entry) {
      state.log.push(entry);
      if (state.log.length > state.logLimit) state.log.shift();
    }

    function resolve(event) {
      const alias = kit.ALIASES[event.name];
      if (!alias) return null;
      if (typeof alias === "string") return { kind: "program", data: kit.PROGRAMS[alias] };
      return { kind: "cue", id: alias.id };
    }

    /**
     * Where the cue is inside its loop, in seconds. The adapter answers from
     * the audio clock when it has one; the mock has no clock, so the frame
     * counter stands in. Either way this is what quantises a layer change to a
     * bar: the danger axis moves every frame and the arrangement must not.
     */
    function cuePosition() {
      if (!state.activeCue) return null;
      if (adapter.cuePosition) {
        const p = adapter.cuePosition();
        if (p != null) return p;
      }
      if (state.cueStartFrame == null) return null;
      return ((state.frameId - state.cueStartFrame) / 60) % kit.LOOP_SECONDS;
    }

    /**
     * Re-evaluate which layers are audible. A layer may only change at a bar
     * boundary, and each layer carries its own hysteresis: the raw axis crosses
     * the percussion threshold about 40 times a minute in real play, which as a
     * direct gate is a flicker rather than an arrangement.
     */
    function updateLayers(force) {
      const pos = cuePosition();
      // The epsilon is not cosmetic: a frame that lands exactly on a bar gives
      // a position like 4.8, and 4.8 / 1.6 is 2.9999999999999996 in doubles, so
      // the boundary would be missed and the change deferred a whole bar.
      const bar = pos == null ? null : Math.floor(pos / kit.BAR_SECONDS + 1e-9);
      if (!force && bar != null && bar === state.layerBar) return;
      state.layerBar = bar;
      for (const layer of kit.BGM_LAYERS) {
        const on = state.layerOn[layer.voice];
        const threshold = on ? layer.dangerOff : layer.dangerOn;
        state.layerOn[layer.voice] = state.danger >= threshold;
      }
    }

    function bgmGains() {
      const gains = {};
      for (const layer of kit.BGM_LAYERS) {
        gains[layer.voice] = state.bgmEnabled && state.layerOn[layer.voice] ? 1 : 0;
      }
      return gains;
    }

    /** Voices the BGM is physically holding right now. */
    function bgmActiveVoices() {
      const g = bgmGains();
      return Object.keys(g).filter((v) => g[v] > 0);
    }

    const bus = {
      adapter,
      get log() {
        return state.log;
      },
      init() {
        const result = adapter.init();
        adapter.configureMaster(kit.PROFILE.master);
        return result;
      },
      /** Hidden tab / lost cabinet: stop the audio clock, keep the state. */
      setPaused(paused) {
        state.paused = !!paused;
        if (paused) {
          if (adapter.suspend) adapter.suspend();
        } else if (adapter.resume) {
          adapter.resume();
        }
      },
      setMuted(muted) {
        state.muted = !!muted;
        if (state.muted) adapter.setLayerGains({});
        else adapter.setLayerGains(bgmGains());
      },
      setDemoSoundEnabled(enabled) {
        state.demoSoundEnabled = !!enabled;
      },
      setIntent(danger) {
        const clamped = Math.max(0, Math.min(1, Number(danger) || 0));
        state.danger = clamped;
      },
      startBgm() {
        state.bgmEnabled = true;
        // A run starts with the arrangement the axis asks for, rather than
        // waiting a bar for the first boundary.
        updateLayers(true);
      },
      stopBgm() {
        state.bgmEnabled = false;
        adapter.setLayerGains({});
      },
      beginFrame(frameId, isDemo) {
        state.frameId = frameId;
        state.demoFrame = !!isDemo;
        state.queue.length = 0;
        state.counts.clear();
      },
      emit(name, emitOptions) {
        const event = kit.EVENT_BY_NAME[name];
        if (!event) {
          record({ frame: state.frameId, name, action: "unknown" });
          return;
        }
        const o = emitOptions || {};
        const demo = o.demo == null ? state.demoFrame : !!o.demo;
        if (event.classification === "none") {
          record({ frame: state.frameId, name, action: "none" });
          return;
        }
        if (state.muted) {
          record({ frame: state.frameId, name, action: "suppressed:mute" });
          return;
        }
        if (demo && !state.demoSoundEnabled) {
          record({ frame: state.frameId, name, action: "suppressed:demo" });
          return;
        }
        const count = state.counts.get(name) || 0;
        if (count >= REPEAT_CAP) {
          record({ frame: state.frameId, name, action: "capped" });
          return;
        }
        state.counts.set(name, count + 1);
        if (event.minIntervalFrames) {
          const last = state.lastFrameByName.get(name);
          if (last != null && state.frameId - last < event.minIntervalFrames) {
            record({ frame: state.frameId, name, action: "cooldown" });
            return;
          }
        }
        state.queue.push({ event, options: o, seq: state.seq++ });
      },
      /** Arbitrate everything emitted this frame, then dispatch. */
      endFrame() {
        const jingleActive = state.frameId < state.jingleUntilFrame;
        const entries = state.queue.slice().sort((a, b) => {
          if (b.event.priority !== a.event.priority) return b.event.priority - a.event.priority;
          return a.seq - b.seq;
        });

        const used = new Set();
        const winners = [];
        const familyWinner = new Map();

        for (const entry of entries) {
          const event = entry.event;
          if (event.classification === "bgm") {
            winners.push(entry);
            continue;
          }
          const resolved = resolve(event);
          if (!resolved || !resolved.data) {
            record({ frame: state.frameId, name: event.name, action: "unresolved" });
            continue;
          }
          const pool = event.classification === "jingle" ? JINGLE_VOICE_POOL : SE_VOICE_POOL;
          const voices = resolved.data.voices;
          const outOfPool = voices.filter((v) => pool.indexOf(v) < 0);
          if (outOfPool.length) {
            record({ frame: state.frameId, name: event.name, action: "unavailable", voices: outOfPool });
            continue;
          }
          const conflict = voices.some((v) => used.has(v));
          if (conflict) {
            const policy = event.family
              ? kit.PROFILE.sameTickPolicyOverrides[event.family] || kit.PROFILE.sameTickPolicy
              : kit.PROFILE.sameTickPolicy;
            if (policy === "coalesce" && familyWinner.has(event.family)) {
              const winner = familyWinner.get(event.family);
              if ((event.rank || 0) > (winner.event.rank || 0)) {
                // The chain count is information: keep the highest-ranked
                // member of the family as the single audible note. The request
                // that held the voice is the one that merged away.
                const displaced = winner.event.name;
                winner.event = event;
                winner.resolved = resolve(event);
                record({ frame: state.frameId, name: displaced, action: "coalesced", into: event.name });
              } else {
                record({ frame: state.frameId, name: event.name, action: "coalesced", into: winner.event.name });
              }
            } else {
              record({ frame: state.frameId, name: event.name, action: "dropped", voices });
            }
            continue;
          }
          voices.forEach((v) => used.add(v));
          const winner = { event, resolved, options: entry.options };
          winners.push(winner);
          if (event.family && !familyWinner.has(event.family)) familyWinner.set(event.family, winner);
          state.lastFrameByName.set(event.name, state.frameId);
        }

        // Physical voice accounting: BGM voices plus SE voices, with a shared
        // noise generator counted once.
        const physical = new Set(bgmActiveVoices());
        used.forEach((v) => physical.add(v));
        state.voicesUsedLastTick = Array.from(physical);
        if (physical.size > kit.PROFILE.voiceLimit) {
          record({ frame: state.frameId, name: "*", action: "voiceLimitExceeded", voices: state.voicesUsedLastTick });
        }

        for (const winner of winners) {
          const event = winner.event;
          if (event.classification === "bgm") {
            const cueId = kit.ALIASES[event.name].id;
            if (state.activeCue !== cueId) {
              const first = state.activeCue == null;
              state.activeCue = cueId;
              // A swap keeps its place in the form, so the bar clock only
              // restarts when the BGM itself does.
              if (first) {
                state.cueStartFrame = state.frameId;
                state.layerBar = null;
              }
              adapter.startCue(cueId);
              record({ frame: state.frameId, name: event.name, action: "cue", id: cueId });
            }
            continue;
          }
          adapter.playProgram(
            winner.resolved.data,
            Object.assign({ frame: state.frameId }, winner.options)
          );
          record({
            frame: state.frameId,
            name: event.name,
            action: "played",
            id: winner.resolved.data.id,
          });
          if (event.classification === "jingle") {
            // Jingles pause the BGM outright.
            const seconds = winner.resolved.data.durationSeconds;
            adapter.duck(kit.BGM_LAYERS.map((l) => l.voice), seconds);
            state.jingleUntilFrame = state.frameId + Math.ceil(seconds * 60);
          } else if (winner.resolved.data.voices.indexOf("noise") >= 0) {
            // A SE claiming the shared noise generator ducks BGM percussion.
            adapter.duck(["noise"], winner.resolved.data.durationSeconds);
          }
        }

        updateLayers(false);
        if (!jingleActive && !state.muted) adapter.setLayerGains(bgmGains());
        state.queue.length = 0;
      },
      stopAll() {
        state.jingleUntilFrame = -1;
        state.activeCue = null;
        state.cueStartFrame = null;
        state.layerBar = null;
        state.bgmEnabled = false;
        adapter.stopAll();
      },
      /** Diagnostics used by the tests. */
      debug() {
        return {
          danger: state.danger,
          activeCue: state.activeCue,
          bgmGains: bgmGains(),
          cuePosition: cuePosition(),
          layerBar: state.layerBar,
          voicesUsedLastTick: state.voicesUsedLastTick.slice(),
          muted: state.muted,
          paused: state.paused,
          demoSoundEnabled: state.demoSoundEnabled,
        };
      },
      /** Which cue the current danger level asks for, with hysteresis. */
      desiredCue() {
        if (state.activeCue === "critical") {
          return state.danger < kit.CUE_SWITCH.toMain ? "main" : "critical";
        }
        return state.danger >= kit.CUE_SWITCH.toCritical ? "critical" : "main";
      },
    };
    return bus;
  }

  return { createBus, createMockAdapter, createWebAudioAdapter, REPEAT_CAP, SE_VOICE_POOL, JINGLE_VOICE_POOL };
});
