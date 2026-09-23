/**
 * expo-video player behind the small expo-av–style surface the swing screens
 * were built on (analysis, compare, ball tracker).
 *
 * expo-av was removed in Expo SDK 55. Rather than re-tune the frame-accurate
 * seeking, beep sync and slow-mo logic in each screen, this component keeps
 * their contract: an imperative ref with setPositionAsync / playAsync /
 * pauseAsync / setRateAsync, plus onLoad / onPlaybackStatusUpdate /
 * onReadyForDisplay callbacks carrying millisecond positions.
 */
import { useVideoPlayer, VideoView, type VideoPlayer } from "expo-video";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import type { StyleProp, ViewStyle } from "react-native";

export type SwingVideoStatus =
  | { isLoaded: false }
  | {
      isLoaded: true;
      positionMillis: number;
      durationMillis?: number;
      isPlaying: boolean;
      rate: number;
      didJustFinish: boolean;
    };

export interface SwingVideoHandle {
  setPositionAsync(ms: number, tolerance?: { toleranceMillisBefore?: number; toleranceMillisAfter?: number }): Promise<void>;
  playAsync(): Promise<void>;
  pauseAsync(): Promise<void>;
  setRateAsync(rate: number, shouldCorrectPitch?: boolean): Promise<void>;
}

interface SwingVideoProps {
  source: { uri?: string | null };
  style?: StyleProp<ViewStyle>;
  resizeMode?: "contain" | "cover";
  isLooping?: boolean;
  /** How often onPlaybackStatusUpdate fires while playing (expo-av name kept). */
  progressUpdateIntervalMillis?: number;
  onLoad?: () => void;
  onPlaybackStatusUpdate?: (status: SwingVideoStatus) => void;
  onReadyForDisplay?: (event: { naturalSize?: { width: number; height: number } }) => void;
  useNativeControls?: boolean;
}

/** Resolves after two animation frames: long enough for a native seek issued
 *  on this frame to be reflected in the next reported position. expo-video's
 *  currentTime setter has no completion callback. */
const nextFrames = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

export const SwingVideo = forwardRef<SwingVideoHandle, SwingVideoProps>(function SwingVideo(
  {
    source,
    style,
    resizeMode = "contain",
    isLooping = false,
    progressUpdateIntervalMillis = 500,
    onLoad,
    onPlaybackStatusUpdate,
    onReadyForDisplay,
    useNativeControls = false,
  },
  ref,
) {
  const uri = source.uri ?? null;
  const player = useVideoPlayer(uri ? { uri } : null, (p) => {
    p.loop = isLooping;
    p.timeUpdateEventInterval = progressUpdateIntervalMillis / 1000;
    p.audioMixingMode = "mixWithOthers";
    p.preservesPitch = true;
  });

  // Latest callbacks without re-subscribing listeners on every render.
  const cb = useRef({ onLoad, onPlaybackStatusUpdate, onReadyForDisplay });
  cb.current = { onLoad, onPlaybackStatusUpdate, onReadyForDisplay };
  const loadedRef = useRef(false);
  const sizeRef = useRef<{ width: number; height: number } | undefined>(undefined);

  const emit = useCallback(
    (p: VideoPlayer, didJustFinish = false) => {
      if (!loadedRef.current) return;
      cb.current.onPlaybackStatusUpdate?.({
        isLoaded: true,
        positionMillis: p.currentTime * 1000,
        durationMillis: p.duration > 0 ? p.duration * 1000 : undefined,
        isPlaying: p.playing,
        rate: p.playbackRate,
        didJustFinish,
      });
    },
    [],
  );

  useEffect(() => {
    loadedRef.current = false;
    const subs = [
      player.addListener("sourceLoad", ({ availableVideoTracks }) => {
        const size = availableVideoTracks[0]?.size;
        if (size?.width && size?.height) sizeRef.current = { width: size.width, height: size.height };
      }),
      player.addListener("statusChange", ({ status }) => {
        if (status === "readyToPlay" && !loadedRef.current) {
          loadedRef.current = true;
          cb.current.onLoad?.();
          emit(player);
        }
      }),
      player.addListener("timeUpdate", () => emit(player)),
      player.addListener("playingChange", () => emit(player)),
      player.addListener("playbackRateChange", () => emit(player)),
      player.addListener("playToEnd", () => emit(player, true)),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [player, emit]);

  useImperativeHandle(
    ref,
    () => ({
      async setPositionAsync(ms, tolerance) {
        if (tolerance) {
          player.seekTolerance = {
            toleranceBefore: (tolerance.toleranceMillisBefore ?? 0) / 1000,
            toleranceAfter: (tolerance.toleranceMillisAfter ?? 0) / 1000,
          };
        }
        player.currentTime = Math.max(0, ms) / 1000;
        await nextFrames();
        emit(player);
      },
      async playAsync() {
        player.play();
      },
      async pauseAsync() {
        player.pause();
      },
      async setRateAsync(rate, shouldCorrectPitch = true) {
        player.preservesPitch = shouldCorrectPitch;
        player.playbackRate = rate;
      },
    }),
    [player, emit],
  );

  useEffect(() => {
    player.loop = isLooping;
  }, [player, isLooping]);

  return (
    <VideoView
      player={player}
      style={style}
      contentFit={resizeMode}
      nativeControls={useNativeControls}
      onFirstFrameRender={() =>
        cb.current.onReadyForDisplay?.({ naturalSize: sizeRef.current ?? player.videoTrack?.size ?? undefined })
      }
    />
  );
});
