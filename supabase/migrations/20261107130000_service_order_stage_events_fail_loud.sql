-- Complementar à migration 20261107120000 (já aplicada em produção).
-- Remove o EXCEPTION silencioso do trigger de histórico de etapas.
-- Falha ao inserir em service_order_stage_events propaga e aborta o UPDATE de status,
-- evitando status_entered_at sem evento correspondente.
-- NÃO recria tabelas. NÃO apaga dados. NÃO executar automaticamente em produção sem revisão.

CREATE OR REPLACE FUNCTION public.trg_service_order_status_entered_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status_entered_at IS NULL THEN
      NEW.status_entered_at := COALESCE(NEW.created_at, now());
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.status_entered_at := now();
      INSERT INTO public.service_order_stage_events (
        workshop_id, service_order_id, from_status, to_status, entered_at, source, meta
      ) VALUES (
        NEW.workshop_id,
        NEW.id,
        OLD.status,
        NEW.status,
        NEW.status_entered_at,
        'trigger',
        jsonb_build_object('order_type', to_jsonb(NEW.order_type))
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_service_order_status_entered_at() IS
  'Mantém status_entered_at e histórico de etapas. Falha do INSERT propaga (sem engolir erro). Não altera updated_at.';
