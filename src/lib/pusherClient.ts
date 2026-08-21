import PusherJS from "pusher-js";
import type { ChannelAuthorizationOptions } from "pusher-js";
import api from "./api";

let _client: PusherJS | null = null;

export function getPusherClient(): PusherJS | null {
    if (typeof window === "undefined") return null;

    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

    if (!key || !cluster) return null;

    if (!_client) {
        if (process.env.NODE_ENV === "development") {
            PusherJS.logToConsole = true; // mostra eventos no console em dev
        }

        // Único canal privado do app (sinalização do compartilhamento de
        // tela) usa o token JWT do localStorage via header Authorization
        // (não cookie), por isso um authorizer custom em vez de authEndpoint.
        const channelAuthorization: ChannelAuthorizationOptions = {
            customHandler: (params, callback) => {
                api.post("/pusher/auth", { socket_id: params.socketId, channel_name: params.channelName })
                    .then(({ data }) => callback(null, data))
                    .catch((err) => callback(err, null));
            },
        };

        _client = new PusherJS(key, { cluster, channelAuthorization });

        _client.connection.bind("connected", () => {
            if (process.env.NODE_ENV === "development") {
                console.log("[Pusher] Conectado. Socket ID:", _client?.connection.socket_id);
            }
        });

        _client.connection.bind("error", (err: unknown) => {
            console.error("[Pusher] Erro de conexão:", err);
        });
    }
    return _client;
}
