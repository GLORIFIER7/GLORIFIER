import { routePagesRequest } from './_shared/proxy.mjs';

export const onRequest = (context) => routePagesRequest(context);
