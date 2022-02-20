import { Socket } from "net";
import fs from 'fs'
import path from 'path'
import os from 'os'
import { State, Actions, PayloadTypes } from './interfaces'

export default class TransferProtocol {
  private socket: Socket
  private _bufferedBytes: number
  private _payloadLength: number
  private _payloadType: number
  private _action: number
  private _state: string
  private queue: Array<Buffer>
  private _process: boolean

  constructor(socket: Socket) {
    this.socket = socket
    this._process = false;
    this._state = State.HEADER;
    this._payloadType = PayloadTypes.TEXT;
    this._action = Actions.WRITE;
    this._payloadLength = 0;
    this._bufferedBytes = 0;
    this.queue = [];

    this.socket.on('data', (data) => {
      this._bufferedBytes += data.length;
      this.queue.push(data);
  
      this._process = true;
      this.getMessage();
    });
  
    this.socket.on('payload', this.handler);
  }

  private getMessage() {
    while (this._process) {
      switch (this._state) {
        case State.HEADER:
          this.getMessageSize();
          break;
  
        case State.TYPE:
          this.getPayloadType()
          break;
  
        case State.ACTION:
          this.getAction()
          break;
  
        case State.PAYLOAD:
          this.getPayload();
          break;
      }
    }
  }

  private handler(data: Buffer) {
    switch (this._action) {
      case Actions.WRITE:
        this.socket.write(data)
        break;
      
      case Actions.LOG:
        console.log(data.toString());
        break;

      case Actions.FILE:
        fs.writeFile(path.join(os.tmpdir(), `${Date.now()}`), data, (error) => {
          if (error) console.log(error);
        })
        break;
    
      default:
        break;
    }
  }

  private getMessageSize() {
    if (this.hasEnoughBytesToRead(4)) {
      this._payloadLength = this.readBytes(4).readInt32BE(0);
      this._state = State.TYPE;
    }
  }

  private getPayloadType() {
    if (this.hasEnoughBytesToRead(1)) {
      this._payloadType = this.readBytes(1).readInt8(0);
      this._state = State.ACTION;
      
    }
  }

  private getAction() {
    if (this.hasEnoughBytesToRead(1)) {
      this._action = this.readBytes(1).readInt8(0);
      this._state = State.PAYLOAD;
    }
  }

  private getPayload() {
    if (this.hasEnoughBytesToRead(this._payloadLength)) {
      const data = this.readBytes(this._payloadLength);
      if (this.checkType(data)) {
        this.socket.emit('payload', data);
      }
      this._state = State.HEADER;
    }
  }

  private hasEnoughBytesToRead(size: number): Boolean {
    if (this._bufferedBytes >= size) {
      return true;
    }
    this._process = false;
    return false;
  }

  private readBytes(size: number): Buffer {
    let result;
    this._bufferedBytes -= size;
  
    if (size === this.queue[0].length) {
      const buffer = this.queue[0]
      this.queue.shift();
      return buffer
    }
  
    if (size < this.queue[0].length) {
      result = this.queue[0].slice(0, size);
      this.queue[0] = this.queue[0].slice(size);
      return result;
    }
    
    result = Buffer.allocUnsafe(size);
    let offset = 0;
    let length;
    
    while (size > 0) {
      length = this.queue[0].length;
  
      if (size >= length) {
        this.queue[0].copy(result, offset);
        offset += length;
        this.queue.shift();
      } else {
        this.queue[0].copy(result, offset, 0, size);
        this.queue[0] = this.queue[0].slice(size);
      }
  
      size -= length;
    }
  
    return result;
  }

  private checkType(data: Buffer): Boolean {
    switch (this._payloadType) {
      case PayloadTypes.TEXT:
        return this.isUTF8(data)
  
      case PayloadTypes.JSON:
        try {
          JSON.parse(data.toString())
        } catch (error) {
          return false
        }
        return true
      
      case PayloadTypes.JPEG:
        return data.toString("hex", 0, 2) === "ffd8"
      
      default:
        return false;
    }
  }

  private isUTF8(data: Buffer): Boolean {
    const len = data.length;
    let i = 0;

    while (i < len) {
      if ((data[i] & 0x80) === 0x00) { 
        i++;
      } else if ((data[i] & 0xe0) === 0xc0) { 
        if (
          i + 1 === len ||
          (data[i + 1] & 0xc0) !== 0x80 ||
          (data[i] & 0xfe) === 0xc0 
        ) {
          return false;
        }

        i += 2;
      } else if ((data[i] & 0xf0) === 0xe0) {
        if (
          i + 2 >= len ||
          (data[i + 1] & 0xc0) !== 0x80 ||
          (data[i + 2] & 0xc0) !== 0x80 ||
          data[i] === 0xe0 && (data[i + 1] & 0xe0) === 0x80 ||
          data[i] === 0xed && (data[i + 1] & 0xe0) === 0xa0  
        ) {
          return false;
        }

        i += 3;
      } else if ((data[i] & 0xf8) === 0xf0) { 
        if (
          i + 3 >= len ||
          (data[i + 1] & 0xc0) !== 0x80 ||
          (data[i + 2] & 0xc0) !== 0x80 ||
          (data[i + 3] & 0xc0) !== 0x80 ||
          data[i] === 0xf0 && (data[i + 1] & 0xf0) === 0x80 || 
          data[i] === 0xf4 && data[i + 1] > 0x8f || data[i] > 0xf4 
        ) {
          return false;
        }

        i += 4;
      } else {
        return false;
      }
    }

    return true;
  }
}