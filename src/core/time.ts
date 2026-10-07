// 时间工具：节目时间统一用毫秒，界面上显示 m:ss.mmm

export const SLOT_MS = 100; // 容量排队的最小顺延步长

export function formatTime(ms: number): string {
  const neg = ms < 0;
  let v = Math.round(Math.abs(ms));
  const m = Math.floor(v / 60000);
  v -= m * 60000;
  const s = Math.floor(v / 1000);
  const milli = v - s * 1000;
  const body = `${m}:${String(s).padStart(2, "0")}.${String(milli).padStart(3, "0")}`;
  return neg ? `-${body}` : body;
}

export function formatSigned(ms: number): string {
  const sign = ms > 0 ? "+" : ms < 0 ? "-" : "±";
  return `${sign}${formatTime(Math.abs(ms))}`;
}

/** 宽松解析：1:08.2 / 68.2 / 01:08 / 90 */
export function parseTime(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const m = t.match(/^(-?)(?:(\d+):)?(\d{1,2})(?:[.,](\d{1,3}))?$/);
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  const minutes = m[2] ? parseInt(m[2], 10) : 0;
  const seconds = parseInt(m[3], 10);
  if (minutes > 0 && seconds >= 60) return null;
  const frac = m[4] ? parseInt(m[4].padEnd(3, "0"), 10) : 0;
  return sign * (minutes * 60000 + seconds * 1000 + frac);
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}
