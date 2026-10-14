/**
 * Web Audio API Ambient Soundscapes generator for immersive reading.
 * Synthesizes Rain, Ocean Waves, Cafe Ambiance, and Forest Night without external audio files.
 */

let ambientCtx: AudioContext | null = null;
let noiseNode: AudioNode | null = null;
let gainNode: GainNode | null = null;
let filterNode: BiquadFilterNode | null = null;
let lfoNode: OscillatorNode | null = null;
let lfoGain: GainNode | null = null;
let activePreset: string | null = null;
let currentVolume = 0.3;

function getAmbientContext(): AudioContext {
  if (!ambientCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    ambientCtx = new AudioContextClass();
  }
  if (ambientCtx.state === 'suspended') {
    ambientCtx.resume().catch(() => {});
  }
  return ambientCtx;
}

export type AmbientPreset = 'rain' | 'ocean' | 'cafe' | 'library';

export function playAmbientSound(preset: AmbientPreset, volume = 0.3): void {
  try {
    stopAmbientSound();
    const ctx = getAmbientContext();
    currentVolume = volume;
    activePreset = preset;

    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(currentVolume, ctx.currentTime);

    filterNode = ctx.createBiquadFilter();

    if (preset === 'rain') {
      filterNode.type = 'lowpass';
      filterNode.frequency.setValueAtTime(1000, ctx.currentTime);
      filterNode.Q.setValueAtTime(1.0, ctx.currentTime);
    } else if (preset === 'ocean') {
      filterNode.type = 'lowpass';
      filterNode.frequency.setValueAtTime(400, ctx.currentTime);

      lfoNode = ctx.createOscillator();
      lfoNode.frequency.setValueAtTime(0.15, ctx.currentTime);
      lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(300, ctx.currentTime);

      lfoNode.connect(lfoGain);
      lfoGain.connect(filterNode.frequency);
      lfoNode.start();
    } else if (preset === 'cafe') {
      filterNode.type = 'bandpass';
      filterNode.frequency.setValueAtTime(800, ctx.currentTime);
      filterNode.Q.setValueAtTime(0.8, ctx.currentTime);
    } else {
      filterNode.type = 'lowpass';
      filterNode.frequency.setValueAtTime(250, ctx.currentTime);
    }

    whiteNoise.connect(filterNode);
    filterNode.connect(gainNode);
    gainNode.connect(ctx.destination);

    whiteNoise.start();
    noiseNode = whiteNoise;
  } catch (err) {
    console.error('Error starting ambient sound:', err);
  }
}

export function stopAmbientSound(): void {
  try {
    if (noiseNode) {
      (noiseNode as AudioBufferSourceNode).stop();
      noiseNode.disconnect();
      noiseNode = null;
    }
    if (lfoNode) {
      lfoNode.stop();
      lfoNode.disconnect();
      lfoNode = null;
    }
    activePreset = null;
  } catch {
    // Ignore cleanup errors
  }
}

export function setAmbientVolume(vol: number): void {
  currentVolume = Math.max(0, Math.min(1, vol));
  if (gainNode && ambientCtx) {
    gainNode.gain.setValueAtTime(currentVolume, ambientCtx.currentTime);
  }
}

export function getActiveAmbientPreset(): string | null {
  return activePreset;
}
