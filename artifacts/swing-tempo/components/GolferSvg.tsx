import React from "react";
import { Circle, Ellipse, G, Line, Path, Rect } from "react-native-svg";

/**
 * armAngle – degrees measured clockwise from straight-down (6 o'clock = 0°).
 *
 * Clock analogy (face-on left view, right-handed golfer):
 *   +20°  = address (arms slightly toward ball — 6:30 o'clock)
 *  +150°  = top of backswing (~10–11 o'clock, clockwise from 6)
 *   +20°  = impact (back through the ball)
 *  -110°  = follow-through finish (~1–2 o'clock, counterclockwise past 6)
 *
 * bodyLean – whole-body tilt degrees (+ = trailing side, − = leading side)
 */

interface GolferSvgProps {
  armAngle: number;
  bodyLean?: number;
}

// Shoulder pivot (arm rotation center)
const PX = 82;
const PY = 70;
const ARM_LEN = 32;   // shoulder → hands
const CLUB_LEN = 56;  // hands → club head
const TOTAL_LEN = ARM_LEN + CLUB_LEN;

export function GolferSvg({ armAngle, bodyLean = 0 }: GolferSvgProps) {
  const rad = (armAngle * Math.PI) / 180;

  // Grip midpoint
  const gripX = PX + ARM_LEN * Math.sin(rad);
  const gripY = PY + ARM_LEN * Math.cos(rad);

  // Club head position
  const clubX = PX + TOTAL_LEN * Math.sin(rad);
  const clubY = PY + TOTAL_LEN * Math.cos(rad);

  // Club head: a short line perpendicular to shaft
  const perpRad = rad - Math.PI / 2;
  const clubHx1 = clubX + 8 * Math.cos(perpRad);
  const clubHy1 = clubY + 8 * Math.sin(perpRad);
  const clubHx2 = clubX - 8 * Math.cos(perpRad);
  const clubHy2 = clubY - 8 * Math.sin(perpRad);

  // Each arm starts from its shoulder, converges at grip
  const lShX = PX - 10;
  const lShY = PY + 3;
  const rShX = PX + 10;
  const rShY = PY + 1;

  return (
    <>
      {/* ── BODY ──────────────────────────────────────────────────── */}
      <G transform={`rotate(${bodyLean}, ${PX}, 125)`}>
        {/* Head */}
        <Circle cx={PX} cy={33} r={15} fill="#FFFFFF" />

        {/* Neck */}
        <Rect x={PX - 5} y={47} width={10} height={14} rx={4} fill="#FFFFFF" />

        {/* Shoulder bar (gives T-shape width) */}
        <Rect x={PX - 28} y={60} width={56} height={10} rx={5} fill="#FFFFFF" />

        {/* Torso – slight taper to hips, spine angle lean */}
        <Path
          d={`M${PX - 26},68 C${PX - 24},88 ${PX - 22},105 ${PX - 20},118
              L${PX + 20},116 C${PX + 22},103 ${PX + 24},86 ${PX + 26},68 Z`}
          fill="#FFFFFF"
        />

        {/* Hip block */}
        <Path
          d={`M${PX - 22},116 L${PX - 24},126 L${PX + 24},124 L${PX + 22},116 Z`}
          fill="#FFFFFF"
        />

        {/* Left (trailing) thigh */}
        <Path
          d={`M${PX - 16},124 L${PX - 24},164 L${PX - 14},166 L${PX - 6},126 Z`}
          fill="#FFFFFF"
        />

        {/* Right (lead) thigh */}
        <Path
          d={`M${PX + 6},124 L${PX + 18},163 L${PX + 28},160 L${PX + 18},123 Z`}
          fill="#FFFFFF"
        />

        {/* Left lower leg */}
        <Path
          d={`M${PX - 24},164 L${PX - 28},197 L${PX - 16},197 L${PX - 14},166 Z`}
          fill="#FFFFFF"
        />

        {/* Right lower leg */}
        <Path
          d={`M${PX + 18},163 L${PX + 24},197 L${PX + 36},195 L${PX + 28},160 Z`}
          fill="#FFFFFF"
        />

        {/* Left foot */}
        <Ellipse cx={PX - 24} cy={200} rx={15} ry={5} fill="#FFFFFF" />

        {/* Right foot */}
        <Ellipse cx={PX + 28} cy={200} rx={15} ry={5} fill="#FFFFFF" />
      </G>

      {/* ── ARMS + CLUB ──────────────────────────────────────────── */}

      {/* Left arm */}
      <Line
        x1={lShX} y1={lShY}
        x2={gripX - 3} y2={gripY + 2}
        stroke="#FFFFFF"
        strokeWidth={10}
        strokeLinecap="round"
      />

      {/* Right arm */}
      <Line
        x1={rShX} y1={rShY}
        x2={gripX + 3} y2={gripY - 2}
        stroke="#FFFFFF"
        strokeWidth={10}
        strokeLinecap="round"
      />

      {/* Club shaft */}
      <Line
        x1={gripX} y1={gripY}
        x2={clubX} y2={clubY}
        stroke="#FFFFFF"
        strokeWidth={4}
        strokeLinecap="round"
      />

      {/* Club head */}
      <Line
        x1={clubHx1} y1={clubHy1}
        x2={clubHx2} y2={clubHy2}
        stroke="#FFFFFF"
        strokeWidth={8}
        strokeLinecap="round"
      />
    </>
  );
}
