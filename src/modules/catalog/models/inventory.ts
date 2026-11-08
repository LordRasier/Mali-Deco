import { ConflictException } from '@nestjs/common';
export const validStock = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 1000000;
export function stockUnavailable(): never { throw new ConflictException({ code: 'STOCK_UNAVAILABLE', message: 'La cantidad solicitada supera el stock disponible. Revise las cantidades del carrito.' }); }
