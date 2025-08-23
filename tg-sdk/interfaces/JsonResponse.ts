export default interface JsonResponse<T> {
    ok: boolean;
    result: T;
}