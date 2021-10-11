import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { ExtronMatrixSwitchHomebridgePlatform } from './platform';
import { telnetResponse } from './common';
import { PLUGIN_NAME } from './settings';

/**
 * An interface that defines what fields are required for an preset on the
 * Extron unit.
 */
interface ExtronPreset {
  number: number;
  name: string;
}

export class ExtronMatrixSwitchPlatformAccessory {
  private avService: Service;
  private lockService: Service;

  private currentPreset = 0;
  private presetsConfigured = false;

  private lockingCode = '1X';

  private updateInterval = 1000;

  /**
   * Default constructor that performs all initial setup.
   * @param platform The platform implmented.
   * @param accessory The accessory platform.
   */
  constructor(
    private readonly platform: ExtronMatrixSwitchHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {

    // Set default update interval if not defined in configuration.
    if(this.platform.config.updateInterval && this.platform.config.updateInterval !== undefined) {
      this.updateInterval = this.platform.config.updateInterval * 1000;
    }

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Extron, Inc.')
      .setCharacteristic(this.platform.Characteristic.Model, 'Crosspoint ULTRA 88 HVA')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.platform.config.serialNumber);

    this.avService = this.accessory.getService(this.platform.Service.Television)
      || this.accessory.addService(this.platform.Service.Television);

    this.setupPresets();

    const uuid = this.platform.api.hap.uuid.generate('homebridge:extron-matrix-switch' + accessory.context.device.displayName);
    this.accessory.UUID = uuid;

    this.accessory.category = this.platform.api.hap.Categories.AUDIO_RECEIVER;

    this.avService.setCharacteristic(this.platform.Characteristic.Name, 'Extron');

    this.avService.setCharacteristic(this.platform.Characteristic.SleepDiscoveryMode,
      this.platform.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

    this.avService.getCharacteristic(this.platform.Characteristic.Active)
      .onSet(this.setOnOffState.bind(this))
      .onGet(this.getOnOffState.bind(this));

    this.getOnOffState();
    this.updatePresetStatus();

    this.avService.getCharacteristic(this.platform.Characteristic.ActiveIdentifier)
      .onSet(async (value) => {

        // the value will be the value you set for the Identifier Characteristic
        // on the Input Source service that was selected - see input sources below.
        await this.changeInput(parseInt(value.toString()));
      });

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.avService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.displayName);

    // This is required to be implemented, so currently it does not do anything useful.
    this.avService.getCharacteristic(this.platform.Characteristic.RemoteKey)
      .onSet((newValue) => {
        switch(newValue) {
          default: {
            break;
          }
        }
      });

    // Setup lock
    this.platform.config.lockLevel === 'level1' ? '1X' : '2X';

    this.lockService = this.accessory.getService(this.platform.Service.LockMechanism)
    || this.accessory.addService(this.platform.Service.LockMechanism);

    this.lockService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.displayName);

    this.lockService.getCharacteristic(this.platform.Characteristic.LockCurrentState)
      .onGet(this.getCurrentLockState.bind(this));

    this.lockService.getCharacteristic(this.platform.Characteristic.LockTargetState)
      .onSet(this.setTargetLockState.bind(this))
      .onGet(this.getCurrentLockState.bind(this));

    this.updateLockStatus();

    // Set interval to keep HomeKit updated on the current state of power, input states,
    // and lock status.
    setInterval(async () => {
      await this.getOnOffState();
      await this.updatePresetStatus();
      await this.updateLockStatus();
    }, this.updateInterval);

    this.platform.api.publishExternalAccessories(PLUGIN_NAME, [this.accessory]);
  }

  /**
   * Setup all presets from the plugin configuration. Note, currently all presets are setup
   * as Component (YPbPr) video inputs, but this does not appear to make a difference in
   * Apple's Home.app at this time.
   *
   * Note that TypeScript/JavaScript and HomeKit 0-based arrays, but for user-convenience
   * any labelled inputs are 1-based.
   */
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
        this.avService.addLinkedService(inputService);
      });

      this.presetsConfigured = true;
    }
  }

  // #region Power Status

  /**
   * Returns the current state of the physical Extron unit itself.
   * @returns The characterstic status of the Extron unit itself.
   */
  async getOnOffState(): Promise<number> {
    const muteResponse = await this.telnetCommand('WVM' + String.fromCharCode(13));
    this.platform.log.debug('GET: Getting status of unit: %s', muteResponse);

    // All zeroes indicates there are not active mutes; otherwise, mutes are in effect.
    // Hence, if there are any other values in the response, we assume the unit is off.

    const activeFromUnit = !muteResponse.split('').some(x => x === '1' || x === '2' || x === '3');

    this.platform.log.debug('GET: Start Update Active State');
    this.avService.updateCharacteristic(this.platform.Characteristic.Active, activeFromUnit);

    return activeFromUnit ?
      this.platform.Characteristic.Active.ACTIVE :
      this.platform.Characteristic.Active.INACTIVE;
  }

  /**
   * Sets the user-requested on or off state of the Extron unit.
   * @param value The user requested on or off state.
   */
  async setOnOffState(value: CharacteristicValue) {
    this.platform.log.debug('SET: Setting status from HomeKit to: %s', value);
    const command = (value === 1) ? '0*B' : '1*B';

    const response = await this.telnetCommand(command);

    this.platform.log.debug('SET: Received status of %s', response);

    let active = this.platform.Characteristic.Active.INACTIVE;

    if(response === 'Vmt0') {
      active = this.platform.Characteristic.Active.ACTIVE;
      this.platform.log.debug('SET: Unit is active');
    }

    this.avService.updateCharacteristic(this.platform.Characteristic.Active, active);
  }

  // #endregion Power Status

  //#region Input Status

  /**
   * Updates the HomeKit staet of the preset that is currently active on the Extron
   * unit itself.
   *
   * Note that when setting the current preset within HomeKit, the currentPreset value
   * is decremented to handle 0- and 1-based arrays appropriately.
   */
  async updatePresetStatus() {
    // Preset "0" is the last set preset #, so query it to get the current state.
    //const extronPreset = await this.getPreset(0);
    const currentPreset = await this.telnetCommand('W0*1*1VC' + String.fromCharCode(13));
    const currentExtronVideoPreset = parseInt(currentPreset.split(' ')[0]);

    if(currentExtronVideoPreset !== this.currentPreset) {
      this.currentPreset = currentExtronVideoPreset;
      this.avService.updateCharacteristic(this.platform.Characteristic.ActiveIdentifier, --this.currentPreset);
    }
  }

  /**
   * Handles swiching of presets on Extron unit implemented using the HomeKit InputService.
   * Will throw out errors if an out-of-bounds number is specified for an index that does
   * not exist.
   * @param value The HomeKit-specified input number to switch to.
   */
  async changeInput(value: number) {
    const newValue = value + 1;
    this.platform.log.info('set Active Identifier => setNewValue: ' + newValue);

    try {
      const response = await this.telnetCommand(newValue + '.');
      const responseIndex = newValue < 10 ? '0' + newValue : newValue.toString();

      if(response === 'Rpr' + responseIndex) {
        this.platform.log.info('Switched to preset ' + newValue + ': got response ' + response);
        this.currentPreset = newValue;
        this.avService.updateCharacteristic(this.platform.Characteristic.ActiveIdentifier, value);
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

  //#endregion Input Status

  //#region Lock Status

  /**
   * Returns the current panel lock status from the unit itself.
   * @returns The current panel lock status.
   */
  async updateLockStatus() : Promise<CharacteristicValue> {
    const response = await this.telnetCommand('X');

    if(response === '0') {
      this.lockService.updateCharacteristic(this.platform.Characteristic.LockCurrentState,
        this.platform.Characteristic.LockCurrentState.UNSECURED);

      this.lockService.updateCharacteristic(this.platform.Characteristic.LockTargetState,
        this.platform.Characteristic.LockTargetState.UNSECURED);

      return this.platform.Characteristic.LockCurrentState.UNSECURED;
    } else {
      this.lockService.updateCharacteristic(this.platform.Characteristic.LockCurrentState,
        this.platform.Characteristic.LockCurrentState.SECURED);

      this.lockService.updateCharacteristic(this.platform.Characteristic.LockTargetState,
        this.platform.Characteristic.LockTargetState.SECURED);

      return this.platform.Characteristic.LockCurrentState.SECURED;
    }
  }

  /**
   * Sets the user-requested lock status.
   * @param value The target value of what the lock should be.
   */
  async setTargetLockState(value: CharacteristicValue) {
    if(value === this.platform.Characteristic.LockTargetState.SECURED) {
      const response = await this.telnetCommand(this.lockingCode);
      if(response[3] === this.lockingCode[0]) {
        this.lockService.updateCharacteristic(this.platform.Characteristic.LockCurrentState,
          this.platform.Characteristic.LockCurrentState.SECURED);
        this.platform.log.info('Lock returned a response of %s', response);
      } else {
        this.lockService.updateCharacteristic(this.platform.Characteristic.LockCurrentState,
          this.platform.Characteristic.LockCurrentState.UNKNOWN);
        this.platform.log.debug('Locking response was %s, Expected Exe%s', response, this.lockingCode[0]);
      }
    } else {
      const response = await this.telnetCommand('0X');

      if(response === 'Exe0') {
        this.lockService.updateCharacteristic(this.platform.Characteristic.LockCurrentState,
          this.platform.Characteristic.LockCurrentState.UNSECURED);
        this.platform.log.info('Unlock returned a response of %s: ', response);
      } else {
        this.lockService.updateCharacteristic(this.platform.Characteristic.LockCurrentState,
          this.platform.Characteristic.LockCurrentState.UNKNOWN);
        this.platform.log.debug('Unlocking response was %s: Expected Exe0', response);
      }
    }
  }

  /**
   * Gets the current lock state.
   * @returns The current state of the lock service.
   */
  async getCurrentLockState() {
    return await this.updateLockStatus();
  }

  //#endregion Lock Status

  // #region Support functions/methods

  /**
   * Runs a command on the telnet server and returns a response. Note that this may
   * return an error.
   * @param command The command to execute on the telnet server.
   * @returns The results of the command.
   */
  async telnetCommand(command: string): Promise<string> {
    const response = await telnetResponse(this.platform.config.telnetSettings, command);
    return response;
  }

  // #edregion Support functions/methods
}