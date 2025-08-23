import Bot from "./Bot";
import Message from "../interfaces/Message";

export default class MessagePhoto {
    constructor(private bot: Bot, private messageRaw: Message) {
    }

    async download(): Promise<Blob> {
        return this.bot.downloadFile(this.messageRaw.photo.slice(-1)[0].file_id);
    }
}