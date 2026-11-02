import { apiRequest, onUnauthorized } from './api';
import { createSessionStore } from './session-core';
export { canManageCatalog } from './session-core';

export const sessionStore = createSessionStore(apiRequest);
onUnauthorized(sessionStore.expire, sessionStore.getEpoch);
