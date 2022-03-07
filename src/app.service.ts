import { Injectable } from '@nestjs/common';
import { LastStatus, Status } from './types/Status.type';
import { SchedulerRegistry } from '@nestjs/schedule';
import * as ping from 'ping';
import * as moment from 'moment';
import { Moment } from 'moment';

@Injectable()
export class AppService {
  private lastSeen: LastStatus;

  constructor(private schedulerRegistry: SchedulerRegistry) {
    this.isAliveCheck().then();

    this.schedulerRegistry.addInterval(
      'isAlive',
      setInterval(async () => {
        await this.isAliveCheck();
        console.log(this.lastSeen);
      }, 1000 * 30),
    );
  }

  getLastSeen(): LastStatus {
    return this.lastSeen;
  }

  private async isAliveCheck(): Promise<void> {
    this.lastSeen = {
      status: await this.isAlive(),
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

  private lastHour: Moment = moment();

  createChartData() {
    const data = this.dataForTest(400);

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

    const test = new Map<string, number>();
    test.set('online', 0);
    test.set('offline', 0);
    test.set('unknown', 0);

    return { chart: this.createChart(chartData), count };
  }

  private createChart(
    rawData: [LastStatus[]],
  ): (string | [string, number][])[][] {
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

  private formatChartData(rawData: LastStatus[]): [LastStatus[]] {
    const data: [LastStatus[]] = [[rawData[0]]];

    rawData.forEach((status: LastStatus) => {
      const lastStatusArray: LastStatus[] = data[data.length - 1];

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
      data.pop();
    }

    return data;
  }

  private dataForTest(count): LastStatus[] {
    const data: LastStatus[] = [];
    const statusList: Status[] = [
      Status.Online,
      Status.Online,
      Status.Online,
      Status.Online,
      Status.Online,
      Status.Online,
      Status.Online,
      Status.Online,
      Status.Offline,
      Status.Offline,
      Status.Offline,
      Status.Offline,
      Status.Unknown,
    ];

    this.lastHour = moment().set({
      dayOfYear: 1,
      hour: 0,
      minute: 0,
      second: 0,
    });

    for (let i = 0; i < count; i++) {
      const lastStatus = data[data.length - 1];
      const randomStatus =
        statusList[Math.floor(Math.random() * statusList.length)];

      if (lastStatus && randomStatus !== lastStatus?.status) {
        data.push({
          status: lastStatus?.status,
          time: this.lastHour.format(),
        });
      }

      data.push({
        status: randomStatus,
        time: this.lastHour.format(),
      });

      this.lastHour.add(Math.round(Math.random() * 100) + 1, 'hour');
    }

    return data;
  }

  formatMinutes(minutes: number): string {
    const time = moment.duration(minutes, 'minutes');

    return `${time.years()}Y ${time.months()}M ${time.days()}d ${time.hours()}h ${time.minutes()}m`;
  }
}
