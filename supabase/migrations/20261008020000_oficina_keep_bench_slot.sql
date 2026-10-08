-- Oficina e laboratório compartilham o compartimento 1–24 (`bench_slot`).
-- A flag `oficina_shelf` só indica onde a peça está; não apaga a vaga.
-- Backfill: OS na oficina sem número recebem o primeiro compartimento livre.

DO $$
DECLARE
  r RECORD;
  occupied int[];
  candidate int;
BEGIN
  SELECT COALESCE(array_agg(bench_slot), ARRAY[]::int[])
  INTO occupied
  FROM public.service_orders
  WHERE order_type = 'module'
    AND status <> 'CANCELLED'
    AND bench_slot IS NOT NULL;

  FOR r IN
    SELECT id
    FROM public.service_orders
    WHERE order_type = 'module'
      AND status <> 'CANCELLED'
      AND oficina_shelf IS NOT NULL
      AND btrim(oficina_shelf) <> ''
      AND bench_slot IS NULL
    ORDER BY created_at ASC NULLS LAST, id ASC
  LOOP
    candidate := NULL;
    FOR i IN 1..24 LOOP
      IF NOT (i = ANY (occupied)) THEN
        candidate := i;
        EXIT;
      END IF;
    END LOOP;
    EXIT WHEN candidate IS NULL;

    UPDATE public.service_orders
    SET
      bench_slot = candidate,
      bench_slot_at = COALESCE(bench_slot_at, now()),
      bench_queued_at = NULL,
      updated_at = now()
    WHERE id = r.id;

    occupied := array_append(occupied, candidate);
  END LOOP;
END $$;

COMMENT ON COLUMN public.service_orders.oficina_shelf IS
  'Flag de localização Oficina (ex.: *). O compartimento 1–24 fica em bench_slot (mesmo da bancada).';

COMMENT ON COLUMN public.service_orders.bench_slot IS
  'Compartimento 1–24 da bancada; permanece atribuído também quando a peça está na oficina.';
