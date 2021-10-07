import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { ExampleHomebridgePlatform } from './platform';
import { telnetResponse } from './common';
import { PLUGIN_NAME } from './settings';

interface ExtronPreset {
  number: number;
  name: string;
}

class ExtronPresetValues {
  videoData: string;
  audioData: string;

  constructor(videoData:string, audioData:string) {
    this.videoData = videoData;
    this.audioData = audioData;
  }

  equals(that: ExtronPresetValues):boolean {
    if(this.videoData === that.videoData && this.audioData === that.audioData) {
      return true;
    } else {
      return false;
    }
  }
}

export class ExtronMatrixSwitchPlatformAccessory {
  private service: Service;

  private currentPreset = 0;
  private presetsConfigured = false;

  constructor(
    private readonly platform: ExampleHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Extron, Inc.')
      .setCharacteristic(this.platform.Characteristic.Model, 'Crosspoint ULTRA 88 HVA')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.platform.config.serialNumber);

    this.service = this.accessory.getService(this.platform.Service.Television)
      || this.accessory.addService(this.platform.Service.Television);

    this.init();

    //this.platform.log.info(this.allPresets.toString());

    const uuid = this.platform.api.hap.uuid.generate('homebridge:extron-matrix-switch' + accessory.context.device.displayName);
    this.accessory.UUID = uuid;

    this.accessory.category = this.platform.api.hap.Categories.AUDIO_RECEIVER;

    this.service.setCharacteristic(this.platform.Characteristic.Name, 'TryThisNewName');

    this.service.setCharacteristic(this.platform.Characteristic.SleepDiscoveryMode,
      this.platform.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

    this.service.getCharacteristic(this.platform.Characteristic.Active)
      .onSet((newValue) => {
        this.platform.log.info('Changing to state %s', newValue);'';
        this.setOnOffState(newValue.toString());
      });

    this.updatePowerStatus();
    this.updatePresetStatus();

    this.service.getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
      .onSet(async (value) => {

        // the value will be the value you set for the Identifier Characteristic
        // on the Input Source service that was selected - see input sources below.
        await this.changeInput(parseInt(value.toString()));
      });

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.displayName);

    // This is required to be implemented, so that's all this does for now
    this.service.getCharacteristic(this.platform.Characteristic.RemoteKey)
      .onSet((newValue) => {
        switch(newValue) {
          case this.platform.Characteristic.RemoteKey.REWIND: {
            this.platform.log.info('set Remote Key Pressed: REWIND');
            break;
          }
        }
      });

    setInterval(async () => {
      await this.updatePresetStatus();
      await this.updatePowerStatus();
    }, 5000);

    this.platform.api.publishExternalAccessories(PLUGIN_NAME, [this.accessory]);
  }

  async init() {
    this.platform.log.info('Start preset load');
    this.setupPresets();
    this.platform.log.info('Presets now loaded');
  }

  setupPresets() {
    if(!this.presetsConfigured) {
      const presets = this.platform.config.presets as ExtronPreset[];

      presets.forEach(async (name, i) => {
        const inputService = this.accessory.getService('input' + i) ||
          this.accessory.addService(this.platform.Service.InputSource, 'input' + i, name.name);

        this.platform.log.info('Adding input %s as number %s', name.name, i);
        inputService
          .setCharacteristic(this.platform.Characteristic.Identifier, i)
          .setCharacteristic(this.platform.Characteristic.ConfiguredName, name.name)
          .setCharacteristic(this.platform.Characteristic.Name, name.name)
          .setCharacteristic(this.platform.Characteristic.IsConfigured, this.platform.Characteristic.IsConfigured.CONFIGURED)
          .setCharacteristic(this.platform.Characteristic.InputSourceType, this.platform.Characteristic.InputSourceType.COMPONENT_VIDEO)
          .setCharacteristic(this.platform.Characteristic.CurrentVisibilityState,
            this.platform.Characteristic.CurrentVisibilityState.SHOWN);
        this.service.addLinkedService(inputService);
      });

      this.presetsConfigured = true;
    }
  }

  async updatePowerStatus() {
    const muteResponse = await this.telnetCommand('WVM' + String.fromCharCode(13));
    if(muteResponse.split('').some(x => x === '1' || x === '2' || x === '3')) {
      this.service.updateCharacteristic(this.platform.Characteristic.Active, 1);
    } else {
      this.service.updateCharacteristic(this.platform.Characteristic.Active, 0);
    }
  }

  async setOnOffState(value: CharacteristicValue) {
    if(value === '1') {
      const globalVideoMute = await this.telnetCommand('1*B');
      const globalAudioMute = await this.telnetCommand('1*Z');

      if(globalVideoMute === 'Vmt1' && globalAudioMute === 'Amt1') {
        this.service.updateCharacteristic(this.platform.Characteristic.Active, 1);
      }
    } else {
      const globalVideoMute = await this.telnetCommand('0*B');
      const globalAudioMute = await this.telnetCommand('0*Z');

      if(globalVideoMute === 'Vmt0' && globalAudioMute === 'Amt0') {
        this.service.updateCharacteristic(this.platform.Characteristic.Active, 0);
      }
    }
  }

  async getPreset(presetNumber: number): Promise<ExtronPresetValues> {
    const videoResponse =
      await this.telnetCommand('W' + presetNumber + '*1*1VC' + String.fromCharCode(13));
    //this.platform.log.debug('videoResponse: ' + videoResponse);

    const audioResponse =
      await this.telnetCommand('W' + presetNumber + '*1*2VC' + String.fromCharCode(13));
    //this.platform.log.debug('audioResponse: ' + audioResponse);
    return new ExtronPresetValues(videoResponse, audioResponse);
  }

  async updatePresetStatus() {
    // Preset "0" is the last set preset #, so query it to get the current state.
    const extronPreset = await this.getPreset(0);
    const currentExtronVideoPreset = parseInt(extronPreset.videoData.split(' ')[0]);

    if(currentExtronVideoPreset !== this.currentPreset) {
      this.currentPreset = currentExtronVideoPreset;
      this.service.updateCharacteristic(this.platform.Characteristic.ActiveIdentifier, --this.currentPreset);
    }
  }

  async changeInput(value: number) {
    const newValue = value + 1;
    this.platform.log.info('set Active Identifier => setNewValue: ' + newValue);

    try {
      const response = await this.telnetCommand(newValue + '.');
      const responseIndex = newValue < 10 ? '0' + newValue : newValue.toString();

      if(response === 'Rpr' + responseIndex) {
        this.platform.log.info('Switched to preset ' + newValue + ': got response ' + response);
        this.currentPreset = newValue;
        this.service.updateCharacteristic(this.platform.Characteristic.ActiveIdentifier, value);
      } else {
        switch(response) {
          case 'E11':
            this.platform.log.info('Preset number %s is out of range of this unit', newValue);
            break;
          default:
            this.platform.log.info('Response does not match: %s with a string length of ', response, response.length);
        }
      }
    } catch(error) {
      this.platform.log.error('Error: ' + error);
    }
  }

  async telnetCommand(command: string): Promise<string> {
    const response = await telnetResponse(this.platform.config.telnetSettings, command);
    return response;
  }
}