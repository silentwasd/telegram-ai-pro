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

let history: any[]                     = [];
let memory: string                     = '';
let schedule: Record<string, string[]> = {};

let scheduleInterval: NodeJS.Timeout | null = null;
let isShuttingDown                          = false;
let isHandlingSchedule                      = false;

const tools: Record<string, any> = {
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
                        content: [
                            {
                                type: 'text',
                                text: 'Ты персональный ассистент-бот в Telegram. Будь дружелюбным. Не используй Markdown разметку.'
                            },
                            ...memory.length > 0 ? [{
                                type: 'text' as const,
                                text: `Вот что ты знаешь о пользователе:\n${memory}`
                            }] : [],
                        ]
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
            description: 'YOU MUST ALWAYS call this function when user shares personal information or asks you to ' +
                'remember something. This function COMPLETELY REPLACES all stored memory with new comprehensive ' +
                'information. Analyze existing knowledge, UPDATE outdated information, REMOVE irrelevant ' +
                'details, and ADD new information. Create a clean, current, and comprehensive user profile.',
            parameters : {
                type                : 'object',
                properties          : {
                    info: {
                        type       : 'string',
                        description: 'COMPLETE updated user profile that will REPLACE all existing memory. ' +
                            'Should include: 1) Current and relevant personal details (name, age, location, job), ' +
                            '2) Active preferences and habits, 3) Recent plans and goals, 4) Important ongoing ' +
                            'relationships/projects. EXCLUDE: outdated information (old jobs, completed projects, ' +
                            'changed preferences), temporary details that are no longer relevant, contradictory ' +
                            'information (keep only the most recent). Example: "User is John Smith, 29 years old ' +
                            '(updated from 28), software developer at New Tech Company (changed jobs), lives in ' +
                            'Moscow. Has dog named Buddy. Prefers coffee. Currently planning wedding for next year ' +
                            '(removed old Paris trip - completed)."'
                    }
                },
                required            : ['info'],
                additionalProperties: false
            }
        },
        async handle({info}) {
            memory = info;
            await saveMemory();
            return 'User profile completely updated - outdated information removed, current details preserved';
        }
    },

    time: {
        type    : 'function',
        function: {
            name       : 'time',
            description: 'Find out what date and time is now.',
            parameters : {}
        },
        async handle(input: any) {
            return (new Date()).toString();
        }
    },

    schedule: {
        type    : 'function',
        function: {
            name       : 'schedule',
            description: 'Schedule tasks for specific times. IMPORTANT: 1) When creating tasks, ' +
                'always describe what YOU (the AI) should do for the user at that time. ' +
                'Use formats like "Remind the user about [event]" or "Notify the user that ' +
                '[deadline approaching]". 2) ALWAYS ask for user confirmation before scheduling. ' +
                'Use this exact format for confirmation: "Подтверждаете задачу?\nЗадача: [task description]\n' +
                'Время: [date and time]"',
            parameters : {
                type                : 'object',
                properties          : {
                    datetime : {
                        type       : 'string',
                        format     : 'date-time',
                        description: 'Date and time in ISO 8601 format with timezone. Examples: ' +
                            '"2024-01-15T14:30:00Z" (UTC), "2024-01-15T14:30:00+03:00" (Moscow), ' +
                            '"2024-01-15T14:30:00-05:00" (New York). If the user did not specify a date, or ' +
                            'did not specify whether something needs to be done today or tomorrow, then by default, ' +
                            'consider that today.'
                    },
                    task     : {
                        type       : 'string',
                        description: 'What YOU (the AI) need to do for the user at the scheduled time. Must be written ' +
                            'from AI perspective. Examples: "Remind the user about the doctor appointment", ' +
                            '"Notify the user that the project deadline is today", "Alert the user about the ' +
                            'upcoming meeting with the team". Never write just "meeting" - always write "Remind ' +
                            'the user about the meeting".'
                    },
                    confirmed: {
                        type       : 'boolean',
                        description: 'Has the user explicitly confirmed the scheduled task? ' +
                            'Set to false initially, then true only after user confirms. ' +
                            'BEFORE calling this function with confirmed=true, you MUST ask user ' +
                            'for confirmation using this exact format: "Подтверждаете задачу?\\n' +
                            'Задача: [task description]\\nВремя: [date and time in the user time zone in an understandable human language]"'
                    }
                },
                required            : ['datetime', 'task', 'confirmed'],
                additionalProperties: false
            }
        },
        async handle({datetime, task, confirmed}) {
            if (!confirmed)
                return 'Must be confirmed';

            const date = new Date(datetime);
            date.setSeconds(0, 0);

            if (!schedule.hasOwnProperty(date.toISOString()))
                schedule[date.toISOString()] = [task];
            else
                schedule[date.toISOString()].push(task);

            await saveSchedule();

            return 'Success';
        }
    },

    getSchedule: {
        type    : 'function',
        function: {
            name       : 'getSchedule',
            description: 'CRITICAL: Get current schedule information. This function returns the ONLY accurate and ' +
                'up-to-date schedule data. YOU MUST ALWAYS call this function when user asks about scheduled tasks, ' +
                'appointments, or reminders. NEVER rely on previous conversation history about schedule - it may be ' +
                'outdated. IGNORE any schedule information from earlier messages. This function is the SINGLE SOURCE ' +
                'OF TRUTH for all scheduled tasks.',
            parameters : {}
        },
        async handle(input: any) {
            return JSON.stringify(Object.fromEntries(
                Object.entries(schedule).filter(([datetime, tasks]) => tasks.length > 0)
            ));
        }
    },

    removeFromSchedule: {
        type    : 'function',
        function: {
            name       : 'removeFromSchedule',
            description: 'Remove schedule information',
            parameters : {
                type                : 'object',
                properties          : {
                    datetime : {
                        type       : 'string',
                        format     : 'date-time',
                        description: 'Date and time in ISO 8601 format with timezone. Examples: ' +
                            '"2024-01-15T14:30:00Z" (UTC), "2024-01-15T14:30:00+03:00" (Moscow), ' +
                            '"2024-01-15T14:30:00-05:00" (New York). If the user did not specify a date, or ' +
                            'did not specify whether something needs to be done today or tomorrow, then by default, ' +
                            'consider that today.'
                    },
                    task     : {
                        type       : 'string',
                        description: 'Concrete task name. You can fetch it from getSchedule tool.'
                    },
                    confirmed: {
                        type       : 'boolean',
                        description: 'Has the user explicitly confirmed to remove the scheduled task? ' +
                            'Set to false initially, then true only after user confirms. ' +
                            'BEFORE calling this function with confirmed=true, you MUST ask user ' +
                            'for confirmation using this exact format: "Вы точно хотите удалить задачу?\\n' +
                            'Задача: [task description]\\nВремя: [date and time in the user time zone in an understandable human language]"'
                    }
                },
                required            : [],
                additionalProperties: false
            }
        },
        async handle({datetime, task, confirmed}) {
            if (!confirmed)
                return 'Must be confirmed';

            const date = new Date(datetime);
            date.setSeconds(0, 0);

            if (!schedule.hasOwnProperty(date.toISOString()))
                return 'Tasks not found at this date and time';

            if (!schedule[date.toISOString()].find(t => t == task))
                return 'This task not found';

            schedule[date.toISOString()] = schedule[date.toISOString()].filter(t => t !== task);

            await saveSchedule();

            return 'Success';
        }
    },

    updateSchedule: {
        type    : 'function',
        function: {
            name       : 'updateSchedule',
            description: 'CRITICAL: Update existing scheduled tasks. Use this function to modify task descriptions or change datetime for existing tasks. ALWAYS call getSchedule first to see current tasks before updating. Use EXACT task text and datetime from getSchedule function.',
            parameters : {
                type                : 'object',
                properties          : {
                    old_datetime: {
                        type       : 'string',
                        format     : 'date-time',
                        description: 'Current date and time in ISO 8601 format. Use EXACT datetime from getSchedule function. Examples: "2024-01-15T14:30:00Z", "2024-01-15T14:30:00+03:00"'
                    },
                    old_task    : {
                        type       : 'string',
                        description: 'Current task text that needs to be updated. Use EXACT text from getSchedule function.'
                    },
                    new_datetime: {
                        type       : 'string',
                        format     : 'date-time',
                        description: 'New date and time in ISO 8601 format. If not changing time, use same as old_datetime.'
                    },
                    new_task    : {
                        type       : 'string',
                        description: 'New task text. Must be written from AI perspective like "Remind the user about...", "Notify the user that...".'
                    },
                    confirmed   : {
                        type       : 'boolean',
                        description: 'Has the user explicitly confirmed the update? Set to false initially, then true only after user confirms. BEFORE calling this function with confirmed=true, you MUST ask user for confirmation using this exact format: "Подтверждаете изменение задачи?\\nСтарая задача: [old_task]\\nВремя: [old_datetime]\\nНовая задача: [new_task]\\nВремя: [new_datetime]"'
                    }
                },
                required            : ['old_datetime', 'old_task', 'new_datetime', 'new_task', 'confirmed'],
                additionalProperties: false
            }
        },
        async handle({old_datetime, old_task, new_datetime, new_task, confirmed}) {
            if (!confirmed) {
                return 'Must be confirmed';
            }

            try {
                // Нормализуем даты
                const oldDate = new Date(old_datetime);
                oldDate.setSeconds(0, 0);
                const oldKey = oldDate.toISOString();

                const newDate = new Date(new_datetime);
                newDate.setSeconds(0, 0);
                const newKey = newDate.toISOString();

                // Проверяем что старая задача существует
                if (!schedule[oldKey]) {
                    return 'Original datetime not found in schedule';
                }

                const taskIndex = schedule[oldKey].findIndex(t => t === old_task);
                if (taskIndex === -1) {
                    return 'Original task not found';
                }

                // Удаляем старую задачу
                schedule[oldKey].splice(taskIndex, 1);

                // Добавляем новую задачу
                if (!schedule[newKey]) {
                    schedule[newKey] = [];
                }
                schedule[newKey].push(new_task);

                await saveSchedule();

                return `Task updated successfully. Moved from ${old_datetime} to ${new_datetime}`;

            } catch (error) {
                return `Error updating task: ${error.message}`;
            }
        }
    }
};

async function saveHistory() {
    await fs.promises.writeFile('data/history.json', JSON.stringify(history.slice(-50)));
}

async function saveMemory() {
    await fs.promises.writeFile('data/memory.txt', memory);
}

async function saveSchedule() {
    await fs.promises.writeFile('data/schedule.json', JSON.stringify(schedule));
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
                                    text: 'Ты умеешь запоминать персональную информацию о пользователе, чтобы более персонализировано отвечать на запросы.'
                                },
                                ...memory.length > 0 ? [{
                                    type: 'text',
                                    text: `Вот что ты знаешь о пользователе:\n${memory}`
                                }] : [],
                                {
                                    type: 'text',
                                    text: 'Когда надо узнать актуальную дату и время, всегда обращайся к функции time. Чтобы ты там не думал сам, актуальное дата и время берутся всегда из функции.'
                                },
                                {
                                    type: 'text',
                                    text: `В расписании задач: ${Object.values(schedule).reduce((p, c) => p + c.length, 0)}`
                                }
                            ]
                        },
                        ...history.slice(-50)
                    ],
                    tools   : Object.values(tools)
                });

                history.push(response.choices[0].message);

                if (response.choices[0].finish_reason == 'tool_calls') {
                    await ctx.sendMessage('Выполняю функции...');

                    for (let call of response.choices[0].message.tool_calls) {
                        const result = await tools[call.function.name].handle(JSON.parse(call.function.arguments));
                        history.push({
                            role        : 'tool' as const,
                            content     : [{type: 'text', text: result !== null ? result : 'No response'}],
                            tool_call_id: call.id
                        });
                    }

                    await ctx.sendMessage('Подготавливаю ответ...');
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

async function handleSchedule() {
    if (isHandlingSchedule || isShuttingDown) return;

    isHandlingSchedule = true;

    try {
        const now = new Date();
        now.setSeconds(0, 0);

        for (let [datetime, tasks] of Object.entries(schedule)) {
            const date = new Date(datetime);
            date.setSeconds(0, 0);

            if (date.getTime() <= now.getTime() && tasks.length > 0) {
                const response = await openai.chat.completions.create({
                    model   : 'gpt-4.1-mini',
                    messages: [
                        {
                            role   : 'system' as const,
                            content: [
                                {
                                    type: 'text' as const,
                                    text: 'Ты персональный ассистент-бот в Telegram. Будь дружелюбным. Не используй Markdown разметку.'
                                },
                                ...memory.length > 0 ? [{
                                    type: 'text' as const,
                                    text: `Вот что ты знаешь о пользователе:\n${memory}`
                                }] : [],
                                {
                                    type: 'text' as const,
                                    text: `Ты проверил расписание, и теперь выполняешь задачи назначенное на текущее время (${now})`
                                }
                            ]
                        },
                        {
                            role   : 'user' as const,
                            content: `Выполни следующие задачи: ${JSON.stringify(tasks)}`
                        }
                    ]
                });

                await bot.sendMessage(process.env.TG_ALLOW_FROM_ID, response.choices[0].message.content);

                schedule[datetime] = [];

                await saveSchedule();
            }
        }
    } catch (err: any) {
        console.log('Error in handleSchedule:', err);
    } finally {
        isHandlingSchedule = false;
    }
}

function startScheduleInterval() {
    // Очищаем предыдущий интервал если есть
    if (scheduleInterval) {
        clearInterval(scheduleInterval);
    }

    console.log('Starting schedule interval (every minute)');

    // Запускаем каждые 60 секунд
    scheduleInterval = setInterval(async () => {
        if (!isShuttingDown) {
            await handleSchedule();
        }
    }, 60 * 1000); // 60000 мс = 1 минута
}

// Функция для корректного завершения работы
async function gracefulShutdown(signal: string) {
    console.log(`\nReceived ${signal}. Starting graceful shutdown...`);
    isShuttingDown = true;

    // Останавливаем интервальный таймер
    if (scheduleInterval) {
        console.log('Clearing schedule interval...');
        clearInterval(scheduleInterval);
        scheduleInterval = null;
    }

    // Ждем завершения текущей обработки расписания
    let attempts = 0;
    while (isHandlingSchedule && attempts < 30) { // макс 30 секунд ожидания
        console.log('Waiting for schedule handler to finish...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
    }

    console.log('Graceful shutdown completed');
    process.exit(0);
}

// Обработчики сигналов завершения
process.on('SIGINT', () => gracefulShutdown('SIGINT'));   // Ctrl+C
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // Kill команда
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // nodemon restart

// Обработка необработанных ошибок
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('unhandledRejection');
});

async function run() {
    if (!fs.existsSync('data'))
        await fs.promises.mkdir('data');

    if (fs.existsSync('data/history.json')) {
        try {
            history = JSON.parse(await fs.promises.readFile('data/history.json', 'utf-8'));
        } catch (err: any) {
            console.log('Error when loading history:', err);
            history = [];
        }
    } else {
        history = [];
    }

    if (fs.existsSync('data/memory.txt')) {
        try {
            memory = await fs.promises.readFile('data/memory.txt', 'utf-8');
        } catch (err: any) {
            console.log('Error when loading memory:', err);
            memory = '';
        }
    } else {
        memory = '';
    }

    if (fs.existsSync('data/schedule.json')) {
        try {
            schedule = JSON.parse(await fs.promises.readFile('data/schedule.json', 'utf-8'));
            await handleSchedule();
        } catch (err: any) {
            console.log('Error when loading schedule:', err);
            schedule = {};
        }
    } else {
        schedule = {};
    }

    startScheduleInterval();
    await bot.start();
}

run();