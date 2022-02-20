export enum PayloadTypes {
  TEXT, JSON, JPEG
}

export enum Actions {
  WRITE, LOG, FILE
}

export enum State {
  HEADER = "HEADER",
  TYPE = "TYPE",
  ACTION = "ACTION",
  PAYLOAD = "PAYLOAD"
}