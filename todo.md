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
- [x] Alterar tema de dark mode para light mode elegante (revertido — utilizador pediu layout original dark)
- [x] Replicar layout original: dark mode azul/índigo, hero com animação, cards coloridos, formulário em linha, mapa de barras customizado, tabela com mini-barras
- [x] Validar visualmente a página e corrigir responsividade do formulário em linha
- [x] Guardar checkpoint após validação final (version: 2b7fc28c)
- [x] Redesenhar lista de intercessores: substituir tabela por cartões mobile-first com nome, horários, duração e botão de remoção claramente visíveis

## Reformulação de Layout (v2)
- [x] Melhorar contraste: texto branco/claro bem definido sobre fundo escuro, sem mistura com background
- [x] Formulário: substituir inputs de hora livres por selectores dropdown de 30 em 30 minutos (48 opções)
- [x] Backend: validar no servidor que não há sobreposição de horários ao registar
- [x] Nova grelha de 48 slots entre o progresso das 24h e o formulário: verde=ocupado (com nome), laranja=livre, com scroll
- [x] Formulário reformulado: layout mais limpo, campos bem visíveis, sem campos de hora redundantes
- [x] Testes Vitest actualizados: 44 testes passados (100% pass rate)

## Correcções Pendentes (v2.1)
-- [x] Corrigir rodé da grelha: mostrar contagem real de slots ocupados (não participantes únicos))
- [x] Adicionar testes tRPC para prayer.add: 48 testes passados (100% pass rate)

## Correcção de Sobreposição (v2.2)
- [x] Corrigir lógica: cada slot de 30min só pode ter UM intercessor; bloquear no formulário os slots já ocupados (dropdown só mostra slots livres como início/fim)
- [x] Grelha: slots ocupados marcados com ❌ no dropdown de início; aviso visual de conflito ao seleccionar intervalo com slots ocupados

## Simplificação do Formulário (v2.3)
- [x] Remover selector de hora de término — o fim é sempre início + 30 minutos (calculado automaticamente)
- [x] Actualizar preview para mostrar apenas "06:00 → 06:30 (30 minutos)" com borda verde
- [x] Actualizar validação: apenas verificar se o slot de início está livre; aviso vermelho se ocupado

## Melhorias UX e Revisão Geral (v2.4)
- [x] Toque/clique no horário livre na grelha → preenche automaticamente o formulário com esse horário, scroll até ao formulário
- [x] Remover o termo "slot" de toda a interface — substituir por "horário", "período" ou equivalente natural
- [x] Remover "Total Bruto" (desnecessário sem sobreposição) — manter apenas o total único
- [x] Corrigir título da grelha: remover "48 SLOTS DE 30 MIN"
- [x] Corrigir rodapé da grelha: texto limpo sem "slots"
- [x] Revisão geral de textos, labels e elementos desnecessários ou quebrados

## Selector de Duração (v2.5)
- [x] Adicionar selector de duração no formulário: 30 minutos ou 1 hora
- [x] Se 1 hora: registar 2 horários consecutivos de 30min com o mesmo nome e groupToken
- [x] Validar que ambos os horários estão livres antes de registar (aviso se algum estiver ocupado)
- [x] Actualizar backend para aceitar durationMinutes (30 ou 60) numa única chamada
- [x] Adicionar coluna groupToken à tabela prayer_slots na base de dados
- [x] Remoção em grupo: ao remover um registo, apagar todos os registos com o mesmo groupToken
- [x] Auto-fill da grelha: ao tocar num horário livre, sugerir 1h se o próximo também está livre
- [x] Lista de intercessores agrupada: registos com o mesmo groupToken mostrados como uma única entrada
- [x] Contagem de participantes únicos (agrupados por groupToken)
- [x] Testes Vitest actualizados: 50 testes passados (100% pass rate)

## Auditoria de Segurança (v3.0)
- [x] Análise completa de código-fonte: XSS, injeção SQL, CSRF, validação de entrada
- [x] Auditoria de autenticação e autorização: OAuth, JWT, proteção de endpoints
- [x] Verificar proteções contra DDoS: rate limiting, timeouts, validação de requisições
- [x] Análise de dependências: procurar pacotes vulneráveis
- [x] Implementar rate limiting no backend (express-rate-limit)
- [x] Implementar headers de segurança (helmet)
- [x] Sanitização de entrada no backend (nome, tokens)
- [x] Proteger contra enumeração de tokens
- [x] Limitar tamanho de payload nas requisições
- [x] Adicionar CORS restritivo
- [x] Testes de segurança com Vitest (16 testes passados)
- [x] Actualizar axios para v1.15.0 (corrigir 2 vulnerabilidades CRÍTICAS)
- [x] Remover stack traces em produção (onError handler tRPC)
- [x] Relatório final de segurança
- [x] Remover token/groupToken da resposta pública de prayer.list (expor flag isMine + groupId)
- [x] Substituir CORS origin:true por allowlist explícita (regex: manus.space, manus.computer, localhost)
- [x] Implementar errorFormatter tRPC para remover stacks em produção
- [x] Criar relatório final de segurança no projecto (SECURITY_REPORT.md)

## Limpeza de Testes (v3.1)
- [x] Verificar e limpar dados de teste residuais na BD (nenhum resíduo encontrado)
- [x] Ajustar testes Vitest para não escrever no BD real (vi.mock de todo o módulo db.ts)
- [x] 76 testes passados (26 de segurança com mock, 49 prayerCalc, 1 auth)
