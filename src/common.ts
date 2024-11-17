import { Telnet as Telnet } from 'telnet-client';

/**
 * Processes lines of input from telnet response and returns what the unit has
 * actually returned.
 * @param lines The lines of input received from the unit.
 * @returns The string command parsed out by the unit.
 */
function getLineFromLines(lines: string): string {
  if(lines.length > 1) {
    return lines.split('\r\n')[3];
  } else {
    return lines;
  }
}

/**
 * Processes a command to be executed by the telnet server. If an error occurs,
 * it's thrown back to the caller.
 * @param telnetParams The parameters required to connect to the telnet server.
 * @param command The command to be procssed by the telnet server.
 * @returns The response from the telnet server.
 */
export async function telnetResponse(telnetParams: { hostname: string; port: number; }, command: string): Promise<string> {
  const connection = new Telnet();

  const params = {
    host: telnetParams.hostname,
    port: telnetParams.port ?? 23,
    negotiationMandatory: false,
  };

  let line = '';

  try {
    await connection.connect(params);
    const result = await connection.send(command);
    line = getLineFromLines(result);
  } catch (e) {
    return 'error: ' + e;
  } finally {
    connection.end();
  }

  return line;
}