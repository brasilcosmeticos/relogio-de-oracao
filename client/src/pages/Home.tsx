import { useState, useMemo, useCallback, useEffect, useRef } from "react";
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

// ─── Gera os 48 horários de 30 em 30 minutos ────────────────────────────────
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
  text:      "#f0f4ff",
  textSec:   "#c8d4f0",
  muted:     "#7a90b8",
  primary:   "#6366f1",
  primaryL:  "#a5b4fc",
  success:   "#22c55e",
  successBg: "rgba(34,197,94,0.12)",
  warning:   "#fbbf24",
  warningBg: "rgba(251,191,36,0.12)",
  danger:    "#f87171",
  blue:      "#60a5fa",
  violet:    "#c084fc",
  free:      "#fbbf24",
  freeBg:    "rgba(251,191,36,0.10)",
  occupied:  "#22c55e",
  occupiedBg:"rgba(34,197,94,0.10)",
};

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Home() {
  const [name, setName]             = useState("");
  const [startIdx, setStartIdx]     = useState(12);  // 06:00 por defeito
  const [duration, setDuration]     = useState<30 | 60>(30);
  const [localTokens, setLocalTokens] = useState<string[]>(getLocalTokens);
  const [celebrated, setCelebrated]   = useState(false);
  const [removing, setRemoving]       = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // ─── Dados ──────────────────────────────────────────────────────────────────
  const { data: rawSlots = [], refetch } = trpc.prayer.list.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const slots = rawSlots as PrayerSlot[];

  const uniqueMinutes = useMemo(() => uniqueMinutesCovered(slots), [slots]);
  const remaining     = useMemo(() => minutesRemaining(slots), [slots]);
  const percentage    = useMemo(() => coveragePercentage(slots), [slots]);

  // ─── Mapa de ocupação: para cada horário de 30min, quem está a orar ─────────
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

  // ─── Contagem de participantes únicos (agrupados por groupToken) ───────────
  const uniqueParticipantCount = useMemo(() => {
    const seen = new Set<string>();
    let count = 0;
    for (const slot of slots) {
      const gt = slot.groupToken ?? null;
      if (gt) {
        if (!seen.has(gt)) { seen.add(gt); count++; }
      } else {
        count++;
      }
    }
    return count;
  }, [slots]);

  // ─── Conjunto de horários ocupados (minutos) ───────────────────────────────
  const occupiedMinutes = useMemo(() => {
    const set = new Set<number>();
    ALL_SLOTS_30.forEach(s => {
      if ((occupancyMap.get(s.minutes) ?? []).length > 0) set.add(s.minutes);
    });
    return set;
  }, [occupancyMap]);

  // Horário de início seleccionado está ocupado?
  const startSlotOccupied = useMemo(() => {
    const startMin = ALL_SLOTS_30[startIdx]?.minutes ?? 0;
    return occupiedMinutes.has(startMin);
  }, [startIdx, occupiedMinutes]);

  // Se duração = 1h, verificar se o segundo horário também está livre
  const secondSlotOccupied = useMemo(() => {
    if (duration !== 60) return false;
    const startMin = ALL_SLOTS_30[startIdx]?.minutes ?? 0;
    const secondMin = (startMin + 30) % 1440;
    return occupiedMinutes.has(secondMin);
  }, [startIdx, duration, occupiedMinutes]);

  const anySlotOccupied = startSlotOccupied || secondSlotOccupied;

  useEffect(() => {
    if (percentage >= 100 && !celebrated) setCelebrated(true);
  }, [percentage, celebrated]);  // ─── Seleccionar horário a partir da grelha ─────────────────────────────────────
  const selectFromGrid = useCallback((idx: number) => {
    setStartIdx(idx);
    // Se o próximo slot também está livre, sugerir 1 hora; caso contrário, 30 min
    const nextMin = (ALL_SLOTS_30[idx]?.minutes ?? 0) + 30;
    const nextMinNorm = nextMin % 1440;
    if (!occupiedMinutes.has(nextMinNorm)) {
      setDuration(60);
    } else {
      setDuration(30);
    }
    // Scroll suave até ao formulário e focar no campo nome
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => nameInputRef.current?.focus(), 400);
    }, 50);
  }, [occupiedMinutes]);  // ─── Mutações ───────────────────────────────────────────────────────────────
  const addMutation = trpc.prayer.add.useMutation({
    onSuccess: (data) => {
      // Guardar todos os tokens individuais (para 1h = 2 tokens)
      const tokens = (data as any).tokens as string[] | undefined;
      if (tokens) {
        tokens.forEach(t => saveLocalToken(t));
      } else {
        saveLocalToken(data.token);
      }
      setLocalTokens(getLocalTokens());
      setName("");
      setStartIdx(12);
      setDuration(30);
      refetch();
      toast.success("Horário registado com sucesso! 🙏");
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMutation = trpc.prayer.remove.useMutation({
    onSuccess: (_, { token }) => {
      // Encontrar todos os tokens do mesmo grupo para limpar do localStorage
      const slot = slots.find(s => s.token === token);
      const gt = slot?.groupToken ?? null;
      if (gt) {
        const groupTokens = slots.filter(s => s.groupToken === gt).map(s => s.token);
        groupTokens.forEach(t => removeLocalToken(t));
      } else {
        removeLocalToken(token);
      }
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
    if (startSlotOccupied) {
      toast.error("Este horário já está ocupado. Por favor escolha outro.");
      return;
    }
    if (duration === 60 && secondSlotOccupied) {
      toast.error("O segundo horário de 30 minutos está ocupado. Escolha outro horário ou reduza para 30 minutos.");
      return;
    }
    addMutation.mutate({ name: name.trim(), startMinutes, durationMinutes: duration });
  }, [name, startIdx, duration, addMutation, startSlotOccupied, secondSlotOccupied]);

  // Preview: calcula o fim com base na duração seleccionada
  const previewEnd = useMemo(() => {
    const s = ALL_SLOTS_30[startIdx]?.minutes ?? 0;
    return (s + duration) % 1440;
  }, [startIdx, duration]);

  // ─── Exportação CSV ──────────────────────────────────────────────────────────
  const exportCSV = useCallback(() => {
    const BOM = "\uFEFF";
    const header = "Nome,Início,Fim,Duração (min)\n";
    const rows = slots.map(s =>
      `"${s.name}",${minutesToTime(s.startMinutes)},${minutesToTime(s.endMinutes)},${slotDuration(s.startMinutes, s.endMinutes)}`
    ).join("\n");
    const footer = `\nTotal coberto,,,"${formatDuration(uniqueMinutes)}"`;
    const blob = new Blob([BOM + header + rows + footer], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "relogio-oracao-geraldo.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Ficheiro CSV exportado.");
  }, [slots, uniqueMinutes]);

  // ─── Contadores da grelha ───────────────────────────────────────────────────
  const occupiedCount = useMemo(() => ALL_SLOTS_30.filter(s => (occupancyMap.get(s.minutes) ?? []).length > 0).length, [occupancyMap]);
  const freeCount = 48 - occupiedCount;

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

        {/* ── Horários do Dia ─────────────────────────────────────────────── */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: "0.82rem", fontWeight: 700, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.07em" }}>
              📋 Horários do Dia
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

          {/* Dica de interacção */}
          {freeCount > 0 && (
            <div style={{
              fontSize: "0.78rem", color: C.primaryL, marginBottom: 12,
              background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)",
              borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 6,
            }}>
              <span>👆</span>
              <span>Toque num horário <strong>livre</strong> para o seleccionar automaticamente no formulário abaixo.</span>
            </div>
          )}

          {/* Lista com scroll */}
          <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4,
            scrollbarWidth: "thin", scrollbarColor: `${C.borderHi} ${C.surface2}` }}>
            {ALL_SLOTS_30.map((slot, i) => {
              const nextSlot = ALL_SLOTS_30[(i + 1) % 48];
              const endMinutes = nextSlot?.minutes ?? 0;
              const occupants = occupancyMap.get(slot.minutes) ?? [];
              const isOccupied = occupants.length > 0;
              const isSelected = startIdx === i && !isOccupied;
              return (
                <div
                  key={slot.minutes}
                  onClick={() => { if (!isOccupied) selectFromGrid(i); }}
                  role={isOccupied ? undefined : "button"}
                  tabIndex={isOccupied ? undefined : 0}
                  onKeyDown={e => { if (!isOccupied && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); selectFromGrid(i); } }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 12px", borderRadius: 8,
                    background: isSelected ? "rgba(99,102,241,0.15)" : isOccupied ? C.occupiedBg : C.freeBg,
                    border: `1.5px solid ${isSelected ? C.primary : isOccupied ? "rgba(34,197,94,0.25)" : "rgba(251,191,36,0.2)"}`,
                    cursor: isOccupied ? "default" : "pointer",
                    transition: "all 0.15s",
                    ...(isOccupied ? {} : { outline: "none" }),
                  }}
                >
                  {/* Indicador de cor */}
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    background: isSelected ? C.primary : isOccupied ? C.occupied : C.free,
                    boxShadow: isSelected ? `0 0 8px ${C.primary}` : isOccupied ? `0 0 6px ${C.occupied}` : `0 0 6px ${C.free}`,
                  }} />
                  {/* Horário */}
                  <span style={{
                    fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                    fontSize: "0.88rem", fontWeight: 700,
                    color: isSelected ? C.primaryL : isOccupied ? C.success : C.warning,
                    minWidth: 110, flexShrink: 0,
                  }}>
                    {slot.label} → {minutesToTime(endMinutes)}
                  </span>
                  {/* Nome ou "Disponível" */}
                  <span style={{
                    flex: 1, fontSize: "0.85rem",
                    color: isSelected ? C.primaryL : isOccupied ? C.textSec : C.muted,
                    fontWeight: isOccupied ? 600 : 400,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {isOccupied
                      ? occupants.map(o => o.name).join(", ")
                      : isSelected ? "✓ Seleccionado" : "Disponível"}
                  </span>
                  {/* Badge */}
                  <span style={{
                    flexShrink: 0, fontSize: "0.65rem", fontWeight: 700, padding: "2px 8px",
                    borderRadius: 99, textTransform: "uppercase", letterSpacing: "0.05em",
                    background: isSelected ? "rgba(99,102,241,0.2)" : isOccupied ? "rgba(34,197,94,0.15)" : "rgba(251,191,36,0.15)",
                    color: isSelected ? C.primaryL : isOccupied ? C.success : C.warning,
                    border: `1px solid ${isSelected ? "rgba(99,102,241,0.4)" : isOccupied ? "rgba(34,197,94,0.3)" : "rgba(251,191,36,0.3)"}`,
                  }}>
                    {isSelected ? "✓ Seleccionado" : isOccupied ? "Ocupado" : "Livre"}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Rodapé da grelha */}
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}`, display: "flex", gap: 16, flexWrap: "wrap", fontSize: "0.78rem", color: C.muted }}>
            <span><strong style={{ color: C.success }}>{occupiedCount}</strong> horários ocupados</span>
            <span><strong style={{ color: C.warning }}>{freeCount}</strong> horários livres</span>
            <span style={{ marginLeft: "auto", color: C.muted }}>{Math.round((occupiedCount / 48) * 100)}% do dia coberto</span>
          </div>
        </div>

        {/* ── Formulário ──────────────────────────────────────────────────── */}
        <div ref={formRef} style={{ background: C.surface, border: `1px solid ${C.borderHi}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
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
                ref={nameInputRef}
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

            {/* Selector de horário */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: C.textSec, marginBottom: 8 }}>
                Horário de Oração
              </label>
              <select
                value={startIdx}
                onChange={e => setStartIdx(Number(e.target.value))}
                style={{
                  width: "100%", background: C.surface2,
                  border: `1.5px solid ${startSlotOccupied ? C.danger : C.borderHi}`, borderRadius: 8,
                  color: C.text, fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                  fontSize: "1.05rem", fontWeight: 700, padding: "14px 16px",
                  outline: "none", cursor: "pointer", WebkitAppearance: "none",
                  appearance: "none", boxSizing: "border-box",
                }}
                onFocus={e => { e.target.style.borderColor = startSlotOccupied ? C.danger : C.blue; e.target.style.boxShadow = `0 0 0 3px ${startSlotOccupied ? "rgba(248,113,113,0.2)" : "rgba(96,165,250,0.2)"}`; }}
                onBlur={e => { e.target.style.borderColor = startSlotOccupied ? C.danger : C.borderHi; e.target.style.boxShadow = "none"; }}
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

            {/* Selector de duração */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: C.textSec, marginBottom: 8 }}>
                Duração da Oração
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button type="button" onClick={() => setDuration(30)} style={{
                  padding: "12px 16px", borderRadius: 8, cursor: "pointer",
                  fontFamily: "'Inter', sans-serif", fontSize: "0.95rem", fontWeight: 700,
                  transition: "all 0.15s", border: `2px solid ${duration === 30 ? C.primary : C.borderHi}`,
                  background: duration === 30 ? "rgba(99,102,241,0.15)" : C.surface2,
                  color: duration === 30 ? C.primaryL : C.textSec,
                }}>
                  🕐 30 minutos
                </button>
                <button type="button" onClick={() => setDuration(60)} style={{
                  padding: "12px 16px", borderRadius: 8, cursor: "pointer",
                  fontFamily: "'Inter', sans-serif", fontSize: "0.95rem", fontWeight: 700,
                  transition: "all 0.15s", border: `2px solid ${duration === 60 ? C.primary : C.borderHi}`,
                  background: duration === 60 ? "rgba(99,102,241,0.15)" : C.surface2,
                  color: duration === 60 ? C.primaryL : C.textSec,
                }}>
                  🕐 1 hora
                </button>
              </div>
            </div>

            {/* Aviso de horário ocupado */}
            {anySlotOccupied && (
              <div style={{
                background: "rgba(248,113,113,0.12)", border: `1.5px solid ${C.danger}`,
                borderRadius: 8, padding: "10px 14px", marginBottom: 12,
                fontSize: "0.82rem", color: C.danger, display: "flex", alignItems: "center", gap: 8,
              }}>
                <span>⚠️</span>
                <span>
                  {startSlotOccupied
                    ? "Este horário já está ocupado. Por favor escolha outro."
                    : `O horário seguinte (${minutesToTime((ALL_SLOTS_30[startIdx]?.minutes ?? 0) + 30)}) já está ocupado. Escolha outro horário ou reduza para 30 minutos.`
                  }
                </span>
              </div>
            )}

            {/* Preview automático */}
            {!anySlotOccupied && (
              <div style={{
                display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                background: C.successBg, border: `1px solid ${C.success}`,
                borderRadius: 8, padding: "10px 14px", marginBottom: 16,
              }}>
                <span style={{ fontSize: "0.85rem", color: C.muted }}>O seu horário:</span>
                <span style={{ fontSize: "1rem", fontWeight: 700, color: C.success, fontFamily: "'JetBrains Mono', monospace" }}>
                  {ALL_SLOTS_30[startIdx]?.label} → {minutesToTime(previewEnd)}
                </span>
                <span style={{ marginLeft: "auto", fontSize: "0.8rem", fontWeight: 600, color: C.success }}>{duration === 30 ? "30 minutos" : "1 hora"}</span>
              </div>
            )}

            {/* Botão */}
            <button
              type="submit" disabled={addMutation.isPending || anySlotOccupied}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                background: (addMutation.isPending || anySlotOccupied) ? C.border : C.primary,
                color: "#fff", border: "none", borderRadius: 10,
                cursor: (addMutation.isPending || anySlotOccupied) ? "not-allowed" : "pointer",
                fontFamily: "'Inter', sans-serif", fontSize: "1rem", fontWeight: 700,
                padding: "14px 24px", width: "100%", transition: "all 0.15s",
                letterSpacing: "0.02em",
              }}
              onMouseEnter={e => { if (!addMutation.isPending && !anySlotOccupied) (e.currentTarget as HTMLButtonElement).style.background = "#4f46e5"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = (addMutation.isPending || anySlotOccupied) ? C.border : C.primary; }}>
              {addMutation.isPending ? "⏳ A registar..." : "🙏 Registar o Meu Horário"}
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
              {uniqueParticipantCount} participante{uniqueParticipantCount !== 1 ? "s" : ""}
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
                {(() => {
                  // Agrupar registos com o mesmo groupToken
                  const grouped: { name: string; startMinutes: number; endMinutes: number; token: string; tokens: string[]; id: number; groupToken: string | null }[] = [];
                  const seen = new Set<string>();
                  for (const slot of slots) {
                    const gt = slot.groupToken ?? null;
                    if (gt && seen.has(gt)) continue;
                    if (gt) seen.add(gt);
                    // Encontrar todos os registos do mesmo grupo
                    const groupSlots = gt ? slots.filter(s => s.groupToken === gt).sort((a, b) => a.startMinutes - b.startMinutes) : [slot];
                    const first = groupSlots[0]!;
                    const last = groupSlots[groupSlots.length - 1]!;
                    grouped.push({
                      name: first.name,
                      startMinutes: first.startMinutes,
                      endMinutes: last.endMinutes,
                      token: first.token,
                      tokens: groupSlots.map(s => s.token),
                      id: first.id,
                      groupToken: gt,
                    });
                  }
                  return grouped.map((entry, i) => {
                    const isOwn = entry.tokens.some(t => localTokens.includes(t));
                    const dur = slotDuration(entry.startMinutes, entry.endMinutes);
                    return (
                      <div key={entry.id} style={{
                        background: isOwn ? "rgba(99,102,241,0.08)" : C.surface2,
                        border: `1px solid ${isOwn ? "rgba(99,102,241,0.35)" : C.border}`,
                        borderRadius: 10, padding: "14px 16px",
                      }}>
                        {/* Linha 1: Número + Nome + Botão */}
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                          <span style={{
                            flexShrink: 0, width: 28, height: 28, marginTop: 1,
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            borderRadius: "50%", background: "rgba(99,102,241,0.18)",
                            fontSize: "0.72rem", fontWeight: 700, color: C.primaryL,
                          }}>{i + 1}</span>
                          <span style={{ flex: 1, fontWeight: 700, fontSize: "1.05rem", color: C.text, wordBreak: "break-word", lineHeight: 1.3 }}>
                            {entry.name}
                            {isOwn && (
                              <span style={{ marginLeft: 8, fontSize: "0.65rem", padding: "2px 7px", borderRadius: 99, background: "rgba(99,102,241,0.2)", color: C.primaryL, border: "1px solid rgba(99,102,241,0.35)", verticalAlign: "middle" }}>
                                você
                              </span>
                            )}
                          </span>
                          {isOwn && (
                            <button
                              onClick={() => { setRemoving(entry.token); removeMutation.mutate({ token: entry.token }); }}
                              disabled={removing === entry.token}
                              style={{
                                flexShrink: 0, background: "rgba(248,113,113,0.1)",
                                border: "1px solid rgba(248,113,113,0.3)", borderRadius: 8,
                                cursor: "pointer", color: C.danger, padding: "6px 10px",
                                fontSize: "0.78rem", fontWeight: 600, transition: "all 0.15s",
                                display: "inline-flex", alignItems: "center", gap: 4,
                                opacity: removing === entry.token ? 0.5 : 1, whiteSpace: "nowrap",
                              }}>
                              🗑️ Remover
                            </button>
                          )}
                        </div>

                        {/* Linha 2: Horários + Duração */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.25)", borderRadius: 8, padding: "6px 12px" }}>
                            <span style={{ fontSize: "0.65rem", color: C.muted, textTransform: "uppercase" }}>Início</span>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1rem", fontWeight: 700, color: C.blue }}>{minutesToTime(entry.startMinutes)}</span>
                          </div>
                          <span style={{ color: C.muted }}>→</span>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(192,132,252,0.1)", border: "1px solid rgba(192,132,252,0.25)", borderRadius: 8, padding: "6px 12px" }}>
                            <span style={{ fontSize: "0.65rem", color: C.muted, textTransform: "uppercase" }}>Fim</span>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "1rem", fontWeight: 700, color: C.violet }}>{minutesToTime(entry.endMinutes)}</span>
                          </div>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", borderRadius: 8, padding: "6px 10px" }}>
                            <span style={{ fontSize: "0.85rem", fontWeight: 700, color: C.success }}>⏱ {formatDuration(dur)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Rodapé — apenas total coberto */}
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
                <div style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 8, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: "0.65rem", color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, fontWeight: 700 }}>Total coberto</div>
                    <div style={{ fontSize: "1rem", fontWeight: 700, color: C.success }}>{formatDuration(uniqueMinutes)}</div>
                  </div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 700, color: C.success }}>{percentage}% das 24h</div>
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
