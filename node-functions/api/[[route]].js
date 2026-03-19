import { runEdgeOneApiRequest } from '../../lib/server/edgeone-node-handler.js';

export async function onRequest(context) {
  return runEdgeOneApiRequest(context.request, context);
}
