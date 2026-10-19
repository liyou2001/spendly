/**
 * Local Supabase's URL, from the address the phone used to reach the dev server
 * (Constants.expoConfig.hostUri, e.g. "10.141.74.104:8081"). Local Supabase runs on the same
 * computer. Returns undefined when there's no usable address, including through a tunnel
 * (`expo start --tunnel`), which carries only the app bundle and not Supabase.
 */
export function localSupabaseUrl(hostUri: string | undefined, port: number): string | undefined {
  if (!hostUri) return undefined;

  let host: string;
  if (hostUri.startsWith('[')) {
    // IPv6: "[fe80::1]:8081". Keep the brackets; URLs need them.
    const end = hostUri.indexOf(']');
    if (end === -1) return undefined;
    host = hostUri.slice(0, end + 1);
  } else {
    const parts = hostUri.split(':');
    // A bare IPv6 address without brackets can't be told apart from host:port.
    if (parts.length > 2) return undefined;
    host = parts[0] ?? '';
  }

  if (!host || /\.exp\.direct$|ngrok/i.test(host)) return undefined;
  return `http://${host}:${port}`;
}
