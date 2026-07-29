/**
 * Cross-platform audio for SwingTempo.
 *
 * Web  → Web Audio API (unchanged, always worked)
 * Native → expo-av Audio.Sound with WAV files generated and cached on disk
 *
 * IMPORTANT: playsInSilentModeIOS must be true or iOS mutes us when the
 * phone is on silent / ring-vibrate.
 */

import { Audio } from "expo-av";
// SDK 54 replaced expo-file-system's default API with a File/Directory/Paths
// based one; cacheDirectory/writeAsStringAsync/EncodingType only exist on
// the legacy subpath.
import * as FileSystem from "expo-file-system/legacy";
import * as Speech from "expo-speech";
import { Platform } from "react-native";

/* ──────────────────────────────────────────────────────────────────
   WAV generator (native only)
─────────────────────────────────────────────────────────────────── */

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

function buildWav(
  frequency: number,
  durationSec: number,
  gainPeak = 0.6,
  waveType: "sine" | "triangle" = "sine",
  /** Simple ADSR as fractions of total duration */
  adsr = { a: 0.02, d: 0.1, s: 0.5, r: 0.3 },
): Uint8Array {
  const sampleRate = 22050;
  const numSamples = Math.max(1, Math.floor(sampleRate * durationSec));
  const buf        = new ArrayBuffer(44 + numSamples * 2);
  const view       = new DataView(buf);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);                   // PCM
  view.setUint16(22, 1, true);                   // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);      // byte rate
  view.setUint16(32, 2, true);                   // block align
  view.setUint16(34, 16, true);                  // bits per sample
  writeString(view, 36, "data");
  view.setUint32(40, numSamples * 2, true);

  const attackEnd  = adsr.a * durationSec;
  const decayEnd   = attackEnd + adsr.d * durationSec;
  const releaseStart = durationSec - adsr.r * durationSec;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;

    // Waveform
    let s: number;
    if (waveType === "sine") {
      s = Math.sin(2 * Math.PI * frequency * t);
    } else {
      const phase = ((frequency * t) % 1 + 1) % 1;
      s = phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase;
    }

    // ADSR envelope
    let env: number;
    if (t < attackEnd) {
      env = t / attackEnd;
    } else if (t < decayEnd) {
      env = 1 - (1 - adsr.s) * (t - attackEnd) / (adsr.d * durationSec);
    } else if (t < releaseStart) {
      env = adsr.s;
    } else {
      env = adsr.s * Math.max(0, 1 - (t - releaseStart) / (adsr.r * durationSec));
    }

    const val = Math.max(-1, Math.min(1, s * env * gainPeak));
    view.setInt16(44 + i * 2, Math.round(val * 0x7fff), true);
  }

  return new Uint8Array(buf);
}

/* base64 encode without btoa (safe on all RN engines) */
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < bytes.length ? B64[b2 & 63] : "=";
  }
  return out;
}

/* ──────────────────────────────────────────────────────────────────
   Web Audio API helpers (web only)
─────────────────────────────────────────────────────────────────── */

let webCtx: AudioContext | null = null;
function getWebCtx() {
  if (!webCtx) {
    try {
      webCtx = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      )();
    } catch { /* ignore */ }
  }
  // Browsers start contexts "suspended" until a user gesture resumes them;
  // resuming here (instead of lazily on first real tone) means the very
  // first tap doesn't pay that unsuspend latency on top of the beep itself.
  if (webCtx && webCtx.state === "suspended") {
    webCtx.resume().catch(() => { /* ignore */ });
  }
  return webCtx;
}

/** Silent zero-gain blip that forces the audio graph to fully spin up. */
function warmWebCtx() {
  const ctx = getWebCtx(); if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0, ctx.currentTime);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.01);
  } catch { /* ignore */ }
}

function webTone(freq: number, dur: number, gain: number) {
  const ctx = getWebCtx(); if (!ctx) return;
  const osc = ctx.createOscillator();
  const g   = ctx.createGain();
  osc.connect(g); g.connect(ctx.destination);
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur);
}

function webPiano(freq: number, dur: number) {
  const ctx = getWebCtx(); if (!ctx) return;
  const osc = ctx.createOscillator();
  const g   = ctx.createGain();
  osc.connect(g); g.connect(ctx.destination);
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  const now = ctx.currentTime;
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(0.4, now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.2, now + 0.15);
  g.gain.exponentialRampToValueAtTime(0.001, now + dur);
  osc.start(now); osc.stop(now + dur);
}

/* ──────────────────────────────────────────────────────────────────
   Native: cache Audio.Sound objects so playback is instant
─────────────────────────────────────────────────────────────────── */

const cache: Record<string, Promise<Audio.Sound | null>> = {};
let audioModeSet = false;

async function ensureAudioMode() {
  if (audioModeSet) return;
  audioModeSet = true;
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS:        false,
      staysActiveInBackground:   false,
      playsInSilentModeIOS:      true,   // play even on silent/vibrate
      shouldDuckAndroid:         false,
      playThroughEarpieceAndroid: false,
    });
  } catch { /* ignore */ }
}

// Loads are memoized by promise (not by a finished sound object) so a beep
// that fires while a preload is still in flight awaits the same load instead
// of silently dropping — that race was why the very first beep after app
// launch could go missing while the rest fired late and bunched together.
function loadNativeSound(
  key: string,
  freq: number,
  dur: number,
  gain: number,
  wave: "sine" | "triangle" = "sine",
  adsr?: { a: number; d: number; s: number; r: number },
): Promise<Audio.Sound | null> {
  if (key in cache) return cache[key];

  const promise = (async () => {
    try {
      await ensureAudioMode();
      const wav  = buildWav(freq, dur, gain, wave, adsr ?? { a: 0.01, d: 0.15, s: 0.3, r: 0.3 });
      const b64  = toBase64(wav);
      const path = `${FileSystem.cacheDirectory}st_${key}.wav`;
      await FileSystem.writeAsStringAsync(path, b64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const { sound } = await Audio.Sound.createAsync({ uri: path });
      return sound;
    } catch {
      delete cache[key];
      return null;
    }
  })();

  cache[key] = promise;
  return promise;
}

async function playNativeSound(
  key: string,
  freq: number,
  dur: number,
  gain: number,
  wave: "sine" | "triangle" = "sine",
  adsr?: { a: number; d: number; s: number; r: number },
) {
  try {
    const sound = await loadNativeSound(key, freq, dur, gain, wave, adsr);
    if (!sound) return;
    // A single replayAsync() call is one native bridge round-trip instead of
    // three (stop + seek + play) — that saved latency is what keeps beeps
    // audibly in sync with the video at normal speed.
    await sound.replayAsync();
  } catch { /* ignore */ }
}

/* ──────────────────────────────────────────────────────────────────
   Voice
─────────────────────────────────────────────────────────────────── */

async function speakWord(word: string) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(word);
      u.rate = 1.1; u.pitch = 1.0;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    }
    return;
  }
  try {
    if (await Speech.isSpeakingAsync()) Speech.stop();
    Speech.speak(word, { rate: 1.1, pitch: 1.0, language: "en-US" });
  } catch { /* ignore */ }
}

/* ──────────────────────────────────────────────────────────────────
   Public API
─────────────────────────────────────────────────────────────────── */

// Awaitable: callers that are about to start time-sensitive playback (e.g.
// the analysis preview) can `await preloadSounds()` right before it starts
// to guarantee every beep is fully loaded first. Once warm (the normal case,
// since this also fires once at app boot) every load promise here is already
// settled, so the await is effectively free.
export async function preloadSounds(): Promise<void> {
  if (Platform.OS === "web") {
    // No file cache on web — instead warm the AudioContext itself so the
    // very first tap doesn't eat the "cold start" latency of creating and
    // unsuspending it.
    warmWebCtx();
    return;
  }
  await Promise.all([
    loadNativeSound("tone_start",  660,   0.12, 0.55),
    loadNativeSound("tone_top",    880,   0.12, 0.60),
    loadNativeSound("tone_impact", 1100,  0.18, 0.65),
    loadNativeSound("piano_start", 523.25, 0.55, 0.50, "triangle", { a: 0.02, d: 0.12, s: 0.45, r: 0.35 }),
    loadNativeSound("piano_top",   659.25, 0.55, 0.55, "triangle", { a: 0.02, d: 0.12, s: 0.45, r: 0.35 }),
    loadNativeSound("piano_impact",880.0,  0.65, 0.60, "triangle", { a: 0.02, d: 0.12, s: 0.45, r: 0.35 }),
  ]);
}

/** Stops anything that can linger past a phase's short envelope (voice cues). */
export function stopAllAudio() {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    return;
  }
  Speech.stop().catch(() => { /* ignore */ });
}

export function playStart(mode: string) {
  if (Platform.OS === "web") {
    if (mode === "tones") webTone(660,  0.10, 0.30);
    if (mode === "piano") webPiano(523.25, 0.55);
    if (mode === "voice") speakWord("start");
    return;
  }
  if (mode === "tones") playNativeSound("tone_start",  660,   0.12, 0.55);
  if (mode === "piano") playNativeSound("piano_start", 523.25, 0.55, 0.50, "triangle", { a: 0.02, d: 0.12, s: 0.45, r: 0.35 });
  if (mode === "voice") speakWord("start");
}

export function playTop(mode: string) {
  if (Platform.OS === "web") {
    if (mode === "tones") webTone(880,  0.10, 0.40);
    if (mode === "piano") webPiano(659.25, 0.55);
    if (mode === "voice") speakWord("top");
    return;
  }
  if (mode === "tones") playNativeSound("tone_top",  880,   0.12, 0.60);
  if (mode === "piano") playNativeSound("piano_top", 659.25, 0.55, 0.55, "triangle", { a: 0.02, d: 0.12, s: 0.45, r: 0.35 });
  if (mode === "voice") speakWord("top");
}

export function playImpact(mode: string) {
  if (Platform.OS === "web") {
    if (mode === "tones") webTone(1100, 0.14, 0.55);
    if (mode === "piano") webPiano(880.0, 0.65);
    if (mode === "voice") speakWord("hit");
    return;
  }
  if (mode === "tones") playNativeSound("tone_impact", 1100, 0.18, 0.65);
  if (mode === "piano") playNativeSound("piano_impact", 880.0, 0.65, 0.60, "triangle", { a: 0.02, d: 0.12, s: 0.45, r: 0.35 });
  if (mode === "voice") speakWord("impact");
}
