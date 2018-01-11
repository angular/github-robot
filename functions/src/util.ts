import * as Context from "probot/lib/context";

/**
 * Get all results in case of paginated Github request
 */
export async function getAllResults(github: Context.github, request): Promise<any[]> {
  const pages = await github.paginate(request);
  const results = [];
  pages.forEach(page => {
    results.push(...page.data);
  });
  return results;
}

class Stream {
  write(data: any) {
    let log = console.log;
    try {
      data = JSON.parse(data);
      switch(data.level) {
        case 60: // fatal
        case 50: // error
          log = console.error;
          break;
        case 40: // warn
          log = console.warn;
          break;
        case 30: // info
        case 20: // debug
        case 10: // trace
          log = console.info;
          break;
      }
    } catch(e) {
    }
    log(typeof data === 'object' ? `${data.name}: ${data.msg}` : data);
  }
}

/**
 * Stream Probot logs to console for Firebase
 */
export const consoleStream = {
  level: "debug",
  stream: new Stream()
};
