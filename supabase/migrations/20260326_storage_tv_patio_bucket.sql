-- Bucket público para mídias da TV do pátio (upload via API com service role).

INSERT INTO storage.buckets (id, name, public)
VALUES ('tv-patio', 'tv-patio', true)
ON CONFLICT (id) DO NOTHING;
