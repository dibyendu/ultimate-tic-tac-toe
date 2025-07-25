import { WEB_SOCKET_URL } from './config'

export const setUpWebSocket = (
  socket,
  setSocket,
  onmessage,
  onopen = () => console.log('websocket connected'),
  onclose = () => console.log('websocket disconnected'),
  retry_interval = 2000
) => {
  if (!socket) {
    let ws = null
    try {
      ws = new WebSocket(WEB_SOCKET_URL)
      setSocket(ws)
    } catch (error) {
      console.error(error)
      setTimeout(() => setUpWebSocket(socket, setSocket, onmessage, onopen, onclose, retry_interval), retry_interval)
    }
  } else {
    socket.onopen = onopen
    socket.onmessage = event => {
      let { isTrusted, data } = event
      if (isTrusted) onmessage(JSON.parse(data))
    }
    socket.onclose = onclose
    socket.onerror = error => {
      console.error(error)
      setSocket(null)  // automatically try to reconnect on error
    }
  }
  return () => {
    if (socket) {
      socket.close()
      setSocket(null)
    }
  }
}

export function checkStatus(response) {
  if (response.status >= 200 && response.status < 300)
    return response
  const error = new Error(`HTTP Error ${response.statusText}`)
  error.status = response.status
  error.statusText = response.statusText
  console.error(error)
  throw error
}

export function parseJSON(response) {
  return response.json()
}