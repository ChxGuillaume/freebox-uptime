import { Injectable } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import * as ping from 'ping';
import * as moment from 'moment';
import { Status, Uptime, UptimeDocument } from './schemas/uptime.schema';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class AppService {
  private lastSeen: Uptime;

  constructor(
    private schedulerRegistry: SchedulerRegistry,
    @InjectModel(Uptime.name)
    private uptimeDocumentModel: Model<UptimeDocument>,
  ) {
    this.isAliveCheck().then();

    this.schedulerRegistry.addInterval(
      'isAlive',
      setInterval(async () => {
        await this.isAliveCheck();
      }, 1000 * 30),
    );
  }

  getLastSeen(): Uptime {
    return this.lastSeen;
  }

  private async isAliveCheck(): Promise<void> {
    const isAlive = await this.isAlive();

    if (!this.lastSeen || this.lastSeen.status !== isAlive) {
      const uptimeDocument = new this.uptimeDocumentModel({
        status: isAlive,
        time: moment().format(),
      });

      await uptimeDocument.save();
    }

    this.lastSeen = {
      status: isAlive,
      time: moment().format(),
    };
  }

  private async isAlive(): Promise<Status> {
    const freeboxAlive = await this.isFreeboxAlive();
    const internetAlive = await this.isInternetAlive();

    if (!freeboxAlive && internetAlive) return Status.Offline;
    else if (!internetAlive) return Status.Unknown;
    else return Status.Online;
  }

  private async isFreeboxAlive(): Promise<boolean> {
    return await this.pingHost(process.env.FREEBOX_IP);
  }

  private async isInternetAlive(): Promise<boolean> {
    return (await this.pingHost('1.1.1.1')) && (await this.pingHost('8.8.8.8'));
  }

  private async pingHost(host: string): Promise<boolean> {
    return new Promise((resolve) => {
      ping.sys.probe(host, (isAlive: boolean) => {
        resolve(isAlive);
      });
    });
  }

  async createChartData() {
    const data = await this.uptimeDocumentModel.find();

    data.sort((a, b) => moment(a.time).diff(moment(b.time)));
    const chartData = this.formatChartData(data);

    const count = chartData.reduce(
      (acc, curr) => {
        const minutes = moment(curr[1].time).diff(
          moment(curr[0].time),
          'minutes',
        );

        acc[curr[0].status] += minutes;

        return acc;
      },
      {
        online: 0,
        offline: 0,
        unknown: 0,
      },
    );

    return { chart: this.createChart(chartData), count };
  }

  private createChart(rawData: [Uptime[]]): (string | [string, number][])[][] {
    const firstDate = moment(rawData[0][0].time).set({
      dayOfYear: 1,
      hour: 0,
      minute: 0,
      second: 0,
    });
    const lastDate = moment(rawData[rawData.length - 1][0].time).set({
      months: 11,
      date: 31,
      hour: 23,
      minute: 59,
      second: 59,
    });

    const data: Map<string, Map<string, number>> = new Map();

    while (firstDate.isBefore(lastDate)) {
      const year = firstDate.format('YYYY');
      const date = firstDate.format('YYYY-MM-DD');

      if (!data.has(year)) {
        data.set(year, new Map());
      }

      data.get(firstDate.format('YYYY')).set(date, 0);

      firstDate.add(1, 'day');
    }

    for (const event of rawData) {
      if (event[0].status !== Status.Offline) continue;

      const firstDay = moment(event[0].time).dayOfYear();
      const lastDay = moment(event[1].time).dayOfYear();
      const diffDays =
        lastDay < firstDay ? 365 - firstDay + lastDay : lastDay - firstDay;

      const workDate = moment(event[0].time).set({
        hour: 0,
        minute: 0,
        second: 0,
      });

      if (diffDays >= 1) {
        const firstDate = moment(event[0].time);
        const lastDate = moment(event[1].time);

        const previousFirstDateValue = data
          .get(firstDate.format('YYYY'))
          .get(firstDate.format('YYYY-MM-DD'));

        const previousLastDateValue = data
          .get(lastDate.format('YYYY'))
          .get(lastDate.format('YYYY-MM-DD'));

        data
          .get(firstDate.format('YYYY'))
          .set(
            firstDate.format('YYYY-MM-DD'),
            previousFirstDateValue +
              Math.abs(
                moment(event[0].time)
                  .add(1, 'day')
                  .set({ hour: 0, minute: 0, second: 0 })
                  .diff(moment(event[0].time), 'minutes'),
              ),
          );

        data
          .get(lastDate.format('YYYY'))
          .set(
            lastDate.format('YYYY-MM-DD'),
            previousLastDateValue +
              Math.abs(
                moment(event[1].time)
                  .set({ hour: 0, minute: 0, second: 0 })
                  .diff(moment(event[1].time), 'minutes'),
              ),
          );

        for (let i = 1; i < diffDays; i++) {
          workDate.add(1, 'day');

          const date = workDate.format('YYYY-MM-DD');
          const previousData = data.get(workDate.format('YYYY')).get(date);
          data.get(workDate.format('YYYY')).set(date, previousData + 1440);
        }
      } else {
        const previousData = data
          .get(moment(event[0].time).format('YYYY'))
          .get(moment(event[0].time).format('YYYY-MM-DD'));

        data
          .get(moment(event[0].time).format('YYYY'))
          .set(
            moment(event[0].time).format('YYYY-MM-DD'),
            previousData +
              Math.abs(
                moment(event[0].time).diff(moment(event[1].time), 'minutes'),
              ),
          );
      }
    }

    return Array.from(data).map(([year, data]) => {
      return [year, Array.from(data)];
    });
  }

  private formatChartData(rawData: Uptime[]): [Uptime[]] {
    const data: [Uptime[]] = [[rawData[0]]];

    rawData.forEach((status: Uptime) => {
      const lastStatusArray: Uptime[] = data[data.length - 1];

      if (lastStatusArray.length === 2) {
        data.push([status]);
      } else if (lastStatusArray[0]?.status !== status.status) {
        lastStatusArray.push({
          status: lastStatusArray[0]?.status,
          time: status.time,
        });

        data.push([status]);
      }
    });

    if (data[data.length - 1].length % 2 === 1) {
      data[data.length - 1].push({
        status: data[data.length - 1][0]?.status,
        time: moment().format(),
      });
    }

    return data;
  }

  formatMinutes(minutes: number): string {
    const time = moment.duration(minutes, 'minutes');

    return `${time.years()}Y ${time.months()}M ${time.days()}d ${time.hours()}h ${time.minutes()}m`;
  }
}
