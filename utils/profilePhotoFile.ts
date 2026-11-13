/** Aceita fotos do seletor mesmo quando o browser omite `file.type` (comum no iOS/Android). */
export function isSelectableProfilePhoto(file: File | null | undefined): file is File {
  if (!file) return false;
  const type = (file.type || "").trim().toLowerCase();
  if (type.startsWith("image/")) return true;
  if (!type) {
    return /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(file.name || "");
  }
  return false;
}
