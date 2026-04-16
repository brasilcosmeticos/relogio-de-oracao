import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock do módulo db para NUNCA tocar na BD real ──────────────────────────
// Todas as funções de BD são substituídas por mocks que simulam comportamento
vi.mock("./db", () => {
  // Estado em memória para simular a BD
  let slots: Array<{
    id: number;
    name: string;
    startMinutes: number;
    endMinutes: number;
    token: string;
    groupToken: string | null;
    createdAt: Date;
  }> = [];
  let nextId = 1;

  return {
    listPrayerSlots: vi.fn(async () => [...slots]),
    addPrayerSlot: vi.fn(async (slot: any) => {
      slots.push({
        id: nextId++,
        name: slot.name,
        startMinutes: slot.startMinutes,
        endMinutes: slot.endMinutes,
        token: slot.token,
        groupToken: slot.groupToken ?? null,
        createdAt: new Date(),
      });
    }),
    removePrayerSlot: vi.fn(async (token: string) => {
      const found = slots.find(s => s.token === token);
      if (!found) return;
      if (found.groupToken) {
        slots = slots.filter(s => s.groupToken !== found.groupToken);
      } else {
        slots = slots.filter(s => s.token !== token);
      }
    }),
    getPrayerSlotByToken: vi.fn(async (token: string) => {
      return slots.find(s => s.token === token) ?? undefined;
    }),
    // Expor reset para limpar entre testes
    __resetSlots: () => { slots = []; nextId = 1; },
    // Expor para inspecção
    __getSlots: () => [...slots],
  };
});

// Aceder às funções de reset/inspecção do mock
const dbMock = await import("./db") as any;
const resetSlots = dbMock.__resetSlots as () => void;
const getSlots = dbMock.__getSlots as () => any[];

function createPublicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

// Limpar o estado da BD mock antes de cada teste
beforeEach(() => {
  resetSlots();
});

// ─── Sanitização de nome ─────────────────────────────────────────────────────
describe("Security: Sanitização de nome", () => {
  it("sanitiza nome com tags script (resultado: scriptalert1/script)", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    // Após sanitização, < > ( ) são removidos, restando "scriptalert1/script"
    const result = await caller.prayer.add({ name: "<script>alert(1)</script>", startMinutes: 0, durationMinutes: 30 });
    expect(result.token).toBeDefined();
    const mockSlots = getSlots();
    // O nome não deve conter < ou >
    expect(mockSlots[0].name).not.toContain('<');
    expect(mockSlots[0].name).not.toContain('>');
    expect(mockSlots[0].name).not.toContain('(');
    expect(mockSlots[0].name).not.toContain(')');
  });

  it("rejeita nome vazio após sanitização", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    await expect(
      caller.prayer.add({ name: "<>\"'`&;", startMinutes: 0, durationMinutes: 30 })
    ).rejects.toThrow();
  });

  it("aceita nome normal sem caracteres perigosos", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    const result = await caller.prayer.add({ name: "Maria Silva", startMinutes: 0, durationMinutes: 30 });
    expect(result.token).toBeDefined();
    expect(result.groupToken).toBeDefined();
    // Verificar que foi guardado no mock
    const mockSlots = getSlots();
    expect(mockSlots).toHaveLength(1);
    expect(mockSlots[0].name).toBe("Maria Silva");
  });

  it("aceita nome com acentos e caracteres especiais válidos", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    const result = await caller.prayer.add({ name: "José María Ñoño", startMinutes: 0, durationMinutes: 30 });
    expect(result.token).toBeDefined();
    const mockSlots = getSlots();
    expect(mockSlots[0].name).toBe("José María Ñoño");
  });

  it("remove caracteres perigosos mas mantém o resto", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    const result = await caller.prayer.add({ name: "Maria<b>Bold</b>", startMinutes: 0, durationMinutes: 30 });
    expect(result.token).toBeDefined();
    const mockSlots = getSlots();
    // < e > são removidos, restando "MariabBold/b"
    expect(mockSlots[0].name).not.toContain('<');
    expect(mockSlots[0].name).not.toContain('>');
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

  it("aceita token com 32 caracteres e remove registo", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    // Criar um registo primeiro
    const { token } = await caller.prayer.add({ name: "Test User", startMinutes: 0, durationMinutes: 30 });
    let mockSlots = getSlots();
    expect(mockSlots).toHaveLength(1);
    // Remover
    await caller.prayer.remove({ token });
    mockSlots = getSlots();
    expect(mockSlots).toHaveLength(0);
  });

  it("remove todos os registos do mesmo grupo (1h)", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    const { tokens } = await caller.prayer.add({ name: "Test Group", startMinutes: 0, durationMinutes: 60 });
    let mockSlots = getSlots();
    expect(mockSlots).toHaveLength(2);
    // Remover pelo primeiro token deve apagar ambos
    await caller.prayer.remove({ token: tokens![0] });
    mockSlots = getSlots();
    expect(mockSlots).toHaveLength(0);
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

  it("rejeita startMinutes que não é múltiplo de 30", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    await expect(
      caller.prayer.add({ name: "Test", startMinutes: 15, durationMinutes: 30 })
    ).rejects.toThrow();
  });
});

// ─── Token Hiding na Listagem Pública ───────────────────────────────────────
describe("Security: Token hiding na prayer.list", () => {
  it("não expor tokens quando myTokens não é enviado", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    // Criar um registo
    await caller.prayer.add({ name: "Ana", startMinutes: 0, durationMinutes: 30 });
    // Listar sem myTokens
    const result = await caller.prayer.list({});
    expect(result).toHaveLength(1);
    expect(result[0].isMine).toBe(false);
    expect(result[0].token).toBeUndefined();
    expect(result[0].groupToken).toBeUndefined();
    expect(result[0].name).toBe("Ana");
  });

  it("expor token apenas para registos do próprio utilizador", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    // Criar dois registos
    const { token: myToken } = await caller.prayer.add({ name: "Eu", startMinutes: 0, durationMinutes: 30 });
    await caller.prayer.add({ name: "Outro", startMinutes: 60, durationMinutes: 30 });
    // Listar com o meu token
    const result = await caller.prayer.list({ myTokens: [myToken] });
    expect(result).toHaveLength(2);
    const mine = result.find(s => s.name === "Eu")!;
    const other = result.find(s => s.name === "Outro")!;
    expect(mine.isMine).toBe(true);
    expect(mine.token).toBe(myToken);
    expect(other.isMine).toBe(false);
    expect(other.token).toBeUndefined();
  });

  it("groupId é retornado como hash truncado de 8 caracteres", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    await caller.prayer.add({ name: "Test", startMinutes: 0, durationMinutes: 30 });
    const result = await caller.prayer.list({});
    expect(result[0].groupId).toBeDefined();
    expect(result[0].groupId!.length).toBe(8);
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

  it("token falso não marca nenhum registo como isMine", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    await caller.prayer.add({ name: "Real User", startMinutes: 0, durationMinutes: 30 });
    const result = await caller.prayer.list({ myTokens: ["fake_token_12345"] });
    expect(result).toHaveLength(1);
    expect(result[0].isMine).toBe(false);
    expect(result[0].token).toBeUndefined();
  });
});

// ─── Conflito de horários ───────────────────────────────────────────────────
describe("Security: Conflito de horários", () => {
  it("rejeita horário já ocupado", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    await caller.prayer.add({ name: "Primeiro", startMinutes: 0, durationMinutes: 30 });
    await expect(
      caller.prayer.add({ name: "Segundo", startMinutes: 0, durationMinutes: 30 })
    ).rejects.toThrow(/já está ocupado/);
  });

  it("rejeita 1h quando segundo slot está ocupado", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    await caller.prayer.add({ name: "Bloqueio", startMinutes: 30, durationMinutes: 30 });
    await expect(
      caller.prayer.add({ name: "Tentativa", startMinutes: 0, durationMinutes: 60 })
    ).rejects.toThrow(/já está ocupado/);
  });
});

// ─── XSS / Injection ────────────────────────────────────────────────────────
describe("Security: XSS e Injection", () => {
  it("sanitiza aspas e backticks do nome", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    const result = await caller.prayer.add({ name: "Maria\"test'name`here", startMinutes: 0, durationMinutes: 30 });
    expect(result.token).toBeDefined();
    const mockSlots = getSlots();
    // Caracteres perigosos devem ter sido removidos
    expect(mockSlots[0].name).not.toContain('"');
    expect(mockSlots[0].name).not.toContain("'");
    expect(mockSlots[0].name).not.toContain('`');
  });

  it("sanitiza SQL injection no nome", async () => {
    const caller = appRouter.createCaller(createPublicCtx());
    const result = await caller.prayer.add({ name: "Maria; DROP TABLE prayer_slots;--", startMinutes: 0, durationMinutes: 30 });
    expect(result.token).toBeDefined();
    const mockSlots = getSlots();
    expect(mockSlots[0].name).not.toContain(';');
  });
});
