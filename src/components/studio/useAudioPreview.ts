"use client";

import { useEffect, useRef, useCallback } from "react";

/**
 * useAudioPreview
 * ---------------
 * The single most important piece for EXACT caption sync:
 * a live boundary audition loop + a sample-accurate playback clock.
 *
 * Why AudioContext instead of <audio>.currentTime?
 * HTMLMediaElement.currentTime updates at ~4Hz in some browsers and is not
 * sample-accurate. AudioContext.currentTime is driven by the audio hardware
 * clock and is accurate to the sample.
 */

const PRE_ROLL_SEC = 0.25;  // 250ms before the boundary
const POST_ROLL_SEC = 0.25; // 250ms after the boundary

export interface AudioPreviewApi {
  startBoundaryLoop: (timeSec: number) => void;
  updateBoundaryLoop: (timeSec: number) => void;
  stopBoundaryLoop: () => void;
  seekPlayhead: (timeSec: number) => void;
  getPlaybackTime: () => number;
  isPlaying: () => boolean;
  play: () => void;
  pause: () => void;
}

export function useAudioPreview(audioBuffer: AudioBuffer | null): AudioPreviewApi {
  const ctxRef = useRef<AudioContext | null>(null);

  // Boundary audition loop nodes
  const loopSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const loopGainRef = useRef<GainNode | null>(null);

  // Transport (full playback) nodes + clock offsets
  const transportSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const transportStartCtxTimeRef = useRef(0); // ctx.currentTime at play start
  const transportStartSecRef = useRef(0);     // audio-time offset at play start
  const playingRef = useRef(false);

  // Lazily create the AudioContext on first user gesture (autoplay policy).
  const ensureCtx = useCallback((): AudioContext => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
    }
    if (ctxRef.current.state === "suspended") {
      void ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);

  // ─── Boundary audition loop ──────────────────────────────────────────────

  const stopBoundaryLoop = useCallback(() => {
    if (loopSrcRef.current) {
      try { loopSrcRef.current.stop(); } catch { /* already stopped */ }
      loopSrcRef.current.disconnect();
      loopSrcRef.current = null;
    }
    if (loopGainRef.current) {
      loopGainRef.current.disconnect();
      loopGainRef.current = null;
    }
  }, []);

  const startBoundaryLoop = useCallback(
    (timeSec: number) => {
      if (!audioBuffer) return;
      const ctx = ensureCtx();
      stopBoundaryLoop();

      const src = ctx.createBufferSource();
      src.buffer = audioBuffer;
      src.loop = true;

      // Clamp the window so we never loop before 0 or past the buffer end.
      const start = Math.max(0, timeSec - PRE_ROLL_SEC);
      const end = Math.min(audioBuffer.duration, timeSec + POST_ROLL_SEC);
      src.loopStart = start;
      src.loopEnd = end;

      // 5ms fade-in to avoid an audible click at loop start.
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.005);

      src.connect(gain);
      gain.connect(ctx.destination);
      src.start(0, start);

      loopSrcRef.current = src;
      loopGainRef.current = gain;
    },
    [audioBuffer, ensureCtx, stopBoundaryLoop],
  );

  const updateBoundaryLoop = useCallback(
    (timeSec: number) => {
      if (!audioBuffer || !loopSrcRef.current) return;
      // Only mutate loop points — do NOT restart the source node.
      // Restarting resets phase and causes a click, which destroys the
      // user's perception of "where the cut actually is".
      loopSrcRef.current.loopStart = Math.max(0, timeSec - PRE_ROLL_SEC);
      loopSrcRef.current.loopEnd = Math.min(
        audioBuffer.duration,
        timeSec + POST_ROLL_SEC,
      );
    },
    [audioBuffer],
  );

  // ─── Transport (play / pause / clock) ────────────────────────────────────

  const stopTransportSource = useCallback(() => {
    if (transportSrcRef.current) {
      try { transportSrcRef.current.stop(); } catch { /* ignore */ }
      transportSrcRef.current.disconnect();
      transportSrcRef.current = null;
    }
  }, []);

  const getPlaybackTimeInternal = useCallback((): number => {
    if (!playingRef.current || !ctxRef.current) {
      return transportStartSecRef.current;
    }
    const elapsed =
      ctxRef.current.currentTime - transportStartCtxTimeRef.current;
    return transportStartSecRef.current + elapsed;
  }, []);

  const play = useCallback(() => {
    if (!audioBuffer || playingRef.current) return;
    const ctx = ensureCtx();
    stopTransportSource();

    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(ctx.destination);

    const offset = Math.min(transportStartSecRef.current, audioBuffer.duration);
    src.start(0, offset);

    transportStartCtxTimeRef.current = ctx.currentTime;
    transportSrcRef.current = src;
    playingRef.current = true;

    src.onended = () => {
      playingRef.current = false;
      transportSrcRef.current = null;
    };
  }, [audioBuffer, ensureCtx, stopTransportSource]);

  const pause = useCallback(() => {
    if (!playingRef.current) return;
    // Freeze the clock at the current position before tearing down the node.
    transportStartSecRef.current = getPlaybackTimeInternal();
    stopTransportSource();
    playingRef.current = false;
  }, [getPlaybackTimeInternal, stopTransportSource]);

  const getPlaybackTime = useCallback(
    () => getPlaybackTimeInternal(),
    [getPlaybackTimeInternal],
  );

  const isPlaying = useCallback(() => playingRef.current, []);

  const seekPlayhead = useCallback(
    (timeSec: number) => {
      transportStartSecRef.current = Math.max(0, timeSec);
      if (playingRef.current) {
        // Restart from the new position.
        playingRef.current = false;
        play();
      }
    },
    [play],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopBoundaryLoop();
      stopTransportSource();
      if (ctxRef.current && ctxRef.current.state !== "closed") {
        void ctxRef.current.close();
      }
    };
  }, [stopBoundaryLoop, stopTransportSource]);

  return {
    startBoundaryLoop,
    updateBoundaryLoop,
    stopBoundaryLoop,
    seekPlayhead,
    getPlaybackTime,
    isPlaying,
    play,
    pause,
  };
}
