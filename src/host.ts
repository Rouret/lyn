const WILDCARD_BIND_HOSTS = new Set(["0.0.0.0", "::"]);
const LOOPBACK_HOST_NAMES = ["127.0.0.1", "localhost", "::1"];
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

const parseHostName = (value: string): string | undefined => {
  const header = value.trim();
  if (header.startsWith("[")) {
    const end = header.indexOf("]");
    if (end <= 1) return undefined;
    const rest = header.slice(end + 1);
    if (rest !== "" && !(rest.startsWith(":") && isValidPort(rest.slice(1))))
      return undefined;
    return header.slice(1, end).toLowerCase();
  }

  const colon = header.lastIndexOf(":");
  if (colon === -1) return header.toLowerCase();
  if (!isValidPort(header.slice(colon + 1))) return undefined;
  const name = header.slice(0, colon).toLowerCase();
  if (name === "") return undefined;
  return name;
};

const isValidPort = (value: string): boolean =>
  /^\d+$/.test(value) && Number(value) <= MAX_TCP_PORT;

export const isRequestHostAllowed = (
  request: Request,
  allowedHosts: ReadonlySet<string>
): boolean => {
  const header = request.headers.get("host");
  if (!header) return false;
  const name = parseHostName(header);
  return name !== undefined && allowedHosts.has(name);
};
