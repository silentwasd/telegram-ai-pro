export default interface JsonResponseError {
    ok: boolean;
    description?: string;
    [key: string]: any;
}