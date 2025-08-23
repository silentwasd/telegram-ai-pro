import Bot from "./Bot";
import Message from "../interfaces/Message";

export default class MessageVoice {
    constructor(private bot: Bot, private messageRaw: Message) {
    }

    async download(): Promise<Blob> {
        return this.bot.downloadFile(this.messageRaw.voice.file_id);
    }
}