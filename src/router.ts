import type { LynSupportedMethods, Route, RoutePath } from "#/types";

type RouteParams = Record<string, string>;

type RegisteredRoute = {
  route: Route<any, any, any>;
  paramNames: string[];
};

type RouteNode = {
  staticChildren: Map<string, RouteNode>;
  paramChild: RouteNode | null;
  wildcardChild: RouteNode | null;
  routesByMethod: Map<LynSupportedMethods, RegisteredRoute>;
};

export type RouteMatch =
  | { status: "found"; route: Route<any, any, any>; params: RouteParams }
  | { status: "method_not_allowed"; allowedMethods: LynSupportedMethods[] }
  | { status: "not_found" };

const createNode = (): RouteNode => ({
  staticChildren: new Map(),
  paramChild: null,
  wildcardChild: null,
  routesByMethod: new Map(),
});

const splitPath = (path: string): string[] =>
  path.split("/").filter((segment) => segment !== "");

const decodeSegment = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

const assertValidPath = (path: RoutePath) => {
  if (path === "") throw new Error("Route path cannot be empty");
  if (!path.startsWith("/"))
    throw new Error(`Route path must start with "/": ${path}`);

  const segments = splitPath(path);
  const wildcardIndex = segments.indexOf("*");
  if (wildcardIndex !== -1 && wildcardIndex !== segments.length - 1)
    throw new Error(`Wildcard must be the last segment: ${path}`);
};

const findNode = (
  node: RouteNode,
  segments: string[],
  paramValues: string[]
): RouteNode | null => {
  const [segment, ...rest] = segments;
  if (segment === undefined) {
    return node.routesByMethod.size > 0 ? node : node.wildcardChild;
  }

  const staticChild = node.staticChildren.get(segment);
  const staticMatch = staticChild && findNode(staticChild, rest, paramValues);
  if (staticMatch) return staticMatch;

  if (node.paramChild) {
    paramValues.push(decodeSegment(segment));
    const paramMatch = findNode(node.paramChild, rest, paramValues);
    if (paramMatch) return paramMatch;
    paramValues.pop();
  }

  return node.wildcardChild;
};

export const createRouter = () => {
  const root = createNode();

  const add = (route: Route<any, any, any>) => {
    assertValidPath(route.path);

    let node = root;
    const paramNames: string[] = [];

    for (const segment of splitPath(route.path)) {
      if (segment === "*") {
        node = node.wildcardChild ??= createNode();
      } else if (segment.startsWith(":")) {
        paramNames.push(segment.slice(1));
        node = node.paramChild ??= createNode();
      } else {
        const child = node.staticChildren.get(segment) ?? createNode();
        node.staticChildren.set(segment, child);
        node = child;
      }
    }

    if (node.routesByMethod.has(route.method))
      throw new Error(
        `Route ${route.method} ${route.path} is already registered`
      );

    node.routesByMethod.set(route.method, { route, paramNames });
  };

  const match = (method: string, pathname: string): RouteMatch => {
    const paramValues: string[] = [];
    const node = findNode(root, splitPath(pathname), paramValues);
    if (!node) return { status: "not_found" };

    const registered = node.routesByMethod.get(method as LynSupportedMethods);
    if (!registered)
      return {
        status: "method_not_allowed",
        allowedMethods: [...node.routesByMethod.keys()],
      };

    const params = Object.fromEntries(
      registered.paramNames.map((name, index) => [name, paramValues[index]!])
    );
    return { status: "found", route: registered.route, params };
  };

  return { add, match };
};
