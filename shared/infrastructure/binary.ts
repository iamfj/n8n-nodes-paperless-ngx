import type { IBinaryData, IExecuteFunctions } from 'n8n-workflow';

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

export function fileNameFromContentDisposition(raw: unknown): string | undefined {
	const header = Array.isArray(raw) ? raw[0] : raw;
	if (typeof header !== 'string') {
		return undefined;
	}
	// RFC 5987 `filename*` wins when present: Paperless sends it for titles with
	// umlauts, and the plain `filename` alongside it is a lossy transliteration.
	const encoded = /filename\*=(?:[^']*'[^']*')?([^;]+)/i.exec(header);
	if (encoded) {
		try {
			return decodeURIComponent(encoded[1].trim().replace(/^"|"$/g, ''));
		} catch {
			return undefined;
		}
	}
	const plain = /filename="?([^";]+)"?/i.exec(header);
	return plain ? plain[1].trim() : undefined;
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
