-- Recados entre gerência (admin) e técnicos (usuários do sistema), entregues pela Zaya.

CREATE TABLE IF NOT EXISTS zaya_relay_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('to_technician', 'to_management')),
  body TEXT NOT NULL,
  from_role TEXT NOT NULL CHECK (from_role IN ('admin', 'technician')),
  from_technician_user_id UUID,
  recipient_technician_user_id UUID,
  sender_label TEXT NOT NULL DEFAULT 'Gerência',
  opened_at TIMESTAMPTZ,
  reply_text TEXT,
  reply_at TIMESTAMPTZ,
  reply_from_role TEXT CHECK (reply_from_role IS NULL OR reply_from_role IN ('admin', 'technician')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT zaya_relay_direction_ck CHECK (
    (direction = 'to_technician' AND from_role = 'admin' AND recipient_technician_user_id IS NOT NULL AND from_technician_user_id IS NULL)
    OR
    (direction = 'to_management' AND from_role = 'technician' AND from_technician_user_id IS NOT NULL AND recipient_technician_user_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_zaya_relay_pending_tech
  ON zaya_relay_messages (workshop_id, recipient_technician_user_id)
  WHERE opened_at IS NULL AND direction = 'to_technician';

CREATE INDEX IF NOT EXISTS idx_zaya_relay_pending_mgmt
  ON zaya_relay_messages (workshop_id)
  WHERE opened_at IS NULL AND direction = 'to_management';

COMMENT ON TABLE zaya_relay_messages IS 'Recados gerência↔técnicos entregues pela assistente Zaya.';
COMMENT ON COLUMN zaya_relay_messages.sender_label IS 'Rótulo exibido: Gerência ou nome do técnico no envio.';
