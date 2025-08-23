export default interface Sticker {
    width: number;
    height: number;
    emoji: string | null;
    set_name: string;
    is_animated: boolean;
    is_video: boolean;
    type: string;

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