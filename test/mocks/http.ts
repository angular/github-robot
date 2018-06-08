import { HttpClient, HttpOptions } from "../../functions/src/http";

export class MockHttpHost {
  private endpoints: {[url: string]: {
    hits: number;
    response: any;
  }} = {};
  registerEndpoint(url: string, response: any) {
    this.endpoints[url] = {
      response,
      hits: 0,
    };
  }

  getHits(url: string) {
    return this.endpoints[url].hits;
  }

  httpClient(): HttpClient {
    return {
      get: (url: string, options: HttpOptions): Promise<string> => {
        this.endpoints[url].hits ++;
        return new Promise((resolve, reject) => resolve(this.endpoints[url].response as string));
      }
    } as HttpClient;
  }
}
