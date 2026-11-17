# Pátio smartphone — baseline de desempenho (PR-A)

**Projeto:** GabryelGoes/Sistema-Completo2  
**Escopo:** quadro do Pátio em `isSmartphone`  
**Fases:** PR-A (instrumentação + protocolo) · PR-B (CSS leve)  
**Não inclui:** redesign de modais OS/tablet/desktop · memoização · virtualização · DnD · polls

---

## 1. Objetivo

Registrar um protocolo reproduzível e, quando possível, medições **antes** das otimizações.  
Números de FPS / traces em iPhone ou Android **reais** ficam **pendentes** até coleta em dispositivo — este ambiente de agente **não** inventa resultados de hardware.

---

## 2. Como ativar a instrumentação (somente DEV)

Pré-requisito: build/dev Vite (`import.meta.env.DEV`).

1. `localStorage.setItem('patio_perf_dev', '1')` e recarregar, **ou**
2. Abrir o app com `?patioPerf=1`.

Eventos vão para `console.info('[patio-perf]', …)` via [`utils/patioSmartphonePerfDev.ts`](../../utils/patioSmartphonePerfDev.ts).

**Nunca** loga placa, nome de cliente, token ou id de OS — só contagens e marcas genéricas (`enter`, `board_commit`, `open_os`, `close_os`, `longtask`).

Desligar: `localStorage.removeItem('patio_perf_dev')` e remover a query.

---

## 3. Protocolo de testes reproduzíveis

Use a mesma conta de **staging / dados fictícios**. Anote: navegador, SO, PWA sim/não, orientação, modo do quadro (`grade` / `trello` / `mecânico` / `recentes`), **número de cards** visíveis.

### T1 — Entrada no Pátio

1. Com o app na Home, abrir o módulo Pátio.  
2. Marcar tempo até o primeiro quadro interativo (scroll responde).  
3. Registrar `cardCount` (badge/contagem do cabeçalho).  
4. Dev: observar `[patio-perf] enter` e primeiros `board_commit`.

### T2 — Rolagem vertical (grade)

1. Modo grade / recentes.  
2. Scroll contínuo por ~10 s.  
3. Anotar jank subjetiva (0–5) e, se houver, 1% low FPS (ferramenta nativa).

### T3 — Rolagem horizontal (Trello / por mecânico)

1. Ativar colunas horizontais.  
2. Pan horizontal por ~10 s.  
3. Anotar conflito scroll vs toque em cards (sem forçar DnD nesta fase).

### T4 — Abertura e fechamento da OS

1. Abrir um card → modal OS.  
2. Fechar.  
3. Repetir 5×.  
4. Anotar hitch ao **fechar** (remount do board — hipótese H1 da auditoria).  
5. Dev: `open_os` / `close_os`.

### T5 — Movimentação de cards

1. Em Trello (se permitido pela conta), arrastar um card entre colunas.  
2. Anotar fluidez do ghost e se o scroll “prende”.  
3. **PR-A/B não alteram DnD** — só baseline.

### T6 — Atualizações automáticas com quadro aberto

1. Deixar o quadro idle 60–90 s em primeiro plano.  
2. Observar hitch periódico (polls/Realtime).  
3. Dev: entradas `longtask` se o browser expuser `PerformanceObserver` `longtask` (Chrome; Safari costuma **não**).

### Matriz de runtimes

| Runtime | T1–T6 | Status baseline |
| --- | --- | --- |
| Safari iPhone | | **Pendente** (sem dispositivo neste agente) |
| PWA iOS | | **Pendente** |
| Chrome Android | | **Pendente** |
| Chrome desktop emulado (device mode) | opcional smoke | Opcional — não substitui device real |
| Tablet controle | regressão visual/funcional | Após PR-B |
| Desktop shell | regressão | Após PR-B |

---

## 4. O que medir (quando houver device)

| Métrica | Como | Antes (PR-A) | Depois (PR-B+) |
| --- | --- | --- | --- |
| N cards no teste | UI | _pendente_ | |
| FPS médio / 1% low no scroll | Instruments / GPU | _pendente_ | |
| Tempo até scroll após fechar OS | Performance / stopwatch | _pendente_ | |
| Long tasks ≥50 ms / min | PerformanceObserver | _pendente_ / DevTools | |
| Requests/min idle | Network | _pendente_ | |
| Commits React do board | Profiler + logs DEV | _pendente_ | |

Preencher esta tabela **somente** com dados reais coletados; não inventar FPS.

---

## 5. Hipóteses vs melhorias verificadas

### Hipóteses (ainda não medidas em device)

- Remount do board ao fechar OS é o long-task dominante no phone.  
- `backdrop-blur` + `zoom`/`will-change` dominam composite no Safari.  
- Polls (8s/15s) causam hitch visível mesmo sem mudança de dados.

### Melhorias verificadas em código (PR-B)

Implementado **somente** quando `isSmartphone` (tablet/desktop inalterados):

- Blurs decorativos de página desligados.
- Colunas Trello/mecânico com fundo opaco (`opaquePaint`) — sem `backdrop-blur-md`.
- Cards dark com fundo opaco (`dark:bg-zinc-900`).
- Mantém `zoom` (densidade); remove `will-change-[zoom]`, transição de zoom e `perspective-[1400px]`.
- Transições de card mais curtas + `motion-reduce:*`; fade-in de entrada 200ms.

**Impacto em FPS / jank em device real:** ainda **pendente** (T1–T6).

### Correção follow-up (scroll / abrir-fechar OS)

- Board no smartphone permanece montado (`display: none`) com OS aberta — evita remount ao fechar.
- Sticky da etapa: histerese + compensação de `scrollTop` + sem transição de padding no phone.
- `startTransition` ao abrir/fechar card no phone.
- Modal scroll: `overscroll-behavior-y: contain` em viewport ≤767px.

---

## 6. Checklist de regressão (obrigatório a cada PR)

- [ ] Modos de visualização do quadro intactos (grade, recentes, Trello, mecânico).  
- [ ] Abrir/fechar OS.  
- [ ] Scroll vertical e horizontal.  
- [ ] Ações dos cards (abrir, badges).  
- [ ] Retrato e paisagem.  
- [ ] Tablet e desktop **sem** mudança visual intencional.  
- [ ] `npm run lint` (tsc).  
- [ ] Sem PII em logs.

---

## 7. Referências

- Auditoria: plano aprovado (PR-A/PR-B).  
- Código: `components/views/PatioView.tsx`, `utils/patioBoardGlassCard.ts`, `hooks/usePatioBoardLiveSync.ts`.  
- Skills: apple-design (latência antes de motion), ui-ux-pro-max (gestos/reduced-motion).
