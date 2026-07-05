import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  RadialGradient,
  Stop,
} from "react-native-svg";

import { TEMPOS, TempoKey, SwingPhase } from "@/context/TempoContext";

const SIZE = 280;
const CENTER = SIZE / 2;
const OUTER_R = 130;
const INNER_R = 108;
const NUM_TICKS = 60;

function getTickAngle(index: number): number {
  return (index / NUM_TICKS) * 2 * Math.PI - Math.PI / 2;
}

function msToTickIndex(ms: number, totalMs: number): number {
  return Math.round((ms / totalMs) * NUM_TICKS) % NUM_TICKS;
}

interface TempoDialProps {
  tempo: TempoKey;
  phase: SwingPhase;
  progress: number;
}

export function TempoDial({ tempo, phase, progress }: TempoDialProps) {
  const def = TEMPOS[tempo];
  const totalMs = def.impactMs + 200;

  const topTickIdx = msToTickIndex(def.topMs, totalMs);
  const impactTickIdx = msToTickIndex(def.impactMs, totalMs);

  const sweepAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (phase === "impact") {
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 80,
          useNativeDriver: true,
          easing: Easing.out(Easing.ease),
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
          easing: Easing.in(Easing.ease),
        }),
      ]).start();
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 60,
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [phase, pulseAnim, glowAnim]);

  useEffect(() => {
    sweepAnim.setValue(progress * 360);
  }, [progress, sweepAnim]);

  const sweepAngleDeg = progress * 360;
  const sweepRad = (sweepAngleDeg * Math.PI) / 180 - Math.PI / 2;
  const sweepX = CENTER + OUTER_R * Math.cos(sweepRad);
  const sweepY = CENTER + OUTER_R * Math.sin(sweepRad);

  return (
    <Animated.View
      style={[styles.container, { transform: [{ scale: pulseAnim }] }]}
    >
      <Svg width={SIZE} height={SIZE}>
        <Defs>
          <RadialGradient id="bgGrad" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#0D0D0D" stopOpacity="1" />
            <Stop offset="100%" stopColor="#000000" stopOpacity="1" />
          </RadialGradient>
          <RadialGradient id="innerGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#1A8CFF" stopOpacity="0.08" />
            <Stop offset="100%" stopColor="#1A8CFF" stopOpacity="0" />
          </RadialGradient>
        </Defs>

        <Circle cx={CENTER} cy={CENTER} r={CENTER - 2} fill="url(#bgGrad)" />
        <Circle
          cx={CENTER}
          cy={CENTER}
          r={OUTER_R + 6}
          fill="none"
          stroke="#1A2A3A"
          strokeWidth={1}
        />
        <Circle
          cx={CENTER}
          cy={CENTER}
          r={OUTER_R + 2}
          fill="none"
          stroke="#0A1A2A"
          strokeWidth={8}
        />

        {Array.from({ length: NUM_TICKS }).map((_, i) => {
          const angle = getTickAngle(i);
          const isTop = i === topTickIdx;
          const isImpact = i === impactTickIdx;
          const isNearTop =
            Math.abs(i - topTickIdx) <= 1 ||
            (topTickIdx <= 1 && i >= NUM_TICKS - 1);
          const isNearImpact =
            Math.abs(i - impactTickIdx) <= 1 ||
            (impactTickIdx <= 1 && i >= NUM_TICKS - 1);
          const isMajor = i % 5 === 0;
          const tickLen = isTop || isImpact ? 14 : isMajor ? 10 : 6;
          const strokeW = isTop || isImpact ? 2.5 : isMajor ? 1.5 : 0.8;
          let color = "#333333";
          if (isTop) color = "#FF3B30";
          else if (isImpact) color = "#FF3B30";
          else if (isNearTop || isNearImpact) color = "#882210";
          else if (isMajor) color = "#2A4A6A";

          const x1 = CENTER + OUTER_R * Math.cos(angle);
          const y1 = CENTER + OUTER_R * Math.sin(angle);
          const x2 = CENTER + (OUTER_R - tickLen) * Math.cos(angle);
          const y2 = CENTER + (OUTER_R - tickLen) * Math.sin(angle);

          return (
            <Line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={color}
              strokeWidth={strokeW}
              strokeLinecap="round"
            />
          );
        })}

        <Circle
          cx={CENTER}
          cy={CENTER}
          r={INNER_R}
          fill="none"
          stroke="#111111"
          strokeWidth={1}
        />
        <Circle
          cx={CENTER}
          cy={CENTER}
          r={INNER_R - 1}
          fill="url(#innerGlow)"
        />

        {progress > 0 && progress < 1 && (
          <G>
            <Circle
              cx={sweepX}
              cy={sweepY}
              r={5}
              fill="#1A8CFF"
              opacity={0.9}
            />
            <Circle
              cx={sweepX}
              cy={sweepY}
              r={8}
              fill="none"
              stroke="#1A8CFF"
              strokeWidth={1}
              opacity={0.3}
            />
          </G>
        )}

        <Circle
          cx={CENTER}
          cy={CENTER - OUTER_R + 4}
          r={3}
          fill="#1A8CFF"
          opacity={0.8}
        />
      </Svg>

      <View style={styles.centerContent}>
        <Image
          source={require("../assets/images/golfer.png")}
          style={styles.golferImage}
          resizeMode="contain"
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SIZE,
    height: SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  centerContent: {
    position: "absolute",
    width: 160,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  golferImage: {
    width: 130,
    height: 130,
    opacity: 0.95,
  },
});
