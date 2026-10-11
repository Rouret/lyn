const WILDCARD_BIND_HOSTS = new Set(["0.0.0.0", "::"]);
const LOOPBACK_HOST_NAMES = ["127.0.0.1", "localhost", "::1"];
const HTTP_DEFAULT_PORT = 80;
const MAX_TCP_PORT = 65535;

export const resolveAllowedHosts = (
  bindHost: string,
  configured?: readonly string[]
): ReadonlySet<string> => {
  if (configured?.length === 0)
    throw new Error("server.allowedHosts must list at least one host");

  const names = [...(configured ?? LOOPBACK_HOST_NAMES)];
  if (!WILDCARD_BIND_HOSTS.has(bindHost)) names.push(bindHost);

  return new Set(
    names.map((host) => {
      const normalized = host.trim().toLowerCase();
      if (normalized === "")
        throw new Error("server.allowedHosts must not contain a blank host");
      return normalized;
    })
  );
};

const parseHostHeader = (
  value: string
): { name: string; port: number | undefined } | undefined => {
  const header = value.trim();
  if (header.startsWith("[")) {
    const end = header.indexOf("]");
    if (end <= 1) return undefined;
    const name = header.slice(1, end).toLowerCase();
    const rest = header.slice(end + 1);
    if (rest === "") return { name, port: undefined };
    if (!rest.startsWith(":")) return undefined;
    return { name, port: parsePort(rest.slice(1)) };
  }

  const colon = header.lastIndexOf(":");
  if (colon === -1) return { name: header.toLowerCase(), port: undefined };
  const port = parsePort(header.slice(colon + 1));
  if (port === undefined) return undefined;
  const name = header.slice(0, colon).toLowerCase();
  if (name === "") return undefined;
  return { name, port };
};

const parsePort = (value: string): number | undefined => {
  if (!/^\d+$/.test(value)) return undefined;
  const port = Number(value);
  if (port > MAX_TCP_PORT) return undefined;
  return port;
};

export const isRequestHostAllowed = (
  request: Request,
  allowedHosts: ReadonlySet<string>,
  port: number
): boolean => {
  const header = request.headers.get("host");
  if (!header) return false;
  const parsed = parseHostHeader(header);
  if (!parsed || !allowedHosts.has(parsed.name)) return false;
  return (parsed.port ?? HTTP_DEFAULT_PORT) === port;
};
