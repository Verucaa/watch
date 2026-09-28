import axios from './http.js';

let globalProxy = null;
const BASE_URL = "https://7reels.cc";
let cachedEmbedKey = null;

/**
 * Dynamically extract the live embedKey from 7reels.cc bundles
 */
async function getEmbedKey() {
    if (cachedEmbedKey) {
        return cachedEmbedKey;
    }
    
    try {
        const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        };
        
        /* 1. Fetch 7reels homepage */
        const homeRes = await axios.get("https://7reels.cc", { headers, timeout: 8000 });
        
        /* 2. Find the main index bundle */
        const matchIndex = homeRes.data.match(/src="(\/assets\/index-[a-zA-Z0-9]{8}\.js)"/) || homeRes.data.match(/href="(\/assets\/index-[a-zA-Z0-9]{8}\.js)"/);
        if (!matchIndex) {
            throw new Error("Could not find main assets/index JS bundle on 7reels homepage");
        }
        
        const mainBundleUrl = `https://7reels.cc${matchIndex[1]}`;
        
        /* 3. Fetch main bundle JS */
        const mainBundleRes = await axios.get(mainBundleUrl, { headers, timeout: 8000 });
        
        /* 4. Find the AdSafetyWarning chunk name */
        const matchChunk = mainBundleRes.data.match(/([a-zA-Z0-9_-]*AdSafetyWarning-[a-zA-Z0-9]{8}\.js)/);
        if (!matchChunk) {
            throw new Error("Could not find AdSafetyWarning chunk inside index JS");
        }
        
        const warningChunkUrl = `https://7reels.cc/assets/${matchChunk[1]}`;
        
        /* 5. Fetch warning chunk JS */
        const warningRes = await axios.get(warningChunkUrl, { headers, timeout: 8000 });
        
        /* 6. Extract key_ */
        const matchKey = warningRes.data.match(/key_[a-f0-9]+/i);
        if (!matchKey) {
            throw new Error("Could not find embedKey pattern in warning chunk");
        }
        
        cachedEmbedKey = matchKey[0];
        return cachedEmbedKey;
    } catch (e) {
        /* Fallback to original hardcoded key if dynamic resolution fails */
        cachedEmbedKey = "key_c90081fa77254eb5";
        return cachedEmbedKey;
    }
}

/**
 * Configure global proxy for Axios requests
 * @param {string} proxyUrl - Proxy URL
 */
function setProxy(proxyUrl) {
    globalProxy = proxyUrl;
}

/**
 * Perform a GET request to 7REELS
 * @param {string} path - API endpoint path
 * @param {object} params - Query parameters
 */
async function apiGet(path, params = {}) {
    const url = `${BASE_URL}${path}`;
    const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Referer": `${BASE_URL}/`
    };
    
    const requestConfig = {
        headers,
        params,
        timeout: 15000
    };
    
    if (globalProxy) {
        try {
            const parsed = new URL(globalProxy);
            requestConfig.proxy = {
                protocol: parsed.protocol.replace(':', ''),
                host: parsed.hostname,
                port: parseInt(parsed.port)
            };
            if (parsed.username) {
                requestConfig.proxy.auth = {
                    username: parsed.username,
                    password: parsed.password
                };
            }
        } catch (e) {
            /* Ignore proxy parse errors */
        }
    }
    
    const response = await axios.get(url, requestConfig);
    return response.data;
}

/**
 * 1. Fetch Homepage Featured and Top Reels Charts
 */
async function getHomepage() {
    try {
        const [featured, topReels] = await Promise.all([
            apiGet("/api/featured"),
            apiGet("/api/top-reels")
        ]);
        
        return {
            featured: featured.featured || {},
            topReels: {
                trending: topReels.trending || [],
                topOverall: topReels.topOverall || [],
                country: topReels.country || ""
            }
        };
    } catch (error) {
        return { error: error.message };
    }
}

/**
 * 2. Search Movies and TV Shows
 * @param {string} query - Keyword query
 * @param {number} page - Page number
 */
async function search(query, page = 1) {
    try {
        const data = await apiGet("/api/search/smart", {
            q: query,
            page: String(page)
        });
        
        return {
            query,
            page: parseInt(page),
            total: data.results?.length || 0,
            results: data.results || []
        };
    } catch (error) {
        return { error: error.message };
    }
}

/**
 * 3. Fetch Specific Movie/TV details
 * @param {string|number} id - TMDB ID of media
 * @param {string} type - Media type ('movie' or 'tv')
 */
async function getDetails(id, type = 'movie') {
    try {
        const cleanType = type === 'tv' ? 'tv' : 'movie';
        
        const [details, credits] = await Promise.all([
            apiGet(`/api/tmdb/${cleanType}/${id}`),
            apiGet(`/api/tmdb/${cleanType}/${id}/credits`)
        ]);
        
        return {
            id: String(id),
            type: cleanType,
            title: details.title || details.name || "",
            originalTitle: details.original_title || details.original_name || "",
            overview: details.overview || "",
            poster: details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null,
            backdrop: details.backdrop_path ? `https://image.tmdb.org/t/p/w1280${details.backdrop_path}` : null,
            rating: details.vote_average || null,
            releaseDate: details.release_date || details.first_air_date || "",
            genres: details.genres || [],
            cast: credits.cast || [],
            crew: credits.crew || []
        };
    } catch (error) {
        return { error: error.message };
    }
}

/**
 * 4. Fetch TV Season Episodes
 * @param {string|number} tvId - TMDB TV ID
 * @param {number} seasonNum - Season number
 */
async function getEpisodes(tvId, seasonNum) {
    try {
        const data = await apiGet(`/api/tmdb/tv/${tvId}/season/${seasonNum}`);
        return {
            tvId: String(tvId),
            seasonNumber: parseInt(seasonNum),
            episodes: (data.episodes || []).map(ep => ({
                id: ep.id,
                episodeNumber: ep.episode_number,
                name: ep.name || "",
                overview: ep.overview || "",
                airDate: ep.air_date || "",
                rating: ep.vote_average || null,
                stillPath: ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : null
            }))
        };
    } catch (error) {
        return { error: error.message };
    }
}

/**
 * 5. Resolve Stream Embed URLs for all players
 * @param {string|number} id - TMDB ID
 * @param {string} type - Media type ('movie' or 'tv')
 * @param {number} seasonNum - Season number (required for TV)
 * @param {number} episodeNum - Episode number (required for TV)
 * @param {string} language - Subtitle language preference ('english' or 'other')
 */
async function getStreamUrls(id, type = 'movie', seasonNum = null, episodeNum = null, language = 'english') {
    const isTv = type === 'tv';
    const subParam = language === 'english' ? '&sub=en' : '';
    const embedKey = await getEmbedKey();
    
    const players = [
        { key: 'strigil', label: 'Strigil', quality: '4K HDR' },
        { key: 'videasy', label: 'VidEasy', quality: '4K' },
        { key: 'vidsuper', label: 'VidSuper', quality: '4K' },
        { key: 'vidcore', label: 'VidCore', quality: '1080p' },
        { key: 'vidrock', label: 'AdRock', quality: '1080p' },
        { key: 'vidsrc0', label: 'VidSrc', quality: '1080p' },
        { key: 'vidlink', label: 'VidLink', quality: '1080p' },
        { key: 'vidfast', label: 'VidUp', quality: '1080p' },
        { key: 'vidnest', label: 'VidNest', quality: '1080p' },
        { key: 'vidify', label: 'Vidify', quality: '1080p' },
        { key: 'vidzee', label: 'VidZee', quality: '1080p' }
    ];
    
    const resolvedUrls = [];
    
    for (const player of players) {
        let streamUrl = "";
        
        if (!isTv) {
            /* Movie Stream Formula */
            switch (player.key) {
                case 'strigil':
                    streamUrl = `https://strigil.cc/embed/movie/${id}?embedKey=${embedKey}&autoPlay=true&theme=16A085${subParam}`;
                    break;
                case 'vidfast':
                    streamUrl = `https://vidup.to/movie/${id}?autoPlay=true&theme=16A085${subParam}`;
                    break;
                case 'vidsuper':
                    streamUrl = `https://vidsuper.net/movie/${id}?overlay=true&color=16A085`;
                    break;
                case 'videasy':
                    streamUrl = `https://player.videasy.net/movie/${id}?overlay=true&color=16A085`;
                    break;
                case 'vidcore':
                    streamUrl = `https://vidcore.net/movie/${id}?autoPlay=true${subParam}`;
                    break;
                case 'vidsrc0':
                    streamUrl = `https://vidsrc.mov/embed/movie/${id}`;
                    break;
                case 'vidrock':
                    streamUrl = `https://vidrock.net/movie/${id}`;
                    break;
                case 'vidnest':
                    streamUrl = `https://vidnest.fun/movie/${id}`;
                    break;
                case 'vidlink':
                    streamUrl = `https://vidlink.pro/movie/${id}`;
                    break;
                case 'vidify':
                    streamUrl = `https://player.vidify.top/embed/movie/${id}`;
                    break;
                case 'vidzee':
                    streamUrl = `https://player.vidzee.wtf/embed/movie/${id}`;
                    break;
            }
        } else {
            /* TV Episode Stream Formula */
            if (seasonNum === null || episodeNum === null) continue;
            const s = seasonNum;
            const ep = episodeNum;
            
            switch (player.key) {
                case 'strigil':
                    streamUrl = `https://strigil.cc/embed/tv/${id}/${s}/${ep}?embedKey=${embedKey}&autoPlay=true&theme=16A085${subParam}`;
                    break;
                case 'vidfast':
                    streamUrl = `https://vidup.to/tv/${id}/${s}/${ep}?autoPlay=true&theme=16A085&nextButton=true&autoNext=true${subParam}`;
                    break;
                case 'vidsuper':
                    streamUrl = `https://vidsuper.net/tv/${id}/${s}/${ep}?nextEpisode=true&autoplayNextEpisode=true&episodeSelector=true&overlay=true&skip_intro=true&color=16A085`;
                    break;
                case 'videasy':
                    streamUrl = `https://player.videasy.net/tv/${id}/${s}/${ep}?nextEpisode=true&autoplayNextEpisode=true&episodeSelector=true&overlay=true&color=16A085`;
                    break;
                case 'vidcore':
                    streamUrl = `https://vidcore.net/tv/${id}/${s}/${ep}?autoPlay=true${subParam}`;
                    break;
                case 'vidsrc0':
                    streamUrl = `https://vidsrc.mov/embed/tv/${id}/${s}/${ep}`;
                    break;
                case 'vidrock':
                    streamUrl = `https://vidrock.net/tv/${id}/${s}/${ep}`;
                    break;
                case 'vidnest':
                    streamUrl = `https://vidnest.fun/tv/${id}/${s}/${ep}`;
                    break;
                case 'vidlink':
                    streamUrl = `https://vidlink.pro/tv/${id}/${s}/${ep}`;
                    break;
                case 'vidify':
                    streamUrl = `https://player.vidify.top/embed/tv/${id}/${s}/${ep}`;
                    break;
                case 'vidzee':
                    streamUrl = `https://player.vidzee.wtf/embed/tv/${id}/${s}/${ep}`;
                    break;
            }
        }
        
        if (streamUrl) {
            resolvedUrls.push({
                server: player.label,
                quality: player.quality,
                url: streamUrl
            });
        }
    }
    
    return resolvedUrls;
}

/**
 * Helper to resolve page-based player encryption (VidCore, VidUp, VidFast)
 */
async function resolvePagePlayer(playerKey, domain, tmdbId, type, seasonNum, episodeNum) {
    const isTv = type === 'tv';
    const baseUrl = isTv 
        ? `https://${domain}/tv/${tmdbId}/${seasonNum}/${episodeNum}/` 
        : `https://${domain}/movie/${tmdbId}/`;
        
    const pageRes = await axios.get(baseUrl, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"
        }
    });
    
    const match = pageRes.data.match(/\\"en\\":\\"(.*?)\\"/) || pageRes.data.match(/"en":"(.*?)"/);
    if (!match) throw new Error(`Failed to find encrypted content on ${domain}`);
    const text = match[1];
    
    const encUrl = `https://enc-dec.app/api/enc-${playerKey}?text=${text}`;
    const partsRes = await axios.get(encUrl);
    if (partsRes.data.status !== 200) throw new Error(partsRes.data.error || "Encryption failed");
    const { servers, stream, token } = partsRes.data.result;
    
    const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
        "Referer": `https://${domain}/`,
        "X-Requested-With": "XMLHttpRequest",
        "X-CSRF-Token": token
    };
    
    const serversEncRes = await axios.post(servers, {}, { headers });
    
    const decServersRes = await axios.post(`https://enc-dec.app/api/dec-${playerKey}`, { text: serversEncRes.data });
    if (decServersRes.data.status !== 200) throw new Error("Failed to decrypt servers");
    const serversDecrypted = decServersRes.data.result;
    
    const serverData = serversDecrypted[0].data;
    const streamEncUrl = `${stream}/${serverData}`;
    
    const streamEncRes = await axios.post(streamEncUrl, {}, { headers });
    
    const decStreamRes = await axios.post(`https://enc-dec.app/api/dec-${playerKey}`, { text: streamEncRes.data });
    if (decStreamRes.data.status !== 200) throw new Error("Failed to decrypt stream");
    
    return decStreamRes.data.result;
}

/**
 * 6. Get direct stream (.m3u8) source URLs from players (videasy, vidcore, vidup, vidfast)
 * @param {string|number} id - TMDB ID of media
 * @param {string} type - Media type ('movie' or 'tv')
 * @param {number} seasonNum - Season number (required for TV)
 * @param {number} episodeNum - Episode number (required for TV)
 * @param {string} player - Player key ('videasy', 'vidcore', 'vidup', 'vidfast')
 */
async function getDirectStream(id, type = 'movie', seasonNum = null, episodeNum = null, player = 'videasy') {
    try {
        const pKey = player.toLowerCase();
        
        if (pKey === 'videasy') {
            /* 1. Fetch TMDB details to extract title, release year, and IMDB ID */
            const details = await apiGet(`/api/tmdb/${type}/${id}`);
            const title = details.title || details.name || "";
            const releaseDate = details.release_date || details.first_air_date || "";
            const year = releaseDate ? releaseDate.split('-')[0] : "";
            const imdbId = details.imdb_id || "";
            
            const encTitle = encodeURIComponent(encodeURIComponent(title));
            
            const headers = {
                "Accept": "*/*",
                "Origin": "https://player.videasy.to",
                "Referer": "https://player.videasy.to/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36"
            };
            
            /* 2. Fetch seed from wingsdatabase */
            const seedRes = await axios.get(`https://api.wingsdatabase.com/seed?mediaId=${id}`, { headers });
            const seed = seedRes.data.seed;
            
            /* 3. Fetch encrypted stream source from wingsdatabase */
            const server = "cdn";
            let sourcesUrl = "";
            if (type === 'tv') {
                sourcesUrl = `https://api.wingsdatabase.com/${server}/sources-with-title?title=${encTitle}&mediaType=tv&year=${year}&episodeId=${episodeNum}&seasonId=${seasonNum}&tmdbId=${id}&imdbId=${imdbId}&enc=2&seed=${seed}`;
            } else {
                sourcesUrl = `https://api.wingsdatabase.com/${server}/sources-with-title?title=${encTitle}&mediaType=movie&year=${year}&tmdbId=${id}&imdbId=${imdbId}&enc=2&seed=${seed}`;
            }
            
            const sourcesRes = await axios.get(sourcesUrl, { headers });
            const encData = sourcesRes.data;
            
            /* 4. Request decrypted results from enc-dec.app API */
            const decRes = await axios.post("https://enc-dec.app/api/dec-videasy", {
                text: encData,
                id: String(id),
                seed: seed
            });
            
            if (decRes.data.status === 200) {
                return {
                    status: "success",
                    result: decRes.data.result
                };
            } else {
                return {
                    status: "error",
                    message: decRes.data.error || "Decryption failed"
                };
            }
        } else {
            const playerConfigs = {
                vidcore: { key: 'vidcore', domain: 'vidcore.net' },
                vidup: { key: 'vidup', domain: 'vidup.to' },
                vidfast: { key: 'vidfast', domain: 'vidfast.vc' }
            };
            
            const config = playerConfigs[pKey];
            if (config) {
                const data = await resolvePagePlayer(config.key, config.domain, id, type, seasonNum, episodeNum);
                return { status: "success", result: data };
            }
            
            return {
                status: "error",
                message: `Unsupported player key: ${player}. Choose 'videasy', 'vidcore', 'vidup', or 'vidfast'.`
            };
        }
    } catch (error) {
        return {
            status: "error",
            message: error.message
        };
    }
}

export {
    setProxy,
    getHomepage,
    search,
    getDetails,
    getEpisodes,
    getStreamUrls,
    getDirectStream
};