export async function decodeAudio(buffer: ArrayBuffer): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(1, 1, 44100);
  return ctx.decodeAudioData(buffer.slice(0));
}

export function extractPeaks(audio: AudioBuffer, buckets = 1800): Float32Array {
  const channel = audio.getChannelData(0);
  const peaks = new Float32Array(buckets);
  const step = Math.max(1, Math.floor(channel.length / buckets));
  for (let i = 0; i < buckets; i += 1) {
    let max = 0;
    const start = i * step;
    const end = Math.min(channel.length, start + step);
    for (let s = start; s < end; s += 1) {
      const v = Math.abs(channel[s] ?? 0);
      if (v > max) max = v;
    }
    peaks[i] = max;
  }
  return peaks;
}

export function downsampleMono(audio: AudioBuffer, targetRate = 16000): Float32Array {
  const src = audio.getChannelData(0);
  const ratio = audio.sampleRate / targetRate;
  const out = new Float32Array(Math.max(1, Math.floor(src.length / ratio)));
  for (let i = 0; i < out.length; i += 1) {
    out[i] = src[Math.floor(i * ratio)] ?? 0;
  }
  return out;
}

export function encodeWavMono16(samples: Float32Array, sampleRate: number): Blob {
  const bytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + bytes);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, bytes, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}
