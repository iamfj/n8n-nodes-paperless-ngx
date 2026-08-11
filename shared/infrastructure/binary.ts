import type { IBinaryData, IExecuteFunctions } from 'n8n-workflow';
import { sanitizeFilename } from 'n8n-workflow';

export type FilePart = { data: Buffer; fileName: string; mimeType?: string };

const DEFAULT_MIME_TYPE = 'application/octet-stream';

/**
 * n8n's HTTP layer is free to hand back either a Node Buffer or a plain
 * ArrayBuffer for `encoding: 'arraybuffer'` depending on the transport it picks,
 * so every binary response is normalized here rather than at each call site.
 */
export function toBuffer(data: unknown): Buffer {
	if (Buffer.isBuffer(data)) {
		return data;
	}
	if (data instanceof ArrayBuffer) {
		return Buffer.from(new Uint8Array(data));
	}
	if (ArrayBuffer.isView(data)) {
		return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
	}
	if (typeof data === 'string') {
		return Buffer.from(data, 'binary');
	}
	return Buffer.alloc(0);
}

function decodeExtended(charset: string | undefined, value: string): string | undefined {
	// Only UTF-8 is decoded: `decodeURIComponent` assumes it, and a Latin-1
	// `filename*` would either throw or produce mojibake -- in both cases the
	// plain `filename` in the same header is the better answer.
	if (charset !== undefined && charset !== '' && !/^utf-?8$/i.test(charset)) {
		return undefined;
	}
	try {
		return decodeURIComponent(value);
	} catch {
		return undefined;
	}
}

export function fileNameFromContentDisposition(raw: unknown): string | undefined {
	const header = Array.isArray(raw) ? raw[0] : raw;
	if (typeof header !== 'string') {
		return undefined;
	}
	// RFC 5987 `filename*` wins when it decodes: Paperless sends it for titles
	// with umlauts, and the plain `filename` alongside it is a lossy
	// transliteration -- but a lossy name beats no name at all.
	const extended = /filename\*=(?:([^']*)'[^']*')?([^;]+)/i.exec(header);
	const plain = /filename="?([^";]+)"?/i.exec(header);
	const name =
		(extended && decodeExtended(extended[1], extended[2].trim().replace(/^"|"$/g, ''))) ||
		plain?.[1].trim();
	// The header is attacker-controlled as far as n8n is concerned, and the name
	// reaches the workflow's binary data: `filename*=UTF-8''..%2F..%2Fetc%2Fpasswd`
	// must not come back out as a path.
	return name ? sanitizeFilename(name) : undefined;
}

/**
 * Content-Type is deliberately never set on the form or its parts beyond the
 * file's own type: n8n generates the multipart boundary, and setting the header
 * ourselves would replace it and leave the server with an unparsable body.
 */
export function toFormData(
	fields: Record<string, unknown>,
	files: Record<string, FilePart | FilePart[]> = {},
): FormData {
	const form = new FormData();
	for (const [name, value] of Object.entries(fields)) {
		if (value === undefined || value === null) {
			continue;
		}
		// Repeated keys, not a JSON array: Paperless reads these through DRF's
		// getlist(), which only sees `tags=1&tags=2`.
		for (const entry of Array.isArray(value) ? value : [value]) {
			form.append(name, String(entry));
		}
	}
	for (const [name, value] of Object.entries(files)) {
		for (const file of Array.isArray(value) ? value : [value]) {
			const blob = new Blob([file.data], { type: file.mimeType ?? DEFAULT_MIME_TYPE });
			form.append(name, blob, file.fileName);
		}
	}
	return form;
}

export async function readBinaryInput(
	ctx: IExecuteFunctions,
	itemIndex: number,
	propertyName: string,
): Promise<FilePart> {
	const binary = ctx.helpers.assertBinaryData(itemIndex, propertyName);
	const data = await ctx.helpers.getBinaryDataBuffer(itemIndex, propertyName);
	return {
		data,
		fileName: binary.fileName ?? propertyName,
		mimeType: binary.mimeType ?? DEFAULT_MIME_TYPE,
	};
}

export async function toBinaryData(ctx: IExecuteFunctions, file: FilePart): Promise<IBinaryData> {
	// The second parameter is named `filePath` upstream but is used as the file
	// name; passing a path here would surface the path in n8n's UI.
	return await ctx.helpers.prepareBinaryData(file.data, file.fileName, file.mimeType);
}
