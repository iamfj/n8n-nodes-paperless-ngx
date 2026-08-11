import type { INode, JsonObject } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { PaperlessError } from '../domain/paperless-error';

/**
 * Turns anything thrown inside a context into the error type n8n renders, keeping
 * the Paperless hint as the description so it reaches the node's UI.
 */
export function toNodeError(
	node: INode,
	error: unknown,
	itemIndex?: number,
): NodeApiError | NodeOperationError {
	if (error instanceof NodeApiError || error instanceof NodeOperationError) {
		return error;
	}
	if (error instanceof PaperlessError) {
		// `toJSON()` rather than the error itself: n8n copies this object into the
		// workflow output, and the raw error's cause carries the request headers.
		return new NodeApiError(node, error.toJSON() as JsonObject, {
			message: error.message,
			description: error.hint,
			// n8n types this as a string, not the number it looks like.
			httpCode: String(error.status),
			itemIndex,
		});
	}
	if (error instanceof Error) {
		return new NodeOperationError(node, error, { itemIndex });
	}
	return new NodeOperationError(node, String(error), { itemIndex });
}
