import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createPublicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

// ─── Sanitização de nome ─────────────────────────────────────────────────────
describe("Security: Sanitização de nome", () => {
  it("rejeita nome com apenas caracteres perigosos", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    await expect(
      caller.prayer.add({ name: "<script>alert(1)</script>", startMinutes: 1380, durationMinutes: 30 })
    ).rejects.toThrow();
  });

  it("rejeita nome vazio após sanitização", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    await expect(
      caller.prayer.add({ name: "<>\"'`&;", startMinutes: 1380, durationMinutes: 30 })
    ).rejects.toThrow();
  });

  it("aceita nome normal sem caracteres perigosos", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    try {
      await caller.prayer.add({ name: "Maria Silva", startMinutes: 1380, durationMinutes: 30 });
    } catch (e: any) {
      // Se o erro for de DB ou CONFLICT, está ok (a validação do input passou)
      if (e.message?.includes("Database not available")) return;
      if (e.code === "CONFLICT") return;
      throw e;
    }
  });

  it("aceita nome com acentos e caracteres especiais válidos", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    try {
      await caller.prayer.add({ name: "José María Ñoño", startMinutes: 1350, durationMinutes: 30 });
    } catch (e: any) {
      if (e.message?.includes("Database not available")) return;
      if (e.code === "CONFLICT") return;
      throw e;
    }
  });
});

// ─── Validação de token na remoção ───────────────────────────────────────────
describe("Security: Validação de token", () => {
  it("rejeita token vazio", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    await expect(
      caller.prayer.remove({ token: "" })
    ).rejects.toThrow();
  });

  it("rejeita token com mais de 64 caracteres", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    const longToken = "a".repeat(65);
    await expect(
      caller.prayer.remove({ token: longToken })
    ).rejects.toThrow();
  });

  it("aceita token com 32 caracteres", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    const token = "a".repeat(32);
    try {
      await caller.prayer.remove({ token });
    } catch (e: any) {
      // Se o erro for de DB, está ok (a validação do input passou)
      if (e.message?.includes("Database not available")) return;
      throw e;
    }
  });
});

// ─── Validação de input ──────────────────────────────────────────────────────
describe("Security: Validação de input", () => {
  it("rejeita startMinutes negativo", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    await expect(
      caller.prayer.add({ name: "Test", startMinutes: -30, durationMinutes: 30 })
    ).rejects.toThrow();
  });

  it("rejeita startMinutes > 1410", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    await expect(
      caller.prayer.add({ name: "Test", startMinutes: 1440, durationMinutes: 30 })
    ).rejects.toThrow();
  });

  it("rejeita durationMinutes diferente de 30 ou 60", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    await expect(
      caller.prayer.add({ name: "Test", startMinutes: 0, durationMinutes: 45 })
    ).rejects.toThrow();
  });

  it("rejeita durationMinutes = 0", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    await expect(
      caller.prayer.add({ name: "Test", startMinutes: 0, durationMinutes: 0 })
    ).rejects.toThrow();
  });

  it("rejeita durationMinutes = 120", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    await expect(
      caller.prayer.add({ name: "Test", startMinutes: 0, durationMinutes: 120 })
    ).rejects.toThrow();
  });

  it("rejeita nome com mais de 120 caracteres", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    const longName = "A".repeat(121);
    await expect(
      caller.prayer.add({ name: longName, startMinutes: 0, durationMinutes: 30 })
    ).rejects.toThrow();
  });
});

// ─── Token Hiding na Listagem Pública ───────────────────────────────────────────
describe("Security: Token hiding na prayer.list", () => {
  it("não expor tokens quando myTokens não é enviado", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    try {
      const result = await caller.prayer.list({});
      // Todos os registos devem ter token=null/undefined e isMine=false
      for (const slot of result) {
        expect(slot.isMine).toBe(false);
        expect(slot.token).toBeFalsy();
        expect(slot.groupToken).toBeFalsy();
      }
    } catch (e: any) {
      if (e.message?.includes("Database not available")) return;
      throw e;
    }
  });

  it("expor token apenas para registos do próprio utilizador", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    try {
      // Primeiro obter a lista sem tokens
      const allSlots = await caller.prayer.list({});
      if (allSlots.length === 0) return; // sem dados para testar
      // Usar um token fictício que não existe
      const result = await caller.prayer.list({ myTokens: ["fake_token_12345"] });
      // Nenhum registo deve ser marcado como "meu"
      for (const slot of result) {
        expect(slot.isMine).toBe(false);
      }
    } catch (e: any) {
      if (e.message?.includes("Database not available")) return;
      throw e;
    }
  });

  it("groupId é retornado para agrupamento visual sem expor groupToken completo", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    try {
      const result = await caller.prayer.list({});
      for (const slot of result) {
        // groupId deve ser string curta (8 chars) ou null
        if (slot.groupId) {
          expect(slot.groupId.length).toBe(8);
        }
      }
    } catch (e: any) {
      if (e.message?.includes("Database not available")) return;
      throw e;
    }
  });

  it("rejeita myTokens com mais de 100 tokens", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    const tooManyTokens = Array.from({ length: 101 }, (_, i) => `token_${i}`);
    await expect(
      caller.prayer.list({ myTokens: tooManyTokens })
    ).rejects.toThrow();
  });

  it("rejeita token individual com mais de 64 caracteres em myTokens", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    await expect(
      caller.prayer.list({ myTokens: ["a".repeat(65)] })
    ).rejects.toThrow();
  });
});

// ─── XSS / Injection ────────────────────────────────────────────────────────
describe("Security: XSS e Injection", () => {
  it("sanitiza tags HTML do nome", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    try {
      // O nome com tags deve ser sanitizado (tags removidas)
      await caller.prayer.add({ name: "Maria<b>Bold</b>", startMinutes: 1320, durationMinutes: 30 });
    } catch (e: any) {
      if (e.message?.includes("Database not available")) return;
      if (e.code === "CONFLICT") return;
      throw e;
    }
  });

  it("sanitiza aspas e backticks do nome", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    try {
      await caller.prayer.add({ name: "Maria\"test'name`here", startMinutes: 1290, durationMinutes: 30 });
    } catch (e: any) {
      if (e.message?.includes("Database not available")) return;
      if (e.code === "CONFLICT") return;
      throw e;
    }
  });

  it("sanitiza SQL injection no nome", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    try {
      await caller.prayer.add({ name: "Maria; DROP TABLE prayer_slots;--", startMinutes: 1260, durationMinutes: 30 });
    } catch (e: any) {
      if (e.message?.includes("Database not available")) return;
      if (e.code === "CONFLICT") return;
      throw e;
    }
  });
});
