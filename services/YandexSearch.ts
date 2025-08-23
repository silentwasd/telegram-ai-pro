import fetch from "node-fetch";

export default class YandexSearch {
    async search(term: string): Promise<string> {
        const response = await fetch('https://searchapi.api.cloud.yandex.net/v2/web/search', {
            method : 'POST',
            headers: {
                Authorization : `Bearer ${process.env.YANDEX_SEARCH_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body   : JSON.stringify({
                query: {
                    searchType : 'SEARCH_TYPE_RU',
                    queryText  : term,
                    familyMode : 'FAMILY_MODE_NONE',
                    page       : 0,
                    fixTypoMode: 'FIX_TYPO_MODE_ON'
                }
            })
        });

        return Buffer.from((await response.json()).rawData, 'base64').toString('utf-8');
    }
}