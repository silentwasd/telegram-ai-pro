export default interface Animation {
    file_name: string;
    mime_type: string;
    duration: number;
    width: number;
    height: number;

    thumbnail?: {
        file_id: string;
        file_unique_id: string;
        file_size: number;
        width: number;
        height: number;
    };

    thumb?: {
        file_id: string;
        file_unique_id: string;
        file_size: number;
        width: number;
        height: number;
    };

    file_id: string;
    file_unique_id: string;
    file_size: number;
}