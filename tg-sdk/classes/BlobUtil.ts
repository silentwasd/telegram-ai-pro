export default class BlobUtil {
    static async blobToBase64Url(blob: Blob): Promise<string> {
        const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64');
        return `data:${blob.type};base64,${base64}`;
    }
}