import fetch from "node-fetch";
import JsonResponse from "../interfaces/JsonResponse";
import Update from "../interfaces/Update";
import Message from "../interfaces/Message";
import File from "../interfaces/File";
import {Agent} from "node:https";
import {ChatAction} from "../enums/ChatAction";
import FormData from "form-data";

export default class ApiClient {
    constructor(private token: string, private agent: Agent) {
    }

    private toURLSearchParams(params: Record<string, any>): URLSearchParams {
        const searchParams = new URLSearchParams();

        Object.entries(params).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                if (Array.isArray(value)) {
                    value.forEach(item => searchParams.append(key, String(item)));
                } else if (typeof value === 'object') {
                    searchParams.append(key, JSON.stringify(value));
                } else {
                    searchParams.append(key, String(value));
                }
            }
        });

        return searchParams;
    }

    private async get<T>(endpoint: string, params: any = {}): Promise<T> {
        try {
            const response = await fetch(`https://api.telegram.org/bot${this.token}/${endpoint}?` + this.toURLSearchParams(params).toString(), {
                agent: this.agent
            });

            let data;

            try {
                data = await response.json();
            } catch (jsonError) {
                throw new Error(`Telegram API error (HTTP ${response.status})`);
            }

            if (data.ok === false) {
                const errorMessage = data.description || `Telegram API error (HTTP ${response.status})`;
                throw new Error(errorMessage);
            }

            return (data as JsonResponse<T>).result;
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }

            throw new Error(`Network or unknown error: ${error}`);
        }
    }

    private async post<T>(endpoint: string, params: any = {}): Promise<T> {
        try {
            const response = await fetch(`https://api.telegram.org/bot${this.token}/${endpoint}`, {
                method : 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body   : JSON.stringify(params),
                agent  : this.agent
            });

            let data;

            try {
                data = await response.json();
            } catch (jsonError) {
                throw new Error(`Telegram API error (HTTP ${response.status})`);
            }

            if (data.ok === false) {
                const errorMessage = data.description || `Telegram API error (HTTP ${response.status})`;
                throw new Error(errorMessage);
            }

            return (data as JsonResponse<T>).result;
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }

            throw new Error(`Network or unknown error: ${error}`);
        }
    }

    /**
     * Use this method to receive incoming updates using long polling.
     * @param params
     */
    async getUpdates(params: {
        offset?: number,
        limit?: number,
        timeout?: number,
        allowed_updates?: string[]
    } = {}): Promise<Update[]> {
        return this.get('getUpdates', {
            ...params.offset ? {offset: params.offset} : {},
            ...params.limit ? {limit: params.limit} : {},
            ...params.timeout ? {timeout: params.timeout} : {},
            ...params.allowed_updates ? {allowed_updates: params.allowed_updates} : {}
        });
    }

    /**
     * Use this method to get basic information about a file and prepare it for downloading. For the moment, bots can download files of up to 20MB in size.
     * @param file_id
     */
    async getFile(file_id: string): Promise<File> {
        return this.get<File>('getFile', {file_id});
    }

    /**
     * Wrap file path to full url link for download.
     * @param file_path
     */
    getDownloadLink(file_path: string): string {
        return `https://api.telegram.org/file/bot${this.token}/${file_path}`;
    }

    /**
     * Use this method to send text messages.
     * @param chat_id Unique identifier for the target chat or username of the target channel (in the format @channelusername).
     * @param text Text of the message to be sent, 1-4096 characters after entities parsing.
     * @param params
     */
    async sendMessage(chat_id: number | string, text: string, params: any = {}): Promise<Message> {
        return this.post<Message>('sendMessage', {chat_id, text, ...params});
    }

    /**
     * Use this method when you need to tell the user that something is happening on the bot's side.
     * The status is set for 5 seconds or less
     * (when a message arrives from your bot, Telegram clients clear its typing status).
     * @param chat_id Unique identifier for the target chat or username of the target channel (in the format @channelusername).
     * @param action Type of action to broadcast. Choose one, depending on what the user is about to receive.
     * @param message_thread_id Unique identifier for the target message thread; for supergroups only.
     */
    async sendChatAction(chat_id: number | string, action: ChatAction, message_thread_id: number | null = null): Promise<boolean> {
        return this.post<boolean>('sendChatAction', {chat_id, action, message_thread_id})
    }

    /**
     * Use this method to send photos.
     * @param chat_id Unique identifier for the target chat or username of the target channel (in the format @channelusername).
     * @param photo Buffer, Stream, путь к файлу или file_id
     * @param params
     */
    async sendPhoto(chat_id: number | string, photo: Buffer | NodeJS.ReadableStream | string, params: Record<string, any> = {}): Promise<Message> {
        const form = new FormData();
        form.append('chat_id', chat_id);

        // Определите имя файла для отправки, если передаете Buffer или Stream
        if (Buffer.isBuffer(photo) || (photo as any).pipe) {
            form.append('photo', photo, {
                filename: 'photo.jpg',
                contentType: 'image/jpeg'
            });
        } else {
            // Это file_id или ссылка
            form.append('photo', photo);
        }

        // Добавляем опциональные параметры
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
            }
        });

        const response = await fetch(`https://api.telegram.org/bot${this.token}/sendPhoto`, {
            method: 'POST',
            body: form,
            agent: this.agent,
            // не задавайте Content-Type, form-data сам формирует boundary!
            headers: form.getHeaders(),
        });

        let data;
        try {
            data = await response.json();
        } catch (jsonError) {
            throw new Error(`Telegram API error (HTTP ${response.status})`);
        }

        if (data.ok === false) {
            const errorMessage = data.description || `Telegram API error (HTTP ${response.status})`;
            throw new Error(errorMessage);
        }

        return (data as JsonResponse<Message>).result;
    }
}