import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { listPrayerSlots, addPrayerSlot, removePrayerSlot } from "./db";
import { nanoid } from "nanoid";

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
    /** Lista todos os horários de oração ordenados por hora de início. */
    list: publicProcedure.query(async () => {
      return listPrayerSlots();
    }),

    /**
     * Adiciona um novo horário de oração.
     * - startMinutes deve ser múltiplo de 30.
     * - durationMinutes: 30 ou 60.
     * - Se 60min, cria 2 registos consecutivos de 30min com o mesmo token.
     * - Não pode haver sobreposição com horários existentes.
     */
    add: publicProcedure
      .input(
        z.object({
          name: z.string().min(1).max(120),
          startMinutes: z.number().int().min(0).max(1410).refine(v => v % 30 === 0, {
            message: "O horário deve ser múltiplo de 30 minutos",
          }),
          durationMinutes: z.number().int().refine(v => v === 30 || v === 60, {
            message: "A duração deve ser 30 ou 60 minutos",
          }),
        })
      )
      .mutation(async ({ input }) => {
        const existing = await listPrayerSlots();
        const occupiedMinutes = new Set<number>();
        for (const slot of existing) {
          let cur = slot.startMinutes;
          while (cur !== slot.endMinutes) {
            occupiedMinutes.add(cur);
            cur = (cur + 30) % 1440;
          }
        }

        // Calcular os horários de 30min que serão ocupados
        const slotsToCreate: { start: number; end: number }[] = [];
        const numSlots = input.durationMinutes / 30;
        let cur = input.startMinutes;
        for (let i = 0; i < numSlots; i++) {
          const end = (cur + 30) % 1440;
          // Verificar se este horário está livre
          if (occupiedMinutes.has(cur)) {
            const h = String(Math.floor(cur / 60)).padStart(2, "0");
            const m = String(cur % 60).padStart(2, "0");
            const eh = String(Math.floor(end / 60)).padStart(2, "0");
            const em = String(end % 60).padStart(2, "0");
            // Encontrar quem ocupa este horário
            const occupant = existing.find(s => {
              let c = s.startMinutes;
              while (c !== s.endMinutes) {
                if (c === cur) return true;
                c = (c + 30) % 1440;
              }
              return false;
            });
            throw new TRPCError({
              code: "CONFLICT",
              message: `O horário ${h}:${m}–${eh}:${em} já está ocupado por ${occupant?.name ?? "outro participante"}.`,
            });
          }
          slotsToCreate.push({ start: cur, end });
          cur = end;
        }

        // Criar todos os registos com tokens individuais e groupToken partilhado
        const groupToken = nanoid(32);
        const tokens: string[] = [];
        for (const s of slotsToCreate) {
          const individualToken = nanoid(32);
          tokens.push(individualToken);
          await addPrayerSlot({
            name: input.name.trim(),
            startMinutes: s.start,
            endMinutes: s.end,
            token: individualToken,
            groupToken,
          });
        }
        return { token: tokens[0]!, groupToken, tokens };
      }),

    /** Remove um horário de oração pelo token único (apaga todos os registos associados). */
    remove: publicProcedure
      .input(z.object({ token: z.string().min(1) }))
      .mutation(async ({ input }) => {
        await removePrayerSlot(input.token);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
