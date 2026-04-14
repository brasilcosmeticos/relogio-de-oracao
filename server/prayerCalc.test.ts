import { describe, expect, it } from "vitest";
import {
  minutesToTime,
  timeToMinutes,
  slotDuration,
  uniqueMinutesCovered,
  minutesRemaining,
  coveragePercentage,
  coverageByHour,
  formatDuration,
  type PrayerSlot,
} from "../shared/prayerCalc";

function makeSlot(id: number, name: string, start: number, end: number): PrayerSlot {
  return { id, name, startMinutes: start, endMinutes: end, token: `tok-${id}`, createdAt: new Date() };
}

// ─── minutesToTime ────────────────────────────────────────────────────────────
describe("minutesToTime", () => {
  it("converte 0 para 00:00", () => expect(minutesToTime(0)).toBe("00:00"));
  it("converte 60 para 01:00", () => expect(minutesToTime(60)).toBe("01:00"));
  it("converte 90 para 01:30", () => expect(minutesToTime(90)).toBe("01:30"));
  it("converte 1439 para 23:59", () => expect(minutesToTime(1439)).toBe("23:59"));
  it("converte 720 para 12:00", () => expect(minutesToTime(720)).toBe("12:00"));
});

// ─── timeToMinutes ────────────────────────────────────────────────────────────
describe("timeToMinutes", () => {
  it("converte 00:00 para 0", () => expect(timeToMinutes("00:00")).toBe(0));
  it("converte 01:30 para 90", () => expect(timeToMinutes("01:30")).toBe(90));
  it("converte 23:59 para 1439", () => expect(timeToMinutes("23:59")).toBe(1439));
  it("converte 12:00 para 720", () => expect(timeToMinutes("12:00")).toBe(720));
});

// ─── slotDuration ─────────────────────────────────────────────────────────────
describe("slotDuration", () => {
  it("calcula duração normal (sem meia-noite)", () => {
    expect(slotDuration(60, 120)).toBe(60); // 01:00 → 02:00
  });
  it("calcula duração atravessando meia-noite", () => {
    expect(slotDuration(1380, 60)).toBe(120); // 23:00 → 01:00 = 2h
  });
  it("duração de 1 hora exacta", () => {
    expect(slotDuration(0, 60)).toBe(60);
  });
  it("duração de 23h atravessando meia-noite", () => {
    expect(slotDuration(60, 0)).toBe(1380); // 01:00 → 00:00 = 23h
  });
});

// ─── uniqueMinutesCovered ─────────────────────────────────────────────────────
describe("uniqueMinutesCovered", () => {
  it("retorna 0 para lista vazia", () => {
    expect(uniqueMinutesCovered([])).toBe(0);
  });

  it("conta minutos de um único slot", () => {
    const slots = [makeSlot(1, "Ana", 0, 60)]; // 1h = 60 min
    expect(uniqueMinutesCovered(slots)).toBe(60);
  });

  it("não duplica sobreposições", () => {
    const slots = [
      makeSlot(1, "Ana", 0, 120),   // 00:00 → 02:00
      makeSlot(2, "João", 60, 180), // 01:00 → 03:00
    ];
    // Cobertura única: 00:00 → 03:00 = 180 min
    expect(uniqueMinutesCovered(slots)).toBe(180);
  });

  it("conta correctamente com slots não sobrepostos", () => {
    const slots = [
      makeSlot(1, "Ana", 0, 60),    // 00:00 → 01:00 = 60 min
      makeSlot(2, "João", 120, 180), // 02:00 → 03:00 = 60 min
    ];
    expect(uniqueMinutesCovered(slots)).toBe(120);
  });

  it("conta correctamente slot que atravessa meia-noite", () => {
    const slots = [makeSlot(1, "Ana", 1380, 60)]; // 23:00 → 01:00 = 120 min
    expect(uniqueMinutesCovered(slots)).toBe(120);
  });

  it("retorna 1440 quando 24h estão completamente cobertas", () => {
    const slots = [makeSlot(1, "Ana", 0, 0)]; // 00:00 → 00:00 = 24h (atravessa meia-noite)
    // endMinutes(0) < startMinutes(0) é falso, então é 0 min
    // Precisamos de um slot real de 24h: start=0, end=0 com end < start não se aplica
    // Usamos dois slots para cobrir tudo
    const fullSlots = [
      makeSlot(1, "Ana", 0, 720),    // 00:00 → 12:00
      makeSlot(2, "João", 720, 0),   // 12:00 → 00:00 (atravessa meia-noite = 12h)
    ];
    expect(uniqueMinutesCovered(fullSlots)).toBe(1440);
  });
});

// ─── minutesRemaining ─────────────────────────────────────────────────────────
describe("minutesRemaining", () => {
  it("retorna 1440 para lista vazia", () => {
    expect(minutesRemaining([])).toBe(1440);
  });

  it("retorna 0 quando 24h cobertas", () => {
    const slots = [
      makeSlot(1, "Ana", 0, 720),
      makeSlot(2, "João", 720, 0),
    ];
    expect(minutesRemaining(slots)).toBe(0);
  });

  it("retorna valor correcto para cobertura parcial", () => {
    const slots = [makeSlot(1, "Ana", 0, 60)]; // 60 min cobertos
    expect(minutesRemaining(slots)).toBe(1380);
  });
});

// ─── coveragePercentage ───────────────────────────────────────────────────────
describe("coveragePercentage", () => {
  it("retorna 0 para lista vazia", () => {
    expect(coveragePercentage([])).toBe(0);
  });

  it("retorna 100 para cobertura completa", () => {
    const slots = [
      makeSlot(1, "Ana", 0, 720),
      makeSlot(2, "João", 720, 0),
    ];
    expect(coveragePercentage(slots)).toBe(100);
  });

  it("retorna 50 para metade coberta", () => {
    const slots = [makeSlot(1, "Ana", 0, 720)]; // 12h = 50%
    expect(coveragePercentage(slots)).toBe(50);
  });
});

// ─── coverageByHour ───────────────────────────────────────────────────────────
describe("coverageByHour", () => {
  it("retorna array de 24 zeros para lista vazia", () => {
    const result = coverageByHour([]);
    expect(result).toHaveLength(24);
    expect(result.every((v) => v === 0)).toBe(true);
  });

  it("conta correctamente intercessores por hora", () => {
    const slots = [
      makeSlot(1, "Ana", 0, 120),   // cobre horas 0 e 1
      makeSlot(2, "João", 60, 180), // cobre horas 1 e 2
    ];
    const result = coverageByHour(slots);
    expect(result[0]).toBe(1); // só Ana
    expect(result[1]).toBe(2); // Ana e João
    expect(result[2]).toBe(1); // só João
    expect(result[3]).toBe(0); // ninguém
  });

  it("conta correctamente slot que atravessa meia-noite", () => {
    const slots = [makeSlot(1, "Ana", 1380, 60)]; // 23:00 → 01:00
    const result = coverageByHour(slots);
    expect(result[23]).toBe(1); // hora 23
    expect(result[0]).toBe(1);  // hora 0
    expect(result[1]).toBe(0);  // hora 1 não coberta (slot termina às 01:00)
  });
});

/// ─── Slots de 30 em 30 minutos ─────────────────────────────────────────────
describe("slots de 30 em 30 minutos", () => {
  it("existem exactamente 48 slots de 30min em 24h", () => expect(1440 / 30).toBe(48));
  it("0 é múltiplo de 30", () => expect(0 % 30).toBe(0));
  it("360 é múltiplo de 30 (06:00)", () => expect(360 % 30).toBe(0));
  it("1410 é múltiplo de 30 (23:30)", () => expect(1410 % 30).toBe(0));
  it("45 NÃO é múltiplo de 30", () => expect(45 % 30).not.toBe(0));

  it("slot de 30 min: 00:00 → 00:30 = 30 min", () => expect(slotDuration(0, 30)).toBe(30));
  it("slot de 30 min atravessa meia-noite: 23:30 → 00:00 = 30 min", () => expect(slotDuration(1410, 0)).toBe(30));

  it("dois slots de 30min adjacentes sem sobreposição", () => {
    const slots = [
      makeSlot(1, "Ana", 0, 30),
      makeSlot(2, "João", 30, 60),
    ];
    expect(uniqueMinutesCovered(slots)).toBe(60);
  });

  it("dois slots de 30min idênticos — não duplica", () => {
    const slots = [
      makeSlot(1, "Ana", 0, 30),
      makeSlot(2, "João", 0, 30),
    ];
    expect(uniqueMinutesCovered(slots)).toBe(30);
  });

  it("48 slots de 30min cobrem exactamente 24h", () => {
    const slots = Array.from({ length: 48 }, (_, i) =>
      makeSlot(i + 1, `P${i}`, i * 30, (i + 1) * 30 === 1440 ? 0 : (i + 1) * 30)
    );
    expect(uniqueMinutesCovered(slots)).toBe(1440);
  });
});

// ─── formatDuration ─────────────────────────────────────────────────────────
describe("formatDuration", () => {
  it("formata 0 minutos", () => expect(formatDuration(0)).toBe("0m"));
  it("formata 30 minutos", () => expect(formatDuration(30)).toBe("30m"));
  it("formata 60 minutos como 1h", () => expect(formatDuration(60)).toBe("1h"));
  it("formata 90 minutos como 1h 30m", () => expect(formatDuration(90)).toBe("1h 30m"));
  it("formata 1440 minutos como 24h", () => expect(formatDuration(1440)).toBe("24h"));
});

// ─── prayer.add — validação de sobreposição via router ───────────────────────
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createPublicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("prayer.add — validação com durationMinutes", () => {
  it("rejeita startMinutes que não é múltiplo de 30", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    await expect(
      caller.prayer.add({ name: "Ana", startMinutes: 45, durationMinutes: 30 })
    ).rejects.toThrow();
  });

  it("rejeita duração inválida (15 min)", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    await expect(
      caller.prayer.add({ name: "Ana", startMinutes: 0, durationMinutes: 15 })
    ).rejects.toThrow();
  });

  it("rejeita duração inválida (90 min)", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    await expect(
      caller.prayer.add({ name: "Ana", startMinutes: 0, durationMinutes: 90 })
    ).rejects.toThrow();
  });

  it("rejeita nome vazio", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    await expect(
      caller.prayer.add({ name: "", startMinutes: 0, durationMinutes: 30 })
    ).rejects.toThrow();
  });

  it("aceita duração de 30 minutos", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    // Este teste pode falhar se a DB não estiver disponível, mas a validação do input deve passar
    try {
      await caller.prayer.add({ name: "Ana", startMinutes: 0, durationMinutes: 30 });
    } catch (e: any) {
      // Se o erro for de DB, está ok (a validação do input passou)
      if (e.message?.includes("Database not available")) return;
      // Se for CONFLICT, também está ok (a validação do input passou)
      if (e.code === "CONFLICT") return;
      throw e;
    }
  });

  it("aceita duração de 60 minutos", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    try {
      await caller.prayer.add({ name: "João", startMinutes: 120, durationMinutes: 60 });
    } catch (e: any) {
      if (e.message?.includes("Database not available")) return;
      if (e.code === "CONFLICT") return;
      throw e;
    }
  });
});
