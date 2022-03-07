export enum Status {
  Online = 'online',
  Offline = 'offline',
  Unknown = 'unknown',
}

export type LastStatus = {
  status: Status;
  time: string;
};
