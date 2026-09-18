'use strict';

import { ZigBeeDriver } from 'homey-zigbeedriver';

module.exports = class ZG204ZXDriver extends ZigBeeDriver {

  async onInit() {
    this.log('ZG-204ZX Driver has been initialized');
  }

};
