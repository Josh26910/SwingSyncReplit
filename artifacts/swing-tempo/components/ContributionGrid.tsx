/**
 * GitHub-style practice-streak heatmap ("contribution grid"). Renders a
 * scrollable weeks × 7-days grid of practice-time intensity, plus a legend.
 * Shared between the welcome screen and the Profile tab's Daily Progress
 * card so both read the same layout/behavior off one implementation.
 */
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { durationToLevel, type Session } from "@/utils/sessions";

const CELL_COLORS = [
  "#1A1A1A",   // 0 — no session
  "#0A3D6B",   // 1 — light (< 2 min)
  "#0D5CA6",   // 2 — medium (< 10 min)
  "#1278E0",   // 3 — strong (< 30 min)
  "#1A8CFF",   // 4 — max (30 min+)
];

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

interface GridDay { date: string; level: 0 | 1 | 2 | 3 | 4 }
interface MonthLabel { weekIdx: number; label: string }

function buildGrid(sessions: Session[], weeks: number): { weeks: GridDay[][]; monthLabels: MonthLabel[] } {
  const byDate: Record<string, number> = {};
  for (const s of sessions) byDate[s.date] = (byDate[s.date] ?? 0) + s.duration;

  const today    = new Date();
  const todayDay = today.getDay(); // 0=Sun
  // grid ends on last Saturday on/after today
  const endDate  = new Date(today);
  endDate.setDate(today.getDate() + (6 - todayDay));

  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - weeks * 7 + 1);

  const gridWeeks: GridDay[][] = [];
  let d = new Date(startDate);
  for (let w = 0; w < weeks; w++) {
    const week: GridDay[] = [];
    for (let day = 0; day < 7; day++) {
      const iso = d.toISOString().slice(0, 10);
      const dur = byDate[iso] ?? 0;
      const inFuture = d > today;
      week.push({ date: iso, level: inFuture ? 0 : durationToLevel(dur) });
      d.setDate(d.getDate() + 1);
    }
    gridWeeks.push(week);
  }

  // Month labels: find first week where month changes
  const monthLabels: MonthLabel[] = [];
  let lastMonth = -1;
  for (let w = 0; w < gridWeeks.length; w++) {
    const m = new Date(gridWeeks[w][0].date).getMonth();
    if (m !== lastMonth) {
      monthLabels.push({ weekIdx: w, label: MONTHS[m] });
      lastMonth = m;
    }
  }

  return { weeks: gridWeeks, monthLabels };
}

interface ContributionGridProps {
  sessions: Session[];
  /** How many weeks of history to render — 26 (~6mo) or 52 (~1yr). */
  weeks?: number;
  cellSize?: number;
  gap?: number;
  /** Called with a day's ISO date (YYYY-MM-DD) when that cell is tapped. */
  onDayPress?: (date: string) => void;
  selectedDate?: string | null;
}

export function ContributionGrid({
  sessions,
  weeks = 26,
  cellSize = 11,
  gap = 3,
  onDayPress,
  selectedDate = null,
}: ContributionGridProps) {
  const grid = React.useMemo(() => buildGrid(sessions, weeks), [sessions, weeks]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 4 }}
    >
      <View>
        {/* Month labels */}
        <View style={{ flexDirection: "row", marginBottom: 4 }}>
          {grid.weeks.map((_, wi) => {
            const label = grid.monthLabels.find((m) => m.weekIdx === wi);
            return (
              <View key={wi} style={{ width: cellSize + gap }}>
                {label && <Text style={styles.monthLabel}>{label.label}</Text>}
              </View>
            );
          })}
        </View>

        {/* Day rows */}
        {[0, 1, 2, 3, 4, 5, 6].map((dayIdx) => (
          <View key={dayIdx} style={{ flexDirection: "row", marginBottom: gap }}>
            {grid.weeks.map((week, wi) => {
              const day = week[dayIdx];
              const isSelected = selectedDate === day.date;
              const Wrapper = onDayPress ? Pressable : View;
              return (
                <Wrapper
                  key={wi}
                  onPress={onDayPress ? () => onDayPress(day.date) : undefined}
                  style={[
                    styles.cell,
                    {
                      width: cellSize,
                      height: cellSize,
                      marginRight: gap,
                      backgroundColor: CELL_COLORS[day.level],
                    },
                    isSelected && styles.cellSelected,
                  ]}
                />
              );
            })}
          </View>
        ))}

        {/* Legend */}
        <View style={styles.legend}>
          <Text style={styles.legendText}>Less</Text>
          {CELL_COLORS.map((c, i) => (
            <View
              key={i}
              style={[styles.legendCell, { backgroundColor: c, width: cellSize, height: cellSize }]}
            />
          ))}
          <Text style={styles.legendText}>More</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  monthLabel: {
    fontSize: 8,
    fontFamily: "Inter_400Regular",
    color: "#444444",
    lineHeight: 12,
  },
  cell: {
    borderRadius: 2,
  },
  cellSelected: {
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: 8,
  },
  legendCell: {
    borderRadius: 2,
  },
  legendText: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    color: "#444444",
  },
});
