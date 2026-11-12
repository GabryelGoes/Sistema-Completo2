# Proposta — Redesign visual do módulo Estoque (desktop/PC)

**Escopo:** hub modal **Estoque** (peças + ABS), **somente desktop/PC**.  
**Skills:** `ui-ux-pro-max` + `apple-design`.  
**Constraint absoluto:** preservar **exatamente** as cores atuais do Estoque (`#0F7A4B`, emerald/zinc existentes, badges de status).  
**Status:** planejamento — **sem alteração de código da aplicação nesta etapa**.

---

## 0. Encerramento do Pátio (OS Desktop)

| Item | Status |
|---|---|
| Fases 1–8 | Integradas em `main` (#160–#175) |
| Homologação funcional | Confirmada pelo usuário |
| Novas mudanças no Pátio nesta tarefa | **Nenhuma** |

### Riscos / pendências residuais conhecidos (sem inventar)
- Ambiente de Cloud Agent sem Supabase: regressão visual completa da OS com dados reais não foi revalidada na Fase 8 neste VM.
- Focus trap / retorno de foco completo nos modais secundários da OS ficou documentado como residual (não implementado de propósito).
- `content-visibility` em listas longas (orçamentos/lab) pode causar salto leve de scrollbar em listas atípicas.
- Integrações compartilhadas Estoque↔OS (checkout, scan, senha) continuam acopladas — mudanças futuras no Estoque devem isolar o hub e não regressar o Pátio.

---

## 1. Design system alvo (síntese dual-skill)

### ui-ux-pro-max
| Diretriz | Ajuste Rei do ABS / Estoque |
|---|---|
| Flat / denso operacional | Adequado a oficina: hierarquia clara, uma tarefa por região |
| Paleta slate + verde sugerida pela skill | **Descartada para substituição** — lock nas cores já usadas: `#0F7A4B`, emerald Tailwind, zinc, badges |
| Tabelas densas + busca forte | Reforçar toolbar sticky, filtros e empty states |
| Feedback de submit / focus | Press + focus-visible; sem atraso artificial |

### apple-design
| Padrão | Uso no Estoque desktop |
|---|---|
| Response (press) | CTAs, linhas da tabela, KPIs clicáveis |
| Materials discretos | Chrome sticky leve; sem glass excessivo |
| Spatial consistency | Open/close simétricos nos nested modais |
| Reduced motion | Obrigatório em animações novas |
| Depth | Elevação sutil em sheets secundários; scrim só em tarefas bloqueantes |

### Tokens a preservar (não redesignar)
- Accent shell desktop: `#0F7A4B` (`desktopShellOverlayModules`)
- CTA primário: `#0F7A4B` / hover `#0c6a41`
- Superfície lista: `#F4F5F7` (sticky chrome dashboard)
- Status: emerald / amber / red já usados nos badges e alertas
- Tipografia: SF Pro / stacks já do app (não trocar por Cormorant/Inter da skill)

---

## 2. A. Inventário — páginas / superfícies principais

Gate de abertura: `App.tsx` → `WorkshopPartsModal` (Home tile `parts_stock` / sidebar `estoque_pecas`). **Não há rota `/estoque` nem `TabId`.**

| Superfície | Arquivo | Papel |
|---|---|---|
| Shell Estoque | `WorkshopPartsModal.tsx` | Modal fullscreen; orquestra tudo |
| Dashboard peças | `WorkshopPartsHomeDashboard.tsx` | KPIs, busca, filtros, tabela/lista |
| Analytics peças | `WorkshopPartsAnalyticsView.tsx` | Gráficos / períodos |
| Cadastro / edição | `WorkshopPartRegistrationForm.tsx` | Form completo |
| Ficha produto | `WorkshopPartDetailView.tsx` | Detalhe + print/Niimbot |
| Scan hub | `WorkshopPartScanHubModal.tsx` | USB/câmera roteador |
| Entrada | `WorkshopPartStockInboundModal.tsx` | Recebimento |
| Saída | `WorkshopPartStockOutboundModal.tsx` | Venda/consumo + OS |
| Ledger | `WorkshopEstoqueLedgerModal.tsx` | Histórico unificado |
| Fornecedores | `WorkshopSuppliersModal.tsx` | CRUD |
| ABS home | `WorkshopAbsModulesHomeDashboard.tsx` | KPIs/lista ABS |
| ABS CRUD | `WorkshopAbsModulesModal.tsx` | Fluxo ABS completo |
| ABS analytics / hist / sales / desmontagem | `WorkshopAbsModulesAnalyticsView.tsx`, `AbsModulesGlobalMovementsModal.tsx`, `AbsModulesSalesHistoryModal.tsx`, `AbsDisassemblyDetailModal.tsx` | Overlays ABS |

---

## 3. B. Inventário — modais / overlays secundários

```
WorkshopPartsModal
├── Registration / Detail (RegistrationPortal)
│   ├── Categorias
│   ├── TechnicianPhotoEditorModal
│   ├── BarcodeScanner
│   └── NiimbotLabelPrintModal (+ print sheet)
├── ScanHub → Inbound | Outbound | Create | ABS
├── Ledger → Suppliers
├── StockGuardPasswordModal
└── AbsHome
    ├── WorkshopAbsModulesModal (+ createPortal popovers)
    ├── Movements / Sales / Disassembly
    └── NiimbotAbsModuleLabelPrintModal
```

**Compartilhados (alto risco se alterados globalmente):**  
`StockGuardPasswordModal`, `BarcodeScanner` / `BarcodeScanField`, `NiimbotBleConnectControls`, `WorkshopPartDetailView` (também orçamento), `PartPhotoImg`, wedge USB (`useBarcodeWedgeListener`).

---

## 4. Existente × não encontrado / futuro

### Existente no código
CRUD peças; fotos; categorias; compras; fornecedores; entrada; saída com vínculo OS; ledger; USB + câmera; Niimbot peças/ABS; Modo Balanço + senha; analytics; reservas pendentes de orçamento; ABS (cadastro, movimentos, vendas, desmontagem); RDA lab-estoque intel (painel separado).

### Não encontrado (não inventar na Fase 1)
- Rota dedicada `/estoque`
- Permissões finas `canEditStock` / `canDeletePart` (só acesso ao módulo + senha)
- `partsBootIntent` ativo (tipos existem; sem producers)
- CSS dedicado do Estoque
- App mobile separado (só responsivo no mesmo hub)

---

## 5. C. Problemas reais de usabilidade (evidência no código)

1. **Aninhamento profundo de portais** (`ModalPortal` + `RegistrationPortal` + `createPortal`) — foco/voltar frágeis.
2. **Tabela 8 colunas densas** no desktop + edição inline — scan path cansativo.
3. **ABS como “app dentro do app”** (`absModulesOpen`) — modelo mental confuso; USB bloqueado no ABS.
4. **Outbound monolítico** — venda/consumo + barcode + OS + histórico num único sheet.
5. **Dois hosts** (App lazy + fallback Home) — risco de estado divergente.
6. **bootIntent morto** — deep-link de scanner externo não wired.
7. **Sem CSS isolado desktop** — qualquer polish vaza fácil para mobile/tablet se não houver gate.
8. **Empty states mínimos** — lista vazia existe; onboarding operacional fraco.

---

## 6. D. Proposta de redesign (cores intactas)

### Direção
- **Um chrome desktop** sticky: título ESTOQUE + busca dominante + ações primárias (`Ler código`, `Adicionar`, `Histórico`) alinhadas ao verde `#0F7A4B`.
- **KPIs em faixa única** (não card farm): Em estoque / Zerados / Baixos / Valor — densos, clicáveis como filtros.
- **Lista/tabela com hierarquia**: foto + nome + código como âncora; estoque/preço/status como meta; ações no hover/focus.
- **Painel de detalhe** (sheet) com seções claras: Identificação · Estoque · Compras · Fotos · Etiqueta — sem redesenhar campos.
- **ABS** como seção/aba do hub (não swap total opaco) — mesmo shell, contexto visível.
- **Motion Apple**: open/close simétrico dos sheets; press 100ms; reduced-motion.

### Explicitamente fora
Troca de paleta; remoção de campos/botões; mudança de regras de senha/baixa/Niimbot; mudanças no Pátio.

---

## 7. F. Plano fasado (pequeno e reversível)

| Fase | Escopo | Gate isolamento | Risco |
|---|---|---|---|
| **E0** | Inventário + CSS scaffold `estoque-desktop.css` + flag `isEstoquePcLayout` | Desktop shell only | Baixo |
| **E1** | Shell + dashboard (KPIs, busca, filtros, lista) | Classes `estoque-pc-*` | Médio |
| **E2** | Ficha + cadastro/edição (layout) | Nested portal PC | Médio–alto |
| **E3** | Scan hub + entrada/saída (organização visual) | Sem mudar API | Alto |
| **E4** | Ledger + fornecedores + categorias | Sheets | Médio |
| **E5** | ABS home + overlays (chrome) | Isolar do swap total | Alto |
| **E6** | Etiquetas/Niimbot chrome (não BLE logic) | Shared Niimbot UI com cuidado | Alto |
| **E7** | Auditoria a11y/motion/perf + regressão | Como Fase 8 do Pátio | Médio |

Cada fase: branch `cursor/estoque-desktop-phaseN-*-e087` → PR → homologação → merge. **Não avançar sem aprovação.**

---

## 8. G. Arquivos envolvidos / riscos / dependências

### Prováveis (implementação futura)
`WorkshopPartsModal.tsx`, `WorkshopPartsHomeDashboard.tsx`, forms/detail/scan/inbound/outbound/ledger/suppliers, ABS dashboard/modal, novo `styles/estoque-desktop.css`, gate em `App.tsx` / desktop shell.

### Não tocar sem isolamento comprovado
`BarcodeScanner`, `StockGuardPasswordModal` (também Pátio), `NiimbotBleConnectControls`, `WorkshopPartDetailView` quando aberto do orçamento, APIs/`apiService`, migrations.

### Dependências
Desktop shell overlay já marca accent `#0F7A4B`; permissão `access_estoque_pecas`; senha stock guard; BLE Niimbot no browser.

---

## 9. H. Critérios de aceitação / testes por fase

### Aceitação geral
- Cores hex/Tailwind de status e CTAs **bit-a-bit** iguais
- Tablet/mobile sem regressão visual (assert CSS gate)
- Nenhuma remoção de campo/botão/fluxo
- Lint/tsc + selftests relevantes (barcode/Niimbot/estoque se existirem)
- Homologação humana no desktop com dados reais

### Por fase (smoke)
- E1: abrir Estoque, filtrar, ordenar, abrir ficha, Modo Balanço UI
- E2: criar/editar (com senha), fotos, categorias
- E3: scan USB/câmera, entrada, saída com OS fictícia
- E4: ledger filtros, fornecedores CRUD
- E5: ABS listar/abrir/voltar ao hub
- E6: preview etiqueta (sem exigir impressora física se BLE indisponível — documentar)
- E7: teclado, Escape, reduced-motion, performance lista longa

---

## 10. I. Funcionalidades futuras (fora deste redesign)

- Rota deep-link `/estoque` + `partsBootIntent` wired
- Permissões granulares de estoque
- App estoque separado / PWA
- Mudanças de schema ou regras de reserva

---

## Próximo passo

Aguardar **aprovação deste plano**. Só então iniciar **E0/E1** em branch exclusiva, sem alterar o Pátio.
