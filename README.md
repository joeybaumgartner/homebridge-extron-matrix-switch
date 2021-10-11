# Extron Matrix Switch Homebridge Plugin

This is a plugin to control your Extron Crosspoint Matrix switch via [Homebridge](https://homebridge.io). This is controlled through the use of the Telnet interface available on networked versions of these devices.

The purpose of developing this was to automate playing retro game consoles in my basement. Instead of turning on the TV, the receiver, the switch, and the scaler and then setting everything to the correct input, it's much easier to say "Hey Siri, turn on the Super Nintendo", and just start jumping on turtles.

In addition, this plugin will also allow you to lock the panel.

## Install

I recommend installing this via the Homebridge UI. If you prefer not to use this, the following command should work:

```
sudo npm install -g homebridge-extron-matrix-switch
```

Once installed as a plugin in Homebridge, you will have to manually add this unit as it is implemented as an external accessory. Add an accessory in Home.app, select **More options...**, and it should list the device; tap on it, and then enter your Homebridge code and walk through the rest of the setup process.

## Setup

This plugin can currently only control global presets. Meaning that you must setup presets either:

- on the unit itself.
- via the in-built web interface.
- via the Extron software.

Once you have presets setup, the plugin will allow you to switch between them through the Home app, and will update the current status of the input selection if it's changed outside of the Home app.

Note that the "receiver" and panel lock are implemented as single accessory. You can split these out by going into the accessory settings and tapping/clicking on **Show as Separate Tiles**.

### Configuration

#### Telnet Settings
- Currently this plugin requires the IP address of your Extron unit and the port it's running on (the default is 23).  Authentication is not supported at this time.

### Presets 

The configuration interface will allow you to enter each preset you wish to use; it simply needs to know the number for that preset, and a name you want to see displayed in the Home app user interface.

### Power 🔌

Since Extron units are always on if they are physically plugged in and supplied power, I have implemented the Power switch as a global mute for all video and audio signals. Off indicates that all audio/video signals are muted, and On indicates that they are not.

### Panel Lock 🔒 

Some Extron units have the ability to lock out the panel to prevent anybody from hitting the buttons on the front and changing your presets. This plugin implements a lock accessory to enable or disable this lock.

Extron units support two levels of locking:

- *Lock* Mode 1 - All changes are locked from the front panel (except for setting Lock Mode 2). Some functions can be viewed.

- *Lock* Mode 2 - Basic functions are unlocked. Advanced features are locked and can be viewed only.

A Lock Mechanism in HomeKit only allows two target states: secured and unsecured (read: locked and unlocked). For ease of use, I have implemented the ability to set the lock mode in the configuration of this plugin. Unlocking will always all functionality, and locking will set the Lock mode you specify.

## Resources

The following is a list of resources I used to build this plugin. I do want to mention the use of the [Homebridge Developers](https://developers.homebridge.io/) site as well.

### Documents

These CrossPoint units are considered obsolete/deprecated, but Extron still makes available a lot of information on these units. This is the [user guide](https://media.extron.com/public/download/files/userman/68-521-20_F.pdf) I followed to develop this plugin.

### Homebridge Projects

I would like to thank all of those people who have published and shared their Homebridge projects on Github over the years, and I would like to link to these ones whose code helped me out of a jam quite a few times.

[Denon Heos Homebridge Pluin](https://www.npmjs.com/package/homebridge-denon-heos)

- This is the first major Homebridge plugin I used and was both a great source of inspiration and ideas on what I needed to implement for my project.

[Yale Link Homebridge Plugin](https://www.npmjs.com/package/homebridge-yale-link)

- When stuck with numerous improper lock states, your code helped me determine what I was doing wrong, and how to properly get the correct state.

["Dummy Lock" Plugin](https://www.npmjs.com/package/homebridge-dummy-lock)

- A simple "dummy lock" that was nice to review to verify what I was getting right, and what I was getting wrong.

### Tools

This plugin was built in Visual Studio Code for Mac, and was based off the default [Dynamic Platform Plugin template](https://github.com/homebridge/homebridge-plugin-template).