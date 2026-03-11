-- Exibir foto do autor nos comentários do modal do veículo.
ALTER TABLE service_order_comments
  ADD COLUMN IF NOT EXISTS author_photo_url TEXT;

COMMENT ON COLUMN service_order_comments.author_photo_url IS 'URL da foto do autor (admin ou técnico) ao criar o comentário.';
