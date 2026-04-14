/**
 * Lógica de cálculo de cobertura de oração.
 * Todos os horários são representados em minutos desde meia-noite (0–1439).
 * Quando endMinutes < startMinutes, o horário atravessa a meia-noite.
 */

export interface PrayerSlot {
  id: number;
  name: string;
  startMinutes: number;
  endMinutes: number;
  token: string;
  createdAt: Date;
}

const TOTAL_MINUTES = 24 * 60; // 1440

/**
 * Converte minutos desde meia-noite para string "HH:MM".
 */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Converte string "HH:MM" para minutos desde meia-noite.
 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Calcula a duração em minutos de um slot, considerando passagem de meia-noite.
 */
export function slotDuration(start: number, end: number): number {
  if (end > start) return end - start;
  return TOTAL_MINUTES - start + end; // atravessa meia-noite
}

/**
 * Expande um slot em intervalos de minutos cobertos (0–1439).
 * Retorna um Set de minutos cobertos.
 */
function expandSlot(start: number, end: number): Set<number> {
  const covered = new Set<number>();
  if (end > start) {
    for (let m = start; m < end; m++) covered.add(m);
  } else {
    // atravessa meia-noite
    for (let m = start; m < TOTAL_MINUTES; m++) covered.add(m);
    for (let m = 0; m < end; m++) covered.add(m);
  }
  return covered;
}

/**
 * Calcula os minutos únicos cobertos por todos os slots (sem duplicar sobreposições).
 */
export function uniqueMinutesCovered(slots: PrayerSlot[]): number {
  const covered = new Set<number>();
  for (const slot of slots) {
    const expanded = expandSlot(slot.startMinutes, slot.endMinutes);
    expanded.forEach(m => covered.add(m));
  }
  return covered.size;
}

/**
 * Calcula os minutos restantes para completar as 24 horas.
 */
export function minutesRemaining(slots: PrayerSlot[]): number {
  return TOTAL_MINUTES - uniqueMinutesCovered(slots);
}

/**
 * Calcula a percentagem de cobertura (0–100).
 */
export function coveragePercentage(slots: PrayerSlot[]): number {
  return Math.round((uniqueMinutesCovered(slots) / TOTAL_MINUTES) * 100);
}

/**
 * Para cada hora do dia (0–23), retorna quantos participantes cobrem pelo menos
 * um minuto dessa hora.
 */
export function coverageByHour(slots: PrayerSlot[]): number[] {
  const counts = Array(24).fill(0);
  for (let hour = 0; hour < 24; hour++) {
    const hourStart = hour * 60;
    const hourEnd = hourStart + 60;
    for (const slot of slots) {
      // Verificar se o slot cobre algum minuto desta hora
      const covered = expandSlot(slot.startMinutes, slot.endMinutes);
      let covers = false;
      for (let m = hourStart; m < hourEnd; m++) {
        if (covered.has(m)) { covers = true; break; }
      }
      if (covers) counts[hour]++;
    }
  }
  return counts;
}

/**
 * Formata minutos em string legível "Xh Ym".
 */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
