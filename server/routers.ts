import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { listPrayerSlots, addPrayerSlot, removePrayerSlot } from "./db";
import { nanoid } from "nanoid";

// ── Security: Sanitização de nome ────────────────────────────────────────────────────
function sanitizeName(name: string): string {
  return name
    .replace(/[<>"'`&;{}()\[\]\\]/g, "") // remover caracteres perigosos
    .replace(/\s+/g, " ")                 // normalizar espaços
    .trim()
    .slice(0, 120);                       // limitar comprimento
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
    /** Lista todos os horários de oração ordenados por hora de início. */
    list: publicProcedure
      .input(z.object({
        /** Tokens que o cliente possui no localStorage (para marcar registos como "meus") */
        myTokens: z.array(z.string().max(64)).max(100).optional(),
      }).optional())
      .query(async ({ input }) => {
        const slots = await listPrayerSlots();
        const myTokenSet = new Set(input?.myTokens ?? []);
        // Security: Retornar apenas dados necessários para a UI.
        // Tokens individuais são substituídos por um hash truncado para identificação.
        // O campo isMine indica se o registo pertence ao utilizador actual.
        return slots.map(s => {
          const isMine = myTokenSet.has(s.token);
          return {
            id: s.id,
            name: s.name,
            startMinutes: s.startMinutes,
            endMinutes: s.endMinutes,
            // Expor o token apenas se pertence ao utilizador (necessário para remoção)
            token: isMine ? s.token : undefined,
            // Expor groupToken apenas para registos do utilizador
            groupToken: isMine ? s.groupToken : undefined,
            // Hash truncado para agrupamento visual (não permite remoção)
            groupId: s.groupToken ? s.groupToken.slice(0, 8) : null,
            isMine,
            createdAt: s.createdAt,
          };
        });
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
          name: z.string().min(1).max(120)
            .transform(sanitizeName)
            .refine(v => v.length >= 1, { message: "Nome inválido após sanitização" }),
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
      .input(z.object({ token: z.string().min(1).max(64) }))
      .mutation(async ({ input }) => {
        await removePrayerSlot(input.token);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
