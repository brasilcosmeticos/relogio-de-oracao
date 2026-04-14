import { useState, useEffect, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
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
} from "../../../shared/prayerCalc";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { toast } from "sonner";

// ─── Constantes ───────────────────────────────────────────────────────────────
const LOCAL_TOKENS_KEY = "prayer_tokens";

function getLocalTokens(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_TOKENS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveLocalToken(token: string) {
  const tokens = getLocalTokens();
  tokens.push(token);
  localStorage.setItem(LOCAL_TOKENS_KEY, JSON.stringify(tokens));
}

function removeLocalToken(token: string) {
  const tokens = getLocalTokens().filter((t) => t !== token);
  localStorage.setItem(LOCAL_TOKENS_KEY, JSON.stringify(tokens));
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Home() {
  const [name, setName] = useState("");
  const [startTime, setStartTime] = useState("06:00");
  const [endTime, setEndTime] = useState("07:00");
  const [localTokens, setLocalTokens] = useState<string[]>(getLocalTokens);
  const [celebrated, setCelebrated] = useState(false);

  // ─── Dados ──────────────────────────────────────────────────────────────────
  const { data: rawSlots = [], refetch } = trpc.prayer.list.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const slots = rawSlots as PrayerSlot[];

  const addMutation = trpc.prayer.add.useMutation({
    onSuccess: ({ token }) => {
      saveLocalToken(token);
      setLocalTokens(getLocalTokens());
      setName("");
      setStartTime("06:00");
      setEndTime("07:00");
      refetch();
      toast.success("Horário de oração registado com sucesso!");
    },
    onError: (err) => {
      toast.error("Erro ao registar: " + err.message);
    },
  });

  const removeMutation = trpc.prayer.remove.useMutation({
    onSuccess: (_, { token }) => {
      removeLocalToken(token);
      setLocalTokens(getLocalTokens());
      refetch();
      toast.success("Horário removido.");
    },
    onError: () => toast.error("Erro ao remover o horário."),
  });

  // ─── Cálculos ────────────────────────────────────────────────────────────────
  const uniqueMinutes = useMemo(() => uniqueMinutesCovered(slots), [slots]);
  const remaining = useMemo(() => minutesRemaining(slots), [slots]);
  const percentage = useMemo(() => coveragePercentage(slots), [slots]);
  const byHour = useMemo(() => coverageByHour(slots), [slots]);
  const totalBruto = useMemo(
    () => slots.reduce((acc, s) => acc + slotDuration(s.startMinutes, s.endMinutes), 0),
    [slots]
  );

  const chartData = useMemo(
    () =>
      byHour.map((count, hour) => ({
        hour: `${String(hour).padStart(2, "0")}h`,
        count,
        covered: count > 0,
      })),
    [byHour]
  );

  // Banner de celebração
  useEffect(() => {
    if (percentage >= 100 && !celebrated && slots.length > 0) {
      setCelebrated(true);
    }
  }, [percentage, celebrated, slots.length]);

  // ─── Submissão ───────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) {
        toast.error("Por favor, insira o seu nome.");
        return;
      }
      const startMinutes = timeToMinutes(startTime);
      const endMinutes = timeToMinutes(endTime);
      if (startMinutes === endMinutes) {
        toast.error("A hora de início e fim não podem ser iguais.");
        return;
      }
      addMutation.mutate({ name: name.trim(), startMinutes, endMinutes });
    },
    [name, startTime, endTime, addMutation]
  );

  // ─── Exportação CSV ──────────────────────────────────────────────────────────
  const exportCSV = useCallback(() => {
    const BOM = "\uFEFF";
    const header = "Nome,Início,Fim,Duração (min)\n";
    const rows = slots
      .map(
        (s) =>
          `"${s.name}",${minutesToTime(s.startMinutes)},${minutesToTime(s.endMinutes)},${slotDuration(s.startMinutes, s.endMinutes)}`
      )
      .join("\n");
    const footer = `\nTotal bruto,,,"${formatDuration(totalBruto)}"\nTotal único,,,"${formatDuration(uniqueMinutes)}"`;
    const blob = new Blob([BOM + header + rows + footer], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "relogio-oracao-geraldo.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Ficheiro CSV exportado.");
  }, [slots, totalBruto, uniqueMinutes]);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="border-b border-white/8 bg-black/20 backdrop-blur-sm sticky top-0 z-40">
        <div className="container flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, oklch(0.72 0.14 55), oklch(0.55 0.10 55))" }}>
              <span className="text-sm">🕯️</span>
            </div>
            <div>
              <h1 className="text-lg font-serif font-semibold leading-none"
                style={{ color: "oklch(0.72 0.14 55)" }}>
                Relógio de Oração
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">Pelo Geraldo</p>
            </div>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-xs text-muted-foreground italic font-serif">
              "A oração do justo é poderosa e eficaz."
            </p>
            <p className="text-xs" style={{ color: "oklch(0.72 0.14 55)" }}>Tiago 5:16</p>
          </div>
        </div>
      </header>

      {/* ── Banner de Celebração ────────────────────────────────────────────── */}
      {celebrated && (
        <div className="border-b"
          style={{
            background: "linear-gradient(135deg, oklch(0.18 0.08 55), oklch(0.14 0.06 55))",
            borderColor: "oklch(0.72 0.14 55 / 0.40)",
          }}>
          <div className="container py-4 text-center">
            <p className="text-lg font-serif font-semibold" style={{ color: "oklch(0.82 0.12 60)" }}>
              🎉 As 24 horas estão completamente cobertas!
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Que Deus honre cada oração e restaure o Geraldo completamente.
            </p>
          </div>
        </div>
      )}

      <main className="container py-8 space-y-8">

        {/* ── Versículo ──────────────────────────────────────────────────────── */}
        <div className="text-center py-6">
          <p className="text-xl sm:text-2xl font-serif italic leading-relaxed"
            style={{ color: "oklch(0.85 0.010 265)" }}>
            "A oração do justo é poderosa e eficaz."
          </p>
          <p className="mt-2 text-sm font-medium" style={{ color: "oklch(0.72 0.14 55)" }}>
            Tiago 5:16
          </p>
          <div className="mt-4 divider-gold max-w-xs mx-auto" />
        </div>

        {/* ── Cartões de Resumo ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Intercessores", value: slots.length.toString(), icon: "🙏" },
            {
              label: "Horas cobertas",
              value: formatDuration(uniqueMinutes),
              icon: "⏱️",
              highlight: true,
            },
            {
              label: "Tempo restante",
              value: remaining > 0 ? formatDuration(remaining) : "Completo!",
              icon: "⌛",
            },
            {
              label: "Cobertura",
              value: `${percentage}%`,
              icon: "📊",
              highlight: percentage >= 100,
            },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-xl p-4 border"
              style={{
                background: "oklch(0.14 0.014 265 / 0.80)",
                borderColor: card.highlight
                  ? "oklch(0.72 0.14 55 / 0.50)"
                  : "oklch(0.22 0.014 265)",
                boxShadow: card.highlight
                  ? "0 0 20px oklch(0.72 0.14 55 / 0.12)"
                  : undefined,
              }}>
              <div className="text-2xl mb-2">{card.icon}</div>
              <div
                className="text-xl sm:text-2xl font-serif font-semibold"
                style={{ color: card.highlight ? "oklch(0.82 0.12 60)" : "oklch(0.96 0.008 265)" }}>
                {card.value}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{card.label}</div>
            </div>
          ))}
        </div>

        {/* ── Barra de Progresso ─────────────────────────────────────────────── */}
        <div
          className="rounded-xl p-5 border"
          style={{
            background: "oklch(0.14 0.014 265 / 0.80)",
            borderColor: "oklch(0.22 0.014 265)",
          }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-serif font-semibold">Progresso das 24 Horas</h2>
            <span className="text-sm font-medium" style={{ color: "oklch(0.72 0.14 55)" }}>
              {percentage}%
            </span>
          </div>

          {/* Barra */}
          <div className="relative h-4 rounded-full overflow-hidden"
            style={{ background: "oklch(0.18 0.014 265)" }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(percentage, 100)}%`,
                background: "linear-gradient(90deg, oklch(0.55 0.10 55), oklch(0.72 0.14 55), oklch(0.82 0.12 60))",
                boxShadow: "0 0 12px oklch(0.72 0.14 55 / 0.40)",
              }}
            />
          </div>

          {/* Marcadores */}
          <div className="relative mt-1">
            {[
              { pct: 25, label: "6h" },
              { pct: 50, label: "12h" },
              { pct: 75, label: "18h" },
            ].map(({ pct, label }) => (
              <div
                key={label}
                className="absolute flex flex-col items-center"
                style={{ left: `${pct}%`, transform: "translateX(-50%)" }}>
                <div className="w-px h-2" style={{ background: "oklch(0.35 0.014 265)" }} />
                <span className="text-xs text-muted-foreground mt-0.5">{label}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-5">
            <span>00:00</span>
            <span>24:00</span>
          </div>
        </div>

        {/* ── Formulário de Registo ──────────────────────────────────────────── */}
        <div
          className="rounded-xl p-6 border"
          style={{
            background: "oklch(0.14 0.014 265 / 0.80)",
            borderColor: "oklch(0.72 0.14 55 / 0.25)",
            boxShadow: "0 0 30px oklch(0.72 0.14 55 / 0.06)",
          }}>
          <h2 className="text-lg font-serif font-semibold mb-1">Registar Horário de Oração</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Insira o seu nome e o horário em que irá interceder pelo Geraldo.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "oklch(0.80 0.010 265)" }}>
                Nome
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="O seu nome"
                maxLength={120}
                className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-all"
                style={{
                  background: "oklch(0.18 0.014 265)",
                  border: "1px solid oklch(0.28 0.014 265)",
                  color: "oklch(0.96 0.008 265)",
                }}
                onFocus={(e) => (e.target.style.borderColor = "oklch(0.72 0.14 55)")}
                onBlur={(e) => (e.target.style.borderColor = "oklch(0.28 0.014 265)")}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Hora de início", value: startTime, onChange: setStartTime },
                { label: "Hora de término", value: endTime, onChange: setEndTime },
              ].map(({ label, value, onChange }) => (
                <div key={label}>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "oklch(0.80 0.010 265)" }}>
                    {label}
                  </label>
                  <input
                    type="time"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full rounded-lg px-4 py-2.5 text-sm outline-none transition-all"
                    style={{
                      background: "oklch(0.18 0.014 265)",
                      border: "1px solid oklch(0.28 0.014 265)",
                      color: "oklch(0.96 0.008 265)",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "oklch(0.72 0.14 55)")}
                    onBlur={(e) => (e.target.style.borderColor = "oklch(0.28 0.014 265)")}
                  />
                </div>
              ))}
            </div>

            {/* Preview da duração */}
            {startTime && endTime && (
              <p className="text-xs text-muted-foreground">
                Duração:{" "}
                <span style={{ color: "oklch(0.72 0.14 55)" }}>
                  {formatDuration(
                    slotDuration(timeToMinutes(startTime), timeToMinutes(endTime))
                  )}
                </span>
                {timeToMinutes(endTime) < timeToMinutes(startTime) && (
                  <span className="ml-2 text-xs" style={{ color: "oklch(0.65 0.12 200)" }}>
                    (atravessa a meia-noite)
                  </span>
                )}
              </p>
            )}

            <button
              type="submit"
              disabled={addMutation.isPending}
              className="w-full rounded-lg py-3 text-sm font-semibold transition-all duration-200 disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, oklch(0.65 0.12 55), oklch(0.72 0.14 55))",
                color: "oklch(0.12 0.012 265)",
                boxShadow: "0 4px 15px oklch(0.72 0.14 55 / 0.25)",
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLButtonElement).style.boxShadow =
                  "0 4px 20px oklch(0.72 0.14 55 / 0.40)";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.boxShadow =
                  "0 4px 15px oklch(0.72 0.14 55 / 0.25)";
              }}>
              {addMutation.isPending ? "A registar..." : "Registar Horário de Oração"}
            </button>
          </form>
        </div>

        {/* ── Mapa de Cobertura ──────────────────────────────────────────────── */}
        {slots.length > 0 && (
          <div
            className="rounded-xl p-5 border"
            style={{
              background: "oklch(0.14 0.014 265 / 0.80)",
              borderColor: "oklch(0.22 0.014 265)",
            }}>
            <h2 className="text-base font-serif font-semibold mb-4">
              Mapa de Cobertura por Hora
            </h2>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                  <XAxis
                    dataKey="hour"
                    tick={{ fill: "oklch(0.55 0.010 265)", fontSize: 9 }}
                    tickLine={false}
                    axisLine={false}
                    interval={2}
                  />
                  <YAxis
                    tick={{ fill: "oklch(0.55 0.010 265)", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.18 0.014 265)",
                      border: "1px solid oklch(0.28 0.014 265)",
                      borderRadius: "8px",
                      color: "oklch(0.96 0.008 265)",
                      fontSize: "12px",
                    }}
                    formatter={(value: number) => [
                      `${value} intercessor${value !== 1 ? "es" : ""}`,
                      "Cobertura",
                    ]}
                    cursor={{ fill: "oklch(0.22 0.014 265 / 0.50)" }}
                  />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={
                          entry.covered
                            ? "oklch(0.72 0.14 55)"
                            : "oklch(0.22 0.014 265)"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Barras douradas = horas cobertas · Barras escuras = horas sem cobertura
            </p>
          </div>
        )}

        {/* ── Lista de Intercessores ─────────────────────────────────────────── */}
        {slots.length > 0 && (
          <div
            className="rounded-xl border overflow-hidden"
            style={{
              background: "oklch(0.14 0.014 265 / 0.80)",
              borderColor: "oklch(0.22 0.014 265)",
            }}>
            <div className="flex items-center justify-between px-5 py-4 border-b"
              style={{ borderColor: "oklch(0.22 0.014 265)" }}>
              <h2 className="text-base font-serif font-semibold">
                Intercessores ({slots.length})
              </h2>
              <button
                onClick={exportCSV}
                className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border transition-all"
                style={{
                  borderColor: "oklch(0.72 0.14 55 / 0.40)",
                  color: "oklch(0.72 0.14 55)",
                  background: "oklch(0.72 0.14 55 / 0.08)",
                }}>
                ↓ Exportar CSV
              </button>
            </div>

            {/* Tabela */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid oklch(0.22 0.014 265)" }}>
                    {["Nome", "Início", "Fim", "Duração", ""].map((h) => (
                      <th
                        key={h}
                        className="text-left px-5 py-3 text-xs font-medium uppercase tracking-wider"
                        style={{ color: "oklch(0.55 0.010 265)" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {slots.map((slot, i) => {
                    const isOwn = localTokens.includes(slot.token);
                    return (
                      <tr
                        key={slot.id}
                        style={{
                          borderBottom:
                            i < slots.length - 1
                              ? "1px solid oklch(0.18 0.014 265)"
                              : undefined,
                          background: isOwn
                            ? "oklch(0.72 0.14 55 / 0.04)"
                            : undefined,
                        }}>
                        <td className="px-5 py-3 font-medium">
                          <span>{slot.name}</span>
                          {isOwn && (
                            <span
                              className="ml-2 text-xs px-1.5 py-0.5 rounded"
                              style={{
                                background: "oklch(0.72 0.14 55 / 0.15)",
                                color: "oklch(0.72 0.14 55)",
                              }}>
                              você
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-muted-foreground font-mono text-xs">
                          {minutesToTime(slot.startMinutes)}
                        </td>
                        <td className="px-5 py-3 text-muted-foreground font-mono text-xs">
                          {minutesToTime(slot.endMinutes)}
                        </td>
                        <td className="px-5 py-3 text-muted-foreground text-xs">
                          {formatDuration(
                            slotDuration(slot.startMinutes, slot.endMinutes)
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {isOwn && (
                            <button
                              onClick={() =>
                                removeMutation.mutate({ token: slot.token })
                              }
                              disabled={removeMutation.isPending}
                              className="text-xs px-2 py-1 rounded transition-all"
                              style={{
                                color: "oklch(0.60 0.22 25)",
                                background: "oklch(0.60 0.22 25 / 0.08)",
                              }}>
                              Remover
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: "1px solid oklch(0.28 0.014 265)" }}>
                    <td
                      colSpan={3}
                      className="px-5 py-3 text-xs text-muted-foreground">
                      Total bruto (com sobreposições)
                    </td>
                    <td className="px-5 py-3 text-xs font-medium" style={{ color: "oklch(0.72 0.14 55)" }}>
                      {formatDuration(totalBruto)}
                    </td>
                    <td />
                  </tr>
                  <tr>
                    <td
                      colSpan={3}
                      className="px-5 py-3 text-xs text-muted-foreground">
                      Total único (sem sobreposições)
                    </td>
                    <td className="px-5 py-3 text-xs font-semibold" style={{ color: "oklch(0.82 0.12 60)" }}>
                      {formatDuration(uniqueMinutes)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* ── Estado vazio ──────────────────────────────────────────────────── */}
        {slots.length === 0 && (
          <div className="text-center py-12">
            <div className="text-5xl mb-4">🕯️</div>
            <p className="text-muted-foreground font-serif italic">
              Seja o primeiro a registar o seu horário de oração.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Juntos, cobriremos as 24 horas em oração pelo Geraldo.
            </p>
          </div>
        )}
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t mt-12" style={{ borderColor: "oklch(0.18 0.014 265)" }}>
        <div className="container py-6 text-center space-y-2">
          <p className="text-sm font-serif italic" style={{ color: "oklch(0.60 0.010 265)" }}>
            "A oração do justo é poderosa e eficaz." — Tiago 5:16
          </p>
          <p className="text-xs text-muted-foreground">
            Relógio de Oração pelo Geraldo · Que Deus o restaure completamente
          </p>
        </div>
      </footer>
    </div>
  );
}
