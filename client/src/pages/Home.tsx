import { useState, useCallback, useMemo, useEffect } from "react";
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
import { toast } from "sonner";

// ─── Token helpers ────────────────────────────────────────────────────────────
const LOCAL_TOKENS_KEY = "prayer_tokens";
function getLocalTokens(): string[] {
  try { return JSON.parse(localStorage.getItem(LOCAL_TOKENS_KEY) || "[]"); }
  catch { return []; }
}
function saveLocalToken(token: string) {
  const t = getLocalTokens(); t.push(token);
  localStorage.setItem(LOCAL_TOKENS_KEY, JSON.stringify(t));
}
function removeLocalToken(token: string) {
  localStorage.setItem(LOCAL_TOKENS_KEY, JSON.stringify(getLocalTokens().filter(x => x !== token)));
}

// ─── Cores originais ─────────────────────────────────────────────────────────
const C = {
  bg:       "#0f172a",
  surface:  "#1e293b",
  surface2: "#263248",
  border:   "#334155",
  text:     "#e2e8f0",
  muted:    "#94a3b8",
  primary:  "#6366f1",
  primaryL: "#818cf8",
  success:  "#10b981",
  warning:  "#f59e0b",
  danger:   "#ef4444",
  rose:     "#f43f5e",
  violet:   "#8b5cf6",
  blue:     "#3b82f6",
};

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Home() {
  const [name, setName]           = useState("");
  const [startTime, setStartTime] = useState("06:00");
  const [endTime, setEndTime]     = useState("07:00");
  const [localTokens, setLocalTokens] = useState<string[]>(getLocalTokens);
  const [celebrated, setCelebrated]   = useState(false);
  const [removing, setRemoving]       = useState<string | null>(null);

  // ─── Dados ──────────────────────────────────────────────────────────────────
  const { data: rawSlots = [], refetch } = trpc.prayer.list.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const slots = rawSlots as PrayerSlot[];

  const uniqueMinutes = useMemo(() => uniqueMinutesCovered(slots), [slots]);
  const remaining     = useMemo(() => minutesRemaining(slots), [slots]);
  const percentage    = useMemo(() => coveragePercentage(slots), [slots]);
  const totalBruto    = useMemo(() => slots.reduce((s, sl) => s + slotDuration(sl.startMinutes, sl.endMinutes), 0), [slots]);
  const hourCounts    = useMemo(() => coverageByHour(slots), [slots]);
  const hourCoverage  = useMemo(() =>
    hourCounts.map((count, hour) => ({ hour, count, covered: count > 0 })),
    [hourCounts]
  );
  const maxHourCount  = useMemo(() => Math.max(1, ...hourCounts), [hourCounts]);

  useEffect(() => {
    if (percentage >= 100 && !celebrated) setCelebrated(true);
  }, [percentage, celebrated]);

  // ─── Mutações ───────────────────────────────────────────────────────────────
  const addMutation = trpc.prayer.add.useMutation({
    onSuccess: ({ token }) => {
      saveLocalToken(token);
      setLocalTokens(getLocalTokens());
      setName(""); setStartTime("06:00"); setEndTime("07:00");
      refetch();
      toast.success("Horário registado com sucesso!");
    },
    onError: (err) => toast.error("Erro: " + err.message),
  });

  const removeMutation = trpc.prayer.remove.useMutation({
    onSuccess: (_, { token }) => {
      removeLocalToken(token);
      setLocalTokens(getLocalTokens());
      setRemoving(null);
      refetch();
      toast.success("Entrada removida.");
    },
    onError: () => { setRemoving(null); toast.error("Erro ao remover."); },
  });

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Por favor insira o seu nome."); return; }
    addMutation.mutate({
      name: name.trim(),
      startMinutes: timeToMinutes(startTime),
      endMinutes: timeToMinutes(endTime),
    });
  }, [name, startTime, endTime, addMutation]);

  // ─── Exportação CSV ──────────────────────────────────────────────────────────
  const exportCSV = useCallback(() => {
    const BOM = "\uFEFF";
    const header = "Nome,Início,Fim,Duração (min)\n";
    const rows = slots.map(s =>
      `"${s.name}",${minutesToTime(s.startMinutes)},${minutesToTime(s.endMinutes)},${slotDuration(s.startMinutes, s.endMinutes)}`
    ).join("\n");
    const footer = `\nTotal bruto,,,"${formatDuration(totalBruto)}"\nTotal único,,,"${formatDuration(uniqueMinutes)}"`;
    const blob = new Blob([BOM + header + rows + footer], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "relogio-oracao-geraldo.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Ficheiro CSV exportado.");
  }, [slots, totalBruto, uniqueMinutes]);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: C.bg, color: C.text, minHeight: "100vh", fontFamily: "'Inter', sans-serif", lineHeight: 1.6 }}>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div style={{
        textAlign: "center",
        padding: "40px 16px 32px",
        background: "linear-gradient(180deg, rgba(99,102,241,0.12) 0%, transparent 100%)",
        borderBottom: `1px solid ${C.border}`,
        marginBottom: 28,
      }}>
        <span style={{ fontSize: "3rem", display: "block", marginBottom: 12, animation: "pulse-heart 2s ease-in-out infinite" }}>🙏</span>
        <h1 style={{ fontSize: "clamp(1.6rem, 5vw, 2.4rem)", fontWeight: 700, color: C.text, letterSpacing: "-0.02em", lineHeight: 1.2, fontFamily: "'Inter', sans-serif" }}>
          Relógio de Oração<br />
          <span style={{ color: C.primaryL }}>pelo Geraldo</span>
        </h1>
        <p style={{ marginTop: 10, color: C.muted, fontSize: "0.95rem", maxWidth: 560, marginLeft: "auto", marginRight: "auto" }}>
          O Geraldo sofreu um AVC e necessita urgentemente da intervenção de Deus.
          Juntos, vamos cobrir <strong style={{ color: C.text }}>24 horas contínuas de oração</strong>.
          Registe o seu nome e o horário em que vai orar.
        </p>
        <span style={{
          marginTop: 18, display: "inline-block",
          background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)",
          borderRadius: 12, padding: "10px 18px", fontSize: "0.85rem", color: C.primaryL, fontStyle: "italic",
        }}>
          "A oração do justo é poderosa e eficaz." — Tiago 5:16
        </span>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 16px 48px" }}>

        {/* ── Banner de Meta ──────────────────────────────────────────────── */}
        {celebrated && (
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.35)",
            borderRadius: 12, padding: "16px 20px", marginBottom: 20,
          }}>
            <span style={{ fontSize: "1.6rem", flexShrink: 0 }}>✅</span>
            <div>
              <div style={{ fontSize: "0.95rem", fontWeight: 600, color: C.success }}>Meta de 24 horas alcançada!</div>
              <div style={{ fontSize: "0.82rem", color: "#6ee7b7", marginTop: 2 }}>
                As 24 horas de oração contínua estão cobertas. Que Deus honre cada momento de intercessão!
              </div>
            </div>
          </div>
        )}

        {/* ── Cartões de Resumo ────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 20 }}
          className="stats-grid">
          {[
            { icon: "👥", value: slots.length.toString(), label: "Participantes", color: C.blue },
            { icon: "⏱️", value: formatDuration(uniqueMinutes), label: "Horas cobertas", color: C.violet },
            { icon: "⏳", value: remaining > 0 ? formatDuration(remaining) : "Completo!", label: "Tempo restante", color: C.warning },
            { icon: "❤️", value: `${percentage}%`, label: "Progresso", color: C.rose },
          ].map((card) => (
            <div key={card.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: "1.4rem", marginBottom: 8 }}>{card.icon}</div>
              <div style={{ fontFamily: "'JetBrains Mono', 'Courier New', monospace", fontSize: "1.4rem", fontWeight: 700, lineHeight: 1, color: card.color }}>
                {card.value}
              </div>
              <div style={{ fontSize: "0.72rem", color: C.muted, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {card.label}
              </div>
            </div>
          ))}
        </div>

        {/* ── Barra de Progresso ──────────────────────────────────────────── */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: "0.9rem", fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14, display: "flex", alignItems: "center", gap: 8, fontFamily: "'Inter', sans-serif" }}>
            ✨ Progresso das 24 Horas de Oração
          </div>
          <div style={{ background: C.surface2, borderRadius: 99, height: 18, overflow: "hidden", position: "relative" }}>
            <div style={{
              height: "100%", borderRadius: 99,
              background: percentage >= 100
                ? `linear-gradient(90deg, ${C.success} 0%, #34d399 100%)`
                : `linear-gradient(90deg, ${C.primary} 0%, ${C.primaryL} 100%)`,
              width: `${Math.min(percentage, 100)}%`,
              transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
              minWidth: 0,
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: "0.75rem", color: C.muted }}>
            <span>0h</span>
            <span style={{ fontWeight: 600, color: C.text }}>
              {formatDuration(uniqueMinutes)} cobertos de 24h
            </span>
            <span>24h</span>
          </div>
          <div style={{ position: "relative", height: 20, marginTop: 4 }}>
            {[{ pct: 25, label: "6h" }, { pct: 50, label: "12h" }, { pct: 75, label: "18h" }].map(({ pct, label }) => (
              <div key={label} style={{ position: "absolute", left: `${pct}%`, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ width: 1, height: 6, background: C.border }} />
                <span style={{ fontSize: "0.65rem", color: C.muted, marginTop: 2 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Formulário ──────────────────────────────────────────────────── */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: "0.9rem", fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16, display: "flex", alignItems: "center", gap: 8, fontFamily: "'Inter', sans-serif" }}>
            ➕ Registar o Meu Horário de Oração
          </div>
          <form onSubmit={handleSubmit}>
            <div className="form-grid-layout" style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr" }}>
              {/* Nome */}
              <div className="form-field-name">
                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: C.muted, marginBottom: 6 }}>
                  Nome do Participante
                </label>
                <input
                  type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="Ex: Maria Silva" maxLength={80} autoComplete="name"
                  style={{ width: "100%", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontFamily: "'Inter', sans-serif", fontSize: "0.9rem", padding: "10px 12px", outline: "none", WebkitAppearance: "none" }}
                  onFocus={e => { e.target.style.borderColor = C.primary; e.target.style.boxShadow = `0 0 0 3px rgba(99,102,241,0.2)`; }}
                  onBlur={e => { e.target.style.borderColor = C.border; e.target.style.boxShadow = "none"; }}
                />
              </div>
              {/* Hora Início */}
              <div className="form-field-time">
                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: C.muted, marginBottom: 6 }}>
                  Hora de Início
                </label>
                <input
                  type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                  style={{ width: "100%", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontFamily: "'JetBrains Mono', 'Courier New', monospace", fontSize: "0.9rem", padding: "10px 12px", outline: "none", WebkitAppearance: "none", colorScheme: "dark" }}
                  onFocus={e => { e.target.style.borderColor = C.primary; e.target.style.boxShadow = `0 0 0 3px rgba(99,102,241,0.2)`; }}
                  onBlur={e => { e.target.style.borderColor = C.border; e.target.style.boxShadow = "none"; }}
                />
              </div>
              {/* Hora Término */}
              <div className="form-field-time">
                <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: C.muted, marginBottom: 6 }}>
                  Hora de Término
                </label>
                <input
                  type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                  style={{ width: "100%", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontFamily: "'JetBrains Mono', 'Courier New', monospace", fontSize: "0.9rem", padding: "10px 12px", outline: "none", WebkitAppearance: "none", colorScheme: "dark" }}
                  onFocus={e => { e.target.style.borderColor = C.primary; e.target.style.boxShadow = `0 0 0 3px rgba(99,102,241,0.2)`; }}
                  onBlur={e => { e.target.style.borderColor = C.border; e.target.style.boxShadow = "none"; }}
                />
              </div>
              {/* Botão */}
              <div className="form-field-btn">
                <label style={{ display: "block", fontSize: "0.72rem", opacity: 0, userSelect: "none" }}>Ação</label>
                <button
                  type="submit" disabled={addMutation.isPending}
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, background: C.primary, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "'Inter', sans-serif", fontSize: "0.9rem", fontWeight: 600, padding: "10px 18px", whiteSpace: "nowrap", transition: "all 0.15s", opacity: addMutation.isPending ? 0.6 : 1, width: "100%" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#4f46e5"; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = C.primary; (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; }}>
                  {addMutation.isPending ? "A registar..." : "➕ Adicionar"}
                </button>
              </div>
            </div>
            {/* Preview duração */}
            {startTime && endTime && (
              <p style={{ fontSize: "0.75rem", color: C.muted, marginTop: 12 }}>
                <strong style={{ color: C.text }}>Dica:</strong> Duração:{" "}
                <span style={{ color: C.primaryL }}>
                  {formatDuration(slotDuration(timeToMinutes(startTime), timeToMinutes(endTime)))}
                </span>
                {timeToMinutes(endTime) < timeToMinutes(startTime) && (
                  <span style={{ marginLeft: 8, color: C.blue }}>(atravessa a meia-noite)</span>
                )}
                {" "}— Horários que passam da meia-noite são calculados automaticamente.
              </p>
            )}
          </form>
        </div>

        {/* ── Acções ──────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 28 }}>
          <button
            onClick={exportCSV}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontFamily: "'Inter', sans-serif", fontSize: "0.9rem", fontWeight: 600, padding: "10px 18px", transition: "all 0.15s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = C.surface2; (e.currentTarget as HTMLButtonElement).style.color = C.text; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = C.muted; }}>
            ⬇️ Exportar CSV
          </button>
        </div>

        {/* ── Tabela de Participantes ──────────────────────────────────────── */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: "0.9rem", fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 8, fontFamily: "'Inter', sans-serif" }}>
              👥 Lista de Intercessores
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", fontSize: "0.72rem", fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: "rgba(59,130,246,0.12)", color: C.blue, border: "1px solid rgba(59,130,246,0.25)" }}>
              {slots.length} participante{slots.length !== 1 ? "s" : ""}
            </span>
          </div>

          {slots.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 16px", color: C.muted }}>
              <div style={{ fontSize: "2.5rem", opacity: 0.3, marginBottom: 10 }}>🙏</div>
              <p style={{ fontSize: "0.88rem" }}>Ainda não há participantes registados.</p>
              <small style={{ fontSize: "0.78rem", opacity: 0.7 }}>Seja o primeiro a inscrever o seu horário de oração!</small>
            </div>
          ) : (
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                <thead>
                  <tr>
                    {["#", "Nome", "Início", "Término", "Duração", "Cobertura", ""].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "8px 10px", fontSize: "0.68rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: C.muted, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {slots.map((slot, i) => {
                    const isOwn = localTokens.includes(slot.token);
                    const dur = slotDuration(slot.startMinutes, slot.endMinutes);
                    const pct = Math.round((dur / 1440) * 100);
                    return (
                      <tr key={slot.id} style={{ borderBottom: i < slots.length - 1 ? `1px solid rgba(51,65,85,0.5)` : undefined, transition: "background 0.15s" }}
                        onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "rgba(255,255,255,0.03)"}
                        onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = "transparent"}>
                        <td style={{ padding: "10px 10px", color: C.muted, fontSize: "0.75rem" }}>{i + 1}</td>
                        <td style={{ padding: "10px 10px", fontWeight: 500 }}>
                          {slot.name}
                          {isOwn && (
                            <span style={{ marginLeft: 6, fontSize: "0.68rem", padding: "1px 6px", borderRadius: 99, background: "rgba(99,102,241,0.15)", color: C.primaryL, border: "1px solid rgba(99,102,241,0.25)" }}>
                              você
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "10px 10px", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.82rem", color: C.blue }}>{minutesToTime(slot.startMinutes)}</td>
                        <td style={{ padding: "10px 10px", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.82rem", color: C.violet }}>{minutesToTime(slot.endMinutes)}</td>
                        <td style={{ padding: "10px 10px", color: C.muted, fontSize: "0.82rem" }}>{formatDuration(dur)}</td>
                        <td style={{ padding: "10px 10px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 80 }}>
                            <div style={{ flex: 1, height: 4, background: C.surface2, borderRadius: 99, overflow: "hidden" }}>
                              <div style={{ height: "100%", borderRadius: 99, background: C.primary, width: `${Math.min(pct, 100)}%` }} />
                            </div>
                            <span style={{ fontSize: "0.7rem", color: C.muted, width: 30, textAlign: "right" }}>{pct}%</span>
                          </div>
                        </td>
                        <td style={{ padding: "10px 10px" }}>
                          {isOwn && (
                            <button
                              onClick={() => { setRemoving(slot.token); removeMutation.mutate({ token: slot.token }); }}
                              disabled={removing === slot.token}
                              style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: "4px 6px", borderRadius: 6, fontSize: "1rem", transition: "all 0.15s", lineHeight: 1 }}
                              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = C.danger; (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.1)"; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.muted; (e.currentTarget as HTMLButtonElement).style.background = "none"; }}>
                              🗑️
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${C.border}` }}>
                    <td colSpan={4} style={{ padding: "10px 10px", fontSize: "0.7rem", fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Total bruto (com sobreposições)</td>
                    <td colSpan={3} style={{ padding: "10px 10px", fontSize: "0.82rem", color: C.primaryL, fontWeight: 600 }}>{formatDuration(totalBruto)}</td>
                  </tr>
                  <tr>
                    <td colSpan={4} style={{ padding: "10px 10px", fontSize: "0.7rem", fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Total único (sem sobreposições)</td>
                    <td colSpan={3} style={{ padding: "10px 10px", fontSize: "0.82rem", color: C.success, fontWeight: 700 }}>{formatDuration(uniqueMinutes)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* ── Mapa de Cobertura ────────────────────────────────────────────── */}
        {slots.length > 0 && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <div style={{ fontSize: "0.9rem", fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16, display: "flex", alignItems: "center", gap: 8, fontFamily: "'Inter', sans-serif" }}>
              🕐 Mapa de Cobertura por Hora
            </div>
            {/* Barras */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 64 }}>
              {hourCoverage.map((h) => (
                <div
                  key={h.hour}
                  title={`${h.hour}:00 — ${h.count} intercessor${h.count !== 1 ? "es" : ""}`}
                  style={{
                    flex: 1, borderRadius: "3px 3px 0 0",
                    background: h.covered ? C.primary : C.surface2,
                    opacity: h.covered ? 0.75 : 1,
                    height: h.count > 0 ? `${Math.max(8, Math.round((h.count / maxHourCount) * 64))}px` : "4px",
                    transition: "height 0.4s ease, background 0.3s",
                    cursor: "default",
                    minHeight: 4,
                  }}
                  onMouseEnter={e => { if (h.covered) (e.currentTarget as HTMLDivElement).style.opacity = "1"; }}
                  onMouseLeave={e => { if (h.covered) (e.currentTarget as HTMLDivElement).style.opacity = "0.75"; }}
                />
              ))}
            </div>
            {/* Eixo */}
            <div style={{ display: "flex", gap: 3, marginTop: 4 }}>
              {hourCoverage.map(h => (
                <div key={h.hour} style={{ flex: 1, textAlign: "center", fontSize: "0.6rem", color: C.muted }}>
                  {h.hour % 6 === 0 ? `${h.hour}h` : ""}
                </div>
              ))}
            </div>
            {/* Legenda */}
            <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: "0.75rem", color: C.muted, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: C.primary }} />
                <span>Coberto</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: C.surface2 }} />
                <span>Sem cobertura</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div style={{ textAlign: "center", padding: "24px 16px", borderTop: `1px solid ${C.border}`, color: C.muted, fontSize: "0.8rem" }}>
          <p>Unidos em oração pela recuperação do <strong style={{ color: C.primaryL }}>Geraldo</strong>.</p>
          <p style={{ marginTop: 4 }}>Cada minuto de intercessão importa. Que Deus seja glorificado! 🙏</p>
        </div>

      </div>

      {/* ── Animação pulse ──────────────────────────────────────────────────── */}
      <style>{`
        @keyframes pulse-heart {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.12); }
        }
        @media (min-width: 600px) {
          .form-grid-layout {
            grid-template-columns: 1fr 130px 130px auto !important;
            align-items: end;
          }
        }
        @media (min-width: 560px) {
          .stats-grid {
            grid-template-columns: repeat(4, 1fr) !important;
          }
        }
      `}</style>
    </div>
  );
}
