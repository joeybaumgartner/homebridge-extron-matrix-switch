import * as Telnet from 'telnet-client';

function getLineFromLines(lines: string): string {
  if(lines.length > 1) {
    return lines.split('\r\n')[3];
  } else {
    return lines;
  }
}

export async function telnetResponse(telnetParams, command:string): Promise<string> {
  const connection = new Telnet.default();

  const params = {
    host: telnetParams.hostname,
    port: telnetParams.port,
    negotiationMandatory: false,
  };

  try {
    await connection.connect(params);
  } catch (e) {
    return 'error: ' + e;
  }

  const result = await connection.send(command);
  const line: string = getLineFromLines(result);
  connection.end();

  return line;
}