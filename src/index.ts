import { createServer, Socket } from 'net'
import TransferProtocol from './TransferProtocol'

const server = createServer()
server.on('connection', (socket: Socket) => {
  new TransferProtocol(socket)
})
server.listen(8000)