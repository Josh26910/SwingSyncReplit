import React, { useState } from "react";
import {
  LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
} from "react-native";

const BLUE   = "#1A8CFF";
const MUTED  = "#444444";
const TRACK  = "#252525";
const TEXT   = "#FFFFFF";

const NODE_R = 7;   // radius of static nodes
const DOT_R  = 9;   // radius of animated dot

interface SwingTimelineProps {
  /** 0–1: where the TOP node falls (topMs / impactMs) */
  topFrac: number;
  /** 0–1: current dot position along the timeline (0=START, 1=HIT) */
  dotFrac: number;
  isPlaying: boolean;
  /** "ready" | "start" | "top" | "impact" */
  currentPhase: string;
}

export function SwingTimeline({
  topFrac,
  dotFrac,
  isPlaying,
  currentPhase,
}: SwingTimelineProps) {
  const [trackWidth, setTrackWidth] = useState(0);

  const topX   = topFrac * trackWidth;
  const dotX   = Math.max(0, Math.min(1, dotFrac)) * trackWidth;
  const fillW  = dotX;

  const topReached = isPlaying && dotFrac >= topFrac - 0.03;
  const hitReached = isPlaying && dotFrac >= 0.95;

  const showDot = isPlaying && dotFrac > 0;

  return (
    <View style={tl.outer}>
      {/* Track row */}
      <View
        style={tl.trackRow}
        onLayout={(e: LayoutChangeEvent) =>
          setTrackWidth(e.nativeEvent.layout.width)
        }
      >
        {trackWidth > 0 && (
          <>
            {/* Dotted background track */}
            <View style={tl.trackBg} />

            {/* Filled (active) portion */}
            {showDot && fillW > 0 && (
              <View
                style={[
                  tl.trackFill,
                  { width: fillW },
                ]}
              />
            )}

            {/* START node */}
            <View
              style={[
                tl.node,
                {
                  left: 0,
                  borderColor: showDot ? BLUE : MUTED,
                  backgroundColor: showDot ? "#0A1A2A" : "transparent",
                },
              ]}
            />

            {/* TOP node */}
            <View
              style={[
                tl.node,
                {
                  left: topX - NODE_R,
                  borderColor: topReached ? BLUE : MUTED,
                  backgroundColor: topReached ? "#0A1A2A" : "transparent",
                },
              ]}
            />

            {/* HIT node — larger glow when active */}
            <View
              style={[
                tl.node,
                hitReached && tl.nodeHitActive,
                {
                  right: 0,
                  left: undefined,
                  borderColor: hitReached ? BLUE : MUTED,
                  backgroundColor: hitReached ? BLUE : "transparent",
                },
              ]}
            />

            {/* Animated dot */}
            {showDot && (
              <View
                style={[
                  tl.dot,
                  hitReached && tl.dotHitActive,
                  { left: dotX - DOT_R },
                ]}
              />
            )}
          </>
        )}
      </View>

      {/* Labels */}
      <View style={tl.labelsRow}>
        <Text style={[tl.label, currentPhase === "start" && tl.labelActive]}>
          START
        </Text>
        {trackWidth > 0 && (
          <Text
            style={[
              tl.label,
              tl.labelTop,
              { marginLeft: topX - 16 },
              currentPhase === "top" && tl.labelActive,
            ]}
          >
            TOP
          </Text>
        )}
        <Text style={[tl.label, tl.labelHit, currentPhase === "impact" && tl.labelActive]}>
          HIT
        </Text>
      </View>
    </View>
  );
}

const tl = StyleSheet.create({
  outer: {
    width: "100%",
    paddingHorizontal: 4,
  },
  trackRow: {
    height: NODE_R * 2,
    position: "relative",
    justifyContent: "center",
  },
  trackBg: {
    position: "absolute",
    left: NODE_R,
    right: NODE_R,
    height: 2,
    backgroundColor: TRACK,
    borderRadius: 1,
  },
  trackFill: {
    position: "absolute",
    left: NODE_R,
    height: 2,
    backgroundColor: BLUE,
    borderRadius: 1,
  },
  node: {
    position: "absolute",
    width: NODE_R * 2,
    height: NODE_R * 2,
    borderRadius: NODE_R,
    borderWidth: 2,
  },
  nodeHitActive: {
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
    elevation: 6,
  },
  dot: {
    position: "absolute",
    width: DOT_R * 2,
    height: DOT_R * 2,
    borderRadius: DOT_R,
    backgroundColor: BLUE,
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 6,
    elevation: 5,
    top: NODE_R - DOT_R,
  },
  dotHitActive: {
    backgroundColor: BLUE,
    shadowOpacity: 1,
    shadowRadius: 12,
  },
  labelsRow: {
    flexDirection: "row",
    marginTop: 8,
    position: "relative",
    height: 16,
  },
  label: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.8,
    color: MUTED,
  },
  labelActive: {
    color: BLUE,
  },
  labelTop: {
    position: "absolute",
    top: 0,
  },
  labelHit: {
    position: "absolute",
    right: 0,
    top: 0,
  },
});
