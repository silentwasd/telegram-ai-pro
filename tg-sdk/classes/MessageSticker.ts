import Bot from "./Bot";
import Message from "../interfaces/Message";

export default class MessageSticker {
    constructor(private bot: Bot, private messageRaw: Message) {
    }

    hasThumbnail() {
        return this.messageRaw.sticker.hasOwnProperty('thumbnail');
    }

    async downloadThumbnail(): Promise<Blob> {
        return this.bot.downloadFile(this.messageRaw.sticker.thumbnail.file_id);
    }
}