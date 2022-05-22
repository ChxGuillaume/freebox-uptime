import { Controller, Get, Render } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Render('index')
  async isAlive() {
    const data = await this.appService.createChartData();

    return {
      alive: await this.appService.getLastSeen(),
      count: {
        online: this.appService.formatMinutes(data.count.online),
        offline: this.appService.formatMinutes(data.count.offline),
        unknown: this.appService.formatMinutes(data.count.unknown),
      },
      dataJSON: JSON.stringify(data),
    };
  }

  @Get('/chart-test')
  async testChart() {
    return this.appService.createChartData();
  }
}
