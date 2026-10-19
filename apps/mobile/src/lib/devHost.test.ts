import { describe, expect, it } from 'vitest';

import { localSupabaseUrl } from './devHost';

describe('localSupabaseUrl', () => {
  it.each([
    ['10.141.74.104:8081', 'http://10.141.74.104:54321'],
    ['192.168.1.108:8081', 'http://192.168.1.108:54321'],
    ['localhost:8081', 'http://localhost:54321'],
    ['my-mac.local', 'http://my-mac.local:54321'],
    ['[fe80::1]:8081', 'http://[fe80::1]:54321'],
  ])('uses the dev server’s host from %j', (hostUri, url) => {
    expect(localSupabaseUrl(hostUri, 54321)).toBe(url);
  });

  it.each([
    [undefined],
    [''],
    ['abc-anonymous-8081.exp.direct'],
    ['abc.ngrok.io:443'],
    ['fe80::1'],
    ['[fe80::1'],
  ])('gives up on %j rather than guess', (hostUri) => {
    expect(localSupabaseUrl(hostUri, 54321)).toBeUndefined();
  });
});
