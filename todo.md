# Relógio de Oração — Todo

## Backend
- [x] Schema Drizzle: tabela `prayer_slots` com id, name, startTime, endTime, token, createdAt
- [x] Migração SQL aplicada via drizzle-kit migrate
- [x] Helper db.ts: listar, inserir, remover por token
- [x] tRPC router: `prayer.list`, `prayer.add`, `prayer.remove`
- [x] Lógica de cálculo: duração por participante, minutos únicos cobertos, tempo restante
- [x] Exportação CSV com BOM UTF-8

## Frontend
- [x] Design system dark mode: cores, tipografia (Playfair Display + Inter), espaçamento
- [x] index.css: variáveis CSS dark mode elegante
- [x] Página Home.tsx: landing page pública sem login
- [x] Formulário de registo: nome, hora início, hora fim, token local (localStorage)
- [x] Cartões de resumo: participantes, horas cobertas, restante, percentagem
- [x] Barra de progresso 24h com marcadores às 6h, 12h, 18h
- [x] Mapa de cobertura: gráfico de barras por hora (Recharts)
- [x] Lista de intercessores com botão de remoção (por token)
- [x] Exportação CSV
- [x] Banner de celebração ao atingir 100% de cobertura
- [x] Versículo Tiago 5:16 visível na interface
- [x] Design responsivo mobile-first
- [x] Polling automático a cada 30s para actualizar dados em tempo real

## Qualidade
- [x] Testes Vitest para lógica de cálculo de cobertura (34 testes passados)
- [x] Checkpoint final
- [x] Push para repositório GitHub brasilcosmeticos/relogio-de-oracao

## Alterações
- [ ] Alterar tema de dark mode para light mode elegante
- [x] Replicar layout original: dark mode azul/índigo, hero com animação, cards coloridos, formulário em linha, mapa de barras customizado, tabela com mini-barras
- [ ] Validar visualmente a página e corrigir responsividade do formulário em linha
- [ ] Guardar checkpoint após validação final
