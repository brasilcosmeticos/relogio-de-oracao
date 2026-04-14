import { z } from "zod";
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
    /**
     * Lista todos os slots de oração ordenados por hora de início.
     */
    list: publicProcedure.query(async () => {
      const slots = await listPrayerSlots();
      return slots;
    }),

    /**
     * Adiciona um novo slot de oração.
     * Retorna o token gerado para permitir remoção posterior.
     */
    add: publicProcedure
      .input(
        z.object({
          name: z.string().min(1).max(120),
          startMinutes: z.number().int().min(0).max(1439),
          endMinutes: z.number().int().min(0).max(1439),
        })
      )
      .mutation(async ({ input }) => {
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
