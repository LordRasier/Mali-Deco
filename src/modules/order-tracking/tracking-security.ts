import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { validEmail } from '../order-emails/email-config';

export const trackingDays = 90;
export const trackingCookie = 'store_order_tracking';
export const trackingCookiePath = '/api/v1/order-tracking';
export const trackingDigest = (token: string) => createHash('sha256').update(token).digest('hex');
export const validTrackingToken = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function trackingEmail(value: unknown) {
  if (typeof value !== 'string' || !validEmail(value.trim())) throw new BadRequestException('Ingresá un correo válido.');
  return value.trim().toLowerCase();
}
export type TrackingRequest = { headers: Record<string, string | string[] | undefined> };
export function assertTrackingOrigin(req: TrackingRequest, origin: string) {
  let url: URL;
  try { url = new URL(origin); } catch { throw new ForbiddenException(); }
  if (url.origin !== origin || req.headers.origin !== origin || req.headers.host !== url.host ||
    typeof req.headers['content-type'] !== 'string' || !/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']) ||
    (req.headers['sec-fetch-site'] !== undefined && req.headers['sec-fetch-site'] !== 'same-origin')) throw new ForbiddenException();
}
export function trackingToken(req: TrackingRequest) {
  const cookie = req.headers.cookie;
  if (typeof cookie !== 'string') throw new ForbiddenException();
  const matches = cookie.split(';').map(x => x.trim()).filter(x => x.split('=')[0] === trackingCookie);
  const token = matches.length === 1 ? matches[0].slice(trackingCookie.length + 1) : '';
  if (!validTrackingToken(token)) throw new ForbiddenException();
  return token;
}
export function trackingBody(body: unknown, fields: string[]) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== fields.length || fields.some(k => !Object.hasOwn(body, k))) throw new BadRequestException('Solicitud inválida.');
  return body as Record<string, unknown>;
}
