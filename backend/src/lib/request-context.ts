import { AsyncLocalStorage } from "async_hooks";

type RequestContext = {
  requestId: string;
};

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(
  context: RequestContext,
  callback: () => T,
): T {
  return requestContextStorage.run(context, callback);
}

export function getRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}
