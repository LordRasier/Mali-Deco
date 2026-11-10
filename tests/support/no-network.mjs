/** Optional preload for in-memory tests: fail closed on every outbound Node connection. */
import net from 'node:net';
import dns from 'node:dns';
import dgram from 'node:dgram';
const deny = () => { throw new Error('Network is disabled for this in-memory test run'); };
net.Socket.prototype.connect = deny;
dgram.Socket.prototype.connect = deny;
dgram.Socket.prototype.send = deny;
for (const name of Object.keys(dns)) {
  if (/^(lookup|resolve|reverse)/.test(name) && typeof dns[name] === 'function') dns[name] = deny;
}
for (const name of Object.keys(dns.promises)) {
  if (/^(lookup|resolve|reverse)/.test(name) && typeof dns.promises[name] === 'function') dns.promises[name] = deny;
}
globalThis.fetch = deny;
