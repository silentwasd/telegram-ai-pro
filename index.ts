import * as dotenv from 'dotenv';
import OpenAI, {toFile} from 'openai';
import Bot from "./tg-sdk/classes/Bot";
import {SocksProxyAgent} from "socks-proxy-agent";
import {ChatAction} from "./tg-sdk/enums/ChatAction";
import BlobUtil from "./tg-sdk/classes/BlobUtil";
import {ChatCompletionTool} from "openai/resources/chat/completions/completions";
import os from 'os';
import YandexSearch from "./services/YandexSearch";
import * as fs from "node:fs";

dotenv.config();

const socks  = new SocksProxyAgent(process.env.SOCKS);
const openai = new OpenAI({
    httpAgent: socks
});

const bot = new Bot(process.env.TG_BOT_TOKEN, socks);

let history: any[]   = [];
let memory: string[] = [];

const tools: Record<string, ChatCompletionTool> = {
    systemInfo: {
        type    : 'function',
        function: {
            name       : 'systemInfo',
            description: 'Get information about system where you working on',
            parameters : {}
        },
        async handle(input: any) {
            return JSON.stringify({
                platform         : os.platform(),
                type             : os.type(),
                release          : os.release(),
                arch             : os.arch(),
                cpus             : os.cpus(),
                totalmem         : os.totalmem(),
                freemem          : os.freemem(),
                uptime           : os.uptime(),
                homedir          : os.homedir(),
                hostname         : os.hostname(),
                networkInterfaces: os.networkInterfaces(),
                userInfo         : os.userInfo(),
                loadavg          : os.loadavg(),
                tmpdir           : os.tmpdir(),
                endianness       : os.endianness()
            });
        }
    },

    think: {
        type    : 'function',
        function: {
            name       : 'think',
            description: 'If user request is too complex or if user ask to think you can make more smarter requests!',
            parameters : {
                type                : 'object',
                properties          : {
                    request: {
                        type: 'string'
                    }
                },
                required            : ['request'],
                additionalProperties: false
            }
        },
        async handle({request}) {
            const response = await openai.chat.completions.create({
                model   : 'o3',
                messages: [
                    {
                        role   : 'system' as const,
                        content: 'Ты персональный ассистент-бот в Telegram. Будь дружелюбным. Не используй Markdown разметку.'
                    },
                    {
                        role   : 'user',
                        content: request
                    }
                ]
            });

            return response.choices[0].message.content;
        }
    },

    search: {
        type    : 'function',
        function: {
            name       : 'search',
            description: 'Search information in the Internet. If you do not actual information or user want to search some information in the Internet, do it!',
            parameters : {
                type                : 'object',
                properties          : {
                    request: {
                        type: 'string'
                    }
                },
                required            : ['request'],
                additionalProperties: false
            }
        },
        async handle({request}) {
            return (new YandexSearch().search(request));
        }
    },

    clearMessageHistory: {
        type    : 'function',
        function: {
            name       : 'clearMessageHistory',
            description: 'If user want to clear his message history, clear it.',
            parameters : {}
        },
        async handle(input: any) {
            history = history.slice(-1);
            await saveHistory();
            return 'Success';
        }
    },

    remember: {
        type    : 'function',
        function: {
            name       : 'remember',
            description: 'If you see some personality information about user, remember it (ex: his name, age, weight, dog name, address, habits, job, hobbies...). Or if user ask you to remember something.',
            parameters : {
                type                : 'object',
                properties          : {
                    info: {
                        type: 'string'
                    }
                },
                required            : ['info'],
                additionalProperties: false
            }
        },
        async handle({info}) {
            memory.push(info);
            await fs.promises.writeFile('memory.json', JSON.stringify(memory));
            return 'Success';
        }
    }
};

async function saveHistory() {
    await fs.promises.writeFile('history.json', JSON.stringify(history.slice(-50)));
}

bot.onMessage(async (ctx) => {
    if (ctx.hasText() && ctx.text().startsWith('/clear')) {
        history = [];
        await saveHistory();
        await ctx.sendMessage('История сообщений очищена 😎');
        return;
    }

    if (ctx.messageRaw.from.id !== parseInt(process.env.TG_ALLOW_FROM_ID)) {
        await ctx.sendMessage(`Я не могу с вами общаться (${ctx.messageRaw.from.id})`);
        return;
    }

    async function takeVoice() {
        const response = await openai.audio.transcriptions.create({
            model          : 'gpt-4o-transcribe',
            response_format: 'text',
            file           : await toFile(await ctx.voice().download(), 'voice.ogg')
        });

        if (response.trim().length > 0)
            return response;
        else
            return null;
    }

    if (
        ctx.hasText() || ctx.hasPhoto() || ctx.hasVoice() ||
        (ctx.hasSticker() && ctx.sticker().hasThumbnail()) ||
        (ctx.hasAnimation() && ctx.animation().hasThumbnail())
    ) {
        try {
            await ctx.sendChatAction(ChatAction.Typing);

            history.push({
                role   : 'user' as const,
                content: [
                    ...ctx.hasText() ? [{type: 'text', text: ctx.text()}] : [],
                    ...ctx.hasVoice() ? [{type: 'text', text: (await takeVoice()) ?? '*неразборчивая речь*'}] : [],
                    ...ctx.hasPhoto() ? [{
                        type     : 'image_url',
                        image_url: {
                            url   : await BlobUtil.blobToBase64Url((await ctx.photo().download())),
                            detail: 'high'
                        }
                    }] : [],
                    ...ctx.hasSticker() ? [{
                        type     : 'image_url',
                        image_url: {
                            url   : await BlobUtil.blobToBase64Url((await ctx.sticker().downloadThumbnail())),
                            detail: 'high'
                        }
                    }] : [],
                    ...ctx.hasAnimation() ? [{
                        type     : 'image_url',
                        image_url: {
                            url   : await BlobUtil.blobToBase64Url((await ctx.animation().downloadThumbnail())),
                            detail: 'high'
                        }
                    }] : []
                ]
            });

            async function handle(): Promise<string> {
                const response = await openai.chat.completions.create({
                    model   : 'gpt-4.1',
                    messages: [
                        {
                            role   : 'system' as const,
                            content: [
                                {
                                    type: 'text',
                                    text: 'Ты персональный ассистент-бот в Telegram. Будь дружелюбным. Не используй Markdown разметку.'
                                },
                                {
                                    type: 'text',
                                    text: 'Сообщи пользователю в первый раз, что если он хочет очистить историю сообщений, пусть попросит об этом или напишет команду /clear'
                                },
                                {
                                    type: 'text',
                                    text: 'Ты умеешь запоминать персональную информацию о пользователе, чтобы более персонализировано отвечать на запросы.'
                                },
                                ...memory.length > 0 ? [{
                                    type: 'text',
                                    text: `Вот что ты помнишь о пользователе: ${JSON.stringify(memory)}`
                                }] : []
                            ]
                        },
                        ...history.slice(-50)
                    ],
                    tools   : Object.values(tools)
                });

                history.push(response.choices[0].message);

                if (response.choices[0].finish_reason == 'tool_calls') {
                    await ctx.sendMessage('Выполняю функции...');

                    const toolResponses = await Promise.all(response.choices[0].message.tool_calls.map(async (call) => [await tools[call.function.name].handle(JSON.parse(call.function.arguments)), call]));

                    await ctx.sendMessage('Подготавливаю ответ...');

                    for (let [toolResponse, call] of toolResponses) {
                        history.push({
                            role        : 'tool' as const,
                            content     : [{type: 'text', text: toolResponse !== null ? toolResponse : 'No response'}],
                            tool_call_id: call.id
                        });
                    }
                }

                if (response.choices[0].finish_reason == 'tool_calls') {
                    return await handle();
                } else {
                    return response.choices[0].message.content as string;
                }
            }

            await ctx.sendMessage(await handle());
            await saveHistory();
        } catch (err: any) {
            console.log(err);
            await ctx.sendMessage('Что-то я поломался 🤐');
        }
    }

    if (ctx.messageRaw.hasOwnProperty('animation')) {
        console.log(ctx.messageRaw.animation);
    }
});

async function run() {
    try {
        history = JSON.parse(await fs.promises.readFile('history.json', 'utf-8'));
        memory  = JSON.parse(await fs.promises.readFile('memory.json', 'utf-8'));
    } finally {
        await bot.start();
    }
}

run();