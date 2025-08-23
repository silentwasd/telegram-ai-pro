import Bot from "./Bot";
import Message from "../interfaces/Message";

export default class MessageAnimation {
    constructor(private bot: Bot, private messageRaw: Message) {
    }

    hasThumbnail() {
        return this.messageRaw.animation.hasOwnProperty('thumbnail');
    }

    async downloadThumbnail(): Promise<Blob> {
        return this.bot.downloadFile(this.messageRaw.animation.thumbnail.file_id);
    }
}