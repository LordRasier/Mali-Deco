import { StringDecoder } from 'node:string_decoder';

/** Collect hidden terminal input without silently truncating a password. */
export class SecretInput {
  private readonly decoder = new StringDecoder('utf8');
  private value = '';
  private invalid = false;

  feed(bytes: Buffer): { done: false } | { done: true; value: string } {
    for (const char of this.decoder.write(bytes)) {
      if (char === '\u0003') throw new Error('Cancelled');
      if (char === '\r' || char === '\n') {
        if (this.invalid) throw new Error('Invalid secret input');
        return { done: true, value: this.value };
      }
      if (char === '\u007f' || char === '\b') this.value = Array.from(this.value).slice(0, -1).join('');
      else if (char < ' ' || char === '\u001b') this.invalid = true;
      else if (Buffer.byteLength(this.value + char, 'utf8') > 1024) this.invalid = true;
      else this.value += char;
    }
    return { done: false };
  }
}
