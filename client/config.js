
export const SERVER_URL = `https://${import.meta.env.VITE_SERVER_URL}`

export const WEB_SOCKET_URL = `wss://${import.meta.env.VITE_SERVER_URL}/${import.meta.env.VITE_WEBSOCKET_PATH}`

export const CLIENT_PATH_PREFIX = import.meta.env.VITE_CLIENT_PATH_PREFIX