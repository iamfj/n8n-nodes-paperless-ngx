import {
	fileNameFromContentDisposition,
	readBinaryInput,
	toBinaryData,
	toBuffer,
	toFormData,
} from '../shared/infrastructure/binary';
import { createFakeExecuteFunctions } from './fake-execute-functions';

describe('toBuffer', () => {
	const pdf = Buffer.from('%PDF-1.7');

	it('passes a Buffer through', () => {
		expect(toBuffer(pdf)).toBe(pdf);
	});

	it('accepts an ArrayBuffer, which is the other shape n8n may return', () => {
		const arrayBuffer = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength);
		expect(toBuffer(arrayBuffer).equals(pdf)).toBe(true);
	});

	it('accepts a typed-array view without copying the wrong window', () => {
		const view = new Uint8Array([1, 2, 3, 4]).subarray(1, 3);
		expect([...toBuffer(view)]).toEqual([2, 3]);
	});

	it('falls back to an empty buffer for a body that is not binary at all', () => {
		expect(toBuffer(undefined).length).toBe(0);
	});
});

describe('fileNameFromContentDisposition', () => {
	it('reads a quoted filename', () => {
		expect(fileNameFromContentDisposition('attachment; filename="invoice 2026.pdf"')).toBe(
			'invoice 2026.pdf',
		);
	});

	it('prefers the RFC 5987 form, which keeps the umlauts', () => {
		expect(
			fileNameFromContentDisposition(
				'attachment; filename="Gebuhr.pdf"; filename*=UTF-8\'\'Geb%C3%BChr.pdf',
			),
		).toBe('Gebühr.pdf');
	});

	it('falls back to the plain filename when filename* is not UTF-8', () => {
		expect(
			fileNameFromContentDisposition(
				'attachment; filename="Gebuhr.pdf"; filename*=ISO-8859-1\'\'Geb%FChr.pdf',
			),
		).toBe('Gebuhr.pdf');
	});

	it('falls back to the plain filename when the percent escapes do not decode', () => {
		expect(
			fileNameFromContentDisposition(
				'attachment; filename="scan.pdf"; filename*=UTF-8\'\'%E0%A4%A',
			),
		).toBe('scan.pdf');
	});

	it('strips a traversal out of the name, which reaches the workflow binary data', () => {
		expect(
			fileNameFromContentDisposition("attachment; filename*=UTF-8''..%2F..%2Fetc%2Fpasswd"),
		).toBe('passwd');
		expect(fileNameFromContentDisposition('attachment; filename="../../etc/passwd"')).toBe(
			'passwd',
		);
	});

	it('returns undefined when the header is absent or unparsable', () => {
		expect(fileNameFromContentDisposition(undefined)).toBeUndefined();
		expect(fileNameFromContentDisposition('inline')).toBeUndefined();
	});
});

describe('toFormData', () => {
	it('repeats a key per array entry, as DRF getlist expects', () => {
		const form = toFormData({ title: 'Invoice', tags: [5, 8] });
		expect(form.get('title')).toBe('Invoice');
		expect(form.getAll('tags')).toEqual(['5', '8']);
	});

	it('omits fields that were never set', () => {
		const form = toFormData({ title: 'Invoice', correspondent: undefined, owner: null });
		expect(form.has('correspondent')).toBe(false);
		expect(form.has('owner')).toBe(false);
	});

	it('attaches a file with its name and type', async () => {
		const form = toFormData(
			{},
			{
				document: {
					data: Buffer.from('%PDF-1.7'),
					fileName: 'invoice.pdf',
					mimeType: 'application/pdf',
				},
			},
		);
		const file = form.get('document') as File;
		expect(file).toBeInstanceOf(Blob);
		expect(file.name).toBe('invoice.pdf');
		expect(file.type).toBe('application/pdf');
		expect(await file.text()).toBe('%PDF-1.7');
	});

	it('defaults an unknown file type rather than letting the server guess', () => {
		const form = toFormData({}, { document: { data: Buffer.from('x'), fileName: 'scan' } });
		expect((form.get('document') as File).type).toBe('application/octet-stream');
	});
});

describe('binary items', () => {
	it('reads an incoming binary property into a file part', async () => {
		const { ctx } = createFakeExecuteFunctions();
		expect(await readBinaryInput(ctx, 0, 'data')).toEqual({
			data: Buffer.from('%PDF-1.7'),
			fileName: 'invoice.pdf',
			mimeType: 'application/pdf',
		});
	});

	it('hands n8n the file name in the parameter that is misleadingly called filePath', async () => {
		const { ctx } = createFakeExecuteFunctions();
		await toBinaryData(ctx, {
			data: Buffer.from('%PDF-1.7'),
			fileName: 'archive.pdf',
			mimeType: 'application/pdf',
		});
		expect(ctx.helpers.prepareBinaryData).toHaveBeenCalledWith(
			Buffer.from('%PDF-1.7'),
			'archive.pdf',
			'application/pdf',
		);
	});
});
