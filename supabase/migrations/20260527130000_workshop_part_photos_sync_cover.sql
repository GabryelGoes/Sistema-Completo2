-- Sincroniza photo_url (capa) com a primeira foto da galeria

UPDATE workshop_parts wp
SET photo_url = sub.cover
FROM (
  SELECT DISTINCT ON (part_id)
    part_id,
    photo_url AS cover
  FROM workshop_part_photos
  ORDER BY part_id, sort_order ASC, created_at ASC
) sub
WHERE wp.id = sub.part_id
  AND sub.cover IS NOT NULL
  AND TRIM(sub.cover) <> '';
