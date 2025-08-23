import MessageContext from "./MessageContext";
import ApiClient from "./ApiClient";
import * as path from "node:path";
import {Agent} from "node:https";
import {ChatAction} from "../enums/ChatAction";

export default class Bot {
    private client: ApiClient;
    private onMessageHandler: ((ctx: MessageContext) => void) | null = null;

    constructor(token: string, agent: Agent) {
        this.client = new ApiClient(token, agent);
    }

    async start() {
        let update_id: number | null = null;

        while (true) {
            try {
                const response = await this.client.getUpdates({
                    timeout: 10,
                    ...update_id ? {offset: (update_id + 1)} : {}
                });

                if (response.length > 0) {
                    update_id = response[response.length - 1].update_id;

                    console.log(response);

                    response.forEach(update => {
                        if (update.hasOwnProperty('message')) {
                            this.onMessageHandler(new MessageContext(this, update.message));
                        }
                    });
                }
            } catch (err) {
                console.error('Poll error', err.message);
                return;
            }
        }
    }

    onMessage(handler: (ctx: MessageContext) => void) {
        this.onMessageHandler = handler;
    }

    async sendMessage(chat_id: number | string, text: string, params: any = {}) {
        return this.client.sendMessage(chat_id, text, params);
    }

    async sendChatAction(chat_id: number | string, action: ChatAction, message_thread_id: number | null = null) {
        return this.client.sendChatAction(chat_id, action, message_thread_id);
    }

    async sendPhoto(chat_id: number | string, photo: Buffer | NodeJS.ReadableStream | string, params: any = {}) {
        return this.client.sendPhoto(chat_id, photo, params);
    }

    async downloadFile(file_id: string): Promise<Blob> {
        const mimeTypes = {
            '.webp': 'image/webp',
            '.jpg' : 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png' : 'image/png',
            '.gif' : 'image/gif',
            '.ogg' : 'audio/ogg',
            '.oga' : 'audio/ogg'
        };

        const tgFile = await this.client.getFile(file_id);

        if (!tgFile.file_path)
            throw new Error('Telegram file without path.');

        const link = this.client.getDownloadLink(tgFile.file_path);
        const ext  = path.extname(new URL(link).pathname).toLowerCase();

        if (!mimeTypes.hasOwnProperty(ext))
            throw new Error(`Telegram file download error. Unsupported extension type ${ext}.`);

        const response = await fetch(link);

        if (!response.ok)
            throw new Error(`Telegram file download error with status: ${response.status}`);

        return new Blob([await response.arrayBuffer()], {type: mimeTypes[ext]});
    }
}