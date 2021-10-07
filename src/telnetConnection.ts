import telnet_client, * as Telnet from 'telnet-client';

class TelnetConnection {
    private connection: telnet_client;

    params = {
      host: '192.168.0.97',
      port: 23,
      negotiationMandatory: false,
    };

    constructor(telnetParams: any) {
      this.connection = new Telnet.default();
      try {
        this.connection.connect(this.params);
      } catch(e) {
        //handle error here somehow
        throw Error('Connection failed: Error ' + e);
      }
    }

    async send(command: string): Promise<string> {
      try {
        const response = await this.connection.send(command);
        return response;
      } catch(e) {
        throw Error('Command failed: Error ' + e);
      }
    }
}