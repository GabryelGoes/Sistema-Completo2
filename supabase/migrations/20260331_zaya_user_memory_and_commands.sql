-- Memória pessoal por usuário e comandos ensinados da Zaya.

CREATE TABLE IF NOT EXISTS zaya_user_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  user_key TEXT NOT NULL,
  memory_text TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'preference' CHECK (category IN ('preference', 'routine', 'context')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zaya_user_memories_lookup
  ON zaya_user_memories (workshop_id, user_key, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_zaya_user_memories_unique_text
  ON zaya_user_memories (workshop_id, user_key, memory_text);

CREATE TABLE IF NOT EXISTS zaya_learned_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  user_key TEXT NOT NULL,
  trigger_phrase TEXT NOT NULL,
  behavior_text TEXT NOT NULL,
  behavior_kind TEXT NOT NULL DEFAULT 'action_text' CHECK (behavior_kind IN ('action_text', 'action_only', 'text_only')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zaya_learned_commands_lookup
  ON zaya_learned_commands (workshop_id, user_key, enabled, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_zaya_learned_commands_trigger
  ON zaya_learned_commands (workshop_id, user_key, lower(trigger_phrase));

COMMENT ON TABLE zaya_user_memories IS 'Memória pessoal por usuário para a assistente Zaya (preferências, rotina e contexto).';
COMMENT ON TABLE zaya_learned_commands IS 'Comandos ensinados por usuário para a Zaya (gatilho -> comportamento).';
