import Chat from "./Chat";
import PhotoSize from "./PhotoSize";
import User from "./User";
import Voice from "./Voice";
import Sticker from "./Sticker";
import Animation from "./Animation";

export default interface Message {
    message_id: number;
    message_thread_id?: number;
    date: number;
    chat: Chat;
    from?: User;
    photo?: PhotoSize[];
    text?: string;
    caption?: string;
    voice?: Voice;
    sticker?: Sticker;
    animation?: Animation;
    [key: string]: any;
}