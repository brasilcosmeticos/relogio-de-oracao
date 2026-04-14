import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Tabela principal do Relógio de Oração.
 * Cada linha representa um participante e o seu horário de oração.
 * - startMinutes / endMinutes: minutos desde meia-noite (0-1439)
 *   Quando endMinutes < startMinutes, o horário atravessa a meia-noite.
 * - token: identificador único gerado no cliente para permitir remoção sem login.
 */
export const prayerSlots = mysqlTable("prayer_slots", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  startMinutes: int("startMinutes").notNull(),
  endMinutes: int("endMinutes").notNull(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PrayerSlot = typeof prayerSlots.$inferSelect;
export type InsertPrayerSlot = typeof prayerSlots.$inferInsert;
