import type { StructuredDeliveryWindow } from "../shared/types";

type TimeOfDay = StructuredDeliveryWindow["timeOfDay"];

const TIME_RANGES: Record<TimeOfDay, [number, number]> = {
  morning: [8, 12],
  midday: [12, 15],
  afternoon: [15, 20],
  evening: [19, 22],
  anytime: [8, 20],
};

const WEEKDAYS = [
  "domingo",
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
];

const MONTHS: Record<string, number> = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};

function clean(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function atHour(date: Date, hour: number) {
  const next = new Date(date);
  next.setHours(hour, 0, 0, 0);
  return next;
}

function nextWeekday(base: Date, weekday: number) {
  let delta = (weekday - base.getDay() + 7) % 7;
  if (delta === 0) delta = 7;
  return addDays(base, delta);
}

function inferTimeOfDay(text: string): TimeOfDay {
  if (/manana/.test(text)) return "morning";
  if (/mediodia|medio dia|comida/.test(text)) return "midday";
  if (/tarde/.test(text)) return "afternoon";
  if (/noche|ultima hora/.test(text)) return "evening";
  return "anytime";
}

function explicitHourRange(text: string): [number, number] | null {
  const match = text.match(
    /\b(?:de\s*)?(\d{1,2})(?::\d{2})?\s*(?:a|-|hasta)\s*(\d{1,2})(?::\d{2})?\b/,
  );
  if (!match) return null;
  const from = Number(match[1]);
  const to = Number(match[2]);
  if (from < 0 || from > 23 || to < 0 || to > 23 || from >= to) return null;
  return [from, to];
}

function inferDate(text: string, now: Date) {
  if (/pasado manana/.test(text)) return { date: addDays(now, 2), confidence: 0.88 };
  if (/manana/.test(text)) return { date: addDays(now, 1), confidence: 0.9 };
  if (/hoy/.test(text)) return { date: now, confidence: 0.86 };

  const relative = text.match(/\b(?:en|dentro de)\s*(\d{1,2})\s*(horas?|dias?|semanas?)\b/);
  if (relative) {
    const date = new Date(now);
    const amount = Number(relative[1]);
    const unit = relative[2];
    if (unit.startsWith("hora")) date.setHours(date.getHours() + amount);
    else if (unit.startsWith("semana")) date.setDate(date.getDate() + amount * 7);
    else date.setDate(date.getDate() + amount);
    return { date, confidence: 0.9 };
  }

  const numeric = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numeric) {
    const year = numeric[3]
      ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3])
      : now.getFullYear();
    const date = new Date(year, Number(numeric[2]) - 1, Number(numeric[1]));
    if (!numeric[3] && date < atHour(now, 0)) date.setFullYear(date.getFullYear() + 1);
    return { date, confidence: 0.9 };
  }

  const monthDay = text.match(/\b(\d{1,2})\s+de\s+([a-z]+)\b/);
  if (monthDay && MONTHS[monthDay[2]] !== undefined) {
    const date = new Date(now.getFullYear(), MONTHS[monthDay[2]], Number(monthDay[1]));
    if (date < atHour(now, 0)) date.setFullYear(date.getFullYear() + 1);
    return { date, confidence: 0.9 };
  }

  const weekday = WEEKDAYS.findIndex((day) => text.includes(day));
  if (weekday >= 0) return { date: nextWeekday(now, weekday), confidence: 0.78 };
  if (/proxima semana|semana que viene/.test(text)) {
    return { date: nextWeekday(now, 1), confidence: 0.72 };
  }
  if (/fin de semana/.test(text)) return { date: nextWeekday(now, 6), confidence: 0.74 };
  if (/urgente|cuanto antes|lo antes posible/.test(text)) {
    return { date: addDays(now, 1), confidence: 0.65 };
  }
  return { date: null, confidence: 0 };
}

export function interpretAllwainDeliveryWindow(
  value?: string | null,
  now = new Date(),
): StructuredDeliveryWindow | null {
  const rawText = String(value || "").trim();
  if (!rawText) return null;
  const text = clean(rawText);
  const inferred = inferDate(text, now);
  const timeOfDay = inferTimeOfDay(text);
  const explicit = explicitHourRange(text);
  const [from, to] = explicit || TIME_RANGES[timeOfDay];
  const startAt = inferred.date ? atHour(inferred.date, from) : null;
  const endAt = inferred.date ? atHour(inferred.date, to) : null;
  const isDeadline = /antes|limite|maximo|tope|para/.test(text);
  const confidence = Math.min(
    0.98,
    inferred.confidence + (explicit ? 0.08 : 0) + (timeOfDay !== "anytime" ? 0.05 : 0),
  );
  const label = inferred.date
    ? `${inferred.date.toLocaleDateString("es-ES", {
        weekday: "long",
        day: "numeric",
        month: "short",
      })}, ${String(from).padStart(2, "0")}:00-${String(to).padStart(2, "0")}:00`
    : rawText;
  return {
    rawText,
    label,
    startAt: startAt?.toISOString() || null,
    endAt: endAt?.toISOString() || null,
    deadlineAt: isDeadline ? endAt?.toISOString() || null : null,
    timeOfDay,
    confidence: Math.max(0.2, confidence),
    needsChoice: confidence < 0.7,
  };
}

