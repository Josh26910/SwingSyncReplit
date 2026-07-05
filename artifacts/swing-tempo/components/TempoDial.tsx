import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  RadialGradient,
  Stop,
} from "react-native-svg";

import { TEMPOS, TempoKey, SwingPhase } from "@/context/TempoContext";
import { GolferSvg } from "./GolferSvg";

const SIZE = 280;
const CENTER = SIZE / 2;
const OUTER_R = 130;
const NUM_TICKS = 60;

const GOLFER_SCALE = 0.68;
const GOLFER_TX = CENTER - 82 * GOLFER_SCALE;
const GOLFER_TY = CENTER - 108 * GOLFER_SCALE;

// ── Clock-position constants ──────────────────────────────────────────────────
//
//  Measured clockwise from straight-down (6 o'clock = 0°).
//  +130° clockwise from 6 = 10 o'clock  (top of backswing)
//  -130° from 6 = 2 o'clock  (follow-through finish)
//
//  We add ADDR_OFFSET so the idle/address position shows arms angled
//  slightly toward the ball (gives the club head visible space below the body).
//
const ADDR_OFFSET = 20;   // address  — 6:30 o'clock, club toward ball
const TOP_ANGLE   = 130 + ADDR_OFFSET;  // 150° → ~10 o'clock
const IMPACT_ANGLE = 0  + ADDR_OFFSET;  //  20° → just past ball
const FINISH_ANGLE = -130 + ADDR_OFFSET; // -110° → ~2 o'clock

// ── Easing ────────────────────────────────────────────────────────────────────
function easeInOutQuad(t: number) { return t < 0.5 ? 2*t*t : 1-(-2*t+2)**2/2; }
function easeInCubic(t: number)   { return t*t*t; }
function easeOutQuad(t: number)   { return 1-(1-t)*(1-t); }

function computeArmAngle(
  p: number,     // cycleProgress 0–1
  topN: number,  // topMs/cycleDuration
  impN: number   // impactMs/cycleDuration
): number {
  const FOLLOW_END = 0.88;

  if (p <= topN) {
    // Backswing: ADDR_OFFSET → TOP_ANGLE  (slow)
    const t = easeInOutQuad(p / topN);
    return ADDR_OFFSET + t * (TOP_ANGLE - ADDR_OFFSET);
  }

  if (p <= impN) {
    // Downswing: TOP_ANGLE → IMPACT_ANGLE  (fast — 3:1 ratio)
    const t = easeInCubic((p - topN) / (impN - topN));
    return TOP_ANGLE + t * (IMPACT_ANGLE - TOP_ANGLE);
  }

  if (p <= FOLLOW_END) {
    // Follow-through: IMPACT_ANGLE → FINISH_ANGLE  (decelerating)
    const t = easeOutQuad((p - impN) / (FOLLOW_END - impN));
    return IMPACT_ANGLE + t * (FINISH_ANGLE - IMPACT_ANGLE);
  }

  // Reset: FINISH_ANGLE → ADDR_OFFSET
  const t = (p - FOLLOW_END) / (1 - FOLLOW_END);
  return FINISH_ANGLE + t * (ADDR_OFFSET - FINISH_ANGLE);
}

function computeBodyLean(p: number, topN: number, impN: number): number {
  const FOLLOW_END = 0.88;
  if (p <= topN) return easeInOutQuad(p / topN) * 5;           // coil back
  if (p <= impN) {
    const t = easeInCubic((p - topN) / (impN - topN));
    return 5 - t * 10;                                          // drive through
  }
  if (p <= FOLLOW_END) return -5;                               // committed
  const t = (p - FOLLOW_END) / (1 - FOLLOW_END);
  return -5 + t * 5;                                            // reset
}

// ── Tick helpers ──────────────────────────────────────────────────────────────
function tickAngle(i: number) { return (i / NUM_TICKS) * 2 * Math.PI - Math.PI / 2; }
function msToTick(ms: number, total: number) { return Math.round((ms / total) * NUM_TICKS) % NUM_TICKS; }

// ── Component ─────────────────────────────────────────────────────────────────
interface TempoDialProps {
  tempo: TempoKey;
  phase: SwingPhase;
  cycleProgress: number;
}

export function TempoDial({ tempo, phase, cycleProgress }: TempoDialProps) {
  const def = TEMPOS[tempo];
  const cycleDuration = def.impactMs + 700;
  const topN  = def.topMs    / cycleDuration;
  const impN  = def.impactMs / cycleDuration;

  const totalForTick = def.impactMs + 200;
  const topTickIdx    = msToTick(def.topMs,    totalForTick);
  const impactTickIdx = msToTick(def.impactMs, totalForTick);

  // Idle = address pose with arms angled toward ball
  const armAngle  = cycleProgress === 0
    ? ADDR_OFFSET
    : computeArmAngle(cycleProgress, topN, impN);
  const bodyLean  = computeBodyLean(cycleProgress, topN, impN);

  return (
    <View style={styles.container}>
      <Svg width={SIZE} height={SIZE}>
        <Defs>
          <RadialGradient id="bgGrad" cx="50%" cy="50%" r="50%">
            <Stop offset="0%"   stopColor="#0D0D0D" stopOpacity="1" />
            <Stop offset="100%" stopColor="#000000" stopOpacity="1" />
          </RadialGradient>
          <RadialGradient id="innerGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%"   stopColor="#1A8CFF" stopOpacity="0.07" />
            <Stop offset="100%" stopColor="#1A8CFF" stopOpacity="0"    />
          </RadialGradient>
        </Defs>

        {/* Background */}
        <Circle cx={CENTER} cy={CENTER} r={CENTER - 2} fill="url(#bgGrad)" />

        {/* Outer ring */}
        <Circle cx={CENTER} cy={CENTER} r={OUTER_R + 5} fill="none" stroke="#0A1A2A" strokeWidth={10} />
        <Circle cx={CENTER} cy={CENTER} r={OUTER_R + 7} fill="none" stroke="#1A2A3A" strokeWidth={1}  />

        {/* Tick marks */}
        {Array.from({ length: NUM_TICKS }).map((_, i) => {
          const angle    = tickAngle(i);
          const isTop    = i === topTickIdx;
          const isImpact = i === impactTickIdx;
          const isMajor  = i % 5 === 0;

          const len = isTop || isImpact ? 15 : isMajor ? 10 : 6;
          const sw  = isTop || isImpact ? 2.5 : isMajor ? 1.5 : 0.8;
          let color = "#252525";
          if (isTop || isImpact) color = "#FF3B30";
          else if (Math.abs(i - topTickIdx) <= 1 || Math.abs(i - impactTickIdx) <= 1) color = "#7A1C10";
          else if (isMajor) color = "#1E3A5A";

          const x1 = CENTER + OUTER_R * Math.cos(angle);
          const y1 = CENTER + OUTER_R * Math.sin(angle);
          const x2 = CENTER + (OUTER_R - len) * Math.cos(angle);
          const y2 = CENTER + (OUTER_R - len) * Math.sin(angle);

          return (
            <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={color} strokeWidth={sw} strokeLinecap="round" />
          );
        })}

        {/* Inner ring */}
        <Circle cx={CENTER} cy={CENTER} r={108} fill="none"       stroke="#111111" strokeWidth={1} />
        <Circle cx={CENTER} cy={CENTER} r={107} fill="url(#innerGlow)" />

        {/* 12-o'clock start dot */}
        <Circle cx={CENTER} cy={CENTER - OUTER_R + 4} r={3} fill="#1A8CFF" opacity={0.9} />

        {/* Animated golfer */}
        <G transform={`translate(${GOLFER_TX}, ${GOLFER_TY}) scale(${GOLFER_SCALE})`}>
          <GolferSvg armAngle={armAngle} bodyLean={bodyLean} />
        </G>

        {/* Impact flash ring */}
        {phase === "impact" && (
          <Circle cx={CENTER} cy={CENTER} r={113}
            fill="none" stroke="#FF3B30" strokeWidth={2} opacity={0.6} />
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SIZE,
    height: SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
});
