import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UptimeDocument = Uptime & Document;

export enum Status {
  Online = 'online',
  Offline = 'offline',
  Unknown = 'unknown',
}

@Schema()
export class Uptime {
  @Prop()
  status: string;

  @Prop()
  time: string;
}

export const UptimeSchema = SchemaFactory.createForClass(Uptime);
