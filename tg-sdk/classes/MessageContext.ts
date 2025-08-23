import Bot from "./Bot";
import Message from "../interfaces/Message";
import MessagePhoto from "./MessagePhoto";
import {ChatAction} from "../enums/ChatAction";
import MessageVoice from "./MessageVoice";
import MessageSticker from "./MessageSticker";
import MessageAnimation from "./MessageAnimation";

export default class MessageContext {
    constructor(private bot: Bot, public messageRaw: Message) {
    }

    hasPhoto(): boolean {
        return this.messageRaw.hasOwnProperty('photo') && this.messageRaw.photo.length > 0;
    }

    photo(): MessagePhoto | null {
        return this.hasPhoto() ? new MessagePhoto(this.bot, this.messageRaw) : null;
    }

    hasText(): boolean {
        if (this.messageRaw.hasOwnProperty('caption') && this.messageRaw.caption.trim().length > 0)
            return true;
        return this.messageRaw.hasOwnProperty('text') && this.messageRaw.text.trim().length > 0;
    }

    text(): string | null {
        if (!this.hasText())
            return null;

        return this.messageRaw.hasOwnProperty('caption') ? this.messageRaw.caption.trim() : this.messageRaw.text.trim();
    }

    hasVoice(): boolean {
        return this.messageRaw.hasOwnProperty('voice');
    }

    voice(): MessageVoice | null {
        if (!this.hasVoice())
            return null;

        return new MessageVoice(this.bot, this.messageRaw);
    }

    hasSticker(): boolean {
        return this.messageRaw.hasOwnProperty('sticker');
    }

    sticker(): MessageSticker | null {
        if (!this.hasSticker())
            return null;

        return new MessageSticker(this.bot, this.messageRaw);
    }

    hasAnimation(): boolean {
        return this.messageRaw.hasOwnProperty('animation');
    }

    animation(): MessageAnimation | null {
        if (!this.hasAnimation())
            return null;

        return new MessageAnimation(this.bot, this.messageRaw);
    }

    async sendMessage(text: string) {
        return this.bot.sendMessage(this.messageRaw.chat.id, text, {
            ...this.messageRaw.message_thread_id ? {message_thread_id: this.messageRaw.message_thread_id} : {}
        });
    }

    async sendChatAction(action: ChatAction) {
        return this.bot.sendChatAction(this.messageRaw.chat.id, action);
    }

    async sendPhoto(photo: Buffer | NodeJS.ReadableStream | string, params: any = {}) {
        return this.bot.sendPhoto(this.messageRaw.chat.id, photo, params);
    }
}