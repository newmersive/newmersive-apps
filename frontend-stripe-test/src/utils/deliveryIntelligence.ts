export type DeliveryTimeOfDay = "morning" | "midday" | "afternoon" | "evening" | "anytime";

export type StructuredDeliveryWindow = {
  rawText: string;
  label: string;
  startAt: string | null;
  endAt: string | null;
  deadlineAt: string | null;
  timeOfDay: DeliveryTimeOfDay;
  confidence: number;
  needsChoice: boolean;
};

const WEEKDAYS = [
  "domingo",
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
] as const;

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

const TIME_RANGES: Record<DeliveryTimeOfDay, [number, number]> = {
  morning: [8, 12],
  midday: [12, 15],
  afternoon: [15, 20],
  evening: [19, 22],
  anytime: [8, 20],
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function atHour(date: Date, hour: number, minute = 0) {
  const next = new Date(date);
  next.setHours(hour, minute, 0, 0);
  return next;
}

function iso(date: Date | null) {
  return date ? date.toISOString() : null;
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function nextWeekday(base: Date, weekday: number) {
  const today = base.getDay();
  let delta = (weekday - today + 7) % 7;
  if (delta === 0) delta = 7;
  return addDays(base, delta);
}

function inferTimeOfDay(text: string): DeliveryTimeOfDay {
  if (/manana|mañana/.test(text)) return "morning";
  if (/mediodia|medio dia|comida/.test(text)) return "midday";
  if (/tarde/.test(text)) return "afternoon";
  if (/noche|ultima hora/.test(text)) return "evening";
  return "anytime";
}

function explicitHourRange(text: string): [number, number] | null {
  const range = text.match(/\b(?:de\s*)?(\d{1,2})(?::(\d{2}))?\s*(?:a|-|hasta)\s*(\d{1,2})(?::(\d{2}))?\b/);
  if (!range) return null;
  const from = Number(range[1]);
  const to = Number(range[3]);
  if (from < 0 || from > 23 || to < 0 || to > 23 || from >= to) return null;
  return [from, to];
}

function dateForMonthDay(base: Date, day: number, month: number) {
  const next = new Date(base.getFullYear(), month, day);
  if (next < atHour(base, 0)) next.setFullYear(next.getFullYear() + 1);
  return next;
}

function inferDate(text: string, now: Date): { date: Date | null; deadline: boolean; confidence: number } {
  if (/pasado manana|pasado mañana/.test(text)) return { date: addDays(now, 2), deadline: false, confidence: 0.88 };
  if (/manana|mañana/.test(text)) return { date: addDays(now, 1), deadline: false, confidence: 0.9 };
  if (/hoy/.test(text)) return { date: now, deadline: false, confidence: 0.86 };

  const relative = text.match(/\b(?:en|dentro de)\s*(\d{1,2})\s*(horas?|dias?|semanas?)\b/);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2];
    const date = new Date(now);
    if (unit.startsWith("hora")) date.setHours(date.getHours() + amount);
    else if (unit.startsWith("semana")) date.setDate(date.getDate() + amount * 7);
    else date.setDate(date.getDate() + amount);
    return { date, deadline: true, confidence: 0.9 };
  }

  const numeric = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]) - 1;
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
      const date = new Date(
        numeric[3] ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]) : now.getFullYear(),
        month,
        day,
      );
      if (!numeric[3] && date < atHour(now, 0)) date.setFullYear(date.getFullYear() + 1);
      return { date, deadline: /antes|limite|maximo|tope/.test(text), confidence: 0.9 };
    }
  }

  const monthDay = text.match(/\b(\d{1,2})\s+de\s+([a-z]+)\b/);
  if (monthDay && MONTHS[monthDay[2]] !== undefined) {
    return {
      date: dateForMonthDay(now, Number(monthDay[1]), MONTHS[monthDay[2]]),
      deadline: /antes|limite|maximo|tope/.test(text),
      confidence: 0.9,
    };
  }

  const weekday = WEEKDAYS.findIndex((day) => text.includes(day));
  if (weekday >= 0) {
    return {
      date: nextWeekday(now, weekday),
      deadline: /antes|para|limite|maximo|tope/.test(text),
      confidence: 0.78,
    };
  }

  if (/proxima semana|semana que viene/.test(text)) {
    const date = nextWeekday(now, 1);
    return { date, deadline: true, confidence: 0.72 };
  }
  if (/fin de semana/.test(text)) {
    return { date: nextWeekday(now, 6), deadline: false, confidence: 0.74 };
  }
  if (/urgente|cuanto antes|lo antes posible/.test(text)) {
    return { date: addDays(now, 1), deadline: true, confidence: 0.65 };
  }
  return { date: null, deadline: false, confidence: 0 };
}

export function interpretDeliveryWindow(input: string, now = new Date()): StructuredDeliveryWindow | null {
  const rawText = input.trim();
  if (!rawText) return null;
  const text = normalizeText(rawText);
  const inferred = inferDate(text, now);
  const timeOfDay = inferTimeOfDay(text);
  const explicitRange = explicitHourRange(text);
  const [fromHour, toHour] = explicitRange || TIME_RANGES[timeOfDay];
  const baseDate = inferred.date;
  const start = baseDate ? atHour(baseDate, fromHour) : null;
  const end = baseDate ? atHour(baseDate, toHour) : null;
  const deadline = baseDate
    ? inferred.deadline || /antes|limite|maximo|tope|para/.test(text)
      ? end
      : null
    : null;
  const confidence = Math.min(
    0.98,
    inferred.confidence + (explicitRange ? 0.08 : 0) + (timeOfDay !== "anytime" ? 0.05 : 0),
  );
  if (!baseDate && confidence <= 0) {
    return {
      rawText,
      label: rawText,
      startAt: null,
      endAt: null,
      deadlineAt: null,
      timeOfDay,
      confidence: 0.2,
      needsChoice: true,
    };
  }
  const dateLabel = baseDate
    ? baseDate.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" })
    : rawText;
  const hourLabel = `${String(fromHour).padStart(2, "0")}:00-${String(toHour).padStart(2, "0")}:00`;
  return {
    rawText,
    label: baseDate ? `${dateLabel}, ${hourLabel}` : rawText,
    startAt: iso(start),
    endAt: iso(end),
    deadlineAt: iso(deadline),
    timeOfDay,
    confidence: Math.max(0.2, confidence),
    needsChoice: confidence < 0.7,
  };
}
