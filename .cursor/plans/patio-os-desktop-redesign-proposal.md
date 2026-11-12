# Proposta — Redesign visual OS Desktop (Pátio)

**Escopo:** página/modal de OS dos veículos no Pátio, **somente desktop/PC**.  
**Skills:** `ui-ux-pro-max` (estrutura, IA, hierarquia, formulários, navegação) + `apple-design` (materiais, profundidade, feedback, motion).  
**Marca:** Rei do ABS — amarelo `#F5D00B` / preto / branco.  
**Constraint:** preservar funcionalidades, dados, permissões, regras e integrações; **não** alterar tablet/mobile.  
**Status:** planejamento — **sem alteração de código da aplicação**.

---

## 1. Design system alvo (síntese dual-skill)

### ui-ux-pro-max
| Diretriz gerada | Ajuste Rei do ABS |
|---|---|
| Estilo Minimalism / Swiss | Mantido: densidade ERP, uma tarefa por bloco |
| Paleta navy/azul + Inter | **Descartada** — brand lock amarelo/preto/branco; tipografia continua SF Pro já no app |
| Cards com borda e underline azul | Substituir por superfície limpa + aba/segmento de marca |
| Formulários densos com labels claras | Manter campos; melhorar agrupamento e scan path |

### apple-design
| Token / padrão | Uso na OS desktop |
|---|---|
| Materials (blur / translucency **restrita**) | Header sticky + aside flutuante |
| Depth (fade de scroll, elevação sutil) | Separar chrome vs conteúdo sem “glass” excessivo |
| Press (`scale` ~0.97–0.98) | CTAs, chips de meta, tabs |
| Transições simétricas | Troca de aba, open/close de painéis/modais secundários |
| Vocabulário já no repo | Reutilizar motion Apple do modal pilot / app-wide (#157) |

### Tokens propostos (desktop only)
- `--patio-os-brand: #F5D00B`
- `--patio-os-ink: #0A0A0A`
- `--patio-os-paper: #ECECEE → #F7F7F8` (gradiente atmosférico leve)
- `--patio-os-surface: rgba(255,255,255,.72)` + blur 16–20px no chrome
- Tabs ativas: fundo preto + texto amarelo (substituir `#007AFF` underline)
- Radius: 14–18px em cards/aside; pills 999 em tabs/status
- Focus: anel amarelo/preto (não azul genérico)

---

## 2. Inventário — shell e abas PC

Gate: `isPatioPcModal` · layout `getPatioVehicleModalLayout` (desktop) · tab bar `PatioOsModalPcTabBar`.

| Aba PC | Conteúdo principal | Notas |
|---|---|---|
| **Dados** | Veículo, cliente, KM, entrada, técnico; Queixa; Observações; Autorização de diagnóstico (auth) | Diagnóstico/Serviços/Peças também aparecem no fluxo de orçamento |
| **Orçamentos** | Lista + criar/editar/visualizar orçamento; linhas de serviços/peças; aprovação | Modais secundários densos |
| **Arquivos** | Fotos, PDFs, anexos, câmera, lightbox | Hoje pouco “galeria”; proposta: mídia recente no Dados + Arquivos reforçado |
| **Manutenções** (`historico`) | Histórico de manutenções / OS | Somente leitura + navegação |
| **Conserto externo** (`conserto_externo`) | Fluxo de conserto externo | Pode ser omitida via `hiddenTabs` |
| **Serviços Laboratório** (`laboratorio`) | Pickers; envio rápido; badge iOS de peças | Condicional (ex. omitida em modo módulo) |

**Aside (persistente no desktop):** alterar status/etapa, comentários, peças do estoque, checklists / ações de fechamento conforme permissão.

**Não existem** abas top-level separadas “Resumo / Fotos / Diagnóstico” — diagnóstico e mídia vivem dentro de Dados / Orçamentos / Arquivos.

---

## 3. Inventário — modais e overlays secundários (acessíveis pela OS)

| Família | Exemplos | Risco de regressão |
|---|---|---|
| Orçamento | criar, editar, visualizar, aprovação, assinatura | Alto — regras financeiras |
| Diagnóstico | auth/senha, assinatura, formulário | Alto — permissões |
| Fechamento técnico | modal de closing / garantia | Alto — etapa OS |
| Mídia | lightbox, preview foto, câmera, PDF viewer | Médio |
| Estoque | entrada manual, scan, senha estoque | Alto — inventário |
| Lab | pickers de serviço, envio rápido | Médio |
| Impressão | etiquetas / impressão OS | Médio |
| Comentários | menus de comentário | Baixo–médio |
| Destrutivo | delete overlay, confirmações | Alto — UX de confirmação |
| Shell | `ModalPortal`, nested portals | Alto — z-index / foco |

**Arquivos de risco compartilhado (não editar comportamento sem gate desktop):**  
`PatioView.tsx`, `iosModalStyles` / tokens `iosVehicleModal*`, `ModalPortal`, forms de orçamento, componentes de estoque/diagnóstico/print, CSS `patio-vehicle-modal-desktop.css` (+ pilot).

---

## 4. Antes × Depois (direção visual)

### Antes (hoje)
- Header branco opaco; tipografia UPPERCASE pesada; meta em cards com borda.
- Tabs com underline **azul sistema** (`#007AFF`) — compete com a marca.
- Aside colado (`#F2F2F7`) sem elevação; CTAs azuis/cinza.
- Cards com borda rígida; pouca atmosfera; motion já piloto mas chrome ainda “form ERP clássico”.

### Depois (proposta)
- Header translúcido + fade de scroll; chip **REI DO ABS · OS**; status pill amarelo/preto junto à placa.
- Tabs em **pills pretas/amarelas** (segmented brand).
- Aside flutuante com blur; CTA primário amarelo (“Alterar etapa”), secundário preto (“Novo orçamento”).
- Cards sem borda, sombra curta; bloco **Mídia recente** no Dados para reduzir caça de anexos.
- Press + troca de aba com easing Apple já padronizado no monorepo.

Protótipo HTML: `/opt/cursor/artifacts/patio-os-desktop-before-after.html`  
Evidência atual (pilot): `/opt/cursor/artifacts/patio-os-modal-desktop-pilot.png`

---

## 5. Mapa de mudança por superfície (sem mudar regra)

| Superfície | ui-ux-pro-max | apple-design |
|---|---|---|
| Shell / header | Hierarquia veículo > placa > meta; brand chip | Material + scroll fade |
| Tab bar | Labels curtas, estado ativo óbvio | Pill press / crossfade conteúdo |
| Dados | Agrupar Queixa → Obs → Diagnóstico auth; mídia recente | Stagger leve de seções |
| Orçamentos | Scan path lista → detalhe; CTAs claros | Sheet/modal depth |
| Arquivos | Grid galeria + tipos; ações fixas | Lightbox com spring/dismiss |
| Manutenções | Timeline/lista limpa | Row press |
| Lab | Densidade de picker sem card overload | Feedback de seleção |
| Aside | Uma coluna de ação | Floating material panel |
| Secundários | Confirmações claras; forms 8px grid | Open/close simétrico |

---

## 6. Plano de execução (fases)

Todas as fases: **CSS/classes gated `isPatioPcModal` / `patio-vm-desktop*`**; zero mudança de API; mobile/tablet intactos; checklist de regressão por aba + modal secundário.

### Fase 0 — Freeze & baseline (1 PR pequeno ou checklist)
- Congelar inventário e screenshots “antes” em desktop real com dados.
- Listar classes/seletores atuais do shell desktop.
- Critério de aceite visual documentado (marca, contraste, sem azul de aba).

### Fase 1 — Shell chrome (header + tabs + paper)
- Tokens CSS desktop-only.
- Header material + brand chip + status pill.
- Tab bar pills marca; trocar accent azul → amarelo/preto.
- Smoke: abrir OS, trocar abas, resize desktop.

### Fase 2 — Aside + CTAs
- Aside flutuante; reorder visual de ações sem mudar handlers.
- Botões brand / ink; press states.
- Smoke: mudar etapa, comentar, estoque (com permissão).

### Fase 3 — Aba Dados
- Reestilizar seções Queixa / Obs / Diagnóstico auth.
- Bloco “Mídia recente” (só UI: atalho visual para Arquivos / lightbox existente — **sem novo backend**).
- Smoke: editar textos, abrir auth diagnóstico.

### Fase 4 — Orçamentos (visual)
- Lista e formulário: tipografia, espaçamento, sticky actions.
- **Não** alterar cálculo, aprovação ou permissões.
- Smoke: criar rascunho, abrir visualização, fluxo aprovação (ambiente com dados).

### Fase 5 — Arquivos / mídia
- Grid, empty states, ações câmera/upload.
- Lightbox/PDF: depth + dismiss.
- Smoke: upload, preview, fechar.

### Fase 6 — Manutenções + Lab
- Lista/timeline e pickers alinhados ao novo chrome.
- Smoke: lab picker / quick send se papel permitir.

### Fase 7 — Modais secundários (passe visual)
- Orçamento nested, auth, estoque senha, delete, garantia, print.
- Unificar radius, botões, scrim, motion open/close.
- Smoke: cada família da tabela §3.

### Fase 8 — Motion polish & QA
- Alinhar a `apple-motion` existente; reduzir motion se `prefers-reduced-motion`.
- Lint `tsc`; walkthrough desktop gravado; checklist permissões.
- Comparar tablet/mobile screenshots → **zero diff** esperado.

---

## 7. Critérios de aceite

1. Diferença visual **óbvia** no primeiro open da OS desktop (chrome + tabs + aside).  
2. Identidade amarelo/preto/branco dominante; sem underline azul de aba.  
3. Todas as abas e modais secundários do inventário ainda funcionam.  
4. Nenhuma regressão tablet/mobile (gate desktop).  
5. Sem mudança de contrato de API / RLS / regras de etapa.  
6. Motion coerente com Apple Design skill + padrões já mergeados.

---

## 8. Fora de escopo (explícito)

- Redesign do board do Pátio (exceto abrir a OS).  
- Mobile/tablet OS.  
- Novo modelo de dados, novas abas de negócio, mudança de permissões.  
- Troca de tipografia para Inter/Playfair (sugestão genérica do gerador — rejeitada).

---

## 9. Próximo passo

Aguardar aprovação da direção visual e da ordem das fases. Implementação começa pela **Fase 1 (shell)** em branch dedicada, sem tocar lógica de negócio.
