import { useState, useMemo, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  minutesToTime,
  slotDuration,
  uniqueMinutesCovered,
  minutesRemaining,
  coveragePercentage,
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

// ─── Gera os 48 slots de 30 em 30 minutos ────────────────────────────────────
const ALL_SLOTS_30: { label: string; minutes: number }[] = Array.from({ length: 48 }, (_, i) => {
  const m = i * 30;
  const h = String(Math.floor(m / 60)).padStart(2, "0");
  const min = String(m % 60).padStart(2, "0");
  return { label: `${h}:${min}`, minutes: m };
});

// ─── Paleta de cores com alto contraste ──────────────────────────────────────
const C = {
  bg:        "#0a0f1e",
  surface:   "#131929",
  surface2:  "#1a2236",
  border:    "#2a3a55",
  borderHi:  "#3d5280",
  text:      "#f0f4ff",       // branco frio — alto contraste
  textSec:   "#c8d4f0",       // texto secundário — bem visível
  muted:     "#7a90b8",       // labels e hints
  primary:   "#6366f1",
  primaryL:  "#a5b4fc",       // indigo claro — legível sobre escuro
  success:   "#22c55e",       // verde vivo
  successBg: "rgba(34,197,94,0.12)",
  warning:   "#fbbf24",       // âmbar vivo
  warningBg: "rgba(251,191,36,0.12)",
  danger:    "#f87171",
  blue:      "#60a5fa",       // azul claro
  violet:    "#c084fc",       // violeta claro
  free:      "#fbbf24",       // slot livre — laranja/âmbar
  freeBg:    "rgba(251,191,36,0.10)",
  occupied:  "#22c55e",       // slot ocupado — verde
  occupiedBg:"rgba(34,197,94,0.10)",
};

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Home() {
  const [name, setName]             = useState("");
  const [startIdx, setStartIdx]     = useState(12);  // 06:00 por defeito
  const [endIdx, setEndIdx]         = useState(14);  // 07:00 por defeito
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

  // ─── Mapa de ocupação: para cada slot de 30min, quem está a orar ─────────────
  const occupancyMap = useMemo(() => {
    const map = new Map<number, PrayerSlot[]>();
    ALL_SLOTS_30.forEach(s => map.set(s.minutes, []));
    for (const slot of slots) {
      let cur = slot.startMinutes;
      while (cur !== slot.endMinutes) {
        const list = map.get(cur) ?? [];
        list.push(slot);
        map.set(cur, list);
        cur = (cur + 30) % 1440;
      }
    }
    return map;
  }, [slots]);

  // ─── Conjunto de slots ocupados (minutos) ───────────────────────────────────
  const occupiedMinutes = useMemo(() => {
    const set = new Set<number>();
    ALL_SLOTS_30.forEach(s => {
      if ((occupancyMap.get(s.minutes) ?? []).length > 0) set.add(s.minutes);
    });
    return set;
  }, [occupancyMap]);

  // Slots livres para início (não ocupados)
  const availableStartSlots = useMemo(() => {
    return ALL_SLOTS_30.filter(s => !occupiedMinutes.has(s.minutes));
  }, [occupiedMinutes]);

  // Verifica se o intervalo seleccionado contém algum slot já ocupado
  const conflictingSlots = useMemo(() => {
    const startMin = ALL_SLOTS_30[startIdx]?.minutes ?? 0;
    const endMin   = ALL_SLOTS_30[endIdx]?.minutes ?? 30;
    if (startMin === endMin) return [];
    const inRange: number[] = [];
    let cur = startMin;
    while (cur !== endMin) {
      if (occupiedMinutes.has(cur)) inRange.push(cur);
      cur = (cur + 30) % 1440;
    }
    return inRange;
  }, [startIdx, endIdx, occupiedMinutes]);

  useEffect(() => {
    if (percentage >= 100 && !celebrated) setCelebrated(true);
  }, [percentage, celebrated]);

  // ─── Mutações ───────────────────────────────────────────────────────────────
  const addMutation = trpc.prayer.add.useMutation({
    onSuccess: ({ token }) => {
      saveLocalToken(token);
      setLocalTokens(getLocalTokens());
      setName("");
      setStartIdx(12);
      setEndIdx(14);
      refetch();
      toast.success("Horário registado com sucesso! 🙏");
    },
    onError: (err) => toast.error(err.message),
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
    const startMinutes = ALL_SLOTS_30[startIdx]?.minutes ?? 0;
    const endMinutes   = ALL_SLOTS_30[endIdx]?.minutes ?? 30;
    if (startMinutes === endMinutes) { toast.error("O horário de início e de fim não podem ser iguais."); return; }
    if (conflictingSlots.length > 0) {
      const labels = conflictingSlots.map(m => ALL_SLOTS_30.find(s => s.minutes === m)?.label ?? "").join(", ");
      toast.error(`O intervalo contém slots já ocupados: ${labels}. Por favor escolha horários livres.`);
      return;
    }
    addMutation.mutate({ name: name.trim(), startMinutes, endMinutes });
  }, [name, startIdx, endIdx, addMutation, conflictingSlots]);

  // ─── Preview da duração seleccionada ────────────────────────────────────────
  const previewDuration = useMemo(() => {
    const s = ALL_SLOTS_30[startIdx]?.minutes ?? 0;
    const e = ALL_SLOTS_30[endIdx]?.minutes ?? 30;
    if (s === e) return null;
    return { dur: slotDuration(s, e), crossesMidnight: e < s };
  }, [startIdx, endIdx]);

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
        background: "linear-gradient(180deg, rgba(99,102,241,0.15) 0%, transparent 100%)",
        borderBottom: `1px solid ${C.border}`,
        marginBottom: 24,
      }}>
        <span style={{ fontSize: "3rem", display: "block", marginBottom: 12 }}>🙏</span>
        <h1 style={{ fontSize: "clamp(1.7rem, 5vw, 2.5rem)", fontWeight: 800, color: C.text, letterSpacing: "-0.02em", lineHeight: 1.2, margin: 0 }}>
          Relógio de Oração<br />
          <span style={{ color: C.primaryL }}>pelo Geraldo</span>
        </h1>
        <p style={{ marginTop: 12, color: C.textSec, fontSize: "0.95rem", maxWidth: 560, marginLeft: "auto", marginRight: "auto" }}>
          O Geraldo sofreu um AVC e necessita urgentemente da intervenção de Deus.
          Juntos, vamos cobrir <strong style={{ color: C.text }}>24 horas contínuas de oração</strong>.
          Registe o seu nome e o horário em que vai orar.
        </p>
        <div style={{
          marginTop: 18, display: "inline-block",
          background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)",
          borderRadius: 12, padding: "10px 20px", fontSize: "0.88rem", color: C.primaryL, fontStyle: "italic",
        }}>
          "A oração do justo é poderosa e eficaz." — Tiago 5:16
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 16px 48px" }}>

        {/* ── Banner de Meta ──────────────────────────────────────────────── */}
        {celebrated && (
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            background: C.successBg, border: "1px solid rgba(34,197,94,0.4)",
            borderRadius: 12, padding: "16px 20px", marginBottom: 20,
          }}>
            <span style={{ fontSize: "1.6rem", flexShrink: 0 }}>✅</span>
            <div>
              <div style={{ fontSize: "0.95rem", fontWeight: 700, color: C.success }}>Meta de 24 horas alcançada!</div>
              <div style={{ fontSize: "0.82rem", color: C.textSec, marginTop: 2 }}>
                As 24 horas de oração contínua estão cobertas. Que Deus honre cada momento de intercessão!
              </div>
            </div>
          </div>
        )}

        {/* ── Cartões de Resumo ────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { icon: "👥", value: slots.length.toString(), label: "Participantes", color: C.blue },
            { icon: "⏱️", value: formatDuration(uniqueMinutes), label: "Horas cobertas", color: C.violet },
            { icon: "⏳", value: remaining > 0 ? formatDuration(remaining) : "Completo!", label: "Tempo restante", color: C.warning },
            { icon: "❤️", value: `${percentage}%`, label: "Progresso", color: "#f87171" },
          ].map((card) => (
            <div key={card.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 14px" }}>
              <div style={{ fontSize: "1.4rem", marginBottom: 6 }}>{card.icon}</div>
              <div style={{ fontFamily: "'JetBrains Mono', 'Courier New', monospace", fontSize: "1.5rem", fontWeight: 700, lineHeight: 1, color: card.color }}>
                {card.value}
              </div>
              <div style={{ fontSize: "0.72rem", color: C.muted, marginTop: 5, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
                {card.label}
              </div>
            </div>
          ))}
        </div>

        {/* ── Barra de Progresso ──────────────────────────────────────────── */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: "0.82rem", fontWeight: 700, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            ✨ Progresso das 24 Horas de Oração
          </div>
          <div style={{ background: C.surface2, borderRadius: 99, height: 20, overflow: "hidden", border: `1px solid ${C.border}` }}>
            <div style={{
              height: "100%", borderRadius: 99,
              background: percentage >= 100
                ? `linear-gradient(90deg, ${C.success} 0%, #4ade80 100%)`
                : `linear-gradient(90deg, ${C.primary} 0%, ${C.primaryL} 100%)`,
              width: `${Math.min(percentage, 100)}%`,
              transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
              minWidth: 0,
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: "0.78rem", color: C.textSec, fontWeight: 500 }}>
            <span style={{ color: C.muted }}>0h</span>
            <span style={{ fontWeight: 700, color: C.text }}>
              {formatDuration(uniqueMinutes)} cobertos de 24h
            </span>
            <span style={{ color: C.muted }}>24h</span>
          </div>
          <div style={{ position: "relative", height: 20, marginTop: 4 }}>
            {[{ pct: 25, label: "6h" }, { pct: 50, label: "12h" }, { pct: 75, label: "18h" }].map(({ pct, label }) => (
              <div key={label} style={{ position: "absolute", left: `${pct}%`, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ width: 1, height: 6, background: C.borderHi }} />
                <span style={{ fontSize: "0.65rem", color: C.muted, marginTop: 2 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Grelha de 48 Slots ──────────────────────────────────────────── */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: "0.82rem", fontWeight: 700, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.07em" }}>
              📋 Horários do Dia — 48 Slots de 30 min
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: "0.72rem", color: C.muted, flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: C.occupied, display: "inline-block" }} />
                <span style={{ color: C.textSec }}>Ocupado</span>
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: C.free, display: "inline-block" }} />
                <span style={{ color: C.textSec }}>Livre</span>
              </span>
            </div>
          </div>

          {/* Lista com scroll */}
          <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4,
            scrollbarWidth: "thin", scrollbarColor: `${C.borderHi} ${C.surface2}` }}>
            {ALL_SLOTS_30.map((slot, i) => {
              const nextSlot = ALL_SLOTS_30[(i + 1) % 48];
              const endMinutes = nextSlot?.minutes ?? 0;
              const occupants = occupancyMap.get(slot.minutes) ?? [];
              const isOccupied = occupants.length > 0;
              return (
                <div key={slot.minutes} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 12px", borderRadius: 8,
                  background: isOccupied ? C.occupiedBg : C.freeBg,
                  border: `1px solid ${isOccupied ? "rgba(34,197,94,0.25)" : "rgba(251,191,36,0.2)"}`,
                  transition: "all 0.15s",
                }}>
                  {/* Indicador de cor */}
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    background: isOccupied ? C.occupied : C.free,
                    boxShadow: isOccupied ? `0 0 6px ${C.occupied}` : `0 0 6px ${C.free}`,
                  }} />
                  {/* Horário */}
                  <span style={{
                    fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                    fontSize: "0.88rem", fontWeight: 700,
                    color: isOccupied ? C.success : C.warning,
                    minWidth: 110, flexShrink: 0,
                  }}>
                    {slot.label} → {minutesToTime(endMinutes)}
                  </span>
                  {/* Nome(s) ou "Livre" */}
                  <span style={{
                    flex: 1, fontSize: "0.85rem",
                    color: isOccupied ? C.textSec : C.muted,
                    fontWeight: isOccupied ? 600 : 400,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {isOccupied
                      ? occupants.map(o => o.name).join(", ")
                      : "Livre — clique em Registar para reservar"}
                  </span>
                  {/* Badge */}
                  <span style={{
                    flexShrink: 0, fontSize: "0.65rem", fontWeight: 700, padding: "2px 8px",
                    borderRadius: 99, textTransform: "uppercase", letterSpacing: "0.05em",
                    background: isOccupied ? "rgba(34,197,94,0.15)" : "rgba(251,191,36,0.15)",
                    color: isOccupied ? C.success : C.warning,
                    border: `1px solid ${isOccupied ? "rgba(34,197,94,0.3)" : "rgba(251,191,36,0.3)"}`,
                  }}>
                    {isOccupied ? "✓ Ocupado" : "Livre"}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Rodé da grelha */}
          {(() => {
            const occupiedCount = ALL_SLOTS_30.filter(s => (occupancyMap.get(s.minutes) ?? []).length > 0).length;
            const freeCount = 48 - occupiedCount;
            return (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}`, display: "flex", gap: 16, flexWrap: "wrap", fontSize: "0.78rem", color: C.muted }}>
                <span><strong style={{ color: C.success }}>{occupiedCount}</strong> de 48 slots ocupados</span>
                <span><strong style={{ color: C.warning }}>{freeCount}</strong> slots livres</span>
                <span style={{ marginLeft: "auto", color: C.muted }}>{Math.round((occupiedCount / 48) * 100)}% do dia coberto</span>
              </div>
            );
          })()}
        </div>

        {/* ── Formulário ──────────────────────────────────────────────────── */}
        <div style={{ background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: "0.82rem", fontWeight: 700, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
            ➕ Registar o Meu Horário de Oração
          </div>
          <form onSubmit={handleSubmit}>
            {/* Nome */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: C.textSec, marginBottom: 8 }}>
                Nome do Participante
              </label>
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="Ex: Maria Silva" maxLength={80} autoComplete="name"
                style={{
                  width: "100%", background: C.surface2,
                  border: `1.5px solid ${C.borderHi}`, borderRadius: 8,
                  color: C.text, fontFamily: "'Inter', sans-serif",
                  fontSize: "1rem", padding: "12px 14px", outline: "none",
                  WebkitAppearance: "none", boxSizing: "border-box",
                }}
                onFocus={e => { e.target.style.borderColor = C.primary; e.target.style.boxShadow = `0 0 0 3px rgba(99,102,241,0.25)`; }}
                onBlur={e => { e.target.style.borderColor = C.borderHi; e.target.style.boxShadow = "none"; }}
              />
            </div>

            {/* Selectores de horário */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              {/* Hora Início */}
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: C.textSec, marginBottom: 8 }}>
                  ▶ Hora de Início
                </label>
                <select
                  value={startIdx}
                  onChange={e => setStartIdx(Number(e.target.value))}
                  style={{
                    width: "100%", background: C.surface2,
                    border: `1.5px solid ${C.borderHi}`, borderRadius: 8,
                    color: C.text, fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                    fontSize: "1rem", fontWeight: 700, padding: "12px 14px",
                    outline: "none", cursor: "pointer", WebkitAppearance: "none",
                    appearance: "none", boxSizing: "border-box",
                  }}
                  onFocus={e => { e.target.style.borderColor = C.blue; e.target.style.boxShadow = `0 0 0 3px rgba(96,165,250,0.2)`; }}
                  onBlur={e => { e.target.style.borderColor = C.borderHi; e.target.style.boxShadow = "none"; }}
                >
                  {ALL_SLOTS_30.map((s, i) => {
                    const isOccupied = occupiedMinutes.has(s.minutes);
                    return (
                      <option key={s.minutes} value={i} disabled={isOccupied}
                        style={{ background: C.surface2, color: isOccupied ? C.muted : C.text }}>
                        {isOccupied ? `❌ ${s.label} (ocupado)` : s.label}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Hora Fim */}
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: C.textSec, marginBottom: 8 }}>
                  ■ Hora de Término
                </label>
                <select
                  value={endIdx}
                  onChange={e => setEndIdx(Number(e.target.value))}
                  style={{
                    width: "100%", background: C.surface2,
                    border: `1.5px solid ${C.borderHi}`, borderRadius: 8,
                    color: C.text, fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                    fontSize: "1rem", fontWeight: 700, padding: "12px 14px",
                    outline: "none", cursor: "pointer", WebkitAppearance: "none",
                    appearance: "none", boxSizing: "border-box",
                  }}
                  onFocus={e => { e.target.style.borderColor = C.violet; e.target.style.boxShadow = `0 0 0 3px rgba(192,132,252,0.2)`; }}
                  onBlur={e => { e.target.style.borderColor = C.borderHi; e.target.style.boxShadow = "none"; }}
                >
                  {ALL_SLOTS_30.map((s, i) => {
                    const isOccupied = occupiedMinutes.has(s.minutes);
                    return (
                      <option key={s.minutes} value={i}
                        style={{ background: C.surface2, color: isOccupied ? C.muted : C.text }}>
                        {s.label}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Aviso de conflito */}
            {conflictingSlots.length > 0 && (
              <div style={{
                background: "rgba(248,113,113,0.12)", border: `1.5px solid ${C.danger}`,
                borderRadius: 8, padding: "10px 14px", marginBottom: 12,
                fontSize: "0.82rem", color: C.danger, display: "flex", alignItems: "flex-start", gap: 8,
              }}>
                <span style={{ fontSize: "1rem" }}>⚠️</span>
                <span>
                  <strong>Conflito detectado:</strong> os seguintes slots já estão ocupados no intervalo seleccionado:{" "}
                  <strong>{conflictingSlots.map(m => ALL_SLOTS_30.find(s => s.minutes === m)?.label ?? "").join(", ")}</strong>.
                  Por favor ajuste o horário de início ou de término.
                </span>
              </div>
            )}

            {/* Preview da duração */}
            {previewDuration && (
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                background: C.surface2, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: "10px 14px", marginBottom: 16,
              }}>
                <span style={{ fontSize: "0.85rem", color: C.muted }}>Duração:</span>
                <span style={{ fontSize: "0.95rem", fontWeight: 700, color: C.primaryL }}>
                  {formatDuration(previewDuration.dur)}
                </span>
                {previewDuration.crossesMidnight && (
                  <span style={{ fontSize: "0.75rem", color: C.warning, marginLeft: 4 }}>
                    🌙 atravessa a meia-noite
                  </span>
                )}
                <span style={{ marginLeft: "auto", fontSize: "0.72rem", color: C.muted }}>
                  {ALL_SLOTS_30[startIdx]?.label} → {ALL_SLOTS_30[endIdx]?.label}
                </span>
              </div>
            )}

            {/* Botão */}
            <button
              type="submit" disabled={addMutation.isPending}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                background: addMutation.isPending ? C.border : C.primary,
                color: "#fff", border: "none", borderRadius: 10,
                cursor: addMutation.isPending ? "not-allowed" : "pointer",
                fontFamily: "'Inter', sans-serif", fontSize: "1rem", fontWeight: 700,
                padding: "14px 24px", width: "100%", transition: "all 0.15s",
                letterSpacing: "0.02em",
              }}
              onMouseEnter={e => { if (!addMutation.isPending) (e.currentTarget as HTMLButtonElement).style.background = "#4f46e5"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = addMutation.isPending ? C.border : C.primary; }}>
              {addMutation.isPending ? "⏳ A registar..." : "➕ Registar o Meu Horário"}
            </button>
          </form>
        </div>

        {/* ── Acções ──────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 28 }}>
          <button
            onClick={exportCSV}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "transparent", color: C.textSec,
              border: `1px solid ${C.border}`, borderRadius: 8,
              cursor: "pointer", fontFamily: "'Inter', sans-serif",
              fontSize: "0.9rem", fontWeight: 600, padding: "10px 18px", transition: "all 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = C.surface2; (e.currentTarget as HTMLButtonElement).style.borderColor = C.borderHi; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.borderColor = C.border; }}>
            ⬇️ Exportar CSV
          </button>
        </div>

        {/* ── Lista de Intercessores ──────────────────────────────────────── */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: "0.82rem", fontWeight: 700, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.07em" }}>
              👥 Lista de Intercessores
            </div>
            <span style={{ fontSize: "0.72rem", fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: "rgba(96,165,250,0.12)", color: C.blue, border: "1px solid rgba(96,165,250,0.25)" }}>
              {slots.length} participante{slots.length !== 1 ? "s" : ""}
            </span>
          </div>

          {slots.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 16px", color: C.muted }}>
              <div style={{ fontSize: "2.5rem", opacity: 0.4, marginBottom: 10 }}>🙏</div>
              <p style={{ fontSize: "0.9rem", color: C.textSec }}>Ainda não há participantes registados.</p>
              <small style={{ fontSize: "0.78rem", color: C.muted }}>Seja o primeiro a inscrever o seu horário de oração!</small>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {slots.map((slot, i) => {
                  const isOwn = localTokens.includes(slot.token);
                  const dur = slotDuration(slot.startMinutes, slot.endMinutes);
                  const pct = Math.round((dur / 1440) * 100);
                  const crossesMidnight = slot.endMinutes < slot.startMinutes;
                  return (
                    <div key={slot.id} style={{
                      background: isOwn ? "rgba(99,102,241,0.08)" : C.surface2,
                      border: `1px solid ${isOwn ? "rgba(99,102,241,0.35)" : C.border}`,
                      borderRadius: 10, padding: "14px 16px",
                    }}>
                      {/* Linha 1: Número + Nome + Botão */}
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
                        <span style={{
                          flexShrink: 0, width: 28, height: 28, marginTop: 1,
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          borderRadius: "50%", background: "rgba(99,102,241,0.18)",
                          fontSize: "0.72rem", fontWeight: 700, color: C.primaryL,
                        }}>{i + 1}</span>
                        <span style={{ flex: 1, fontWeight: 700, fontSize: "1.05rem", color: C.text, wordBreak: "break-word", lineHeight: 1.3 }}>
                          {slot.name}
                          {isOwn && (
                            <span style={{ marginLeft: 8, fontSize: "0.65rem", padding: "2px 7px", borderRadius: 99, background: "rgba(99,102,241,0.2)", color: C.primaryL, border: "1px solid rgba(99,102,241,0.35)", verticalAlign: "middle" }}>
                              você
                            </span>
                          )}
                        </span>
                        {isOwn && (
                          <button
                            onClick={() => { setRemoving(slot.token); removeMutation.mutate({ token: slot.token }); }}
                            disabled={removing === slot.token}
                            style={{
                              flexShrink: 0, background: "rgba(248,113,113,0.1)",
                              border: "1px solid rgba(248,113,113,0.3)", borderRadius: 8,
                              cursor: "pointer", color: C.danger, padding: "6px 10px",
                              fontSize: "0.78rem", fontWeight: 600, transition: "all 0.15s",
                              display: "inline-flex", alignItems: "center", gap: 4,
                              opacity: removing === slot.token ? 0.5 : 1, whiteSpace: "nowrap",
                            }}>
                            🗑️ Remover
                          </button>
                        )}
                      </div>

                      {/* Linha 2: Horários + Duração */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.25)", borderRadius: 8, padding: "6px 12px" }}>
                          <span style={{ fontSize: "0.65rem", color: C.muted, textTransform: "uppercase" }}>Início</span>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1rem", fontWeight: 700, color: C.blue }}>{minutesToTime(slot.startMinutes)}</span>
                        </div>
                        <span style={{ color: C.muted }}>→</span>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(192,132,252,0.1)", border: "1px solid rgba(192,132,252,0.25)", borderRadius: 8, padding: "6px 12px" }}>
                          <span style={{ fontSize: "0.65rem", color: C.muted, textTransform: "uppercase" }}>Fim</span>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1rem", fontWeight: 700, color: C.violet }}>{minutesToTime(slot.endMinutes)}</span>
                        </div>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 8, padding: "6px 10px" }}>
                          <span style={{ fontSize: "0.85rem", fontWeight: 700, color: C.success }}>⏱ {formatDuration(dur)}</span>
                        </div>
                        {crossesMidnight && (
                          <span style={{ fontSize: "0.68rem", padding: "3px 8px", borderRadius: 99, background: C.warningBg, color: C.warning, border: "1px solid rgba(251,191,36,0.3)" }}>
                            🌙 meia-noite
                          </span>
                        )}
                      </div>

                      {/* Linha 3: Barra */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 5, background: C.bg, borderRadius: 99, overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 99, background: `linear-gradient(90deg, ${C.primary}, ${C.primaryL})`, width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <span style={{ fontSize: "0.72rem", color: C.muted, minWidth: 38, textAlign: "right" }}>{pct}% do dia</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Rodapé de totais */}
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.border}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ background: C.surface2, borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ fontSize: "0.65rem", color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, fontWeight: 700 }}>Total bruto</div>
                  <div style={{ fontSize: "1rem", fontWeight: 700, color: C.primaryL }}>{formatDuration(totalBruto)}</div>
                  <div style={{ fontSize: "0.65rem", color: C.muted, marginTop: 2 }}>com sobreposições</div>
                </div>
                <div style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ fontSize: "0.65rem", color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, fontWeight: 700 }}>Total único</div>
                  <div style={{ fontSize: "1rem", fontWeight: 700, color: C.success }}>{formatDuration(uniqueMinutes)}</div>
                  <div style={{ fontSize: "0.65rem", color: C.muted, marginTop: 2 }}>sem sobreposições</div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Rodapé ──────────────────────────────────────────────────────── */}
        <div style={{ textAlign: "center", paddingTop: 24, borderTop: `1px solid ${C.border}`, color: C.muted, fontSize: "0.8rem" }}>
          <p style={{ color: C.primaryL, fontStyle: "italic", marginBottom: 6 }}>
            "A oração do justo é poderosa e eficaz." — Tiago 5:16
          </p>
          <p>Actualizado automaticamente a cada 30 segundos · Dados partilhados em tempo real</p>
        </div>
      </div>
    </div>
  );
}
