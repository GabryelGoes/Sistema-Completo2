-- Laboratório: etapas próprias — FINALIZADO vira PRONTO_PRA_RETIRADA; etapas só do pátio são remapeadas.

UPDATE public.service_orders
SET status = 'PRONTO_PRA_RETIRADA'
WHERE order_type = 'module' AND status = 'FINALIZADO';

UPDATE public.service_orders
SET status = 'AGUARDANDO_PECAS'
WHERE order_type = 'module' AND status = 'PECAS_DISPONIVEIS';

UPDATE public.service_orders
SET status = 'EM_SERVICO'
WHERE order_type = 'module' AND status = 'FASE_DE_TESTE';
