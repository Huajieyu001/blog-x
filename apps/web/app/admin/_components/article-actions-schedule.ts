export const CHINA_TIMEZONE_OFFSET_MINUTES = 8 * 60;

export type ScheduleFormState = Readonly<{
  scheduledAt: string;
  timezoneOffset: string;
}>;

function assertOffsetMinutes(offsetMinutes: number) {
  if (!Number.isInteger(offsetMinutes)) throw new Error("timezone offset must be a whole number of minutes");
  if (offsetMinutes < -14 * 60 || offsetMinutes > 14 * 60) throw new Error("timezone offset must be between -840 and 840 minutes");
}

export function formatTimezoneOffset(offsetMinutes: number) {
  assertOffsetMinutes(offsetMinutes);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

export function localDateTimeAtOffset(instant: string | null, offsetMinutes: number) {
  assertOffsetMinutes(offsetMinutes);
  if (!instant) return "";
  const timestamp = new Date(instant).getTime();
  if (!Number.isFinite(timestamp)) throw new Error("scheduled instant is invalid");
  return new Date(timestamp + offsetMinutes * 60_000).toISOString().slice(0, 16);
}

export function scheduleFormStateAtOffset(instant: string | null, offsetMinutes: number): ScheduleFormState {
  return {
    scheduledAt: localDateTimeAtOffset(instant, offsetMinutes),
    timezoneOffset: formatTimezoneOffset(offsetMinutes),
  };
}
