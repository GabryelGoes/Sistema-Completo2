/**
 * Tamanhos do título do veículo na grade do Pátio / Laboratório / histórico alinhado ao mesmo visual.
 * @param panoramic — modo “lupa” (cartões compactos na grade)
 * @param patioGridCard — grade padrão do quadro (fonte ligeiramente menor que o modal)
 */
export function getPatioBoardModelTitleClass(
  modelName: string,
  panoramic?: boolean,
  patioGridCard?: boolean
): string {
  const len = (modelName || '').length;
  if (panoramic) {
    if (len > 40)
      return 'text-[1.551rem] md:text-[2.792rem] lg:text-[1.862rem] portrait:text-[1.816rem] portrait:md:text-[3.266rem] portrait:lg:text-[2.178rem]';
    if (len > 26)
      return 'text-[1.862rem] md:text-[3.723rem] lg:text-[2.326rem] portrait:text-[2.178rem] portrait:md:text-[4.355rem] portrait:lg:text-[2.722rem]';
    return 'text-[1.862rem] md:text-[3.723rem] lg:text-[2.326rem] portrait:text-[2.178rem] portrait:md:text-[4.355rem] portrait:lg:text-[2.722rem]';
  }
  if (patioGridCard) {
    if (len > 40)
      return 'text-[1.977rem] md:text-[3.956rem] lg:text-[2.373rem] portrait:text-[2.314rem] portrait:md:text-[4.627rem] portrait:lg:text-[2.776rem]';
    if (len > 26)
      return 'text-[2.373rem] md:text-[3.956rem] lg:text-[3.165rem] portrait:text-[2.776rem] portrait:md:text-[4.627rem] portrait:lg:text-[3.702rem]';
    return 'text-[2.373rem] md:text-[3.956rem] lg:text-[3.165rem] portrait:text-[2.776rem] portrait:md:text-[4.627rem] portrait:lg:text-[3.702rem]';
  }
  if (len > 40)
    return 'text-[2.326rem] md:text-[4.654rem] lg:text-[2.792rem] portrait:text-[2.722rem] portrait:md:text-[5.444rem] portrait:lg:text-[3.266rem]';
  if (len > 26)
    return 'text-[2.792rem] md:text-[4.654rem] lg:text-[3.723rem] portrait:text-[3.266rem] portrait:md:text-[5.444rem] portrait:lg:text-[4.355rem]';
  return 'text-[2.792rem] md:text-[4.654rem] lg:text-[3.723rem] portrait:text-[3.266rem] portrait:md:text-[5.444rem] portrait:lg:text-[4.355rem]';
}
