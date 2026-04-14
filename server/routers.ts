import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { listPrayerSlots, addPrayerSlot, removePrayerSlot } from "./db";
import { nanoid } from "nanoid";

/**
 * Verifica se dois intervalos de 30 min se sobrepõem no círculo de 24h.
 * Cada slot ocupa exatamente [start, start+30) minutos.
 */
function slotsOverlap(
  aStart: number, aEnd: number,
  bStart: number, bEnd: number
): boolean {
  // Normaliza para array de minutos cobertos
  const covered = (s: number, e: number): Set<number> => {
    const set = new Set<number>();
    let cur = s;
    while (cur !== e) {
      set.add(cur);
      cur = (cur + 30) % 1440;
    }
    return set;
  };
  const setA = covered(aStart, aEnd);
  for (const m of Array.from(covered(bStart, bEnd))) {
    if (setA.has(m)) return true;
  }
  return false;
}

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  prayer: router({
    /**
     * Lista todos os slots de oração ordenados por hora de início.
     */
    list: publicProcedure.query(async () => {
      return listPrayerSlots();
    }),

    /**
     * Adiciona um novo slot de oração.
     * - startMinutes e endMinutes devem ser múltiplos de 30.
     * - Não pode haver sobreposição com slots existentes.
     * - Retorna o token gerado para permitir remoção posterior.
     */
    add: publicProcedure
      .input(
        z.object({
          name: z.string().min(1).max(120),
          startMinutes: z.number().int().min(0).max(1410).refine(v => v % 30 === 0, {
            message: "O horário deve ser múltiplo de 30 minutos",
          }),
          endMinutes: z.number().int().min(0).max(1410).refine(v => v % 30 === 0, {
            message: "O horário deve ser múltiplo de 30 minutos",
          }),
        })
        .refine(d => d.startMinutes !== d.endMinutes, {
          message: "O horário de início e de fim não podem ser iguais",
        })
      )
      .mutation(async ({ input }) => {
        const existing = await listPrayerSlots();

        // Verificar sobreposição com cada slot existente
        for (const slot of existing) {
          if (slotsOverlap(input.startMinutes, input.endMinutes, slot.startMinutes, slot.endMinutes)) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `O horário escolhido sobrepõe-se com o de ${slot.name} (${String(Math.floor(slot.startMinutes / 60)).padStart(2, "0")}:${String(slot.startMinutes % 60).padStart(2, "0")}–${String(Math.floor(slot.endMinutes / 60)).padStart(2, "0")}:${String(slot.endMinutes % 60).padStart(2, "0")}).`,
            });
          }
        }

        const token = nanoid(32);
        await addPrayerSlot({
          name: input.name.trim(),
          startMinutes: input.startMinutes,
          endMinutes: input.endMinutes,
          token,
        });
        return { token };
      }),

    /**
     * Remove um slot de oração pelo token único.
     */
    remove: publicProcedure
      .input(z.object({ token: z.string().min(1) }))
      .mutation(async ({ input }) => {
        await removePrayerSlot(input.token);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
