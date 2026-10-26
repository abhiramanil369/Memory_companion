import Constants from "expo-constants";

// ============================================================
// ROOTS API SERVICE
// ============================================================

// ============================================================
// MODULE 1 — MEMORY MANAGEMENT
// ============================================================

export interface Memory {
  id: number;
  title: string;
  content: string;
  mood: string | null;
  memory_type: string;
  capsule_id?: number | null;
  created_at: string;
}

export interface MemoryCreate {
  title: string;
  content: string;
  mood?: string;
  memory_type?: string;
  capsule_id?: number | null;
}

// ============================================================
// MODULE 2 — MOOD TRACKING
// ============================================================

export interface Mood {
  id: number;
  mood: string;
  score: number;
  created_at: string;
}

export interface MoodCreate {
  mood: string;
}

export interface MoodSummary {
  average_score: number;
  total_entries: number;
  current_mood: string | null;
}

// ============================================================
// MODULE 3 — CONNECTION GAMES
// ============================================================

export interface Game {
  id: number;
  name: string;
  description: string;
  game_type: string;
}

export interface GameSession {
  id: number;
  game_id: number;
  player_name: string;
  score: number;
  moves: number;
  completed: boolean;
  started_at: string;
  completed_at: string | null;
}

// ============================================================
// API CONFIGURATION
// ============================================================

let customApiBaseUrl: string | null = null;

export const setCustomApiBaseUrl = (url: string | null) => {
  if (!url) {
    customApiBaseUrl = null;
    return;
  }
  let cleaned = url.trim().replace(/\/+$/, "");
  if (!cleaned.startsWith("http://") && !cleaned.startsWith("https://")) {
    cleaned = `http://${cleaned}`;
  }
  customApiBaseUrl = cleaned;
};

export const getApiBaseUrl = (): string => {
  if (customApiBaseUrl) {
    return customApiBaseUrl;
  }

  // 1. Web browser: use window.location.hostname
  if (typeof window !== "undefined" && window.location?.hostname) {
    const host = window.location.hostname;
    return `http://${host}:8000`;
  }

  // 2. Native / Expo Go host detection
  const host =
    Constants.expoConfig?.hostUri ||
    (Constants as any).expoGoConfig?.debuggerHost ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ||
    (Constants as any).manifest?.debuggerHost;

  if (host) {
    const ip = host.split(":")[0];
    if (ip && ip !== "localhost" && ip !== "127.0.0.1") {
      return `http://${ip}:8000`;
    }
  }

  // 3. Fallback from linkingUri
  if (Constants.linkingUri) {
    const match = Constants.linkingUri.match(/:\/\/([^:/]+)/);
    if (match && match[1] && match[1] !== "localhost" && match[1] !== "127.0.0.1") {
      return `http://${match[1]}:8000`;
    }
  }

  // 4. Default to current host LAN IP
  return "http://10.135.61.120:8000";
};

export const getBaseUrl = (): string => getApiBaseUrl();
export const API_BASE_URL = getApiBaseUrl();

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 8000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error(
        `Connection timed out (${timeoutMs / 1000}s) reaching ${url}. Check server on ${getBaseUrl()}`
      );
    }
    throw new Error(
      `Network error reaching ${url}: ${err?.message || "Failed to fetch"}`
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function testBackendConnection(): Promise<{
  ok: boolean;
  url: string;
  latencyMs: number;
  error?: string;
}> {
  const url = `${getBaseUrl()}/health`;
  const start = Date.now();
  try {
    const res = await fetchWithTimeout(url, {}, 5000);
    const latencyMs = Date.now() - start;
    if (res.ok) {
      return { ok: true, url, latencyMs };
    }
    return { ok: false, url, latencyMs, error: `HTTP ${res.status}` };
  } catch (err: any) {
    return {
      ok: false,
      url,
      latencyMs: Date.now() - start,
      error: err?.message || "Unreachable",
    };
  }
}

// Local memory fallback store
const localMemoriesCache: Memory[] = [];

// ============================================================
// MODULE 1 — MEMORY API
// ============================================================

export async function getMemories(): Promise<Memory[]> {
  try {
    const response = await fetchWithTimeout(`${getBaseUrl()}/api/memories`);

    if (!response.ok) {
      throw new Error(`Failed to fetch memories: ${response.status}`);
    }

    const serverMemories: Memory[] = await response.json();
    // Merge with any local cache not yet on server
    const serverIds = new Set(serverMemories.map((m) => m.id));
    const pendingLocal = localMemoriesCache.filter((m) => !serverIds.has(m.id));
    return [...pendingLocal, ...serverMemories];
  } catch (err) {
    if (localMemoriesCache.length > 0) {
      return localMemoriesCache;
    }
    throw err;
  }
}

export async function createMemory(memory: MemoryCreate): Promise<Memory> {
  try {
    const response = await fetchWithTimeout(`${getBaseUrl()}/api/memories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: memory.title,
        content: memory.content,
        mood: memory.mood || null,
        memory_type: memory.memory_type || "moment",
        capsule_id: memory.capsule_id || null,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create memory: ${errorText}`);
    }

    const created: Memory = await response.json();
    localMemoriesCache.unshift(created);
    return created;
  } catch (err: any) {
    // If network fails, save locally so user's thoughts are not lost
    const fallbackMemory: Memory = {
      id: Date.now(),
      title: memory.title,
      content: memory.content,
      mood: memory.mood || "Reflective",
      memory_type: memory.memory_type || "moment",
      capsule_id: memory.capsule_id || null,
      created_at: new Date().toISOString(),
    };
    localMemoriesCache.unshift(fallbackMemory);
    return fallbackMemory;
  }
}

export async function deleteMemory(id: number): Promise<void> {
  const localIndex = localMemoriesCache.findIndex((m) => m.id === id);
  if (localIndex !== -1) {
    localMemoriesCache.splice(localIndex, 1);
  }

  const response = await fetchWithTimeout(`${getBaseUrl()}/api/memories/${id}`, {
    method: "DELETE",
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete memory: ${response.status}`);
  }
}

// ============================================================
// MODULE 2 — MOOD API
// ============================================================

export async function getMoods(): Promise<Mood[]> {
  const response = await fetchWithTimeout(`${getBaseUrl()}/api/moods`);

  if (!response.ok) {
    throw new Error(`Failed to fetch moods: ${response.status}`);
  }

  return response.json();
}

export async function createMood(mood: MoodCreate): Promise<Mood> {
  const response = await fetchWithTimeout(`${getBaseUrl()}/api/moods`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mood: mood.mood,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create mood: ${errorText}`);
  }

  return response.json();
}

export async function getMoodSummary(): Promise<MoodSummary> {
  const response = await fetchWithTimeout(`${getBaseUrl()}/api/moods/summary`);

  if (!response.ok) {
    throw new Error(`Failed to fetch mood summary: ${response.status}`);
  }

  return response.json();
}

// ============================================================
// MODULE 3 — CONNECTION GAMES API
// ============================================================

export async function getGames(): Promise<Game[]> {
  const response = await fetchWithTimeout(`${getBaseUrl()}/api/games`);

  if (!response.ok) {
    throw new Error(`Failed to fetch games: ${response.status}`);
  }

  return response.json();
}

export async function getGame(id: number): Promise<Game> {
  const response = await fetchWithTimeout(`${getBaseUrl()}/api/games/${id}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch game: ${response.status}`);
  }

  return response.json();
}

export async function createGameSession(
  gameId: number,
  playerName: string = "Player"
): Promise<GameSession> {
  const response = await fetchWithTimeout(`${getBaseUrl()}/api/games/${gameId}/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      player_name: playerName,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create game session: ${errorText}`);
  }

  return response.json();
}

export async function getGameSession(sessionId: number): Promise<GameSession> {
  const response = await fetchWithTimeout(
    `${getBaseUrl()}/api/games/sessions/${sessionId}`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch game session: ${response.status}`);
  }

  return response.json();
}

export async function completeGameSession(
  sessionId: number,
  score: number,
  moves: number
): Promise<GameSession> {
  const response = await fetchWithTimeout(
    `${getBaseUrl()}/api/games/sessions/${sessionId}/complete`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        score,
        moves,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to complete game session: ${errorText}`);
  }

  return response.json();
}

// ============================================================
// MODULE 4 — MEMORY CAPSULES API
// ============================================================

export interface Capsule {
  id: number;
  title: string;
  description: string | null;
  invite_code: string;
  created_at: string;
  memory_count: number;
}

export interface CapsuleCreate {
  title: string;
  description?: string;
}

// Local capsule fallback store
const localCapsulesCache: Capsule[] = [];

export async function getCapsules(): Promise<Capsule[]> {
  try {
    const response = await fetchWithTimeout(`${getBaseUrl()}/api/capsules`);

    if (!response.ok) {
      throw new Error(`Failed to fetch capsules: ${response.status}`);
    }

    const serverCapsules: Capsule[] = await response.json();
    const serverCodes = new Set(serverCapsules.map((c) => c.invite_code));
    const pendingLocal = localCapsulesCache.filter((c) => !serverCodes.has(c.invite_code));
    return [...serverCapsules, ...pendingLocal];
  } catch (err) {
    if (localCapsulesCache.length > 0) {
      return localCapsulesCache;
    }
    throw err;
  }
}

export async function getCapsule(id: number): Promise<Capsule> {
  const response = await fetchWithTimeout(`${getBaseUrl()}/api/capsules/${id}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch capsule: ${response.status}`);
  }

  return response.json();
}

export async function createCapsule(data: CapsuleCreate): Promise<Capsule> {
  try {
    const response = await fetchWithTimeout(`${getBaseUrl()}/api/capsules`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create capsule: ${errorText}`);
    }

    const created: Capsule = await response.json();
    localCapsulesCache.unshift(created);
    return created;
  } catch (err: any) {
    // Local fallback so user is never blocked
    const fallbackCode = `ROOT-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const fallbackCapsule: Capsule = {
      id: Date.now(),
      title: data.title,
      description: data.description || null,
      invite_code: fallbackCode,
      created_at: new Date().toISOString(),
      memory_count: 0,
    };
    localCapsulesCache.unshift(fallbackCapsule);
    return fallbackCapsule;
  }
}

export async function joinCapsule(inviteCode: string): Promise<Capsule> {
  const clean = inviteCode.trim().toUpperCase();
  const normalizedCode = clean.startsWith("ROOT-") ? clean : `ROOT-${clean}`;

  try {
    const response = await fetchWithTimeout(`${getBaseUrl()}/api/capsules/join`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        invite_code: normalizedCode,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to join capsule: ${errorText}`);
    }

    const joined: Capsule = await response.json();
    const exists = localCapsulesCache.some((c) => c.invite_code === joined.invite_code);
    if (!exists) {
      localCapsulesCache.unshift(joined);
    }
    return joined;
  } catch (err: any) {
    // If found in local cache
    const match = localCapsulesCache.find((c) => c.invite_code === normalizedCode);
    if (match) return match;
    throw err;
  }
}

export async function getCapsuleMemories(capsuleId: number): Promise<Memory[]> {
  const response = await fetchWithTimeout(
    `${getBaseUrl()}/api/capsules/${capsuleId}/memories`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch capsule memories: ${response.status}`);
  }

  return response.json();
}

// ============================================================
// MODULE 5 — AI & INTELLIGENCE ENGINE API
// ============================================================

export interface TextAnalysisResponse {
  sentiment: string;
  polarity_score: number;
  emotions: string[];
  suggested_mood: string;
  suggested_type: string;
}

export interface MemoryReelHighlight {
  id: number;
  title: string;
  mood: string | null;
  created_at: string;
}

export interface MemoryReelResponse {
  title: string;
  subtitle: string;
  narration: string;
  emotional_tone: string;
  highlight_count: number;
  key_moments: MemoryReelHighlight[];
}

export async function analyzeMemoryText(
  text: string
): Promise<TextAnalysisResponse> {
  const response = await fetchWithTimeout(`${getBaseUrl()}/api/ai/analyze-text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to analyze text: ${errorText}`);
  }

  return response.json();
}

export async function getMemoryReel(
  limit: number = 7
): Promise<MemoryReelResponse> {
  const response = await fetchWithTimeout(`${getBaseUrl()}/api/ai/reel?limit=${limit}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch memory reel: ${response.status}`);
  }

  return response.json();
}

export async function transcribeVoiceNote(
  audioBase64?: string
): Promise<{ transcript: string; duration?: number }> {
  const response = await fetchWithTimeout(`${getBaseUrl()}/api/ai/transcribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ audio_base64: audioBase64 || null }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to transcribe voice note: ${errorText}`);
  }

  return response.json();
}