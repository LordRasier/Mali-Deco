export const imageUploadHelp = 'JPG, PNG o WebP sin animaciones; hasta 5 MiB, 16 megapíxeles y 8000 píxeles por lado.';
export const validImageFile = (file: File) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size > 0 && file.size <= 5 * 1024 * 1024;
export const imageUploadRejected = 'No se pudo determinar la causa del rechazo. Revisá el archivo y sus límites antes de volver a intentar.';

/** Restore focus when the editing control is remounted after cancellation. */
export function createEditFocus() {
  let pending: string | null = null;
  return {
    restore: (id: string) => { pending = id; },
    attach: (id: string, element: { focus: () => void; disabled?: boolean } | null, fallback?: { focus: () => void } | null) => {
      if (element && pending === id) { pending = null; (element.disabled ? fallback : element)?.focus(); }
    },
  };
}

export const mediaStorageHelp = 'Las imágenes retiradas siguen ocupando la cuota de almacenamiento. Cada versión procesada admite hasta 384 KiB y las versiones de una imagen, hasta 1 MiB en total.';
export function mediaErrorMessage(status: number, code?: string): string | undefined {
  if (status === 413 && code === 'OUTPUT_TOO_LARGE') return 'Las versiones procesadas superan el límite. Reducí el tamaño o la complejidad de la imagen e intentá nuevamente.';
  if (status === 409 && code === 'MEDIA_QUOTA_EXCEEDED') return 'Se alcanzó la cuota de almacenamiento. Las imágenes retiradas también ocupan espacio; contactá a un administrador.';
  if (status === 503 && code === 'MEDIA_PACKET_TOO_SMALL') return 'El servidor no admite el tamaño necesario para guardar las imágenes. Contactá a un administrador y recargá la lista para comprobar el resultado antes de reintentar.';
  return undefined;
}
